import { useState, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  collection, getDocs, getDoc, doc, query, orderBy
} from 'firebase/firestore'
import { db } from '../../lib/firebase'
import * as XLSX from 'xlsx'
import {
  DEFAULT_STATUSES, DEFAULT_JOB_TYPES,
  LEAVE_TYPES, MISSION_TYPES, APPT_TYPES, PERMIT_TYPES,
  COLOR_MAP
} from './attendanceConstants'

// ── helpers ───────────────────────────────────────────────────────────────────
const DAY_AR = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت']

function today() { return new Date().toISOString().split('T')[0] }
function monthStart(m) { return m + '-01' }
function monthEnd(m) {
  const [y, mo] = m.split('-').map(Number)
  return new Date(y, mo, 0).toISOString().split('T')[0]
}
function datesInMonth(m) {
  const start = new Date(monthStart(m) + 'T12:00:00')
  const end   = new Date(monthEnd(m)   + 'T12:00:00')
  const out = []
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const day = d.getDay()
    if (day !== 5) out.push(d.toISOString().split('T')[0])
  }
  return out
}

function statusLabel(id, statuses) {
  return statuses.find(s => s.id === id)?.label || id || '—'
}

function detailText(rec) {
  if (!rec?.detail) return ''
  const d = rec.detail
  if (rec.statusId === 'leave') {
    const t = LEAVE_TYPES.find(x => x.id === d.leaveType)?.label || ''
    return [t, d.days ? `${d.days} يوم` : ''].filter(Boolean).join(' · ')
  }
  if (rec.statusId === 'task')    return [d.taskPlace, d.taskDurType === 'open' ? 'مفتوح' : `${d.taskDays||''} يوم`].filter(Boolean).join(' · ')
  if (rec.statusId === 'mission') return MISSION_TYPES.find(x => x.id === d.missionType)?.label || ''
  if (rec.statusId === 'appt')    return APPT_TYPES.find(x => x.id === d.apptType)?.label || ''
  if (rec.statusId === 'permit')  return PERMIT_TYPES.find(x => x.id === d.permitType)?.label || ''
  return ''
}

function StatusBadge({ id, statuses }) {
  const s = statuses.find(x => x.id === id)
  if (!s) return <span style={{ color: 'var(--text-dim)' }}>—</span>
  const c = COLOR_MAP[s.color] || COLOR_MAP.gray
  return (
    <span style={{
      background: c.bg, color: c.text,
      fontSize: 12, padding: '3px 10px',
      borderRadius: 20, fontWeight: 500
    }}>{s.label}</span>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function AttendanceReports() {
  const [mode,      setMode]      = useState('daily')
  const [date,      setDate]      = useState(today())
  const [month,     setMonth]     = useState(today().slice(0, 7))
  const [staff,     setStaff]     = useState([])
  const [statuses,  setStatuses]  = useState(DEFAULT_STATUSES)
  const [jobTypes,  setJobTypes]  = useState(DEFAULT_JOB_TYPES)
  const [rows,      setRows]      = useState([])
  const [loading,   setLoading]   = useState(false)
  const [filterName,setFilterName]= useState('')
  const [filterJob, setFilterJob] = useState('')
  const [filterSt,  setFilterSt]  = useState('')
  const [monthSummary, setMonthSummary] = useState(null)
  const [selStaff,     setSelStaff]     = useState(null)

  const loadStatic = useCallback(async () => {
    const [sSnap, stSnap, jSnap] = await Promise.all([
      getDocs(query(collection(db, 'hrStaff'), orderBy('name'))),
      getDocs(collection(db, 'attendanceStatuses')),
      getDocs(collection(db, 'hrJobTypes')),
    ])
    const s  = sSnap.docs.map(d => ({ id: d.id, ...d.data() }))
    const st = stSnap.empty ? DEFAULT_STATUSES : stSnap.docs.map(d => ({ id: d.id, ...d.data() }))
    const j  = jSnap.empty  ? DEFAULT_JOB_TYPES : jSnap.docs.map(d => ({ id: d.id, ...d.data() }))
    setStaff(s); setStatuses(st); setJobTypes(j)
    return { staff: s, statuses: st, jobTypes: j }
  }, [])

  const runDaily = async () => {
    setLoading(true)
    const { staff: s, statuses: st, jobTypes: j } = await loadStatic()
    const snap = await getDoc(doc(db, 'hrAttendance', date))
    const data = snap.exists() ? snap.data() : {}
    const computed = s.map(p => ({
      ...p,
      rec: data[p.id] || null,
      jobLabel: j.find(x => x.id === p.jobTypeId)?.label || '—',
      jobColor: j.find(x => x.id === p.jobTypeId)?.color || 'gray',
    }))
    setRows(computed)
    setMonthSummary(null)
    setLoading(false)
  }

  const runMonthly = async () => {
    setLoading(true)
    const { staff: s, statuses: st, jobTypes: j } = await loadStatic()
    const dates = datesInMonth(month)
    const snaps = await Promise.all(dates.map(d => getDoc(doc(db, 'hrAttendance', d))))
    const dailyData = {}
    dates.forEach((d, i) => {
      dailyData[d] = snaps[i].exists() ? snaps[i].data() : {}
    })
    const computed = s.map(p => {
      let present = 0, absent = 0, leave = 0, task = 0, other = 0, unset = 0
      dates.forEach(d => {
        const r = dailyData[d][p.id]
        if (!r) { unset++; return }
        if (r.statusId === 'present')       present++
        else if (r.statusId === 'absent')   absent++
        else if (r.statusId === 'leave')    leave++
        else if (r.statusId === 'task')     task++
        else other++
      })
      const total = dates.length
      const pct   = total ? Math.round(present / total * 100) : 0
      return {
        ...p,
        jobLabel: j.find(x => x.id === p.jobTypeId)?.label || '—',
        jobColor: j.find(x => x.id === p.jobTypeId)?.color || 'gray',
        present, absent, leave, task, other, unset, total, pct
      }
    })
    const totPresent = computed.reduce((a, r) => a + r.present, 0)
    const totDays    = computed.reduce((a, r) => a + r.total,   0)
    const avgPct     = totDays ? Math.round(totPresent / totDays * 100) : 0
    setMonthSummary({ avgPct, workDays: dates.length, headcount: s.length })
    setRows(computed)
    setLoading(false)
  }

  const filtered = rows.filter(r => {
    if (filterName && !r.name.includes(filterName)) return false
    if (filterJob  && r.jobTypeId !== filterJob)    return false
    if (filterSt   && mode === 'daily' && r.rec?.statusId !== filterSt) return false
    return true
  })

  // ── حساب إحصاءات الحالات للطباعة (يومي) ────────────────────────────────────
  const statusCounts = {}
  if (mode === 'daily' && filtered.length) {
    filtered.forEach(r => {
      const sid = r.rec?.statusId || 'unset'
      statusCounts[sid] = (statusCounts[sid] || 0) + 1
    })
  }

  // مجموعات مرتبة حسب الحالة للطباعة
  const printGroups = mode === 'daily' ? [
    ...statuses.map(s => ({
      id: s.id, label: s.label,
      members: filtered.filter(r => r.rec?.statusId === s.id)
    })).filter(g => g.members.length > 0),
    ...((() => {
      const unset = filtered.filter(r => !r.rec?.statusId)
      return unset.length ? [{ id: 'unset', label: 'لم يُسجَّل', members: unset }] : []
    })())
  ] : []

  // ── Export Excel ────────────────────────────────────────────────────────────
  const exportExcel = () => {
    const headers = mode === 'daily'
      ? ['الاسم', 'الرتبة', 'طبيعة العمل', 'الحالة', 'التفاصيل']
      : ['الاسم', 'الرتبة', 'طبيعة العمل', 'أيام حضور', 'غياب', 'إجازة', 'مكلَّف', 'أخرى', 'نسبة الحضور']
    const data = filtered.map(r =>
      mode === 'daily'
        ? [r.name, r.rank||'', r.jobLabel, statusLabel(r.rec?.statusId, statuses), detailText(r.rec)]
        : [r.name, r.rank||'', r.jobLabel, r.present, r.absent, r.leave, r.task, r.other, `${r.pct}%`]
    )
    const ws = XLSX.utils.aoa_to_sheet([headers, ...data])
    ws['!dir'] = 'rtl'
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, mode === 'daily' ? 'يومي' : 'شهري')
    XLSX.writeFile(wb, `حضور_${mode === 'daily' ? date : month}.xlsx`)
  }

  const exportPDF = () => window.print()

  const jobLabel = (id) => jobTypes.find(j => j.id === id)?.label || '—'
  const jobColor = (id) => jobTypes.find(j => j.id === id)?.color || 'gray'

  // ── الألوان الثابتة للطباعة (بدل CSS vars) ──────────────────────────────────
  const PRINT_STATUS_COLORS = {
    present: '#16a34a', absent: '#dc2626', leave: '#ea580c',
    task: '#6b7280', mission: '#2563eb', friday: '#7c3aed',
    death: '#374151', appt: '#0284c7', sick: '#d97706',
    permit: '#9333ea', unset: '#9ca3af',
  }

  return (
    <div>
      {/* Mode switch */}
      <div className="tab-bar" style={{ marginBottom: 14 }}>
        {[['daily','يومي'],['monthly','شهري']].map(([m, l]) => (
          <button key={m} className={`tab-btn ${mode === m ? 'active' : ''}`}
            onClick={() => { setMode(m); setRows([]) }}>{l}</button>
        ))}
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: '12px 16px', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {mode === 'daily' ? (
            <div className="field">
              <label className="field-label">التاريخ</label>
              <input className="field-input" type="date" value={date}
                style={{ width: 160 }} onChange={e => setDate(e.target.value)} />
            </div>
          ) : (
            <div className="field">
              <label className="field-label">الشهر</label>
              <input className="field-input" type="month" value={month}
                style={{ width: 160 }} onChange={e => setMonth(e.target.value)} />
            </div>
          )}
          <div className="field">
            <label className="field-label">الشخص</label>
            <input className="field-input" placeholder="الاسم..." style={{ width: 160 }}
              value={filterName} onChange={e => setFilterName(e.target.value)} />
          </div>
          <div className="field">
            <label className="field-label">طبيعة العمل</label>
            <select className="field-input" style={{ width: 160 }}
              value={filterJob} onChange={e => setFilterJob(e.target.value)}>
              <option value="">الكل</option>
              {jobTypes.map(j => <option key={j.id} value={j.id}>{j.label}</option>)}
            </select>
          </div>
          {mode === 'daily' && (
            <div className="field">
              <label className="field-label">الحالة</label>
              <select className="field-input" style={{ width: 160 }}
                value={filterSt} onChange={e => setFilterSt(e.target.value)}>
                <option value="">الكل</option>
                {statuses.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
          )}
          <button className="btn btn-primary"
            onClick={mode === 'daily' ? runDaily : runMonthly} disabled={loading}>
            {loading ? '⏳...' : '🔍 عرض'}
          </button>
          {rows.length > 0 && (
            <>
              <button className="btn btn-ghost" onClick={exportExcel}>📊 Excel</button>
              <button className="btn btn-ghost" onClick={exportPDF}>🖨️ طباعة / PDF</button>
            </>
          )}
        </div>
      </div>

      {/* Monthly KPIs */}
      {monthSummary && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          {[
            { label: 'متوسط الحضور', val: monthSummary.avgPct + '%', color: monthSummary.avgPct >= 70 ? 'var(--green)' : monthSummary.avgPct >= 50 ? 'var(--orange)' : 'var(--red)' },
            { label: 'أيام العمل',    val: monthSummary.workDays,     color: 'var(--text)' },
            { label: 'إجمالي الكوادر',val: monthSummary.headcount,   color: 'var(--text)' },
          ].map(k => (
            <div key={k.label} className="card" style={{ padding: '8px 16px', flex: 1, minWidth: 120, textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 600, color: k.color }}>{k.val}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{k.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Results - screen view */}
      {rows.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {mode === 'daily' ? (
            <table className="data-table">
              <thead>
                <tr><th>الاسم</th><th>الرتبة</th><th>طبيعة العمل</th><th>الحالة</th><th>التفاصيل</th></tr>
              </thead>
              <tbody>
                {filtered.map(r => {
                  const jc = COLOR_MAP[jobColor(r.jobTypeId)] || COLOR_MAP.gray
                  return (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 500, cursor: 'pointer', color: 'var(--accent)' }}
                          onClick={() => setSelStaff(r)}>{r.name}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.rank || '—'}</td>
                      <td>
                        <span style={{ background: jc.bg, color: jc.text, fontSize: 12, padding: '3px 10px', borderRadius: 20, fontWeight: 500 }}>
                          {r.jobLabel}
                        </span>
                      </td>
                      <td><StatusBadge id={r.rec?.statusId} statuses={statuses} /></td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{detailText(r.rec) || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>الاسم</th><th>طبيعة العمل</th>
                  <th>حضور</th><th>غياب</th><th>إجازة</th><th>مكلَّف</th><th>نسبة الحضور</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => {
                  const jc  = COLOR_MAP[jobColor(r.jobTypeId)] || COLOR_MAP.gray
                  const clr = r.pct >= 70 ? 'var(--green)' : r.pct >= 50 ? 'var(--orange)' : 'var(--red)'
                  return (
                    <tr key={r.id}>
                      <td style={{ cursor: 'pointer' }} onClick={() => setSelStaff(r)}>
                        <div style={{ fontWeight: 500, color: 'var(--accent)' }}>{r.name}</div>
                        {r.rank && <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{r.rank}</div>}
                      </td>
                      <td>
                        <span style={{ background: jc.bg, color: jc.text, fontSize: 12, padding: '3px 10px', borderRadius: 20, fontWeight: 500 }}>
                          {r.jobLabel}
                        </span>
                      </td>
                      <td style={{ fontWeight: 500, color: 'var(--green)' }}>{r.present}</td>
                      <td style={{ color: r.absent > 0 ? 'var(--red)' : 'var(--text-muted)' }}>{r.absent}</td>
                      <td style={{ color: 'var(--orange)' }}>{r.leave}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{r.task}</td>
                      <td><span style={{ fontWeight: 600, color: clr }}>{r.pct}%</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ══ منطقة الطباعة — مخفية على الشاشة، تظهر عند الطباعة فقط ══ */}
      {rows.length > 0 && (
        <div id="pdf-layout" style={{ display: 'none' }}>

          {/* ترويسة */}
          <div style={{ textAlign: 'center', marginBottom: 14, borderBottom: '2px solid #333', paddingBottom: 10 }}>
            <div style={{ fontSize: 17, fontWeight: 800 }}>
              {mode === 'daily' ? 'كشف الحضور اليومي' : 'التقرير الشهري للحضور'}
            </div>
            <div style={{ fontSize: 12, color: '#555', marginTop: 3 }}>
              {mode === 'daily' ? `التاريخ: ${date}` : `الشهر: ${month}`}
              {filterJob ? `  |  طبيعة العمل: ${jobLabel(filterJob)}` : ''}
              {`  |  إجمالي: ${filtered.length} فرد`}
            </div>
          </div>

          {mode === 'daily' ? (
            <>
              {/* ملخص الحالات */}
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 14, border: '1px solid #bbb' }}>
                <tbody>
                  <tr>
                    {statuses.map(s => (statusCounts[s.id] || 0) > 0 && (
                      <td key={s.id} style={{
                        textAlign: 'center', padding: '6px 4px',
                        border: '1px solid #bbb',
                        borderTop: `3px solid ${PRINT_STATUS_COLORS[s.id] || '#888'}`
                      }}>
                        <div style={{ fontSize: 20, fontWeight: 800, color: PRINT_STATUS_COLORS[s.id] || '#333' }}>
                          {statusCounts[s.id]}
                        </div>
                        <div style={{ fontSize: 11 }}>{s.label}</div>
                      </td>
                    ))}
                    {(statusCounts['unset'] || 0) > 0 && (
                      <td style={{
                        textAlign: 'center', padding: '6px 4px',
                        border: '1px solid #bbb', borderTop: '3px solid #9ca3af'
                      }}>
                        <div style={{ fontSize: 20, fontWeight: 800, color: '#9ca3af' }}>{statusCounts['unset']}</div>
                        <div style={{ fontSize: 11 }}>لم يُسجَّل</div>
                      </td>
                    )}
                  </tr>
                </tbody>
              </table>

              {/* الأسماء مقسَّمة حسب الحالة */}
              {printGroups.map(g => (
                <div key={g.id} style={{ marginBottom: 12, breakInside: 'avoid' }}>
                  <div style={{
                    fontWeight: 700, fontSize: 12,
                    background: '#f0f0f0', padding: '4px 10px', marginBottom: 3,
                    borderRight: `4px solid ${PRINT_STATUS_COLORS[g.id] || '#888'}`
                  }}>
                    {g.label} ({g.members.length})
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                      <tr style={{ background: '#f8f8f8' }}>
                        <th style={th}>#</th>
                        <th style={th}>الاسم</th>
                        <th style={th}>الرتبة</th>
                        <th style={th}>طبيعة العمل</th>
                        <th style={th}>التفاصيل</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.members.map((r, i) => (
                        <tr key={r.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                          <td style={td}>{i + 1}</td>
                          <td style={{ ...td, fontWeight: 600 }}>{r.name}</td>
                          <td style={{ ...td, color: '#666' }}>{r.rank || '—'}</td>
                          <td style={td}>{r.jobLabel}</td>
                          <td style={{ ...td, color: '#555' }}>{detailText(r.rec) || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </>
          ) : (
            <>
              {/* ملخص شهري */}
              {monthSummary && (
                <div style={{ display: 'flex', border: '1px solid #bbb', marginBottom: 14 }}>
                  {[
                    { label: 'متوسط الحضور', val: monthSummary.avgPct + '%' },
                    { label: 'أيام العمل',    val: monthSummary.workDays },
                    { label: 'إجمالي الكوادر',val: monthSummary.headcount },
                  ].map((k, i) => (
                    <div key={i} style={{
                      flex: 1, textAlign: 'center', padding: '8px',
                      borderLeft: i > 0 ? '1px solid #bbb' : 'none'
                    }}>
                      <div style={{ fontSize: 20, fontWeight: 800 }}>{k.val}</div>
                      <div style={{ fontSize: 11, color: '#555' }}>{k.label}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* جدول شهري */}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ background: '#f0f0f0' }}>
                    <th style={th}>الاسم</th>
                    <th style={th}>طبيعة العمل</th>
                    <th style={{ ...th, textAlign: 'center' }}>حضور</th>
                    <th style={{ ...th, textAlign: 'center' }}>غياب</th>
                    <th style={{ ...th, textAlign: 'center' }}>إجازة</th>
                    <th style={{ ...th, textAlign: 'center' }}>مكلَّف</th>
                    <th style={{ ...th, textAlign: 'center' }}>أخرى</th>
                    <th style={{ ...th, textAlign: 'center' }}>نسبة الحضور</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, i) => (
                    <tr key={r.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={td}>
                        <div style={{ fontWeight: 600 }}>{r.name}</div>
                        {r.rank && <div style={{ fontSize: 10, color: '#888' }}>{r.rank}</div>}
                      </td>
                      <td style={td}>{r.jobLabel}</td>
                      <td style={{ ...td, textAlign: 'center', fontWeight: 700, color: '#16a34a' }}>{r.present}</td>
                      <td style={{ ...td, textAlign: 'center', color: r.absent > 0 ? '#dc2626' : '#888' }}>{r.absent}</td>
                      <td style={{ ...td, textAlign: 'center', color: '#ea580c' }}>{r.leave}</td>
                      <td style={{ ...td, textAlign: 'center', color: '#6b7280' }}>{r.task}</td>
                      <td style={{ ...td, textAlign: 'center', color: '#6b7280' }}>{r.other}</td>
                      <td style={{ ...td, textAlign: 'center', fontWeight: 700,
                        color: r.pct >= 70 ? '#16a34a' : r.pct >= 50 ? '#ea580c' : '#dc2626' }}>
                        {r.pct}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}

      {/* Staff Record Modal */}
      {selStaff && (
        <StaffRecordModal
          staff={selStaff}
          statuses={statuses}
          jobTypes={jobTypes}
          onClose={() => setSelStaff(null)}
        />
      )}

      {/* Print CSS */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #pdf-layout, #pdf-layout * { visibility: visible; }
          #pdf-layout {
            display: block !important;
            visibility: visible !important;
            position: fixed;
            top: 0; right: 0;
            width: 100%;
            background: white;
            padding: 16px 20px;
            direction: rtl;
            font-family: Cairo, Arial, sans-serif;
          }
        }
      `}</style>
    </div>
  )
}

// ── أنماط خلايا الجدول للطباعة ───────────────────────────────────────────────
const th = {
  border: '1px solid #ccc', padding: '4px 8px',
  textAlign: 'right', fontWeight: 700, background: '#f0f0f0'
}
const td = {
  border: '1px solid #ddd', padding: '4px 8px', textAlign: 'right'
}

// ── مودال سجل حضور فرد ───────────────────────────────────────────────────────
function StaffRecordModal({ staff, statuses, jobTypes, onClose }) {
  const todayStr   = new Date().toISOString().split('T')[0]
  const thisMonth  = todayStr.slice(0, 7)
  const [y, mo]    = thisMonth.split('-').map(Number)
  const prevMonth  = mo === 1
    ? `${y - 1}-12`
    : `${y}-${String(mo - 1).padStart(2, '0')}`

  const [periodMode, setPeriodMode] = useState('current')
  const [customFrom, setCustomFrom] = useState(monthStart(thisMonth))
  const [customTo,   setCustomTo]   = useState(todayStr)
  const [records,    setRecords]    = useState([])
  const [loading,    setLoading]    = useState(false)

  const getRange = useCallback(() => {
    if (periodMode === 'current') return { from: monthStart(thisMonth), to: todayStr }
    if (periodMode === 'prev')    return { from: monthStart(prevMonth), to: monthEnd(prevMonth) }
    return { from: customFrom, to: customTo }
  }, [periodMode, customFrom, customTo])

  const load = useCallback(async () => {
    setLoading(true)
    const { from, to } = getRange()
    const dates = []
    const cur = new Date(from + 'T12:00:00')
    const end = new Date(to   + 'T12:00:00')
    while (cur <= end) {
      if (cur.getDay() !== 5) dates.push(cur.toISOString().split('T')[0])
      cur.setDate(cur.getDate() + 1)
    }
    try {
      const snaps = await Promise.all(dates.map(d => getDoc(doc(db, 'hrAttendance', d))))
      setRecords(dates.map((date, i) => ({
        date,
        rec: snaps[i].exists() ? (snaps[i].data()[staff.id] || null) : null
      })))
    } catch (e) { console.error(e) }
    setLoading(false)
  }, [getRange, staff.id])

  useEffect(() => { if (periodMode !== 'custom') load() }, [periodMode])

  // حفظ موضع الـ scroll عند الفتح واستعادته عند الإغلاق
  const savedScroll = useRef(window.scrollY)
  useEffect(() => {
    savedScroll.current = window.scrollY
    return () => { window.scrollTo({ top: savedScroll.current, behavior: 'instant' }) }
  }, [])

  const present = records.filter(r => r.rec?.statusId === 'present').length
  const absent  = records.filter(r => r.rec?.statusId === 'absent').length
  const leave   = records.filter(r => r.rec?.statusId === 'leave').length
  const unset   = records.filter(r => !r.rec).length
  const other   = records.length - present - absent - leave - unset

  const jt = jobTypes.find(j => j.id === staff.jobTypeId)
  const jc = COLOR_MAP[jt?.color] || COLOR_MAP.gray

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 680, maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}
           onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">
            <span className="modal-icon">📋</span>
            سجل الحضور — {staff.name}
          </h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body" style={{ overflowY: 'auto', flex: 1 }}>
          {/* معلومات الموظف */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14,
                        padding: '10px 14px', background: 'var(--surface2)', borderRadius: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{staff.name}</div>
              {staff.rank && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{staff.rank}</div>}
            </div>
            <span style={{ background: jc.bg, color: jc.text, fontSize: 12, padding: '3px 12px', borderRadius: 20, fontWeight: 500 }}>
              {jt?.label || '—'}
            </span>
          </div>

          {/* اختيار الفترة */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
            {[
              { id: 'current', label: 'الشهر الحالي' },
              { id: 'prev',    label: 'الشهر الماضي' },
              { id: 'custom',  label: 'فترة مخصصة'  },
            ].map(p => (
              <button key={p.id}
                className={`btn btn-sm ${periodMode === p.id ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setPeriodMode(p.id)}>
                {p.label}
              </button>
            ))}
            {periodMode === 'custom' && (
              <>
                <input type="date" className="field-input" style={{ width: 145 }}
                  value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>←</span>
                <input type="date" className="field-input" style={{ width: 145 }}
                  value={customTo} onChange={e => setCustomTo(e.target.value)} />
                <button className="btn btn-primary btn-sm" onClick={load}>🔍 عرض</button>
              </>
            )}
          </div>

          {loading && <div style={{ height: 80 }} className="skeleton" />}

          {!loading && records.length > 0 && (
            <>
              {/* إحصاءات مختصرة */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                {[
                  { label: 'إجمالي الأيام', val: records.length, color: 'var(--text)'         },
                  { label: 'حضور',           val: present,        color: 'var(--green)'        },
                  { label: 'غياب',           val: absent,         color: 'var(--red)'          },
                  { label: 'إجازة',          val: leave,          color: 'var(--orange)'       },
                  { label: 'أخرى',           val: other,          color: 'var(--blue)'         },
                  { label: 'لم يُسجَّل',     val: unset,          color: 'var(--text-muted)'   },
                ].filter(s => s.val > 0 || s.label === 'إجمالي الأيام').map(s => (
                  <div key={s.label} style={{
                    flex: 1, minWidth: 70, textAlign: 'center',
                    padding: '8px 6px', background: 'var(--surface2)', borderRadius: 8
                  }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.val}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* جدول التفاصيل */}
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>التاريخ</th>
                      <th>اليوم</th>
                      <th>الحالة</th>
                      <th>التفاصيل</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map(r => {
                      const d = new Date(r.date + 'T12:00:00')
                      return (
                        <tr key={r.date}>
                          <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{r.date}</td>
                          <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{DAY_AR[d.getDay()]}</td>
                          <td>
                            {r.rec?.statusId
                              ? <StatusBadge id={r.rec.statusId} statuses={statuses} />
                              : <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>—</span>
                            }
                          </td>
                          <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                            {detailText(r.rec) || '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {!loading && records.length === 0 && (
            <div className="empty-state">
              <div className="es-icon">📭</div>
              <div className="es-title">لا توجد بيانات في هذه الفترة</div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
