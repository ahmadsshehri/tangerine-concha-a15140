import { useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import StaffList         from './StaffList'
import DailySheet        from './DailySheet'
import AttendanceReports from './AttendanceReports'
import AttendanceSettings from './AttendanceSettings'

const TABS = [
  { id: 'daily',    label: 'الحضور اليومي', icon: '📋' },
  { id: 'staff',    label: 'الكوادر',        icon: '👥' },
  { id: 'reports',  label: 'التقارير',        icon: '📊' },
  { id: 'settings', label: 'الإعدادات',      icon: '⚙️' },
]

export default function AttendancePage() {
  const { isAdmin, hasPerm } = useAuth()
  const [tab, setTab] = useState('daily')

  const canManageStaff   = isAdmin || hasPerm('attendance_manage_staff')
  const canViewReports   = isAdmin || hasPerm('attendance_reports')
  const visibleTabs = TABS.filter(t => {
    if (t.id === 'staff'    && !canManageStaff) return false
    if (t.id === 'reports'  && !canViewReports)  return false
    if (t.id === 'settings' && !isAdmin)         return false
    return true
  })

  return (
    <div className="page-wrap">
      <div className="page-header">
        <h1 className="page-title">👥 الموارد البشرية — الحضور</h1>
      </div>

      <div className="tab-bar">
        {visibleTabs.map(t => (
          <button
            key={t.id}
            className={`tab-btn ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div className="tab-content animate-in" key={tab}>
        {tab === 'daily'    && <DailySheet />}
        {tab === 'staff'    && <StaffList />}
        {tab === 'reports'  && <AttendanceReports />}
        {tab === 'settings' && <AttendanceSettings />}
      </div>
    </div>
  )
}
