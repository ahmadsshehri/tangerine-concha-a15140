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

// ─── شاشة بدون صلاحيات ────────────────────────────────────────────────────────
function NoAccess() {
  const { logout } = useAuth()
  return (
    <div className="empty-state" style={{ paddingTop: 80 }}>
      <div className="es-icon">🔒</div>
      <div className="es-title">لا توجد صلاحيات مخصصة لحسابك</div>
      <div className="es-sub">تواصل مع المدير لمنحك الصلاحيات المناسبة</div>
      <button className="btn btn-outline" style={{ marginTop: 20 }} onClick={logout}>
        🚪 تسجيل الخروج
      </button>
    </div>
  )
}

function AppShell() {
  const { user, loading, permissionsLoaded, isAdmin, hasPerm } = useAuth()
  const [page, setPage] = useState(null)

  // إعادة الصفحة لافتراضية عند تغيّر المستخدم فقط
  const userId = user?.uid || null
  useEffect(() => { setPage(null) }, [userId])

  // ─── الصفحة الافتراضية حسب الصلاحيات ─────────────────────────────────────
  const getDefaultPage = () => {
    if (isAdmin)                                                        return 'supervisor'
    if (hasPerm('supervisor_entry') || hasPerm('supervisor_reports'))   return 'supervisor'
    if (hasPerm('caretaker_entry')  || hasPerm('caretaker_reports'))    return 'caretaker'
    if (hasPerm('housing_entry')    || hasPerm('housing_reports'))      return 'housing'
    if (hasPerm('custody_view'))                                        return 'custody'
    if (hasPerm('reports_daily')    || hasPerm('reports_view_all'))     return 'reports'
    if (hasPerm('reports_tool')     || hasPerm('reports_facility'))     return 'myreports'
    if (hasPerm('can_create_supervisors'))                              return 'admin'
    return '__no_access__'
  }

  // ─── هل الصفحة المطلوبة مسموح بها؟ ──────────────────────────────────────
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

  // ─── شاشة التحميل ─────────────────────────────────────────────────────────
  const spinner = (
    <div className="loading-overlay" style={{ display: 'flex' }}>
      <div className="spinner" />
    </div>
  )

  if (loading) return spinner
  if (!user)   return <LoginScreen />

  // انتظر حتى تتحمل الصلاحيات من Firestore قبل ما نحدد الصفحة
  if (!permissionsLoaded) return spinner

  const activePage = page || getDefaultPage()

  const renderPage = () => {
    if (activePage === '__no_access__') return <NoAccess />
    if (!canAccess(activePage))         return <AccessDenied />
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
