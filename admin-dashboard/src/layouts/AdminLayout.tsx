import {
  NavLink,
  Outlet,
  useNavigate,
} from 'react-router-dom'

import { supabase } from '../lib/supabase'

const navGroups = [
  {
    label: 'MANAGEMENT',
    items: [
      { label: 'Overview', path: '/dashboard', icon: '▦' },
      { label: 'Live Map', path: '/live-map', icon: '⌖' },
      { label: 'Bookings', path: '/bookings', icon: '▣' },
      { label: 'Workers', path: '/workers', icon: '◉' },
      { label: 'Customers', path: '/customers', icon: '◎' },
      { label: 'Services', path: '/services', icon: '◆' },
      { label: 'Service Areas', path: '/service-areas', icon: '⌖' },
      { label: 'Offers & Updates', path: '/offers-updates', icon: '✦' },
      { label: 'Duration Discounts', path: '/duration-discounts', icon: '%' },
    ],
  },
  {
    label: 'FINANCE',
    items: [
      { label: 'Payments', path: '/payments', icon: '₹' },
      { label: 'Worker Earnings', path: '/worker-earnings', icon: '◈' },
    ],
  },
  {
    label: 'ENGAGEMENT',
    items: [
      { label: 'Reviews', path: '/reviews', icon: '★' },
      { label: 'Notifications', path: '/notifications', icon: '●' },
      { label: 'Support', path: '/support', icon: '◑' },
    ],
  },
  {
    label: 'PRIVACY',
    items: [
      { label: 'Account Deletion', path: '/account-deletion', icon: '⊘' },
    ],
  },
  {
    label: 'INSIGHTS',
    items: [
      { label: 'Analytics', path: '/analytics', icon: '▦' },
    ],
  },
  {
    label: 'CONFIGURATION',
    items: [
      { label: 'Settings', path: '/settings', icon: '⚙' },
    ],
  },
]

export default function AdminLayout() {
  const navigate = useNavigate()

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark">KS</div>
          <div>
            <div className="brand-name">KvikStaff</div>
            <div className="brand-role">ADMIN</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {navGroups.map(group => (
            <div key={group.label}>
              <div className="nav-section-title">{group.label}</div>
              {group.items.map(item => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                >
                  <span className="nav-icon">{item.icon}</span>
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <button className="logout-button" onClick={handleLogout}>
            <span className="nav-icon">⇥</span>
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-header">
          <div>
            <div className="header-title">KvikStaff Admin</div>
            <div className="header-subtitle">Operations management</div>
          </div>
          <div className="admin-user">
            <div className="admin-avatar">A</div>
            <div>
              <div className="admin-user-name">Administrator</div>
              <div className="admin-user-role">Admin</div>
            </div>
          </div>
        </header>

        <section className="admin-content">
          <Outlet />
        </section>
      </main>
    </div>
  )
}