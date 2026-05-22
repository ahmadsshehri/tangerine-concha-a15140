import { useState, useEffect, useCallback, useRef } from 'react'
import {
  collection, query, where, getDocs,
  doc, setDoc, deleteDoc
} from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../components/Toast'
import { MASANDAT, AXES, DAR, MAR } from '../../lib/constants'
import { EvalGuideButton } from '../../components/EvalGuideModal'

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

  // متغير لاختيار الجولة عند الطباعة
  const [printRound, setPrintRound] = useState(1)

  const [scores, setScores]   = useState(() => AXES.map(ax => ax.items.map(() => 0)))
  const [form,   setForm]     = useState({ ben: '', vio: '', obsAmni: '', obsFanni: '', obsBaramij: '' })

  const info = dateInfo(date)
  const printContentRef = useRef(null) // مرجع للمحتوى المراد طباعته

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

  // ─── دالة الطباعة ─────────────────────────────────────────────────────────
  const handlePrint = () => {
    // تصفية البيانات حسب الجولة المختارة للطباعة
    const roundsToPrint = saved.filter(s => (s.round || 1) === printRound)
    if (roundsToPrint.length === 0) {
      toast(`⚠️ لا توجد بيانات للجولة ${printRound} في هذا التاريخ`, 'warn')
      return
    }

    // تجهيز محتوى HTML للطباعة
    const printWindow = window.open('', '_blank')
    printWindow.document.write(`
      <html dir="rtl">
        <head>
          <title>تقييم المشرفين - ${date} - جولة ${printRound}</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 20px; background: white; color: black; }
            .print-header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #ccc; padding-bottom: 10px; }
            .print-header h1 { margin: 0; font-size: 24px; }
            .print-header p { margin: 5px 0; color: #555; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: center; }
            th { background-color: #f2f2f2; font-weight: bold; }
            .axis-details { margin-top: 10px; }
            .axis-details h4 { margin: 10px 0 5px; background: #f9f9f9; padding: 4px; }
            .obs-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            .obs-table th, .obs-table td { border: 1px solid #ddd; padding: 6px; text-align: right; }
            .obs-table th { background: #f0f0f0; }
            .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #777; border-top: 1px solid #ccc; padding-top: 10px; }
            .badge { background: #4CAF50; color: white; padding: 2px 6px; border-radius: 12px; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="print-header">
            <h1>تقرير التقييم المسائي للمشرفين</h1>
            <p>التاريخ: ${info.day} - ${date} | الأسبوع: ${info.week} | الشهر: ${info.month}</p>
            <p>الجولة: ${printRound} | عدد الأجنحة المدخلة: ${roundsToPrint.length}</p>
          </div>
          <table>
            <thead>
              <tr><th>المساندة</th><th>الجناح</th><th>المستفيدين</th><th>المخالفات</th><th>مجموع النقاط</th><th>تم الإدخال بواسطة</th></tr>
            </thead>
            <tbody>
              ${roundsToPrint.map(w => `
                <tr>
                  <td>${w.masandaName}</td>
                  <td>${w.wing}</td>
                  <td>${w.beneficiaries || 0}</td>
                  <td>${w.violations || 0}</td>
                  <td>${w.totalScore} / 60</td>
                  <td>${w.savedBy || ''}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="axis-details">
            <h4>تفاصيل المحاور والدرجات</h4>
            ${roundsToPrint.map(w => `
              <div style="margin-bottom: 25px; border:1px solid #eee; padding: 10px;">
                <strong>${w.masandaName} - جناح ${w.wing}</strong>
                <table style="margin-top:8px; width:100%">
                  <thead><tr><th>المحور</th><th>الدرجات (تفصيل 5 عناصر)</th><th>المجموع</th></tr></thead>
                  <tbody>
                    ${(w.axes || []).map(ax => `
                      <tr>
                        <td>${ax.label}</td>
                        <td>${ax.scores ? ax.scores.join(' - ') : ''}</td>
                        <td>${ax.total || 0} / 15</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
                <div style="margin-top: 12px;">
                  <strong>ملاحظات:</strong><br/>
                  الأمنية: ${w.obs?.amni || '—'}<br/>
                  الفنية: ${w.obs?.fanni || '—'}<br/>
                  البرامج: ${w.obs?.baramij || '—'}
                </div>
              </div>
            `).join('')}
          </div>
          <div class="footer">
            تم الطباعة بواسطة ${name} - ${new Date().toLocaleString()}
          </div>
        </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.print()
    printWindow.onafterprint = () => printWindow.close()
  }

  const m = selM !== null ? MASANDAT[selM] : null

  return (
    <div className="animate-in">
      {/* ─ Page Header — مع أزرار اختيار الجولة للطباعة وزر الطباعة */}
      <div className="page-header">
        <div className="page-title">
          <div className="icon" style={{ background: 'rgba(88,166,255,.15)' }}>🌙</div>
          التقييم المسائي للمشرفين
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* مجموعة أزرار اختيار الجولة للطباعة */}
          <div style={{ display: 'flex', gap: 6, backgroundColor: 'var(--surface2)', borderRadius: 'var(--rs)', padding: '4px' }}>
            <button
              className={`btn btn-sm ${printRound === 1 ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setPrintRound(1)}
            >
              الجولة 1
            </button>
            <button
              className={`btn btn-sm ${printRound === 2 ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setPrintRound(2)}
            >
              الجولة 2
            </button>
          </div>
          {/* زر الطباعة */}
          <button className="btn btn-blue" onClick={handlePrint}>
            🖨️ طباعة (جولة {printRound})
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

      {/* ─ Saved Wings */}
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
