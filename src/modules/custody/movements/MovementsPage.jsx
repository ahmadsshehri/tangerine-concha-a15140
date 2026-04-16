import { useState, useEffect, useCallback } from 'react'
import { collection, getDocs, doc, setDoc, getDoc } from 'firebase/firestore'
import { db } from '../../../lib/firebase'
import { useAuth } from '../../../hooks/useAuth'
import { useToast } from '../../../components/Toast'
import { MASANDAT, MOVEMENT_TYPES, MOVEMENT_STATUSES } from '../../../lib/constants'

const EMPTY_FORM = {
  movement_type_id: 'dispatch',
  movement_date: new Date().toISOString().split('T')[0],
  masanda_id: '', from_location: '', to_location: '',
  item_id: '', qty: '', status: 'معتمدة',
  delivered_by: '', received_by: '', notes: ''
}

async function updateWarehouse(itemId, itemName, delta) {
  const ref  = doc(db, 'warehouseInventory', `warehouse_${itemId}`)
  const snap = await getDoc(ref)
  const cur  = snap.exists() ? snap.data() : { good_qty: 0, total_qty: 0 }
  await setDoc(ref, {
    ...cur, itemId, itemName,
    good_qty:  Math.max(0, (cur.good_qty  || 0) + delta),
    total_qty: Math.max(0, (cur.total_qty || 0) + delta),
    updatedAt: new Date().toISOString()
  }, { merge: true })
}

async function updateWingInv(locationId, itemId, itemName, delta, masandaId, wing) {
  const ref  = doc(db, 'wingInventory', `${locationId}_${itemId}`)
  const snap = await getDoc(ref)
  const cur  = snap.exists() ? snap.data() : { good_qty: 0, received_qty: 0 }
  const newGood = Math.max(0, (cur.good_qty || 0) + delta)
  await setDoc(ref, {
    ...cur, locationId, itemId, itemName, masandaId,
    wing: String(wing),
    good_qty:     newGood,
    received_qty: Math.max(0, (cur.received_qty || 0) + delta),
    available_qty: newGood,
    updatedAt: new Date().toISOString()
  }, { merge: true })
}

function parseWing(locId) {
  if (!locId || locId === 'warehouse') return null
  const m = MASANDAT.find(m => locId.startsWith(m.id))
  if (!m) return null
  const wing = locId.replace(m.id + '_', '').replace(/_/g, ' ')
  return { masandaId: m.id, wing: isNaN(wing) ? wing : +wing, locationId: locId }
}

async function applyMovement(form, items) {
  const item     = items.find(i => i.id === form.item_id)
  const itemName = item?.name || ''
  const qty      = +form.qty || 0
  const fromW    = parseWing(form.from_location)
  const toW      = parseWing(form.to_location)

  switch (form.movement_type_id) {
    case 'dispatch':     // مستودع → جناح
      await updateWarehouse(form.item_id, itemName, -qty)
      if (toW) await updateWingInv(toW.locationId, form.item_id, itemName, +qty, toW.masandaId, toW.wing)
      break
    case 'return':       // جناح → مستودع
      if (fromW) await updateWingInv(fromW.locationId, form.item_id, itemName, -qty, fromW.masandaId, fromW.wing)
      await updateWarehouse(form.item_id, itemName, +qty)
      break
    case 'transfer':     // جناح → جناح
      if (fromW) await updateWingInv(fromW.locationId, form.item_id, itemName, -qty, fromW.masandaId, fromW.wing)
      if (toW)   await updateWingInv(toW.locationId,   form.item_id, itemName, +qty, toW.masandaId,   toW.wing)
      break
    case 'maintenance':  // سحب صيانة من جناح
      if (fromW) {
        const ref  = doc(db, 'wingInventory', `${fromW.locationId}_${form.item_id}`)
        const snap = await getDoc(ref)
        const cur  = snap.exists() ? snap.data() : {}
        await setDoc(ref, { ...cur,
          good_qty: Math.max(0, (cur.good_qty || 0) - qty),
          under_maintenance_qty: (cur.under_maintenance_qty || 0) + qty,
          updatedAt: new Date().toISOString()
        }, { merge: true })
      }
      break
    case 'return_maint': // إرجاع من صيانة للجناح
      if (toW) {
        const ref  = doc(db, 'wingInventory', `${toW.locationId}_${form.item_id}`)
        const snap = await getDoc(ref)
        const cur  = snap.exists() ? snap.data() : {}
        await setDoc(ref, { ...cur,
          good_qty: (cur.good_qty || 0) + qty,
          under_maintenance_qty: Math.max(0, (cur.under_maintenance_qty || 0) - qty),
          updatedAt: new Date().toISOString()
        }, { merge: true })
      }
      break
    case 'opening':      // رصيد افتتاحي
      await updateWarehouse(form.item_id, itemName, +qty)
      break
    case 'damage':       // إتلاف
      if (fromW) await updateWingInv(fromW.locationId, form.item_id, itemName, -qty, fromW.masandaId, fromW.wing)
      else       await updateWarehouse(form.item_id, itemName, -qty)
      break
    case 'lost':         // فقد
      if (fromW) {
        const ref  = doc(db, 'wingInventory', `${fromW.locationId}_${form.item_id}`)
        const snap = await getDoc(ref)
        const cur  = snap.exists() ? snap.data() : {}
        await setDoc(ref, { ...cur,
          good_qty:    Math.max(0, (cur.good_qty    || 0) - qty),
          missing_qty: (cur.missing_qty || 0) + qty,
          updatedAt: new Date().toISOString()
        }, { merge: true })
      }
      break
    default: break
  }
}

export default function MovementsPage() {
  const { name } = useAuth()
  const toast = useToast()
  const [records,      setRecords]      = useState([])
  const [items,        setItems]        = useState([])
  const [loading,      setLoading]      = useState(false)
  const [saving,       setSaving]       = useState(false)
  const [modal,        setModal]        = useState(false)
  const [form,         setForm]         = useState(EMPTY_FORM)
  const [filterType,   setFilterType]   = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [search,       setSearch]       = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [mSnap, iSnap] = await Promise.all([
        getDocs(collection(db, 'movements')),
        getDocs(collection(db, 'items'))
      ])
      const movs = mSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      movs.sort((a, b) => (b.movement_date || '') > (a.movement_date || '') ? 1 : -1)
      setRecords(movs)
      setItems(iSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(i => i.status === 'active'))
    } catch (e) { toast('❌ ' + e.message, 'error') }
    setLoading(false)
  }, [toast])

  useEffect(() => { fetchData() }, [fetchData])

  const f = upd => setForm(p => ({ ...p, ...upd }))

  const save = async () => {
    if (!form.item_id || !form.qty || !form.movement_date) {
      toast('⚠️ الصنف والكمية والتاريخ مطلوبة', 'warn'); return
    }
    const needsFrom = ['return','transfer','maintenance','damage','lost'].includes(form.movement_type_id)
    const needsTo   = ['dispatch','transfer','return_maint'].includes(form.movement_type_id)
    if (needsFrom && !form.from_location) { toast('⚠️ حدد موقع المصدر', 'warn'); return }
    if (needsTo   && !form.to_location)   { toast('⚠️ حدد موقع الوجهة', 'warn'); return }

    setSaving(true)
    try {
      const id       = `mov_${Date.now()}`
      const typeInfo = MOVEMENT_TYPES.find(t => t.id === form.movement_type_id)
      const itemName = items.find(i => i.id === form.item_id)?.name || ''

      await setDoc(doc(db, 'movements', id), {
        ...form, id, movement_number: id,
        type_label: typeInfo?.label || '',
        item_name: itemName,
        created_by: name,
        createdAt: new Date().toISOString()
      })

      if (form.status === 'معتمدة') {
        await applyMovement(form, items)
        toast('✅ تم الحفظ وتحديث الأرصدة')
      } else {
        toast('✅ تم الحفظ (معلقة - لم تؤثر على الأرصدة بعد)')
      }

      setModal(false); setForm(EMPTY_FORM); fetchData()
    } catch (e) { toast('❌ ' + e.message, 'error') }
    setSaving(false)
  }

  const filtered = records.filter(r =>
    (!filterType   || r.movement_type_id === filterType) &&
    (!filterStatus || r.status === filterStatus) &&
    (!search       || r.item_name?.includes(search) || r.movement_number?.includes(search))
  )

  const wingOptions = form.masanda_id
    ? (MASANDAT.find(m => m.id === form.masanda_id)?.wings || []).map(w => ({
        value: `${form.masanda_id}_${String(w).replace(/\s/g, '_')}`,
        label: isNaN(w) ? w : `جناح ${w}`
      }))
    : []

  const showFrom = ['return','transfer','maintenance','damage','lost'].includes(form.movement_type_id)
  const showTo   = ['dispatch','transfer','return_maint','opening'].includes(form.movement_type_id)
  const statusBadge = { 'معلقة': 'badge-orange', 'معتمدة': 'badge-green', 'ملغاة': 'badge-dim' }

  return (
    <div className="animate-in">
      <div className="page-header">
        <div className="page-title" style={{ fontSize: 15 }}>🔄 سجل الحركات</div>
        <button className="btn btn-primary" onClick={() => { setForm(EMPTY_FORM); setModal(true) }}>+ حركة جديدة</button>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 14 }}>
        {[
          { label: 'إجمالي الحركات', value: records.length, icon: '📋', color: 'var(--accent)' },
          { label: 'معتمدة',  value: records.filter(r => r.status === 'معتمدة').length, icon: '✅', color: 'var(--green)' },
          { label: 'معلقة',   value: records.filter(r => r.status === 'معلقة').length,  icon: '⏳', color: 'var(--orange)' },
          { label: 'صرف من مستودع', value: records.filter(r => r.movement_type_id === 'dispatch').length, icon: '📤', color: 'var(--blue)' },
        ].map((s, i) => (
          <div key={i} className="stat-card" style={{ '--card-accent': s.color }}>
            <div className="stat-icon">{s.icon}</div>
            <div className="stat-value">{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="filters-bar">
        <div className="search-box" style={{ flex: 2 }}>
          <span className="search-icon">🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث..." />
        </div>
        <div className="filter-item">
          <select value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="">كل الأنواع</option>
            {MOVEMENT_TYPES.map(t => <option key={t.id} value={t.id}>{t.icon} {t.label}</option>)}
          </select>
        </div>
        <div className="filter-item">
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">كل الحالات</option>
            {MOVEMENT_STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div className="table-wrap">
        {loading ? <div style={{ height: 200 }} className="skeleton" /> :
         filtered.length === 0 ? (
          <div className="empty-state"><div className="es-icon">🔄</div><div className="es-title">لا توجد حركات</div></div>
        ) : (
          <table>
            <thead>
              <tr><th>النوع</th><th>التاريخ</th><th>الصنف</th><th>الكمية</th><th>من</th><th>إلى</th><th>الحالة</th><th>أدخل</th></tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id}>
                  <td style={{ fontSize: 12 }}>{MOVEMENT_TYPES.find(t=>t.id===r.movement_type_id)?.icon} {MOVEMENT_TYPES.find(t=>t.id===r.movement_type_id)?.label || r.movement_type_id}</td>
                  <td style={{ fontSize: 12 }}>{r.movement_date}</td>
                  <td style={{ fontWeight: 700 }}>{r.item_name}</td>
                  <td><span className="badge badge-accent">{r.qty}</span></td>
                  <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.from_location === 'warehouse' ? '🏭 المستودع' : r.from_location || '—'}</td>
                  <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.to_location   === 'warehouse' ? '🏭 المستودع' : r.to_location   || '—'}</td>
                  <td><span className={`badge ${statusBadge[r.status] || 'badge-dim'}`}>{r.status}</span></td>
                  <td style={{ fontSize: 11, color: 'var(--blue)' }}>{r.created_by || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="modal modal-lg">
            <div className="modal-header">
              <div className="modal-title">➕ تسجيل حركة جديدة</div>
              <button className="modal-close" onClick={() => setModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-row fr-2" style={{ marginBottom: 12 }}>
                <div className="form-group">
                  <label>نوع الحركة *</label>
                  <select value={form.movement_type_id} onChange={e => f({ movement_type_id: e.target.value, from_location: '', to_location: '' })}>
                    {MOVEMENT_TYPES.map(t => <option key={t.id} value={t.id}>{t.icon} {t.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>التاريخ *</label>
                  <input type="date" value={form.movement_date} onChange={e => f({ movement_date: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>الصنف *</label>
                  <select value={form.item_id} onChange={e => f({ item_id: e.target.value })}>
                    <option value="">— اختر الصنف —</option>
                    {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>الكمية *</label>
                  <input type="number" min="1" value={form.qty} onChange={e => f({ qty: e.target.value })} placeholder="0" />
                </div>
                <div className="form-group" style={{ gridColumn: '1/-1' }}>
                  <label>المساندة (لتحديد الجناح)</label>
                  <select value={form.masanda_id} onChange={e => f({ masanda_id: e.target.value, from_location: '', to_location: '' })}>
                    <option value="">— اختر المساندة —</option>
                    {MASANDAT.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
                {showFrom && (
                  <div className="form-group">
                    <label>من موقع *</label>
                    <select value={form.from_location} onChange={e => f({ from_location: e.target.value })}>
                      <option value="">— اختر —</option>
                      <option value="warehouse">🏭 المستودع الرئيسي</option>
                      {wingOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                )}
                {showTo && (
                  <div className="form-group">
                    <label>إلى موقع *</label>
                    <select value={form.to_location} onChange={e => f({ to_location: e.target.value })}>
                      <option value="">— اختر —</option>
                      <option value="warehouse">🏭 المستودع الرئيسي</option>
                      {wingOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                )}
                <div className="form-group">
                  <label>حالة الحركة</label>
                  <select value={form.status} onChange={e => f({ status: e.target.value })}>
                    {MOVEMENT_STATUSES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>من سلّم</label>
                  <input value={form.delivered_by} onChange={e => f({ delivered_by: e.target.value })} placeholder="اسم المسلِّم" />
                </div>
                <div className="form-group">
                  <label>من استلم</label>
                  <input value={form.received_by} onChange={e => f({ received_by: e.target.value })} placeholder="اسم المستلِم" />
                </div>
                <div className="form-group" style={{ gridColumn: '1/-1' }}>
                  <label>ملاحظات</label>
                  <textarea value={form.notes} onChange={e => f({ notes: e.target.value })} placeholder="اختياري..." />
                </div>
              </div>
              <div style={{ padding: '10px 14px', borderRadius: 'var(--rs)', fontSize: 12,
                background: form.status === 'معتمدة' ? 'rgba(63,185,80,.1)' : 'rgba(227,179,65,.1)',
                border: `1px solid ${form.status === 'معتمدة' ? 'var(--green)' : 'var(--orange)'}`,
                color: form.status === 'معتمدة' ? 'var(--green)' : 'var(--orange)' }}>
                {form.status === 'معتمدة'
                  ? '✅ الحركة المعتمدة ستحدث الأرصدة فوراً عند الحفظ'
                  : '⚠️ الحركة المعلقة لن تؤثر على الأرصدة حتى يتم اعتمادها'}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setModal(false)}>إلغاء</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? '⏳ جاري الحفظ...' : '💾 حفظ الحركة'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
