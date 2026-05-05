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

// ─── الصفحة الرئيسية المحايدة ──────────────────────────────────────────────────
function HomePage({ onNav, hasPerm, isAdmin }) {
  const pages = [
    { id: 'supervisor', label: 'التقييم المسائي',    icon: '🌙', color: 'var(--blue)',
      show: isAdmin || hasPerm('supervisor_entry') || hasPerm('supervisor_reports') },
    { id: 'caretaker',  label: 'تقييم القيّمين',     icon: '📊', color: 'var(--purple)',
      show: isAdmin || hasPerm('caretaker_entry')  || hasPerm('caretaker_reports') },
    { id: 'housing',    label: 'تقرير السكن',         icon: '🏠', color: 'var(--green)',
      show: isAdmin || hasPerm('housing_entry')    || hasPerm('housing_reports') },
    { id: 'custody',    label: 'إدارة العهدة',        icon: '📦', color: 'var(--orange)',
      show: isAdmin || hasPerm('custody_view') },
    { id: 'reports',    label: 'التقارير',            icon: '📈', color: 'var(--accent)',
      show: isAdmin || hasPerm('reports_daily')    || hasPerm('supervisor_reports') ||
            hasPerm('caretaker_reports') || hasPerm('custody_reports') || hasPerm('reports_view_all') },
    { id: 'myreports',  label: 'بلاغاتي',            icon: '🔧', color: 'var(--purple)',
      show: !isAdmin && (hasPerm('reports_tool') || hasPerm('reports_facility')) },
    { id: 'admin',      label: 'الإدارة',             icon: '⚙️', color: 'var(--orange)',
      show: isAdmin || hasPerm('can_create_supervisors') },
  ].filter(p => p.show)

  if (pages.length === 0) return (
    <div className="empty-state" style={{ paddingTop: 100 }}>
      <div className="es-icon">🔒</div>
      <div className="es-title">لا توجد صلاحيات مخصصة لحسابك</div>
      <div className="es-sub">تواصل مع المدير لمنحك الصلاحيات المناسبة</div>
    </div>
  )

  return (
    <div className="animate-in" style={{ paddingTop: 20 }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>🏥</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--accent)' }}>
          نظام إدارة المراكز التأهيلية
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>
          اختر القسم الذي تريد الدخول إليه
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: 16,
        maxWidth: 800,
        margin: '0 auto',
      }}>
        {pages.map(p => (
          <button
            key={p.id}
            onClick={() => onNav(p.id)}
            style={{
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: 12, padding: '28px 20px',
              background: 'var(--surface)',
              border: `2px solid var(--border)`,
              borderRadius: 'var(--r)',
              cursor: 'pointer', transition: 'all .2s',
              fontFamily: 'Cairo',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = p.color
              e.currentTarget.style.transform = 'translateY(-3px)'
              e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,.1)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'var(--border)'
              e.currentTarget.style.transform = ''
              e.currentTarget.style.boxShadow = ''
            }}
          >
            <div style={{ fontSize: 36 }}>{p.icon}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
              {p.label}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── شاشة رفض الوصول ──────────────────────────────────────────────────────────
function AccessDenied({ onBack }) {
  return (
    <div className="empty-state" style={{ paddingTop: 80 }}>
      <div className="es-icon">🔒</div>
      <div className="es-title">ليس لديك صلاحية لعرض هذه الصفحة</div>
      <div className="es-sub">تواصل مع المدير لمنحك الصلاحية المناسبة</div>
      <button className="btn btn-outline" style={{ marginTop: 20 }} onClick={onBack}>
        ← رجوع
      </button>
    </div>
  )
}

function AppShell() {
  const { user, loading, isAdmin, hasPerm, logout } = useAuth()
  const [page, setPage] = useState(null)

  // إعادة الصفحة للـ home عند تغيّر المستخدم
  const userId = user?.uid || null
  useEffect(() => { setPage(null) }, [userId])

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

  const renderPage = () => {
    // الصفحة الرئيسية — null أو 'home'
    if (!page || page === 'home') {
      return <HomePage onNav={setPage} hasPerm={hasPerm} isAdmin={isAdmin} />
    }

    // تحقق من الصلاحية
    if (!canAccess(page)) {
      return <AccessDenied onBack={() => setPage(null)} />
    }

    switch (page) {
      case 'supervisor': return <SupervisorPage />
      case 'caretaker':  return <CaretakerPage />
      case 'housing':    return <HousingReportPage />
      case 'custody':    return <CustodyPage />
      case 'reports':    return <ReportsPage />
      case 'myreports':  return <MyReportsPage />
      case 'admin':      return <AdminPage />
      default:           return <HomePage onNav={setPage} hasPerm={hasPerm} isAdmin={isAdmin} />
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
