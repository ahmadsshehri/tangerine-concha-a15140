// إعدادات الخادم — تُقرأ من متغيرات البيئة أو من ملف server/.env
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')

// تحميل بسيط لملف .env (السطر بصيغة KEY=VALUE) دون أي مكتبات
const envFile = path.join(here, '.env')
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const env = process.env
const resolve = p => path.isAbsolute(p) ? p : path.resolve(root, p)

export const config = {
  root,
  host:          env.HOST || '0.0.0.0',
  port:          Number(env.PORT || 8080),
  dataDir:       resolve(env.DATA_DIR || 'data'),
  dbFile:        resolve(env.DB_FILE || path.join(env.DATA_DIR || 'data', 'rehab.db')),
  backupDir:     resolve(env.BACKUP_DIR || path.join(env.DATA_DIR || 'data', 'backups')),
  backupKeep:    Number(env.BACKUP_KEEP || 30),       // عدد النسخ الاحتياطية اليومية المحفوظة
  backupHour:    Number(env.BACKUP_HOUR ?? 2),        // ساعة أخذ النسخة الاحتياطية اليومية (0-23)
  staticDir:     resolve(env.STATIC_DIR || 'dist'),
  sessionDays:   Number(env.SESSION_DAYS || 30),
  secureCookies: env.SECURE_COOKIES === 'true',       // اجعلها true فقط إذا كان الموقع يعمل عبر HTTPS
  trustProxy:    env.TRUST_PROXY === 'true',          // true إذا كان خلف IIS / nginx
}
