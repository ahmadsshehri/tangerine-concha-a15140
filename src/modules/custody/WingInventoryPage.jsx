import { useState, useEffect, useCallback } from 'react'
import { collection, getDocs, doc, setDoc } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useToast } from '../../components/Toast'
import { MASANDAT } from '../../lib/constants'

export default function WingInventoryPage() {
  const toast = useToast()
  const [items,     setItems]     = useState([])
  const [inventory, setInventory] = useState([])
  const [loading,   setLoading]   = useState(false)
  const [selM,      setSelM]      = useState(null)
  const [selW,      setSelW]      = useState(null)
  const [modal,     setModal]     = useState(null) // item record for editing

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [iSnap, invSnap] = await Promise.all([
        getDocs(collection(db, 'items')),
        getDocs(collection(db, 'wingInventory'))
      ])
      setItems(iSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(i => i.status === 'active' && i.isCustodyItem))
      setInventory(invSnap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (e) { toast('❌ ' + e.message, 'error') }
    setLoading(false)
  }, [toast])

  useEffect(() => { fetchData() }, [fetchData])

  const wingKey = (masandaId, wing) => `${masandaId}_${String(wing).replace(/\s/g,'_')}`

  const getInv = (masandaId, wing, itemId) => {
    const wk = wingKey(masandaId, wing)
    return inventory.find(r => r.locationId === wk && r.itemId === itemId)
  }

  const saveInv = async (masandaId, wing, item, vals) => {
    const wk = wingKey(masandaId, wing)
    const id = `${wk}_${item.id}`
    const good    = +vals.good_qty    || 0
    const faulty  = +vals.faulty_qty  || 0
    const pending = +vals.pending_pickup_qty || 0
    const maint   = +vals.under_maintenance_qty || 0
    const missing = +vals.missing_qty || 0
    const received = good + faulty + pending + maint + missing
    const stdQty = +(vals.standard_qty ?? item.defaultStandardQty ?? 0)
    const shortage = Math.max(0, stdQty - good)

    const record = {
      locationId: wk, masandaId, wing: String(wing),
      itemId: item.id, itemName: item.name,
      received_qty: received, good_qty: good, faulty_qty: faulty,
      pending_pickup_qty: pending, under_maintenance_qty: maint,
      missing_qty: missing, available_qty: good,
      standard_qty: stdQty, shortage_qty: shortage,
      current_committee: vals.current_committee || '',
      last_inventory_date: vals.last_inventory_date || new Date().toISOString().split('T')[0],
      notes: vals.notes || '',
      updatedAt: new Date().toISOString()
    }
    try {
      await setDoc(doc(db, 'wingInventory', id), record)
      toast('✅ تم الحفظ')
      await fetchData()
      setModal(null)
    } catch (e) { toast('❌ ' + e.message, 'error') }
  }

  const m = selM !== null ? MASANDAT[selM] : null
  const wingItems = (selM !== null && selW !== null)
    ? items.map(item => ({ item, inv: getInv(m.id, selW, item.id) }))
    : []

  const totalShortage = wingItems.reduce((s, wi) => s + (wi.inv?.shortage_qty || 0), 0)
  const totalGood     = wingItems.reduce((s, wi) => s + (wi.inv?.good_qty     || 0), 0)

  return (
    <div className="animate-in">
      <div className="page-header">
        <div className="page-title" style={{ fontSize: 15 }}>🏠 عهدة الأجنحة</div>
        {selM !== null && selW !== null && (
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {m.name} — جناح {selW}
          </div>
        )}
      </div>

      {/* Masanda selector */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-title">اختر المساندة</div>
        <div className="masanda-grid">
          {MASANDAT.map((ms, i) => (
            <div key={i}
              className={`masanda-card ${selM === i ? 'active' : ''}`}
              onClick={() => { setSelM(i); setSelW(null) }}
            >
              <div className="mc-name">{ms.name}</div>
              <div className="mc-sub">{ms.wings.length} أجنحة</div>
            </div>
          ))}
        </div>
      </div>

      {/* Wing selector */}
      {selM !== null && (
        <div className="card animate-in" style={{ marginBottom: 12 }}>
          <div className="card-title">اختر الجناح</div>
          <div className="wing-grid">
            {m.wings.map(w => (
              <button key={w}
                className={`wing-btn ${String(selW) === String(w) ? 'active' : ''}`}
                onClick={() => setSelW(w)}
              >
                {isNaN(w) ? w : `جناح ${w}`}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Inventory table */}
      {selM !== null && selW !== null && (
        <div className="animate-in">
          {/* Stats */}
          <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 14 }}>
            {[
              { label: 'إجمالي السليم',   value: totalGood,      icon: '✅', color: 'var(--green)' },
              { label: 'إجمالي العجز',    value: totalShortage,  icon: '⚠️', color: 'var(--red)' },
              { label: 'أصناف مُدخلة',   value: wingItems.filter(wi => wi.inv).length, icon: '📦', color: 'var(--accent)' },
              { label: 'أصناف بدون بيانات', value: wingItems.filter(wi => !wi.inv).length, icon: '❓', color: 'var(--orange)' },
            ].map((s, i) => (
              <div key={i} className="stat-card" style={{ '--card-accent': s.color }}>
                <div className="stat-icon">{s.icon}</div>
                <div className="stat-value">{s.value}</div>
                <div className="stat-label">{s.label}</div>
              </div>
            ))}
          </div>

          <div className="table-wrap">
            {loading ? <div style={{ height: 200 }} className="skeleton" /> : (
              <table>
                <thead>
                  <tr>
                    <th>الصنف</th>
                    <th>سليم</th>
                    <th>معطل</th>
                    <th>بانتظار السحب</th>
                    <th>تحت الصيانة</th>
                    <th>مفقود</th>
                    <th>الحد المعياري</th>
                    <th>العجز</th>
                    <th>اللجنة</th>
                    <th>إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {wingItems.map(({ item, inv }) => (
                    <tr key={item.id}>
                      <td style={{ fontWeight: 700 }}>{item.name}</td>
                      <td><span className="badge badge-green">{inv?.good_qty ?? '—'}</span></td>
                      <td><span className={inv?.faulty_qty ? 'badge badge-red' : ''}>{inv?.faulty_qty ?? '—'}</span></td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{inv?.pending_pickup_qty ?? '—'}</td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{inv?.under_maintenance_qty ?? '—'}</td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{inv?.missing_qty ?? '—'}</td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{inv?.standard_qty ?? item.defaultStandardQty ?? '—'}</td>
                      <td>
                        {inv?.shortage_qty > 0
                          ? <span className="badge badge-red">-{inv.shortage_qty}</span>
                          : <span className="badge badge-green">✓</span>}
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--blue)' }}>{inv?.current_committee || '—'}</td>
                      <td>
                        <button className="btn btn-blue btn-xs" onClick={() => setModal({ item, inv, masandaId: m.id, wing: selW })}>
                          تحديث
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {modal && (
        <InventoryModal
          data={modal}
          onSave={vals => saveInv(modal.masandaId, modal.wing, modal.item, vals)}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}

function InventoryModal({ data, onSave, onClose }) {
  const { item, inv } = data
  const [v, setV] = useState({
    good_qty:               inv?.good_qty ?? 0,
    faulty_qty:             inv?.faulty_qty ?? 0,
    pending_pickup_qty:     inv?.pending_pickup_qty ?? 0,
    under_maintenance_qty:  inv?.under_maintenance_qty ?? 0,
    missing_qty:            inv?.missing_qty ?? 0,
    standard_qty:           inv?.standard_qty ?? item.defaultStandardQty ?? 0,
    current_committee:      inv?.current_committee ?? '',
    last_inventory_date:    inv?.last_inventory_date ?? new Date().toISOString().split('T')[0],
    notes:                  inv?.notes ?? ''
  })
  const f = upd => setV(p => ({ ...p, ...upd }))

  const fields = [
    { key: 'good_qty',              label: 'الكمية السليمة',         type: 'number' },
    { key: 'faulty_qty',            label: 'الكمية المعطلة',         type: 'number' },
    { key: 'pending_pickup_qty',    label: 'بانتظار السحب',          type: 'number' },
    { key: 'under_maintenance_qty', label: 'تحت الصيانة',            type: 'number' },
    { key: 'missing_qty',           label: 'الكمية المفقودة',        type: 'number' },
    { key: 'standard_qty',          label: 'الحد المعياري للجناح',   type: 'number' },
  ]

  const total = +v.good_qty + +v.faulty_qty + +v.pending_pickup_qty + +v.under_maintenance_qty + +v.missing_qty
  const shortage = Math.max(0, +v.standard_qty - +v.good_qty)

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">📦 تحديث عهدة — {item.name}</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-row fr-2" style={{ marginBottom: 12 }}>
            {fields.map(ff => (
              <div key={ff.key} className="form-group">
                <label>{ff.label}</label>
                <input type="number" min="0" value={v[ff.key]}
                  onChange={e => f({ [ff.key]: e.target.value })} />
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12, padding: 12, background: 'var(--surface2)', borderRadius: 'var(--rs)' }}>
            <div style={{ fontSize: 12 }}>📦 إجمالي المستلم: <strong style={{ color: 'var(--accent)' }}>{total}</strong></div>
            <div style={{ fontSize: 12 }}>⚠️ العجز: <strong style={{ color: shortage > 0 ? 'var(--red)' : 'var(--green)' }}>{shortage > 0 ? `-${shortage}` : '✓ لا عجز'}</strong></div>
          </div>

          <div className="form-row fr-2" style={{ marginBottom: 12 }}>
            <div className="form-group">
              <label>اسم اللجنة الحالية</label>
              <input value={v.current_committee} onChange={e => f({ current_committee: e.target.value })} placeholder="مثال: لجنة شهر شوال" />
            </div>
            <div className="form-group">
              <label>تاريخ آخر جرد</label>
              <input type="date" value={v.last_inventory_date} onChange={e => f({ last_inventory_date: e.target.value })} />
            </div>
          </div>
          <div className="form-group">
            <label>ملاحظات</label>
            <textarea value={v.notes} onChange={e => f({ notes: e.target.value })} placeholder="ملاحظات اختيارية..." />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>إلغاء</button>
          <button className="btn btn-primary" onClick={() => onSave(v)}>💾 حفظ</button>
        </div>
      </div>
    </div>
  )
}
