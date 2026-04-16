// src/modules/reports/SupervisorBiasReport.jsx
// تقرير مقارنة أداء المشرفين — للمدير فقط

import { useState, useCallback } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useToast } from '../../components/Toast'
import { MASANDAT, AXES } from '../../lib/constants'

// تصدير Excel
function exportToExcel(rows, headers, filename) {
  const esc = v => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  const hRow = headers.map(h => `<Cell ss:StyleID="h"><Data ss:Type="String">${esc(h)}</Data></Cell>`).join('')
  const dRows = rows.map(row =>
    '<Row>' + row.map(c => `<Cell><Data ss:Type="String">${esc(c)}</Data></Cell>`).join('') + '</Row>'
  ).join('')
  const xml = `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles><Style ss:ID="h"><Font ss:Bold="1"/><Interior ss:Color="#D9E1F2" ss:Pattern="Solid"/></Style></Styles>
<Worksheet ss:Name="مقارنة المشرفين"><Table><Row>${hRow}</Row>${dRows}</Table></Worksheet></Workbook>`
  const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename + '.xls'
  a.click()
}

// حساب الانحراف المعياري
function stdDev(arr) {
  if (!arr.length) return 0
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length
  const variance = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length
  return Math.sqrt(variance)
}

// لون الدرجة
function scoreColor(avg) {
  if (avg >= 50) return { text: '#057a55', bg: '#e3f9ee', border: '#057a55' }
  if (avg >= 40) return { text: '#b45309', bg: '#fef3c7', border: '#b45309' }
  return { text: '#c81e1e', bg: '#fde8e8', border: '#c81e1e' }
}

// لون الانحراف (تباين المشرف)
function biasColor(dev) {
  if (dev <= 3)  return { text: '#057a55', bg: '#e3f9ee', label: 'متسق' }
  if (dev <= 7)  return { text: '#b45309', bg: '#fef3c7', label: 'متوسط التباين' }
  return { text: '#c81e1e', bg: '#fde8e8', label: 'عالي التباين' }
}

export default function SupervisorBiasReport() {
  const toast = useToast()
  const [from,    setFrom]    = useState('')
  const [to,      setTo]      = useState('')
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!from || !to) { toast('⚠️ حدد الفترة الزمنية', 'warn'); return }
    setLoading(true)
    try {
      const snap = await getDocs(collection(db, 'wings'))
      let records = snap.docs.map(d => d.data())
      records = records.filter(w => w.date >= from && w.date <= to && w.savedBy)

      // ─ تجميع البيانات حسب المشرف
      const bySuper = {}
      records.forEach(w => {
        const sup = w.savedBy
        if (!bySuper[sup]) {
          bySuper[sup] = {
            name: sup,
            records: [],
            scores: [],
            byAxis: { iltizam: [], suluk: [], tafaul: [], sukan: [] },
            byMasanda: {},
            byDate: {}
          }
        }
        bySuper[sup].records.push(w)
        bySuper[sup].scores.push(w.totalScore)

        // حسب المحور
        w.axes?.forEach((ax) => {
          if (bySuper[sup].byAxis[ax.key] !== undefined) {
            bySuper[sup].byAxis[ax.key].push(ax.total)
          }
        })

        // حسب المساندة
        const mName = w.masandaName || w.masandaId
        if (!bySuper[sup].byMasanda[mName]) bySuper[sup].byMasanda[mName] = []
        bySuper[sup].byMasanda[mName].push(w.totalScore)

        // حسب اليوم
        if (!bySuper[sup].byDate[w.date]) bySuper[sup].byDate[w.date] = []
        bySuper[sup].byDate[w.date].push(w.totalScore)
      })

      // ─ تجميع البيانات حسب الجناح+التاريخ (لحساب الفارق)
      const byWingDate = {}
      records.forEach(w => {
        const key = `${w.date}_${w.masandaId}_${w.wing}`
        if (!byWingDate[key]) byWingDate[key] = []
        byWingDate[key].push({ score: w.totalScore, sup: w.savedBy })
      })

      // ─ إحصاءات عامة
      const allScores = records.map(w => w.totalScore)
      const globalAvg = allScores.length ? allScores.reduce((a,b)=>a+b,0)/allScores.length : 0
      const globalStd = stdDev(allScores)

      // ─ حساب المقاييس لكل مشرف
      const supervisors = Object.values(bySuper).map(sup => {
        const avg = sup.scores.reduce((a,b)=>a+b,0) / sup.scores.length
        const dev = stdDev(sup.scores)
        const bias = avg - globalAvg // إيجابي = كريم، سلبي = متشدد
        const axisAvgs = {
          iltizam: sup.byAxis.iltizam.length ? sup.byAxis.iltizam.reduce((a,b)=>a+b,0)/sup.byAxis.iltizam.length : 0,
          suluk:   sup.byAxis.suluk.length   ? sup.byAxis.suluk.reduce((a,b)=>a+b,0)/sup.byAxis.suluk.length   : 0,
          tafaul:  sup.byAxis.tafaul.length  ? sup.byAxis.tafaul.reduce((a,b)=>a+b,0)/sup.byAxis.tafaul.length : 0,
          sukan:   sup.byAxis.sukan.length   ? sup.byAxis.sukan.reduce((a,b)=>a+b,0)/sup.byAxis.sukan.length   : 0,
        }
        const maxScore = Math.max(...sup.scores)
        const minScore = Math.min(...sup.scores)
        const highCount = sup.scores.filter(s => s >= 50).length
        const lowCount  = sup.scores.filter(s => s < 35).length
        return { ...sup, avg, dev, bias, axisAvgs, maxScore, minScore, highCount, lowCount }
      }).sort((a,b) => b.avg - a.avg)

      // ─ الأجنحة ذات التباين الكبير (نفس الجناح نفس اليوم قيّمه مشرفان بفارق كبير)
      // هنا نبحث عن أجنحة قيّمها أكثر من مشرف واحد في اليوم نفسه
      const conflictWings = []
      Object.entries(byWingDate).forEach(([key, entries]) => {
        if (entries.length > 1) {
          const scores = entries.map(e => e.score)
          const diff = Math.max(...scores) - Math.min(...scores)
          if (diff >= 10) {
            const [date, masandaId, wing] = key.split('_')
            const m = MASANDAT.find(m => m.id === masandaId)
            conflictWings.push({
              date, masanda: m?.name || masandaId, wing,
              entries, diff,
              maxSup: entries.find(e => e.score === Math.max(...scores))?.sup,
              minSup: entries.find(e => e.score === Math.min(...scores))?.sup,
            })
          }
        }
      })
      conflictWings.sort((a,b) => b.diff - a.diff)

      setData({ supervisors, globalAvg, globalStd, totalRecords: records.length, conflictWings })
    } catch (e) { toast('❌ ' + e.message, 'error') }
    setLoading(false)
  }, [from, to, toast])

  const doExport = () => {
    if (!data) return
    const headers = ['المشرف','عدد التقييمات','المتوسط','الانحراف المعياري','الفارق عن العام','أعلى درجة','أدنى درجة','تقييمات عالية (50+)','تقييمات منخفضة (-35)']
    const rows = data.supervisors.map(s => [
      s.name, s.records.length, s.avg.toFixed(1), s.dev.toFixed(1),
      (s.bias >= 0 ? '+' : '') + s.bias.toFixed(1),
      s.maxScore, s.minScore, s.highCount, s.lowCount
    ])
    exportToExcel(rows, headers, `مقارنة-المشرفين-${from}-${to}`)
  }

  return (
    <div className="animate-in">
      {/* تنبيه السرية */}
      <div style={{
        padding: '10px 16px', marginBottom: 16,
        background: 'rgba(124,58,237,.08)', border: '1px solid rgba(124,58,237,.3)',
        borderRadius: 'var(--rs)', fontSize: 12, color: 'var(--purple)',
        display: 'flex', alignItems: 'center', gap: 8
      }}>
        🔒 <strong>هذا التقرير للمدير فقط</strong> — يقيس الاتساق والتباين في تقييمات المشرفين، ولا يُشارك مع المشرفين مباشرة
      </div>

      {/* الفلاتر */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">🔍 تحديد الفترة الزمنية</div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ flex: 1, minWidth: 150 }}>
            <label>من تاريخ *</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: 1, minWidth: 150 }}>
            <label>إلى تاريخ *</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} />
          </div>
          <button className="btn btn-primary" onClick={load} disabled={loading}>
            {loading ? '⏳ جاري التحليل...' : '🔍 تحليل البيانات'}
          </button>
          {data && (
            <button className="btn btn-green btn-sm" onClick={doExport}>📊 Excel</button>
          )}
        </div>
      </div>

      {loading && <div style={{ height: 200 }} className="skeleton" />}

      {!loading && data && (
        <>
          {/* إحصاءات عامة */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 16 }}>
            {[
              { label: 'إجمالي التقييمات', value: data.totalRecords, icon: '📋', color: 'var(--accent)' },
              { label: 'عدد المشرفين',     value: data.supervisors.length, icon: '👤', color: 'var(--blue)' },
              { label: 'المتوسط العام/60', value: data.globalAvg.toFixed(1), icon: '📊', color: 'var(--orange)' },
              { label: 'الانحراف المعياري العام', value: data.globalStd.toFixed(1), icon: '📉', color: 'var(--purple)' },
            ].map((s,i) => (
              <div key={i} className="stat-card" style={{ '--card-accent': s.color }}>
                <div className="stat-icon">{s.icon}</div>
                <div className="stat-value">{s.value}</div>
                <div className="stat-label">{s.label}</div>
              </div>
            ))}
          </div>

          {/* ─── جدول المشرفين ──────────────────────────────────────────────── */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">👤 أداء كل مشرف مقارنةً بالمتوسط العام ({data.globalAvg.toFixed(1)}/60)</div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>المشرف</th>
                    <th>تقييمات</th>
                    <th>متوسطه/60</th>
                    <th>الفارق عن العام</th>
                    <th>الاتساق</th>
                    <th>الالتزام/15</th>
                    <th>السلوك/15</th>
                    <th>التفاعل/15</th>
                    <th>السكن/15</th>
                    <th>تقييمات عالية</th>
                    <th>تقييمات منخفضة</th>
                  </tr>
                </thead>
                <tbody>
                  {data.supervisors.map((s, i) => {
                    const sc = scoreColor(s.avg)
                    const bc = biasColor(s.dev)
                    const biasPos = s.bias >= 0
                    return (
                      <tr key={i}>
                        <td style={{ fontWeight: 800 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{
                              width: 28, height: 28, borderRadius: '50%',
                              background: 'var(--accent)', color: '#fff',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 11, fontWeight: 800, flexShrink: 0
                            }}>
                              {s.name.charAt(0)}
                            </div>
                            {s.name}
                          </div>
                        </td>
                        <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                          {s.records.length}
                        </td>
                        <td>
                          <span style={{
                            display: 'inline-block', padding: '3px 10px',
                            borderRadius: 20, fontSize: 12, fontWeight: 800,
                            background: sc.bg, color: sc.text, border: `1px solid ${sc.border}`
                          }}>
                            {s.avg.toFixed(1)}
                          </span>
                        </td>
                        <td>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 3,
                            padding: '3px 10px', borderRadius: 20,
                            fontSize: 12, fontWeight: 800,
                            background: biasPos ? '#e3f9ee' : '#fde8e8',
                            color: biasPos ? '#057a55' : '#c81e1e'
                          }}>
                            {biasPos ? '▲' : '▼'}
                            {biasPos ? '+' : ''}{s.bias.toFixed(1)}
                          </span>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                            {biasPos ? 'أعلى من العام' : 'أقل من العام'}
                          </div>
                        </td>
                        <td>
                          <span style={{
                            display: 'inline-block', padding: '3px 10px',
                            borderRadius: 20, fontSize: 11, fontWeight: 700,
                            background: bc.bg, color: bc.text
                          }}>
                            σ={s.dev.toFixed(1)} — {bc.label}
                          </span>
                        </td>
                        {['iltizam','suluk','tafaul','sukan'].map(k => (
                          <td key={k} style={{ textAlign: 'center', fontSize: 12, fontWeight: 600 }}>
                            {s.axisAvgs[k].toFixed(1)}
                          </td>
                        ))}
                        <td style={{ textAlign: 'center', color: '#057a55', fontWeight: 700 }}>
                          {s.highCount}
                        </td>
                        <td style={{ textAlign: 'center', color: '#c81e1e', fontWeight: 700 }}>
                          {s.lowCount}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ─── مخطط مرئي للمقارنة ────────────────────────────────────────── */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">📊 مقارنة متوسطات المشرفين — الخط الأحمر = المتوسط العام ({data.globalAvg.toFixed(1)})</div>
            <div style={{ padding: '12px 8px' }}>
              {data.supervisors.map((s, i) => {
                const pct = (s.avg / 60) * 100
                const globalPct = (data.globalAvg / 60) * 100
                const sc = scoreColor(s.avg)
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                    <div style={{ minWidth: 100, fontSize: 12, fontWeight: 700, textAlign: 'right' }}>
                      {s.name}
                    </div>
                    <div style={{ flex: 1, position: 'relative', height: 22 }}>
                      {/* Track */}
                      <div style={{
                        position: 'absolute', inset: 0,
                        background: 'var(--surface3)', borderRadius: 11
                      }} />
                      {/* Bar */}
                      <div style={{
                        position: 'absolute', top: 0, right: 0, bottom: 0,
                        width: `${pct}%`, borderRadius: 11,
                        background: sc.text, transition: 'width .5s ease'
                      }} />
                      {/* Global avg line */}
                      <div style={{
                        position: 'absolute', top: -4, bottom: -4,
                        right: `${globalPct}%`,
                        width: 2, background: '#c81e1e',
                        borderRadius: 2, zIndex: 2
                      }} />
                    </div>
                    <div style={{ minWidth: 40, fontSize: 12, fontWeight: 800, color: sc.text }}>
                      {s.avg.toFixed(1)}
                    </div>
                    <div style={{ minWidth: 24, fontSize: 11, color: 'var(--text-muted)' }}>
                      ({s.records.length})
                    </div>
                  </div>
                )
              })}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
                <div style={{ width: 20, height: 2, background: '#c81e1e', borderRadius: 1 }} />
                <span>الخط الأحمر = المتوسط العام ({data.globalAvg.toFixed(1)})</span>
              </div>
            </div>
          </div>

          {/* ─── توصيات إدارية ──────────────────────────────────────────────── */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">💡 ملاحظات تحليلية</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {data.supervisors
                .filter(s => Math.abs(s.bias) > 5)
                .map((s, i) => {
                  const isHigh = s.bias > 0
                  return (
                    <div key={i} style={{
                      padding: '10px 14px', borderRadius: 'var(--rs)',
                      background: isHigh ? '#fef3c7' : '#fde8e8',
                      border: `1px solid ${isHigh ? '#fbbf24' : '#f5a3a3'}`,
                      fontSize: 13
                    }}>
                      <strong style={{ color: isHigh ? '#b45309' : '#c81e1e' }}>
                        {isHigh ? '⬆️' : '⬇️'} {s.name}
                      </strong>
                      {' — '}
                      {isHigh
                        ? `متوسطه (${s.avg.toFixed(1)}) أعلى من العام بمقدار ${s.bias.toFixed(1)} نقطة. يُنصح بمراجعة توافق تقييماته مع الواقع الميداني.`
                        : `متوسطه (${s.avg.toFixed(1)}) أقل من العام بمقدار ${Math.abs(s.bias).toFixed(1)} نقطة. قد يكون أكثر تشدداً أو يغطي أجنحة ذات أداء أدنى.`
                      }
                    </div>
                  )
                })
              }
              {data.supervisors
                .filter(s => s.dev > 7)
                .map((s, i) => (
                  <div key={`dev-${i}`} style={{
                    padding: '10px 14px', borderRadius: 'var(--rs)',
                    background: 'rgba(124,58,237,.08)', border: '1px solid rgba(124,58,237,.3)',
                    fontSize: 13
                  }}>
                    <strong style={{ color: 'var(--purple)' }}>📉 {s.name}</strong>
                    {' — '}
                    انحراف معياري مرتفع ({s.dev.toFixed(1)}) مما يدل على تباين كبير في تقييماته بين الأجنحة. يُنصح بمراجعة معايير التقييم معه.
                  </div>
                ))
              }
              {data.supervisors.every(s => Math.abs(s.bias) <= 5 && s.dev <= 7) && (
                <div style={{
                  padding: '10px 14px', borderRadius: 'var(--rs)',
                  background: '#e3f9ee', border: '1px solid #86d7b0', fontSize: 13
                }}>
                  ✅ جميع المشرفين ضمن نطاق معقول من الاتساق في هذه الفترة.
                </div>
              )}
            </div>
          </div>

          {/* ─── الأجنحة ذات التباين بين مشرفين ────────────────────────────── */}
          {data.conflictWings.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-title" style={{ color: 'var(--orange)' }}>
                ⚡ أجنحة قُيِّمت بفارق ≥ 10 نقاط من مشرفين مختلفين في نفس اليوم ({data.conflictWings.length})
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
                هذه الحالات تستدعي مراجعة — قد تعكس تبايناً في فهم معايير التقييم
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>التاريخ</th>
                      <th>المساندة</th>
                      <th>الجناح</th>
                      <th>المشرف الأعلى</th>
                      <th>درجته</th>
                      <th>المشرف الأدنى</th>
                      <th>درجته</th>
                      <th>الفارق</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.conflictWings.slice(0, 20).map((w, i) => (
                      <tr key={i}>
                        <td style={{ fontSize: 12 }}>{w.date}</td>
                        <td style={{ fontSize: 12 }}>{w.masanda}</td>
                        <td style={{ fontWeight: 700 }}>{isNaN(w.wing) ? w.wing : `جناح ${w.wing}`}</td>
                        <td style={{ color: '#057a55', fontWeight: 600, fontSize: 12 }}>{w.maxSup}</td>
                        <td>
                          <span className="badge badge-green">{Math.max(...w.entries.map(e=>e.score))}</span>
                        </td>
                        <td style={{ color: '#c81e1e', fontWeight: 600, fontSize: 12 }}>{w.minSup}</td>
                        <td>
                          <span className="badge badge-red">{Math.min(...w.entries.map(e=>e.score))}</span>
                        </td>
                        <td>
                          <span className="badge badge-orange">{w.diff} نقطة</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {!loading && !data && (
        <div className="empty-state">
          <div className="es-icon">🔍</div>
          <div className="es-title">اختر فترة زمنية وابدأ التحليل</div>
          <div className="es-sub">يُنصح بتحليل شهر كامل على الأقل للحصول على نتائج ذات دلالة</div>
        </div>
      )}
    </div>
  )
}
