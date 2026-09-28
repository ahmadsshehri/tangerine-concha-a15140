// ─── أدوات الفترات الزمنية (شهر / من-إلى / أيام / أسابيع) ─────────────────────
// كل التواريخ بصيغة YYYY-MM-DD وتُحسب بالتوقيت المحلي لتفادي انزياح اليوم

import { DAR } from './constants'

const pad = n => String(n).padStart(2, '0')

export const toISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const parseISO = s => new Date(s + 'T12:00:00')

// أول وآخر يوم في الشهر (ym = 'YYYY-MM')
export function monthBounds(ym) {
  const [y, m] = ym.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  return { from: `${ym}-01`, to: `${ym}-${pad(last)}` }
}

// كل الأيام بين تاريخين (شاملة)
export function daysBetween(from, to) {
  const out = []
  if (!from || !to || from > to) return out
  const d = parseISO(from)
  const end = parseISO(to)
  while (d <= end) {
    out.push({ iso: toISO(d), day: d.getDate(), dow: DAR[d.getDay()] })
    d.setDate(d.getDate() + 1)
  }
  return out
}

// بداية الأسبوع (الأحد) لتاريخ معيّن
export function weekStartISO(iso) {
  const d = parseISO(iso)
  d.setDate(d.getDate() - d.getDay())
  return toISO(d)
}

// أسابيع العمل (الأحد ← الخميس) التي تتقاطع مع الفترة
export function weeksBetween(from, to) {
  const out = []
  if (!from || !to || from > to) return out
  const d = parseISO(weekStartISO(from))
  while (toISO(d) <= to) {
    const s = new Date(d)
    const e = new Date(d); e.setDate(e.getDate() + 4)
    // تجاهل الأسبوع الذي تقع أيام عمله كلها خارج الفترة (مثلاً فترة تبدأ الجمعة)
    if (toISO(e) >= from) {
      out.push({
        start: toISO(s),
        end: toISO(e),
        label: `${s.getDate()}/${s.getMonth() + 1} – ${e.getDate()}/${e.getMonth() + 1}`,
      })
    }
    d.setDate(d.getDate() + 7)
  }
  return out
}

// فتح نافذة طباعة لمستند HTML كامل
export function openPrintWindow(html) {
  const w = window.open('', '_blank')
  if (!w) return false
  w.document.write(html)
  w.document.close()
  setTimeout(() => w.print(), 400)
  return true
}

export const escHtml = v => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
