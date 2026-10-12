// أدوات إدارة من سطر الأوامر
//
//   node server/manage.js create-admin <email> <password> "<الاسم>"   ← إنشاء حساب مدير
//   node server/manage.js reset-password <email> <password>           ← تعيين كلمة مرور جديدة
//   node server/manage.js list-users                                   ← عرض الحسابات
//   node server/manage.js backup                                       ← نسخة احتياطية فورية
//   node server/manage.js import <firestore-export.json> [auth-users.json] [hash-config.json]
//                                                                      ← استيراد البيانات من Firebase
import fs from 'node:fs'
import * as db from './db.js'
import * as auth from './auth.js'
import { backupNow } from './backup.js'
import { config } from './config.js'

const [cmd, ...args] = process.argv.slice(2)

const die = msg => { console.error('❌ ' + msg); process.exit(1) }

switch (cmd) {
  case 'create-admin': {
    const [email, password, name = 'المدير'] = args
    if (!email || !password) die('الاستخدام: create-admin <email> <password> "<الاسم>"')
    const existing = auth.findUserByEmail(email)
    const uid = existing ? existing.uid : auth.createAuthUser(email, password).uid
    if (existing) auth.setPassword(uid, password)
    const cur = db.getDoc('users', uid)?.data || {}
    db.setDoc('users', uid, { ...cur, name: cur.name || name, email, role: 'admin', createdAt: cur.createdAt || new Date().toISOString() })
    console.log(`✅ حساب المدير جاهز: ${email}`)
    break
  }

  case 'reset-password': {
    const [email, password] = args
    const u = auth.findUserByEmail(email)
    if (!u) die('لا يوجد حساب بهذا البريد')
    auth.setPassword(u.uid, password)
    console.log(`✅ تم تغيير كلمة المرور لـ ${email}`)
    break
  }

  case 'list-users': {
    const rows = db.sql.prepare('SELECT uid, email, password_hash FROM auth_users ORDER BY email').all()
    for (const r of rows) {
      const p = db.getDoc('users', r.uid)?.data
      const kind = r.password_hash.startsWith('scrypt$') ? 'محلية' : r.password_hash.startsWith('firebase-scrypt$') ? 'منقولة من Firebase' : 'تحتاج تعيين'
      console.log(`${r.email.padEnd(35)} ${(p?.role || '—').padEnd(12)} ${(p?.name || '—').padEnd(25)} كلمة المرور: ${kind}`)
    }
    console.log(`\nالمجموع: ${rows.length}`)
    break
  }

  // تُستخدم من setup.bat
  case 'port':
    console.log(config.port)
    break

  case 'has-admin': {
    const admins = db.listDocs('users', [{ field: 'role', op: '==', value: 'admin' }])
    process.exit(admins.some(a => auth.findUserByUid(a.id)) ? 0 : 1)
  }

  case 'backup':
    console.log('✅ ' + backupNow())
    break

  case 'import':
    importFirebase(...args)
    break

  default:
    console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter(l => l.startsWith('//')).map(l => l.slice(3)).join('\n'))
}

// ─── استيراد بيانات Firebase ───────────────────────────────────────────────
// firestore-export.json: ناتج migration/export-firestore.mjs  →  { "<collection>": { "<id>": {...} } }
// auth-users.json:       ناتج الأمر  firebase auth:export auth-users.json --format=json --project src-jed1
// hash-config.json:      معاملات تشفير كلمات المرور من لوحة Firebase
//                        { "signerKey": "...", "saltSeparator": "...", "rounds": 8, "memCost": 14 }
function importFirebase(dataFile, authFile, hashFile) {
  if (!dataFile) die('حدد ملف البيانات: import <firestore-export.json> [auth-users.json] [hash-config.json]')
  const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'))

  let total = 0
  db.transaction(() => {
    for (const [col, docs] of Object.entries(data)) {
      if (col.includes('/')) { console.warn(`⚠️ تم تجاهل مجموعة فرعية: ${col}`); continue }
      const n = Object.keys(docs).length
      for (const [id, doc] of Object.entries(docs)) db.setDoc(col, id, doc)
      console.log(`  ${col.padEnd(30)} ${n}`)
      total += n
    }
  })
  console.log(`✅ تم استيراد ${total} مستند`)

  if (!authFile) return
  const { users = [] } = JSON.parse(fs.readFileSync(authFile, 'utf8'))
  const hc = hashFile ? JSON.parse(fs.readFileSync(hashFile, 'utf8')) : null
  if (hc) {
    // ملف المعاملات قد يُنسخ من لوحة Firebase بأسماء base64_signer_key… أو بأسماء مختصرة
    hc.signerKey ??= hc.base64_signer_key ?? hc.key
    hc.saltSeparator ??= hc.base64_salt_separator ?? hc.saltSep
    hc.memCost ??= hc.mem_cost
  }
  let withHash = 0, without = 0
  db.transaction(() => {
    for (const u of users) {
      if (!u.email) continue
      let hash = '!' // لا يمكن الدخول حتى يعيّن المدير كلمة مرور
      if (hc && u.passwordHash && u.salt) {
        hash = ['firebase-scrypt', hc.memCost, hc.rounds, hc.saltSeparator, hc.signerKey, u.salt, u.passwordHash].join('$')
        withHash++
      } else without++
      auth.importAuthUser(u.localId, u.email, hash)
    }
  })
  console.log(`✅ تم استيراد ${withHash + without} حساب دخول`)
  if (withHash) console.log(`   ${withHash} حساب سيعمل بنفس كلمة المرور القديمة`)
  if (without) console.log(`   ⚠️ ${without} حساب يحتاج تعيين كلمة مرور جديدة (من صفحة الإدارة أو reset-password)`)
}
