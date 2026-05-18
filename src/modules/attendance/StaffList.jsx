import { useState, useEffect, useCallback } from 'react'
import {
  collection, getDocs, doc, setDoc,
  deleteDoc, query, orderBy
} from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { DEFAULT_JOB_TYPES, COLOR_MAP } from './attendanceConstants'

function Badge({ label, color = 'gray' }) {
  const c = COLOR_MAP[color] || COLOR_MAP.gray
  return (
    <span style={{
      background: c.bg, color: c.text,
      fontSize: 12, padding: '3px 10px',
      borderRadius: 20, fontWeight: 500, whiteSpace: 'nowrap'
    }}>{label}</span>
  )
}

const EMPTY_STAFF = {
  name: '', rank: '', jobTypeId: '', linkedRole: '', notes: ''
}

export default function StaffList() {
  const [staff,    setStaff]    = useState([])
  const [jobTypes, setJobTypes] = useState(DEFAULT_JOB_TYPES)
  const [loading,  setLoading]  = useState(true)
  const [modal,    setModal]    = useState(false)
  const [form,     setForm]     = useState(EMPTY_STAFF)
  const [saving,   setSaving]   = useState(false)
  const [search,   setSearch]   = useState('')
  const [filterJob,setFilterJob]= useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [sSnap, jSnap] = await Promise.all([
        getDocs(query(collection(db, 'hrStaff'), orderBy('name'))),
        getDocs(collection(db, 'hrJobTypes')),
      ])
      setStaff(sSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      if (!jSnap.empty)
        setJobTypes(jSnap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch(e) { console.error(e) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const openNew  = () => { setForm(EMPTY_STAFF); setModal(true) }
  const openEdit = (s) => { setForm({ ...s }); setModal(true) }
  const closeModal = () => { setModal(false); setForm(EMPTY_STAFF) }

  const save = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const id = form.id || `staff_${Date.now()}`
      const payload = {
        name:       form.name.trim(),
        rank:       form.rank.trim(),
        jobTypeId:  form.jobTypeId,
        linkedRole: form.linkedRole,
        notes:      form.notes || '',
        updatedAt:  new Date().toISOString(),
      }
      await setDoc(doc(db, 'hrStaff', id), payload)
      closeModal()
      load()
    } catch(e) { console.error(e) }
    setSaving(false)
  }

  const remove = async (id) => {
    if (!confirm('حذف هذا الكادر؟')) return
    await deleteDoc(doc(db, 'hrStaff', id))
    load()
  }

  const jobLabel = (id) => jobTypes.find(j => j.id === id)?.label || '—'
  const jobColor = (id) => jobTypes.find(j => j.id === id)?.color || 'gray'

  const filtered = staff.filter(s =>
    (!search   || s.name.includes(search) || s.rank.includes(search)) &&
    (!filterJob || s.jobTypeId === filterJob)
  )

  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }))

  return (
    <div>
      {/* Controls */}
      <div className="card" style={{ padding: '12px 16px', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="field" style={{ flex: 1, minWidth: 140 }}>
            <label className="field-label">بحث</label>
            <input className="field-input" placeholder="الاسم أو الرتبة..."
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="field" style={{ minWidth: 160 }}>
            <label className="field-label">طبيعة العمل</label>
            <select className="field-input" value={filterJob} onChange={e => setFilterJob(e.target.value)}>
              <option value="">الكل</option>
              {jobTypes.map(j => <option key={j.id} value={j.id}>{j.label}</option>)}
            </select>
          </div>
          <button className="btn btn-primary" onClick={openNew}>➕ إضافة كادر</button>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>⏳ جاري التحميل...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>لا توجد نتائج</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th><th>الاسم</th><th>الرتبة</th>
                <th>طبيعة العمل</th><th>الصلاحية في النظام</th><th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, i) => (
                <tr key={s.id}>
                  <td style={{ color: 'var(--text-muted)', width: 40 }}>{i + 1}</td>
                  <td style={{ fontWeight: 500 }}>{s.name}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{s.rank || '—'}</td>
                  <td><Badge label={jobLabel(s.jobTypeId)} color={jobColor(s.jobTypeId)} /></td>
                  <td>
                    {s.linkedRole
                      ? <Badge label={s.linkedRole} color="blue" />
                      : <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>بدون حساب</span>}
                  </td>
                  <td style={{ textAlign: 'left' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(s)}>✏️ تعديل</button>
                      <button className="btn btn-ghost btn-sm"
                        style={{ color: 'var(--red)' }} onClick={() => remove(s.id)}>🗑</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{form.id ? '✏️ تعديل كادر' : '➕ إضافة كادر جديد'}</h3>
              <button className="modal-close" onClick={closeModal}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field" style={{ gridColumn: '1/-1' }}>
                  <label className="field-label">الاسم <span style={{ color: 'var(--red)' }}>*</span></label>
                  <input className="field-input" value={form.name} onChange={f('name')} placeholder="الاسم الكامل" />
                </div>
                <div className="field">
                  <label className="field-label">الرتبة</label>
                  <input className="field-input" value={form.rank} onChange={f('rank')} placeholder="جندي أول، رقيب..." />
                </div>
                <div className="field">
                  <label className="field-label">طبيعة العمل</label>
                  <select className="field-input" value={form.jobTypeId} onChange={f('jobTypeId')}>
                    <option value="">— اختر —</option>
                    {jobTypes.map(j => <option key={j.id} value={j.id}>{j.label}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="field-label">الصلاحية في النظام</label>
                  <select className="field-input" value={form.linkedRole} onChange={f('linkedRole')}>
                    <option value="">بدون حساب</option>
                    <option value="مشرف سكن">مشرف سكن</option>
                    <option value="معالج">معالج</option>
                    <option value="مرشد تعافي">مرشد تعافي</option>
                    <option value="إداري">إداري</option>
                    <option value="مدير">مدير</option>
                  </select>
                </div>
                <div className="field">
                  <label className="field-label">ملاحظات</label>
                  <input className="field-input" value={form.notes} onChange={f('notes')} placeholder="اختياري" />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={closeModal}>إلغاء</button>
              <button className="btn btn-primary" onClick={save} disabled={saving || !form.name.trim()}>
                {saving ? '⏳ جاري الحفظ...' : '💾 حفظ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
