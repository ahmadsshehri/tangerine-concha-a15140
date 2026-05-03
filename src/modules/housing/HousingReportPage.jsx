// src/modules/housing/HousingReportPage.jsx
// تقرير مشرف السكن اليومي

import { useState, useEffect, useCallback } from 'react'
import { collection, getDocs, doc, setDoc, deleteDoc, query, where } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../components/Toast'
import { MASANDAT, TODAY } from '../../lib/constants'

// ─── ثوابت ────────────────────────────────────────────────────────────────────
const ACTIVITY_TYPES = ['داخلي', 'خارجي']

const TASK_LABELS = [
  'حضور البيئة العلاجية',
  'الاجتماع مع القيّم ورؤساء اللجان',
  'الاطلاع على سجل الوقائع وتقارير اللجان',
  'القيام بجولة على السكن',
]

const OTHER_TASKS = [
  'القيام بجولة على السكن',
  'الاطلاع على سجل الوقائع',
  'الاطلاع على المخالفات وتطبيق المهام',
]

const EMPTY_TASK  = () => ({ done: true, reason: '' })
const EMPTY_OBS   = () => ({ amni: '', fanni: '', baramij: '' })
const EMPTY_ACT   = () => ({ wing: '', name: '', type: 'داخلي', beneficiaries: '', startTime: '', endTime: '', notes: '' })
const EMPTY_OTHER = () => ({ wing: '', tasks: OTHER_TASKS.map(() => ({ done: true, reason: '' })) })

function initForm() {
  return {
    wing:        '',
    date:        TODAY(),
    beneficiaries: '',
    violations:  '',
    dayIdea:     '',
    tasks:       TASK_LABELS.map(EMPTY_TASK),
    obs:         EMPTY_OBS(),
    generalScore: '',
    otherCenters: [],
    activities:  [],
  }
}

// ─── مكوّن تبديل تم / لم يتم ──────────────────────────────────────────────────
function DoneToggle({ value, onChange, size = 'normal' }) {
  const sm = size === 'small'
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {[true, false].map(v => (
        <button
          key={String(v)}
          type="button"
          onClick={() => onChange(v)}
          style={{
            padding: sm ? '3px 10px' : '5px 16px',
            borderRadius: 'var(--rs)',
            border: `1.5px solid ${value === v ? (v ? 'var(--green)' : 'var(--red)') : 'var(--border)'}`,
            background: value === v ? (v ? 'var(--green-dim)' : 'var(--red-dim)') : 'var(--surface2)',
            color: value === v ? (v ? 'var(--green)' : 'var(--red)') : 'var(--text-muted)',
            fontFamily: 'Cairo', fontSize: sm ? 11 : 12, fontWeight: 700,
            cursor: 'pointer', transition: 'all .15s',
          }}
        >
          {v ? 'تم' : 'لم يتم'}
        </button>
      ))}
    </div>
  )
}

// ─── جلب قائمة الأجنحة الكاملة ────────────────────────────────────────────────
function getAllWings() {
  const wings = []
  MASANDAT.forEach(m => {
    m.wings.forEach(w => {
      wings.push({ label: isNaN(w) ? w : `جناح ${w}`, value: `${m.id}__${w}`, masandaName: m.name })
    })
  })
  return wings
}
const ALL_WINGS = getAllWings()

function wingLabel(val) {
  if (!val) return ''
  const found = ALL_WINGS.find(w => w.value === val)
  return found ? `${found.masandaName} — ${found.label}` : val
}

// ─── نموذج الإدخال ────────────────────────────────────────────────────────────
function EntryTab() {
  const { name, isAdmin, hasPerm } = useAuth()
  const toast = useToast()
  const canWrite = isAdmin || hasPerm('housing_entry')

  const [form,   setForm]   = useState(initForm)
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState(null)
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(false)

  const fetchRecords = useCallback(async () => {
    setLoading(true)
    try {
      const snap = await getDocs(collection(db, 'housingReports'))
      const recs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      recs.sort((a, b) => (b.date || '') > (a.date || '') ? 1 : -1)
      setRecords(recs)
    } catch (e) { toast('❌ ' + e.message, 'error') }
    setLoading(false)
  }, [toast])

  useEffect(() => { fetchRecords() }, [fetchRecords])

  const f = upd => setForm(p => ({ ...p, ...upd }))

  // ── المهام الأساسية
  const setTask = (i, upd) => setForm(p => ({
    ...p, tasks: p.tasks.map((t, ti) => ti === i ? { ...t, ...upd } : t)
  }))

  // ── المراكز الأخرى
  const addOtherCenter = () => setForm(p => ({
    ...p, otherCenters: [...p.otherCenters, EMPTY_OTHER()]
  }))
  const removeOtherCenter = (i) => setForm(p => ({
    ...p, otherCenters: p.otherCenters.filter((_, ci) => ci !== i)
  }))
  const setOtherCenter = (i, upd) => setForm(p => ({
    ...p, otherCenters: p.otherCenters.map((c, ci) => ci === i ? { ...c, ...upd } : c)
  }))
  const setOtherTask = (ci, ti, upd) => setForm(p => ({
    ...p, otherCenters: p.otherCenters.map((c, cii) =>
      cii === ci ? { ...c, tasks: c.tasks.map((t, tii) => tii === ti ? { ...t, ...upd } : t) } : c
    )
  }))

  // ── الأنشطة
  const addActivity = () => setForm(p => ({ ...p, activities: [...p.activities, EMPTY_ACT()] }))
  const removeActivity = (i) => setForm(p => ({ ...p, activities: p.activities.filter((_, ai) => ai !== i) }))
  const setActivity = (i, upd) => setForm(p => ({
    ...p, activities: p.activities.map((a, ai) => ai === i ? { ...a, ...upd } : a)
  }))

  const resetForm = () => { setForm(initForm()); setEditId(null) }

  const loadForEdit = (r) => {
    setForm({
      wing:          r.wing || '',
      date:          r.date || TODAY(),
      beneficiaries: r.beneficiaries || '',
      violations:    r.violations || '',
      dayIdea:       r.dayIdea || '',
      tasks:         r.tasks || TASK_LABELS.map(EMPTY_TASK),
      obs:           r.obs || EMPTY_OBS(),
      generalScore:  r.generalScore || '',
      otherCenters:  r.otherCenters || [],
      activities:    r.activities || [],
    })
    setEditId(r.id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
    toast('✏️ تم تحميل البيانات للتعديل')
  }

  const save = async () => {
    if (!form.wing) { toast('⚠️ اختر الجناح / المركز الأساسي', 'warn'); return }
    if (!form.date) { toast('⚠️ حدد التاريخ', 'warn'); return }
    setSaving(true)
    const id = editId || `hr_${form.date}_${form.wing.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}`
    try {
      await setDoc(doc(db, 'housingReports', id), {
        ...form, id,
        savedBy: name,
        savedAt: new Date().toISOString(),
      })
      toast('✅ تم حفظ التقرير')
      resetForm()
      fetchRecords()
    } catch (e) { toast('❌ ' + e.message, 'error') }
    setSaving(false)
  }

  const del = async (id) => {
    if (!isAdmin && !hasPerm('housing_delete')) { toast('❌ لا تملك صلاحية الحذف', 'error'); return }
    if (!confirm('حذف هذا التقرير نهائياً؟')) return
    try {
      await deleteDoc(doc(db, 'housingReports', id))
      toast('🗑️ تم الحذف')
      fetchRecords()
    } catch (e) { toast('❌ ' + e.message, 'error') }
  }

  return (
    <div>
      {/* ─── القسم الأول: المركز الأساسي ────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-title">🏠 القسم الأول: المركز الأساسي</div>

        <div className="form-row fr-2" style={{ marginBottom: 12 }}>
          <div className="form-group">
            <label>اسم المركز (الجناح) *</label>
            <select value={form.wing} onChange={e => f({ wing: e.target.value })}>
              <option value="">— اختر الجناح —</option>
              {MASANDAT.map(m => (
                <optgroup key={m.id} label={m.name}>
                  {m.wings.map(w => (
                    <option key={w} value={`${m.id}__${w}`}>
                      {isNaN(w) ? w : `جناح ${w}`}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>اليوم والتاريخ</label>
            <input type="date" value={form.date} onChange={e => f({ date: e.target.value })} />
          </div>
        </div>

        <div className="form-row fr-2" style={{ marginBottom: 12 }}>
          <div className="form-group">
            <label>عدد المستفيدين</label>
            <input type="number" min="0" value={form.beneficiaries}
              onChange={e => f({ beneficiaries: e.target.value })} placeholder="0" />
          </div>
          <div className="form-group">
            <label>عدد المخالفات</label>
            <input type="number" min="0" value={form.violations}
              onChange={e => f({ violations: e.target.value })} placeholder="0" />
          </div>
        </div>

        <div className="form-group">
          <label>فكرة اليوم</label>
          <textarea value={form.dayIdea} onChange={e => f({ dayIdea: e.target.value })}
            placeholder="اكتب فكرة اليوم هنا..." />
        </div>
      </div>

      {/* ─── المهام اليومية ───────────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-title">✅ المهام اليومية لمشرف السكن</div>

        {TASK_LABELS.map((label, i) => (
          <div key={i} style={{
            background: 'var(--surface2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--rs)',
            padding: 12, marginBottom: 8
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: form.tasks[i]?.done === false ? 8 : 0 }}>
              <div style={{
                width: 26, height: 26, borderRadius: '50%',
                background: 'var(--accent-dim)', color: 'var(--accent)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 800, flexShrink: 0
              }}>{i + 1}</div>
              <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{label}</div>
              <DoneToggle
                value={form.tasks[i]?.done}
                onChange={v => setTask(i, { done: v, reason: v ? '' : form.tasks[i]?.reason })}
              />
            </div>
            {form.tasks[i]?.done === false && (
              <div className="form-group" style={{ marginTop: 8, paddingRight: 36 }}>
                <label>سبب عدم التنفيذ</label>
                <input type="text" value={form.tasks[i]?.reason || ''}
                  onChange={e => setTask(i, { reason: e.target.value })}
                  placeholder="اذكر السبب..." />
              </div>
            )}
          </div>
        ))}

        {/* الملاحظات المرصودة */}
        <div style={{ marginTop: 12 }}>
          <div style={{
            fontSize: 13, fontWeight: 700, marginBottom: 10,
            display: 'flex', alignItems: 'center', gap: 8
          }}>
            <div style={{
              width: 26, height: 26, borderRadius: '50%',
              background: 'var(--accent-dim)', color: 'var(--accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 800
            }}>5</div>
            الملاحظات المرصودة في الجناح
          </div>
          <div className="form-row fr-3">
            <div className="form-group">
              <label>🛡️ أمني</label>
              <textarea value={form.obs.amni}
                onChange={e => f({ obs: { ...form.obs, amni: e.target.value } })}
                placeholder="ملاحظات أمنية..." style={{ minHeight: 72 }} />
            </div>
            <div className="form-group">
              <label>🔧 فني</label>
              <textarea value={form.obs.fanni}
                onChange={e => f({ obs: { ...form.obs, fanni: e.target.value } })}
                placeholder="ملاحظات فنية..." style={{ minHeight: 72 }} />
            </div>
            <div className="form-group">
              <label>📚 برامج</label>
              <textarea value={form.obs.baramij}
                onChange={e => f({ obs: { ...form.obs, baramij: e.target.value } })}
                placeholder="ملاحظات البرامج..." style={{ minHeight: 72 }} />
            </div>
          </div>
        </div>

        {/* النسبة العامة */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          background: 'var(--green-dim)', borderRadius: 'var(--rs)',
          padding: '10px 14px', marginTop: 12,
          border: '1px solid rgba(5,122,85,.2)'
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--green)', flex: 1 }}>
            النسبة العامة للمركز (تقديريًا)
          </div>
          <input
            type="number" min="0" max="100"
            value={form.generalScore}
            onChange={e => f({ generalScore: e.target.value })}
            placeholder="0"
            style={{
              width: 80, textAlign: 'center', fontSize: 18, fontWeight: 700,
              padding: '6px 8px', borderRadius: 'var(--rs)',
              border: '1.5px solid var(--green)',
              background: '#fff', color: 'var(--green)', fontFamily: 'Cairo'
            }}
          />
          <span style={{ fontSize: 13, color: 'var(--green)', fontWeight: 700 }}>/ 100</span>
        </div>
      </div>

      {/* ─── المراكز الأخرى ───────────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div className="card-title" style={{ marginBottom: 0, borderBottom: 'none', paddingBottom: 0 }}>
            🏢 المراكز الأخرى التي تم التعقيب عليها
          </div>
          <button className="btn btn-outline btn-sm" onClick={addOtherCenter}>
            + إضافة مركز
          </button>
        </div>

        {form.otherCenters.length === 0 && (
          <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: 13 }}>
            لا توجد مراكز أخرى — اضغط "إضافة مركز" إن وجد
          </div>
        )}

        {form.otherCenters.map((center, ci) => (
          <div key={ci} style={{
            background: 'var(--surface2)', border: '1px solid var(--border)',
            borderRadius: 'var(--r)', padding: 14, marginBottom: 10
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{
                background: 'var(--accent-dim)', color: 'var(--accent)',
                borderRadius: 'var(--rs)', padding: '3px 10px',
                fontSize: 12, fontWeight: 700
              }}>المركز {ci + 1}</div>
              <div className="form-group" style={{ flex: 1, margin: 0 }}>
                <select value={center.wing} onChange={e => setOtherCenter(ci, { wing: e.target.value })}>
                  <option value="">— اختر الجناح —</option>
                  {MASANDAT.map(m => (
                    <optgroup key={m.id} label={m.name}>
                      {m.wings.map(w => (
                        <option key={w} value={`${m.id}__${w}`}>
                          {isNaN(w) ? w : `جناح ${w}`}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <button
                className="btn btn-danger btn-xs"
                onClick={() => removeOtherCenter(ci)}
              >✕</button>
            </div>

            {center.wing && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {OTHER_TASKS.map((taskLabel, ti) => (
                  <div key={ti} style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--rs)', padding: '10px 12px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: center.tasks[ti]?.done === false ? 8 : 0 }}>
                      <div style={{
                        width: 22, height: 22, borderRadius: '50%',
                        background: 'var(--accent-dim)', color: 'var(--accent)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, fontWeight: 800, flexShrink: 0
                      }}>{ti + 1}</div>
                      <div style={{ flex: 1, fontSize: 12 }}>{taskLabel}</div>
                      <DoneToggle
                        size="small"
                        value={center.tasks[ti]?.done}
                        onChange={v => setOtherTask(ci, ti, { done: v, reason: v ? '' : center.tasks[ti]?.reason })}
                      />
                    </div>
                    {center.tasks[ti]?.done === false && (
                      <div style={{ paddingRight: 32, marginTop: 6 }}>
                        <input
                          type="text"
                          value={center.tasks[ti]?.reason || ''}
                          onChange={e => setOtherTask(ci, ti, { reason: e.target.value })}
                          placeholder="اذكر السبب..."
                          style={{
                            width: '100%', padding: '6px 10px', fontSize: 12,
                            background: 'var(--surface2)', border: '1.5px solid var(--border)',
                            borderRadius: 'var(--rs)', color: 'var(--text)', fontFamily: 'Cairo', direction: 'rtl'
                          }}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ─── الأنشطة ──────────────────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div className="card-title" style={{ marginBottom: 0, borderBottom: 'none', paddingBottom: 0 }}>
            🎯 الأنشطة التي تم الإشراف عليها
          </div>
          <button className="btn btn-outline btn-sm" onClick={addActivity}>
            + إضافة نشاط
          </button>
        </div>

        {form.activities.length === 0 && (
          <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: 13 }}>
            لا توجد أنشطة — اضغط "إضافة نشاط" إن وجد
          </div>
        )}

        {form.activities.map((act, ai) => (
          <div key={ai} style={{
            background: 'var(--surface2)', border: '1px solid var(--border)',
            borderRadius: 'var(--r)', padding: 14, marginBottom: 10
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{
                background: 'var(--orange-dim)', color: 'var(--orange)',
                borderRadius: 'var(--rs)', padding: '3px 10px',
                fontSize: 12, fontWeight: 700
              }}>نشاط {ai + 1}</div>
              <button className="btn btn-danger btn-xs" onClick={() => removeActivity(ai)}>✕</button>
            </div>

            <div className="form-row fr-2" style={{ marginBottom: 10 }}>
              <div className="form-group">
                <label>الجناح</label>
                <select value={act.wing} onChange={e => setActivity(ai, { wing: e.target.value })}>
                  <option value="">— اختر الجناح —</option>
                  {MASANDAT.map(m => (
                    <optgroup key={m.id} label={m.name}>
                      {m.wings.map(w => (
                        <option key={w} value={`${m.id}__${w}`}>
                          {isNaN(w) ? w : `جناح ${w}`}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>اسم النشاط</label>
                <input type="text" value={act.name}
                  onChange={e => setActivity(ai, { name: e.target.value })}
                  placeholder="مثال: جلسة تأمل جماعية" />
              </div>
              <div className="form-group">
                <label>نوع النشاط</label>
                <select value={act.type} onChange={e => setActivity(ai, { type: e.target.value })}>
                  {ACTIVITY_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>عدد المستفيدين</label>
                <input type="number" min="0" value={act.beneficiaries}
                  onChange={e => setActivity(ai, { beneficiaries: e.target.value })} placeholder="0" />
              </div>
              <div className="form-group">
                <label>وقت البداية</label>
                <input type="time" value={act.startTime}
                  onChange={e => setActivity(ai, { startTime: e.target.value })} />
              </div>
              <div className="form-group">
                <label>وقت الانتهاء</label>
                <input type="time" value={act.endTime}
                  onChange={e => setActivity(ai, { endTime: e.target.value })} />
              </div>
            </div>
            <div className="form-group">
              <label>ملاحظات على النشاط (إن وجد)</label>
              <textarea value={act.notes}
                onChange={e => setActivity(ai, { notes: e.target.value })}
                placeholder="أي ملاحظات على سير النشاط..." style={{ minHeight: 56 }} />
            </div>
          </div>
        ))}
      </div>

      {/* ─── المشرف والحفظ ────────────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-title">👤 المشرف</div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'var(--surface2)', borderRadius: 'var(--rs)',
          padding: '10px 14px', border: '1px solid var(--border)'
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            background: 'var(--accent)', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, fontWeight: 800
          }}>{name?.charAt(0)}</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>يظهر تلقائيًا من الحساب</div>
          </div>
        </div>
      </div>

      {canWrite && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? '⏳ جاري الحفظ...' : '💾 حفظ التقرير'}
          </button>
          <button className="btn btn-ghost" onClick={resetForm}>مسح البيانات</button>
        </div>
      )}

      {/* ─── التقارير المحفوظة ────────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-title">📋 التقارير المحفوظة ({records.length})</div>
        {loading ? <div style={{ height: 120 }} className="skeleton" /> :
         records.length === 0 ? (
          <div className="empty-state" style={{ padding: 30 }}>
            <div className="es-icon">📭</div>
            <div className="es-title">لا توجد تقارير بعد</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 12 }}>
            {records.map(r => (
              <div key={r.id} className="card" style={{ borderRight: '3px solid var(--accent)' }}>
                <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 4 }}>
                  🏠 {wingLabel(r.wing)}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                  📅 {r.date}
                </div>
                <div style={{ fontSize: 11, color: 'var(--blue)', marginBottom: 8 }}>
                  👤 {r.savedBy}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  <span className="badge badge-blue">مستفيدون: {r.beneficiaries || 0}</span>
                  <span className="badge badge-orange">مخالفات: {r.violations || 0}</span>
                  {r.generalScore && <span className="badge badge-green">النسبة: {r.generalScore}%</span>}
                  {r.activities?.length > 0 && <span className="badge badge-purple">{r.activities.length} أنشطة</span>}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {canWrite && (
                    <button className="btn btn-blue btn-sm" onClick={() => loadForEdit(r)}>✏️ تعديل</button>
                  )}
                  {(isAdmin || hasPerm('housing_delete')) && (
                    <button className="btn btn-danger btn-sm" onClick={() => del(r.id)}>🗑️ حذف</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── تقرير أداء المشرفين ──────────────────────────────────────────────────────
function SupervisorsTab() {
  const toast = useToast()
  const [records,  setRecords]  = useState([])
  const [loading,  setLoading]  = useState(false)
  const [from,     setFrom]     = useState('')
  const [to,       setTo]       = useState('')
  const [selSuper, setSelSuper] = useState('') // '' = كل المشرفين، اسم = مشرف محدد
  const [loaded,   setLoaded]   = useState(false)

  const load = async () => {
    if (!from || !to) { toast('⚠️ حدد الفترة الزمنية', 'warn'); return }
    setLoading(true)
    try {
      const snap = await getDocs(collection(db, 'housingReports'))
      let recs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      recs = recs.filter(r => r.date >= from && r.date <= to)
      recs.sort((a, b) => (b.date || '') > (a.date || '') ? 1 : -1)
      setRecords(recs)
      setLoaded(true)
      setSelSuper('')
    } catch (e) { toast('❌ ' + e.message, 'error') }
    setLoading(false)
  }

  // قائمة المشرفين الفريدة
  const supervisors = [...new Set(records.map(r => r.savedBy).filter(Boolean))]

  // الفلترة
  const filtered = selSuper ? records.filter(r => r.savedBy === selSuper) : records

  // إحصاءات لكل مشرف
  const superStats = supervisors.map(sup => {
    const recs = records.filter(r => r.savedBy === sup)
    const totalActs = recs.reduce((s, r) => s + (r.activities?.length || 0), 0)
    const totalOther = recs.reduce((s, r) => s + (r.otherCenters?.length || 0), 0)
    const taskCompletion = recs.reduce((s, r) => {
      const tasks = r.tasks || []
      const done = tasks.filter(t => t.done !== false).length
      return s + (tasks.length ? done / tasks.length : 1)
    }, 0) / (recs.length || 1)
    const scores = recs.map(r => +r.generalScore).filter(s => s > 0)
    const avgScore = scores.length ? Math.round(scores.reduce((a,b)=>a+b,0)/scores.length) : null
    return { sup, recs, totalActs, totalOther, taskCompletion, avgScore }
  }).sort((a, b) => b.recs.length - a.recs.length)

  const ScoreChip = ({ pct }) => {
    const c = pct >= 80 ? { bg: 'var(--green-dim)', color: 'var(--green)' }
              : pct >= 60 ? { bg: 'var(--orange-dim)', color: 'var(--orange)' }
              : { bg: 'var(--red-dim)', color: 'var(--red)' }
    return (
      <span style={{
        padding: '2px 10px', borderRadius: 20,
        fontSize: 12, fontWeight: 800,
        background: c.bg, color: c.color
      }}>{pct}%</span>
    )
  }

  // تفاصيل مشرف محدد
  const selRecs = selSuper ? records.filter(r => r.savedBy === selSuper) : []

  return (
    <div>
      {/* فلاتر */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">🔍 فلاتر البحث</div>
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
            {loading ? '⏳ جاري التحميل...' : '🔍 عرض'}
          </button>
        </div>
      </div>

      {loading && <div style={{ height: 200 }} className="skeleton" />}

      {!loaded && !loading && (
        <div className="empty-state">
          <div className="es-icon">📊</div>
          <div className="es-title">اختر الفترة الزمنية وابدأ</div>
        </div>
      )}

      {loaded && !loading && records.length === 0 && (
        <div className="empty-state">
          <div className="es-icon">📭</div>
          <div className="es-title">لا توجد بيانات في هذه الفترة</div>
        </div>
      )}

      {loaded && !loading && records.length > 0 && (
        <>
          {/* إحصاءات عامة */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 16 }}>
            {[
              { label: 'إجمالي التقارير',   value: records.length, icon: '📋', color: 'var(--accent)' },
              { label: 'مشرفون نشطون',      value: supervisors.length, icon: '👤', color: 'var(--blue)' },
              { label: 'إجمالي الأنشطة',    value: records.reduce((s,r)=>s+(r.activities?.length||0),0), icon: '🎯', color: 'var(--orange)' },
              { label: 'مراكز تعقيب',       value: records.reduce((s,r)=>s+(r.otherCenters?.length||0),0), icon: '🏢', color: 'var(--green)' },
            ].map((s, i) => (
              <div key={i} className="stat-card" style={{ '--card-accent': s.color }}>
                <div className="stat-icon">{s.icon}</div>
                <div className="stat-value">{s.value}</div>
                <div className="stat-label">{s.label}</div>
              </div>
            ))}
          </div>

          {/* اختيار مشرف */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">👥 اختر مشرفًا لعرض تفاصيل أدائه</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                className={`wing-btn ${selSuper === '' ? 'active' : ''}`}
                onClick={() => setSelSuper('')}
              >كل المشرفين</button>
              {supervisors.map(sup => (
                <button
                  key={sup}
                  className={`wing-btn ${selSuper === sup ? 'active' : ''}`}
                  onClick={() => setSelSuper(sup)}
                >
                  {sup}
                </button>
              ))}
            </div>
          </div>

          {/* بطاقات المشرفين (عرض كلي) */}
          {selSuper === '' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
              {superStats.map((s, i) => (
                <div key={i} className="card" style={{ borderRight: `3px solid var(--accent)` }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 38, height: 38, borderRadius: '50%',
                        background: 'var(--accent)', color: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 16, fontWeight: 800
                      }}>{s.sup.charAt(0)}</div>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 14 }}>{s.sup}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>مشرف سكن</div>
                      </div>
                    </div>
                    <button className="btn btn-blue btn-sm" onClick={() => setSelSuper(s.sup)}>
                      📊 عرض التفاصيل
                    </button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
                    {[
                      { label: 'تقارير', value: s.recs.length, icon: '📋', color: 'var(--accent)' },
                      { label: 'أنشطة', value: s.totalActs, icon: '🎯', color: 'var(--orange)' },
                      { label: 'تعقيبات', value: s.totalOther, icon: '🏢', color: 'var(--blue)' },
                      { label: 'إنجاز المهام', value: `${Math.round(s.taskCompletion * 100)}%`, icon: '✅', color: 'var(--green)' },
                    ].map((st, si) => (
                      <div key={si} style={{
                        background: 'var(--surface2)', borderRadius: 'var(--rs)',
                        padding: '10px', textAlign: 'center'
                      }}>
                        <div style={{ fontSize: 18 }}>{st.icon}</div>
                        <div style={{ fontSize: 18, fontWeight: 900, color: st.color }}>{st.value}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{st.label}</div>
                      </div>
                    ))}
                  </div>
                  {s.avgScore !== null && (
                    <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>متوسط النسبة:</span>
                      <ScoreChip pct={s.avgScore} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* تفاصيل مشرف محدد */}
          {selSuper && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => setSelSuper('')}
                >← رجوع</button>
                <div style={{ fontWeight: 800, fontSize: 16 }}>
                  تفاصيل أداء: {selSuper}
                </div>
              </div>

              {/* إحصاءاته */}
              {(() => {
                const s = superStats.find(x => x.sup === selSuper)
                if (!s) return null
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 16 }}>
                    {[
                      { label: 'تقارير', value: s.recs.length, icon: '📋', color: 'var(--accent)' },
                      { label: 'أنشطة', value: s.totalActs, icon: '🎯', color: 'var(--orange)' },
                      { label: 'تعقيبات', value: s.totalOther, icon: '🏢', color: 'var(--blue)' },
                      { label: 'إنجاز المهام', value: `${Math.round(s.taskCompletion * 100)}%`, icon: '✅', color: 'var(--green)' },
                    ].map((st, si) => (
                      <div key={si} className="stat-card" style={{ '--card-accent': st.color }}>
                        <div className="stat-icon">{st.icon}</div>
                        <div className="stat-value">{st.value}</div>
                        <div className="stat-label">{st.label}</div>
                      </div>
                    ))}
                  </div>
                )
              })()}

              {/* تفاصيل كل تقرير */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {selRecs.map(r => (
                  <ReportDetailCard key={r.id} r={r} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── بطاقة تفاصيل تقرير واحد ────────────────────────────────────────────────
function ReportDetailCard({ r }) {
  const [expanded, setExpanded] = useState(false)
  const tasksDone = (r.tasks || []).filter(t => t.done !== false).length
  const tasksTotal = (r.tasks || []).length

  return (
    <div className="card" style={{ borderRight: '3px solid var(--accent)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 14 }}>🏠 {wingLabel(r.wing)}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>📅 {r.date}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="badge badge-blue">مستفيدون: {r.beneficiaries || 0}</span>
          <span className="badge badge-orange">مخالفات: {r.violations || 0}</span>
          {r.generalScore && <span className="badge badge-green">{r.generalScore}%</span>}
          <button className="btn btn-outline btn-sm" onClick={() => setExpanded(v => !v)}>
            {expanded ? '▲ إخفاء' : '▼ التفاصيل'}
          </button>
        </div>
      </div>

      {/* شريط المهام */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: expanded ? 12 : 0 }}>
        <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ height: '100%', background: 'var(--green)', width: `${tasksTotal ? (tasksDone/tasksTotal)*100 : 0}%`, borderRadius: 3 }} />
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          مهام: {tasksDone}/{tasksTotal}
        </span>
      </div>

      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          {/* المهام */}
          {r.tasks?.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', marginBottom: 8 }}>✅ المهام</div>
              {r.tasks.map((t, ti) => (
                <div key={ti} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 5,
                  fontSize: 12
                }}>
                  <span style={{ color: t.done !== false ? 'var(--green)' : 'var(--red)', flexShrink: 0 }}>
                    {t.done !== false ? '✅' : '❌'}
                  </span>
                  <div>
                    <span>{TASK_LABELS[ti]}</span>
                    {t.done === false && t.reason && (
                      <span style={{ color: 'var(--text-muted)', fontSize: 11, marginRight: 6 }}>
                        ({t.reason})
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* الملاحظات */}
          {(r.obs?.amni || r.obs?.fanni || r.obs?.baramij) && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', marginBottom: 8 }}>📝 الملاحظات المرصودة</div>
              {r.obs?.amni && (
                <div style={{ background: 'var(--red-dim)', borderRadius: 'var(--rs)', padding: '8px 12px', marginBottom: 6, fontSize: 12 }}>
                  <span style={{ fontWeight: 700, color: 'var(--red)' }}>🛡️ أمني: </span>{r.obs.amni}
                </div>
              )}
              {r.obs?.fanni && (
                <div style={{ background: 'var(--orange-dim)', borderRadius: 'var(--rs)', padding: '8px 12px', marginBottom: 6, fontSize: 12 }}>
                  <span style={{ fontWeight: 700, color: 'var(--orange)' }}>🔧 فني: </span>{r.obs.fanni}
                </div>
              )}
              {r.obs?.baramij && (
                <div style={{ background: 'var(--blue-dim)', borderRadius: 'var(--rs)', padding: '8px 12px', marginBottom: 6, fontSize: 12 }}>
                  <span style={{ fontWeight: 700, color: 'var(--blue)' }}>📚 برامج: </span>{r.obs.baramij}
                </div>
              )}
            </div>
          )}

          {/* الأنشطة */}
          {r.activities?.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', marginBottom: 8 }}>🎯 الأنشطة ({r.activities.length})</div>
              {r.activities.map((act, ai) => (
                <div key={ai} style={{
                  background: 'var(--surface2)', borderRadius: 'var(--rs)',
                  padding: '8px 12px', marginBottom: 6, fontSize: 12,
                  border: '1px solid var(--border)'
                }}>
                  <div style={{ fontWeight: 700, marginBottom: 3 }}>
                    {act.name || 'نشاط بدون اسم'}
                    <span className="badge badge-accent" style={{ marginRight: 6, fontSize: 10 }}>{act.type}</span>
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                    📍 {wingLabel(act.wing)} | 👥 {act.beneficiaries || 0} مستفيد
                    {act.startTime && ` | ⏰ ${act.startTime}${act.endTime ? ` - ${act.endTime}` : ''}`}
                  </div>
                  {act.notes && <div style={{ marginTop: 4, color: 'var(--text-muted)' }}>{act.notes}</div>}
                </div>
              ))}
            </div>
          )}

          {/* المراكز الأخرى */}
          {r.otherCenters?.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', marginBottom: 8 }}>🏢 المراكز التي تم التعقيب عليها ({r.otherCenters.length})</div>
              {r.otherCenters.map((c, ci) => (
                <div key={ci} style={{
                  background: 'var(--surface2)', borderRadius: 'var(--rs)',
                  padding: '8px 12px', marginBottom: 6,
                  border: '1px solid var(--border)', fontSize: 12
                }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>{wingLabel(c.wing)}</div>
                  {c.tasks?.map((t, ti) => (
                    <div key={ti} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <span style={{ color: t.done !== false ? 'var(--green)' : 'var(--red)' }}>
                        {t.done !== false ? '✅' : '❌'}
                      </span>
                      <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{OTHER_TASKS[ti]}</span>
                      {t.done === false && t.reason && (
                        <span style={{ color: 'var(--text-dim)', fontSize: 10 }}>({t.reason})</span>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* فكرة اليوم */}
          {r.dayIdea && (
            <div style={{
              background: 'var(--accent-dim)', borderRadius: 'var(--rs)',
              padding: '8px 12px', fontSize: 12, borderRight: '3px solid var(--accent)'
            }}>
              <span style={{ fontWeight: 700, color: 'var(--accent)' }}>💡 فكرة اليوم: </span>
              {r.dayIdea}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── الصفحة الرئيسية ──────────────────────────────────────────────────────────
export default function HousingReportPage() {
  const [tab, setTab] = useState('entry')

  return (
    <div className="animate-in">
      <div className="page-header">
        <div className="page-title">
          <div className="icon" style={{ background: 'rgba(5,122,85,.12)' }}>🏠</div>
          تقرير مشرف السكن
        </div>
      </div>

      <div className="tabs">
        <button
          className={`tab-btn ${tab === 'entry' ? 'active' : ''}`}
          onClick={() => setTab('entry')}
        >📝 إدخال تقرير</button>
        <button
          className={`tab-btn ${tab === 'supervisors' ? 'active' : ''}`}
          onClick={() => setTab('supervisors')}
        >👥 أداء المشرفين</button>
      </div>

      {tab === 'entry'       && <EntryTab />}
      {tab === 'supervisors' && <SupervisorsTab />}
    </div>
  )
}
