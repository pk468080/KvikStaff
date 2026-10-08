
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { adminAction } from '../lib/adminAction'


type Notification = {
  id: string
  user_id: string
  booking_id: string | null
  title: string
  message: string
  notification_type: string
  is_read: boolean
  created_at: string
}

type Recipient = {
  id: string
  full_name: string | null
  email: string | null
  phone: string | null
  role: string
}

type ReadFilter =
  | 'all'
  | 'unread'
  | 'read'

const PAGE_SIZE = 15

export default function Notifications() {
  const [notifications, setNotifications] =
    useState<Notification[]>([])

  const [recipients, setRecipients] =
    useState<Recipient[]>([])

  const [loading, setLoading] =
    useState(true)

  const [loadingRecipients, setLoadingRecipients] =
    useState(false)

  const [sending, setSending] =
    useState(false)

  const [error, setError] =
    useState('')

  const [success, setSuccess] =
    useState('')

  const [search, setSearch] =
    useState('')

  const [typeFilter, setTypeFilter] =
    useState('all')

  const [readFilter, setReadFilter] =
    useState<ReadFilter>('all')

  const [page, setPage] =
    useState(1)

  const [showComposer, setShowComposer] =
    useState(false)

  const [form, setForm] = useState({
    userId: '',
    title: '',
    message: '',
    notificationType: 'admin',
    bookingId: '',
  })

  async function loadNotifications() {
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const {
        data,
        error: notificationsError,
      } = await supabase
        .from('notifications')
        .select(`
          id,
          user_id,
          booking_id,
          title,
          message,
          notification_type,
          is_read,
          created_at
        `)
        .order('created_at', {
          ascending: false,
        })

      if (notificationsError) {
        throw notificationsError
      }

      setNotifications(
        (data ?? []) as Notification[]
      )
    } catch (err) {
      console.error(
        'Failed to load notifications:',
        err
      )

      setError(
        err instanceof Error
          ? err.message
          : 'Failed to load notifications.'
      )

      setNotifications([])
    } finally {
      setLoading(false)
    }
  }

  async function loadRecipients() {
    setLoadingRecipients(true)

    const {
      data,
      error: recipientsError,
    } = await supabase
      .from('profiles')
      .select(`
        id,
        full_name,
        email,
        phone,
        role
      `)
      .in('role', [
        'customer',
        'worker',
      ])
      .eq('is_active', true)
      .order('full_name', {
        ascending: true,
      })

    setLoadingRecipients(false)

    if (recipientsError) {
      console.error(
        'Failed to load recipients:',
        recipientsError
      )

      setError(
        recipientsError.message
      )

      return
    }

    setRecipients(
      (data ?? []) as Recipient[]
    )
  }

  useEffect(() => {
    void loadNotifications()
    void loadRecipients()
  }, [])

  useEffect(() => {
    setPage(1)
  }, [
    search,
    typeFilter,
    readFilter,
  ])

  const notificationTypes =
    useMemo(() => {
      return Array.from(
        new Set(
          notifications
            .map(
              notification =>
                notification.notification_type
            )
            .filter(Boolean)
        )
      ).sort()
    }, [notifications])

  const statistics = useMemo(() => {
    const total =
      notifications.length

    const unread =
      notifications.filter(
        notification =>
          !notification.is_read
      ).length

    const read =
      notifications.filter(
        notification =>
          notification.is_read
      ).length

    return {
      total,
      unread,
      read,
    }
  }, [notifications])

  const filteredNotifications =
    useMemo(() => {
      const normalizedSearch =
        search.trim().toLowerCase()

      return notifications.filter(
        notification => {
          if (
            typeFilter !== 'all' &&
            notification.notification_type !==
              typeFilter
          ) {
            return false
          }

          if (
            readFilter === 'unread' &&
            notification.is_read
          ) {
            return false
          }

          if (
            readFilter === 'read' &&
            !notification.is_read
          ) {
            return false
          }

          if (!normalizedSearch) {
            return true
          }

          return [
            notification.id,
            notification.user_id,
            notification.booking_id,
            notification.title,
            notification.message,
            notification.notification_type,
          ].some(value =>
            value
              ?.toString()
              .toLowerCase()
              .includes(
                normalizedSearch
              )
          )
        }
      )
    }, [
      notifications,
      search,
      typeFilter,
      readFilter,
    ])

  const totalPages = Math.max(
    1,
    Math.ceil(
      filteredNotifications.length /
        PAGE_SIZE
    )
  )

  const currentPage = Math.min(
    page,
    totalPages
  )

  const paginatedNotifications =
    filteredNotifications.slice(
      (currentPage - 1) *
        PAGE_SIZE,
      currentPage *
        PAGE_SIZE
    )

  function resetForm() {
    setForm({
      userId: '',
      title: '',
      message: '',
      notificationType:
        'admin',
      bookingId: '',
    })
  }

  function openComposer() {
    setError('')
    setSuccess('')
    resetForm()
    setShowComposer(true)
  }

  async function sendNotification() {
    const title =
      form.title.trim()

    const message =
      form.message.trim()

    if (!form.userId) {
      setError(
        'Select a recipient.'
      )
      return
    }

    if (!title) {
      setError(
        'Notification title is required.'
      )
      return
    }

    if (!message) {
      setError(
        'Notification message is required.'
      )
      return
    }

    const recipient =
      recipients.find(
        item =>
          item.id ===
          form.userId
      )

    const confirmed =
      window.confirm(
        `Send this notification to ${
          recipient?.full_name ||
          recipient?.email ||
          'the selected user'
        }?`
      )

    if (!confirmed) {
      return
    }

    setSending(true)
    setError('')
    setSuccess('')

    const {
      data,
      error: rpcError,
    } = await adminAction(
      'admin_create_notification',
      {
        p_user_id:
          form.userId,
        p_title:
          title,
        p_message:
          message,
        p_notification_type:
          form.notificationType.trim() ||
          'admin',
        p_booking_id:
          form.bookingId.trim() ||
          null,
      }
    )

    setSending(false)

    if (rpcError) {
      console.error(
        'Failed to create notification:',
        rpcError
      )

      setError(
        rpcError.message ||
          'Failed to create notification.'
      )

      return
    }

    if (!data) {
      setError(
        'The notification could not be created.'
      )

      return
    }

    setSuccess(
      'Notification created successfully.'
    )

    setShowComposer(false)
    resetForm()

    await loadNotifications()
  }

  function formatDate(value: string) {
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
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }
    )
  }

  function getRecipient(
    userId: string
  ) {
    return recipients.find(
      recipient =>
        recipient.id ===
        userId
    )
  }

  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <h1>
            Notifications
          </h1>

          <p>
            Manage platform
            notifications and
            administrator messages.
          </p>
        </div>

        <div
          style={
            styles.headerActions
          }
        >
          <button
            className="dashboard-refresh"
            onClick={() =>
              void loadNotifications()
            }
            disabled={loading}
          >
            {loading
              ? 'Loading...'
              : 'Refresh'}
          </button>

          <button
            style={
              styles.primaryButton
            }
            onClick={
              openComposer
            }
          >
            + Send Notification
          </button>
        </div>
      </div>

      {error && (
        <div
          className="error-banner"
          style={styles.message}
        >
          {error}
        </div>
      )}

      {success && (
        <div
          style={
            styles.success
          }
        >
          {success}
        </div>
      )}

      <div
        style={
          styles.summaryGrid
        }
      >
        <div className="panel">
          <span
            style={
              styles.metricLabel
            }
          >
            Total notifications
          </span>

          <strong
            style={
              styles.metricValue
            }
          >
            {statistics.total}
          </strong>
        </div>

        <div className="panel">
          <span
            style={
              styles.metricLabel
            }
          >
            Unread
          </span>

          <strong
            style={
              styles.metricValue
            }
          >
            {statistics.unread}
          </strong>
        </div>

        <div className="panel">
          <span
            style={
              styles.metricLabel
            }
          >
            Read
          </span>

          <strong
            style={
              styles.metricValue
            }
          >
            {statistics.read}
          </strong>
        </div>
      </div>

      <div
        className="panel"
        style={
          styles.filtersPanel
        }
      >
        <div
          style={
            styles.filters
          }
        >
          <label
            style={
              styles.filterField
            }
          >
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
              placeholder="Title, message, user or booking ID"
              style={
                styles.input
              }
            />
          </label>

          <label
            style={
              styles.filterField
            }
          >
            <strong>
              Type
            </strong>

            <select
              value={typeFilter}
              onChange={event =>
                setTypeFilter(
                  event.target.value
                )
              }
              style={
                styles.input
              }
            >
              <option value="all">
                All types
              </option>

              {notificationTypes.map(
                type => (
                  <option
                    key={type}
                    value={type}
                  >
                    {type}
                  </option>
                )
              )}
            </select>
          </label>

          <label
            style={
              styles.filterField
            }
          >
            <strong>
              Read status
            </strong>

            <select
              value={readFilter}
              onChange={event =>
                setReadFilter(
                  event.target
                    .value as ReadFilter
                )
              }
              style={
                styles.input
              }
            >
              <option value="all">
                All
              </option>

              <option value="unread">
                Unread
              </option>

              <option value="read">
                Read
              </option>
            </select>
          </label>

          <button
            className="dashboard-refresh"
            onClick={() => {
              setSearch('')
              setTypeFilter(
                'all'
              )
              setReadFilter(
                'all'
              )
            }}
          >
            Reset
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <h2>
              Notification history
            </h2>

            <p>
              {
                filteredNotifications.length
              }{' '}
              of{' '}
              {
                notifications.length
              }{' '}
              notifications
            </p>
          </div>
        </div>

        {loading ? (
          <div className="bookings-empty">
            <strong>
              Loading notifications...
            </strong>

            <span>
              Please wait.
            </span>
          </div>
        ) : paginatedNotifications.length ===
          0 ? (
          <div className="bookings-empty">
            <strong>
              No notifications found
            </strong>

            <span>
              Try changing the
              search or filters.
            </span>
          </div>
        ) : (
          <div
            style={
              styles.notificationList
            }
          >
            {paginatedNotifications.map(
              notification => {
                const recipient =
                  getRecipient(
                    notification.user_id
                  )

                return (
                  <div
                    key={
                      notification.id
                    }
                    style={
                      styles.notificationItem
                    }
                  >
                    <div
                      style={
                        styles.notificationIcon
                      }
                    >
                      {notification.title
                        .slice(0, 1)
                        .toUpperCase()}
                    </div>

                    <div
                      style={
                        styles.notificationContent
                      }
                    >
                      <div
                        style={
                          styles.notificationTop
                        }
                      >
                        <strong>
                          {
                            notification.title
                          }
                        </strong>

                        <span
                          style={{
                            ...styles.typeBadge,
                          }}
                        >
                          {
                            notification.notification_type
                          }
                        </span>

                        <span
                          style={{
                            ...styles.readBadge,
                            ...(notification.is_read
                              ? styles.read
                              : styles.unread),
                          }}
                        >
                          {notification.is_read
                            ? 'Read'
                            : 'Unread'}
                        </span>
                      </div>

                      <p
                        style={
                          styles.notificationMessage
                        }
                      >
                        {
                          notification.message
                        }
                      </p>

                      <div
                        style={
                          styles.notificationMeta
                        }
                      >
                        <span>
                          User:{' '}
                          {recipient?.full_name ||
                            recipient?.email ||
                            notification.user_id.slice(
                              0,
                              8
                            )}
                        </span>

                        <span>
                          Role:{' '}
                          {recipient?.role ||
                            '—'}
                        </span>

                        <span>
                          Booking:{' '}
                          {notification.booking_id
                            ? notification.booking_id.slice(
                                0,
                                8
                              )
                            : '—'}
                        </span>

                        <span>
                          {
                            formatDate(
                              notification.created_at
                            )
                          }
                        </span>
                      </div>
                    </div>
                  </div>
                )
              }
            )}
          </div>
        )}

        {!loading &&
          filteredNotifications.length >
            PAGE_SIZE && (
            <div
              style={
                styles.pagination
              }
            >
              <button
                className="dashboard-refresh"
                disabled={
                  currentPage <= 1
                }
                onClick={() =>
                  setPage(
                    currentPage - 1
                  )
                }
              >
                Previous
              </button>

              <span>
                Page{' '}
                {currentPage} of{' '}
                {totalPages}
              </span>

              <button
                className="dashboard-refresh"
                disabled={
                  currentPage >=
                  totalPages
                }
                onClick={() =>
                  setPage(
                    currentPage + 1
                  )
                }
              >
                Next
              </button>
            </div>
          )}
      </div>

      {showComposer && (
        <div
          style={
            styles.modalOverlay
          }
          role="dialog"
          aria-modal="true"
        >
          <div
            style={
              styles.modal
            }
          >
            <div
              style={
                styles.modalHeader
              }
            >
              <div>
                <h2
                  style={{
                    margin: 0,
                  }}
                >
                  Send Notification
                </h2>

                <p
                  style={
                    styles.muted
                  }
                >
                  Create a notification
                  for an active
                  customer or worker.
                </p>
              </div>

              <button
                className="dashboard-refresh"
                onClick={() =>
                  setShowComposer(
                    false
                  )
                }
              >
                Close
              </button>
            </div>

            <div
              style={
                styles.form
              }
            >
              <label
                style={
                  styles.filterField
                }
              >
                <strong>
                  Recipient
                </strong>

                <select
                  value={
                    form.userId
                  }
                  onChange={event =>
                    setForm(
                      current => ({
                        ...current,
                        userId:
                          event.target
                            .value,
                      })
                    )
                  }
                  disabled={
                    loadingRecipients
                  }
                  style={
                    styles.input
                  }
                >
                  <option value="">
                    {loadingRecipients
                      ? 'Loading recipients...'
                      : 'Select customer or worker'}
                  </option>

                  {recipients.map(
                    recipient => (
                      <option
                        key={
                          recipient.id
                        }
                        value={
                          recipient.id
                        }
                      >
                        {recipient.full_name ||
                          recipient.email ||
                          recipient.phone ||
                          recipient.id.slice(
                            0,
                            8
                          )}{' '}
                        —{' '}
                        {recipient.role}
                      </option>
                    )
                  )}
                </select>
              </label>

              <label
                style={
                  styles.filterField
                }
              >
                <strong>
                  Notification type
                </strong>

                <input
                  value={
                    form.notificationType
                  }
                  onChange={event =>
                    setForm(
                      current => ({
                        ...current,
                        notificationType:
                          event.target
                            .value,
                      })
                    )
                  }
                  placeholder="admin"
                  style={
                    styles.input
                  }
                />
              </label>

              <label
                style={
                  styles.filterField
                }
              >
                <strong>
                  Booking ID
                  <span
                    style={
                      styles.optional
                    }
                  >
                    {' '}
                    optional
                  </span>
                </strong>

                <input
                  value={
                    form.bookingId
                  }
                  onChange={event =>
                    setForm(
                      current => ({
                        ...current,
                        bookingId:
                          event.target
                            .value,
                      })
                    )
                  }
                  placeholder="Optional booking UUID"
                  style={
                    styles.input
                  }
                />
              </label>

              <label
                style={
                  styles.filterField
                }
              >
                <strong>
                  Title
                </strong>

                <input
                  value={
                    form.title
                  }
                  onChange={event =>
                    setForm(
                      current => ({
                        ...current,
                        title:
                          event.target
                            .value,
                      })
                    )
                  }
                  placeholder="Notification title"
                  maxLength={200}
                  style={
                    styles.input
                  }
                />
              </label>

              <label
                style={
                  styles.filterField
                }
              >
                <strong>
                  Message
                </strong>

                <textarea
                  value={
                    form.message
                  }
                  onChange={event =>
                    setForm(
                      current => ({
                        ...current,
                        message:
                          event.target
                            .value,
                      })
                    )
                  }
                  placeholder="Write the notification message..."
                  rows={5}
                  style={
                    styles.textarea
                  }
                />
              </label>
            </div>

            <div
              style={
                styles.modalActions
              }
            >
              <button
                className="dashboard-refresh"
                disabled={
                  sending
                }
                onClick={() =>
                  setShowComposer(
                    false
                  )
                }
              >
                Cancel
              </button>

              <button
                style={
                  styles.primaryButton
                }
                disabled={
                  sending ||
                  loadingRecipients
                }
                onClick={() =>
                  void sendNotification()
                }
              >
                {sending
                  ? 'Sending...'
                  : 'Send Notification'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const styles: Record<
  string,
  React.CSSProperties
> = {
  headerActions: {
    display: 'flex',
    gap: 10,
    flexWrap: 'wrap',
  },

  primaryButton: {
    padding: '10px 14px',
    border:
      '1px solid #0f172a',
    borderRadius: 7,
    background: '#0f172a',
    color: '#fff',
    fontWeight: 700,
    cursor: 'pointer',
  },

  summaryGrid: {
    display: 'grid',
    gridTemplateColumns:
      'repeat(3, minmax(0, 1fr))',
    gap: 12,
    marginBottom: 20,
  },

  metricLabel: {
    display: 'block',
    color: '#64748b',
    fontSize: 13,
  },

  metricValue: {
    display: 'block',
    marginTop: 7,
    fontSize: 28,
  },

  filtersPanel: {
    marginBottom: 20,
  },

  filters: {
    display: 'grid',
    gridTemplateColumns:
      'minmax(260px, 2fr) repeat(2, minmax(150px, 1fr)) auto',
    gap: 12,
    alignItems: 'end',
  },

  filterField: {
    display: 'grid',
    gap: 6,
  },

  input: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '10px 12px',
    border:
      '1px solid #cbd5e1',
    borderRadius: 7,
    background: '#fff',
    fontFamily: 'inherit',
    fontSize: 14,
  },

  textarea: {
    width: '100%',
    boxSizing: 'border-box',
    padding: 12,
    border:
      '1px solid #cbd5e1',
    borderRadius: 7,
    resize: 'vertical',
    fontFamily: 'inherit',
    fontSize: 14,
  },

  notificationList: {
    display: 'grid',
    gap: 10,
  },

  notificationItem: {
    display: 'flex',
    gap: 14,
    padding: 16,
    border:
      '1px solid #e2e8f0',
    borderRadius: 10,
    background: '#fff',
  },

  notificationIcon: {
    flex: '0 0 auto',
    width: 38,
    height: 38,
    borderRadius: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#e2e8f0',
    fontWeight: 800,
  },

  notificationContent: {
    minWidth: 0,
    flex: 1,
  },

  notificationTop: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },

  typeBadge: {
    padding: '4px 8px',
    borderRadius: 999,
    background: '#e0f2fe',
    color: '#075985',
    fontSize: 11,
    fontWeight: 700,
  },

  readBadge: {
    padding: '4px 8px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 700,
  },

  read: {
    background: '#dcfce7',
    color: '#166534',
  },

  unread: {
    background: '#fef3c7',
    color: '#92400e',
  },

  notificationMessage: {
    margin:
      '9px 0',
    lineHeight: 1.5,
    whiteSpace:
      'pre-wrap',
  },

  notificationMeta: {
    display: 'flex',
    gap: 14,
    flexWrap: 'wrap',
    color: '#64748b',
    fontSize: 12,
  },

  pagination: {
    display: 'flex',
    alignItems: 'center',
    justifyContent:
      'center',
    gap: 16,
    marginTop: 20,
  },

  message: {
    marginBottom: 20,
  },

  success: {
    padding: 14,
    marginBottom: 20,
    background: '#dcfce7',
    color: '#166534',
    borderRadius: 8,
  },

  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background:
      'rgba(15, 23, 42, 0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    zIndex: 1000,
  },

  modal: {
    width: '100%',
    maxWidth: 650,
    maxHeight: '90vh',
    overflowY: 'auto',
    background: '#fff',
    borderRadius: 12,
    padding: 24,
    boxShadow:
      '0 20px 60px rgba(0,0,0,0.2)',
  },

  modalHeader: {
    display: 'flex',
    justifyContent:
      'space-between',
    alignItems:
      'flex-start',
    gap: 20,
    marginBottom: 20,
  },

  form: {
    display: 'grid',
    gap: 16,
  },

  modalActions: {
    display: 'flex',
    justifyContent:
      'flex-end',
    gap: 10,
    marginTop: 22,
  },

  optional: {
    color: '#64748b',
    fontWeight: 400,
  },

  muted: {
    color: '#64748b',
    fontSize: 13,
  },
}