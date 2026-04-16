import { useState } from 'react'
import ItemsPage from './items/ItemsPage'
import WingInventoryPage from './WingInventoryPage'
import MovementsPage from './movements/MovementsPage'
import CommitteesPage from './committees/CommitteesPage'
import WarehousePage from './warehouse/WarehousePage'
import ToolReportsPage from '../maintenance/ToolReportsPage'
import FacilityReportsPage from '../maintenance/FacilityReportsPage'

import { useAuth } from '../../hooks/useAuth'

const ALL_TABS = [
  { id: 'inventory',  label: 'عهدة الأجنحة',     icon: '🏠', perm: 'custody_view'       },
  { id: 'warehouse',  label: 'المستودع',           icon: '🏭', perm: 'custody_warehouse'  },
  { id: 'movements',  label: 'الحركات',            icon: '🔄', perm: 'custody_movements'  },
  { id: 'committees', label: 'اللجان',             icon: '👥', perm: 'custody_committees' },
  { id: 'tool',       label: 'بلاغات الأدوات',    icon: '🔧', perm: 'reports_tool'        },
  { id: 'facility',   label: 'بلاغات الصيانة',    icon: '🏗️', perm: 'reports_facility'   },
  { id: 'items',      label: 'إدارة الأصناف',     icon: '📦', perm: 'custody_items'       },
]

export default function CustodyPage() {
  const { isAdmin, hasPerm } = useAuth()
  const TABS = ALL_TABS.filter(t => isAdmin || hasPerm(t.perm))
  const [tab, setTab] = useState('inventory')
  const activeTab = TABS.find(t => t.id === tab) ? tab : (TABS[0]?.id || 'inventory')

  return (
    <div className="animate-in">
      <div className="page-header">
        <div className="page-title">
          <div className="icon" style={{ background: 'rgba(0,212,170,.15)' }}>📦</div>
          نظام إدارة العهدة والبلاغات
        </div>
      </div>

      <div className="tabs" style={{ overflowX: 'auto', flexWrap: 'nowrap' }}>
        {TABS.map(t => (
          <button key={t.id} className={`tab-btn ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'inventory'  && <WingInventoryPage />}
      {activeTab === 'warehouse'  && <WarehousePage />}
      {activeTab === 'movements'  && <MovementsPage />}
      {activeTab === 'committees' && <CommitteesPage />}
      {activeTab === 'tool'       && <ToolReportsPage />}
      {activeTab === 'facility'   && <FacilityReportsPage />}
      {activeTab === 'items'      && <ItemsPage />}
    </div>
  )
}
