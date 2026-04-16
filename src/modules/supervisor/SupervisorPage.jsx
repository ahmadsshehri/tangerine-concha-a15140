import { useState, useEffect, useCallback } from 'react'
import {
  collection, query, where, getDocs,
  doc, setDoc, deleteDoc
} from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../components/Toast'
import { MASANDAT, AXES, DAR, MAR } from '../../lib/constants'

// ─── Helpers ──────────────────────────────────────────────────────────────────
function weekNum(d) {
  const j = new Date(d.getFullYear(), 0, 1)
  return Math.ceil((((d - j) / 86400000) + j.getDay() + 1) / 7)
}
function dateInfo(v) {
  if (!v) return { day: '', week: '', month: '' }
  const d = new Date(v + 'T12:00:00')
  return {
    day: DAR[d.getDay()],
    week: 'أسبوع ' + weekNum(d),
    month: MAR[d.getMonth()] + ' ' + d.getFullYear(),
  }
}

// ─── Score Button ──────────────────────────────────────────────────────────────
function ScoreBtn({ val, selected, onClick }) {
  return (
    <button
      className={`sb ${selected ? 'sel' : ''}`}
      onClick={onClick}
      type="button"
    >{val}</button>
  )
}

// ─── Axis Card ─────────────────────────────────────────────────────────────────
function AxisCard({ ax, ai, scores, onChange }) {
  const total = scores.reduce((s, v) => s + v, 0)
  return (
    <div className="axis-card" style={{ '--axis-color': ax.color }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div className="axis-label">{ax.label}</div>
        <div className="axis-total">{total} / 15</div>
      </div>
      {ax.items.map((item, ii) => (
        <div key={ii} className="axis-item">
          <div className="axis-item-label">{item}</div>
          <div className="score-btns">
            {[1,2,3,4,5].map(n => (
              <ScoreBtn key={n} val={n} selected={scores[ii] === n}
                onClick={() => onChange(ai, ii, n)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function SupervisorPage() {
  const { name, isAdmin, hasPerm } = useAuth()
  const toast = useToast()
  const today = new Date().toISOString().split('T')[0]

  const [date,    setDate]    = useState(today)
  const [selM,    setSelM]    = useState(null)
  const [selW,    setSelW]    = useState(null)
  const [saved,   setSaved]   = useState([])
  const [loading, setLoading] = useState(false)
  const [saving,  setSaving]  = useState(false)

  // Form state
  const [scores, setScores]   = useState(() => AXES.map(ax => ax.items.map(() => 0)))
  const [form,   setForm]     = useState({ ben: '', vio: '', obsAmni: '', obsFanni: '', obsBaramij: '' })

  const info = dateInfo(date)

  // ─ Fetch saved wings for current date
  const fetchSaved = useCallback(async (d) => {
    if (!d) return
    setLoading(true)
    try {
      const q = query(collection(db, 'wings'), where('date', '==', d))
      const snap = await getDocs(q)
      setSaved(snap.docs.map(d => d.data()))
    } catch (e) { toast('❌ ' + e.message, 'error') }
    setLoading(false)
  }, [toast])

  useEffect(() => { fetchSaved(date) }, [date, fetchSaved])

  // ─ Select masanda
  const pickMasanda = (idx) => {
    setSelM(idx); setSelW(null)
    resetForm()
  }

  // ─ Select wing + load existing
  const pickWing = (wing) => {
    setSelW(wing)
    const m = MASANDAT[selM]
    const ex = saved.find(s => s.masandaId === m.id && String(s.wing) === String(wing))
    if (ex) {
      setScores(AXES.map((ax, ai) => ax.items.map((_, ii) => ex.axes?.[ai]?.scores?.[ii] || 0)))
      setForm({
        ben: ex.beneficiaries || '', vio: ex.violations || '',
        obsAmni: ex.obs?.amni || '', obsFanni: ex.obs?.fanni || '', obsBaramij: ex.obs?.baramij || ''
      })
    } else {
      resetForm()
    }
  }

  const resetForm = () => {
    setScores(AXES.map(ax => ax.items.map(() => 0)))
    setForm({ ben: '', vio: '', obsAmni: '', obsFanni: '', obsBaramij: '' })
  }

  const handleScore = (ai, ii, val) => {
    setScores(prev => {
      const next = prev.map(r => [...r])
      next[ai][ii] = val
      return next
    })
  }

  const totalScore = scores.flat().reduce((a, b) => a + b, 0)

  // ─ Save
  const save = async () => {
    if (!date)         { toast('⚠️ حدد التاريخ', 'warn'); return }
    if (selM === null) { toast('⚠️ اختر المساندة', 'warn'); return }
    if (selW === null) { toast('⚠️ اختر الجناح', 'warn'); return }
    const m = MASANDAT[selM]
    const axes = AXES.map((ax, ai) => ({
      key: ax.key, label: ax.label,
      scores: scores[ai],
      total: scores[ai].reduce((a, b) => a + b, 0)
    }))
    const data = {
      masandaId: m.id, masandaName: m.name, wing: selW,
      beneficiaries: +form.ben || 0,
      violations: +form.vio || 0,
      axes, totalScore,
      obs: { amni: form.obsAmni, fanni: form.obsFanni, baramij: form.obsBaramij },
      date, savedBy: name, savedAt: new Date().toISOString()
    }
    setSaving(true)
    try {
      await setDoc(doc(db, 'wings', `${date}_${m.id}_${selW}`), data)
      toast(`✅ تم حفظ جناح ${selW} — ${m.name}`)
      await fetchSaved(date)
      setSelW(null); resetForm()
    } catch (e) { toast('❌ ' + e.message, 'error') }
    setSaving(false)
  }

  // ─ Delete
  const del = async (mid, wing) => {
    if (!isAdmin) { toast('❌ لا تملك صلاحية الحذف', 'error'); return }
    if (!confirm('حذف هذا الجناح نهائياً؟')) return
    try {
      await deleteDoc(doc(db, 'wings', `${date}_${mid}_${wing}`))
      toast('🗑️ تم الحذف')
      await fetchSaved(date)
    } catch (e) { toast('❌ ' + e.message, 'error') }
  }

  const m = selM !== null ? MASANDAT[selM] : null

  return (
    <div className="animate-in">
      <div className="page-header">
        <div className="page-title">
          <div className="icon" style={{ background: 'rgba(88,166,255,.15)' }}>🌙</div>
          التقييم المسائي للمشرفين
        </div>
      </div>

      {/* ─ Date Row */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="form-row fr-4">
          <div className="form-group">
            <label>التاريخ</label>
            <input type="date" value={date} onChange={e => { setDate(e.target.value); setSelM(null); setSelW(null) }} />
          </div>
          <div className="form-group">
            <label>اليوم</label>
            <input readOnly value={info.day} />
          </div>
          <div className="form-group">
            <label>الأسبوع</label>
            <input readOnly value={info.week} />
          </div>
          <div className="form-group">
            <label>الشهر</label>
            <input readOnly value={info.month} />
          </div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
          المشرف: <strong style={{ color: 'var(--accent)' }}>{name}</strong>
        </div>
      </div>

      {/* ─ Step 1: Masanda */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-title">الخطوة 1 — اختر المساندة</div>
        <div className="masanda-grid">
          {MASANDAT.map((ms, i) => {
            const doneCount = saved.filter(s => s.masandaId === ms.id).length
            return (
              <div
                key={i}
                className={`masanda-card ${selM === i ? 'active' : ''}`}
                onClick={() => pickMasanda(i)}
              >
                <div className="mc-name">{ms.name}</div>
                <div className="mc-sub">{ms.wings.length} أجنحة {doneCount > 0 && <span style={{ color: 'var(--green)' }}>✅ {doneCount}</span>}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ─ Step 2: Wing */}
      {selM !== null && (
        <div className="card animate-in" style={{ marginBottom: 14 }}>
          <div className="card-title">الخطوة 2 — اختر الجناح ({m.name})</div>
          <div className="wing-grid">
            {m.wings.map(w => {
              const done = saved.some(s => s.masandaId === m.id && String(s.wing) === String(w))
              return (
                <button
                  key={w}
                  className={`wing-btn ${done ? 'filled' : ''} ${String(selW) === String(w) ? 'active' : ''}`}
                  onClick={() => pickWing(w)}
                >
                  جناح {w}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ─ Step 3: Form */}
      {selW !== null && (
        <div className="card animate-in" style={{ marginBottom: 14 }}>
          <div className="card-title">📝 {m.name} — جناح {selW}</div>

          <div className="form-row fr-2" style={{ marginBottom: 16 }}>
            <div className="form-group">
              <label>عدد المستفيدين</label>
              <input type="number" min="0" value={form.ben}
                onChange={e => setForm(f => ({ ...f, ben: e.target.value }))} placeholder="0" />
            </div>
            <div className="form-group">
              <label>عدد المخالفات</label>
              <input type="number" min="0" value={form.vio}
                onChange={e => setForm(f => ({ ...f, vio: e.target.value }))} placeholder="0" />
            </div>
          </div>

          {AXES.map((ax, ai) => (
            <AxisCard key={ai} ax={ax} ai={ai} scores={scores[ai]} onChange={handleScore} />
          ))}

          <div className="form-group" style={{ marginBottom: 8 }}>
            <label>الإجمالي</label>
            <input readOnly value={totalScore ? `${totalScore} / 60` : ''} />
          </div>

          <div className="section-divider" />

          <div className="card-title">ملاحظات</div>
          <div className="form-row fr-3" style={{ marginBottom: 16 }}>
            <div className="form-group">
              <label>ملاحظات أمنية</label>
              <textarea value={form.obsAmni} onChange={e => setForm(f => ({ ...f, obsAmni: e.target.value }))} placeholder="اكتب أي ملاحظات أمنية..." />
            </div>
            <div className="form-group">
              <label>ملاحظات فنية</label>
              <textarea value={form.obsFanni} onChange={e => setForm(f => ({ ...f, obsFanni: e.target.value }))} placeholder="اكتب أي ملاحظات فنية..." />
            </div>
            <div className="form-group">
              <label>ملاحظات البرامج</label>
              <textarea value={form.obsBaramij} onChange={e => setForm(f => ({ ...f, obsBaramij: e.target.value }))} placeholder="ملاحظات البرامج والأنشطة..." />
            </div>
          </div>

          {(isAdmin || hasPerm('supervisor_entry')) && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? '⏳ جاري الحفظ...' : '💾 حفظ التقييم'}
              </button>
              <button className="btn btn-ghost" onClick={() => { setSelW(null); resetForm() }}>
                إلغاء
              </button>
            </div>
          )}
        </div>
      )}

      {/* ─ Saved Wings */}
      {saved.length > 0 && (
        <div className="card animate-in">
          <div className="card-title">✅ الأجنحة المُدخلة اليوم ({saved.length})</div>
          {loading ? (
            <div style={{ height: 40 }} className="skeleton" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {saved.map((w, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: 'var(--surface2)', border: '1px solid var(--border)',
                  borderRadius: 'var(--rs)', padding: '9px 14px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ color: 'var(--green)', fontSize: 14 }}>✅</span>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{w.masandaName} — جناح {w.wing}</span>
                    <span className="badge badge-accent">{w.totalScore} / 60</span>
                    {w.savedBy && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>— {w.savedBy}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-blue btn-xs"
                      onClick={() => { setSelM(MASANDAT.findIndex(ms => ms.id === w.masandaId)); pickWing(w.wing) }}>
                      تعديل
                    </button>
                    {(isAdmin || hasPerm('supervisor_delete')) && (
                      <button className="btn btn-danger btn-xs" onClick={() => del(w.masandaId, w.wing)}>
                        حذف
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
