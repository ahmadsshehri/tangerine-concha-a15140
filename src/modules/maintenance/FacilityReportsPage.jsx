import { useState, useEffect, useCallback } from 'react'
import { collection, getDocs, doc, setDoc } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../components/Toast'
import { MASANDAT, PRIORITY_LEVELS, FACILITY_REPORT_STATUSES, FAULT_TYPES } from '../../lib/constants'

const EMPTY = {
  report_date: new Date().toISOString().split('T')[0],
  masanda_id: '', wing: '', fault_type: 'كهرباء',
  description: '', priority: 'medium', status: 'جديد',
  assigned_to: '', paper_form_number: '', action_taken: '',
  completed_at: '', notes: ''
}

export default function FacilityReportsPage() {
  const { name } = useAuth()
  const toast = useToast()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(false)
  const [modal,   setModal]   = useState(false)
  const [form,    setForm]    = useState(EMPTY)
  const [editId,  setEditId]  = useState(null)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterType,   setFilterType]   = useState('')
  const [search,  setSearch]  = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const snap = await getDocs(collection(db, 'facilityMaintenanceReports'))
      const recs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      recs.sort((a, b) => (b.report_date || '') > (a.report_date || '') ? 1 : -1)
      setRecords(recs)
    } catch (e) { toast('❌ ' + e.message, 'error') }
    setLoading(false)
  }, [toast])

  useEffect(() => { fetchData() }, [fetchData])

  const f = u => setForm(p => ({ ...p, ...u }))

  const save = async () => {
    if (!form.description || !form.fault_type) { toast('⚠️ نوع العطل والوصف مطلوبان', 'warn'); return }
    const id = editId || `fmr_${Date.now()}`
    const m  = MASANDAT.find(m => m.id === form.masanda_id)
    try {
      await setDoc(doc(db, 'facilityMaintenanceReports', id), {
        ...form, id, report_number: id,
        masanda_name: m?.name || '',
        created_by: name,
        createdAt: new Date().toISOString(),
        ...(form.status === 'تم الإنجاز' && !editId ? { completed_at: new Date().toISOString().split('T')[0] } : {})
      })
      toast('✅ تم حفظ البلاغ')
      setModal(false); setEditId(null); setForm(EMPTY); fetchData()
    } catch (e) { toast('❌ ' + e.message, 'error') }
  }

  const filtered = records.filter(r =>
    (!filterStatus || r.status === filterStatus) &&
    (!filterType   || r.fault_type === filterType) &&
    (!search       || r.description?.includes(search) || r.report_number?.includes(search))
  )

  const priInfo     = (id) => PRIORITY_LEVELS.find(p => p.id === id) || { label: id, color: '#888' }
  const statusColor = {
    'جديد': 'badge-blue', 'تحت التنفيذ': 'badge-orange',
    'تم الإنجاز': 'badge-green', 'تعذر': 'badge-red', 'مغلق': 'badge-dim'
  }
  const wings = (masandaId) => MASANDAT.find(m => m.id === masandaId)?.wings || []

  const faultIcon = {
    'كهرباء': '⚡', 'سباكة': '🚿', 'تكييف': '❄️', 'نجارة': '🪚',
    'دهانات': '🎨', 'أقفال': '🔒', 'إنارة': '💡', 'أخرى': '🔨'
  }

  return (
    <div className="animate-in">
      <div className="page-header">
        <div className="page-title" style={{ fontSize: 15 }}>🏗️ بلاغات صيانة المرافق</div>
        <button className="btn btn-primary" onClick={() => { setForm(EMPTY); setEditId(null); setModal(true) }}>+ بلاغ جديد</button>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 14 }}>
        {[
          { label: 'إجمالي البلاغات', value: records.length, icon: '📋', color: 'var(--accent)' },
          { label: 'مفتوحة',           value: records.filter(r=>['جديد','تحت التنفيذ'].includes(r.status)).length, icon: '🔴', color: 'var(--red)' },
          { label: 'تم الإنجاز',      value: records.filter(r=>r.status==='تم الإنجاز').length, icon: '✅', color: 'var(--green)' },
          { label: 'تعذر / مغلق',     value: records.filter(r=>['تعذر','مغلق'].includes(r.status)).length, icon: '⏸️', color: 'var(--text-muted)' },
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
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث بالوصف أو رقم البلاغ..." />
        </div>
        <div className="filter-item">
          <select value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="">كل الأنواع</option>
            {FAULT_TYPES.map(t => <option key={t}>{faultIcon[t]} {t}</option>)}
          </select>
        </div>
        <div className="filter-item">
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">كل الحالات</option>
            {FACILITY_REPORT_STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="table-wrap">
        {loading ? <div style={{ height: 200 }} className="skeleton" /> :
         filtered.length === 0 ? (
          <div className="empty-state">
            <div className="es-icon">🏗️</div>
            <div className="es-title">لا توجد بلاغات صيانة</div>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>التاريخ</th><th>الموقع</th><th>نوع العطل</th>
                <th>الوصف</th><th>الأولوية</th><th>الحالة</th>
                <th>تاريخ الإنجاز</th><th>إجراء</th>
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
                    <td>
                      <span style={{ fontSize: 13 }}>{faultIcon[r.fault_type] || '🔨'}</span>{' '}
                      <span style={{ fontSize: 12 }}>{r.fault_type}</span>
                    </td>
                    <td style={{ fontSize: 12, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.description}>{r.description}</td>
                    <td>
                      <span className="badge" style={{ background: pri.color + '22', color: pri.color }}>{pri.label}</span>
                    </td>
                    <td><span className={`badge ${statusColor[r.status] || 'badge-dim'}`}>{r.status}</span></td>
                    <td style={{ fontSize: 12, color: 'var(--green)' }}>{r.completed_at || '—'}</td>
                    <td>
                      <button className="btn btn-blue btn-xs" onClick={() => { setForm({...EMPTY,...r}); setEditId(r.id); setModal(true) }}>تحديث</button>
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
              <div className="modal-title">{editId ? '✏️ تحديث البلاغ' : '🏗️ بلاغ صيانة جديد'}</div>
              <button className="modal-close" onClick={() => setModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-row fr-2" style={{ marginBottom: 12 }}>
                <div className="form-group">
                  <label>التاريخ</label>
                  <input type="date" value={form.report_date} onChange={e => f({ report_date: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>نوع العطل *</label>
                  <select value={form.fault_type} onChange={e => f({ fault_type: e.target.value })}>
                    {FAULT_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>المساندة</label>
                  <select value={form.masanda_id} onChange={e => f({ masanda_id: e.target.value, wing: '' })}>
                    <option value="">— اختر —</option>
                    {MASANDAT.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>الجناح / الموقع</label>
                  <select value={form.wing} onChange={e => f({ wing: e.target.value })}>
                    <option value="">— اختر —</option>
                    {wings(form.masanda_id).map(w => <option key={w} value={w}>{isNaN(w) ? w : `جناح ${w}`}</option>)}
                  </select>
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
                    {FACILITY_REPORT_STATUSES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ gridColumn: '1/-1' }}>
                  <label>وصف العطل *</label>
                  <textarea value={form.description} onChange={e => f({ description: e.target.value })} placeholder="اشرح المشكلة بوضوح..." />
                </div>
                <div className="form-group">
                  <label>الجهة المنفذة</label>
                  <input value={form.assigned_to} onChange={e => f({ assigned_to: e.target.value })} placeholder="اسم الجهة أو الفني" />
                </div>
                <div className="form-group">
                  <label>رقم النموذج الورقي</label>
                  <input value={form.paper_form_number} onChange={e => f({ paper_form_number: e.target.value })} />
                </div>
                {form.status === 'تم الإنجاز' && (
                  <div className="form-group">
                    <label>تاريخ الإنجاز</label>
                    <input type="date" value={form.completed_at} onChange={e => f({ completed_at: e.target.value })} />
                  </div>
                )}
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
