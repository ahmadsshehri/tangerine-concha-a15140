import { useState, useEffect, useCallback } from 'react'
import { collection, getDocs, doc, setDoc } from 'firebase/firestore'
import { db } from '../../../lib/firebase'
import { useToast } from '../../../components/Toast'

export default function WarehousePage() {
  const toast = useToast()
  const [items,     setItems]     = useState([])
  const [inventory, setInventory] = useState([])
  const [loading,   setLoading]   = useState(false)
  const [modal,     setModal]     = useState(null)
  const [search,    setSearch]    = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [iSnap, wSnap] = await Promise.all([
        getDocs(collection(db, 'items')),
        getDocs(collection(db, 'warehouseInventory'))
      ])
      setItems(iSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(i => i.status === 'active'))
      setInventory(wSnap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (e) { toast('❌ ' + e.message, 'error') }
    setLoading(false)
  }, [toast])

  useEffect(() => { fetchData() }, [fetchData])

  const getInv = (itemId) => inventory.find(r => r.itemId === itemId)

  const saveInv = async (item, vals) => {
    const id = `warehouse_${item.id}`
    const good     = +vals.good_qty     || 0
    const faulty   = +vals.faulty_qty   || 0
    const check    = +vals.under_check_qty  || 0
    const repair   = +vals.under_repair_qty || 0
    const distrib  = +vals.pending_distribution_qty || 0
    const total    = good + faulty + check + repair + distrib
    try {
      await setDoc(doc(db, 'warehouseInventory', id), {
        itemId: item.id, itemName: item.name,
        total_qty: total, good_qty: good, faulty_qty: faulty,
        under_check_qty: check, under_repair_qty: repair,
        pending_distribution_qty: distrib,
        min_stock_qty: +vals.min_stock_qty || 0,
        notes: vals.notes || '',
        updatedAt: new Date().toISOString()
      })
      toast('✅ تم تحديث المستودع')
      await fetchData()
      setModal(null)
    } catch (e) { toast('❌ ' + e.message, 'error') }
  }

  const filtered = items.filter(i => !search || i.name?.includes(search))
  const totalGood  = inventory.reduce((s, r) => s + (r.good_qty || 0), 0)
  const totalFault = inventory.reduce((s, r) => s + (r.faulty_qty || 0), 0)

  return (
    <div className="animate-in">
      <div className="page-header">
        <div className="page-title" style={{ fontSize: 15 }}>🏭 المستودع الرئيسي</div>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 16 }}>
        {[
          { label: 'إجمالي الأصناف',  value: items.length, icon: '📦', color: 'var(--accent)' },
          { label: 'سليم جاهز',       value: totalGood,    icon: '✅', color: 'var(--green)' },
          { label: 'معطل',            value: totalFault,   icon: '🔴', color: 'var(--red)' },
          { label: 'تحت الإصلاح',    value: inventory.reduce((s,r)=>s+(r.under_repair_qty||0),0), icon: '🔧', color: 'var(--orange)' },
        ].map((s, i) => (
          <div key={i} className="stat-card" style={{ '--card-accent': s.color }}>
            <div className="stat-icon">{s.icon}</div>
            <div className="stat-value">{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="filters-bar">
        <div className="search-box" style={{ flex: 1 }}>
          <span className="search-icon">🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث باسم الصنف..." />
        </div>
      </div>

      <div className="table-wrap">
        {loading ? <div style={{ height: 200 }} className="skeleton" /> : (
          <table>
            <thead>
              <tr>
                <th>الصنف</th>
                <th>الإجمالي</th>
                <th>سليم (جاهز للصرف)</th>
                <th>معطل</th>
                <th>تحت الفحص</th>
                <th>تحت الإصلاح</th>
                <th>بانتظار التوزيع</th>
                <th>الحد الأدنى</th>
                <th>إجراء</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => {
                const inv = getInv(item.id)
                const belowMin = inv && inv.min_stock_qty > 0 && inv.good_qty < inv.min_stock_qty
                return (
                  <tr key={item.id} style={belowMin ? { background: 'rgba(248,81,73,.04)' } : {}}>
                    <td style={{ fontWeight: 700 }}>
                      {item.name}
                      {belowMin && <span className="badge badge-red" style={{ marginRight: 6, fontSize: 10 }}>تحت الحد الأدنى</span>}
                    </td>
                    <td><span className="badge badge-accent">{inv?.total_qty ?? '—'}</span></td>
                    <td><span className="badge badge-green">{inv?.good_qty ?? '—'}</span></td>
                    <td style={{ color: inv?.faulty_qty > 0 ? 'var(--red)' : 'var(--text-muted)', fontSize: 12 }}>{inv?.faulty_qty ?? '—'}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{inv?.under_check_qty ?? '—'}</td>
                    <td style={{ color: 'var(--orange)', fontSize: 12 }}>{inv?.under_repair_qty ?? '—'}</td>
                    <td style={{ color: 'var(--blue)', fontSize: 12 }}>{inv?.pending_distribution_qty ?? '—'}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{inv?.min_stock_qty ?? '—'}</td>
                    <td>
                      <button className="btn btn-blue btn-xs" onClick={() => setModal({ item, inv })}>تحديث</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <WarehouseModal data={modal} onSave={v => saveInv(modal.item, v)} onClose={() => setModal(null)} />
      )}
    </div>
  )
}

function WarehouseModal({ data, onSave, onClose }) {
  const { item, inv } = data
  const [v, setV] = useState({
    good_qty:     inv?.good_qty     ?? 0,
    faulty_qty:   inv?.faulty_qty   ?? 0,
    under_check_qty:  inv?.under_check_qty  ?? 0,
    under_repair_qty: inv?.under_repair_qty ?? 0,
    pending_distribution_qty: inv?.pending_distribution_qty ?? 0,
    min_stock_qty: inv?.min_stock_qty ?? 0,
    notes: inv?.notes ?? ''
  })
  const f = u => setV(p => ({ ...p, ...u }))

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">🏭 تحديث المستودع — {item.name}</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-row fr-2">
            {[
              { key: 'good_qty',     label: 'سليم (جاهز للصرف)' },
              { key: 'faulty_qty',   label: 'معطل' },
              { key: 'under_check_qty',  label: 'تحت الفحص' },
              { key: 'under_repair_qty', label: 'تحت الإصلاح' },
              { key: 'pending_distribution_qty', label: 'بانتظار التوزيع' },
              { key: 'min_stock_qty', label: 'الحد الأدنى للمخزون' },
            ].map(ff => (
              <div key={ff.key} className="form-group">
                <label>{ff.label}</label>
                <input type="number" min="0" value={v[ff.key]} onChange={e => f({ [ff.key]: e.target.value })} />
              </div>
            ))}
          </div>
          <div className="form-group" style={{ marginTop: 12 }}>
            <label>ملاحظات</label>
            <textarea value={v.notes} onChange={e => f({ notes: e.target.value })} />
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
