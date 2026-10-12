// قاعدة البيانات المحلية (SQLite مدمجة في Node.js — لا تحتاج أي تثبيت إضافي)
// كل مجموعة من مجموعات Firestore السابقة تُخزَّن كصفوف (collection, id, data JSON)
import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import { config } from './config.js'

fs.mkdirSync(path.dirname(config.dbFile), { recursive: true })

export const sql = new DatabaseSync(config.dbFile)

sql.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;

  CREATE TABLE IF NOT EXISTS docs (
    collection TEXT NOT NULL,
    id         TEXT NOT NULL,
    data       TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (collection, id)
  );

  CREATE TABLE IF NOT EXISTS auth_users (
    uid           TEXT PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    uid        TEXT NOT NULL REFERENCES auth_users(uid) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessions_uid ON sessions(uid);
`)

const now = () => new Date().toISOString()

const stmts = {
  get:     sql.prepare('SELECT id, data FROM docs WHERE collection = ? AND id = ?'),
  list:    sql.prepare('SELECT id, data FROM docs WHERE collection = ? ORDER BY id'),
  listEq:  sql.prepare('SELECT id, data FROM docs WHERE collection = ? AND json_extract(data, ?) = ? ORDER BY id'),
  put:     sql.prepare(`INSERT INTO docs (collection, id, data, updated_at) VALUES (?, ?, ?, ?)
                        ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`),
  del:     sql.prepare('DELETE FROM docs WHERE collection = ? AND id = ?'),
}

const row = r => r && { id: r.id, data: JSON.parse(r.data) }

export function getDoc(col, id) {
  return row(stmts.get.get(col, id)) || null
}

// filters: [{ field, op, value }] — نفس معاملات where في Firestore
export function listDocs(col, filters = [], orders = []) {
  let rows
  const eq = filters.find(f => f.op === '==' && ['string', 'number', 'boolean'].includes(typeof f.value))
  if (eq) {
    const v = typeof eq.value === 'boolean' ? (eq.value ? 1 : 0) : eq.value
    rows = stmts.listEq.all(col, jsonPath(eq.field), v).map(row)
  } else {
    rows = stmts.list.all(col).map(row)
  }
  for (const f of filters) {
    if (f === eq) continue
    rows = rows.filter(r => matches(getField(r.data, f.field), f.op, f.value))
  }
  for (const o of [...orders].reverse()) {
    // مثل Firestore: المستندات التي لا تحتوي الحقل تُستبعد من orderBy
    rows = rows.filter(r => getField(r.data, o.field) !== undefined)
    rows.sort((a, b) => compare(getField(a.data, o.field), getField(b.data, o.field)) * (o.dir === 'desc' ? -1 : 1))
  }
  return rows
}

export function setDoc(col, id, data, merge = false) {
  let next = data
  if (merge) {
    const cur = getDoc(col, id)
    if (cur) next = deepMerge(cur.data, data)
  }
  stmts.put.run(col, id, JSON.stringify(next), now())
  return next
}

export function deleteDoc(col, id) {
  stmts.del.run(col, id)
}

export function transaction(fn) {
  sql.exec('BEGIN')
  try {
    const out = fn()
    sql.exec('COMMIT')
    return out
  } catch (e) {
    sql.exec('ROLLBACK')
    throw e
  }
}

// ─── أدوات مساعدة ──────────────────────────────────────────────────────────
function jsonPath(field) {
  return '$' + field.split('.').map(p => `."${p.replace(/"/g, '""')}"`).join('')
}

function getField(obj, field) {
  return field.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj)
}

const isPlainObject = v => v && typeof v === 'object' && !Array.isArray(v)

// merge:true في Firestore يدمج الكائنات المتداخلة ويستبدل المصفوفات
function deepMerge(target, src) {
  const out = { ...target }
  for (const [k, v] of Object.entries(src)) {
    out[k] = isPlainObject(v) && isPlainObject(out[k]) ? deepMerge(out[k], v) : v
  }
  return out
}

const typeRank = v => v === null ? 0 : typeof v === 'boolean' ? 1 : typeof v === 'number' ? 2 : typeof v === 'string' ? 3 : Array.isArray(v) ? 4 : 5

function compare(a, b) {
  const ta = typeRank(a), tb = typeRank(b)
  if (ta !== tb) return ta - tb
  if (typeof a === 'string') return a < b ? -1 : a > b ? 1 : 0
  if (typeof a === 'number' || typeof a === 'boolean') return Number(a) - Number(b)
  return 0
}

function matches(v, op, value) {
  switch (op) {
    case '==':  return JSON.stringify(v) === JSON.stringify(value)
    case '!=':  return v !== undefined && JSON.stringify(v) !== JSON.stringify(value)
    case '<':   return v !== undefined && typeRank(v) === typeRank(value) && compare(v, value) < 0
    case '<=':  return v !== undefined && typeRank(v) === typeRank(value) && compare(v, value) <= 0
    case '>':   return v !== undefined && typeRank(v) === typeRank(value) && compare(v, value) > 0
    case '>=':  return v !== undefined && typeRank(v) === typeRank(value) && compare(v, value) >= 0
    case 'in':  return Array.isArray(value) && value.some(x => JSON.stringify(x) === JSON.stringify(v))
    case 'not-in': return v !== undefined && Array.isArray(value) && !value.some(x => JSON.stringify(x) === JSON.stringify(v))
    case 'array-contains': return Array.isArray(v) && v.some(x => JSON.stringify(x) === JSON.stringify(value))
    case 'array-contains-any': return Array.isArray(v) && Array.isArray(value) && v.some(x => value.some(y => JSON.stringify(x) === JSON.stringify(y)))
    default: throw Object.assign(new Error(`عامل غير مدعوم: ${op}`), { status: 400 })
  }
}
