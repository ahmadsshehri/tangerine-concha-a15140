import { useState, useEffect, useCallback } from 'react'
import { collection, getDocs, doc, setDoc } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../components/Toast'
import { MASANDAT, PRIORITY_LEVELS, TOOL_REPORT_STATUSES } from '../../lib/constants'

const EMPTY = {
  report_date: new Date().toISOString().split('T')[0],
  masanda_id: '', wing: '', item_id: '', affected_qty: '',
  description: '', priority: 'medium', status: 'جديد',
  is_item_picked: false, assigned_to: '', paper_form_number: '',
  action_taken: '', notes: ''
}

export default function ToolReportsPage() {
  const { name } = useAuth()
  const toast = useToast()
  const [records, setRecords] = useState([])
  const [items,   setItems]   = useState([])
  const [loading, setLoading] = useState(false)
  const [modal,   setModal]   = useState(false)
  const [form,    setForm]    = useState(EMPTY)
  const [editId,  setEditId]  = useState(null)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterPri,    setFilterPri]    = useState('')
  const [search,  setSearch]  = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [rSnap, iSnap] = await Promise.all([
        getDocs(collection(db, 'toolFaultReports')),
        getDocs(collection(db, 'items'))
      ])
      const recs = rSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      recs.sort((a, b) => (b.report_date || '') > (a.report_date || '') ? 1 : -1)
      setRecords(recs)
      setItems(iSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(i => i.allowFaultReports && i.status === 'active'))
    } catch (e) { toast('❌ ' + e.message, 'error') }
    setLoading(false)
  }, [toast])

  useEffect(() => { fetchData() }, [fetchData])

  const f = u => setForm(p => ({ ...p, ...u }))

  const save = async () => {
    if (!form.item_id || !form.description) { toast('⚠️ الصنف والوصف مطلوبان', 'warn'); return }
    const id = editId || `tfr_${Date.now()}`
    const m  = MASANDAT.find(m => m.id === form.masanda_id)
    try {
      await setDoc(doc(db, 'toolFaultReports', id), {
        ...form, id,
        report_number: id,
        masanda_name: m?.name || '',
        item_name: items.find(i => i.id === form.item_id)?.name || '',
        created_by: name,
        createdAt: new Date().toISOString(),
        ...(form.status === 'مغلق' && !editId ? { closed_at: new Date().toISOString() } : {})
      })
      toast('✅ تم حفظ البلاغ')
      setModal(false); setEditId(null); setForm(EMPTY); fetchData()
    } catch (e) { toast('❌ ' + e.message, 'error') }
  }

  const openEdit = (r) => {
    setForm({ ...EMPTY, ...r }); setEditId(r.id); setModal(true)
  }

  const filtered = records.filter(r =>
    (!filterStatus || r.status === filterStatus) &&
    (!filterPri    || r.priority === filterPri) &&
    (!search       || r.item_name?.includes(search) || r.report_number?.includes(search))
  )

  const priInfo = (id) => PRIORITY_LEVELS.find(p => p.id === id) || { label: id, color: '#888' }
  const statusColor = {
    'جديد': 'badge-blue', 'تحت الإجراء': 'badge-orange', 'بانتظار السحب': 'badge-orange',
    'مسحوب للصيانة': 'badge-purple', 'تم الإصلاح': 'badge-green',
    'تعذر الإصلاح': 'badge-red', 'مغلق': 'badge-dim'
  }

  const wings = (masandaId) => MASANDAT.find(m => m.id === masandaId)?.wings || []

  return (
    <div className="animate-in">
      <div className="page-header">
        <div className="page-title" style={{ fontSize: 15 }}>🔧 بلاغات أعطال الأدوات</div>
        <button className="btn btn-primary" onClick={() => { setForm(EMPTY); setEditId(null); setModal(true) }}>+ بلاغ جديد</button>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 14 }}>
        {[
          { label: 'إجمالي البلاغات', value: records.length, icon: '📋', color: 'var(--accent)' },
          { label: 'جديد / مفتوح',    value: records.filter(r=>['جديد','تحت الإجراء'].includes(r.status)).length, icon: '🔴', color: 'var(--red)' },
          { label: 'تحت الصيانة',     value: records.filter(r=>r.status==='مسحوب للصيانة').length, icon: '🔧', color: 'var(--orange)' },
          { label: 'مغلق / منجز',     value: records.filter(r=>['مغلق','تم الإصلاح'].includes(r.status)).length, icon: '✅', color: 'var(--green)' },
        ].map((s, i) => (
          <div key={i} className="stat-card" style={{ '--card-accent': s.color }}>
            <div className="stat-icon">{s.icon}</div>
            <div className="stat-value">{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="filters-bar">
        <div className="search-box" style={{ flex: 2 }}>
          <span className="search-icon">🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث بالصنف أو رقم البلاغ..." />
        </div>
        <div className="filter-item">
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">كل الحالات</option>
            {TOOL_REPORT_STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="filter-item">
          <select value={filterPri} onChange={e => setFilterPri(e.target.value)}>
            <option value="">كل الأولويات</option>
            {PRIORITY_LEVELS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="table-wrap">
        {loading ? <div style={{ height: 200 }} className="skeleton" /> :
         filtered.length === 0 ? (
          <div className="empty-state">
            <div className="es-icon">🔧</div>
            <div className="es-title">لا توجد بلاغات</div>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>التاريخ</th><th>الموقع</th><th>الصنف</th>
                <th>الكمية</th><th>وصف العطل</th>
                <th>الأولوية</th><th>الحالة</th><th>إجراء</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const pri = priInfo(r.priority)
                return (
                  <tr key={r.id}>
                    <td style={{ fontSize: 12 }}>{r.report_date}</td>
                    <td style={{ fontSize: 12 }}>
                      {r.masanda_name}{r.wing ? ` — ${isNaN(r.wing) ? r.wing : `جناح ${r.wing}`}` : ''}
                    </td>
                    <td style={{ fontWeight: 700 }}>{r.item_name}</td>
                    <td><span className="badge badge-accent">{r.affected_qty || '—'}</span></td>
                    <td style={{ fontSize: 12, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.description}>{r.description}</td>
                    <td>
                      <span className="badge" style={{ background: pri.color + '22', color: pri.color }}>
                        {pri.label}
                      </span>
                    </td>
                    <td><span className={`badge ${statusColor[r.status] || 'badge-dim'}`}>{r.status}</span></td>
                    <td>
                      <button className="btn btn-blue btn-xs" onClick={() => openEdit(r)}>تحديث</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="modal modal-lg">
            <div className="modal-header">
              <div className="modal-title">{editId ? '✏️ تحديث البلاغ' : '🔧 بلاغ عطل جديد'}</div>
              <button className="modal-close" onClick={() => setModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-row fr-2" style={{ marginBottom: 12 }}>
                <div className="form-group">
                  <label>التاريخ *</label>
                  <input type="date" value={form.report_date} onChange={e => f({ report_date: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>المساندة</label>
                  <select value={form.masanda_id} onChange={e => f({ masanda_id: e.target.value, wing: '' })}>
                    <option value="">— اختر —</option>
                    {MASANDAT.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>الجناح</label>
                  <select value={form.wing} onChange={e => f({ wing: e.target.value })}>
                    <option value="">— اختر —</option>
                    {wings(form.masanda_id).map(w => <option key={w} value={w}>{isNaN(w) ? w : `جناح ${w}`}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>الصنف *</label>
                  <select value={form.item_id} onChange={e => f({ item_id: e.target.value })}>
                    <option value="">— اختر الصنف —</option>
                    {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>الكمية المتأثرة</label>
                  <input type="number" min="1" value={form.affected_qty} onChange={e => f({ affected_qty: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>الأولوية</label>
                  <select value={form.priority} onChange={e => f({ priority: e.target.value })}>
                    {PRIORITY_LEVELS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>الحالة</label>
                  <select value={form.status} onChange={e => f({ status: e.target.value })}>
                    {TOOL_REPORT_STATUSES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>الجهة المحال إليها</label>
                  <input value={form.assigned_to} onChange={e => f({ assigned_to: e.target.value })} placeholder="اسم الجهة أو الشخص" />
                </div>
                <div className="form-group" style={{ gridColumn: '1/-1' }}>
                  <label>وصف العطل *</label>
                  <textarea value={form.description} onChange={e => f({ description: e.target.value })} placeholder="اشرح العطل بوضوح..." />
                </div>
                <div className="form-group">
                  <label>رقم النموذج الورقي</label>
                  <input value={form.paper_form_number} onChange={e => f({ paper_form_number: e.target.value })} />
                </div>
                <div className="form-group" style={{ gridColumn: '1/-1' }}>
                  <label>الإجراء المتخذ</label>
                  <textarea value={form.action_taken} onChange={e => f({ action_taken: e.target.value })} placeholder="ما الذي تم فعله؟" />
                </div>
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
