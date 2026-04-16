import { useState, useEffect, useCallback } from 'react'
import { collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore'
import { db } from '../../../lib/firebase'
import { useAuth } from '../../../hooks/useAuth'
import { useToast } from '../../../components/Toast'
import { MASANDAT } from '../../../lib/constants'

const EMPTY = {
  masanda_id: '', wing: '', committee_name: '', committee_head: '',
  start_date: new Date().toISOString().split('T')[0], end_date: '', status: 'حالية', notes: ''
}

export default function CommitteesPage() {
  const { name, isAdmin } = useAuth()
  const toast = useToast()
  const [records,  setRecords]  = useState([])
  const [loading,  setLoading]  = useState(false)
  const [tab,      setTab]      = useState('committees')
  const [modal,    setModal]    = useState(false)
  const [form,     setForm]     = useState(EMPTY)
  const [editId,   setEditId]   = useState(null)

  // Handover
  const [hoModal,  setHoModal]  = useState(false)
  const [hoForm,   setHoForm]   = useState({
    masanda_id: '', wing: '', previous_committee_id: '', new_committee_name: '',
    new_committee_head: '', handover_date: new Date().toISOString().split('T')[0],
    receive_date: '', matching_status: 'مطابق', variance_notes: '',
    paper_form_number: '', notes: ''
  })
  const [handovers, setHandovers] = useState([])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [cSnap, hSnap] = await Promise.all([
        getDocs(collection(db, 'committees')),
        getDocs(collection(db, 'committeeHandovers'))
      ])
      setRecords(cSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      setHandovers(hSnap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (e) { toast('❌ ' + e.message, 'error') }
    setLoading(false)
  }, [toast])

  useEffect(() => { fetchData() }, [fetchData])

  const f  = u => setForm(p => ({ ...p, ...u }))
  const hf = u => setHoForm(p => ({ ...p, ...u }))

  const save = async () => {
    if (!form.committee_name || !form.masanda_id || !form.wing) {
      toast('⚠️ اسم اللجنة والموقع مطلوبان', 'warn'); return
    }
    const id = editId || `com_${Date.now()}`
    const m  = MASANDAT.find(m => m.id === form.masanda_id)
    try {
      await setDoc(doc(db, 'committees', id), {
        ...form, id,
        masanda_name: m?.name || '',
        location_id: `${form.masanda_id}_${String(form.wing).replace(/\s/g,'_')}`,
        created_by: name,
        createdAt: new Date().toISOString()
      })
      toast('✅ تم الحفظ')
      setModal(false); setEditId(null); setForm(EMPTY); fetchData()
    } catch (e) { toast('❌ ' + e.message, 'error') }
  }

  const saveHandover = async () => {
    if (!hoForm.masanda_id || !hoForm.wing || !hoForm.new_committee_name) {
      toast('⚠️ يرجى ملء الحقول المطلوبة', 'warn'); return
    }
    const id = `ho_${Date.now()}`
    const m  = MASANDAT.find(m => m.id === hoForm.masanda_id)
    const prevCom = records.find(r => r.id === hoForm.previous_committee_id)
    try {
      // Save handover record
      await setDoc(doc(db, 'committeeHandovers', id), {
        ...hoForm, id,
        masanda_name: m?.name || '',
        location_id: `${hoForm.masanda_id}_${String(hoForm.wing).replace(/\s/g,'_')}`,
        previous_committee_name: prevCom?.committee_name || '',
        created_by: name,
        createdAt: new Date().toISOString()
      })
      // Mark old committee as ended
      if (hoForm.previous_committee_id && prevCom) {
        await setDoc(doc(db, 'committees', hoForm.previous_committee_id), {
          ...prevCom, status: 'منتهية', end_date: hoForm.handover_date
        })
      }
      // Create new committee record
      const newComId = `com_${Date.now() + 1}`
      await setDoc(doc(db, 'committees', newComId), {
        masanda_id: hoForm.masanda_id,
        masanda_name: m?.name || '',
        wing: hoForm.wing,
        location_id: `${hoForm.masanda_id}_${String(hoForm.wing).replace(/\s/g,'_')}`,
        committee_name: hoForm.new_committee_name,
        committee_head: hoForm.new_committee_head,
        start_date: hoForm.receive_date || hoForm.handover_date,
        status: 'حالية',
        created_by: name,
        createdAt: new Date().toISOString()
      })
      toast('✅ تم تسجيل محضر الاستلام والتسليم')
      setHoModal(false)
      setHoForm({
        masanda_id: '', wing: '', previous_committee_id: '', new_committee_name: '',
        new_committee_head: '', handover_date: new Date().toISOString().split('T')[0],
        receive_date: '', matching_status: 'مطابق', variance_notes: '',
        paper_form_number: '', notes: ''
      })
      fetchData()
    } catch (e) { toast('❌ ' + e.message, 'error') }
  }

  const del = async (id) => {
    if (!isAdmin || !confirm('حذف هذه اللجنة؟')) return
    try { await deleteDoc(doc(db, 'committees', id)); toast('🗑️ تم الحذف'); fetchData() }
    catch (e) { toast('❌ ' + e.message, 'error') }
  }

  // Wing options for selected masanda
  const wings = (masandaId) =>
    MASANDAT.find(m => m.id === masandaId)?.wings || []

  // Current committees for selected masanda+wing
  const currentComs = (masandaId, wing) =>
    records.filter(r => r.masanda_id === masandaId && String(r.wing) === String(wing) && r.status === 'حالية')

  const active   = records.filter(r => r.status === 'حالية')
  const inactive = records.filter(r => r.status !== 'حالية')

  return (
    <div className="animate-in">
      <div className="page-header">
        <div className="page-title" style={{ fontSize: 15 }}>👥 إدارة اللجان</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-outline" onClick={() => setHoModal(true)}>📋 محضر استلام وتسليم</button>
          <button className="btn btn-primary" onClick={() => { setForm(EMPTY); setEditId(null); setModal(true) }}>+ لجنة جديدة</button>
        </div>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 14 }}>
        {[
          { label: 'لجان حالية',  value: active.length,   icon: '✅', color: 'var(--green)' },
          { label: 'لجان منتهية', value: inactive.length, icon: '📁', color: 'var(--text-muted)' },
          { label: 'محاضر التسليم', value: handovers.length, icon: '📋', color: 'var(--blue)' },
        ].map((s, i) => (
          <div key={i} className="stat-card" style={{ '--card-accent': s.color }}>
            <div className="stat-icon">{s.icon}</div>
            <div className="stat-value">{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="tabs">
        <button className={`tab-btn ${tab === 'committees' ? 'active' : ''}`} onClick={() => setTab('committees')}>اللجان الحالية</button>
        <button className={`tab-btn ${tab === 'history'    ? 'active' : ''}`} onClick={() => setTab('history')}>اللجان المنتهية</button>
        <button className={`tab-btn ${tab === 'handovers'  ? 'active' : ''}`} onClick={() => setTab('handovers')}>محاضر الاستلام والتسليم</button>
      </div>

      {/* Committees Table */}
      {(tab === 'committees' || tab === 'history') && (
        <div className="table-wrap">
          {loading ? <div style={{ height: 150 }} className="skeleton" /> : (
            <table>
              <thead>
                <tr>
                  <th>المساندة</th><th>الجناح</th><th>اسم اللجنة</th>
                  <th>رئيس اللجنة</th><th>تاريخ البدء</th><th>الحالة</th>
                  {isAdmin && <th>إجراءات</th>}
                </tr>
              </thead>
              <tbody>
                {(tab === 'committees' ? active : inactive).map(r => (
                  <tr key={r.id}>
                    <td style={{ fontSize: 12 }}>{r.masanda_name}</td>
                    <td style={{ fontWeight: 700 }}>{isNaN(r.wing) ? r.wing : `جناح ${r.wing}`}</td>
                    <td>{r.committee_name}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.committee_head || '—'}</td>
                    <td style={{ fontSize: 12 }}>{r.start_date}</td>
                    <td>
                      <span className={`badge ${r.status === 'حالية' ? 'badge-green' : 'badge-dim'}`}>{r.status}</span>
                    </td>
                    {isAdmin && (
                      <td>
                        <div style={{ display: 'flex', gap: 5 }}>
                          <button className="btn btn-blue btn-xs" onClick={() => { setForm({...EMPTY,...r}); setEditId(r.id); setModal(true) }}>تعديل</button>
                          <button className="btn btn-danger btn-xs" onClick={() => del(r.id)}>حذف</button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Handovers Table */}
      {tab === 'handovers' && (
        <div className="table-wrap">
          {loading ? <div style={{ height: 150 }} className="skeleton" /> :
           handovers.length === 0 ? (
            <div className="empty-state">
              <div className="es-icon">📋</div>
              <div className="es-title">لا توجد محاضر</div>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>الموقع</th><th>اللجنة السابقة</th><th>اللجنة الجديدة</th>
                  <th>تاريخ التسليم</th><th>المطابقة</th><th>ملاحظات</th>
                </tr>
              </thead>
              <tbody>
                {[...handovers].sort((a,b) => (b.handover_date||'') > (a.handover_date||'') ? 1 : -1).map(r => (
                  <tr key={r.id}>
                    <td style={{ fontSize: 12 }}>{r.masanda_name} — {isNaN(r.wing) ? r.wing : `جناح ${r.wing}`}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{r.previous_committee_name || '—'}</td>
                    <td style={{ fontWeight: 700 }}>{r.new_committee_name}</td>
                    <td style={{ fontSize: 12 }}>{r.handover_date}</td>
                    <td>
                      <span className={`badge ${r.matching_status === 'مطابق' ? 'badge-green' : 'badge-orange'}`}>
                        {r.matching_status}
                      </span>
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--text-muted)', maxWidth: 200 }}>{r.variance_notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Add Committee Modal */}
      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">{editId ? '✏️ تعديل اللجنة' : '➕ لجنة جديدة'}</div>
              <button className="modal-close" onClick={() => setModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-row fr-2" style={{ marginBottom: 12 }}>
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
                    {wings(form.masanda_id).map(w => (
                      <option key={w} value={w}>{isNaN(w) ? w : `جناح ${w}`}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>اسم اللجنة *</label>
                  <input value={form.committee_name} onChange={e => f({ committee_name: e.target.value })} placeholder="مثال: لجنة شهر شوال" />
                </div>
                <div className="form-group">
                  <label>رئيس اللجنة</label>
                  <input value={form.committee_head} onChange={e => f({ committee_head: e.target.value })} placeholder="اختياري" />
                </div>
                <div className="form-group">
                  <label>تاريخ البدء</label>
                  <input type="date" value={form.start_date} onChange={e => f({ start_date: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>الحالة</label>
                  <select value={form.status} onChange={e => f({ status: e.target.value })}>
                    <option>حالية</option>
                    <option>منتهية</option>
                  </select>
                </div>
                <div className="form-group" style={{ gridColumn: '1/-1' }}>
                  <label>ملاحظات</label>
                  <textarea value={form.notes} onChange={e => f({ notes: e.target.value })} />
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

      {/* Handover Modal */}
      {hoModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setHoModal(false)}>
          <div className="modal modal-lg">
            <div className="modal-header">
              <div className="modal-title">📋 محضر استلام وتسليم شهري</div>
              <button className="modal-close" onClick={() => setHoModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-row fr-2" style={{ marginBottom: 12 }}>
                <div className="form-group">
                  <label>المساندة *</label>
                  <select value={hoForm.masanda_id} onChange={e => hf({ masanda_id: e.target.value, wing: '', previous_committee_id: '' })}>
                    <option value="">— اختر —</option>
                    {MASANDAT.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>الجناح *</label>
                  <select value={hoForm.wing} onChange={e => hf({ wing: e.target.value, previous_committee_id: '' })}>
                    <option value="">— اختر —</option>
                    {wings(hoForm.masanda_id).map(w => (
                      <option key={w} value={w}>{isNaN(w) ? w : `جناح ${w}`}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>اللجنة المُسلِّمة (السابقة)</label>
                  <select value={hoForm.previous_committee_id} onChange={e => hf({ previous_committee_id: e.target.value })}>
                    <option value="">— اختر —</option>
                    {currentComs(hoForm.masanda_id, hoForm.wing).map(c => (
                      <option key={c.id} value={c.id}>{c.committee_name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>اللجنة المُستلِمة (الجديدة) *</label>
                  <input value={hoForm.new_committee_name} onChange={e => hf({ new_committee_name: e.target.value })} placeholder="اسم اللجنة الجديدة" />
                </div>
                <div className="form-group">
                  <label>رئيس اللجنة الجديدة</label>
                  <input value={hoForm.new_committee_head} onChange={e => hf({ new_committee_head: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>تاريخ التسليم</label>
                  <input type="date" value={hoForm.handover_date} onChange={e => hf({ handover_date: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>تاريخ الاستلام</label>
                  <input type="date" value={hoForm.receive_date} onChange={e => hf({ receive_date: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>حالة المطابقة</label>
                  <select value={hoForm.matching_status} onChange={e => hf({ matching_status: e.target.value })}>
                    <option>مطابق</option>
                    <option>يوجد فروقات</option>
                  </select>
                </div>
                {hoForm.matching_status === 'يوجد فروقات' && (
                  <div className="form-group" style={{ gridColumn: '1/-1' }}>
                    <label>وصف الفروقات</label>
                    <textarea value={hoForm.variance_notes} onChange={e => hf({ variance_notes: e.target.value })} placeholder="اذكر الفروقات بالتفصيل..." />
                  </div>
                )}
                <div className="form-group">
                  <label>رقم النموذج الورقي</label>
                  <input value={hoForm.paper_form_number} onChange={e => hf({ paper_form_number: e.target.value })} />
                </div>
                <div className="form-group" style={{ gridColumn: '1/-1' }}>
                  <label>ملاحظات</label>
                  <textarea value={hoForm.notes} onChange={e => hf({ notes: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setHoModal(false)}>إلغاء</button>
              <button className="btn btn-primary" onClick={saveHandover}>💾 حفظ المحضر</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
