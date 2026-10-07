import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { adminAction } from '../lib/adminAction'
import { Link } from 'react-router-dom'

type Booking = {
  id: string
  customer_id: string
  worker_id: string | null
  service_id: string
  fulfillment_type: string | null
  status: string
  scheduled_start: string
  scheduled_end: string
  base_amount: number
  platform_fee: number
  tax_amount: number
  total_amount: number
}

type Profile = {
  id: string
  full_name: string | null
}

type Service = {
  id: string
  name: string
}

type EligibleWorker = {
  worker_id: string
  worker_status: string | null
  rating: number | null
  total_completed_jobs: number | null
  distance_km: number | null
}

type BookingFilter = 'all' | 'needs_assignment' | 'assigned' | 'cancelled'

export default function Bookings() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [services, setServices] = useState<Service[]>([])

  const [eligibleWorkers, setEligibleWorkers] =
    useState<Record<string, EligibleWorker[]>>({})

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [assigningBookingId, setAssigningBookingId] =
    useState<string | null>(null)

  const [loadingWorkersFor, setLoadingWorkersFor] =
    useState<string | null>(null)

  const [search, setSearch] = useState('')

  const [filter, setFilter] =
    useState<BookingFilter>('needs_assignment')

  const [statusFilter, setStatusFilter] =
    useState('all')

  const [serviceFilter, setServiceFilter] =
    useState('all')

  async function loadBookings() {
    setLoading(true)
    setError(null)

    const [
      bookingsResult,
      profilesResult,
      servicesResult,
    ] = await Promise.all([
      supabase
        .from('bookings')
        .select(`
          id,
          customer_id,
          worker_id,
          service_id,
          fulfillment_type,
          status,
          scheduled_start,
          scheduled_end,
          base_amount,
          platform_fee,
          tax_amount,
          total_amount
        `)
        .order('scheduled_start', {
          ascending: true,
        }),

      supabase
        .from('profiles')
        .select('id, full_name'),

      supabase
        .from('services')
        .select('id, name')
        .order('name', {
          ascending: true,
        }),
    ])

    if (bookingsResult.error) {
      console.error(
        'Failed to load bookings:',
        bookingsResult.error
      )

      setError(
        `Failed to load bookings: ${bookingsResult.error.message}`
      )

      setLoading(false)
      return
    }

    if (profilesResult.error) {
      console.error(
        'Failed to load profiles:',
        profilesResult.error
      )

      setError(
        `Failed to load customer/worker profiles: ${profilesResult.error.message}`
      )

      setLoading(false)
      return
    }

    if (servicesResult.error) {
      console.error(
        'Failed to load services:',
        servicesResult.error
      )

      setError(
        `Failed to load services: ${servicesResult.error.message}`
      )

      setLoading(false)
      return
    }

    setBookings(
      (bookingsResult.data || []) as Booking[]
    )

    setProfiles(
      (profilesResult.data || []) as Profile[]
    )

    setServices(
      (servicesResult.data || []) as Service[]
    )

    setEligibleWorkers({})
    setLoading(false)
  }

  useEffect(() => {
    loadBookings()
  }, [])

  const needsAssignment = useMemo(() => {
    return bookings.filter(
      (booking) =>
        !booking.worker_id &&
        (
          booking.status === 'paid' ||
          booking.status === 'searching_worker'
        )
    )
  }, [bookings])

  const assignedBookings = useMemo(() => {
    return bookings.filter(
      (booking) =>
        booking.worker_id &&
        booking.status !== 'cancelled'
    )
  }, [bookings])

  const cancelledBookings = useMemo(() => {
    return bookings.filter(
      (booking) =>
        booking.status === 'cancelled'
    )
  }, [bookings])

  const filteredBookings = useMemo(() => {
    const normalizedSearch =
      search.trim().toLowerCase()

    return bookings.filter((booking) => {
      if (
        filter === 'needs_assignment' &&
        !(
          !booking.worker_id &&
          (
            booking.status === 'paid' ||
            booking.status === 'searching_worker'
          )
        )
      ) {
        return false
      }

      if (
        filter === 'assigned' &&
        !(
          booking.worker_id &&
          booking.status !== 'cancelled'
        )
      ) {
        return false
      }

      if (
        filter === 'cancelled' &&
        booking.status !== 'cancelled'
      ) {
        return false
      }

      if (
        statusFilter !== 'all' &&
        booking.status !== statusFilter
      ) {
        return false
      }

      if (
        serviceFilter !== 'all' &&
        booking.service_id !== serviceFilter
      ) {
        return false
      }

      if (normalizedSearch) {
        const customerName =
          getProfileName(booking.customer_id)

        const workerName =
          getProfileName(booking.worker_id)

        const serviceName =
          getServiceName(booking.service_id)

        const haystack = [
          booking.id,
          customerName,
          workerName,
          serviceName,
          booking.status,
          booking.fulfillment_type || '',
        ]
          .join(' ')
          .toLowerCase()

        if (!haystack.includes(normalizedSearch)) {
          return false
        }
      }

      return true
    })
  }, [
    bookings,
    filter,
    search,
    statusFilter,
    serviceFilter,
    profiles,
    services,
    getProfileName,
    getServiceName,
  ])

  const availableStatuses = useMemo(() => {
    return Array.from(
      new Set(
        bookings.map(
          (booking) => booking.status
        )
      )
    ).sort()
  }, [bookings])

  async function loadEligibleWorkers(
    bookingId: string,
    force = false
  ) {
    if (
      !force &&
      eligibleWorkers[bookingId]
    ) {
      return
    }

    setLoadingWorkersFor(bookingId)
    setError(null)

    const {
  data,
  error: rpcError,
} = await adminAction(
  'get_eligible_workers',
  {
    p_booking_id: bookingId,
  }
)

    setLoadingWorkersFor(null)

    if (rpcError) {
      console.error(
        'Failed to load eligible workers:',
        rpcError
      )

      setError(
        `Failed to find eligible workers: ${rpcError.message}`
      )

      return
    }

    setEligibleWorkers(
      (current) => ({
        ...current,
        [bookingId]:
          (data || []) as EligibleWorker[],
      })
    )
  }

  async function cancelBooking(
    bookingId: string
  ) {
    const booking =
      bookings.find(
        (item) => item.id === bookingId
      )

    if (!booking) {
      setError('Booking not found.')
      return
    }

    if (booking.status === 'cancelled') {
      setError(
        'This booking is already cancelled.'
      )
      return
    }

    const reason = window.prompt(
      'Enter the cancellation reason (optional):'
    )

    if (reason === null) {
      return
    }

    const confirmed = window.confirm(
      'Cancel this booking as an administrator?'
    )

    if (!confirmed) {
      return
    }

    setError(null)

    const {
  error: rpcError,
} = await adminAction(
  'admin_cancel_booking',
  {
    p_booking_id: bookingId,
    p_reason: reason.trim() || null,
  }
)

    if (rpcError) {
      console.error(
        'Failed to cancel booking:',
        rpcError
      )

      setError(
        `Failed to cancel booking: ${rpcError.message}`
      )

      return
    }

    await loadBookings()
  }

  async function assignWorker(
    bookingId: string,
    workerId: string
  ) {
    if (!workerId) {
      return
    }

    const booking =
      bookings.find(
        (item) => item.id === bookingId
      )

    if (!booking) {
      setError('Booking not found.')
      return
    }

    const isReassignment =
      Boolean(booking.worker_id)

    const confirmed = window.confirm(
      isReassignment
        ? 'Reassign this booking to the selected worker? The current worker will be released.'
        : 'Assign this worker to the booking?'
    )

    if (!confirmed) {
      return
    }

    setAssigningBookingId(bookingId)
    setError(null)

   const {
  data,
  error: rpcError,
} = await adminAction(
  'admin_assign_booking_worker',
  {
    p_booking_id: bookingId,
    p_worker_id: workerId,
  }
)

    setAssigningBookingId(null)

    if (rpcError) {
      console.error(
        'Failed to assign worker:',
        rpcError
      )

      setError(
        `Failed to assign worker: ${rpcError.message}`
      )

      return
    }

    if (
      data &&
      typeof data === 'object' &&
      'success' in data &&
      data.success === false
    ) {
      const rpcResult =
        data as {
          success?: boolean
          error?: string
        }

      setError(
        rpcResult.error ||
        'Worker assignment failed.'
      )

      return
    }

    await loadBookings()
  }

  function getProfileName(
    id: string | null
  ) {
    if (!id) {
      return 'Unassigned'
    }

    return (
      profiles.find(
        (profile) =>
          profile.id === id
      )?.full_name ||
      'Unknown'
    )
  }

  function getServiceName(
    id: string
  ) {
    return (
      services.find(
        (service) =>
          service.id === id
      )?.name ||
      'Unknown service'
    )
  }

  function formatDate(
    value: string
  ) {
    if (!value) {
      return '—'
    }

    const date =
      new Date(value)

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return '—'
    }

    return date.toLocaleString(
      'en-IN',
      {
        dateStyle: 'medium',
        timeStyle: 'short',
      }
    )
  }

  function formatAmount(
    value: number
  ) {
    return `₹${Number(
      value || 0
    ).toLocaleString(
      'en-IN',
      {
        maximumFractionDigits: 2,
      }
    )}`
  }

  function formatWorkerLabel(
    worker: EligibleWorker
  ) {
    const name =
      getProfileName(
        worker.worker_id
      )

    const distance =
      worker.distance_km == null
        ? 'distance n/a'
        : `${Number(
            worker.distance_km
          ).toFixed(1)} km`

    const rating =
      worker.rating == null
        ? 'new'
        : `${Number(
            worker.rating
          ).toFixed(1)}★`

    const jobs =
      worker.total_completed_jobs == null
        ? '0 jobs'
        : `${worker.total_completed_jobs} jobs`

    return `${name} — ${distance} — ${rating} — ${jobs}`
  }

  function statusClass(
    status: string
  ) {
    return (
      'booking-status booking-status-' +
      status
        .toLowerCase()
        .replace(
          /[^a-z0-9]+/g,
          '-'
        )
    )
  }

  function resetFilters() {
    setSearch('')
    setFilter('needs_assignment')
    setStatusFilter('all')
    setServiceFilter('all')
  }

  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <h1>Bookings</h1>

          <p>
            Manage TempStaff bookings,
            assignments and cancellations.
          </p>
        </div>

        <button
          className="dashboard-refresh"
          onClick={loadBookings}
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
        <button
          type="button"
          className="panel"
          onClick={() =>
            setFilter('needs_assignment')
          }
          style={{
            textAlign: 'left',
            cursor: 'pointer',
          }}
        >
          <strong>
            Needs assignment
          </strong>

          <div
            style={{
              fontSize: 28,
              fontWeight: 800,
              marginTop: 6,
            }}
          >
            {needsAssignment.length}
          </div>
        </button>

        <button
          type="button"
          className="panel"
          onClick={() =>
            setFilter('assigned')
          }
          style={{
            textAlign: 'left',
            cursor: 'pointer',
          }}
        >
          <strong>
            Assigned
          </strong>

          <div
            style={{
              fontSize: 28,
              fontWeight: 800,
              marginTop: 6,
            }}
          >
            {assignedBookings.length}
          </div>
        </button>

        <button
          type="button"
          className="panel"
          onClick={() =>
            setFilter('cancelled')
          }
          style={{
            textAlign: 'left',
            cursor: 'pointer',
          }}
        >
          <strong>
            Cancelled
          </strong>

          <div
            style={{
              fontSize: 28,
              fontWeight: 800,
              marginTop: 6,
            }}
          >
            {cancelledBookings.length}
          </div>
        </button>

        <button
          type="button"
          className="panel"
          onClick={() =>
            setFilter('all')
          }
          style={{
            textAlign: 'left',
            cursor: 'pointer',
          }}
        >
          <strong>
            All bookings
          </strong>

          <div
            style={{
              fontSize: 28,
              fontWeight: 800,
              marginTop: 6,
            }}
          >
            {bookings.length}
          </div>
        </button>
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
              'minmax(240px, 2fr) repeat(3, minmax(150px, 1fr)) auto',
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
              onChange={(event) =>
                setSearch(
                  event.target.value
                )
              }
              placeholder="Booking, customer, worker or service"
              style={{
                width: '100%',
                marginTop: 6,
              }}
            />
          </label>

          <label>
            <strong>
              Queue
            </strong>

            <select
              value={filter}
              onChange={(event) =>
                setFilter(
                  event.target.value as BookingFilter
                )
              }
              style={{
                width: '100%',
                marginTop: 6,
              }}
            >
              <option value="needs_assignment">
                Needs assignment
              </option>

              <option value="assigned">
                Assigned
              </option>

              <option value="cancelled">
                Cancelled
              </option>

              <option value="all">
                All bookings
              </option>
            </select>
          </label>

          <label>
            <strong>
              Status
            </strong>

            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(
                  event.target.value
                )
              }
              style={{
                width: '100%',
                marginTop: 6,
              }}
            >
              <option value="all">
                All statuses
              </option>

              {availableStatuses.map(
                (status) => (
                  <option
                    key={status}
                    value={status}
                  >
                    {status}
                  </option>
                )
              )}
            </select>
          </label>

          <label>
            <strong>
              Service
            </strong>

            <select
              value={serviceFilter}
              onChange={(event) =>
                setServiceFilter(
                  event.target.value
                )
              }
              style={{
                width: '100%',
                marginTop: 6,
              }}
            >
              <option value="all">
                All services
              </option>

              {services.map(
                (service) => (
                  <option
                    key={service.id}
                    value={service.id}
                  >
                    {service.name}
                  </option>
                )
              )}
            </select>
          </label>

          <button
            className="dashboard-refresh"
            onClick={resetFilters}
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

      <div className="panel bookings-panel">
        <div className="panel-header">
          <div>
            <h2>
              {filter === 'needs_assignment'
                ? 'Assignment queue'
                : filter === 'assigned'
                  ? 'Assigned bookings'
                  : filter === 'cancelled'
                    ? 'Cancelled bookings'
                    : 'All bookings'}
            </h2>

            <p>
              {loading
                ? 'Loading bookings...'
                : `${filteredBookings.length} booking${
                    filteredBookings.length === 1
                      ? ''
                      : 's'
                  }`}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="bookings-empty">
            <strong>
              Loading bookings...
            </strong>

            <span>
              Please wait.
            </span>
          </div>
        ) : filteredBookings.length === 0 ? (
          <div className="bookings-empty">
            <strong>
              No matching bookings
            </strong>

            <span>
              Try changing the queue,
              status, service or search
              filters.
            </span>
          </div>
        ) : (
          <div className="bookings-table-wrap">
            <table className="bookings-table">
              <thead>
                <tr>
                  <th>
                    Booking
                  </th>

                  <th>
                    Customer
                  </th>

                  <th>
                    Service
                  </th>

                  <th>
                    Mode
                  </th>

                  <th>
                    Schedule
                  </th>

                  <th>
                    Status
                  </th>

                  <th>
                    Worker / Assignment
                  </th>

                  <th>
                    Amount
                  </th>

                  <th>
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody>
                {filteredBookings.map(
                  (booking) => {
                    const workers =
                      eligibleWorkers[
                        booking.id
                      ]

                    const isAssigning =
                      assigningBookingId ===
                      booking.id

                    const isLoadingWorkers =
                      loadingWorkersFor ===
                      booking.id

                    return (
                      <tr
                        key={booking.id}
                      >
                        <td>
                          <Link
  to={`/bookings/${booking.id}`}
  style={{
    color: '#0f766e',
    fontWeight: 800,
    textDecoration: 'none',
  }}
>
  #
  {booking.id.slice(0, 8)}
</Link>
                        </td>

                        <td>
                          <strong>
                            {getProfileName(
                              booking.customer_id
                            )}
                          </strong>
                        </td>

                        <td>
                          <strong>
                            {getServiceName(
                              booking.service_id
                            )}
                          </strong>
                        </td>

                        <td>
                          <span className="booking-status">
                            {booking.fulfillment_type ===
                            'instant'
                              ? 'Instant'
                              : 'Scheduled'}
                          </span>
                        </td>

                        <td>
                          {formatDate(
                            booking.scheduled_start
                          )}

                          <div
                            style={{
                              fontSize: 12,
                              marginTop: 4,
                              opacity: 0.65,
                            }}
                          >
                            Ends:{' '}
                            {formatDate(
                              booking.scheduled_end
                            )}
                          </div>
                        </td>

                        <td>
                          <span
                            className={statusClass(
                              booking.status
                            )}
                          >
                            {booking.status}
                          </span>
                        </td>

                        <td>
                          <div
                            style={{
                              minWidth: 260,
                            }}
                          >
                            {booking.worker_id ? (
                              <>
                                <strong>
                                  {getProfileName(
                                    booking.worker_id
                                  )}
                                </strong>

                                <div
                                  style={{
                                    fontSize: 12,
                                    marginTop: 4,
                                    opacity: 0.7,
                                  }}
                                >
                                  Current worker
                                </div>
                              </>
                            ) : (
                              <strong>
                                Unassigned
                              </strong>
                            )}

                            {booking.status !==
                              'cancelled' &&
                              (
                                !workers ? (
                                  <button
                                    className="dashboard-refresh"
                                    style={{
                                      marginTop: 10,
                                    }}
                                    onClick={() =>
                                      loadEligibleWorkers(
                                        booking.id
                                      )
                                    }
                                    disabled={
                                      isLoadingWorkers ||
                                      isAssigning
                                    }
                                  >
                                    {isLoadingWorkers
                                      ? 'Finding workers...'
                                      : booking.worker_id
                                        ? 'Find replacement worker'
                                        : 'Find eligible workers'}
                                  </button>
                                ) : workers.length ===
                                  0 ? (
                                  <div
                                    style={{
                                      marginTop: 10,
                                    }}
                                  >
                                    <strong>
                                      No eligible workers
                                    </strong>

                                    <div
                                      style={{
                                        fontSize: 12,
                                        marginTop: 4,
                                        opacity: 0.7,
                                      }}
                                    >
                                      Check worker
                                      availability,
                                      service,
                                      location or
                                      schedule.
                                    </div>

                                    <button
                                      className="dashboard-refresh"
                                      style={{
                                        marginTop: 8,
                                      }}
                                      onClick={() =>
                                        loadEligibleWorkers(
                                          booking.id,
                                          true
                                        )
                                      }
                                    >
                                      Try again
                                    </button>
                                  </div>
                                ) : (
                                  <div
                                    style={{
                                      marginTop: 10,
                                      display: 'flex',
                                      flexDirection: 'column',
                                      gap: 8,
                                    }}
                                  >
                                    <select
                                      defaultValue=""
                                      disabled={
                                        isAssigning
                                      }
                                      onChange={(
                                        event
                                      ) => {
                                        const selectedWorker =
                                          event.target.value

                                        if (
                                          selectedWorker
                                        ) {
                                          assignWorker(
                                            booking.id,
                                            selectedWorker
                                          )

                                          event.target.value =
                                            ''
                                        }
                                      }}
                                    >
                                      <option
                                        value=""
                                        disabled
                                      >
                                        {booking.worker_id
                                          ? 'Select replacement worker'
                                          : 'Select worker'}
                                      </option>

                                      {workers.map(
                                        (
                                          worker
                                        ) => (
                                          <option
                                            key={
                                              worker.worker_id
                                            }
                                            value={
                                              worker.worker_id
                                            }
                                          >
                                            {formatWorkerLabel(
                                              worker
                                            )}
                                          </option>
                                        )
                                      )}
                                    </select>

                                    {isAssigning && (
                                      <div
                                        style={{
                                          fontSize: 12,
                                        }}
                                      >
                                        {booking.worker_id
                                          ? 'Reassigning worker...'
                                          : 'Assigning worker...'}
                                      </div>
                                    )}
                                  </div>
                                )
                              )}
                          </div>
                        </td>

                        <td>
                          <strong>
                            {formatAmount(
                              booking.total_amount
                            )}
                          </strong>

                          <div
                            style={{
                              fontSize: 12,
                              marginTop: 4,
                              opacity: 0.65,
                            }}
                          >
                            Base:{' '}
                            {formatAmount(
                              booking.base_amount
                            )}
                          </div>
                        </td>

                        <td>
                          {booking.status !==
                            'cancelled' && (
                            <button
                              className="dashboard-refresh"
                              onClick={() =>
                                cancelBooking(
                                  booking.id
                                )
                              }
                              disabled={
                                isAssigning
                              }
                            >
                              Cancel
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  }
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}