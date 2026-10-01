import { useEffect, useState } from 'react'
import { adminAction } from '../lib/adminAction'
import { supabase } from '../lib/supabase'

type Stats = {
  bookings: number
  workers: number
  customers: number
  activeBookings: number
  completedBookings: number
  revenue: number
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats>({
    bookings: 0,
    workers: 0,
    customers: 0,
    activeBookings: 0,
    completedBookings: 0,
    revenue: 0,
  })

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    loadDashboard()
  }, [])

  async function loadDashboard() {
    setLoading(true)
    setError('')

    try {
      const [
        bookingsResult,
        workersResult,
        customersResult,
        activeResult,
        completedResult,
        revenueResult,
      ] = await Promise.all([
        supabase
          .from('bookings')
          .select('id', {
            count: 'exact',
            head: true,
          }),

        supabase
          .from('worker_profiles')
          .select('id', {
            count: 'exact',
            head: true,
          }),

        supabase
          .from('profiles')
          .select('id', {
            count: 'exact',
            head: true,
          })
          .eq('role', 'customer'),

        supabase
          .from('bookings')
          .select('id', {
            count: 'exact',
            head: true,
          })
          .in('status', [
            'paid',
            'searching_worker',
            'assigned',
            'on_the_way',
            'arrived',
            'in_progress',
          ]),

        supabase
          .from('bookings')
          .select('id', {
            count: 'exact',
            head: true,
          })
          .eq('status', 'completed'),

        supabase
  .from('payments')
  .select(
    'id, amount, status',
  ),
      ])

      if (bookingsResult.error) {
  throw bookingsResult.error
}

if (workersResult.error) {
  throw workersResult.error
}

if (customersResult.error) {
  throw customersResult.error
}

if (activeResult.error) {
  throw activeResult.error
}

if (completedResult.error) {
  throw completedResult.error
}

if (revenueResult.error) {
  throw revenueResult.error
}

if (refundsResult.error) {
  throw refundsResult.error
}

      const grossPaid =
  (
    revenueResult.data || []
  )
    .filter(
      payment =>
        payment.status ===
          'paid' ||
        payment.status ===
          'partially_refunded' ||
        payment.status ===
          'refunded',
    )
    .reduce(
      (
        total,
        payment,
      ) =>
        total +
        Number(
          payment.amount || 0,
        ),
      0,
    )

const successfulRefunds =
  (
    refundsResult.data || []
  )
    .filter(
      refund =>
        refund.status ===
        'succeeded',
    )
    .reduce(
      (
        total,
        refund,
      ) =>
        total +
        Number(
          refund.amount || 0,
        ),
      0,
    )

const netCollected =
  Math.max(
    0,
    grossPaid -
      successfulRefunds,
  )

      setStats({
        bookings: bookingsResult.count || 0,
        workers: workersResult.count || 0,
        customers: customersResult.count || 0,
        activeBookings: activeResult.count || 0,
        completedBookings: completedResult.count || 0,
       revenue:
  netCollected,
      })
    } catch (err) {
      console.error(
        '[Admin Dashboard] Failed to load stats:',
        err
      )

      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load dashboard data.'
      )
    } finally {
      setLoading(false)
    }
  }

  const completionRate =
    stats.bookings > 0
      ? Math.round(
          (stats.completedBookings / stats.bookings) * 100
        )
      : 0

  return (
    <div className="dashboard-page">

      {/* Header */}
      <header className="dashboard-header">
        <div>
          <div className="dashboard-eyebrow">
            TEMStaff ADMIN
          </div>

          <h1>Dashboard</h1>

          <p>
            Monitor your platform operations and activity.
          </p>
        </div>

        <button
          className="dashboard-refresh"
          onClick={loadDashboard}
          disabled={loading}
        >
          <span className={loading ? 'refresh-icon spinning' : 'refresh-icon'}>
            ↻
          </span>

          {loading ? 'Refreshing...' : 'Refresh data'}
        </button>
      </header>

      {/* Error */}
      {error && (
        <div className="dashboard-error">
          <span>!</span>
          <div>
            <strong>Unable to load dashboard</strong>
            <p>{error}</p>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <section className="dashboard-stats">

        <StatCard
          title="Total bookings"
          value={stats.bookings}
          icon="▣"
          loading={loading}
          description="All bookings"
        />

        <StatCard
          title="Active bookings"
          value={stats.activeBookings}
          icon="◉"
          loading={loading}
          description="Currently in progress"
          accent
        />

        <StatCard
          title="Completed jobs"
          value={stats.completedBookings}
          icon="✓"
          loading={loading}
          description={`${completionRate}% completion rate`}
        />

        <StatCard
          title="Workers"
          value={stats.workers}
          icon="♙"
          loading={loading}
          description="Registered workers"
        />

        <StatCard
          title="Customers"
          value={stats.customers}
          icon="◎"
          loading={loading}
          description="Registered customers"
        />

        <StatCard
          title="Net collected"
          value={`₹${stats.revenue.toLocaleString('en-IN')}`}
          icon="₹"
          loading={loading}
          description="Payments minus completed refunds"
          revenue
        />

      </section>

      {/* Main Dashboard */}
      <section className="dashboard-main-grid">

        {/* Operations */}
        <div className="dashboard-panel operations-panel">

          <div className="panel-heading">
            <div>
              <span className="panel-label">
                OPERATIONS
              </span>

              <h2>Platform overview</h2>

              <p>
                Current activity across TempStaff.
              </p>
            </div>

            <div className="live-indicator">
              <span />
              Live
            </div>
          </div>

          <div className="operation-list">

            <OperationRow
              icon="▣"
              title="Total bookings"
              description="All bookings created"
              value={stats.bookings}
              loading={loading}
            />

            <OperationRow
              icon="◉"
              title="Active bookings"
              description="Jobs currently active"
              value={stats.activeBookings}
              loading={loading}
              highlight
            />

            <OperationRow
              icon="✓"
              title="Completed jobs"
              description="Successfully completed"
              value={stats.completedBookings}
              loading={loading}
            />

            <OperationRow
              icon="♙"
              title="Workers"
              description="Workers registered"
              value={stats.workers}
              loading={loading}
            />

            <OperationRow
              icon="◎"
              title="Customers"
              description="Customers registered"
              value={stats.customers}
              loading={loading}
            />

          </div>
        </div>

        {/* Performance */}
        <div className="dashboard-panel performance-panel">

          <div className="panel-heading">
            <div>
              <span className="panel-label">
                PERFORMANCE
              </span>

              <h2>Booking performance</h2>

              <p>
                Completion overview.
              </p>
            </div>
          </div>

          <div className="completion-container">

            <div
              className="completion-ring"
              style={{
                '--completion': `${completionRate}%`,
              } as React.CSSProperties}
            >
              <div className="completion-inner">
                <strong>
                  {loading ? '—' : `${completionRate}%`}
                </strong>

                <span>completed</span>
              </div>
            </div>

            <div className="performance-summary">

              <div>
                <span className="performance-dot active" />
                <div>
                  <strong>
                    {loading ? '—' : stats.activeBookings}
                  </strong>
                  <span>Active</span>
                </div>
              </div>

              <div>
                <span className="performance-dot completed" />
                <div>
                  <strong>
                    {loading ? '—' : stats.completedBookings}
                  </strong>
                  <span>Completed</span>
                </div>
              </div>

              <div>
                <span className="performance-dot total" />
                <div>
                  <strong>
                    {loading ? '—' : stats.bookings}
                  </strong>
                  <span>Total</span>
                </div>
              </div>

            </div>
          </div>
        </div>

      </section>

      {/* Bottom */}
      <section className="dashboard-bottom-grid">

        {/* Revenue */}
        <div className="dashboard-panel revenue-panel">

          <div className="panel-heading">
            <div>
              <span className="panel-label">
                REVENUE
              </span>

<h2>Net collected</h2>
              <p>
  Successful payments minus completed refunds.
</p>
            </div>
          </div>

          <div className="revenue-value">
            {loading
              ? '—'
              : `₹${stats.revenue.toLocaleString('en-IN')}`}
          </div>

          <div className="revenue-footer">
           <span>
  Collection status
</span>

<strong>
  Net
</strong>
          </div>

        </div>

        {/* Quick Actions */}
        <div className="dashboard-panel">

          <div className="panel-heading">
            <div>
              <span className="panel-label">
                MANAGEMENT
              </span>

              <h2>Quick actions</h2>

              <p>
                Jump directly to administration areas.
              </p>
            </div>
          </div>

          <div className="quick-action-grid">

            <a href="/bookings" className="quick-action">
              <span className="quick-action-icon">
                ▣
              </span>

              <span>
                <strong>Bookings</strong>
                <small>Manage jobs</small>
              </span>

              <b>→</b>
            </a>

            <a href="/workers" className="quick-action">
              <span className="quick-action-icon">
                ♙
              </span>

              <span>
                <strong>Workers</strong>
                <small>Manage workers</small>
              </span>

              <b>→</b>
            </a>

            <a href="/customers" className="quick-action">
              <span className="quick-action-icon">
                ◎
              </span>

              <span>
                <strong>Customers</strong>
                <small>View customers</small>
              </span>

              <b>→</b>
            </a>

            <a href="/services" className="quick-action">
              <span className="quick-action-icon">
                ◈
              </span>

              <span>
                <strong>Services</strong>
                <small>Manage services</small>
              </span>

              <b>→</b>
            </a>

          </div>

        </div>

      </section>

    </div>
  )
}

function StatCard({
  title,
  value,
  icon,
  loading,
  description,
  accent,
  revenue,
}: {
  title: string
  value: string | number
  icon: string
  loading: boolean
  description: string
  accent?: boolean
  revenue?: boolean
}) {
  return (
    <div
      className={[
        'dashboard-stat-card',
        accent ? 'accent-card' : '',
        revenue ? 'revenue-card' : '',
      ].join(' ')}
    >

      <div className="stat-card-top">

        <div className="stat-card-icon">
          {icon}
        </div>

        {accent && (
          <span className="stat-live">
            LIVE
          </span>
        )}

      </div>

      <div className="stat-card-title">
        {title}
      </div>

      <div className="stat-card-value">
        {loading ? '—' : value}
      </div>

      <div className="stat-card-description">
        {description}
      </div>

    </div>
  )
}

function OperationRow({
  icon,
  title,
  description,
  value,
  loading,
  highlight,
}: {
  icon: string
  title: string
  description: string
  value: number
  loading: boolean
  highlight?: boolean
}) {
  return (
    <div
      className={[
        'operation-item',
        highlight ? 'operation-highlight' : '',
      ].join(' ')}
    >

      <div className="operation-icon">
        {icon}
      </div>

      <div className="operation-info">
        <strong>{title}</strong>
        <span>{description}</span>
      </div>

      <div className="operation-value">
        {loading ? '—' : value}
      </div>

    </div>
  )
}