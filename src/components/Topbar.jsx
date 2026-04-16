import { useAuth } from '../hooks/useAuth'
import { ROLES } from '../lib/constants'

export default function Topbar({ activePage, onNav }) {
  const { name, role, logout, hasPerm, isAdmin } = useAuth()
  const roleInfo = ROLES[role] || { label: 'مشرف', badge: 'role-supervisor' }
  const initial  = name ? name.charAt(0) : '؟'

  // بناء التبويبات ديناميكياً حسب الصلاحيات
  const allowed = [
    hasPerm('supervisor_entry') || hasPerm('supervisor_reports')
      ? { id: 'supervisor', label: 'تقييم مسائي',    icon: '🌙' } : null,
    hasPerm('caretaker_entry') || hasPerm('caretaker_reports')
      ? { id: 'caretaker',  label: 'تقييم القيّمين', icon: '📊' } : null,
    hasPerm('custody_view') || isAdmin
      ? { id: 'custody',    label: 'إدارة العهدة',   icon: '📦' } : null,
    (hasPerm('reports_tool') || hasPerm('reports_facility')) && !isAdmin
      ? { id: 'myreports',  label: 'بلاغاتي',        icon: '🔧' } : null,
    hasPerm('supervisor_reports') || hasPerm('caretaker_reports') ||
    hasPerm('custody_reports')    || hasPerm('reports_view_all')  ||
    hasPerm('reports_daily')      || isAdmin
      ? { id: 'reports',    label: 'التقارير',        icon: '📈' } : null,
    isAdmin
      ? { id: 'admin',      label: 'الإدارة',         icon: '⚙️' } : null,
  ].filter(Boolean)

  return (
    <>
    <nav className="topbar">
      <div className="topbar-brand">
        <div className="brand-icon">🏥</div>
        <div className="brand-name">المراكز التأهيلية</div>
      </div>

      <div className="topbar-nav">
        {allowed.map(item => (
          <button
            key={item.id}
            className={`nav-btn ${activePage === item.id ? 'active' : ''}`}
            onClick={() => onNav(item.id)}
          >
            <span className="nb-dot" />
            {item.icon} {item.label}
          </button>
        ))}
      </div>

      <div className="topbar-right">
        <div className="user-chip">
          <div className="user-avatar">{initial}</div>
          <span>{name}</span>
          <span className={`role-badge ${roleInfo.badge}`}>{roleInfo.label}</span>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={logout} title="تسجيل الخروج">
          🚪
        </button>
      </div>
    </nav>

    {/* ─── شريط التنقل السفلي للجوال ─── */}
    <nav className="bottom-nav">
      {allowed.map(item => (
        <button
          key={item.id}
          className={`bottom-nav-btn ${activePage === item.id ? 'active' : ''}`}
          onClick={() => onNav(item.id)}
        >
          <span className="bn-icon">{item.icon}</span>
          <span className="bn-label">{item.label}</span>
        </button>
      ))}
    </nav>
    </>
  )
}
