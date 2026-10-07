import { useEffect, useMemo, useState } from 'react'
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
  booking_count: number
  total_spend: number
}

export default function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'all' | 'active' | 'inactive'>('all')

  async function loadCustomers() {
    setLoading(true)
    setError(null)

    try {
      const { data, error: profilesError } = await supabase
        .from('profiles')
        .select(`
          id,
          full_name,
          avatar_url,
          email,
          phone,
          is_active,
          created_at
        `)
        .eq('role', 'customer')
        .order('created_at', {
          ascending: false,
        })

      if (profilesError) {
        throw profilesError
      }

      const customerIds = (data || []).map(
        customer => customer.id
      )

      const bookingCounts = new Map<string, number>()
      const spending = new Map<string, number>()

      if (customerIds.length > 0) {
        const {
          data: bookings,
          error: bookingsError,
        } = await supabase
          .from('bookings')
          .select(
            'customer_id, total_amount'
          )
          .in(
            'customer_id',
            customerIds
          )

        if (bookingsError) {
          console.warn(
            'Could not load booking statistics:',
            bookingsError
          )
        } else {
          for (const booking of bookings || []) {
            if (!booking.customer_id) {
              continue
            }

            bookingCounts.set(
              booking.customer_id,
              (
                bookingCounts.get(
                  booking.customer_id
                ) || 0
              ) + 1
            )

            spending.set(
              booking.customer_id,
              (
                spending.get(
                  booking.customer_id
                ) || 0
              ) +
                Number(
                  booking.total_amount || 0
                )
            )
          }
        }
      }

      const result: Customer[] =
        (data || []).map(
          profile => ({
            id: profile.id,
            full_name: profile.full_name,
            avatar_url: profile.avatar_url,
            email: profile.email,
            phone: profile.phone,
            is_active: Boolean(
              profile.is_active
            ),
            created_at:
              profile.created_at,
            booking_count:
              bookingCounts.get(
                profile.id
              ) || 0,
            total_spend:
              spending.get(
                profile.id
              ) || 0,
          })
        )

      setCustomers(result)
    } catch (err) {
      console.error(
        'Failed to load customers:',
        err
      )

      setError(
        err instanceof Error
          ? err.message
          : 'Failed to load customers.'
      )

      setCustomers([])
    } finally {
      setLoading(false)
    }
  }

  async function setCustomerActive(
    customer: Customer
  ) {
    const nextState =
      !customer.is_active

    const action =
      nextState
        ? 'activate'
        : 'deactivate'

    const confirmed =
      window.confirm(
        nextState
          ? `Activate ${customer.full_name || 'this customer'}?`
          : `Deactivate ${customer.full_name || 'this customer'}?`
      )

    if (!confirmed) {
      return
    }

    setProcessingId(customer.id)
    setError(null)

    const {
  error: rpcError,
} = await adminAction(
  'admin_set_customer_active',
  {
    p_customer_id: customer.id,
    p_is_active: nextState,
  }
)

    setProcessingId(null)

    if (rpcError) {
      console.error(
        `Failed to ${action} customer:`,
        rpcError
      )

      setError(
        `Failed to ${action} customer: ${rpcError.message}`
      )

      return
    }

    await loadCustomers()
  }

  useEffect(() => {
    loadCustomers()
  }, [])

  const normalizedSearch =
    search.trim().toLowerCase()

  const filteredCustomers =
    useMemo(() => {
      return customers.filter(
        customer => {
          const matchesStatus =
            status === 'all' ||
            (
              status === 'active' &&
              customer.is_active
            ) ||
            (
              status === 'inactive' &&
              !customer.is_active
            )

          if (!matchesStatus) {
            return false
          }

          if (!normalizedSearch) {
            return true
          }

          return [
            customer.id,
            customer.full_name,
            customer.email,
            customer.phone,
          ].some(
            value =>
              value
                ?.toLowerCase()
                .includes(
                  normalizedSearch
                )
          )
        }
      )
    }, [
      customers,
      normalizedSearch,
      status,
    ])

  const activeCount =
    customers.filter(
      customer =>
        customer.is_active
    ).length

  const inactiveCount =
    customers.filter(
      customer =>
        !customer.is_active
    ).length

  const totalBookings =
    customers.reduce(
      (sum, customer) =>
        sum +
        customer.booking_count,
      0
    )

  const totalSpend =
    customers.reduce(
      (sum, customer) =>
        sum +
        customer.total_spend,
      0
    )

  function formatAmount(
    value: number
  ) {
    return `₹${value.toLocaleString(
      'en-IN',
      {
        maximumFractionDigits: 2,
      }
    )}`
  }

  function formatDate(
    value: string
  ) {
    const date =
      new Date(value)

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return '—'
    }

    return date.toLocaleDateString(
      'en-IN',
      {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }
    )
  }

  function getInitial(
    name: string | null
  ) {
    return (
      name
        ?.trim()
        .charAt(0)
        .toUpperCase() ||
      'C'
    )
  }

  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <h1>
            Customers
          </h1>

          <p>
            Manage TempStaff customers
            and account access.
          </p>
        </div>

        <button
          className="dashboard-refresh"
          onClick={
            loadCustomers
          }
          disabled={loading}
        >
          {loading
            ? 'Loading...'
            : 'Refresh'}
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(4, minmax(0, 1fr))',
          gap: 12,
          marginBottom: 20,
        }}
      >
        <div className="panel">
          <strong>
            Total customers
          </strong>

          <div
            style={{
              fontSize: 28,
              fontWeight: 800,
              marginTop: 6,
            }}
          >
            {customers.length}
          </div>
        </div>

        <div className="panel">
          <strong>
            Active
          </strong>

          <div
            style={{
              fontSize: 28,
              fontWeight: 800,
              marginTop: 6,
            }}
          >
            {activeCount}
          </div>
        </div>

        <div className="panel">
          <strong>
            Total bookings
          </strong>

          <div
            style={{
              fontSize: 28,
              fontWeight: 800,
              marginTop: 6,
            }}
          >
            {totalBookings}
          </div>
        </div>

        <div className="panel">
          <strong>
            Booking value
          </strong>

          <div
            style={{
              fontSize: 28,
              fontWeight: 800,
              marginTop: 6,
            }}
          >
            {formatAmount(
              totalSpend
            )}
          </div>
        </div>
      </div>

      <div
        className="panel"
        style={{
          marginBottom: 20,
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'minmax(260px, 1fr) 180px auto',
            gap: 12,
            alignItems: 'end',
          }}
        >
          <label>
            <strong>
              Search
            </strong>

            <input
              type="search"
              value={search}
              onChange={event =>
                setSearch(
                  event.target.value
                )
              }
              placeholder="Name, email, phone or customer ID"
              style={{
                width: '100%',
                marginTop: 6,
              }}
            />
          </label>

          <label>
            <strong>
              Status
            </strong>

            <select
              value={status}
              onChange={event =>
                setStatus(
                  event.target.value as
                    | 'all'
                    | 'active'
                    | 'inactive'
                )
              }
              style={{
                width: '100%',
                marginTop: 6,
              }}
            >
              <option value="all">
                All
              </option>

              <option value="active">
                Active
              </option>

              <option value="inactive">
                Inactive
              </option>
            </select>
          </label>

          <button
            className="dashboard-refresh"
            onClick={() => {
              setSearch('')
              setStatus('all')
            }}
          >
            Reset
          </button>
        </div>
      </div>

      {error && (
        <div
          className="error-banner"
          style={{
            marginBottom: 20,
          }}
        >
          {error}
        </div>
      )}

      <div className="panel">
        <div className="panel-header">
          <div>
            <h2>
              All customers
            </h2>

            <p>
              {filteredCustomers.length}{' '}
              of{' '}
              {customers.length}{' '}
              customers
            </p>
          </div>
        </div>

        {loading ? (
          <div className="bookings-empty">
            <strong>
              Loading customers...
            </strong>

            <span>
              Please wait.
            </span>
          </div>
        ) : filteredCustomers.length ===
          0 ? (
          <div className="bookings-empty">
            <strong>
              No customers found
            </strong>

            <span>
              Try changing the
              search or filters.
            </span>
          </div>
        ) : (
          <div className="bookings-table-wrap">
            <table className="bookings-table">
              <thead>
                <tr>
                  <th>
                    Customer
                  </th>

                  <th>
                    Contact
                  </th>

                  <th>
                    Customer ID
                  </th>

                  <th>
                    Status
                  </th>

                  <th>
                    Bookings
                  </th>

                  <th>
                    Spend
                  </th>

                  <th>
                    Joined
                  </th>

                  <th>
                    Action
                  </th>
                </tr>
              </thead>

              <tbody>
                {filteredCustomers.map(
                  customer => (
                    <tr
                      key={
                        customer.id
                      }
                    >
                      <td>
                        <div
                          style={{
                            display:
                              'flex',
                            alignItems:
                              'center',
                            gap: 10,
                          }}
                        >
                          {customer.avatar_url ? (
                            <img
                              src={
                                customer.avatar_url
                              }
                              alt=""
                              style={{
                                width: 40,
                                height: 40,
                                borderRadius:
                                  '50%',
                                objectFit:
                                  'cover',
                              }}
                            />
                          ) : (
                            <div
                              style={{
                                width: 40,
                                height: 40,
                                borderRadius:
                                  '50%',
                                background:
                                  '#eef0f3',
                                display:
                                  'flex',
                                alignItems:
                                  'center',
                                justifyContent:
                                  'center',
                                fontWeight:
                                  700,
                              }}
                            >
                              {getInitial(
                                customer.full_name
                              )}
                            </div>
                          )}

                          <strong>
                            {customer.full_name ||
                              'Unnamed Customer'}
                          </strong>
                        </div>
                      </td>

                      <td>
                        <div>
                          {customer.email ||
                            'No email'}
                        </div>

                        <div
                          style={{
                            fontSize: 12,
                            opacity:
                              0.65,
                            marginTop: 3,
                          }}
                        >
                          {customer.phone ||
                            'No phone'}
                        </div>
                      </td>

                      <td>
                        <span className="booking-id">
                          {customer.id.slice(
                            0,
                            8
                          )}
                        </span>
                      </td>

                      <td>
                        <span
                          className={
                            customer.is_active
                              ? 'booking-status booking-status-paid'
                              : 'booking-status booking-status-cancelled'
                          }
                        >
                          {customer.is_active
                            ? 'Active'
                            : 'Inactive'}
                        </span>
                      </td>

                      <td>
                        <strong>
                          {
                            customer.booking_count
                          }
                        </strong>
                      </td>

                      <td>
                        <strong>
                          {formatAmount(
                            customer.total_spend
                          )}
                        </strong>
                      </td>

                      <td>
                        {formatDate(
                          customer.created_at
                        )}
                      </td>

                      <td>
                        <button
                          className="dashboard-refresh"
                          disabled={
                            processingId ===
                            customer.id
                          }
                          onClick={() =>
                            setCustomerActive(
                              customer
                            )
                          }
                        >
                          {processingId ===
                          customer.id
                            ? 'Saving...'
                            : customer.is_active
                              ? 'Deactivate'
                              : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {inactiveCount > 0 && (
        <p
          style={{
            marginTop: 14,
            opacity: 0.65,
            fontSize: 13,
          }}
        >
          {inactiveCount} inactive customer
          {inactiveCount === 1
            ? ''
            : 's'}.
        </p>
      )}
    </div>
  )
}