// تصدير جميع بيانات Firestore إلى ملف JSON واحد (يُشغَّل مرة واحدة عند النقل)
//
// 1) من لوحة Firebase: Project settings ← Service accounts ← Generate new private key
//    واحفظ الملف باسم service-account.json داخل مجلد migration (لا ترفعه إلى GitHub)
// 2) cd migration && npm install
// 3) node export-firestore.mjs
//    → ينتج firestore-export.json
import fs from 'node:fs'
import admin from 'firebase-admin'

const keyFile = process.argv[2] || './service-account.json'
const outFile = process.argv[3] || './firestore-export.json'

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(keyFile, 'utf8'))) })
const fs_ = admin.firestore()

// تحويل الأنواع الخاصة بـ Firestore إلى JSON عادي
function plain(v) {
  if (v === null || typeof v !== 'object') return v
  if (v instanceof admin.firestore.Timestamp) return v.toDate().toISOString()
  if (v instanceof admin.firestore.GeoPoint) return { latitude: v.latitude, longitude: v.longitude }
  if (v instanceof admin.firestore.DocumentReference) return v.path
  if (Buffer.isBuffer(v) || v instanceof Uint8Array) return Buffer.from(v).toString('base64')
  if (Array.isArray(v)) return v.map(plain)
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]))
}

const out = {}

async function dumpCollection(ref) {
  const snap = await ref.get()
  out[ref.path] = {}
  for (const d of snap.docs) {
    out[ref.path][d.id] = plain(d.data())
    for (const sub of await d.ref.listCollections()) await dumpCollection(sub)
  }
  console.log(`  ${ref.path.padEnd(40)} ${snap.size}`)
}

for (const col of await fs_.listCollections()) await dumpCollection(col)
fs.writeFileSync(outFile, JSON.stringify(out, null, 1))
console.log(`✅ تم الحفظ في ${outFile}`)
process.exit(0)
