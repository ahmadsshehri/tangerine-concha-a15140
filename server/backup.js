// نسخ احتياطي يومي تلقائي لقاعدة البيانات
import fs from 'node:fs'
import path from 'node:path'
import { sql } from './db.js'
import { config } from './config.js'

export function backupNow() {
  fs.mkdirSync(config.backupDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)
  const file = path.join(config.backupDir, `rehab-${stamp}.db`)
  // VACUUM INTO ينشئ نسخة متسقة حتى أثناء عمل الخادم
  sql.prepare('VACUUM INTO ?').run(file)
  prune()
  return file
}

function prune() {
  const files = fs.readdirSync(config.backupDir).filter(f => /^rehab-.*\.db$/.test(f)).sort()
  for (const f of files.slice(0, Math.max(0, files.length - config.backupKeep))) {
    fs.rmSync(path.join(config.backupDir, f), { force: true })
  }
}

export function startBackups() {
  if (config.backupKeep <= 0) return
  let lastDay = null
  const tick = () => {
    const d = new Date()
    const day = d.toDateString()
    if (d.getHours() === config.backupHour && lastDay !== day) {
      lastDay = day
      try { console.log('💾 نسخة احتياطية:', backupNow()) }
      catch (e) { console.error('فشل النسخ الاحتياطي:', e) }
    }
  }
  setInterval(tick, 10 * 60 * 1000).unref()
  tick()
}
