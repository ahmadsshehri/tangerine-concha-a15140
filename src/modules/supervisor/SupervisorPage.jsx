import { useState, useEffect, useCallback } from 'react'
import {
  collection, query, where, getDocs,
  doc, setDoc, deleteDoc
} from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../components/Toast'
import { MASANDAT, AXES, DAR, MAR } from '../../lib/constants'
import { EvalGuideButton } from '../../components/EvalGuideModal'

// ─── Helpers (نفس الكود الأصلي) ──────────────────────────────────────────────
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

function ScoreBtn({ val, selected, onClick }) {
  return (
    <button className={`sb ${selected ? 'sel' : ''}`} onClick={onClick} type="button">{val}</button>
  )
}

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

export default function SupervisorPage() {
  const { name, isAdmin, hasPerm } = useAuth()
  const toast = useToast()
  const today = new Date().toISOString().split('T')[0]

  const [date,    setDate]    = useState(today)
  const [selR,    setSelR]    = useState(1)
  const [selM,    setSelM]    = useState(null)
  const [selW,    setSelW]    = useState(null)
  const [saved,   setSaved]   = useState([])
  const [loading, setLoading] = useState(false)
  const [saving,  setSaving]  = useState(false)

  // ─── إضافة متغير حالة لاختيار الجولة عند التصدير ────────────────────────────
  const [exportRound, setExportRound] = useState(1)

  const [scores, setScores]   = useState(() => AXES.map(ax => ax.items.map(() => 0)))
  const [form,   setForm]     = useState({ ben: '', vio: '', obsAmni: '', obsFanni: '', obsBaramij: '' })

  const info = dateInfo(date)

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

  const pickMasanda = (idx) => {
    setSelM(idx); setSelW(null)
    resetForm()
  }

  const pickWing = (wing) => {
    setSelW(wing)
    const m = MASANDAT[selM]
    const ex = saved.find(s => s.masandaId === m.id && String(s.wing) === String(wing) && (s.round || 1) === selR)
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
      round: selR,
      beneficiaries: +form.ben || 0,
      violations: +form.vio || 0,
      axes, totalScore,
      obs: { amni: form.obsAmni, fanni: form.obsFanni, baramij: form.obsBaramij },
      date, savedBy: name, savedAt: new Date().toISOString()
    }
    setSaving(true)
    try {
      await setDoc(doc(db, 'wings', `${date}_${m.id}_${selW}_r${selR}`), data)
      toast(`✅ تم حفظ جناح ${selW} — ${m.name}`)
      await fetchSaved(date)
      setSelW(null); resetForm()
    } catch (e) { toast('❌ ' + e.message, 'error') }
    setSaving(false)
  }

  const del = async (mid, wing, round) => {
    if (!isAdmin) { toast('❌ لا تملك صلاحية الحذف', 'error'); return }
    if (!confirm('حذف هذا الجناح نهائياً؟')) return
    try {
      const docId = round ? `${date}_${mid}_${wing}_r${round}` : `${date}_${mid}_${wing}`
      await deleteDoc(doc(db, 'wings', docId))
      toast('🗑️ تم الحذف')
      await fetchSaved(date)
    } catch (e) { toast('❌ ' + e.message, 'error') }
  }

  // ─── دالة تصدير PDF جديدة تعتمد على exportRound ─────────────────────────────
  const handleExportPDF = () => {
    // تصفية الأجنحة حسب الجولة المختارة
    const roundsToExport = saved.filter(s => (s.round || 1) === exportRound)
    if (roundsToExport.length === 0) {
      toast(`⚠️ لا توجد بيانات للجولة ${exportRound} في هذا التاريخ`, 'warn')
      return
    }

    // هنا يمكنك استدعاء مكتبة التصدير الفعلية (مثل jsPDF, html2canvas)
    // مثال توضيحي:
    console.log(`تصدير PDF للجولة ${exportRound}`, roundsToExport)
    toast(`📄 جارٍ تصدير الجولة ${exportRound}...`)

    /* 
    // مثال باستخدام jsPDF و html2canvas (ستحتاج لتثبيتهما)
    import jsPDF from 'jspdf'
    import html2canvas from 'html2canvas'
    const input = document.getElementById('pdf-content') // عنصر يحتوي على البيانات
    html2canvas(input).then((canvas) => {
      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF('p', 'mm', 'a4')
      pdf.addImage(imgData, 'PNG', 0, 0)
      pdf.save(`تقييم_${date}_جولة${exportRound}.pdf`)
    })
    */
  }

  const m = selM !== null ? MASANDAT[selM] : null

  return (
    <div className="animate-in">
      {/* ─ Page Header — تم تعديل: أضفنا أزرار اختيار الجولة للتصدير وزر التصدير */}
      <div className="page-header">
        <div className="page-title">
          <div className="icon" style={{ background: 'rgba(88,166,255,.15)' }}>🌙</div>
          التقييم المسائي للمشرفين
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* مجموعة أزرار اختيار الجولة للتصدير */}
          <div style={{ display: 'flex', gap: 6, backgroundColor: 'var(--surface2)', borderRadius: 'var(--rs)', padding: '4px' }}>
            <button
              className={`btn btn-sm ${exportRound === 1 ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setExportRound(1)}
            >
              الجولة 1
            </button>
            <button
              className={`btn btn-sm ${exportRound === 2 ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setExportRound(2)}
            >
              الجولة 2
            </button>
          </div>
          {/* زر تصدير PDF */}
          <button className="btn btn-blue" onClick={handleExportPDF}>
            📄 تصدير PDF (جولة {exportRound})
          </button>
          <EvalGuideButton type="supervisor" />
        </div>
      </div>

      {/* باقي المكونات كما هي (Date Row, Masanda, Wing, Form, Saved Wings) ──────────*/}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 10 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            المشرف: <strong style={{ color: 'var(--accent)' }}>{name}</strong>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>الجولة (للإدخال):</span>
            {[1, 2].map(r => (
              <button key={r} type="button"
                className={`btn btn-sm ${selR === r ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => { setSelR(r); setSelM(null); setSelW(null); resetForm() }}>
                جولة {r}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ─ Step 1: Masanda */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-title">الخطوة 1 — اختر المساندة</div>
        <div className="masanda-grid">
          {MASANDAT.map((ms, i) => {
            const doneCount = saved.filter(s => s.masandaId === ms.id && (s.round || 1) === selR).length
            return (
              <div key={i} className={`masanda-card ${selM === i ? 'active' : ''}`} onClick={() => pickMasanda(i)}>
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
              const done = saved.some(s => s.masandaId === m.id && String(s.wing) === String(w) && (s.round || 1) === selR)
              return (
                <button key={w}
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
          <div className="card-title">📝 {m.name} — جناح {selW} — جولة {selR}</div>

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

      {/* ─ Saved Wings (يعرض الأجنحة حسب selR المختار للإدخال، يبقى كما هو) */}
      {saved.length > 0 && (
        <div className="card animate-in">
          <div className="card-title">✅ الأجنحة المُدخلة — جولة {selR} ({saved.filter(s => (s.round || 1) === selR).length})</div>
          {loading ? (
            <div style={{ height: 40 }} className="skeleton" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {saved.filter(s => (s.round || 1) === selR).map((w, i) => (
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
                      onClick={() => { setSelR(w.round || 1); setSelM(MASANDAT.findIndex(ms => ms.id === w.masandaId)); pickWing(w.wing) }}>
                      تعديل
                    </button>
                    {(isAdmin || hasPerm('supervisor_delete')) && (
                      <button className="btn btn-danger btn-xs" onClick={() => del(w.masandaId, w.wing, w.round)}>
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
