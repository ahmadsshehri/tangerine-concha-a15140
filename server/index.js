// خادم نظام إدارة المراكز التأهيلية — يعمل محلياً داخل الشبكة الداخلية
// يقدّم واجهة الموقع (مجلد dist) + واجهة برمجية /api بدل Firebase
// التشغيل: node server/index.js
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { config } from './config.js'
import * as db from './db.js'
import * as auth from './auth.js'
import { startBackups, backupNow } from './backup.js'

const COOKIE = 'rehab_sid'
const COLLECTION_RE = /^[A-Za-z0-9_-]{1,100}$/
const ID_RE = /^[^/]{1,500}$/

// ─── الصلاحيات ─────────────────────────────────────────────────────────────
const profileOf = uid => db.getDoc('users', uid)?.data || null
const isAdmin = p => p?.role === 'admin'
const canManageUsers = p => isAdmin(p) || p?.permissions?.can_create_supervisors === true

// قاعدة مجموعة users: المدير يعدّل الجميع، ومن يملك can_create_supervisors يعدّل المشرفين فقط
function assertCanWrite(me, col, id, data) {
  if (col !== 'users') return
  if (isAdmin(me)) return
  if (canManageUsers(me)) {
    const target = db.getDoc(col, id)?.data
    if (target?.role !== 'admin' && data?.role !== 'admin') return
  }
  throw auth.httpError(403, 'permission-denied', 'لا تملك صلاحية تعديل المستخدمين')
}

// ─── أدوات HTTP ────────────────────────────────────────────────────────────
function send(res, status, body, headers = {}) {
  const json = JSON.stringify(body)
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers })
  res.end(json)
}

async function readJson(req) {
  const chunks = []
  let size = 0
  for await (const c of req) {
    size += c.length
    if (size > 20 * 1024 * 1024) throw auth.httpError(413, 'too-large', 'حجم الطلب كبير جداً')
    chunks.push(c)
  }
  if (!chunks.length) return {}
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) }
  catch { throw auth.httpError(400, 'bad-json', 'صيغة البيانات غير صحيحة') }
}

const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(s => s.trim().split('=')).filter(p => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]))

function sessionCookie(token, maxAgeSec) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${config.secureCookies ? '; Secure' : ''}`
}

const clientIp = req => (config.trustProxy && req.headers['x-forwarded-for']?.split(',')[0].trim()) || req.socket.remoteAddress

function checkCol(col) {
  if (!COLLECTION_RE.test(col)) throw auth.httpError(400, 'invalid-argument', 'اسم مجموعة غير صالح')
}
function checkId(id) {
  if (!ID_RE.test(id)) throw auth.httpError(400, 'invalid-argument', 'معرّف مستند غير صالح')
}

// ─── واجهة API ─────────────────────────────────────────────────────────────
async function handleApi(req, res, url) {
  const parts = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean).map(decodeURIComponent)
  const method = req.method
  const token = cookies(req)[COOKIE]

  // POST /api/auth/login
  if (parts[0] === 'auth' && parts[1] === 'login' && method === 'POST') {
    const { email, password } = await readJson(req)
    const { token: t, user } = auth.login(email, password, clientIp(req))
    return send(res, 200, { user }, { 'Set-Cookie': sessionCookie(t, config.sessionDays * 86400) })
  }
  if (parts[0] === 'auth' && parts[1] === 'logout' && method === 'POST') {
    auth.logout(token)
    return send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0) })
  }

  // كل ما بعد هذا يحتاج تسجيل دخول
  const user = auth.sessionUser(token)
  if (parts[0] === 'auth' && parts[1] === 'me' && method === 'GET') return send(res, 200, { user })
  if (!user) throw auth.httpError(401, 'unauthenticated', 'انتهت الجلسة، يرجى تسجيل الدخول')
  const me = profileOf(user.uid)

  if (parts[0] === 'auth') {
    // POST /api/auth/users — إنشاء حساب دخول جديد
    if (parts[1] === 'users' && parts.length === 2 && method === 'POST') {
      if (!canManageUsers(me)) throw auth.httpError(403, 'permission-denied', 'لا تملك صلاحية إنشاء المستخدمين')
      const { email, password } = await readJson(req)
      return send(res, 200, { user: auth.createAuthUser(email, password) })
    }
    // POST /api/auth/users/:uid/password — المدير يعيّن كلمة مرور لمستخدم
    if (parts[1] === 'users' && parts[3] === 'password' && method === 'POST') {
      const target = profileOf(parts[2])
      if (!(isAdmin(me) || (canManageUsers(me) && target?.role !== 'admin'))) {
        throw auth.httpError(403, 'permission-denied', 'لا تملك صلاحية تغيير كلمات المرور')
      }
      const { password } = await readJson(req)
      auth.setPassword(parts[2], password)
      return send(res, 200, { ok: true })
    }
    // POST /api/auth/password — المستخدم يغيّر كلمة مروره
    if (parts[1] === 'password' && method === 'POST') {
      const { currentPassword, newPassword } = await readJson(req)
      const row = auth.findUserByUid(user.uid)
      if (!auth.verifyPassword(String(currentPassword || ''), row.password_hash)) {
        throw auth.httpError(401, 'auth/wrong-password', 'كلمة المرور الحالية غير صحيحة')
      }
      auth.setPassword(user.uid, newPassword)
      const { token: t } = auth.login(row.email, newPassword, clientIp(req))
      return send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(t, config.sessionDays * 86400) })
    }
  }

  if (parts[0] === 'db') {
    // POST /api/db/batch — مجموعة عمليات دفعة واحدة (writeBatch)
    if (parts[1] === 'batch' && parts.length === 2 && method === 'POST') {
      const { ops = [] } = await readJson(req)
      for (const op of ops) { checkCol(op.collection); checkId(op.id); if (op.type === 'set') assertCanWrite(me, op.collection, op.id, op.data) }
      db.transaction(() => {
        for (const op of ops) {
          if (op.type === 'set') db.setDoc(op.collection, op.id, op.data || {}, !!op.merge)
          else if (op.type === 'delete') { assertCanWrite(me, op.collection, op.id); onDelete(op.collection, op.id); db.deleteDoc(op.collection, op.id) }
          else throw auth.httpError(400, 'invalid-argument', 'عملية غير معروفة')
        }
      })
      return send(res, 200, { ok: true })
    }

    const [, col, id] = parts
    checkCol(col)

    // GET /api/db/:col?q=<JSON>  —  q = { where: [[field, op, value]], orderBy: [[field, dir]] }
    if (parts.length === 2 && method === 'GET') {
      const q = url.searchParams.get('q') ? JSON.parse(url.searchParams.get('q')) : {}
      const filters = (q.where || []).map(([field, op, value]) => ({ field, op, value }))
      const orders = (q.orderBy || []).map(([field, dir]) => ({ field, dir }))
      let docs = db.listDocs(col, filters, orders)
      if (q.limit) docs = docs.slice(0, q.limit)
      return send(res, 200, { docs })
    }

    if (parts.length === 3) {
      checkId(id)
      if (method === 'GET') return send(res, 200, { doc: db.getDoc(col, id) })
      if (method === 'PUT') {
        const { data, merge } = await readJson(req)
        assertCanWrite(me, col, id, data)
        db.setDoc(col, id, data || {}, !!merge)
        return send(res, 200, { ok: true })
      }
      if (method === 'DELETE') {
        assertCanWrite(me, col, id)
        onDelete(col, id)
        db.deleteDoc(col, id)
        return send(res, 200, { ok: true })
      }
    }
  }

  // POST /api/admin/backup — نسخة احتياطية فورية (للمدير)
  if (parts[0] === 'admin' && parts[1] === 'backup' && method === 'POST') {
    if (!isAdmin(me)) throw auth.httpError(403, 'permission-denied', 'للمدير فقط')
    return send(res, 200, { file: path.basename(backupNow()) })
  }

  throw auth.httpError(404, 'not-found', 'المسار غير موجود')
}

// حذف مستند مستخدم يحذف حساب الدخول أيضاً (في Firebase كان يبقى حساب الدخول معلقاً)
function onDelete(col, id) {
  if (col === 'users') auth.deleteAuthUser(id)
}

// ─── الملفات الثابتة (واجهة الموقع) ────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8', '.map': 'application/json',
}

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname)
  let file = path.join(config.staticDir, path.normalize(rel).replace(/^([/\\])+/, ''))
  if (!file.startsWith(config.staticDir)) { res.writeHead(403); return res.end() }
  let isFile = false
  try { isFile = fs.statSync(file).isFile() } catch {}
  // تطبيق صفحة واحدة: أي مسار غير موجود يعيد index.html
  if (!isFile) file = path.join(config.staticDir, 'index.html')
  if (!fs.existsSync(file)) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
    return res.end('لم يتم بناء الواجهة بعد. شغّل: npm run build')
  }
  const ext = path.extname(file)
  const immutable = file.includes(`${path.sep}assets${path.sep}`)
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  })
  if (req.method === 'HEAD') return res.end()
  fs.createReadStream(file).pipe(res)
}

// ─── تشغيل الخادم ──────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  try {
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return await handleApi(req, res, url)
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end() }
    serveStatic(req, res, url)
  } catch (e) {
    const status = e.status || 500
    if (status >= 500) console.error(new Date().toISOString(), req.method, url.pathname, e)
    send(res, status, { error: { code: e.code || 'internal', message: status >= 500 ? 'خطأ داخلي في الخادم' : e.message } })
  }
})

server.listen(config.port, config.host, () => {
  console.log(`✅ نظام إدارة المراكز التأهيلية يعمل على المنفذ ${config.port}`)
  console.log(`   قاعدة البيانات: ${config.dbFile}`)
  const addrs = Object.values(os.networkInterfaces()).flat().filter(a => a && a.family === 'IPv4' && !a.internal)
  for (const a of addrs) console.log(`   افتح من أي جهاز في الشبكة: http://${a.address}:${config.port}`)
})

startBackups()
setInterval(auth.purgeSessions, 60 * 60 * 1000).unref()
