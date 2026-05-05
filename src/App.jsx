import { useState, useEffect } from 'react'
import { useAuth } from './hooks/useAuth'
import { ToastProvider } from './components/Toast'
import LoginScreen    from './components/LoginScreen'
import Topbar         from './components/Topbar'
import SupervisorPage from './modules/supervisor/SupervisorPage'
import CaretakerPage  from './modules/caretaker/CaretakerPage'
import CustodyPage    from './modules/custody/CustodyPage'
import ReportsPage    from './modules/reports/ReportsPage'
import AdminPage      from './modules/admin/AdminPage'
import MyReportsPage  from './modules/maintenance/MyReportsPage'
import HousingReportPage from './modules/housing/HousingReportPage'

// ─── شاشة رفض الوصول ──────────────────────────────────────────────────────────
function AccessDenied() {
  return (
    <div className="empty-state" style={{ paddingTop: 80 }}>
      <div className="es-icon">🔒</div>
      <div className="es-title">ليس لديك صلاحية لعرض هذه الصفحة</div>
      <div className="es-sub">تواصل مع المدير لمنحك الصلاحية المناسبة</div>
    </div>
  )
}

function AppShell() {
  const { user, loading, role, isAdmin, hasPerm } = useAuth()
  const [page, setPage] = useState(null)

  // إعادة توجيه تلقائي للصفحة الافتراضية حسب الصلاحيات
  const getDefaultPage = () => {
    if (isAdmin) return 'supervisor'
    if (hasPerm('supervisor_entry') || hasPerm('supervisor_reports')) return 'supervisor'
    if (hasPerm('caretaker_entry')  || hasPerm('caretaker_reports'))  return 'caretaker'
    if (hasPerm('housing_entry')    || hasPerm('housing_reports'))    return 'housing'
    if (hasPerm('custody_view'))    return 'custody'
    if (hasPerm('reports_daily') || hasPerm('reports_view_all')) return 'reports'
    if (hasPerm('reports_tool') || hasPerm('reports_facility'))  return 'myreports'
    if (hasPerm('can_create_supervisors')) return 'admin'
    // إذا ما في أي صلاحية معروفة — أظهر رسالة واضحة بدل التجميد
    return '__no_access__'
  }

  // إعادة الصفحة لافتراضية عند تغيّر الصلاحيات
  useEffect(() => {
    if (user && !loading) setPage(null)
  }, [user, loading])

  if (loading) return (
    <div className="loading-overlay" style={{ display: 'flex' }}>
      <div className="spinner" />
    </div>
  )

  if (!user) return <LoginScreen />

  const activePage = page || getDefaultPage()

  // ─ تحديد ما إذا كانت الصفحة مسموحاً بها
  const canAccess = (p) => {
    if (isAdmin) return true
    switch (p) {
      case 'supervisor': return hasPerm('supervisor_entry') || hasPerm('supervisor_reports')
      case 'caretaker':  return hasPerm('caretaker_entry')  || hasPerm('caretaker_reports')
      case 'housing':    return hasPerm('housing_entry')    || hasPerm('housing_reports')
      case 'custody':    return hasPerm('custody_view')
      case 'reports':    return hasPerm('reports_daily') || hasPerm('supervisor_reports') ||
                                hasPerm('caretaker_reports') || hasPerm('custody_reports') ||
                                hasPerm('reports_view_all')
      case 'myreports':  return hasPerm('reports_tool') || hasPerm('reports_facility')
      case 'admin':      return isAdmin || hasPerm('can_create_supervisors')
      default:           return false
    }
  }

  const renderPage = () => {
    // حالة خاصة: المستخدم بدون أي صلاحية مفيدة
    if (activePage === '__no_access__') {
      return (
        <div className="empty-state" style={{ paddingTop: 80 }}>
          <div className="es-icon">🔒</div>
          <div className="es-title">لا توجد صلاحيات مخصصة لحسابك</div>
          <div className="es-sub">تواصل مع المدير لمنحك الصلاحيات المناسبة</div>
        </div>
      )
    }
    if (!canAccess(activePage)) return <AccessDenied />
    switch (activePage) {
      case 'supervisor': return <SupervisorPage />
      case 'caretaker':  return <CaretakerPage />
      case 'housing':    return <HousingReportPage />
      case 'custody':    return <CustodyPage />
      case 'reports':    return <ReportsPage />
      case 'myreports':  return <MyReportsPage />
      case 'admin':      return <AdminPage />
      default:           return <AccessDenied />
    }
  }

  return (
    <div className="app-shell">
      <Topbar activePage={activePage} onNav={setPage} />
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
