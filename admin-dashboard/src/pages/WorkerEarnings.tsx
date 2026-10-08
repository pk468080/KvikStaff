import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type WorkerProfile = {
  id: string
  rating: number | null
  total_completed_jobs: number | null
  profiles: {
    full_name: string | null
    email: string | null
  } | null
}

type Booking = {
  id: string
  worker_id: string | null
  status: string
  total_amount: number | null
  base_amount: number | null
  scheduled_start: string | null
}

type WorkerEarningRow = {
  worker_id: string
  worker_name: string
  email: string
  total_jobs: number
  gross_amount: number
  platform_fee: number
  net_earnings: number
  rating: number
}

type DateFilter = 'all' | 'last30days' | 'last90days'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 15

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRupee(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(amount)
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
  }).format(date)
}

function shortId(value: string): string {
  return value.length > 12 ? `${value.slice(0, 8)}…` : value
}

function cutoffDate(filter: DateFilter): Date | null {
  if (filter === 'all') return null
  const days = filter === 'last30days' ? 30 : 90
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d
}

function escapeCsv(value: unknown): string {
  const text = String(value ?? '')
  return `"${text.replace(/"/g, '""')}"`
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function WorkerEarnings() {
  // Raw data from Supabase
  const [workerProfiles, setWorkerProfiles] = useState<WorkerProfile[]>([])
  const [completedBookings, setCompletedBookings] = useState<Booking[]>([])

  // UI state
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [dateFilter, setDateFilter] = useState<DateFilter>('all')
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  async function loadData() {
    setLoading(true)
    setError(null)

    const [profilesResult, bookingsResult] = await Promise.all([
      supabase
        .from('worker_profiles')
        .select(`
          id,
          rating,
          total_completed_jobs,
          profiles!worker_profiles_id_fkey (
            full_name,
            email
          )
        `),

      supabase
        .from('bookings')
        .select('id, worker_id, status, total_amount, base_amount, scheduled_start')
        .eq('status', 'completed'),
    ])

    if (profilesResult.error) {
      console.error('worker_profiles error:', profilesResult.error)
      setError(profilesResult.error.message)
      setLoading(false)
      return
    }

    if (bookingsResult.error) {
      // bookings table errors are not fatal – we can still compute from profiles
      console.error('bookings error:', bookingsResult.error)
    }

    setWorkerProfiles((profilesResult.data as unknown as WorkerProfile[]) ?? [])
    setCompletedBookings((bookingsResult.data as unknown as Booking[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  // Reset page whenever filters change
  useEffect(() => {
    setPage(1)
  }, [search, dateFilter])

  // ---------------------------------------------------------------------------
  // Compute worker earnings from completed bookings
  // ---------------------------------------------------------------------------

  const allWorkerEarnings = useMemo<WorkerEarningRow[]>(() => {
    // Build a quick lookup for profile data
    const profileMap = new Map<string, WorkerProfile>()
    for (const profile of workerProfiles) {
      profileMap.set(profile.id, profile)
    }

    // Group bookings by worker_id
    const grouped = new Map<
      string,
      { gross: number; count: number; bookings: Booking[] }
    >()

    for (const booking of completedBookings) {
      if (!booking.worker_id) continue

      const base = Number(booking.base_amount ?? 0)
      const existing = grouped.get(booking.worker_id)

      if (existing) {
        existing.gross += base
        existing.count += 1
        existing.bookings.push(booking)
      } else {
        grouped.set(booking.worker_id, {
          gross: base,
          count: 1,
          bookings: [booking],
        })
      }
    }

    const rows: WorkerEarningRow[] = []

    for (const [workerId, data] of grouped.entries()) {
      const profile = profileMap.get(workerId)
      const platform_fee = data.gross * 0.1
      const net_earnings = data.gross - platform_fee

      rows.push({
        worker_id: workerId,
        worker_name: profile?.profiles?.full_name ?? '—',
        email: profile?.profiles?.email ?? '—',
        total_jobs: data.count,
        gross_amount: data.gross,
        platform_fee,
        net_earnings,
        rating: Number(profile?.rating ?? 0),
      })
    }

    // Sort by net earnings descending
    rows.sort((a, b) => b.net_earnings - a.net_earnings)
    return rows
  }, [workerProfiles, completedBookings])

  // ---------------------------------------------------------------------------
  // Filtering
  // ---------------------------------------------------------------------------

  const cutoff = useMemo(() => cutoffDate(dateFilter), [dateFilter])

  /** Bookings after applying the date filter */
  const dateFilteredBookings = useMemo<Booking[]>(() => {
    if (!cutoff) return completedBookings
    return completedBookings.filter(b => {
      if (!b.scheduled_start) return false
      return new Date(b.scheduled_start) >= cutoff
    })
  }, [completedBookings, cutoff])

  /** Worker earnings re-computed for the date-filtered bookings */
  const dateFilteredEarnings = useMemo<WorkerEarningRow[]>(() => {
    if (!cutoff) return allWorkerEarnings

    const profileMap = new Map<string, WorkerProfile>()
    for (const profile of workerProfiles) {
      profileMap.set(profile.id, profile)
    }

    const grouped = new Map<string, { gross: number; count: number }>()

    for (const booking of dateFilteredBookings) {
      if (!booking.worker_id) continue
      const base = Number(booking.base_amount ?? 0)
      const existing = grouped.get(booking.worker_id)
      if (existing) {
        existing.gross += base
        existing.count += 1
      } else {
        grouped.set(booking.worker_id, { gross: base, count: 1 })
      }
    }

    const rows: WorkerEarningRow[] = []
    for (const [workerId, data] of grouped.entries()) {
      const profile = profileMap.get(workerId)
      const platform_fee = data.gross * 0.1
      rows.push({
        worker_id: workerId,
        worker_name: profile?.profiles?.full_name ?? '—',
        email: profile?.profiles?.email ?? '—',
        total_jobs: data.count,
        gross_amount: data.gross,
        platform_fee,
        net_earnings: data.gross - platform_fee,
        rating: Number(profile?.rating ?? 0),
      })
    }

    rows.sort((a, b) => b.net_earnings - a.net_earnings)
    return rows
  }, [allWorkerEarnings, dateFilteredBookings, cutoff, workerProfiles])

  const normalizedSearch = search.trim().toLowerCase()

  const filteredEarnings = useMemo<WorkerEarningRow[]>(() => {
    if (!normalizedSearch) return dateFilteredEarnings
    return dateFilteredEarnings.filter(
      row =>
        row.worker_name.toLowerCase().includes(normalizedSearch) ||
        row.email.toLowerCase().includes(normalizedSearch),
    )
  }, [dateFilteredEarnings, normalizedSearch])

  // ---------------------------------------------------------------------------
  // Summary stats
  // ---------------------------------------------------------------------------

  const totalWorkers = filteredEarnings.length
  const totalJobs = filteredEarnings.reduce((s, r) => s + r.total_jobs, 0)
  const totalGross = filteredEarnings.reduce((s, r) => s + r.gross_amount, 0)
  const totalNet = filteredEarnings.reduce((s, r) => s + r.net_earnings, 0)

  // ---------------------------------------------------------------------------
  // Pagination
  // ---------------------------------------------------------------------------

  const totalPages = Math.max(1, Math.ceil(filteredEarnings.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)

  const pagedEarnings = useMemo(
    () =>
      filteredEarnings.slice(
        (safePage - 1) * PAGE_SIZE,
        safePage * PAGE_SIZE,
      ),
    [filteredEarnings, safePage],
  )

  // ---------------------------------------------------------------------------
  // Selected worker bookings (detail panel)
  // ---------------------------------------------------------------------------

  const selectedWorkerBookings = useMemo<Booking[]>(() => {
    if (!selectedWorkerId) return []
    return dateFilteredBookings.filter(b => b.worker_id === selectedWorkerId)
  }, [selectedWorkerId, dateFilteredBookings])

  const selectedWorkerRow = useMemo(
    () => filteredEarnings.find(r => r.worker_id === selectedWorkerId) ?? null,
    [filteredEarnings, selectedWorkerId],
  )

  // ---------------------------------------------------------------------------
  // CSV Export
  // ---------------------------------------------------------------------------

  function exportCsv() {
    if (filteredEarnings.length === 0) return

    const header = [
      'Worker ID',
      'Worker Name',
      'Email',
      'Completed Jobs',
      'Gross Amount (₹)',
      'Platform Fee (₹)',
      'Net Earnings (₹)',
      'Rating',
    ]

    const rows = filteredEarnings.map(r => [
      r.worker_id,
      r.worker_name,
      r.email,
      r.total_jobs,
      r.gross_amount.toFixed(2),
      r.platform_fee.toFixed(2),
      r.net_earnings.toFixed(2),
      r.rating,
    ])

    const csv = [header, ...rows]
      .map(row => row.map(escapeCsv).join(','))
      .join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `worker-earnings-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  function renderStarRating(rating: number) {
    const stars = Math.round(rating)
    return (
      <span title={`${rating.toFixed(1)} / 5`}>
        {Array.from({ length: 5 }, (_, i) => (
          <span
            key={i}
            style={{ color: i < stars ? '#f59e0b' : '#cbd5e1', fontSize: 14 }}
          >
            ★
          </span>
        ))}
        <span style={{ marginLeft: 4, color: '#64748b', fontSize: 12 }}>
          {rating > 0 ? rating.toFixed(1) : '—'}
        </span>
      </span>
    )
  }

  function renderPagination() {
    if (filteredEarnings.length <= PAGE_SIZE) return null

    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          padding: '16px 0 0',
          flexWrap: 'wrap',
        }}
      >
        <span style={{ color: '#64748b', fontSize: 13 }}>
          Showing {(safePage - 1) * PAGE_SIZE + 1}–
          {Math.min(safePage * PAGE_SIZE, filteredEarnings.length)} of{' '}
          {filteredEarnings.length}
        </span>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="dashboard-refresh"
            disabled={safePage <= 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
          >
            Previous
          </button>
          <button
            className="dashboard-refresh"
            disabled={safePage >= totalPages}
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
          >
            Next
          </button>
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Loading / Error states
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="page-content">
        <div className="page-heading">
          <div>
            <h1>Worker Earnings</h1>
            <p>Track and manage worker payouts.</p>
          </div>
        </div>
        <div style={{ textAlign: 'center', padding: '64px 0', color: '#64748b' }}>
          Loading earnings data…
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------

  return (
    <div className="page-content">
      {/* Page header */}
      <div className="page-heading">
        <div>
          <h1>Worker Earnings</h1>
          <p>
            Track completed jobs, gross revenue, platform fees, and net payouts
            for each worker.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            className="dashboard-refresh"
            onClick={exportCsv}
            disabled={filteredEarnings.length === 0}
          >
            Export CSV
          </button>

          <button
            className="dashboard-refresh"
            onClick={loadData}
            disabled={loading}
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="error-banner">
          {error}
        </div>
      )}

      {/* ── Stat cards ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 16,
          marginBottom: 24,
        }}
      >
        {(
          [
            {
              label: 'Workers with Earnings',
              value: totalWorkers.toLocaleString('en-IN'),
              color: '#6366f1',
            },
            {
              label: 'Total Completed Jobs',
              value: totalJobs.toLocaleString('en-IN'),
              color: '#10b981',
            },
            {
              label: 'Total Gross Amount',
              value: formatRupee(totalGross),
              color: '#f59e0b',
            },
            {
              label: 'Total Net Payable',
              value: formatRupee(totalNet),
              color: '#3b82f6',
            },
          ] as const
        ).map(card => (
          <div
            key={card.label}
            className="panel"
            style={{ padding: '20px 24px' }}
          >
            <p
              style={{
                margin: 0,
                fontSize: 12,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: '#64748b',
              }}
            >
              {card.label}
            </p>
            <p
              style={{
                margin: '8px 0 0',
                fontSize: 22,
                fontWeight: 700,
                color: card.color,
              }}
            >
              {card.value}
            </p>
          </div>
        ))}
      </div>

      {/* ── Filter bar ── */}
      <div className="panel" style={{ marginBottom: 20 }}>
        <div
          style={{
            display: 'flex',
            gap: 12,
            flexWrap: 'wrap',
            alignItems: 'center',
            padding: '14px 20px',
          }}
        >
          <input
            type="text"
            placeholder="Search by worker name or email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              flex: '1 1 220px',
              padding: '8px 12px',
              borderRadius: 6,
              border: '1px solid #e2e8f0',
              fontSize: 14,
              outline: 'none',
            }}
          />

          <select
            value={dateFilter}
            onChange={e => setDateFilter(e.target.value as DateFilter)}
            style={{
              padding: '8px 12px',
              borderRadius: 6,
              border: '1px solid #e2e8f0',
              fontSize: 14,
              background: '#fff',
              cursor: 'pointer',
            }}
          >
            <option value="all">All Time</option>
            <option value="last30days">Last 30 Days</option>
            <option value="last90days">Last 90 Days</option>
          </select>

          {(search || dateFilter !== 'all') && (
            <button
              className="dashboard-refresh"
              onClick={() => {
                setSearch('')
                setDateFilter('all')
                setSelectedWorkerId(null)
              }}
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* ── Earnings table ── */}
      <div className="panel">
        <div
          className="panel-header"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
            Worker Earnings
          </h2>
          <span style={{ color: '#64748b', fontSize: 13 }}>
            {filteredEarnings.length} worker
            {filteredEarnings.length !== 1 ? 's' : ''}
          </span>
        </div>

        {filteredEarnings.length === 0 ? (
          <div className="bookings-empty">
            No earnings data found for the selected filters.
          </div>
        ) : (
          <>
            <div className="bookings-table-wrap">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {[
                      'Worker',
                      'Email',
                      'Completed Jobs',
                      'Gross Amount',
                      'Net Earnings',
                      'Rating',
                      'Actions',
                    ].map(col => (
                      <th
                        key={col}
                        style={{
                          padding: '10px 14px',
                          textAlign: 'left',
                          fontSize: 12,
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          color: '#64748b',
                          borderBottom: '1px solid #e2e8f0',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {pagedEarnings.map(row => (
                    <tr
                      key={row.worker_id}
                      style={{
                        background:
                          selectedWorkerId === row.worker_id
                            ? '#eff6ff'
                            : undefined,
                      }}
                    >
                      <td
                        style={{
                          padding: '12px 14px',
                          fontSize: 14,
                          borderBottom: '1px solid #f1f5f9',
                          fontWeight: 500,
                        }}
                      >
                        <div>{row.worker_name}</div>
                        <div
                          className="booking-id"
                          style={{ marginTop: 2 }}
                          title={row.worker_id}
                        >
                          {shortId(row.worker_id)}
                        </div>
                      </td>

                      <td
                        style={{
                          padding: '12px 14px',
                          fontSize: 13,
                          borderBottom: '1px solid #f1f5f9',
                          color: '#475569',
                        }}
                      >
                        {row.email}
                      </td>

                      <td
                        style={{
                          padding: '12px 14px',
                          fontSize: 14,
                          borderBottom: '1px solid #f1f5f9',
                          textAlign: 'right',
                          fontWeight: 600,
                        }}
                      >
                        {row.total_jobs.toLocaleString('en-IN')}
                      </td>

                      <td
                        style={{
                          padding: '12px 14px',
                          fontSize: 14,
                          borderBottom: '1px solid #f1f5f9',
                          textAlign: 'right',
                          color: '#f59e0b',
                          fontWeight: 600,
                        }}
                      >
                        {formatRupee(row.gross_amount)}
                      </td>

                      <td
                        style={{
                          padding: '12px 14px',
                          fontSize: 14,
                          borderBottom: '1px solid #f1f5f9',
                          textAlign: 'right',
                        }}
                      >
                        <div
                          style={{
                            fontWeight: 700,
                            color: '#10b981',
                          }}
                        >
                          {formatRupee(row.net_earnings)}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: '#94a3b8',
                            marginTop: 2,
                          }}
                        >
                          Fee: {formatRupee(row.platform_fee)}
                        </div>
                      </td>

                      <td
                        style={{
                          padding: '12px 14px',
                          fontSize: 14,
                          borderBottom: '1px solid #f1f5f9',
                        }}
                      >
                        {renderStarRating(row.rating)}
                      </td>

                      <td
                        style={{
                          padding: '12px 14px',
                          borderBottom: '1px solid #f1f5f9',
                        }}
                      >
                        <button
                          className="dashboard-refresh"
                          style={{
                            fontSize: 12,
                            padding: '5px 12px',
                            background:
                              selectedWorkerId === row.worker_id
                                ? '#3b82f6'
                                : undefined,
                            color:
                              selectedWorkerId === row.worker_id
                                ? '#fff'
                                : undefined,
                          }}
                          onClick={() =>
                            setSelectedWorkerId(
                              selectedWorkerId === row.worker_id
                                ? null
                                : row.worker_id,
                            )
                          }
                        >
                          {selectedWorkerId === row.worker_id
                            ? 'Hide Jobs'
                            : 'View Jobs'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {renderPagination()}
          </>
        )}
      </div>

      {/* ── Detail panel: selected worker's bookings ── */}
      {selectedWorkerId && selectedWorkerRow && (
        <div className="panel" style={{ marginTop: 20 }}>
          <div
            className="panel-header"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
                Completed Bookings — {selectedWorkerRow.worker_name}
              </h2>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
                {selectedWorkerRow.email} ·{' '}
                {selectedWorkerBookings.length} booking
                {selectedWorkerBookings.length !== 1 ? 's' : ''}
              </p>
            </div>
            <button
              className="dashboard-refresh"
              style={{ fontSize: 12 }}
              onClick={() => setSelectedWorkerId(null)}
            >
              Close
            </button>
          </div>

          {selectedWorkerBookings.length === 0 ? (
            <div className="bookings-empty">
              No completed bookings found for the selected date range.
            </div>
          ) : (
            <div className="bookings-table-wrap">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {[
                      'Booking ID',
                      'Date',
                      'Base Amount',
                      'Net (90%)',
                    ].map(col => (
                      <th
                        key={col}
                        style={{
                          padding: '10px 14px',
                          textAlign: 'left',
                          fontSize: 12,
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          color: '#64748b',
                          borderBottom: '1px solid #e2e8f0',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {selectedWorkerBookings.map(booking => {
                    const base = Number(booking.base_amount ?? 0)
                    const net = base * 0.9

                    return (
                      <tr key={booking.id}>
                        <td
                          style={{
                            padding: '11px 14px',
                            borderBottom: '1px solid #f1f5f9',
                          }}
                        >
                          <span
                            className="booking-id"
                            title={booking.id}
                          >
                            {shortId(booking.id)}
                          </span>
                        </td>

                        <td
                          style={{
                            padding: '11px 14px',
                            fontSize: 13,
                            color: '#475569',
                            borderBottom: '1px solid #f1f5f9',
                          }}
                        >
                          {formatDate(booking.scheduled_start)}
                        </td>

                        <td
                          style={{
                            padding: '11px 14px',
                            fontSize: 14,
                            textAlign: 'right',
                            color: '#f59e0b',
                            fontWeight: 600,
                            borderBottom: '1px solid #f1f5f9',
                          }}
                        >
                          {formatRupee(base)}
                        </td>

                        <td
                          style={{
                            padding: '11px 14px',
                            fontSize: 14,
                            textAlign: 'right',
                            color: '#10b981',
                            fontWeight: 700,
                            borderBottom: '1px solid #f1f5f9',
                          }}
                        >
                          {formatRupee(net)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>

                {/* Summary row */}
                <tfoot>
                  <tr>
                    <td
                      colSpan={2}
                      style={{
                        padding: '12px 14px',
                        fontWeight: 600,
                        fontSize: 13,
                        color: '#475569',
                      }}
                    >
                      Total ({selectedWorkerBookings.length} jobs)
                    </td>
                    <td
                      style={{
                        padding: '12px 14px',
                        textAlign: 'right',
                        fontWeight: 700,
                        color: '#f59e0b',
                        fontSize: 14,
                      }}
                    >
                      {formatRupee(selectedWorkerRow.gross_amount)}
                    </td>
                    <td
                      style={{
                        padding: '12px 14px',
                        textAlign: 'right',
                        fontWeight: 700,
                        color: '#10b981',
                        fontSize: 14,
                      }}
                    >
                      {formatRupee(selectedWorkerRow.net_earnings)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
