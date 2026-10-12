// المصادقة المحلية: كلمات مرور مشفّرة بـ scrypt + جلسات في قاعدة البيانات
import crypto from 'node:crypto'
import { sql } from './db.js'
import { config } from './config.js'

const SESSION_MS = () => config.sessionDays * 24 * 60 * 60 * 1000

const stmts = {
  byEmail:     sql.prepare('SELECT * FROM auth_users WHERE email = ?'),
  byUid:       sql.prepare('SELECT * FROM auth_users WHERE uid = ?'),
  insertUser:  sql.prepare('INSERT INTO auth_users (uid, email, password_hash, created_at) VALUES (?, ?, ?, ?)'),
  setHash:     sql.prepare('UPDATE auth_users SET password_hash = ? WHERE uid = ?'),
  setEmail:    sql.prepare('UPDATE auth_users SET email = ? WHERE uid = ?'),
  deleteUser:  sql.prepare('DELETE FROM auth_users WHERE uid = ?'),
  newSession:  sql.prepare('INSERT INTO sessions (token, uid, expires_at) VALUES (?, ?, ?)'),
  getSession:  sql.prepare('SELECT * FROM sessions WHERE token = ?'),
  touch:       sql.prepare('UPDATE sessions SET expires_at = ? WHERE token = ?'),
  delSession:  sql.prepare('DELETE FROM sessions WHERE token = ?'),
  delSessions: sql.prepare('DELETE FROM sessions WHERE uid = ?'),
  purge:       sql.prepare('DELETE FROM sessions WHERE expires_at < ?'),
}

// ─── كلمات المرور ──────────────────────────────────────────────────────────
// الصيغة المحلية: scrypt$N$r$p$salt$hash
export function hashPassword(password) {
  const salt = crypto.randomBytes(16)
  const N = 16384, r = 8, p = 1
  const hash = crypto.scryptSync(password, salt, 64, { N, r, p })
  return ['scrypt', N, r, p, salt.toString('base64'), hash.toString('base64')].join('$')
}

// حسابات Firebase المنقولة تُحفظ بصيغة: firebase-scrypt$memCost$rounds$saltSeparator$signerKey$salt$hash
// ويُعاد تشفيرها بالصيغة المحلية تلقائياً عند أول تسجيل دخول ناجح
export function verifyPassword(password, stored) {
  const parts = stored.split('$')
  if (parts[0] === 'scrypt') {
    const [, N, r, p, salt, hash] = parts
    const expected = Buffer.from(hash, 'base64')
    const actual = crypto.scryptSync(password, Buffer.from(salt, 'base64'), expected.length, { N: +N, r: +r, p: +p })
    return crypto.timingSafeEqual(actual, expected)
  }
  if (parts[0] === 'firebase-scrypt') {
    const [, memCost, rounds, saltSeparator, signerKey, salt, hash] = parts
    return verifyFirebaseScrypt(password, { memCost: +memCost, rounds: +rounds, saltSeparator, signerKey, salt, hash })
  }
  return false
}

// خوارزمية Firebase المعدّلة لـ scrypt (نفس ما تستخدمه أداة firebase auth:import)
export function verifyFirebaseScrypt(password, { memCost, rounds, saltSeparator, signerKey, salt, hash }) {
  const N = 2 ** memCost
  const fullSalt = Buffer.concat([Buffer.from(salt, 'base64'), Buffer.from(saltSeparator, 'base64')])
  const derived = crypto.scryptSync(Buffer.from(password, 'utf8'), fullSalt, 32, {
    N, r: rounds, p: 1, maxmem: 256 * N * rounds + 32 * 1024 * 1024,
  })
  const cipher = crypto.createCipheriv('aes-256-ctr', derived, Buffer.alloc(16, 0))
  const actual = Buffer.concat([cipher.update(Buffer.from(signerKey, 'base64')), cipher.final()])
  const expected = Buffer.from(hash, 'base64')
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
}

// ─── المستخدمون ────────────────────────────────────────────────────────────
export const newUid = () => crypto.randomBytes(21).toString('base64url').slice(0, 28)

export function createAuthUser(email, password, uid = newUid()) {
  email = String(email || '').trim()
  if (!/^[^\s@]+@[^\s@]+$/.test(email)) throw httpError(400, 'auth/invalid-email', 'البريد الإلكتروني غير صالح')
  if (String(password || '').length < 6) throw httpError(400, 'auth/weak-password', 'كلمة المرور يجب أن تكون 6 أحرف على الأقل')
  if (stmts.byEmail.get(email)) throw httpError(409, 'auth/email-already-in-use', 'البريد مستخدم مسبقاً')
  stmts.insertUser.run(uid, email, hashPassword(password), new Date().toISOString())
  return { uid, email }
}

export function importAuthUser(uid, email, passwordHash) {
  sql.prepare(`INSERT INTO auth_users (uid, email, password_hash, created_at) VALUES (?, ?, ?, ?)
               ON CONFLICT(uid) DO UPDATE SET email = excluded.email, password_hash = excluded.password_hash`)
    .run(uid, email, passwordHash, new Date().toISOString())
}

export function setPassword(uid, password) {
  if (String(password || '').length < 6) throw httpError(400, 'auth/weak-password', 'كلمة المرور يجب أن تكون 6 أحرف على الأقل')
  if (!stmts.byUid.get(uid)) throw httpError(404, 'auth/user-not-found', 'المستخدم غير موجود')
  stmts.setHash.run(hashPassword(password), uid)
  stmts.delSessions.run(uid)
}

export function deleteAuthUser(uid) {
  stmts.deleteUser.run(uid)
}

export const findUserByEmail = email => stmts.byEmail.get(String(email || '').trim())
export const findUserByUid = uid => stmts.byUid.get(uid)
export const publicUser = u => u && { uid: u.uid, email: u.email }

// ─── تسجيل الدخول والجلسات ─────────────────────────────────────────────────
const failures = new Map() // حماية بسيطة من تخمين كلمات المرور

export function login(email, password, ip) {
  const key = `${ip}|${String(email).toLowerCase()}`
  const f = failures.get(key)
  if (f && f.count >= 5 && Date.now() - f.last < 5 * 60 * 1000) {
    throw httpError(429, 'auth/too-many-requests', 'محاولات كثيرة، حاول بعد 5 دقائق')
  }
  const user = findUserByEmail(email)
  const ok = user && verifyPassword(String(password || ''), user.password_hash)
  if (!ok) {
    failures.set(key, { count: (f && Date.now() - f.last < 5 * 60 * 1000 ? f.count : 0) + 1, last: Date.now() })
    throw httpError(401, 'auth/invalid-credential', 'البريد الإلكتروني أو كلمة المرور غير صحيحة')
  }
  failures.delete(key)
  if (!user.password_hash.startsWith('scrypt$')) stmts.setHash.run(hashPassword(password), user.uid)
  const token = crypto.randomBytes(32).toString('base64url')
  stmts.newSession.run(token, user.uid, Date.now() + SESSION_MS())
  return { token, user: publicUser(user) }
}

export function sessionUser(token) {
  if (!token) return null
  const s = stmts.getSession.get(token)
  if (!s) return null
  if (s.expires_at < Date.now()) { stmts.delSession.run(token); return null }
  // تمديد الجلسة عند الاستخدام (مرة كل ساعة على الأكثر)
  if (s.expires_at - Date.now() < SESSION_MS() - 60 * 60 * 1000) stmts.touch.run(Date.now() + SESSION_MS(), token)
  return publicUser(stmts.byUid.get(s.uid))
}

export const logout = token => token && stmts.delSession.run(token)
export const purgeSessions = () => stmts.purge.run(Date.now())

export function httpError(status, code, message) {
  return Object.assign(new Error(message), { status, code })
}
