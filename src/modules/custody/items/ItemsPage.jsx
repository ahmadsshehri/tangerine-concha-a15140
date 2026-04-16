import { useState, useEffect, useCallback } from 'react'
import { collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore'
import { db } from '../../../lib/firebase'
import { useAuth } from '../../../hooks/useAuth'
import { useToast } from '../../../components/Toast'
import { ITEM_CATEGORIES, ITEM_UNITS } from '../../../lib/constants'

const EMPTY = {
  name: '', category: 'ترفيهي', unit: 'قطعة',
  isCustodyItem: true, hasStandardNeed: false,
  defaultStandardQty: 0, allowFaultReports: true,
  status: 'active', notes: ''
}

export default function ItemsPage() {
  const { isAdmin } = useAuth()
  const toast = useToast()
  const [items,   setItems]   = useState([])
  const [loading, setLoading] = useState(false)
  const [modal,   setModal]   = useState(false)
  const [form,    setForm]    = useState(EMPTY)
  const [editId,  setEditId]  = useState(null)
  const [search,  setSearch]  = useState('')
  const [filterCat, setFilterCat] = useState('')

  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      const snap = await getDocs(collection(db, 'items'))
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (e) { toast('❌ ' + e.message, 'error') }
    setLoading(false)
  }, [toast])

  useEffect(() => { fetch() }, [fetch])

  const openAdd  = () => { setForm(EMPTY); setEditId(null); setModal(true) }
  const openEdit = (item) => {
    setForm({ ...EMPTY, ...item }); setEditId(item.id); setModal(true)
  }

  const f = v => setForm(p => ({ ...p, ...v }))

  const save = async () => {
    if (!form.name.trim()) { toast('⚠️ اسم الصنف مطلوب', 'warn'); return }
    const id = editId || `item_${Date.now()}`
    try {
      await setDoc(doc(db, 'items', id), { ...form, updatedAt: new Date().toISOString() })
      toast(editId ? '✅ تم التعديل' : '✅ تمت الإضافة')
      setModal(false); fetch()
    } catch (e) { toast('❌ ' + e.message, 'error') }
  }

  const toggle = async (item) => {
    try {
      await setDoc(doc(db, 'items', item.id), {
        ...item, status: item.status === 'active' ? 'inactive' : 'active',
        updatedAt: new Date().toISOString()
      })
      toast('✅ تم التحديث'); fetch()
    } catch (e) { toast('❌ ' + e.message, 'error') }
  }

  const remove = async (item) => {
    if (!confirm(`حذف "${item.name}" نهائياً؟`)) return
    try {
      await deleteDoc(doc(db, 'items', item.id))
      toast('🗑️ تم الحذف'); fetch()
    } catch (e) { toast('❌ ' + e.message, 'error') }
  }

  const filtered = items.filter(it =>
    (!search || it.name?.includes(search)) &&
    (!filterCat || it.category === filterCat)
  )

  return (
    <div className="animate-in">
      <div className="page-header">
        <div className="page-title" style={{ fontSize: 15 }}>📦 إدارة الأصناف</div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={openAdd}>+ إضافة صنف</button>
        )}
      </div>

      {/* Filters */}
      <div className="filters-bar">
        <div className="search-box" style={{ flex: 2 }}>
          <span className="search-icon">🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث باسم الصنف..." />
        </div>
        <div className="filter-item">
          <select value={filterCat} onChange={e => setFilterCat(e.target.value)}>
            <option value="">كل التصنيفات</option>
            {ITEM_CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 16 }}>
        {[
          { label: 'إجمالي الأصناف', value: items.length, icon: '📦', color: 'var(--accent)' },
          { label: 'فعّال', value: items.filter(i => i.status === 'active').length, icon: '✅', color: 'var(--green)' },
          { label: 'موقوف', value: items.filter(i => i.status !== 'active').length, icon: '⏸️', color: 'var(--orange)' },
          { label: 'له احتياج معياري', value: items.filter(i => i.hasStandardNeed).length, icon: '📏', color: 'var(--blue)' },
        ].map((s, i) => (
          <div key={i} className="stat-card" style={{ '--card-accent': s.color }}>
            <div className="stat-icon">{s.icon}</div>
            <div className="stat-value">{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="table-wrap">
        {loading ? (
          <div style={{ height: 200 }} className="skeleton" />
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="es-icon">📦</div>
            <div className="es-title">لا توجد أصناف</div>
            <div className="es-sub">أضف أول صنف بالضغط على "إضافة صنف"</div>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>اسم الصنف</th>
                <th>التصنيف</th>
                <th>الوحدة</th>
                <th>عهدة</th>
                <th>الحد المعياري</th>
                <th>بلاغات</th>
                <th>الحالة</th>
                {isAdmin && <th>إجراءات</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => (
                <tr key={item.id}>
                  <td style={{ fontWeight: 700 }}>{item.name}</td>
                  <td><span className="badge badge-blue">{item.category}</span></td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{item.unit}</td>
                  <td>{item.isCustodyItem ? '✅' : '—'}</td>
                  <td>
                    {item.hasStandardNeed
                      ? <span className="badge badge-accent">{item.defaultStandardQty}</span>
                      : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                  </td>
                  <td>{item.allowFaultReports ? '✅' : '—'}</td>
                  <td>
                    <span className={`badge ${item.status === 'active' ? 'badge-green' : 'badge-dim'}`}>
                      {item.status === 'active' ? 'فعّال' : 'موقوف'}
                    </span>
                  </td>
                  {isAdmin && (
                    <td>
                      <div style={{ display: 'flex', gap: 5 }}>
                        <button className="btn btn-blue btn-xs" onClick={() => openEdit(item)}>تعديل</button>
                        <button className="btn btn-outline btn-xs" onClick={() => toggle(item)}>
                          {item.status === 'active' ? 'إيقاف' : 'تفعيل'}
                        </button>
                        <button className="btn btn-danger btn-xs" onClick={() => remove(item)}>حذف</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">{editId ? '✏️ تعديل الصنف' : '➕ إضافة صنف جديد'}</div>
              <button className="modal-close" onClick={() => setModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-row fr-2" style={{ marginBottom: 12 }}>
                <div className="form-group" style={{ gridColumn: '1/-1' }}>
                  <label>اسم الصنف *</label>
                  <input value={form.name} onChange={e => f({ name: e.target.value })} placeholder="مثال: بلايستيشن 5" />
                </div>
                <div className="form-group">
                  <label>التصنيف</label>
                  <select value={form.category} onChange={e => f({ category: e.target.value })}>
                    {ITEM_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>وحدة القياس</label>
                  <select value={form.unit} onChange={e => f({ unit: e.target.value })}>
                    {ITEM_UNITS.map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                {[
                  { key: 'isCustodyItem', label: 'ضمن عهدة الأجنحة' },
                  { key: 'allowFaultReports', label: 'يقبل بلاغات عطل' },
                  { key: 'hasStandardNeed', label: 'له احتياج معياري' },
                ].map(opt => (
                  <label key={opt.key} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', padding: '8px 12px', background: 'var(--surface2)', borderRadius: 'var(--rs)', border: '1px solid var(--border)' }}>
                    <input type="checkbox" checked={form[opt.key]} onChange={e => f({ [opt.key]: e.target.checked })} />
                    {opt.label}
                  </label>
                ))}
              </div>

              {form.hasStandardNeed && (
                <div className="form-group" style={{ marginBottom: 12 }}>
                  <label>الحد المعياري الافتراضي للجناح</label>
                  <input type="number" min="0" value={form.defaultStandardQty}
                    onChange={e => f({ defaultStandardQty: +e.target.value })} />
                </div>
              )}

              <div className="form-group" style={{ marginBottom: 12 }}>
                <label>ملاحظات</label>
                <textarea value={form.notes} onChange={e => f({ notes: e.target.value })} placeholder="ملاحظات اختيارية..." />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setModal(false)}>إلغاء</button>
              <button className="btn btn-primary" onClick={save}>💾 حفظ</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
