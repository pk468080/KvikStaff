import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { adminAction } from '../lib/adminAction'

type Customer = {
  id: string
  full_name: string | null
  avatar_url: string | null
  email: string | null
  phone: string | null
  is_active: boolean
  created_at: string
  role: string
}

type Booking = {
  id: string
  status: string
  service_id: string
  scheduled_start: string | null
  scheduled_end: string | null
  total_amount: number | null
  created_at: string
}

type Review = {
  id: string
  rating: number
  comment: string | null
  created_at: string
  moderation_status: string
}

type Address = {
  id: string
  label: string | null
  address_line_1: string | null
  city: string | null
  state: string | null
  pincode: string | null
  is_default: boolean
}

type Tab = 'bookings' | 'reviews' | 'addresses'

export default function CustomerDetail() {
  const { customerId } = useParams()

  const [customer, setCustomer] = useState<Customer | null>(null)
  const [bookings, setBookings] = useState<Booking[]>([])
  const [reviews, setReviews] = useState<Review[]>([])
  const [addresses, setAddresses] = useState<Address[]>([])
  const [serviceNames, setServiceNames] = useState<Record<string, string>>({})

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [activeTab, setActiveTab] = useState<Tab>('bookings')

  async function loadCustomer() {
    if (!customerId) return

    setLoading(true)
    setError('')
    setSuccess('')

    const [profileResult, bookingsResult, reviewsResult, addressesResult] =
      await Promise.all([
        supabase
          .from('profiles')
          .select('id, full_name, avatar_url, email, phone, is_active, created_at, role')
          .eq('id', customerId)
          .maybeSingle(),

        supabase
          .from('bookings')
          .select('id, status, service_id, scheduled_start, scheduled_end, total_amount, created_at')
          .eq('customer_id', customerId)
          .order('created_at', { ascending: false }),

        supabase
          .from('reviews')
          .select('id, rating, comment, created_at, moderation_status')
          .eq('customer_id', customerId)
          .order('created_at', { ascending: false }),

        supabase
          .from('customer_addresses')
          .select('id, label, address_line_1, city, state, pincode, is_default')
          .eq('customer_id', customerId),
      ])

    const firstError = [
      profileResult,
      bookingsResult,
      reviewsResult,
      addressesResult,
    ].find(result => result.error)?.error

    if (firstError) {
      setError(firstError.message)
      setLoading(false)
      return
    }

    if (!profileResult.data) {
      setError('Customer not found.')
      setLoading(false)
      return
    }

    const p = profileResult.data
    setCustomer({
      id: p.id,
      full_name: p.full_name ?? null,
      avatar_url: p.avatar_url ?? null,
      email: p.email ?? null,
      phone: p.phone ?? null,
      is_active: Boolean(p.is_active),
      created_at: p.created_at,
      role: p.role,
    })

    const bookingData = (bookingsResult.data ?? []) as Booking[]
    setBookings(bookingData)
    setReviews((reviewsResult.data ?? []) as Review[])
    setAddresses((addressesResult.data ?? []) as Address[])

    const uniqueServiceIds = [
      ...new Set(bookingData.map(b => b.service_id).filter(Boolean)),
    ]

    if (uniqueServiceIds.length) {
      const servicesResult = await supabase
        .from('services')
        .select('id, name')
        .in('id', uniqueServiceIds)

      if (!servicesResult.error) {
        setServiceNames(
          Object.fromEntries(
            (servicesResult.data ?? []).map(s => [s.id, s.name])
          )
        )
      }
    }

    setLoading(false)
  }

  async function toggleActive() {
    if (!customerId || !customer) return

    setSaving(true)
    setError('')
    setSuccess('')

    try {
      await adminAction('admin_set_customer_active', {
        p_customer_id: customerId,
        p_is_active: !customer.is_active,
      })

      setSuccess(
        customer.is_active
          ? 'Customer deactivated successfully.'
          : 'Customer activated successfully.'
      )

      await loadCustomer()
    } catch (err) {
      console.error(err)
      setError(
        err instanceof Error ? err.message : 'Unable to update customer status.'
      )
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    loadCustomer()
  }, [customerId])

  const totalSpend = useMemo(
    () => bookings.reduce((sum, b) => sum + Number(b.total_amount ?? 0), 0),
    [bookings]
  )

  if (loading) {
    return (
      <div className="page-content">
        <div className="bookings-empty">
          <strong>Loading customer...</strong>
          <span>Please wait.</span>
        </div>
      </div>
    )
  }

  if (!customer) {
    return (
      <div className="page-content">
        <div className="error-banner" style={{ marginBottom: 20 }}>
          {error || 'Customer not found.'}
        </div>
        <Link to="/customers" style={styles.back}>
          ← Back to Customers
        </Link>
      </div>
    )
  }

  return (
    <div className="page-content">
      <Link to="/customers" style={styles.back}>
        ← Back to Customers
      </Link>

      {/* Page header */}
      <div className="page-heading" style={{ marginTop: 20, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {customer.avatar_url ? (
            <img
              src={customer.avatar_url}
              alt=""
              style={styles.avatar}
            />
          ) : (
            <div style={styles.avatarFallback}>
              {(customer.full_name?.trim().charAt(0).toUpperCase()) || 'C'}
            </div>
          )}

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 style={{ margin: 0, fontSize: 28 }}>
                {customer.full_name || 'Unnamed Customer'}
              </h1>
              <span
                className={
                  customer.is_active
                    ? 'booking-status booking-status-paid'
                    : 'booking-status booking-status-cancelled'
                }
              >
                {customer.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
            <p style={styles.subtitle}>
              {customer.email || 'No email'} ·{' '}
              {customer.phone || 'No phone'} · ID: {customer.id.slice(0, 8)}…
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            className="dashboard-refresh"
            onClick={loadCustomer}
            disabled={loading || saving}
          >
            Refresh
          </button>

          <button
            style={customer.is_active ? styles.deactivateButton : styles.activateButton}
            disabled={saving}
            onClick={toggleActive}
          >
            {saving
              ? 'Saving...'
              : customer.is_active
              ? 'Deactivate Customer'
              : 'Activate Customer'}
          </button>
        </div>
      </div>

      {/* Error / success banners */}
      {error && (
        <div className="error-banner" style={{ marginBottom: 20 }}>
          {error}
        </div>
      )}

      {success && (
        <div style={styles.successBanner}>
          {success}
        </div>
      )}

      {/* Stat cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: 12,
          marginBottom: 24,
        }}
      >
        <div className="panel">
          <strong>Total Bookings</strong>
          <div style={styles.statValue}>{bookings.length}</div>
        </div>

        <div className="panel">
          <strong>Total Spend (₹)</strong>
          <div style={styles.statValue}>{formatAmount(totalSpend)}</div>
        </div>

        <div className="panel">
          <strong>Reviews Left</strong>
          <div style={styles.statValue}>{reviews.length}</div>
        </div>

        <div className="panel">
          <strong>Member Since</strong>
          <div style={styles.statValue}>{formatDateShort(customer.created_at)}</div>
        </div>
      </div>

      {/* Tab bar */}
      <div style={styles.tabBar}>
        {(['bookings', 'reviews', 'addresses'] as Tab[]).map(tab => (
          <button
            key={tab}
            style={activeTab === tab ? styles.tabActive : styles.tab}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
            {tab === 'bookings' && ` (${bookings.length})`}
            {tab === 'reviews' && ` (${reviews.length})`}
            {tab === 'addresses' && ` (${addresses.length})`}
          </button>
        ))}
      </div>

      {/* Bookings tab */}
      {activeTab === 'bookings' && (
        <div className="panel">
          <div className="panel-header">
            <h2>Booking History</h2>
          </div>

          {bookings.length === 0 ? (
            <div className="bookings-empty">
              <strong>No bookings found</strong>
              <span>This customer has not made any bookings yet.</span>
            </div>
          ) : (
            <div className="bookings-table-wrap">
              <table style={styles.table}>
                <thead>
                  <tr style={styles.tableHead}>
                    <th style={styles.th}>Booking ID</th>
                    <th style={styles.th}>Service</th>
                    <th style={styles.th}>Status</th>
                    <th style={styles.th}>Scheduled</th>
                    <th style={styles.th}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map(booking => (
                    <tr key={booking.id} style={styles.tableRow}>
                      <td style={styles.td}>
                        <code className="booking-id">
                          {booking.id.slice(0, 8)}
                        </code>
                      </td>
                      <td style={styles.td}>
                        {serviceNames[booking.service_id] || booking.service_id || '—'}
                      </td>
                      <td style={styles.td}>
                        <span
                          className={`booking-status ${bookingStatusClass(booking.status)}`}
                        >
                          {formatStatus(booking.status)}
                        </span>
                      </td>
                      <td style={styles.td}>
                        {booking.scheduled_start
                          ? formatDateLong(booking.scheduled_start)
                          : '—'}
                      </td>
                      <td style={styles.td}>
                        {booking.total_amount == null
                          ? '—'
                          : formatAmount(Number(booking.total_amount))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Reviews tab */}
      {activeTab === 'reviews' && (
        <div className="panel">
          <div className="panel-header">
            <h2>Reviews</h2>
          </div>

          {reviews.length === 0 ? (
            <div className="bookings-empty">
              <strong>No reviews found</strong>
              <span>This customer has not left any reviews yet.</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {reviews.map(review => (
                <div key={review.id} style={styles.reviewCard}>
                  <div style={styles.reviewHeader}>
                    <div>
                      <div style={styles.stars}>
                        {Array.from({ length: 5 }).map((_, i) => (
                          <span
                            key={i}
                            style={{
                              color: i < review.rating ? '#f59e0b' : '#d1d5db',
                              fontSize: 18,
                            }}
                          >
                            ★
                          </span>
                        ))}
                        <span style={styles.ratingLabel}>
                          {review.rating}/5
                        </span>
                      </div>

                      <p style={styles.reviewComment}>
                        {review.comment || <em>No comment provided.</em>}
                      </p>
                    </div>

                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <span
                        style={{
                          ...styles.moderationBadge,
                          ...moderationBadgeStyle(review.moderation_status),
                        }}
                      >
                        {formatStatus(review.moderation_status)}
                      </span>
                      <p style={styles.reviewDate}>
                        {formatDateLong(review.created_at)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Addresses tab */}
      {activeTab === 'addresses' && (
        <div className="panel">
          <div className="panel-header">
            <h2>Saved Addresses</h2>
          </div>

          {addresses.length === 0 ? (
            <div className="bookings-empty">
              <strong>No addresses found</strong>
              <span>This customer has not saved any addresses yet.</span>
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: 14,
              }}
            >
              {addresses.map(address => (
                <div key={address.id} style={styles.addressCard}>
                  <div style={styles.addressHeader}>
                    <strong style={{ fontSize: 15 }}>
                      {address.label || 'Address'}
                    </strong>

                    {address.is_default && (
                      <span style={styles.defaultBadge}>Default</span>
                    )}
                  </div>

                  <p style={styles.addressLine}>
                    {address.address_line_1 || '—'}
                  </p>

                  <p style={styles.addressLine}>
                    {[address.city, address.state, address.pincode]
                      .filter(Boolean)
                      .join(', ') || '—'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function formatStatus(value: string) {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

function formatDateShort(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatDateLong(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatAmount(value: number) {
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

function bookingStatusClass(status: string) {
  if (status === 'completed' || status === 'paid') return 'booking-status-paid'
  if (status === 'cancelled' || status === 'refunded') return 'booking-status-cancelled'
  return ''
}

function moderationBadgeStyle(status: string): React.CSSProperties {
  if (status === 'approved') return { background: '#dcfce7', color: '#166534' }
  if (status === 'rejected') return { background: '#fee2e2', color: '#991b1b' }
  return { background: '#e2e8f0', color: '#334155' }
}

const styles: Record<string, React.CSSProperties> = {
  back: {
    color: '#0f766e',
    fontWeight: 700,
    textDecoration: 'none',
    display: 'inline-block',
  },

  subtitle: {
    margin: '4px 0 0',
    color: '#64748b',
    fontSize: 13,
  },

  avatar: {
    width: 56,
    height: 56,
    borderRadius: '50%',
    objectFit: 'cover',
    flexShrink: 0,
  },

  avatarFallback: {
    width: 56,
    height: 56,
    borderRadius: '50%',
    background: '#eef0f3',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: 22,
    flexShrink: 0,
  },

  statValue: {
    fontSize: 26,
    fontWeight: 800,
    marginTop: 6,
  },

  activateButton: {
    padding: '10px 16px',
    border: '1px solid #15803d',
    borderRadius: 7,
    background: '#15803d',
    color: '#fff',
    fontWeight: 700,
    cursor: 'pointer',
  },

  deactivateButton: {
    padding: '10px 16px',
    border: '1px solid #fecaca',
    borderRadius: 7,
    background: '#fff1f2',
    color: '#be123c',
    fontWeight: 700,
    cursor: 'pointer',
  },

  successBanner: {
    padding: 14,
    marginBottom: 20,
    background: '#dcfce7',
    color: '#166534',
    borderRadius: 8,
    fontWeight: 500,
  },

  tabBar: {
    display: 'flex',
    gap: 4,
    marginBottom: 16,
    borderBottom: '2px solid #e5e7eb',
    paddingBottom: 0,
  },

  tab: {
    padding: '10px 18px',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 14,
    color: '#64748b',
    borderBottom: '2px solid transparent',
    marginBottom: -2,
  },

  tabActive: {
    padding: '10px 18px',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: 14,
    color: '#0f766e',
    borderBottom: '2px solid #0f766e',
    marginBottom: -2,
  },

  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },

  tableHead: {
    background: '#f8fafc',
  },

  th: {
    padding: '10px 12px',
    textAlign: 'left',
    fontWeight: 700,
    fontSize: 12,
    color: '#64748b',
    borderBottom: '1px solid #e5e7eb',
    whiteSpace: 'nowrap',
  },

  tableRow: {
    borderBottom: '1px solid #f1f5f9',
  },

  td: {
    padding: '12px 12px',
    fontSize: 14,
    verticalAlign: 'middle',
  },

  reviewCard: {
    border: '1px solid #e5e7eb',
    borderRadius: 10,
    padding: 18,
    background: '#f8fafc',
  },

  reviewHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 16,
    alignItems: 'flex-start',
  },

  stars: {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    marginBottom: 8,
  },

  ratingLabel: {
    marginLeft: 6,
    fontWeight: 700,
    fontSize: 13,
    color: '#374151',
  },

  reviewComment: {
    margin: 0,
    fontSize: 14,
    color: '#1e293b',
    lineHeight: 1.6,
  },

  reviewDate: {
    margin: '6px 0 0',
    fontSize: 12,
    color: '#64748b',
  },

  moderationBadge: {
    display: 'inline-block',
    padding: '3px 9px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 700,
  },

  addressCard: {
    border: '1px solid #e5e7eb',
    borderRadius: 10,
    padding: 18,
    background: '#f8fafc',
  },

  addressHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },

  defaultBadge: {
    display: 'inline-block',
    padding: '3px 9px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 700,
    background: '#dbeafe',
    color: '#1d4ed8',
  },

  addressLine: {
    margin: '4px 0 0',
    fontSize: 14,
    color: '#374151',
    lineHeight: 1.5,
  },
}
