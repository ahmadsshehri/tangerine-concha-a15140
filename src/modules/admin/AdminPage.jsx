import { useState, useEffect, useCallback } from 'react'
import { collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore'
import { createUserWithEmailAndPassword } from 'firebase/auth'
import { auth, db } from '../../lib/firebase'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../components/Toast'

// ─── تعريف جميع الصلاحيات المتاحة ────────────────────────────────────────────
const ALL_PERMISSIONS = [
  {
    group: '🌙 التقييم المسائي',
    perms: [
      { key: 'supervisor_entry',   label: 'إدخال تقييمات مسائية' },
      { key: 'supervisor_delete',  label: 'حذف التقييمات المسائية' },
      { key: 'supervisor_reports', label: 'عرض تقارير المشرفين' },
    ]
  },
  {
    group: '📊 تقييم القيّمين',
    perms: [
      { key: 'caretaker_entry',   label: 'إدخال تقييمات القيّمين' },
      { key: 'caretaker_delete',  label: 'حذف تقييمات القيّمين' },
      { key: 'caretaker_reports', label: 'عرض تقارير القيّمين' },
    ]
  },
  {
    group: '🏠 تقرير مشرف السكن',
    perms: [
      { key: 'housing_entry',   label: 'إدخال تقرير مشرف السكن' },
      { key: 'housing_delete',  label: 'حذف تقارير مشرف السكن' },
      { key: 'housing_reports', label: 'عرض تقارير مشرف السكن' },
    ]
  },
  {
    group: '📦 العهدة والمستودع',
    perms: [
      { key: 'custody_view',      label: 'عرض العهدة والمستودع' },
      { key: 'custody_movements', label: 'إدخال الحركات' },
      { key: 'custody_items',     label: 'إدارة الأصناف' },
      { key: 'custody_warehouse', label: 'إدارة المستودع' },
      { key: 'custody_committees',label: 'إدارة اللجان والتسليم' },
      { key: 'custody_reports',   label: 'عرض تقارير العهدة' },
    ]
  },
  {
    group: '🔧 البلاغات والتقارير',
    perms: [
      { key: 'reports_daily',         label: 'عرض التقرير اليومي وطباعته' },
      { key: 'reports_tool',          label: 'رفع بلاغات أعطال الأدوات' },
      { key: 'reports_facility',      label: 'رفع بلاغات صيانة المرافق' },
      { key: 'reports_view_all',      label: 'عرض جميع البلاغات والتقارير' },
      { key: 'reports_followup',      label: 'إضافة إجراءات متابعة' },
    ]
  },
  {
    group: '👤 إدارة المستخدمين',
    perms: [
      { key: 'can_create_supervisors', label: 'إنشاء حسابات مشرفين جديدة' },
    ]
  },
]

// الصلاحيات الافتراضية لحساب مشرف جديد
const DEFAULT_SUPERVISOR_PERMS = {
  supervisor_entry:        true,
  supervisor_delete:       false,
  supervisor_reports:      true,
  caretaker_entry:         true,
  caretaker_delete:        false,
  caretaker_reports:       true,
  housing_entry:           true,
  housing_delete:          false,
  housing_reports:         true,
  custody_view:            false,
  custody_movements:       false,
  custody_items:           false,
  custody_warehouse:       false,
  custody_committees:      false,
  custody_reports:         false,
  reports_daily:           true,
  reports_tool:            true,
  reports_facility:        true,
  reports_view_all:        false,
  reports_followup:        false,
  can_create_supervisors:  false,
}

export function usePermission(key) {
  const { role, permissions } = useAuth()
  if (role === 'admin') return true
  return permissions?.[key] === true
}

export default function AdminPage() {
  const { user: currentUser, isAdmin, hasPerm } = useAuth()
  const toast = useToast()
  const [users,     setUsers]     = useState([])
  const [loading,   setLoading]   = useState(false)
  const [addModal,  setAddModal]  = useState(false)
  const [permModal, setPermModal] = useState(null)
  const [form,      setForm]      = useState({ name: '', email: '', password: '', role: 'supervisor' })
  const [saving,    setSaving]    = useState(false)

  // المشرف يمكنه الدخول إذا كان مديراً أو لديه صلاحية إنشاء مشرفين
  const canManageUsers = isAdmin || hasPerm('can_create_supervisors')

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const snap = await getDocs(collection(db, 'users'))
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (e) { toast('❌ ' + e.message, 'error') }
    setLoading(false)
  }, [toast])

  useEffect(() => { if (canManageUsers) fetchUsers() }, [canManageUsers, fetchUsers])

  if (!canManageUsers) return (
    <div className="animate-in">
      <div className="empty-state">
        <div className="es-icon">🔒</div>
        <div className="es-title">هذه الصفحة للمديرين فقط</div>
      </div>
    </div>
  )

  const f = u => setForm(p => ({ ...p, ...u }))

  // ─ إضافة مستخدم جديد (مشرف أو مدير)
  const addUser = async () => {
    if (!form.name || !form.email || !form.password) {
      toast('⚠️ جميع الحقول مطلوبة', 'warn'); return
    }
    // المشرف الذي لديه can_create_supervisors لا يستطيع إنشاء مدير
    if (!isAdmin && form.role === 'admin') {
      toast('❌ لا تملك صلاحية إنشاء حساب مدير', 'error'); return
    }
    setSaving(true)
    try {
      const cred = await createUserWithEmailAndPassword(auth, form.email, form.password)
      const userData = {
        name: form.name, email: form.email,
        role: form.role,
        createdAt: new Date().toISOString()
      }
      // المدير لا يحتاج permissions، المشرف يأخذ الافتراضية
      if (form.role === 'supervisor') {
        userData.permissions = DEFAULT_SUPERVISOR_PERMS
      }
      await setDoc(doc(db, 'users', cred.user.uid), userData)
      toast(form.role === 'admin' ? '✅ تم إضافة المدير' : '✅ تم إضافة المشرف')
      setAddModal(false)
      setForm({ name: '', email: '', password: '', role: 'supervisor' })
      fetchUsers()
    } catch (e) {
      toast('❌ ' + (e.code === 'auth/email-already-in-use' ? 'البريد مستخدم مسبقاً' : e.message), 'error')
    }
    setSaving(false)
  }

  // ─ حذف مستخدم
  const delUser = async (user) => {
    if (!isAdmin) { toast('❌ هذه الصلاحية للمديرين فقط', 'error'); return }
    const label = user.role === 'admin' ? 'المدير' : 'المشرف'
    if (!confirm(`حذف حساب ${label} "${user.name}" من النظام نهائياً؟`)) return
    try {
      await deleteDoc(doc(db, 'users', user.id))
      toast('🗑️ تم الحذف')
      fetchUsers()
    } catch (e) { toast('❌ ' + e.message, 'error') }
  }

  // ─ تحويل مدير إلى مشرف
  const demoteAdmin = async (user) => {
    if (!isAdmin) { toast('❌ هذه الصلاحية للمديرين فقط', 'error'); return }
    if (user.id === currentUser?.uid) {
      toast('⚠️ لا يمكنك تحويل حسابك الحالي إلى مشرف', 'warn'); return
    }
    if (!confirm(`تحويل "${user.name}" من مدير إلى مشرف؟ سيفقد صلاحيات المدير.`)) return
    try {
      await setDoc(doc(db, 'users', user.id), {
        ...user,
        role: 'supervisor',
        permissions: DEFAULT_SUPERVISOR_PERMS,
      }, { merge: false })
      toast('✅ تم تحويل الحساب إلى مشرف')
      fetchUsers()
    } catch (e) { toast('❌ ' + e.message, 'error') }
  }

  // ─ ترقية مشرف إلى مدير
  const promoteToAdmin = async (user) => {
    if (!isAdmin) { toast('❌ هذه الصلاحية للمديرين فقط', 'error'); return }
    if (!confirm(`ترقية "${user.name}" إلى مدير؟ سيحصل على كامل الصلاحيات.`)) return
    try {
      const { permissions, ...rest } = user
      await setDoc(doc(db, 'users', user.id), {
        ...rest,
        role: 'admin',
      }, { merge: false })
      toast('✅ تم ترقية الحساب إلى مدير')
      fetchUsers()
    } catch (e) { toast('❌ ' + e.message, 'error') }
  }

  const supervisors = users.filter(u => u.role === 'supervisor')
  const admins      = users.filter(u => u.role === 'admin')

  return (
    <div className="animate-in">
      <div className="page-header">
        <div className="page-title">
          <div className="icon" style={{ background: 'rgba(227,179,65,.15)' }}>⚙️</div>
          {isAdmin ? 'إدارة المستخدمين والصلاحيات' : 'إضافة حسابات مشرفين'}
        </div>
        <button className="btn btn-primary" onClick={() => setAddModal(true)}>
          + {isAdmin ? 'مستخدم جديد' : 'مشرف جديد'}
        </button>
      </div>

      {/* إحصاءات */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 20 }}>
        {[
          { label: 'مديرون',  value: admins.length,      icon: '👑', color: 'var(--orange)' },
          { label: 'مشرفون',  value: supervisors.length, icon: '👤', color: 'var(--accent)' },
          { label: 'الإجمالي',value: users.length,        icon: '👥', color: 'var(--blue)'   },
        ].map((s, i) => (
          <div key={i} className="stat-card" style={{ '--card-accent': s.color }}>
            <div className="stat-icon">{s.icon}</div>
            <div className="stat-value">{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* ─ المديرون */}
      {isAdmin && admins.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">👑 المديرون — صلاحيات كاملة</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {admins.map(u => {
              const isMe = u.id === currentUser?.uid
              return (
                <div key={u.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 14px', background: 'rgba(227,179,65,.08)',
                  border: '1px solid rgba(227,179,65,.3)', borderRadius: 'var(--rs)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--orange)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 14 }}>
                      {u.name?.charAt(0)}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>
                        {u.name}
                        {isMe && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 6 }}>(أنت)</span>}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{u.email}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="role-badge role-admin">مدير — كل الصلاحيات</span>
                    {!isMe && (
                      <>
                        <button
                          className="btn btn-outline btn-xs"
                          onClick={() => demoteAdmin(u)}
                          style={{ fontSize: 11 }}
                        >
                          ↓ تحويل لمشرف
                        </button>
                        <button className="btn btn-danger btn-xs" onClick={() => delUser(u)}>حذف</button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ─ المشرفون */}
      <div className="card">
        <div className="card-title">👤 المشرفون — صلاحيات قابلة للتخصيص</div>
        {loading ? <div style={{ height: 150 }} className="skeleton" /> :
         supervisors.length === 0 ? (
          <div className="empty-state" style={{ padding: 30 }}>
            <div className="es-icon">👤</div>
            <div className="es-title">لا يوجد مشرفون</div>
            <div className="es-sub">أضف مشرفاً جديداً بالضغط على الزر أعلاه</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {supervisors.map(user => {
              const perms = user.permissions || DEFAULT_SUPERVISOR_PERMS
              const allKeys = ALL_PERMISSIONS.flatMap(g => g.perms).map(p => p.key)
              const enabledCount = allKeys.filter(k => perms[k]).length
              const totalCount   = allKeys.length
              return (
                <div key={user.id} style={{
                  border: '1px solid var(--border)', borderRadius: 'var(--r)',
                  padding: '14px 16px', background: 'var(--surface2)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 15 }}>
                        {user.name?.charAt(0)}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{user.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{user.email}</div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{enabledCount}</span>/{totalCount} صلاحية
                      </div>
                      <div style={{ width: 80, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: 3, background: 'var(--accent)', width: `${(enabledCount/totalCount)*100}%`, transition: 'width .3s' }} />
                      </div>
                      {isAdmin && (
                        <>
                          <button className="btn btn-outline btn-xs" onClick={() => promoteToAdmin(user)} style={{ fontSize: 11 }}>
                            ↑ ترقية لمدير
                          </button>
                          <button className="btn btn-blue btn-sm" onClick={() => setPermModal(user)}>
                            🔑 الصلاحيات
                          </button>
                        </>
                      )}
                      {(isAdmin || hasPerm('can_create_supervisors')) && (
                        <button className="btn btn-danger btn-xs" onClick={() => delUser(user)}>حذف</button>
                      )}
                    </div>
                  </div>

                  {/* معاينة سريعة للصلاحيات */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 10 }}>
                    {ALL_PERMISSIONS.flatMap(g => g.perms).map(p => (
                      <span key={p.key} style={{
                        fontSize: 10, padding: '2px 8px', borderRadius: 20, fontWeight: 600,
                        background: perms[p.key] ? 'var(--green-dim)' : 'var(--surface3)',
                        color:      perms[p.key] ? 'var(--green)'     : 'var(--text-dim)',
                        border:     `1px solid ${perms[p.key] ? 'var(--green)' : 'transparent'}`,
                        transition: 'all .2s'
                      }}>
                        {perms[p.key] ? '✓' : '✗'} {p.label}
                      </span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ─ نافذة إضافة مستخدم */}
      {addModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setAddModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">➕ إضافة {form.role === 'admin' ? 'مدير' : 'مشرف'} جديد</div>
              <button className="modal-close" onClick={() => setAddModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* نوع الحساب — للمدير فقط */}
                {isAdmin && (
                  <div className="form-group">
                    <label>نوع الحساب *</label>
                    <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                      {[
                        { val: 'supervisor', label: '👤 مشرف', desc: 'صلاحيات قابلة للتخصيص' },
                        { val: 'admin',      label: '👑 مدير',  desc: 'كامل الصلاحيات' },
                      ].map(opt => (
                        <button
                          key={opt.val}
                          type="button"
                          onClick={() => f({ role: opt.val })}
                          style={{
                            flex: 1, padding: '10px 14px', borderRadius: 'var(--rs)',
                            cursor: 'pointer', fontFamily: 'Cairo', textAlign: 'center',
                            border: `2px solid ${form.role === opt.val ? 'var(--accent)' : 'var(--border)'}`,
                            background: form.role === opt.val ? 'var(--accent-dim)' : 'var(--surface2)',
                            color: form.role === opt.val ? 'var(--accent)' : 'var(--text-muted)',
                            transition: 'all .15s'
                          }}
                        >
                          <div style={{ fontSize: 14, fontWeight: 700 }}>{opt.label}</div>
                          <div style={{ fontSize: 11, marginTop: 3, opacity: .8 }}>{opt.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="form-group">
                  <label>الاسم الكامل *</label>
                  <input value={form.name} onChange={e => f({ name: e.target.value })} placeholder="الاسم الكامل" autoFocus />
                </div>
                <div className="form-group">
                  <label>البريد الإلكتروني *</label>
                  <input type="email" value={form.email} onChange={e => f({ email: e.target.value })} placeholder="example@email.com" />
                </div>
                <div className="form-group">
                  <label>كلمة المرور *</label>
                  <input type="password" value={form.password} onChange={e => f({ password: e.target.value })} placeholder="6 أحرف على الأقل" />
                </div>

                {form.role === 'supervisor' && (
                  <div style={{ padding: '10px 14px', background: 'var(--blue-dim)', borderRadius: 'var(--rs)', fontSize: 12, color: 'var(--blue)' }}>
                    💡 سيتم إنشاء حساب المشرف بالصلاحيات الافتراضية
                    {isAdmin && ' — يمكنك تعديلها بعد الإنشاء'}
                  </div>
                )}
                {form.role === 'admin' && (
                  <div style={{ padding: '10px 14px', background: 'rgba(227,179,65,.12)', borderRadius: 'var(--rs)', fontSize: 12, color: 'var(--orange)' }}>
                    ⚠️ المدير سيحصل على كامل الصلاحيات في النظام
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setAddModal(false)}>إلغاء</button>
              <button className="btn btn-primary" onClick={addUser} disabled={saving}>
                {saving ? '⏳...' : '✅ إنشاء الحساب'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─ نافذة تعديل الصلاحيات (للمدير فقط) */}
      {permModal && isAdmin && (
        <PermissionsModal
          user={permModal}
          onClose={() => setPermModal(null)}
          onSaved={() => { fetchUsers(); setPermModal(null) }}
        />
      )}
    </div>
  )
}

// ─── نافذة تعديل الصلاحيات التفصيلية ─────────────────────────────────────────
function PermissionsModal({ user, onClose, onSaved }) {
  const toast = useToast()
  const [perms,  setPerms]  = useState({ ...DEFAULT_SUPERVISOR_PERMS, ...(user.permissions || {}) })
  const [saving, setSaving] = useState(false)

  const toggle = (key) => setPerms(p => ({ ...p, [key]: !p[key] }))

  const setAll = (val) => {
    const all = {}
    ALL_PERMISSIONS.flatMap(g => g.perms).forEach(p => { all[p.key] = val })
    setPerms(all)
  }

  const setGroup = (group, val) => {
    const upd = {}
    group.perms.forEach(p => { upd[p.key] = val })
    setPerms(p => ({ ...p, ...upd }))
  }

  const save = async () => {
    setSaving(true)
    try {
      await setDoc(doc(db, 'users', user.id), { ...user, permissions: perms }, { merge: true })
      toast('✅ تم حفظ الصلاحيات')
      onSaved()
    } catch (e) { toast('❌ ' + e.message, 'error') }
    setSaving(false)
  }

  const enabledCount = Object.values(perms).filter(Boolean).length
  const totalCount   = ALL_PERMISSIONS.flatMap(g => g.perms).length

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-lg" style={{ maxWidth: 680 }}>
        <div className="modal-header">
          <div>
            <div className="modal-title">🔑 صلاحيات — {user.name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{user.email}</div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body" style={{ paddingTop: 16 }}>
          {/* شريط التحكم السريع */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 14px', background: 'var(--surface2)',
            border: '1px solid var(--border)', borderRadius: 'var(--rs)', marginBottom: 16
          }}>
            <div style={{ fontSize: 13 }}>
              <span style={{ fontWeight: 700, color: 'var(--accent)', fontSize: 16 }}>{enabledCount}</span>
              <span style={{ color: 'var(--text-muted)' }}> / {totalCount} صلاحية مفعّلة</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-green btn-sm" onClick={() => setAll(true)}>✅ تفعيل الكل</button>
              <button className="btn btn-danger btn-sm" onClick={() => setAll(false)}>❌ إلغاء الكل</button>
            </div>
          </div>

          {/* مجموعات الصلاحيات */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {ALL_PERMISSIONS.map((group, gi) => {
              const groupEnabled = group.perms.filter(p => perms[p.key]).length
              const groupTotal   = group.perms.length
              const allOn  = groupEnabled === groupTotal
              const allOff = groupEnabled === 0

              return (
                <div key={gi} style={{ border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden' }}>
                  {/* رأس المجموعة */}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 16px', background: 'var(--surface2)',
                    borderBottom: '1px solid var(--border)'
                  }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>
                      {group.group}
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 8, fontWeight: 400 }}>
                        ({groupEnabled}/{groupTotal})
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="btn btn-xs"
                        style={{ background: allOn ? 'var(--green)' : 'var(--green-dim)', color: allOn ? '#fff' : 'var(--green)' }}
                        onClick={() => setGroup(group, true)}
                      >تفعيل الكل</button>
                      <button
                        className="btn btn-xs"
                        style={{ background: allOff ? 'var(--red)' : 'var(--red-dim)', color: allOff ? '#fff' : 'var(--red)' }}
                        onClick={() => setGroup(group, false)}
                      >إلغاء الكل</button>
                    </div>
                  </div>

                  {/* الصلاحيات */}
                  <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {group.perms.map(p => (
                      <label key={p.key} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        cursor: 'pointer', padding: '8px 12px', borderRadius: 'var(--rs)',
                        background: perms[p.key] ? 'var(--green-dim)' : 'var(--surface3)',
                        border: `1px solid ${perms[p.key] ? 'rgba(5,122,85,.3)' : 'transparent'}`,
                        transition: 'all .15s'
                      }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: perms[p.key] ? 'var(--green)' : 'var(--text-muted)' }}>
                          {p.label}
                        </span>
                        <div
                          onClick={() => toggle(p.key)}
                          style={{
                            width: 44, height: 24, borderRadius: 12, position: 'relative',
                            background: perms[p.key] ? 'var(--green)' : 'var(--border2)',
                            transition: 'background .2s', cursor: 'pointer', flexShrink: 0
                          }}
                        >
                          <div style={{
                            position: 'absolute', top: 2,
                            right: perms[p.key] ? 2 : 22,
                            width: 20, height: 20, borderRadius: '50%',
                            background: '#fff', transition: 'right .2s',
                            boxShadow: '0 1px 4px rgba(0,0,0,.2)'
                          }} />
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>إلغاء</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? '⏳ جاري الحفظ...' : '💾 حفظ الصلاحيات'}
          </button>
        </div>
      </div>
    </div>
  )
}
