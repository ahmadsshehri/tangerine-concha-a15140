// src/modules/reports/MonthlyReport.jsx
// التقرير الشهري الشامل — Drill-down + تقرير المشرفين + Excel

import { useState, useCallback } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useToast } from '../../components/Toast'
import { MASANDAT, AXES } from '../../lib/constants'

// ─── ثوابت ───────────────────────────────────────────────────────────────────
const MONTHS = [
  'يناير','فبراير','مارس','أبريل','مايو','يونيو',
  'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'
]

const SCORE_COLOR = (pct) => {
  if (pct >= 83) return { text: '#057a55', bg: '#e3f9ee', border: '#057a55', label: 'ممتاز' }
  if (pct >= 58) return { text: '#b45309', bg: '#fef3c7', border: '#b45309', label: 'متوسط' }
  return { text: '#c81e1e', bg: '#fde8e8', border: '#c81e1e', label: 'يحتاج متابعة' }
}

// ─── تصدير Excel ─────────────────────────────────────────────────────────────
function buildExcel(sheets) {
  const esc = v => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  const wsXml = sheets.map(s => {
    const hRow = s.headers.map(h => `<Cell ss:StyleID="h"><Data ss:Type="String">${esc(h)}</Data></Cell>`).join('')
    const dRows = s.rows.map(row =>
      '<Row>' + row.map(c => `<Cell><Data ss:Type="String">${esc(c)}</Data></Cell>`).join('') + '</Row>'
    ).join('')
    const name = s.name.substring(0, 31)
    return `<Worksheet ss:Name="${esc(name)}"><Table><Row>${hRow}</Row>${dRows}</Table></Worksheet>`
  }).join('')

  return `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles><Style ss:ID="h"><Font ss:Bold="1"/><Interior ss:Color="#D9E1F2" ss:Pattern="Solid"/></Style></Styles>
${wsXml}</Workbook>`
}

function downloadExcel(xml, filename) {
  const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename + '.xls'
  a.click()
}

// ─── حساب إحصاءات البيانات ───────────────────────────────────────────────────
function calcStats(records) {
  if (!records.length) return null
  const scores = records.map(r => r.totalScore)
  const avg = scores.reduce((a,b)=>a+b,0) / scores.length
  const byAxis = AXES.map((ax, ai) => {
    const axScores = records.map(r => r.axes?.[ai]?.total || 0)
    const axAvg = axScores.reduce((a,b)=>a+b,0) / axScores.length
    const byItem = ax.items.map((item, ii) => {
      const itemScores = records.map(r => r.axes?.[ai]?.scores?.[ii] || 0)
      const itemAvg = itemScores.reduce((a,b)=>a+b,0) / itemScores.length
      return { item, avg: itemAvg, scores: itemScores }
    })
    return { ...ax, avg: axAvg, byItem }
  })
  return { avg, byAxis, count: records.length, scores }
}

// ─── مكوّن بار الدرجة ────────────────────────────────────────────────────────
function ScoreBar({ score, max, label, small }) {
  const pct = Math.min(100, (score / max) * 100)
  const c = SCORE_COLOR(pct)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: small ? 6 : 10 }}>
      <div style={{ flex: 1, height: small ? 8 : 12, background: '#e2e6ed', borderRadius: 6, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: c.text, borderRadius: 6, transition: 'width .4s' }} />
      </div>
      <div style={{ minWidth: small ? 50 : 70, fontSize: small ? 11 : 12, fontWeight: 800, color: c.text }}>
        {score.toFixed(1)}{max ? `/${max}` : ''} {label && <span style={{ fontWeight: 400, color: '#9aa3b0', fontSize: 10 }}>{label}</span>}
      </div>
    </div>
  )
}

// ─── بطاقة المساندة (المستوى 1) ──────────────────────────────────────────────
function MasandaCard({ masanda, stats, onClick }) {
  if (!stats) {
    return (
      <div style={{
        border: '1.5px dashed #e2e6ed', borderRadius: 12, padding: '16px',
        textAlign: 'center', color: '#9aa3b0', fontSize: 12
      }}>
        <div style={{ fontSize: 20, marginBottom: 4 }}>📭</div>
        <div style={{ fontWeight: 700 }}>{masanda.name}</div>
        <div style={{ fontSize: 11, marginTop: 4 }}>لا توجد بيانات</div>
      </div>
    )
  }
  const pct = (stats.avg / 60) * 100
  const c = SCORE_COLOR(pct)
  return (
    <div onClick={onClick} style={{
      border: `2px solid ${c.border}`, borderRadius: 12, padding: '16px',
      cursor: 'pointer', background: c.bg, transition: 'all .2s',
      position: 'relative', overflow: 'hidden'
    }}
      onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-3px)'}
      onMouseLeave={e => e.currentTarget.style.transform = ''}
    >
      <div style={{ position: 'absolute', top: 0, right: 0, width: 4, height: '100%', background: c.text, borderRadius: '0 10px 10px 0' }} />
      <div style={{ fontWeight: 800, fontSize: 14, color: c.text, marginBottom: 8 }}>{masanda.name}</div>
      <div style={{ fontSize: 26, fontWeight: 900, color: c.text, lineHeight: 1, marginBottom: 6 }}>
        {stats.avg.toFixed(1)}<span style={{ fontSize: 14, fontWeight: 600, opacity: .7 }}>/60</span>
      </div>
      <ScoreBar score={stats.avg} max={60} small />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 11, color: '#6b7a96' }}>
        <span>📋 {stats.count} تقييم</span>
        <span style={{ fontWeight: 700, color: c.text }}>{c.label}</span>
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: c.text, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
        اضغط للتفاصيل ←
      </div>
    </div>
  )
}

// ─── عرض المستوى 2: الأجنحة ──────────────────────────────────────────────────
function WingsLevel({ masanda, records, onWingClick, onBack }) {
  const wings = masanda.wings
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <button onClick={onBack} style={{ padding: '6px 14px', borderRadius: 8, border: '1.5px solid #e2e6ed', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
          ← رجوع
        </button>
        <div style={{ fontWeight: 800, fontSize: 16 }}>{masanda.name} — الأجنحة</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 10 }}>
        {wings.map(w => {
          const wingRecs = records.filter(r => String(r.wing) === String(w) && r.masandaId === masanda.id)
          const stats = calcStats(wingRecs)
          const label = isNaN(w) ? w : `جناح ${w}`
          if (!stats) return (
            <div key={w} style={{ border: '1.5px dashed #e2e6ed', borderRadius: 10, padding: '12px', textAlign: 'center', color: '#9aa3b0', fontSize: 12 }}>
              <div style={{ fontWeight: 700 }}>{label}</div>
              <div style={{ fontSize: 11 }}>لا بيانات</div>
            </div>
          )
          const pct = (stats.avg / 60) * 100
          const c = SCORE_COLOR(pct)
          return (
            <div key={w} onClick={() => onWingClick(w, wingRecs)} style={{
              border: `2px solid ${c.border}`, borderRadius: 10, padding: '14px',
              cursor: 'pointer', background: c.bg, transition: 'all .18s'
            }}
              onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
              onMouseLeave={e => e.currentTarget.style.transform = ''}
            >
              <div style={{ fontWeight: 800, fontSize: 13, color: c.text, marginBottom: 6 }}>{label}</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: c.text }}>{stats.avg.toFixed(1)}<span style={{ fontSize: 12, opacity: .7 }}>/60</span></div>
              <ScoreBar score={stats.avg} max={60} small />
              <div style={{ fontSize: 10, color: '#6b7a96', marginTop: 6 }}>{stats.count} تقييم — {c.label}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── عرض المستوى 3: المحاور ──────────────────────────────────────────────────
function AxesLevel({ masanda, wing, records, onAxisClick, onBack }) {
  const stats = calcStats(records)
  const label = isNaN(wing) ? wing : `جناح ${wing}`
  if (!stats) return <div className="empty-state"><div className="es-icon">📭</div><div className="es-title">لا بيانات</div></div>

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <button onClick={onBack} style={{ padding: '6px 14px', borderRadius: 8, border: '1.5px solid #e2e6ed', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
          ← رجوع
        </button>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16 }}>{masanda.name} — {label}</div>
          <div style={{ fontSize: 12, color: '#6b7a96' }}>متوسط: {stats.avg.toFixed(1)}/60 | {stats.count} تقييم</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 12 }}>
        {stats.byAxis.map((ax, ai) => {
          const pct = (ax.avg / 15) * 100
          const c = SCORE_COLOR(pct)
          return (
            <div key={ai} onClick={() => onAxisClick(ax, ai)} style={{
              border: `2px solid ${c.border}`, borderRadius: 12, padding: '16px',
              cursor: 'pointer', background: c.bg, transition: 'all .18s',
              borderRight: `4px solid ${c.text}`
            }}
              onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
              onMouseLeave={e => e.currentTarget.style.transform = ''}
            >
              <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8 }}>{ax.label}</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: c.text, marginBottom: 8 }}>
                {ax.avg.toFixed(1)}<span style={{ fontSize: 12, opacity: .7 }}>/15</span>
              </div>
              <ScoreBar score={ax.avg} max={15} small />
              <div style={{ fontSize: 10, color: '#6b7a96', marginTop: 6 }}>اضغط لرؤية البنود ←</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── عرض المستوى 4: البنود ───────────────────────────────────────────────────
function ItemsLevel({ masanda, wing, axis, axisData, onBack }) {
  const label = isNaN(wing) ? wing : `جناح ${wing}`
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <button onClick={onBack} style={{ padding: '6px 14px', borderRadius: 8, border: '1.5px solid #e2e6ed', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
          ← رجوع
        </button>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16 }}>{masanda.name} — {label} — {axis.label}</div>
          <div style={{ fontSize: 12, color: '#6b7a96' }}>متوسط المحور: {axisData.avg.toFixed(1)}/15</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {axisData.byItem.map((item, ii) => {
          const pct = (item.avg / 5) * 100
          const c = SCORE_COLOR(pct)
          const dist = [1,2,3,4,5].map(n => item.scores.filter(s => s === n).length)
          const total = item.scores.length || 1
          return (
            <div key={ii} style={{ background: '#fff', border: `1.5px solid ${c.border}`, borderRadius: 12, padding: '16px', borderRight: `4px solid ${c.text}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>{item.item}</div>
                <span style={{ display: 'inline-block', padding: '3px 12px', borderRadius: 20, fontSize: 13, fontWeight: 900, background: c.bg, color: c.text, border: `1px solid ${c.border}`, flexShrink: 0, marginRight: 8 }}>
                  {item.avg.toFixed(2)}/5
                </span>
              </div>
              <ScoreBar score={item.avg} max={5} />
              {/* توزيع الدرجات */}
              <div style={{ marginTop: 12, display: 'flex', gap: 6, alignItems: 'flex-end', height: 60 }}>
                {[1,2,3,4,5].map((n, ni) => {
                  const barH = total ? (dist[ni] / total) * 50 : 0
                  const bc = SCORE_COLOR((n/5)*100)
                  return (
                    <div key={n} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                      <div style={{ fontSize: 10, color: '#6b7a96' }}>{dist[ni]}</div>
                      <div style={{ width: '100%', height: Math.max(3, barH), background: bc.text, borderRadius: '3px 3px 0 0', minHeight: dist[ni] > 0 ? 6 : 2 }} />
                      <div style={{ fontSize: 11, fontWeight: 700, color: bc.text }}>{n}</div>
                    </div>
                  )
                })}
              </div>
              <div style={{ fontSize: 10, color: '#9aa3b0', marginTop: 4, textAlign: 'center' }}>توزيع الدرجات ({total} تقييم)</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── تقرير المشرفين ──────────────────────────────────────────────────────────
function SupervisorsTab({ records }) {
  if (!records.length) return (
    <div className="empty-state"><div className="es-icon">📭</div><div className="es-title">لا توجد بيانات</div></div>
  )

  const bySuper = {}
  records.forEach(r => {
    const sup = r.savedBy || 'غير محدد'
    if (!bySuper[sup]) bySuper[sup] = { name: sup, records: [], centers: new Set(), wings: new Set(), dates: new Set() }
    bySuper[sup].records.push(r)
    bySuper[sup].centers.add(r.masandaId)
    bySuper[sup].wings.add(`${r.masandaId}_${r.wing}`)
    bySuper[sup].dates.add(r.date)
  })

  const supervisors = Object.values(bySuper).map(s => {
    const scores = s.records.map(r => r.totalScore)
    const avg = scores.reduce((a,b)=>a+b,0) / scores.length
    const max = Math.max(...scores)
    const min = Math.min(...scores)
    return {
      ...s,
      avg, max, min,
      centersCount: s.centers.size,
      wingsCount: s.wings.size,
      datesCount: s.dates.size,
      roundsCount: s.records.length
    }
  }).sort((a,b) => b.roundsCount - a.roundsCount)

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'إجمالي المشرفين', value: supervisors.length, icon: '👤', color: 'var(--accent)' },
          { label: 'إجمالي الجولات',  value: records.length,     icon: '🔄', color: 'var(--blue)' },
          { label: 'أجنحة فريدة',     value: new Set(records.map(r=>`${r.masandaId}_${r.wing}`)).size, icon: '🏠', color: 'var(--green)' },
        ].map((s,i) => (
          <div key={i} className="stat-card" style={{ '--card-accent': s.color }}>
            <div className="stat-icon">{s.icon}</div>
            <div className="stat-value">{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {supervisors.map((s, i) => {
          const pct = (s.avg / 60) * 100
          const c = SCORE_COLOR(pct)
          return (
            <div key={i} style={{ background: '#fff', border: '1.5px solid #e2e6ed', borderRadius: 12, padding: '16px', borderRight: `4px solid ${c.text}` }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16 }}>
                    {s.name.charAt(0)}
                  </div>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 15 }}>{s.name}</div>
                    <div style={{ fontSize: 11, color: '#6b7a96' }}>متوسط تقييماته: <span style={{ fontWeight: 700, color: c.text }}>{s.avg.toFixed(1)}/60</span></div>
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 12 }}>
                {[
                  { label: 'عدد الجولات',   value: s.roundsCount, icon: '🔄', color: 'var(--accent)' },
                  { label: 'مراكز زارها',   value: s.centersCount, icon: '🏢', color: 'var(--blue)' },
                  { label: 'أجنحة قيّمها',  value: s.wingsCount,  icon: '🏠', color: 'var(--green)' },
                  { label: 'أيام عمل',      value: s.datesCount,  icon: '📅', color: 'var(--orange)' },
                ].map((stat, si) => (
                  <div key={si} style={{ background: '#f8f9fc', borderRadius: 8, padding: '10px', textAlign: 'center' }}>
                    <div style={{ fontSize: 18 }}>{stat.icon}</div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: stat.color }}>{stat.value}</div>
                    <div style={{ fontSize: 10, color: '#6b7a96', marginTop: 2 }}>{stat.label}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: '#6b7a96', marginBottom: 4 }}>متوسط الدرجات</div>
                  <ScoreBar score={s.avg} max={60} />
                </div>
                <div style={{ display: 'flex', gap: 6, fontSize: 11 }}>
                  <span style={{ padding: '3px 8px', background: '#e3f9ee', color: '#057a55', borderRadius: 6, fontWeight: 700 }}>أعلى: {s.max}</span>
                  <span style={{ padding: '3px 8px', background: '#fde8e8', color: '#c81e1e', borderRadius: 6, fontWeight: 700 }}>أدنى: {s.min}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── المكوّن الرئيسي ──────────────────────────────────────────────────────────
export default function MonthlyReport() {
  const toast = useToast()
  const now = new Date()
  const [year,    setYear]    = useState(now.getFullYear())
  const [month,   setMonth]   = useState(now.getMonth())
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(false)
  const [loaded,  setLoaded]  = useState(false)
  const [tab,     setTab]     = useState('centers') // centers | supervisors

  // ── Drill-down state
  const [level,      setLevel]     = useState(0) // 0=مساندات 1=أجنحة 2=محاور 3=بنود
  const [selMasanda, setSelMasanda] = useState(null)
  const [selWing,    setSelWing]    = useState(null)
  const [selAxis,    setSelAxis]    = useState(null)
  const [selAxisData,setSelAxisData] = useState(null)
  const [wingRecords,setWingRecords] = useState([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const snap = await getDocs(collection(db, 'wings'))
      const prefix = `${year}-${String(month + 1).padStart(2, '0')}`
      const recs = snap.docs.map(d => d.data()).filter(r => r.date?.startsWith(prefix))
      setRecords(recs)
      setLoaded(true)
      setLevel(0)
      setSelMasanda(null)
      setSelWing(null)
    } catch (e) { toast('❌ ' + e.message, 'error') }
    setLoading(false)
  }, [year, month, toast])

  // ── إحصاءات المساندات
  const masandaStats = MASANDAT.map(m => {
    const recs = records.filter(r => r.masandaId === m.id)
    return { masanda: m, stats: calcStats(recs), recs }
  })

  // ── تصدير Excel
  const doExport = () => {
    if (!records.length) { toast('⚠️ لا توجد بيانات', 'warn'); return }
    const sheets = []

    // ورقة 1: ملخص المساندات
    sheets.push({
      name: 'ملخص المساندات',
      headers: ['المساندة', 'عدد التقييمات', 'متوسط الدرجة/60', 'الالتزام/15', 'السلوك/15', 'التفاعل/15', 'السكن/15', 'التقييم'],
      rows: masandaStats.filter(x => x.stats).map(x => [
        x.masanda.name, x.stats.count, x.stats.avg.toFixed(1),
        ...x.stats.byAxis.map(a => a.avg.toFixed(1)),
        SCORE_COLOR((x.stats.avg/60)*100).label
      ])
    })

    // ورقة 2: تفاصيل الأجنحة
    const wingRows = []
    MASANDAT.forEach(m => {
      m.wings.forEach(w => {
        const recs = records.filter(r => r.masandaId === m.id && String(r.wing) === String(w))
        if (!recs.length) return
        const stats = calcStats(recs)
        wingRows.push([
          m.name, isNaN(w)?w:`جناح ${w}`, stats.count, stats.avg.toFixed(1),
          ...stats.byAxis.map(a => a.avg.toFixed(1)),
          SCORE_COLOR((stats.avg/60)*100).label
        ])
      })
    })
    sheets.push({
      name: 'تفاصيل الأجنحة',
      headers: ['المساندة', 'الجناح', 'عدد التقييمات', 'المتوسط/60', 'الالتزام/15', 'السلوك/15', 'التفاعل/15', 'السكن/15', 'التقييم'],
      rows: wingRows
    })

    // ورقة 3: تفاصيل البنود
    const itemRows = []
    MASANDAT.forEach(m => {
      m.wings.forEach(w => {
        const recs = records.filter(r => r.masandaId === m.id && String(r.wing) === String(w))
        if (!recs.length) return
        const stats = calcStats(recs)
        stats.byAxis.forEach(ax => {
          ax.byItem.forEach(item => {
            itemRows.push([
              m.name, isNaN(w)?w:`جناح ${w}`, ax.label, item.item,
              item.avg.toFixed(2), SCORE_COLOR((item.avg/5)*100).label
            ])
          })
        })
      })
    })
    sheets.push({
      name: 'البنود التفصيلية',
      headers: ['المساندة', 'الجناح', 'المحور', 'البند', 'متوسط الدرجة/5', 'التقييم'],
      rows: itemRows
    })

    // ورقة 4: أداء المشرفين
    const bySuper = {}
    records.forEach(r => {
      const sup = r.savedBy || 'غير محدد'
      if (!bySuper[sup]) bySuper[sup] = { records: [], centers: new Set(), wings: new Set(), dates: new Set() }
      bySuper[sup].records.push(r)
      bySuper[sup].centers.add(r.masandaId)
      bySuper[sup].wings.add(`${r.masandaId}_${r.wing}`)
      bySuper[sup].dates.add(r.date)
    })
    const supRows = Object.entries(bySuper).map(([name, s]) => {
      const scores = s.records.map(r => r.totalScore)
      const avg = scores.reduce((a,b)=>a+b,0)/scores.length
      return [name, s.records.length, s.centers.size, s.wings.size, s.dates.size, avg.toFixed(1), Math.max(...scores), Math.min(...scores)]
    })
    sheets.push({
      name: 'أداء المشرفين',
      headers: ['المشرف', 'عدد الجولات', 'المراكز', 'الأجنحة', 'أيام العمل', 'متوسط الدرجة', 'أعلى درجة', 'أدنى درجة'],
      rows: supRows
    })

    // ورقة 5: الملاحظات المرصودة
    const obsRows = []
    records.forEach(r => {
      if (r.obs?.amni)    obsRows.push([r.date, r.masandaName, isNaN(r.wing)?r.wing:`جناح ${r.wing}`, 'أمني',    r.obs.amni,    r.savedBy||''])
      if (r.obs?.fanni)   obsRows.push([r.date, r.masandaName, isNaN(r.wing)?r.wing:`جناح ${r.wing}`, 'فني',     r.obs.fanni,   r.savedBy||''])
      if (r.obs?.baramij) obsRows.push([r.date, r.masandaName, isNaN(r.wing)?r.wing:`جناح ${r.wing}`, 'برامج',   r.obs.baramij, r.savedBy||''])
    })
    if (obsRows.length) {
      sheets.push({
        name: 'الملاحظات المرصودة',
        headers: ['التاريخ', 'المساندة', 'الجناح', 'نوع الملاحظة', 'الملاحظة', 'المشرف'],
        rows: obsRows
      })
    }

    // ورقة 6: جميع السجلات
    sheets.push({
      name: 'جميع السجلات',
      headers: ['التاريخ', 'المساندة', 'الجناح', 'الالتزام', 'السلوك', 'التفاعل', 'السكن', 'الإجمالي', 'المستفيدون', 'المخالفات', 'المدخِل'],
      rows: records.map(r => [
        r.date, r.masandaName, isNaN(r.wing)?r.wing:`جناح ${r.wing}`,
        ...(r.axes||[]).map(a=>a.total),
        r.totalScore, r.beneficiaries||0, r.violations||0, r.savedBy||''
      ])
    })

    const xml = buildExcel(sheets)
    downloadExcel(xml, `التقرير-الشهري-${MONTHS[month]}-${year}`)
    toast('✅ تم تصدير التقرير')
  }

  // ─ Drill-down handlers
  const handleMasandaClick = (masanda) => {
    setSelMasanda(masanda)
    setLevel(1)
  }
  const handleWingClick = (wing, recs) => {
    setSelWing(wing)
    setWingRecords(recs)
    setLevel(2)
  }
  const handleAxisClick = (ax, ai) => {
    setSelAxis(ax)
    setSelAxisData(ax)
    setLevel(3)
  }

  const years = []
  for (let y = now.getFullYear(); y >= now.getFullYear() - 3; y--) years.push(y)

  return (
    <div className="animate-in">
      {/* ── اختيار الشهر */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ flex: 1, minWidth: 130 }}>
            <label>السنة</label>
            <select value={year} onChange={e => setYear(+e.target.value)}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ flex: 2, minWidth: 160 }}>
            <label>الشهر</label>
            <select value={month} onChange={e => setMonth(+e.target.value)}>
              {MONTHS.map((m,i) => <option key={i} value={i}>{m}</option>)}
            </select>
          </div>
          <button className="btn btn-primary" onClick={load} disabled={loading}>
            {loading ? '⏳ جاري التحميل...' : `🔍 عرض ${MONTHS[month]} ${year}`}
          </button>
          {loaded && records.length > 0 && (
            <button className="btn btn-green btn-sm" onClick={doExport}>📊 Excel شامل</button>
          )}
        </div>
      </div>

      {loading && <div style={{ height: 200 }} className="skeleton" />}

      {!loading && !loaded && (
        <div className="empty-state">
          <div className="es-icon">📅</div>
          <div className="es-title">اختر الشهر وابدأ</div>
          <div className="es-sub">سيظهر تقرير تفاعلي شامل لجميع المراكز والمشرفين</div>
        </div>
      )}

      {!loading && loaded && records.length === 0 && (
        <div className="empty-state">
          <div className="es-icon">📭</div>
          <div className="es-title">لا توجد بيانات لـ {MONTHS[month]} {year}</div>
        </div>
      )}

      {!loading && loaded && records.length > 0 && (
        <>
          {/* ── إحصاءات سريعة */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 16 }}>
            {[
              { label: 'إجمالي التقييمات', value: records.length, icon: '📋', color: 'var(--accent)' },
              { label: 'مساندات مقيّمة',   value: masandaStats.filter(x=>x.stats).length, icon: '🏢', color: 'var(--blue)' },
              { label: 'المتوسط العام/60',  value: (records.reduce((s,r)=>s+r.totalScore,0)/records.length).toFixed(1), icon: '📊', color: 'var(--orange)' },
              { label: 'مشرفون نشطون',    value: new Set(records.map(r=>r.savedBy)).size, icon: '👤', color: 'var(--green)' },
            ].map((s,i) => (
              <div key={i} className="stat-card" style={{ '--card-accent': s.color }}>
                <div className="stat-icon">{s.icon}</div>
                <div className="stat-value">{s.value}</div>
                <div className="stat-label">{s.label}</div>
              </div>
            ))}
          </div>

          {/* ── تبويبات */}
          <div className="tabs" style={{ marginBottom: 16 }}>
            <button className={`tab-btn ${tab==='centers'?'active':''}`} onClick={()=>{setTab('centers');setLevel(0);setSelMasanda(null)}}>
              🏢 المراكز والأجنحة
            </button>
            <button className={`tab-btn ${tab==='supervisors'?'active':''}`} onClick={()=>setTab('supervisors')}>
              👤 أداء المشرفين
            </button>
            <button className={`tab-btn ${tab==='observations'?'active':''}`} onClick={()=>setTab('observations')}>
              📝 الملاحظات المرصودة
              {records.some(r=>r.obs?.amni||r.obs?.fanni||r.obs?.baramij) && (
                <span style={{ marginRight: 5, background: '#c81e1e', color: '#fff', borderRadius: 20, fontSize: 10, padding: '1px 6px', fontWeight: 800 }}>
                  {records.filter(r=>r.obs?.amni||r.obs?.fanni||r.obs?.baramij).length}
                </span>
              )}
            </button>
          </div>

          {tab === 'centers' && (
            <div>
              {/* ─ Breadcrumb */}
              {level > 0 && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 12, fontSize: 12, color: '#6b7a96' }}>
                  <span onClick={()=>{setLevel(0);setSelMasanda(null)}} style={{ cursor: 'pointer', color: 'var(--accent)', fontWeight: 700 }}>المساندات</span>
                  {level >= 1 && selMasanda && <>
                    <span>›</span>
                    <span onClick={()=>{setLevel(1);setSelWing(null)}} style={{ cursor: 'pointer', color: level>1?'var(--accent)':'var(--text)', fontWeight: level>1?700:800 }}>{selMasanda.name}</span>
                  </>}
                  {level >= 2 && selWing !== null && <>
                    <span>›</span>
                    <span onClick={()=>{setLevel(2);setSelAxis(null)}} style={{ cursor: 'pointer', color: level>2?'var(--accent)':'var(--text)', fontWeight: level>2?700:800 }}>
                      {isNaN(selWing)?selWing:`جناح ${selWing}`}
                    </span>
                  </>}
                  {level >= 3 && selAxis && <>
                    <span>›</span>
                    <span style={{ fontWeight: 800, color: 'var(--text)' }}>{selAxis.label}</span>
                  </>}
                </div>
              )}

              {/* ─ المستوى 0: المساندات */}
              {level === 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 12 }}>
                  {masandaStats.map(({ masanda, stats }) => (
                    <MasandaCard
                      key={masanda.id}
                      masanda={masanda}
                      stats={stats}
                      onClick={() => stats && handleMasandaClick(masanda)}
                    />
                  ))}
                </div>
              )}

              {/* ─ المستوى 1: الأجنحة */}
              {level === 1 && selMasanda && (
                <WingsLevel
                  masanda={selMasanda}
                  records={records.filter(r => r.masandaId === selMasanda.id)}
                  onWingClick={handleWingClick}
                  onBack={() => { setLevel(0); setSelMasanda(null) }}
                />
              )}

              {/* ─ المستوى 2: المحاور */}
              {level === 2 && selMasanda && selWing !== null && (
                <AxesLevel
                  masanda={selMasanda}
                  wing={selWing}
                  records={wingRecords}
                  onAxisClick={handleAxisClick}
                  onBack={() => { setLevel(1); setSelWing(null) }}
                />
              )}

              {/* ─ المستوى 3: البنود */}
              {level === 3 && selMasanda && selWing !== null && selAxis && (
                <ItemsLevel
                  masanda={selMasanda}
                  wing={selWing}
                  axis={selAxis}
                  axisData={selAxisData}
                  onBack={() => { setLevel(2); setSelAxis(null) }}
                />
              )}
            </div>
          )}

          {tab === 'supervisors' && (
            <SupervisorsTab records={records} />
          )}

          {tab === 'observations' && (
            <ObservationsTab records={records} />
          )}
        </>
      )}
    </div>
  )
}

// ─── تبويب الملاحظات المرصودة ────────────────────────────────────────────────
function ObservationsTab({ records }) {
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')

  const OBS_TYPES = [
    { key: 'all',     label: 'الكل',    icon: '📝', color: 'var(--accent)' },
    { key: 'amni',    label: 'أمني',    icon: '🛡️', color: '#c81e1e' },
    { key: 'fanni',   label: 'فني',     icon: '🔧', color: '#b45309' },
    { key: 'baramij', label: 'برامج',   icon: '📚', color: '#057a55' },
  ]

  const OBS_STYLE = {
    amni:    { label: '🛡️ ملاحظة أمنية',  color: '#c81e1e', bg: '#fde8e8', border: '#f5a3a3' },
    fanni:   { label: '🔧 ملاحظة فنية',   color: '#b45309', bg: '#fef3c7', border: '#fbbf24' },
    baramij: { label: '📚 ملاحظة برامج',  color: '#057a55', bg: '#e3f9ee', border: '#86d7b0' },
  }

  // قائمة مسطّحة لكل الملاحظات
  const allObs = []
  records.forEach(r => {
    ['amni','fanni','baramij'].forEach(k => {
      if (r.obs?.[k]) allObs.push({
        date: r.date, masanda: r.masandaName, masandaId: r.masandaId,
        wing: r.wing, type: k, text: r.obs[k],
        supervisor: r.savedBy || '—', score: r.totalScore,
      })
    })
  })
  allObs.sort((a,b) => b.date > a.date ? 1 : -1)

  const counts = {
    amni:    allObs.filter(o=>o.type==='amni').length,
    fanni:   allObs.filter(o=>o.type==='fanni').length,
    baramij: allObs.filter(o=>o.type==='baramij').length,
  }

  const filtered = allObs.filter(o => {
    if (filter !== 'all' && o.type !== filter) return false
    if (search && !o.text.includes(search) && !o.masanda.includes(search)) return false
    return true
  })

  // تجميع حسب المساندة
  const byMasanda = {}
  filtered.forEach(o => {
    if (!byMasanda[o.masanda]) byMasanda[o.masanda] = []
    byMasanda[o.masanda].push(o)
  })

  if (!allObs.length) return (
    <div className="empty-state">
      <div className="es-icon">📭</div>
      <div className="es-title">لا توجد ملاحظات مرصودة هذا الشهر</div>
    </div>
  )

  return (
    <div>
      {/* إحصاءات */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'إجمالي الملاحظات', value: allObs.length,  icon: '📝', color: 'var(--accent)' },
          { label: 'ملاحظات أمنية',    value: counts.amni,    icon: '🛡️', color: '#c81e1e' },
          { label: 'ملاحظات فنية',     value: counts.fanni,   icon: '🔧', color: '#b45309' },
          { label: 'ملاحظات برامج',    value: counts.baramij, icon: '📚', color: '#057a55' },
        ].map((s,i) => (
          <div key={i} className="stat-card" style={{ '--card-accent': s.color }}>
            <div className="stat-icon">{s.icon}</div>
            <div className="stat-value">{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* فلتر + بحث */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {OBS_TYPES.map(t => (
            <button key={t.key} onClick={() => setFilter(t.key)} style={{
              padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
              fontFamily: 'Cairo', fontSize: 12, fontWeight: 700,
              background: filter === t.key ? t.color : 'var(--surface3)',
              color: filter === t.key ? '#fff' : 'var(--text-muted)',
              transition: 'all .15s'
            }}>
              {t.icon} {t.label}
              <span style={{ marginRight: 4, opacity: .8 }}>
                ({t.key === 'all' ? allObs.length : counts[t.key] || 0})
              </span>
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 بحث في الملاحظات أو المساندة..."
          style={{
            flex: 1, minWidth: 180, padding: '7px 12px',
            background: 'var(--surface2)', border: '1.5px solid var(--border)',
            borderRadius: 'var(--rs)', fontFamily: 'Cairo', fontSize: 13,
            color: 'var(--text)', direction: 'rtl'
          }}
        />
      </div>

      {filtered.length === 0 && (
        <div className="empty-state"><div className="es-icon">🔍</div><div className="es-title">لا توجد نتائج</div></div>
      )}

      {/* الملاحظات مجمّعة حسب المساندة */}
      {Object.entries(byMasanda).map(([masanda, obs]) => (
        <div key={masanda} className="card" style={{ marginBottom: 14 }}>
          {/* رأس المساندة */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid var(--border)'
          }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>🏢 {masanda}</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {['amni','fanni','baramij'].map(k => {
                const cnt = obs.filter(o=>o.type===k).length
                if (!cnt) return null
                const s = OBS_STYLE[k]
                return (
                  <span key={k} style={{ padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
                    {k==='amni'?'🛡️':k==='fanni'?'🔧':'📚'} {cnt}
                  </span>
                )
              })}
            </div>
          </div>

          {/* الملاحظات */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {obs.map((o, i) => {
              const s = OBS_STYLE[o.type]
              const wLabel = isNaN(o.wing) ? o.wing : `جناح ${o.wing}`
              const pct = (o.score / 60) * 100
              const sc = pct >= 83 ? '#057a55' : pct >= 58 ? '#b45309' : '#c81e1e'
              return (
                <div key={i} style={{
                  display: 'grid', gridTemplateColumns: '1fr auto',
                  gap: 12, alignItems: 'start',
                  background: s.bg, border: `1px solid ${s.border}`,
                  borderRadius: 'var(--rs)', padding: '12px 14px',
                  borderRight: `4px solid ${s.color}`
                }}>
                  <div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: s.color }}>{s.label}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700 }}>— {wLabel}</span>
                      <span className="badge badge-dim" style={{ fontSize: 10 }}>{o.date}</span>
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.8 }}>{o.text}</div>
                  </div>
                  <div style={{ textAlign: 'left', flexShrink: 0 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{o.supervisor}</div>
                    <span style={{
                      display: 'inline-block', padding: '2px 8px', borderRadius: 20,
                      fontSize: 12, fontWeight: 800,
                      background: sc + '18', color: sc, border: `1px solid ${sc}44`
                    }}>{o.score}/60</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
