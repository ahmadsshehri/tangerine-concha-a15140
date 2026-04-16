import { useState, useEffect, useCallback } from 'react'
import { collection, getDocs, doc, setDoc } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../components/Toast'
import { MASANDAT, PRIORITY_LEVELS, FAULT_TYPES } from '../../lib/constants'

// حالات بلاغ الأدوات المبسّطة
const TOOL_STATUS = ['يحتاج صيانة', 'تم سحبه', 'تالف']

export default function MyReportsPage() {
  const { name } = useAuth()
  const toast = useToast()
  const [tab, setTab] = useState('tool')

  return (
    <div className="animate-in">
      <div className="page-header">
        <div className="page-title">
          <div className="icon" style={{ background: 'rgba(124,58,237,.1)' }}>🔧</div>
          البلاغات
        </div>
      </div>

      <div className="tabs">
        <button className={`tab-btn ${tab === 'tool'     ? 'active' : ''}`} onClick={() => setTab('tool')}>🔧 بلاغات الأدوات</button>
        <button className={`tab-btn ${tab === 'facility' ? 'active' : ''}`} onClick={() => setTab('facility')}>🏗️ بلاغات الصيانة</button>
      </div>

      {tab === 'tool'     && <ToolReportForm name={name} toast={toast} />}
      {tab === 'facility' && <FacilityReportForm name={name} toast={toast} />}
    </div>
  )
}

// ─── بلاغ أدوات مبسّط ────────────────────────────────────────────────────────
function ToolReportForm({ name, toast }) {
  const EMPTY = {
    report_date: new Date().toISOString().split('T')[0],
    masanda_id: '', wing: '', item_id: '', affected_qty: '',
    status: 'يحتاج صيانة', priority: 'medium', notes: ''
  }
  const [form,    setForm]    = useState(EMPTY)
  const [items,   setItems]   = useState([])
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving,  setSaving]  = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [iSnap, rSnap] = await Promise.all([
        getDocs(collection(db, 'items')),
        getDocs(collection(db, 'toolFaultReports'))
      ])
      setItems(iSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(i => i.allowFaultReports && i.status === 'active'))
      const recs = rSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      recs.sort((a, b) => (b.createdAt || '') > (a.createdAt || '') ? 1 : -1)
      setRecords(recs.filter(r => r.created_by === name))
    } catch (e) { toast('❌ ' + e.message, 'error') }
    setLoading(false)
  }, [name, toast])

  useEffect(() => { fetchData() }, [fetchData])

  const f = u => setForm(p => ({ ...p, ...u }))

  const save = async () => {
    if (!form.item_id || !form.masanda_id || !form.wing) {
      toast('⚠️ الصنف والموقع مطلوبان', 'warn'); return
    }
    setSaving(true)
    const id = `tfr_${Date.now()}`
    const m  = MASANDAT.find(m => m.id === form.masanda_id)
    try {
      await setDoc(doc(db, 'toolFaultReports', id), {
        ...form, id, report_number: id,
        masanda_name: m?.name || '',
        item_name: items.find(i => i.id === form.item_id)?.name || '',
        created_by: name,
        createdAt: new Date().toISOString()
      })
      toast('✅ تم إرسال البلاغ')
      setForm(EMPTY)
      fetchData()
    } catch (e) { toast('❌ ' + e.message, 'error') }
    setSaving(false)
  }

  const wings = form.masanda_id ? MASANDAT.find(m => m.id === form.masanda_id)?.wings || [] : []
  const priInfo = (id) => PRIORITY_LEVELS.find(p => p.id === id) || { label: id, color: '#888' }

  const statusStyle = {
    'يحتاج صيانة': { bg: 'rgba(227,179,65,.15)', color: '#b45309' },
    'تم سحبه':     { bg: 'rgba(26,86,219,.1)',   color: '#1a56db' },
    'تالف':        { bg: 'rgba(200,30,30,.1)',    color: '#c81e1e' },
  }

  return (
    <div>
      {/* نموذج الإدخال */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">🔧 تسجيل بلاغ عطل</div>
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
              {wings.map(w => <option key={w} value={w}>{isNaN(w) ? w : `جناح ${w}`}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>الصنف / الأداة *</label>
            <select value={form.item_id} onChange={e => f({ item_id: e.target.value })}>
              <option value="">— اختر الصنف —</option>
              {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>الكمية</label>
            <input type="number" min="1" value={form.affected_qty} onChange={e => f({ affected_qty: e.target.value })} placeholder="0" />
          </div>
        </div>

        {/* حالات الأداة — الجديد */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 8 }}>
            حالة الأداة *
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {TOOL_STATUS.map(s => {
              const style = statusStyle[s] || {}
              return (
                <button key={s} type="button"
                  onClick={() => f({ status: s })}
                  style={{
                    padding: '8px 18px', borderRadius: 'var(--rs)', cursor: 'pointer',
                    fontFamily: 'Cairo', fontSize: 13, fontWeight: 700,
                    border: `2px solid ${form.status === s ? style.color : 'var(--border)'}`,
                    background: form.status === s ? style.bg : 'var(--surface2)',
                    color: form.status === s ? style.color : 'var(--text-muted)',
                    transition: 'all .15s'
                  }}
                >
                  {s === 'يحتاج صيانة' && '🔧 '}
                  {s === 'تم سحبه'     && '📤 '}
                  {s === 'تالف'        && '🗑️ '}
                  {s}
                </button>
              )
            })}
          </div>
        </div>

        <div className="form-group" style={{ marginBottom: 14 }}>
          <label>الوصف / السبب</label>
          <textarea value={form.notes} onChange={e => f({ notes: e.target.value })} placeholder="اشرح العطل أو سبب البلاغ بوضوح..." />
        </div>

        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? '⏳ جاري الإرسال...' : '📤 إرسال البلاغ'}
        </button>
      </div>

      {/* بلاغاتي السابقة */}
      <div className="card">
        <div className="card-title">📋 بلاغاتي السابقة</div>
        {loading ? <div style={{ height: 100 }} className="skeleton" /> :
         records.length === 0 ? (
          <div className="empty-state" style={{ padding: 30 }}>
            <div className="es-icon">📭</div>
            <div className="es-title">لا توجد بلاغات بعد</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>التاريخ</th><th>الموقع</th><th>الصنف</th><th>الحالة</th><th>الأولوية</th><th>الوصف</th></tr>
              </thead>
              <tbody>
                {records.map(r => {
                  const pri   = priInfo(r.priority)
                  const style = statusStyle[r.status] || {}
                  return (
                    <tr key={r.id}>
                      <td style={{ fontSize: 12 }}>{r.report_date}</td>
                      <td style={{ fontSize: 12 }}>{r.masanda_name} {r.wing ? `— ${isNaN(r.wing) ? r.wing : `جناح ${r.wing}`}` : ''}</td>
                      <td style={{ fontWeight: 700 }}>{r.item_name}</td>
                      <td>
                        <span className="badge" style={{ background: style.bg || 'var(--surface3)', color: style.color || 'var(--text-muted)' }}>
                          {r.status}
                        </span>
                      </td>
                      <td>
                        <span className="badge" style={{ background: pri.color + '22', color: pri.color }}>{pri.label}</span>
                      </td>
                      <td style={{ fontSize: 12, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.notes || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── بلاغ صيانة للمشرف ───────────────────────────────────────────────────────
function FacilityReportForm({ name, toast }) {
  const EMPTY = {
    report_date: new Date().toISOString().split('T')[0],
    masanda_id: '', wing: '', fault_type: 'كهرباء',
    priority: 'medium', description: '', notes: ''
  }
  const [form,    setForm]    = useState(EMPTY)
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving,  setSaving]  = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const snap = await getDocs(collection(db, 'facilityMaintenanceReports'))
      const recs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      recs.sort((a, b) => (b.createdAt || '') > (a.createdAt || '') ? 1 : -1)
      setRecords(recs.filter(r => r.created_by === name))
    } catch (e) { toast('❌ ' + e.message, 'error') }
    setLoading(false)
  }, [name, toast])

  useEffect(() => { fetchData() }, [fetchData])

  const f = u => setForm(p => ({ ...p, ...u }))

  const save = async () => {
    if (!form.description || !form.masanda_id || !form.wing) {
      toast('⚠️ الموقع والوصف مطلوبان', 'warn'); return
    }
    setSaving(true)
    const id = `fmr_${Date.now()}`
    const m  = MASANDAT.find(m => m.id === form.masanda_id)
    try {
      await setDoc(doc(db, 'facilityMaintenanceReports', id), {
        ...form, id, report_number: id, status: 'جديد',
        masanda_name: m?.name || '',
        created_by: name,
        createdAt: new Date().toISOString()
      })
      toast('✅ تم إرسال البلاغ')
      setForm(EMPTY)
      fetchData()
    } catch (e) { toast('❌ ' + e.message, 'error') }
    setSaving(false)
  }

  const wings = form.masanda_id ? MASANDAT.find(m => m.id === form.masanda_id)?.wings || [] : []
  const faultIcon = { 'كهرباء': '⚡', 'سباكة': '🚿', 'تكييف': '❄️', 'نجارة': '🪚', 'دهانات': '🎨', 'أقفال': '🔒', 'إنارة': '💡', 'أخرى': '🔨' }
  const priInfo = (id) => PRIORITY_LEVELS.find(p => p.id === id) || { label: id, color: '#888' }

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">🏗️ تسجيل بلاغ صيانة</div>
        <div className="form-row fr-2" style={{ marginBottom: 12 }}>
          <div className="form-group">
            <label>التاريخ</label>
            <input type="date" value={form.report_date} onChange={e => f({ report_date: e.target.value })} />
          </div>
          <div className="form-group">
            <label>نوع العطل</label>
            <select value={form.fault_type} onChange={e => f({ fault_type: e.target.value })}>
              {FAULT_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>المساندة *</label>
            <select value={form.masanda_id} onChange={e => f({ masanda_id: e.target.value, wing: '' })}>
              <option value="">— اختر —</option>
              {MASANDAT.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>الجناح / الموقع *</label>
            <select value={form.wing} onChange={e => f({ wing: e.target.value })}>
              <option value="">— اختر —</option>
              {wings.map(w => <option key={w} value={w}>{isNaN(w) ? w : `جناح ${w}`}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>الأولوية</label>
            <select value={form.priority} onChange={e => f({ priority: e.target.value })}>
              {PRIORITY_LEVELS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
        </div>

        <div className="form-group" style={{ marginBottom: 12 }}>
          <label>وصف المشكلة *</label>
          <textarea value={form.description} onChange={e => f({ description: e.target.value })} placeholder="اشرح المشكلة بوضوح..." />
        </div>
        <div className="form-group" style={{ marginBottom: 14 }}>
          <label>ملاحظات إضافية</label>
          <textarea value={form.notes} onChange={e => f({ notes: e.target.value })} placeholder="اختياري..." />
        </div>

        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? '⏳ جاري الإرسال...' : '📤 إرسال البلاغ'}
        </button>
      </div>

      <div className="card">
        <div className="card-title">📋 بلاغاتي السابقة</div>
        {loading ? <div style={{ height: 100 }} className="skeleton" /> :
         records.length === 0 ? (
          <div className="empty-state" style={{ padding: 30 }}>
            <div className="es-icon">📭</div>
            <div className="es-title">لا توجد بلاغات بعد</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>التاريخ</th><th>الموقع</th><th>نوع العطل</th><th>الوصف</th><th>الحالة</th></tr>
              </thead>
              <tbody>
                {records.map(r => {
                  const pri = priInfo(r.priority)
                  return (
                    <tr key={r.id}>
                      <td style={{ fontSize: 12 }}>{r.report_date}</td>
                      <td style={{ fontSize: 12 }}>{r.masanda_name} {r.wing ? `— ${isNaN(r.wing) ? r.wing : `جناح ${r.wing}`}` : ''}</td>
                      <td style={{ fontWeight: 700 }}>{faultIcon[r.fault_type]} {r.fault_type}</td>
                      <td style={{ fontSize: 12, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.description}</td>
                      <td><span className="badge badge-blue">{r.status}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
