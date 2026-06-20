import { useState, useEffect, useCallback } from 'react'
import {
  collection, getDocs, doc, setDoc, deleteDoc
} from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../components/Toast'
import { MASANDAT, QA, QPROG, QDAYS } from '../../lib/constants'
import { EvalGuideButton } from '../../components/EvalGuideModal'

function weekNum(d) {
  const j = new Date(d.getFullYear(), 0, 1)
  return Math.ceil((((d - j) / 86400000) + j.getDay() + 1) / 7)
}

// returns the Sunday of the week containing `d`
function weekStart(d) {
  const day = new Date(d)
  day.setHours(12, 0, 0, 0)
  day.setDate(day.getDate() - day.getDay())
  return day
}

function toISO(d) { return d.toISOString().split('T')[0] }

// build list of all week-starts for a given year
function weeksOfYear(year) {
  const weeks = []
  const d = new Date(year, 0, 1)
  d.setDate(d.getDate() - d.getDay()) // go back to Sunday
  while (d.getFullYear() <= year || weeks.length === 0) {
    const from = new Date(d)
    const to = new Date(d); to.setDate(d.getDate() + 4)
    const wn = weekNum(new Date(d.getFullYear(), 0, 1) < from ? from : new Date(year, 0, 1))
    weeks.push({ from: toISO(from), to: toISO(to), label: `الأسبوع ${weekNum(from)} — ${from.getDate()}/${from.getMonth()+1} إلى ${to.getDate()}/${to.getMonth()+1}` })
    d.setDate(d.getDate() + 7)
    if (from.getFullYear() > year) break
  }
  return weeks.filter(w => {
    const fy = new Date(w.from).getFullYear()
    const ty = new Date(w.to).getFullYear()
    return fy === year || ty === year
  })
}

const initScores = () => QDAYS.map(() => QA.map(ax => ax.items.map(() => 0)))
const initPrograms = () => QPROG.map(name => ({ name, days: QDAYS.map(() => ({ n: 0, h: 0 })) }))
const initDayMeta = () => QDAYS.map(() => ({ vio: '', ben: '' }))

export default function CaretakerPage() {
  const { name, isAdmin, hasPerm } = useAuth()
  const toast = useToast()

  const [records,  setRecords]  = useState([])
  const [loading,  setLoading]  = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [editId,   setEditId]   = useState(null)
  const [tab,      setTab]      = useState('entry')

  const [selectedWeek, setSelectedWeek] = useState(() => toISO(weekStart(new Date())))
  const [viewRecord, setViewRecord] = useState(null)

  const [selM,  setSelM]  = useState(null)
  const [selW,  setSelW]  = useState(null)

  const [fromDate, setFromDate] = useState('')
  const [toDate,   setToDate]   = useState('')
  const [weekLabel, setWeekLabel] = useState('')

  const [scores,   setScores]   = useState(initScores)
  const [programs, setPrograms] = useState(initPrograms)
  const [dayMeta,  setDayMeta]  = useState(initDayMeta)
  const [general,  setGeneral]  = useState({ ben: '', incidents: '', notes: '' })
  const [activeDay, setActiveDay] = useState(0)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const snap = await getDocs(collection(db, 'qayyim'))
      setRecords(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (e) { toast('❌ ' + e.message, 'error') }
    setLoading(false)
  }, [toast])

  useEffect(() => { fetchAll() }, [fetchAll])

  const autoFillWeek = (from) => {
    if (!from) return
    const d = new Date(from + 'T12:00:00')
    const th = new Date(d); th.setDate(d.getDate() + 4)
    setToDate(th.toISOString().split('T')[0])
    setWeekLabel('الأسبوع ' + weekNum(d) + ' / ' + d.getFullYear())
  }

  const handleFromChange = (v) => { setFromDate(v); autoFillWeek(v) }

  const resetForm = () => {
    setSelM(null); setSelW(null)
    setFromDate(''); setToDate(''); setWeekLabel('')
    setScores(initScores()); setPrograms(initPrograms())
    setDayMeta(initDayMeta())
    setGeneral({ ben: '', incidents: '', notes: '' })
    setActiveDay(0); setEditId(null)
  }

  const handleScore = (di, ai, ii, val) => {
    setScores(prev => {
      const next = prev.map(d => d.map(a => [...a]))
      next[di][ai][ii] = val
      return next
    })
  }

  const isDayDone = (di) =>
    QA.every((ax, ai) => ax.items.every((_, ii) => scores[di][ai][ii] > 0))

  const centerId = selM !== null && selW !== null
    ? `${MASANDAT[selM].id}_${String(selW).replace(/\s/g, '_')}`
    : ''

  const save = async () => {
    if (!centerId || !fromDate) { toast('⚠️ اختر المساندة والجناح وحدد التاريخ', 'warn'); return }
    setSaving(true)
    const record = {
      center: centerId,
      from: fromDate, to: toDate,
      ben: +general.ben || 0,
      incidents: +general.incidents || 0,
      notes: general.notes,
      days: QDAYS.map((_, di) => ({
        day: QDAYS[di],
        violations: +dayMeta[di].vio || 0,
        beneficiaries: +dayMeta[di].ben || 0,
        axes: QA.map((ax, ai) => ({
          key: ax.key, label: ax.label,
          scores: scores[di][ai],
          total: scores[di][ai].reduce((a, b) => a + b, 0)
        }))
      })),
      programs: programs.map(p => ({ name: p.name, days: p.days })),
      savedBy: name, savedAt: new Date().toISOString()
    }
    try {
      const id = editId || `${fromDate}_${centerId}`
      await setDoc(doc(db, 'qayyim', id), record)
      toast('✅ تم حفظ تقييم القيّم')
      await fetchAll()
      resetForm()
      setTab('saved')
    } catch (e) { toast('❌ ' + e.message, 'error') }
    setSaving(false)
  }

  const loadForEdit = (r) => {
    setEditId(r.id)
    const mIdx = MASANDAT.findIndex(m => r.center?.startsWith(m.id))
    if (mIdx >= 0) {
      setSelM(mIdx)
      const wRaw = r.center.replace(MASANDAT[mIdx].id + '_', '').replace(/_/g, ' ')
      setSelW(isNaN(wRaw) ? wRaw : +wRaw)
    }
    setFromDate(r.from || ''); autoFillWeek(r.from || '')
    setGeneral({ ben: r.ben || '', incidents: r.incidents || '', notes: r.notes || '' })
    const newScores = initScores()
    r.days?.forEach((day, di) => {
      day.axes?.forEach((ax, ai) => {
        ax.scores?.forEach((v, ii) => { newScores[di][ai][ii] = v })
      })
    })
    setScores(newScores)
    const newMeta = initDayMeta()
    r.days?.forEach((day, di) => {
      newMeta[di] = { vio: day.violations || '', ben: day.beneficiaries || '' }
    })
    setDayMeta(newMeta)
    const newProg = initPrograms()
    r.programs?.forEach((p, pi) => {
      if (newProg[pi]) newProg[pi].days = p.days
    })
    setPrograms(newProg)
    setTab('entry'); setActiveDay(0)
    toast('✏️ تم تحميل البيانات للتعديل')
  }

  const delRecord = async (id) => {
    if (!isAdmin) { toast('❌ لا تملك صلاحية الحذف', 'error'); return }
    if (!confirm('حذف هذا التقييم نهائياً؟')) return
    try {
      await deleteDoc(doc(db, 'qayyim', id))
      toast('🗑️ تم الحذف')
      await fetchAll()
    } catch (e) { toast('❌ ' + e.message, 'error') }
  }

  const m = selM !== null ? MASANDAT[selM] : null
  const wLabel = selW !== null ? (isNaN(selW) ? selW : `جناح ${selW}`) : ''

  return (
    <div className="animate-in">
      <div className="page-header">
        <div className="page-title">
          <div className="icon" style={{ background: 'rgba(63,185,80,.15)' }}>📊</div>
          التقييم الأسبوعي للقيّمين
        </div>
        <EvalGuideButton type="qayyim" />
      </div>

      <div className="tabs">
        <button className={`tab-btn ${tab === 'entry' ? 'active' : ''}`} onClick={() => setTab('entry')}>
          📝 إدخال تقييم
        </button>
        <button className={`tab-btn ${tab === 'saved' ? 'active' : ''}`} onClick={() => setTab('saved')}>
          📋 التقييمات المحفوظة {records.length > 0 && <span className="badge badge-accent" style={{marginRight:4}}>{records.length}</span>}
        </button>
      </div>

      {tab === 'entry' && (
        <div>
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-title">الخطوة 1 — المساندة</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {MASANDAT.map((ms, i) => (
                <button key={i}
                  className={`wing-btn ${selM === i ? 'active' : ''}`}
                  onClick={() => { setSelM(i); setSelW(null) }}
                >{ms.name}</button>
              ))}
            </div>
          </div>

          {selM !== null && (
            <div className="card animate-in" style={{ marginBottom: 14 }}>
              <div className="card-title">الخطوة 2 — الجناح ({m.name})</div>
              <div className="wing-grid">
                {m.wings.map(w => {
                  const label = isNaN(w) ? w : `جناح ${w}`
                  const cid = `${m.id}_${String(w).replace(/\s/g,'_')}`
                  const done = records.some(r => r.center === cid)
                  return (
                    <button key={w}
                      className={`wing-btn ${done ? 'filled' : ''} ${String(selW) === String(w) ? 'active' : ''}`}
                      onClick={() => setSelW(w)}
                    >{label}</button>
                  )
                })}
              </div>
            </div>
          )}

          {selW !== null && (
            <div className="card animate-in" style={{ marginBottom: 14 }}>
              <div className="card-title">📅 {m.name} — {wLabel}</div>
              <div className="form-row fr-3" style={{ marginBottom: 14 }}>
                <div className="form-group">
                  <label>تاريخ البداية (الأحد)</label>
                  <input type="date" value={fromDate} onChange={e => handleFromChange(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>تاريخ النهاية (الخميس)</label>
                  <input readOnly value={toDate} />
                </div>
                <div className="form-group">
                  <label>الأسبوع</label>
                  <input readOnly value={weekLabel} />
                </div>
              </div>
              <div className="form-row fr-3">
                <div className="form-group">
                  <label>إجمالي المستفيدين</label>
                  <input type="number" min="0" value={general.ben}
                    onChange={e => setGeneral(g => ({...g, ben: e.target.value}))} placeholder="0" />
                </div>
                <div className="form-group">
                  <label>إجمالي الحوادث</label>
                  <input type="number" min="0" value={general.incidents}
                    onChange={e => setGeneral(g => ({...g, incidents: e.target.value}))} placeholder="0" />
                </div>
                <div className="form-group">
                  <label>ملاحظات عامة</label>
                  <input value={general.notes}
                    onChange={e => setGeneral(g => ({...g, notes: e.target.value}))} placeholder="ملاحظات..." />
                </div>
              </div>
            </div>
          )}

          {selW !== null && fromDate && (
            <div className="card animate-in" style={{ marginBottom: 14 }}>
              <div className="card-title">تقييم الأيام</div>

              <div className="day-tabs">
                {QDAYS.map((day, di) => {
                  const d = new Date(fromDate + 'T12:00:00')
                  d.setDate(d.getDate() + di)
                  return (
                    <button key={di}
                      className={`day-tab ${activeDay === di ? 'active' : ''} ${isDayDone(di) ? 'done' : ''}`}
                      onClick={() => setActiveDay(di)}
                    >
                      {day} {d.getDate()}/{d.getMonth()+1}
                    </button>
                  )
                })}
              </div>

              <div className="form-row fr-2" style={{ marginBottom: 14 }}>
                <div className="form-group">
                  <label>مخالفات اليوم</label>
                  <input type="number" min="0"
                    value={dayMeta[activeDay].vio}
                    onChange={e => setDayMeta(dm => dm.map((d,i) => i===activeDay ? {...d, vio: e.target.value} : d))}
                    placeholder="0" />
                </div>
                <div className="form-group">
                  <label>مستفيدو اليوم</label>
                  <input type="number" min="0"
                    value={dayMeta[activeDay].ben}
                    onChange={e => setDayMeta(dm => dm.map((d,i) => i===activeDay ? {...d, ben: e.target.value} : d))}
                    placeholder="0" />
                </div>
              </div>

              {QA.map((ax, ai) => (
                <div key={ai} className="axis-card" style={{ '--axis-color': ax.color }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div className="axis-label">{ax.label}</div>
                    <div className="axis-total">
                      {scores[activeDay][ai].reduce((a,b)=>a+b,0)} / {ax.items.length * 5}
                    </div>
                  </div>
                  {ax.items.map((item, ii) => (
                    <div key={ii} className="axis-item">
                      <div className="axis-item-label">
                        {item.label}
                        <div style={{ fontSize: 10.5, color: 'var(--text-dim)', marginTop: 2 }}>{item.hint}</div>
                      </div>
                      <div className="score-btns">
                        {[1,2,3,4,5].map(n => (
                          <button key={n}
                            className={`sb ${scores[activeDay][ai][ii] === n ? 'sel' : ''}`}
                            onClick={() => handleScore(activeDay, ai, ii, n)}
                            type="button"
                          >{n}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {selW !== null && fromDate && (
            <div className="card animate-in" style={{ marginBottom: 14 }}>
              <div className="card-title">📋 جدول البرامج والأنشطة</div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>البرنامج</th>
                      {QDAYS.map((day, di) => (
                        <th key={di} colSpan={2}>{day}</th>
                      ))}
                    </tr>
                    <tr>
                      <th></th>
                      {QDAYS.map((_, di) => (
                        <>
                          <th key={`n${di}`} style={{fontSize:10}}>عدد البرامج</th>
                          <th key={`h${di}`} style={{fontSize:10}}>الحضور</th>
                        </>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {programs.map((prog, pi) => (
                      <tr key={pi}>
                        <td style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{prog.name}</td>
                        {prog.days.map((day, di) => (
                          <>
                            <td key={`n${di}`}>
                              <input type="number" min="0" value={day.n || ''}
                                onChange={e => setPrograms(p => p.map((pp, i) =>
                                  i === pi ? { ...pp, days: pp.days.map((d,j) => j===di ? {...d, n: +e.target.value} : d) } : pp
                                ))}
                                style={{ width: 52, padding: '4px 6px', background: 'var(--surface3)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontFamily: 'Cairo', textAlign: 'center' }}
                                placeholder="0" />
                            </td>
                            <td key={`h${di}`}>
                              <input type="number" min="0" value={day.h || ''}
                                onChange={e => setPrograms(p => p.map((pp, i) =>
                                  i === pi ? { ...pp, days: pp.days.map((d,j) => j===di ? {...d, h: +e.target.value} : d) } : pp
                                ))}
                                style={{ width: 52, padding: '4px 6px', background: 'var(--surface3)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontFamily: 'Cairo', textAlign: 'center' }}
                                placeholder="0" />
                            </td>
                          </>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {selW !== null && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? '⏳ جاري الحفظ...' : '💾 حفظ التقييم الأسبوعي'}
              </button>
              <button className="btn btn-ghost" onClick={resetForm}>مسح البيانات</button>
            </div>
          )}
        </div>
      )}

      {tab === 'saved' && !viewRecord && (
        <SavedView
          records={records}
          loading={loading}
          selectedWeek={selectedWeek}
          setSelectedWeek={setSelectedWeek}
          onView={setViewRecord}
          onEdit={r => { loadForEdit(r) }}
          onDelete={delRecord}
          isAdmin={isAdmin}
          hasPerm={hasPerm}
        />
      )}

      {tab === 'saved' && viewRecord && (
        <RecordView
          record={viewRecord}
          onBack={() => setViewRecord(null)}
          onEdit={r => { loadForEdit(r); setViewRecord(null) }}
          onDelete={async r => { await delRecord(r.id); setViewRecord(null) }}
          isAdmin={isAdmin}
          hasPerm={hasPerm}
        />
      )}
    </div>
  )
}

// ─── Saved Evaluations View ──────────────────────────────────────────────────

function SavedView({ records, loading, selectedWeek, setSelectedWeek, onView, onEdit, onDelete, isAdmin, hasPerm }) {
  const currentWeekISO = toISO(weekStart(new Date()))

  // collect all years present in records + current year
  const yearsInData = [...new Set(records.map(r => r.from ? new Date(r.from).getFullYear() : null).filter(Boolean))]
  const currentYear = new Date().getFullYear()
  if (!yearsInData.includes(currentYear)) yearsInData.push(currentYear)
  yearsInData.sort((a, b) => b - a)

  const allWeeks = yearsInData.flatMap(y => weeksOfYear(y))
    .sort((a, b) => b.from > a.from ? 1 : -1)

  // check if a record belongs to a given week (Sunday of that week)
  const recordBelongsToWeek = (r, weekSunday) => {
    if (!r.from) return false
    const sun = new Date(weekSunday + 'T12:00:00')
    const thu = new Date(sun); thu.setDate(sun.getDate() + 6)
    const from = new Date(r.from + 'T12:00:00')
    return from >= sun && from <= thu
  }

  // build a set of week-Sundays that have at least one record
  const weeksWithData = new Set(
    records.flatMap(r => allWeeks.filter(w => recordBelongsToWeek(r, w.from)).map(w => w.from))
  )

  const weekRecords = selectedWeek === 'all'
    ? records
    : records.filter(r => recordBelongsToWeek(r, selectedWeek))
  const weekMap = {}
  weekRecords.forEach(r => { weekMap[r.center] = r })

  const selWeekObj = allWeeks.find(w => w.from === selectedWeek)

  return (
    <div>
      {/* Week selector */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">📅 اختر الأسبوع</div>
        <select
          value={selectedWeek}
          onChange={e => setSelectedWeek(e.target.value)}
          style={{
            width: '100%', padding: '10px 14px', borderRadius: 8,
            border: '1.5px solid var(--border)', background: 'var(--surface2)',
            color: 'var(--text)', fontFamily: 'Cairo', fontSize: 14, cursor: 'pointer'
          }}
        >
          <option value="all">📋 عرض الكل ({records.length} تقييم)</option>
          {allWeeks.map(w => (
            <option key={w.from} value={w.from}>
              {weeksWithData.has(w.from) ? '✅ ' : ''}{w.label}{w.from === currentWeekISO ? ' (الأسبوع الحالي)' : ''}
            </option>
          ))}
        </select>
        {selWeekObj && (
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
            من: {selectedWeek} — إلى: {selWeekObj.to}
          </div>
        )}
      </div>

      {loading ? (
        <div style={{ height: 120 }} className="skeleton" />
      ) : selectedWeek === 'all' ? (
        /* ── وضع عرض الكل ── */
        records.length === 0 ? (
          <div className="empty-state">
            <div className="es-icon">📭</div>
            <div className="es-title">لا توجد تقييمات محفوظة</div>
            <div className="es-sub">ابدأ بإدخال أول تقييم أسبوعي</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 10 }}>
            {[...records].sort((a,b) => (b.from||'') > (a.from||'') ? 1 : -1).map(r => {
              const ms = MASANDAT.find(m => r.center?.startsWith(m.id))
              const wRaw = r.center?.replace((ms?.id||'') + '_', '').replace(/_/g,' ') || r.center
              const wL = isNaN(wRaw) ? wRaw : `جناح ${wRaw}`
              const total = r.days?.reduce((s,d) => s + (d.axes?.reduce((ss,ax) => ss + (ax.scores?.reduce((a,b)=>a+b,0)||0), 0)||0), 0) || 0
              const maxScore = (r.days?.length || 5) * 60
              return (
                <div key={r.id} className="card" style={{ borderRight: '3px solid var(--green)' }}>
                  <div style={{ fontWeight: 800, marginBottom: 4 }}>✅ {ms?.name || '—'} — {wL}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                    📅 {r.from} ← {r.to}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--green)', fontWeight: 700, marginBottom: 8 }}>
                    {total} / {maxScore}
                  </div>
                  {r.savedBy && <div style={{ fontSize: 11, color: 'var(--blue)', marginBottom: 8 }}>💾 {r.savedBy}</div>}
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-blue btn-sm" style={{ flex: 1 }} onClick={() => onView(r)}>👁 عرض</button>
                    <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={() => onEdit(r)}>✏️ تعديل</button>
                    {(isAdmin || hasPerm('caretaker_delete')) && (
                      <button className="btn btn-danger btn-sm" onClick={() => onDelete(r.id)}>🗑</button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )
      ) : (
        <div>
          {MASANDAT.map((ms, mi) => {
            const registered = ms.wings.filter(w => {
              const cid = `${ms.id}_${String(w).replace(/\s/g, '_')}`
              return !!weekMap[cid]
            }).length
            return (
              <div key={mi} className="card" style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ fontWeight: 800, fontSize: 15 }}>🏢 {ms.name}</div>
                  <div style={{ fontSize: 12, color: registered === ms.wings.length ? 'var(--green)' : 'var(--text-muted)' }}>
                    {registered} / {ms.wings.length} مسجّل
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 8 }}>
                  {ms.wings.map(w => {
                    const cid = `${ms.id}_${String(w).replace(/\s/g, '_')}`
                    const rec = weekMap[cid]
                    const wLabel = isNaN(w) ? w : `جناح ${w}`
                    if (rec) {
                      const dayScores = rec.days?.map(d =>
                        d.axes?.reduce((sum, ax) => sum + (ax.scores?.reduce((a,b) => a+b, 0) || 0), 0) || 0
                      ) || []
                      const total = dayScores.reduce((a,b) => a+b, 0)
                      const maxScore = (rec.days?.length || 5) * 60
                      return (
                        <div key={w} style={{
                          padding: '10px 12px', borderRadius: 8,
                          border: '1.5px solid var(--green)',
                          background: 'rgba(63,185,80,.07)',
                          display: 'flex', flexDirection: 'column', gap: 6
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ fontWeight: 700, fontSize: 13 }}>✅ {wLabel}</div>
                            <div style={{ fontSize: 11, color: 'var(--green)', fontWeight: 700 }}>
                              {total}/{maxScore}
                            </div>
                          </div>
                          {rec.savedBy && (
                            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>💾 {rec.savedBy}</div>
                          )}
                          <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
                            <button className="btn btn-blue btn-sm" style={{ flex: 1, fontSize: 11 }} onClick={() => onView(rec)}>
                              👁 عرض
                            </button>
                            <button className="btn btn-ghost btn-sm" style={{ flex: 1, fontSize: 11 }} onClick={() => onEdit(rec)}>
                              ✏️ تعديل
                            </button>
                            {(isAdmin || hasPerm('caretaker_delete')) && (
                              <button className="btn btn-danger btn-sm" style={{ fontSize: 11 }} onClick={() => onDelete(rec.id)}>
                                🗑
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    } else {
                      return (
                        <div key={w} style={{
                          padding: '10px 12px', borderRadius: 8,
                          border: '1.5px dashed var(--border)',
                          background: 'var(--surface2)',
                          display: 'flex', alignItems: 'center', gap: 8,
                          color: 'var(--text-muted)'
                        }}>
                          <span style={{ fontSize: 16 }}>⬜</span>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>{wLabel}</div>
                            <div style={{ fontSize: 10, marginTop: 2 }}>لم يتم التسجيل</div>
                          </div>
                        </div>
                      )
                    }
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Record Detail View ──────────────────────────────────────────────────────


function RecordView({ record: r, onBack, onEdit, onDelete, isAdmin, hasPerm }) {
  const ms = MASANDAT.find(m => r.center?.startsWith(m.id))
  const wRaw = r.center?.replace((ms?.id || '') + '_', '').replace(/_/g, ' ') || r.center
  const wLabel = isNaN(wRaw) ? wRaw : `جناح ${wRaw}`
  const [activeDay, setActiveDay] = useState(0)

  return (
    <div className="animate-in">
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <button className="btn btn-ghost btn-sm" onClick={onBack}>← رجوع</button>
        <div style={{ fontWeight: 800, fontSize: 15 }}>
          📋 {ms?.name || '—'} — {wLabel}
        </div>
        <div style={{ marginRight: 'auto', display: 'flex', gap: 6 }}>
          <button className="btn btn-blue btn-sm" onClick={() => onEdit(r)}>✏️ تعديل</button>
          {(isAdmin || hasPerm('caretaker_delete')) && (
            <button className="btn btn-danger btn-sm" onClick={() => onDelete(r)}>🗑️ حذف</button>
          )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="form-row fr-3">
          <div><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>الأسبوع</div><div style={{ fontWeight: 700 }}>{r.from} ← {r.to}</div></div>
          <div><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>إجمالي المستفيدين</div><div style={{ fontWeight: 700 }}>{r.ben || 0}</div></div>
          <div><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>الحوادث</div><div style={{ fontWeight: 700 }}>{r.incidents || 0}</div></div>
        </div>
        {r.notes && <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>📝 {r.notes}</div>}
        {r.savedBy && <div style={{ marginTop: 6, fontSize: 11, color: 'var(--blue)' }}>💾 {r.savedBy}</div>}
      </div>

      <div className="day-tabs" style={{ marginBottom: 14 }}>
        {(r.days || []).map((day, di) => {
          const dayTotal = day.axes?.reduce((s, ax) => s + (ax.scores?.reduce((a,b)=>a+b,0)||0), 0) || 0
          return (
            <button key={di}
              className={`day-tab ${activeDay === di ? 'active' : ''} ${dayTotal > 0 ? 'done' : ''}`}
              onClick={() => setActiveDay(di)}
            >
              {day.day}
            </button>
          )
        })}
      </div>

      {r.days?.[activeDay] && (
        <div className="animate-in">
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <div className="card" style={{ flex: 1, padding: '10px 14px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>مخالفات اليوم</div>
              <div style={{ fontWeight: 800, fontSize: 18 }}>{r.days[activeDay].violations || 0}</div>
            </div>
            <div className="card" style={{ flex: 1, padding: '10px 14px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>مستفيدو اليوم</div>
              <div style={{ fontWeight: 800, fontSize: 18 }}>{r.days[activeDay].beneficiaries || 0}</div>
            </div>
            <div className="card" style={{ flex: 1, padding: '10px 14px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>مجموع اليوم</div>
              <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--green)' }}>
                {r.days[activeDay].axes?.reduce((s,ax)=>s+(ax.scores?.reduce((a,b)=>a+b,0)||0),0)||0}/60
              </div>
            </div>
          </div>

          {r.days[activeDay].axes?.map((ax, ai) => (
            <div key={ai} className="axis-card" style={{ '--axis-color': QA[ai]?.color || 'var(--accent)', marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div className="axis-label">{ax.label}</div>
                <div className="axis-total">{ax.scores?.reduce((a,b)=>a+b,0)||0} / {(ax.scores?.length||0)*5}</div>
              </div>
              {ax.scores?.map((score, ii) => (
                <div key={ii} className="axis-item">
                  <div className="axis-item-label">{QA[ai]?.items[ii]?.label || `البند ${ii+1}`}</div>
                  <div className="score-btns">
                    {[1,2,3,4,5].map(n => (
                      <button key={n} className={`sb ${score === n ? 'sel' : ''}`} disabled type="button">{n}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
