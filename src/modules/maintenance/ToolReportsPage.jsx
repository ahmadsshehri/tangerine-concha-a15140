import { useState, useEffect, useCallback } from 'react'
import { collection, getDocs, doc, setDoc, getDoc } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../components/Toast'
import { MASANDAT, PRIORITY_LEVELS } from '../../lib/constants'

// ─── الحالات مع وصف أثرها على الأرصدة ──────────────────────────────────────
const STATUSES = [
  { id: 'جديد',           color: 'var(--blue)',    icon: '🆕', desc: 'لا يؤثر على الأرصدة' },
  { id: 'يحتاج صيانة',   color: 'var(--orange)',  icon: '🔧', desc: 'لا يؤثر على الأرصدة' },
  { id: 'تم السحب',      color: 'var(--purple)',  icon: '📤', desc: 'يُخصم من الجناح/المستودع → يُضاف للصيانة' },
  { id: 'تالف',          color: 'var(--red)',     icon: '🗑️', desc: 'يُحذف من الجناح/المستودع نهائياً' },
  { id: 'تم الإصلاح',   color: 'var(--green)',   icon: '✅', desc: 'يُعاد للجناح أو المستودع' },
  { id: 'تعذر الإصلاح', color: 'var(--red)',     icon: '❌', desc: 'يبقى في الصيانة بدون حركة' },
  { id: 'مغلق',          color: 'var(--text-dim)', icon: '🔒', desc: 'إغلاق البلاغ' },
]

const EMPTY = {
  report_date: new Date().toISOString().split('T')[0],
  masanda_id: '', wing: '', source: 'wing', // wing | warehouse
  item_id: '', affected_qty: 1,
  description: '', priority: 'medium',
  status: 'جديد', assigned_to: '', notes: ''
}

// ─── تحديث رصيد المستودع ─────────────────────────────────────────────────────
async function updateWarehouse(itemId, itemName, field, delta) {
  const ref  = doc(db, 'warehouseInventory', `warehouse_${itemId}`)
  const snap = await getDoc(ref)
  const cur  = snap.exists() ? snap.data() : {}
  const upd  = { ...cur, itemId, itemName, updatedAt: new Date().toISOString() }
  if (field === 'good_qty') {
    upd.good_qty  = Math.max(0, (cur.good_qty  || 0) + delta)
    upd.total_qty = Math.max(0, (cur.total_qty || 0) + delta)
  } else if (field === 'under_repair_qty') {
    upd.under_repair_qty = Math.max(0, (cur.under_repair_qty || 0) + delta)
  }
  await setDoc(ref, upd, { merge: true })
}

// ─── تحديث عهدة الجناح ───────────────────────────────────────────────────────
async function updateWingInv(masandaId, wing, itemId, itemName, field, delta) {
  const locId = `${masandaId}_${String(wing).replace(/\s/g,'_')}`
  const ref   = doc(db, 'wingInventory', `${locId}_${itemId}`)
  const snap  = await getDoc(ref)
  const cur   = snap.exists() ? snap.data() : {}
  const upd   = { ...cur, locationId: locId, itemId, itemName, masandaId, wing: String(wing), updatedAt: new Date().toISOString() }
  if (field === 'good_qty') {
    upd.good_qty      = Math.max(0, (cur.good_qty      || 0) + delta)
    upd.available_qty = upd.good_qty
    upd.received_qty  = Math.max(0, (cur.received_qty  || 0) + delta)
  } else if (field === 'under_maintenance_qty') {
    upd.under_maintenance_qty = Math.max(0, (cur.under_maintenance_qty || 0) + delta)
  } else if (field === 'faulty_qty') {
    upd.faulty_qty = Math.max(0, (cur.faulty_qty || 0) + delta)
  }
  await setDoc(ref, upd, { merge: true })
}

// ─── تطبيق أثر تغيير الحالة على الأرصدة ─────────────────────────────────────
async function applyStatusChange(oldStatus, newStatus, form, itemName) {
  if (oldStatus === newStatus) return
  const qty    = +form.affected_qty || 0
  if (!qty) return

  const fromWing = form.source === 'wing' && form.masanda_id && form.wing

  // ── تم السحب: يخرج من الجناح/المستودع → يدخل الصيانة
  if (newStatus === 'تم السحب' && oldStatus !== 'تم السحب') {
    if (fromWing) {
      await updateWingInv(form.masanda_id, form.wing, form.item_id, itemName, 'good_qty', -qty)
      await updateWingInv(form.masanda_id, form.wing, form.item_id, itemName, 'under_maintenance_qty', +qty)
    } else {
      await updateWarehouse(form.item_id, itemName, 'good_qty', -qty)
      await updateWarehouse(form.item_id, itemName, 'under_repair_qty', +qty)
    }
  }

  // ── تراجع عن "تم السحب": يعود للمكان الأصلي
  if (oldStatus === 'تم السحب' && newStatus === 'يحتاج صيانة') {
    if (fromWing) {
      await updateWingInv(form.masanda_id, form.wing, form.item_id, itemName, 'good_qty', +qty)
      await updateWingInv(form.masanda_id, form.wing, form.item_id, itemName, 'under_maintenance_qty', -qty)
    } else {
      await updateWarehouse(form.item_id, itemName, 'good_qty', +qty)
      await updateWarehouse(form.item_id, itemName, 'under_repair_qty', -qty)
    }
  }

  // ── تالف: يُحذف من الجناح/المستودع نهائياً (إذا لم يُسحب بعد)
  if (newStatus === 'تالف' && oldStatus !== 'تالف') {
    if (oldStatus === 'تم السحب') {
      // كان في الصيانة → نزيل من الصيانة فقط
      if (fromWing) {
        await updateWingInv(form.masanda_id, form.wing, form.item_id, itemName, 'under_maintenance_qty', -qty)
      } else {
        await updateWarehouse(form.item_id, itemName, 'under_repair_qty', -qty)
      }
    } else {
      // لم يُسحب → نزيل من الكمية السليمة
      if (fromWing) {
        await updateWingInv(form.masanda_id, form.wing, form.item_id, itemName, 'good_qty', -qty)
      } else {
        await updateWarehouse(form.item_id, itemName, 'good_qty', -qty)
      }
    }
  }

  // ── تم الإصلاح: يعود للجناح أو المستودع من الصيانة
  if (newStatus === 'تم الإصلاح' && oldStatus !== 'تم الإصلاح') {
    if (fromWing) {
      await updateWingInv(form.masanda_id, form.wing, form.item_id, itemName, 'under_maintenance_qty', -qty)
      await updateWingInv(form.masanda_id, form.wing, form.item_id, itemName, 'good_qty', +qty)
    } else {
      await updateWarehouse(form.item_id, itemName, 'under_repair_qty', -qty)
      await updateWarehouse(form.item_id, itemName, 'good_qty', +qty)
    }
  }
}

// ─── المكوّن الرئيسي ──────────────────────────────────────────────────────────
export default function ToolReportsPage() {
  const { name } = useAuth()
  const toast = useToast()
  const [records,      setRecords]      = useState([])
  const [items,        setItems]        = useState([])
  const [loading,      setLoading]      = useState(false)
  const [saving,       setSaving]       = useState(false)
  const [modal,        setModal]        = useState(false)
  const [form,         setForm]         = useState(EMPTY)
  const [editId,       setEditId]       = useState(null)
  const [oldStatus,    setOldStatus]    = useState(null)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterPri,    setFilterPri]    = useState('')
  const [search,       setSearch]       = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [rSnap, iSnap] = await Promise.all([
        getDocs(collection(db, 'toolFaultReports')),
        getDocs(collection(db, 'items'))
      ])
      const recs = rSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      recs.sort((a,b) => (b.report_date||'') > (a.report_date||'') ? 1 : -1)
      setRecords(recs)
      setItems(iSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(i => i.allowFaultReports && i.status === 'active'))
    } catch (e) { toast('❌ ' + e.message, 'error') }
    setLoading(false)
  }, [toast])

  useEffect(() => { fetchData() }, [fetchData])

  const f = u => setForm(p => ({ ...p, ...u }))

  const openNew  = () => { setForm(EMPTY); setEditId(null); setOldStatus(null); setModal(true) }
  const openEdit = (r) => {
    setForm({ ...EMPTY, ...r, source: r.source || 'wing' })
    setEditId(r.id); setOldStatus(r.status); setModal(true)
  }

  const save = async () => {
    if (!form.item_id || !form.masanda_id) { toast('⚠️ الصنف والموقع مطلوبان', 'warn'); return }
    setSaving(true)
    const id       = editId || `tfr_${Date.now()}`
    const m        = MASANDAT.find(m => m.id === form.masanda_id)
    const itemName = items.find(i => i.id === form.item_id)?.name || ''
    try {
      // تطبيق أثر تغيير الحالة على الأرصدة
      await applyStatusChange(oldStatus || 'جديد', form.status, form, itemName)

      await setDoc(doc(db, 'toolFaultReports', id), {
        ...form, id, report_number: id,
        masanda_name: m?.name || '',
        item_name: itemName,
        created_by: name,
        createdAt: new Date().toISOString(),
        ...(form.status === 'مغلق' ? { closed_at: new Date().toISOString() } : {})
      })
      toast('✅ تم حفظ البلاغ وتحديث الأرصدة')
      setModal(false); setEditId(null); setOldStatus(null); setForm(EMPTY)
      fetchData()
    } catch (e) { toast('❌ ' + e.message, 'error') }
    setSaving(false)
  }

  const filtered = records.filter(r =>
    (!filterStatus || r.status === filterStatus) &&
    (!filterPri    || r.priority === filterPri) &&
    (!search       || r.item_name?.includes(search) || r.report_number?.includes(search))
  )

  const getStatusInfo = (s) => STATUSES.find(x => x.id === s) || { color: 'var(--text-dim)', icon: '•' }
  const priInfo = (id) => PRIORITY_LEVELS.find(p => p.id === id) || { label: id, color: '#888' }
  const wings = (masandaId) => MASANDAT.find(m => m.id === masandaId)?.wings || []

  const currentStatusInfo = STATUSES.find(s => s.id === form.status)

  return (
    <div className="animate-in">
      <div className="page-header">
        <div className="page-title" style={{ fontSize: 15 }}>🔧 بلاغات أعطال الأدوات</div>
        <button className="btn btn-primary" onClick={openNew}>+ بلاغ جديد</button>
      </div>

      {/* إحصاءات */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 14 }}>
        {[
          { label: 'إجمالي البلاغات',  value: records.length,                                                   icon: '📋', color: 'var(--accent)' },
          { label: 'يحتاج صيانة',      value: records.filter(r=>['جديد','يحتاج صيانة'].includes(r.status)).length, icon: '🔧', color: 'var(--orange)' },
          { label: 'تحت الصيانة',      value: records.filter(r=>r.status==='تم السحب').length,                  icon: '📤', color: 'var(--purple)' },
          { label: 'تم الإصلاح',       value: records.filter(r=>r.status==='تم الإصلاح').length,               icon: '✅', color: 'var(--green)' },
        ].map((s,i) => (
          <div key={i} className="stat-card" style={{ '--card-accent': s.color }}>
            <div className="stat-icon">{s.icon}</div>
            <div className="stat-value">{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* فلاتر */}
      <div className="filters-bar">
        <div className="search-box" style={{ flex: 2 }}>
          <span className="search-icon">🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث بالصنف أو رقم البلاغ..." />
        </div>
        <div className="filter-item">
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">كل الحالات</option>
            {STATUSES.map(s => <option key={s.id} value={s.id}>{s.icon} {s.id}</option>)}
          </select>
        </div>
        <div className="filter-item">
          <select value={filterPri} onChange={e => setFilterPri(e.target.value)}>
            <option value="">كل الأولويات</option>
            {PRIORITY_LEVELS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
      </div>

      {/* جدول */}
      <div className="table-wrap">
        {loading ? <div style={{ height: 200 }} className="skeleton" /> :
         filtered.length === 0 ? (
          <div className="empty-state"><div className="es-icon">🔧</div><div className="es-title">لا توجد بلاغات</div></div>
        ) : (
          <table>
            <thead>
              <tr><th>التاريخ</th><th>الموقع</th><th>الصنف</th><th>الكمية</th><th>الوصف</th><th>الأولوية</th><th>الحالة</th><th>إجراء</th></tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const si  = getStatusInfo(r.status)
                const pri = priInfo(r.priority)
                return (
                  <tr key={r.id}>
                    <td style={{ fontSize: 12 }}>{r.report_date}</td>
                    <td style={{ fontSize: 12 }}>
                      {r.source === 'warehouse' ? '🏭 المستودع' : `${r.masanda_name}${r.wing ? ` — ${isNaN(r.wing) ? r.wing : `جناح ${r.wing}`}` : ''}`}
                    </td>
                    <td style={{ fontWeight: 700 }}>{r.item_name}</td>
                    <td><span className="badge badge-accent">{r.affected_qty || '—'}</span></td>
                    <td style={{ fontSize: 12, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.description}>{r.description || r.notes || '—'}</td>
                    <td>
                      <span className="badge" style={{ background: pri.color + '22', color: pri.color }}>{pri.label}</span>
                    </td>
                    <td>
                      <span className="badge" style={{ background: si.color + '22', color: si.color, border: `1px solid ${si.color}44` }}>
                        {si.icon} {r.status}
                      </span>
                    </td>
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

      {/* نافذة الإضافة/التعديل */}
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
                  <label>التاريخ</label>
                  <input type="date" value={form.report_date} onChange={e => f({ report_date: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>الأولوية</label>
                  <select value={form.priority} onChange={e => f({ priority: e.target.value })}>
                    {PRIORITY_LEVELS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </div>

                {/* مصدر الصنف */}
                <div className="form-group" style={{ gridColumn: '1/-1' }}>
                  <label>مصدر الصنف</label>
                  <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                    {[{id:'wing',label:'🏠 جناح'},{id:'warehouse',label:'🏭 المستودع'}].map(opt => (
                      <button key={opt.id} type="button"
                        onClick={() => f({ source: opt.id, masanda_id: '', wing: '' })}
                        style={{
                          padding: '7px 18px', borderRadius: 'var(--rs)', cursor: 'pointer',
                          fontFamily: 'Cairo', fontSize: 13, fontWeight: 700,
                          border: `2px solid ${form.source === opt.id ? 'var(--accent)' : 'var(--border)'}`,
                          background: form.source === opt.id ? 'var(--accent-dim)' : 'var(--surface2)',
                          color: form.source === opt.id ? 'var(--accent)' : 'var(--text-muted)',
                        }}
                      >{opt.label}</button>
                    ))}
                  </div>
                </div>

                {form.source === 'wing' && <>
                  <div className="form-group">
                    <label>المساندة *</label>
                    <select value={form.masanda_id} onChange={e => f({ masanda_id: e.target.value, wing: '' })}>
                      <option value="">— اختر —</option>
                      {MASANDAT.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>الجناح *</label>
                    <select value={form.wing} onChange={e => f({ wing: e.target.value })}>
                      <option value="">— اختر —</option>
                      {wings(form.masanda_id).map(w => <option key={w} value={w}>{isNaN(w) ? w : `جناح ${w}`}</option>)}
                    </select>
                  </div>
                </>}

                <div className="form-group">
                  <label>الصنف *</label>
                  <select value={form.item_id} onChange={e => f({ item_id: e.target.value })}>
                    <option value="">— اختر الصنف —</option>
                    {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>الكمية</label>
                  <input type="number" min="1" value={form.affected_qty} onChange={e => f({ affected_qty: +e.target.value })} />
                </div>
                <div className="form-group">
                  <label>الجهة المحال إليها</label>
                  <input value={form.assigned_to || ''} onChange={e => f({ assigned_to: e.target.value })} placeholder="اسم الجهة أو الفني" />
                </div>
                <div className="form-group" style={{ gridColumn: '1/-1' }}>
                  <label>الوصف / الملاحظات</label>
                  <textarea value={form.description || ''} onChange={e => f({ description: e.target.value })} placeholder="اشرح العطل أو سبب البلاغ..." />
                </div>
              </div>

              {/* اختيار الحالة */}
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 10 }}>
                  الحالة الحالية {editId && oldStatus && <span style={{ color: 'var(--text-dim)' }}>(كانت: {oldStatus})</span>}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 8 }}>
                  {STATUSES.map(s => (
                    <button key={s.id} type="button"
                      onClick={() => f({ status: s.id })}
                      style={{
                        padding: '10px 12px', borderRadius: 'var(--rs)', cursor: 'pointer',
                        fontFamily: 'Cairo', fontSize: 12, fontWeight: 700,
                        border: `2px solid ${form.status === s.id ? s.color : 'var(--border)'}`,
                        background: form.status === s.id ? s.color + '18' : 'var(--surface2)',
                        color: form.status === s.id ? s.color : 'var(--text-muted)',
                        textAlign: 'right', transition: 'all .15s'
                      }}
                    >
                      <div>{s.icon} {s.id}</div>
                      <div style={{ fontSize: 10, opacity: .7, marginTop: 3, fontWeight: 400 }}>{s.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* تنبيه الأثر */}
              {currentStatusInfo && form.status !== (oldStatus || 'جديد') && (
                <div style={{
                  padding: '10px 14px', borderRadius: 'var(--rs)',
                  background: currentStatusInfo.color + '15',
                  border: `1px solid ${currentStatusInfo.color}44`,
                  fontSize: 12, color: currentStatusInfo.color, fontWeight: 700,
                  marginTop: 8
                }}>
                  {currentStatusInfo.icon} عند الحفظ: {currentStatusInfo.desc}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setModal(false)}>إلغاء</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? '⏳ جاري الحفظ...' : '💾 حفظ وتحديث الأرصدة'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
