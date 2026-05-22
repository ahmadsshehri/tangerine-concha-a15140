import { useState, useEffect, useCallback } from 'react'
import { collection, getDocs, doc, setDoc, deleteDoc, writeBatch } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { DEFAULT_STATUSES, DEFAULT_JOB_TYPES, COLOR_MAP } from './attendanceConstants'

const COLOR_OPTIONS = [
  { id: 'green',  label: 'أخضر'  },
  { id: 'red',    label: 'أحمر'  },
  { id: 'orange', label: 'برتقالي'},
  { id: 'blue',   label: 'أزرق'  },
  { id: 'purple', label: 'بنفسجي'},
  { id: 'gray',   label: 'رمادي' },
  { id: 'teal',   label: 'فيروزي'},
]

function Badge({ label, color = 'gray' }) {
  const c = COLOR_MAP[color] || COLOR_MAP.gray
  return (
    <span style={{
      background: c.bg, color: c.text,
      fontSize: 12, padding: '3px 10px',
      borderRadius: 20, fontWeight: 500
    }}>{label}</span>
  )
}

function ItemEditor({ title, collection: colName, defaults }) {
  const [items,   setItems]   = useState([])
  const [modal,   setModal]   = useState(false)
  const [form,    setForm]    = useState({ label: '', color: 'gray', hasDetail: false })
  const [saving,  setSaving]  = useState(false)
  const [loaded,  setLoaded]  = useState(false)

  const load = useCallback(async () => {
    const snap = await getDocs(collection(db, colName))
    if (snap.empty) {
      // بذر القيم الافتراضية في Firestore بمعرفاتها الأصلية حتى تعمل ارتباطات النظام
      const batch = writeBatch(db)
      defaults.forEach(item => {
        batch.set(doc(db, colName, item.id), {
          label:     item.label,
          color:     item.color,
          hasDetail: !!item.hasDetail,
          _system:   true,
        })
      })
      await batch.commit()
      setItems(defaults.map(d => ({ ...d, _system: true })))
    } else {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    }
    setLoaded(true)
  }, [colName, defaults])

  useEffect(() => { load() }, [load])

  const openNew  = () => { setForm({ label: '', color: 'gray', hasDetail: false }); setModal(true) }
  const openEdit = (item) => { setForm({ ...item }); setModal(true) }
  const close    = () => { setModal(false) }

  const save = async () => {
    if (!form.label.trim()) return
    setSaving(true)
    try {
      const id = form.id || `item_${Date.now()}`
      const data = {
        label:     form.label.trim(),
        color:     form.color,
        hasDetail: !!form.hasDetail,
      }
      if (form._system) data._system = true
      await setDoc(doc(db, colName, id), data)
      close()
      load()
    } catch(e) { console.error(e) }
    setSaving(false)
  }

  const remove = async (id) => {
    if (!confirm('حذف هذا العنصر؟')) return
    await deleteDoc(doc(db, colName, id))
    load()
  }

  const f = (k) => (e) => setForm(p => ({
    ...p,
    [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value
  }))

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontWeight: 500, fontSize: 14 }}>{title}</span>
        <button className="btn btn-ghost btn-sm" onClick={openNew}>➕ إضافة</button>
      </div>

      {!loaded ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}>⏳</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map(item => (
            <div key={item.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '8px 12px', background: 'var(--surface2)',
              borderRadius: 8
            }}>
              <Badge label={item.label} color={item.color} />
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => openEdit(item)}>✏️</button>
                {!item._system && (
                  <button className="btn btn-ghost btn-sm"
                    style={{ color: 'var(--red)' }} onClick={() => remove(item.id)}>🗑</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div className="modal-overlay" onClick={close}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{form.id ? 'تعديل' : 'إضافة جديد'} — {title}</h3>
              <button className="modal-close" onClick={close}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="field">
                  <label className="field-label">الاسم <span style={{ color: 'var(--red)' }}>*</span></label>
                  <input className="field-input" value={form.label} onChange={f('label')} placeholder="اسم الحالة أو التصنيف" />
                </div>
                <div className="field">
                  <label className="field-label">اللون</label>
                  <select className="field-input" value={form.color} onChange={f('color')}>
                    {COLOR_OPTIONS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input type="checkbox" id="hasDetail" checked={!!form.hasDetail} onChange={f('hasDetail')} />
                  <label htmlFor="hasDetail" style={{ fontSize: 13, cursor: 'pointer' }}>
                    تحتاج إلى تفاصيل إضافية عند الاختيار
                  </label>
                </div>
                {form.label && (
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>معاينة:</div>
                    <Badge label={form.label} color={form.color} />
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={close}>إلغاء</button>
              <button className="btn btn-primary" onClick={save} disabled={saving || !form.label.trim()}>
                {saving ? '⏳ جاري الحفظ...' : '💾 حفظ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function AttendanceSettings() {
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <ItemEditor
          title="حالات الحضور"
          collection="attendanceStatuses"
          defaults={DEFAULT_STATUSES}
        />
        <ItemEditor
          title="طبيعة العمل"
          collection="hrJobTypes"
          defaults={DEFAULT_JOB_TYPES}
        />
      </div>
    </div>
  )
}
