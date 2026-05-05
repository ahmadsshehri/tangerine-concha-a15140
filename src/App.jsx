import { useState, useEffect } from 'react'
import { useAuth } from './hooks/useAuth'
import { ToastProvider } from './components/Toast'
import LoginScreen       from './components/LoginScreen'
import Topbar            from './components/Topbar'
import SupervisorPage    from './modules/supervisor/SupervisorPage'
import CaretakerPage     from './modules/caretaker/CaretakerPage'
import CustodyPage       from './modules/custody/CustodyPage'
import ReportsPage       from './modules/reports/ReportsPage'
import AdminPage         from './modules/admin/AdminPage'
import MyReportsPage     from './modules/maintenance/MyReportsPage'
import HousingReportPage from './modules/housing/HousingReportPage'

// ─── صفحة رفض الوصول ──────────────────────────────────────────────────────────
function AccessDenied({ onBack }) {
  return (
    <div className="empty-state" style={{ paddingTop: 80 }}>
      <div className="es-icon">🔒</div>
      <div className="es-title">ليس لديك صلاحية لعرض هذه الصفحة</div>
      <div className="es-sub">تواصل مع المدير لمنحك الصلاحية المناسبة</div>
      {onBack && (
        <button className="btn btn-outline" style={{ marginTop: 20 }} onClick={onBack}>
          ← رجوع للرئيسية
        </button>
      )}
    </div>
  )
}

// ─── الصفحة الرئيسية ──────────────────────────────────────────────────────────
function HomePage({ onNav, allowed }) {
  if (allowed.length === 0) return (
    <div className="empty-state" style={{ paddingTop: 100 }}>
      <div className="es-icon">🔒</div>
      <div className="es-title">لا توجد صلاحيات مخصصة لحسابك</div>
      <div className="es-sub">تواصل مع المدير لمنحك الصلاحيات المناسبة</div>
    </div>
  )

  return (
    <div className="animate-in">
      <div style={{ textAlign: 'center', marginBottom: 32, paddingTop: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--accent)', marginBottom: 6 }}>
          نظام إدارة المراكز التأهيلية
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          اختر القسم الذي تريد الدخول إليه
        </div>
      </div>

      <div className="masanda-grid" style={{ maxWidth: 700, margin: '0 auto', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
        {allowed.map(p => (
          <div
            key={p.id}
            className="masanda-card"
            onClick={() => onNav(p.id)}
            style={{ padding: '28px 16px', textAlign: 'center' }}
          >
            <div style={{ fontSize: 32, marginBottom: 10 }}>{p.icon}</div>
            <div className="mc-name" style={{ fontSize: 14 }}>{p.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function AppShell() {
  const { user, loading, isAdmin, hasPerm, logout } = useAuth()
  const [page, setPage] = useState(null)

  const userId = user?.uid || null
  useEffect(() => { setPage(null) }, [userId])

  // ─── قائمة الصفحات المسموح بها لهذا المستخدم ─────────────────────────────
  const getAllowed = () => [
    {
      id: 'supervisor', label: 'التقييم المسائي',  icon: '🌙',
      show: isAdmin || hasPerm('supervisor_entry') || hasPerm('supervisor_reports'),
    },
    {
      id: 'caretaker',  label: 'تقييم القيّمين',   icon: '📊',
      show: isAdmin || hasPerm('caretaker_entry')  || hasPerm('caretaker_reports'),
    },
    {
      id: 'housing',    label: 'تقرير السكن',       icon: '🏠',
      show: isAdmin || hasPerm('housing_entry')    || hasPerm('housing_reports'),
    },
    {
      id: 'custody',    label: 'إدارة العهدة',      icon: '📦',
      show: isAdmin || hasPerm('custody_view'),
    },
    {
      id: 'reports',    label: 'التقارير',          icon: '📈',
      show: isAdmin || hasPerm('reports_daily')    || hasPerm('supervisor_reports') ||
            hasPerm('caretaker_reports') || hasPerm('custody_reports') ||
            hasPerm('reports_view_all'),
    },
    {
      id: 'myreports',  label: 'بلاغاتي',          icon: '🔧',
      show: !isAdmin && (hasPerm('reports_tool') || hasPerm('reports_facility')),
    },
    {
      id: 'admin',      label: 'الإدارة',           icon: '⚙️',
      show: isAdmin || hasPerm('can_create_supervisors'),
    },
  ].filter(p => p.show)

  // ─── هل الصفحة مسموح بها؟ ────────────────────────────────────────────────
  const canAccess = (p) => {
    if (isAdmin) return true
    switch (p) {
      case 'supervisor': return hasPerm('supervisor_entry')  || hasPerm('supervisor_reports')
      case 'caretaker':  return hasPerm('caretaker_entry')   || hasPerm('caretaker_reports')
      case 'housing':    return hasPerm('housing_entry')     || hasPerm('housing_reports')
      case 'custody':    return hasPerm('custody_view')
      case 'reports':    return hasPerm('reports_daily')     || hasPerm('supervisor_reports') ||
                                hasPerm('caretaker_reports') || hasPerm('custody_reports')   ||
                                hasPerm('reports_view_all')
      case 'myreports':  return hasPerm('reports_tool')      || hasPerm('reports_facility')
      case 'admin':      return isAdmin || hasPerm('can_create_supervisors')
      default:           return false
    }
  }

  if (loading) return (
    <div className="loading-overlay" style={{ display: 'flex' }}>
      <div className="spinner" />
    </div>
  )

  if (!user) return <LoginScreen />

  const allowed = getAllowed()

  const renderPage = () => {
    if (!page) return <HomePage onNav={setPage} allowed={allowed} />
    if (!canAccess(page)) return <AccessDenied onBack={() => setPage(null)} />
    switch (page) {
      case 'supervisor': return <SupervisorPage />
      case 'caretaker':  return <CaretakerPage />
      case 'housing':    return <HousingReportPage />
      case 'custody':    return <CustodyPage />
      case 'reports':    return <ReportsPage />
      case 'myreports':  return <MyReportsPage />
      case 'admin':      return <AdminPage />
      default:           return <HomePage onNav={setPage} allowed={allowed} />
    }
  }

  return (
    <div className="app-shell">
      <Topbar activePage={page || 'home'} onNav={setPage} />
      <main className="main-content">
        {renderPage()}
      </main>
    </div>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <AppShell />
    </ToastProvider>
  )
}
