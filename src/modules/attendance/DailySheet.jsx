import { useState, useEffect, useCallback } from 'react'
import {
  collection, getDocs, doc, setDoc, getDoc, query, orderBy
} from 'firebase/firestore'
import { db } from '../../lib/firebase'
import {
  DEFAULT_STATUSES, DEFAULT_JOB_TYPES,
  LEAVE_TYPES, TASK_DURATION_TYPES,
  MISSION_TYPES, APPT_TYPES, PERMIT_TYPES,
  COLOR_MAP
} from './attendanceConstants'

// ── helpers ───────────────────────────────────────────────────────────────────
function today() {
  return new Date().toISOString().split('T')[0]
}
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}
function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000)
}

function StatusBadge({ statusId, statuses }) {
  const s = statuses.find(x => x.id === statusId)
  if (!s) return null
  const c = COLOR_MAP[s.color] || COLOR_MAP.gray
  return (
    <span style={{
      background: c.bg, color: c.text,
      fontSize: 12, padding: '3px 10px',
      borderRadius: 20, fontWeight: 500
    }}>{s.label}</span>
  )
}

// ── Detail panel per status ───────────────────────────────────────────────────
function DetailPanel({ statusId, detail, onChange }) {
  const f = (k) => (e) => onChange({ ...detail, [k]: e.target.value })
  const labelStyle = { fontSize: 12, color: 'var(--text-muted)', marginBottom: 3, display: 'block' }
  const inputStyle = {
    fontSize: 13, padding: '7px 10px', borderRadius: 8,
    border: '1px solid var(--border)', background: 'var(--surface)',
    color: 'var(--text)', width: '100%'
  }
  const grid2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }
  const grid3 = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }

  if (statusId === 'leave') return (
    <div>
      <div style={grid3}>
        <div>
          <label style={labelStyle}>نوع الإجازة</label>
          <select style={inputStyle} value={detail.leaveType||''} onChange={f('leaveType')}>
            <option value="">— اختر —</option>
            {LEAVE_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>تاريخ البداية</label>
          <input style={inputStyle} type="date" value={detail.startDate||''} onChange={f('startDate')} />
        </div>
        <div>
          <label style={labelStyle}>عدد الأيام</label>
          <input style={inputStyle} type="number" min="1" placeholder="0"
            value={detail.days||''} onChange={f('days')} />
        </div>
      </div>
      {detail.startDate && detail.days && (
        <div style={{
          marginTop: 8, fontSize: 12,
          color: 'var(--blue)', background: 'var(--blue-dim)',
          padding: '6px 10px', borderRadius: 8
        }}>
          📅 ينتهي في: {addDays(detail.startDate, Number(detail.days))} · يحسبها النظام تلقائياً للأيام القادمة
        </div>
      )}
    </div>
  )

  if (statusId === 'task') return (
    <div>
      <div style={grid3}>
        <div>
          <label style={labelStyle}>جهة التكليف</label>
          <input style={inputStyle} placeholder="أمن السجن، سجن الطائف..." 
            value={detail.taskPlace||''} onChange={f('taskPlace')} />
        </div>
        <div>
          <label style={labelStyle}>نوع المدة</label>
          <select style={inputStyle} value={detail.taskDurType||'open'} onChange={f('taskDurType')}>
            {TASK_DURATION_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>عدد الأيام</label>
          <input style={inputStyle} type="number" min="1"
            placeholder={detail.taskDurType === 'open' ? 'مفتوح' : '0'}
            disabled={detail.taskDurType === 'open'}
            value={detail.taskDays||''} onChange={f('taskDays')} />
        </div>
      </div>
      <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
        {detail.taskDurType === 'open'
          ? '⚠️ التكليف المفتوح يستمر تلقائياً حتى يُسجَّل حضور يدوي'
          : '📅 يحسب النظام تلقائياً الأيام القادمة'}
      </div>
    </div>
  )

  if (statusId === 'mission') return (
    <div style={grid2}>
      <div>
        <label style={labelStyle}>نوع المهمة</label>
        <select style={inputStyle} value={detail.missionType||''} onChange={f('missionType')}>
          <option value="">— اختر —</option>
          {MISSION_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </div>
      <div>
        <label style={labelStyle}>التفاصيل / الجهة</label>
        <input style={inputStyle} placeholder="اختياري" value={detail.missionNote||''} onChange={f('missionNote')} />
      </div>
    </div>
  )

  if (statusId === 'appt') return (
    <div style={grid2}>
      <div>
        <label style={labelStyle}>نوع الموعد</label>
        <select style={inputStyle} value={detail.apptType||''} onChange={f('apptType')}>
          <option value="">— اختر —</option>
          {APPT_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </div>
      <div>
        <label style={labelStyle}>ملاحظة</label>
        <input style={inputStyle} placeholder="اختياري" value={detail.apptNote||''} onChange={f('apptNote')} />
      </div>
    </div>
  )

  if (statusId === 'permit') return (
    <div style={grid2}>
      <div>
        <label style={labelStyle}>نوع الرخصة</label>
        <select style={inputStyle} value={detail.permitType||''} onChange={f('permitType')}>
          <option value="">— اختر —</option>
          {PERMIT_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </div>
      <div>
        <label style={labelStyle}>ملاحظة</label>
        <input style={inputStyle} placeholder="اختياري" value={detail.permitNote||''} onChange={f('permitNote')} />
      </div>
    </div>
  )

  if (statusId === 'sick') return (
    <div>
      <label style={labelStyle}>ملاحظة طبية</label>
      <input style={inputStyle} placeholder="اختياري" value={detail.sickNote||''} onChange={f('sickNote')} />
    </div>
  )

  if (statusId === 'death') return (
    <div>
      <label style={labelStyle}>التفاصيل</label>
      <input style={inputStyle} placeholder="اختياري" value={detail.deathNote||''} onChange={f('deathNote')} />
    </div>
  )

  if (statusId === 'absent') return (
    <div style={{ fontSize: 12, color: 'var(--red)', padding: '6px 0' }}>
      سيُسجَّل الفرد كغائب بدون مبرر.
    </div>
  )

  return null
}

// ── compute auto-status from previous open tasks/leaves ──────────────────────
function autoStatus(staffId, prevRecord) {
  if (!prevRecord) return null
  const pr = prevRecord[staffId]
  if (!pr) return null

  // Open task → carry forward
  if (pr.statusId === 'task' && pr.detail?.taskDurType === 'open') {
    return { statusId: 'task', detail: pr.detail, auto: true }
  }
  // Fixed leave still running
  if (pr.statusId === 'leave' && pr.detail?.startDate && pr.detail?.days) {
    const endDate = addDays(pr.detail.startDate, Number(pr.detail.days))
    if (endDate > today()) {
      const remaining = daysBetween(today(), endDate)
      return {
        statusId: 'leave',
        detail: { ...pr.detail, remaining },
        auto: true
      }
    }
  }
  // Fixed task still running
  if (pr.statusId === 'task' && pr.detail?.taskDurType === 'fixed'
      && pr.detail?.startDate && pr.detail?.taskDays) {
    const endDate = addDays(pr.detail.startDate, Number(pr.detail.taskDays))
    if (endDate > today()) {
      return { statusId: 'task', detail: pr.detail, auto: true }
    }
  }
  return null
}

// ── summary label for detail column ──────────────────────────────────────────
function detailSummary(statusId, detail, statuses) {
  if (!detail) return '—'
  if (statusId === 'leave') {
    const t = LEAVE_TYPES.find(x => x.id === detail.leaveType)?.label || ''
    const rem = detail.remaining
    if (rem != null) return `${t} · متبقي ${rem} يوم`
    if (detail.days) return `${t} · ${detail.days} يوم`
    return t
  }
  if (statusId === 'task') {
    const dur = detail.taskDurType === 'open' ? 'مفتوح' : `${detail.taskDays || ''} يوم`
    return `${detail.taskPlace || '—'} · ${dur}`
  }
  if (statusId === 'mission') {
    const t = MISSION_TYPES.find(x => x.id === detail.missionType)?.label || ''
    return [t, detail.missionNote].filter(Boolean).join(' · ')
  }
  if (statusId === 'appt') {
    return APPT_TYPES.find(x => x.id === detail.apptType)?.label || '—'
  }
  if (statusId === 'permit') {
    return PERMIT_TYPES.find(x => x.id === detail.permitType)?.label || '—'
  }
  if (statusId === 'sick')  return detail.sickNote  || '—'
  if (statusId === 'death') return detail.deathNote || '—'
  return '—'
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function DailySheet() {
  const [date,      setDate]      = useState(today())
  const [staff,     setStaff]     = useState([])
  const [statuses,  setStatuses]  = useState(DEFAULT_STATUSES)
  const [jobTypes,  setJobTypes]  = useState(DEFAULT_JOB_TYPES)
  const [records,   setRecords]   = useState({})   // staffId → {statusId,detail}
  const [prevRec,   setPrevRec]   = useState(null)
  const [expanded,  setExpanded]  = useState({})
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [filterJob, setFilterJob] = useState('')

  // ── Load staff + settings once ──────────────────────────────────────────────
  const loadStatic = useCallback(async () => {
    const [sSnap, stSnap, jSnap] = await Promise.all([
      getDocs(query(collection(db, 'hrStaff'), orderBy('name'))),
      getDocs(collection(db, 'attendanceStatuses')),
      getDocs(collection(db, 'hrJobTypes')),
    ])
    setStaff(sSnap.docs.map(d => ({ id: d.id, ...d.data() })))
    if (!stSnap.empty) setStatuses(stSnap.docs.map(d => ({ id: d.id, ...d.data() })))
    if (!jSnap.empty)  setJobTypes(jSnap.docs.map(d => ({ id: d.id, ...d.data() })))
  }, [])

  // ── Load records for selected date + previous day ───────────────────────────
  const loadRecords = useCallback(async (d) => {
    setLoading(true)
    try {
      const [cur, prev] = await Promise.all([
        getDoc(doc(db, 'hrAttendance', d)),
        getDoc(doc(db, 'hrAttendance', addDays(d, -1))),
      ])
      const curData  = cur.exists()  ? cur.data()  : {}
      const prevData = prev.exists() ? prev.data() : null

      // Merge: existing > auto-carry
      const merged = {}
      staff.forEach(s => {
        if (curData[s.id]) {
          merged[s.id] = curData[s.id]
        } else {
          const auto = autoStatus(s.id, prevData)
          if (auto) merged[s.id] = auto
        }
      })
      setRecords(merged)
      setPrevRec(prevData)
    } catch(e) { console.error(e) }
    setLoading(false)
  }, [staff])

  useEffect(() => { loadStatic() }, [loadStatic])
  useEffect(() => { if (staff.length) loadRecords(date) }, [date, staff, loadRecords])

  // ── Change status for one person ────────────────────────────────────────────
  const changeStatus = (staffId, statusId) => {
    const prev = records[staffId]
    // If switching to present from open task → clear auto
    const detail = (prev?.detail && prev.statusId === statusId) ? prev.detail : {}
    setRecords(r => ({ ...r, [staffId]: { statusId, detail, auto: false } }))
    // Auto-expand if has detail
    const s = statuses.find(x => x.id === statusId)
    if (s?.hasDetail) setExpanded(e => ({ ...e, [staffId]: true }))
    else setExpanded(e => ({ ...e, [staffId]: false }))
  }

  const changeDetail = (staffId, detail) => {
    setRecords(r => ({
      ...r,
      [staffId]: { ...r[staffId], detail, auto: false }
    }))
  }

  // ── Save ────────────────────────────────────────────────────────────────────
  const saveSheet = async () => {
    setSaving(true)
    try {
      await setDoc(doc(db, 'hrAttendance', date), {
        ...records,
        _savedAt: new Date().toISOString(),
        _date: date,
      })
      alert('✅ تم حفظ كشف الحضور')
    } catch(e) { console.error(e); alert('❌ خطأ في الحفظ') }
    setSaving(false)
  }

  // ── KPIs ────────────────────────────────────────────────────────────────────
  const kpiCounts = staff.reduce((acc, s) => {
    const r = records[s.id]
    const id = r?.statusId || 'unset'
    acc[id] = (acc[id] || 0) + 1
    return acc
  }, {})

  const jobLabel  = (id) => jobTypes.find(j => j.id === id)?.label || '—'
  const jobColor  = (id) => jobTypes.find(j => j.id === id)?.color || 'gray'

  const filtered = staff.filter(s =>
    !filterJob || s.jobTypeId === filterJob
  )

  const hasDetail = (sid) => statuses.find(x => x.id === sid)?.hasDetail

  // ── بيانات الطباعة ───────────────────────────────────────────────────────────
  const PRINT_STATUS_COLORS = {
    present: '#16a34a', absent: '#dc2626', leave: '#ea580c',
    task: '#6b7280', mission: '#2563eb', friday: '#7c3aed',
    death: '#374151', appt: '#0284c7', sick: '#d97706',
    permit: '#9333ea', unset: '#9ca3af',
  }

  const printStatusCounts = {}
  filtered.forEach(s => {
    const sid = records[s.id]?.statusId || 'unset'
    printStatusCounts[sid] = (printStatusCounts[sid] || 0) + 1
  })

  const printGroups = [
    ...statuses.map(st => ({
      id: st.id, label: st.label,
      members: filtered.filter(s => records[s.id]?.statusId === st.id)
    })).filter(g => g.members.length > 0),
    ...((() => {
      const unset = filtered.filter(s => !records[s.id]?.statusId)
      return unset.length ? [{ id: 'unset', label: 'لم يُسجَّل', members: unset }] : []
    })())
  ]

  return (
    <div>
      {/* Header row */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 12, flexWrap: 'wrap' }}>
        <div className="field">
          <label className="field-label">التاريخ</label>
          <input className="field-input" type="date" value={date}
            onChange={e => setDate(e.target.value)} style={{ width: 160 }} />
        </div>
        <div className="field">
          <label className="field-label">طبيعة العمل</label>
          <select className="field-input" style={{ width: 160 }}
            value={filterJob} onChange={e => setFilterJob(e.target.value)}>
            <option value="">الكل</option>
            {jobTypes.map(j => <option key={j.id} value={j.id}>{j.label}</option>)}
          </select>
        </div>
        <button className="btn btn-primary" style={{ marginRight: 'auto' }}
          onClick={saveSheet} disabled={saving}>
          {saving ? '⏳ جاري الحفظ...' : '💾 حفظ الكشف'}
        </button>
        {staff.length > 0 && (
          <button className="btn btn-ghost" onClick={() => window.print()}>
            🖨️ طباعة
          </button>
        )}
      </div>

      {/* KPI strip */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {[
          { id: 'present', label: 'حاضر',  color: 'var(--green)'  },
          { id: 'absent',  label: 'غائب',   color: 'var(--red)'    },
          { id: 'leave',   label: 'إجازة',  color: 'var(--orange)' },
          { id: 'task',    label: 'مكلَّف', color: 'var(--text-muted)' },
          { id: 'unset',   label: 'لم يُسجَّل', color: 'var(--text-dim)' },
        ].map(k => (
          <div key={k.id} className="card" style={{ padding: '8px 14px', flex: 1, minWidth: 90, textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 600, color: k.color }}>{kpiCounts[k.id] || 0}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Main table */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>⏳ جاري التحميل...</div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 36 }}>#</th>
                <th>الاسم</th>
                <th>طبيعة العمل</th>
                <th>الحالة</th>
                <th>التفاصيل</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, i) => {
                const rec    = records[s.id] || {}
                const sid    = rec.statusId || ''
                const detail = rec.detail   || {}
                const isAuto = rec.auto
                const isExp  = expanded[s.id]
                const jc     = COLOR_MAP[jobColor(s.jobTypeId)] || COLOR_MAP.gray
                return (
                  <>
                    <tr key={s.id}
                      style={{ cursor: hasDetail(sid) ? 'pointer' : 'default', background: isAuto ? 'var(--bg3)' : undefined }}
                      onClick={() => hasDetail(sid) && setExpanded(e => ({ ...e, [s.id]: !e[s.id] }))}
                    >
                      <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{i + 1}</td>
                      <td>
                        <div style={{ fontWeight: 500 }}>{s.name}</div>
                        {s.rank && <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{s.rank}</div>}
                      </td>
                      <td>
                        <span style={{
                          background: jc.bg, color: jc.text,
                          fontSize: 12, padding: '3px 10px',
                          borderRadius: 20, fontWeight: 500
                        }}>{jobLabel(s.jobTypeId)}</span>
                      </td>
                      <td onClick={e => e.stopPropagation()}>
                        <select
                          style={{
                            fontSize: 13, padding: '5px 10px',
                            borderRadius: 20,
                            border: '1px solid var(--border)',
                            background: 'var(--surface)',
                            color: 'var(--text)',
                          }}
                          value={sid}
                          onChange={e => changeStatus(s.id, e.target.value)}
                        >
                          <option value="">— اختر —</option>
                          {statuses.map(st => (
                            <option key={st.id} value={st.id}>{st.label}</option>
                          ))}
                        </select>
                        {isAuto && (
                          <span style={{ fontSize: 10, color: 'var(--blue)', marginRight: 6 }}>تلقائي</span>
                        )}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 200 }}>
                        {sid && hasDetail(sid)
                          ? <span>{detailSummary(sid, detail, statuses)} {hasDetail(sid) && <span style={{ color: 'var(--blue)', fontSize: 11 }}>{isExp ? '▲' : '▼'}</span>}</span>
                          : '—'}
                      </td>
                    </tr>

                    {/* Detail expansion row */}
                    {isExp && hasDetail(sid) && (
                      <tr key={s.id + '_detail'}>
                        <td colSpan={5} style={{ padding: '0 16px 14px', background: 'var(--surface2)' }}>
                          <div style={{ paddingTop: 10 }}>
                            <DetailPanel
                              statusId={sid}
                              detail={detail}
                              onChange={(d) => changeDetail(s.id, d)}
                            />
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ══ منطقة الطباعة ══ */}
      <div id="pdf-layout" style={{ display: 'none' }}>
        {/* ترويسة */}
        <div style={{ textAlign: 'center', marginBottom: 14, borderBottom: '2px solid #333', paddingBottom: 10 }}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>كشف الحضور اليومي</div>
          <div style={{ fontSize: 12, color: '#555', marginTop: 3 }}>
            {`التاريخ: ${date}`}
            {filterJob ? `  |  طبيعة العمل: ${jobLabel(filterJob)}` : ''}
            {`  |  إجمالي: ${filtered.length} فرد`}
          </div>
        </div>

        {/* ملخص الحالات */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 14, border: '1px solid #bbb' }}>
          <tbody>
            <tr>
              {statuses.map(st => (printStatusCounts[st.id] || 0) > 0 && (
                <td key={st.id} style={{
                  textAlign: 'center', padding: '6px 4px', border: '1px solid #bbb',
                  borderTop: `3px solid ${PRINT_STATUS_COLORS[st.id] || '#888'}`
                }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: PRINT_STATUS_COLORS[st.id] || '#333' }}>
                    {printStatusCounts[st.id]}
                  </div>
                  <div style={{ fontSize: 11 }}>{st.label}</div>
                </td>
              ))}
              {(printStatusCounts['unset'] || 0) > 0 && (
                <td style={{ textAlign: 'center', padding: '6px 4px', border: '1px solid #bbb', borderTop: '3px solid #9ca3af' }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#9ca3af' }}>{printStatusCounts['unset']}</div>
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
              fontWeight: 700, fontSize: 12, background: '#f0f0f0',
              padding: '4px 10px', marginBottom: 3,
              borderRight: `4px solid ${PRINT_STATUS_COLORS[g.id] || '#888'}`
            }}>
              {g.label} ({g.members.length})
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ background: '#f8f8f8' }}>
                  <th style={pTh}>#</th>
                  <th style={pTh}>الاسم</th>
                  <th style={pTh}>الرتبة</th>
                  <th style={pTh}>طبيعة العمل</th>
                </tr>
              </thead>
              <tbody>
                {g.members.map((s, i) => (
                  <tr key={s.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={pTd}>{i + 1}</td>
                    <td style={{ ...pTd, fontWeight: 600 }}>{s.name}</td>
                    <td style={{ ...pTd, color: '#666' }}>{s.rank || '—'}</td>
                    <td style={pTd}>{jobLabel(s.jobTypeId)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

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

const pTh = { border: '1px solid #ccc', padding: '4px 8px', textAlign: 'right', fontWeight: 700 }
const pTd = { border: '1px solid #ddd', padding: '4px 8px', textAlign: 'right' }
