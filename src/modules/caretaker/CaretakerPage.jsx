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
                          <th key={`n${di}`} style={{fontSize:10}}>عدد</th>
                          <th key={`h${di}`} style={{fontSize:10}}>ساعات</th>
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

      {tab === 'saved' && (
        <div>
          {loading ? (
            <div style={{ height: 120 }} className="skeleton" />
          ) : records.length === 0 ? (
            <div className="empty-state">
              <div className="es-icon">📭</div>
              <div className="es-title">لا توجد تقييمات محفوظة</div>
              <div className="es-sub">ابدأ بإدخال أول تقييم أسبوعي</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 12 }}>
              {[...records].sort((a,b) => (b.from||'') > (a.from||'') ? 1 : -1).map(r => {
                const ms = MASANDAT.find(m => r.center?.startsWith(m.id))
                const wRaw = r.center?.replace((ms?.id||'') + '_', '').replace(/_/g, ' ') || r.center
                const wL = isNaN(wRaw) ? wRaw : `جناح ${wRaw}`
                return (
                  <div key={r.id} className="card" style={{ borderRight: '3px solid var(--accent)' }}>
                    <div style={{ fontWeight: 800, marginBottom: 6 }}>
                      📋 {ms?.name || '—'} — {wL}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
                      الأسبوع: {r.from || '—'} ← {r.to || '—'}
                    </div>
                    {r.savedBy && (
                      <div style={{ fontSize: 11, color: 'var(--blue)', marginBottom: 8 }}>
                        💾 {r.savedBy}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-blue btn-sm" onClick={() => loadForEdit(r)}>✏️ تعديل</button>
                      {(isAdmin || hasPerm('caretaker_delete')) && (
                        <button className="btn btn-danger btn-sm" onClick={() => delRecord(r.id)}>🗑️ حذف</button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
