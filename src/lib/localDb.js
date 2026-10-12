// طبقة بيانات محلية بنفس أسماء دوال Firestore المستخدمة في المشروع
// (collection, doc, getDocs, getDoc, setDoc, deleteDoc, query, where, orderBy, limit, writeBatch)
// لكنها تتصل بخادم الشبكة الداخلية عبر /api بدلاً من Firebase
import { api } from './api'

export const db = { type: 'local-db' }

const enc = encodeURIComponent

// ─── المراجع ───────────────────────────────────────────────────────────────
export function collection(_db, name) {
  return { type: 'collection', collection: name }
}

export function doc(parent, ...segments) {
  if (parent?.type === 'collection') return { type: 'doc', collection: parent.collection, id: String(segments[0]) }
  const [col, id] = segments
  if (segments.length !== 2) throw new Error('المستندات تدعم مستوى واحد فقط: doc(db, collection, id)')
  return { type: 'doc', collection: col, id: String(id) }
}

export function query(ref, ...constraints) {
  const q = { type: 'query', collection: ref.collection, where: [...(ref.where || [])], orderBy: [...(ref.orderBy || [])], limit: ref.limit }
  for (const c of constraints) {
    if (c.kind === 'where') q.where.push([c.field, c.op, c.value])
    else if (c.kind === 'orderBy') q.orderBy.push([c.field, c.dir])
    else if (c.kind === 'limit') q.limit = c.n
  }
  return q
}

export const where = (field, op, value) => ({ kind: 'where', field, op, value })
export const orderBy = (field, dir = 'asc') => ({ kind: 'orderBy', field, dir })
export const limit = n => ({ kind: 'limit', n })

// ─── اللقطات (Snapshots) ───────────────────────────────────────────────────
function docSnapshot(ref, raw) {
  return {
    id: ref.id,
    ref,
    exists: () => !!raw,
    data: () => (raw ? structuredClone(raw.data) : undefined),
  }
}

function querySnapshot(colName, rows) {
  const docs = rows.map(r => docSnapshot({ type: 'doc', collection: colName, id: r.id }, r))
  return {
    docs,
    size: docs.length,
    empty: docs.length === 0,
    forEach: fn => docs.forEach(fn),
  }
}

// ─── القراءة والكتابة ──────────────────────────────────────────────────────
export async function getDocs(ref) {
  const q = ref.type === 'query' ? { where: ref.where, orderBy: ref.orderBy, limit: ref.limit } : {}
  const qs = q.where?.length || q.orderBy?.length || q.limit ? `?q=${enc(JSON.stringify(q))}` : ''
  const { docs } = await api('GET', `/api/db/${enc(ref.collection)}${qs}`)
  return querySnapshot(ref.collection, docs)
}

export async function getDoc(ref) {
  const { doc: raw } = await api('GET', `/api/db/${enc(ref.collection)}/${enc(ref.id)}`)
  return docSnapshot(ref, raw)
}

export async function setDoc(ref, data, options = {}) {
  await api('PUT', `/api/db/${enc(ref.collection)}/${enc(ref.id)}`, { data, merge: !!options.merge })
}

export async function updateDoc(ref, data) {
  await api('PUT', `/api/db/${enc(ref.collection)}/${enc(ref.id)}`, { data, merge: true })
}

export async function deleteDoc(ref) {
  await api('DELETE', `/api/db/${enc(ref.collection)}/${enc(ref.id)}`)
}

export function writeBatch() {
  const ops = []
  const batch = {
    set(ref, data, options = {}) { ops.push({ type: 'set', collection: ref.collection, id: ref.id, data, merge: !!options.merge }); return batch },
    update(ref, data) { ops.push({ type: 'set', collection: ref.collection, id: ref.id, data, merge: true }); return batch },
    delete(ref) { ops.push({ type: 'delete', collection: ref.collection, id: ref.id }); return batch },
    commit: () => api('POST', '/api/db/batch', { ops }),
  }
  return batch
}
