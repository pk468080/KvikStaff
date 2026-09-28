import {
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import LiveWorkerMap from '../../components/booking/LiveWorkerMap'

import {
  ScreenContainer,
} from '../../components/layout/ScreenContainer'

import {
  getCustomerBooking,
  getCustomerBookingStatusHistory,
  getLatestWorkerLocation,
  getWorkerLocationAgeSeconds,
  getWorkerLocationFreshness,
  requestBookingOtp,
  type BookingStatus,
  type BookingStatusHistoryItem,
  type CustomerBooking,
  type WorkerLocation,
  type WorkerLocationFreshness,
} from '../../services/booking/bookingTracking.service'

import {
  cancelCustomerBooking,
} from '../../services/booking/bookingCancellation.service'

import {
  supabase,
} from '../../lib/supabase'
type BookingMapLocation = {
  latitude: number
  longitude: number
}
type ActiveBookingScreenProps = {
  bookingId: string

  onReschedule: (
    bookingId: string,
    currentStart: string,
    currentEnd: string,
  ) => void
}

const tempStaffLogo =
  require('../../assets/branding/tempstuff-logo.png')

const trackingHero =
  require('../../assets/home/hero-worker.png')

function formatStatus(
  status: BookingStatus,
) {
  return status
    .replace(/_/g, ' ')
    .replace(/\b\w/g, value =>
      value.toUpperCase(),
    )
}

function formatMoney(
  amount: number | null,
) {
  if (amount === null) {
    return '—'
  }

  return amount.toFixed(2)
}

function formatDateTime(
  value: string | null,
) {
  if (!value) {
    return 'Not set'
  }

  const date =
    new Date(value)

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return value
  }

  return date.toLocaleString()
}

function elapsedSince(
  startedAt: string,
  completedAt: string | null,
) {
  const end =
    completedAt
      ? Date.parse(
          completedAt,
        )
      : Date.now()

  const start =
    Date.parse(startedAt)

  if (
    !Number.isFinite(start)
  ) {
    return '00:00:00'
  }

  const seconds =
    Math.max(
      0,
      Math.floor(
        (end - start) /
          1000,
      ),
    )

  const hours =
    Math.floor(
      seconds / 3600,
    )

  const minutes =
    Math.floor(
      (seconds % 3600) /
        60,
    )

  const remainder =
    seconds % 60

  return [
    hours,
    minutes,
    remainder,
  ]
    .map(value =>
      String(
        value,
      ).padStart(2, '0'),
    )
    .join(':')
}

function isTerminalStatus(
  status: BookingStatus,
) {
  return (
    status ===
      'completed' ||
    status ===
      'cancelled' ||
    status ===
      'expired'
  )
}

function isTrackingStatus(
  status: BookingStatus,
) {
  return (
    status ===
      'on_the_way' ||
    status ===
      'arrived' ||
    status ===
      'in_progress'
  )
}

function getStateTitle(
  booking: CustomerBooking,
) {
  switch (booking.status) {
    case 'paid':
      return 'Payment confirmed'

    case 'searching_worker':
      return 'Finding your worker'

    case 'assigned':
      return 'Worker assigned'

    case 'on_the_way':
      return 'Worker is on the way'

    case 'arrived':
      return 'Worker has arrived'

    case 'in_progress':
      return 'Service in progress'

    case 'completed':
      return 'Booking completed'

    case 'cancelled':
      return 'Booking cancelled'

    case 'expired':
      return 'Booking expired'

    case 'payment_failed':
      return 'Payment failed'

    case 'pending_payment':
      return 'Payment pending'

    default:
      return formatStatus(
        booking.status,
      )
  }
}

function getStateMessage(
  booking: CustomerBooking,
) {
  switch (booking.status) {
    case 'paid':
      return 'Your payment was confirmed. We are completing worker assignment.'

    case 'searching_worker':
      return 'Your payment is confirmed. We are finding an eligible worker.'

    case 'assigned':
      return 'Your booking is confirmed. Your worker will start the journey when travelling to you.'

    case 'on_the_way':
      return 'Your assigned worker is travelling to the booking location.'

    case 'arrived':
      return 'Your worker has arrived. Provide the start OTP when requested.'

    case 'in_progress':
      return 'Your service is currently in progress.'

    case 'completed':
      return 'This booking has been completed.'

    case 'cancelled':
      return 'This booking has been cancelled.'

    case 'expired':
      return 'This booking has expired.'

    case 'payment_failed':
      return 'Payment was not completed for this booking.'

    case 'pending_payment':
      return 'Payment is required before this booking can be confirmed.'

    default:
      return 'Booking status updated.'
  }
}

function getTrackingLabel(
  freshness: WorkerLocationFreshness,
) {
  switch (freshness) {
    case 'fresh':
      return 'Live location available'

    case 'stale':
      return 'Location temporarily unavailable'

    case 'unavailable':
      return 'Waiting for worker location'
  }
}

export default function ActiveBookingScreen({
  bookingId,
  onReschedule,
}: ActiveBookingScreenProps) {
  const [
    booking,
    setBooking,
  ] =
    useState<CustomerBooking | null>(
      null,
    )

  const [
    location,
    setLocation,
  ] =
    useState<WorkerLocation | null>(
      null,
    )
const [
  customerLocation,
  setCustomerLocation,
] =
  useState<BookingMapLocation | null>(
    null,
  )
  const [
    statusHistory,
    setStatusHistory,
  ] =
    useState<BookingStatusHistoryItem[]>(
      [],
    )

  const [
    locationNow,
    setLocationNow,
  ] =
    useState(Date.now())

  const [
    loading,
    setLoading,
  ] = useState(true)

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null,
    )

  const [
    otp,
    setOtp,
  ] =
    useState<string | null>(
      null,
    )

  const [
    timer,
    setTimer,
  ] =
    useState(
      '00:00:00',
    )

  const locationFreshness =
    useMemo(
      () =>
        getWorkerLocationFreshness(
          location,
          locationNow,
        ),
      [
        location,
        locationNow,
      ],
    )

  const locationAgeSeconds =
    useMemo(
      () =>
        getWorkerLocationAgeSeconds(
          location,
          locationNow,
        ),
      [
        location,
        locationNow,
      ],
    )

  async function refresh() {
    try {
      const nextBooking =
        await getCustomerBooking(
          bookingId,
        )

      setBooking(
        nextBooking,
      )

      const nextHistory =
        await getCustomerBookingStatusHistory(
          bookingId,
        )

      setStatusHistory(
        nextHistory,
      )

if (nextBooking.worker_id) {
  const nextLocation =
    await getLatestWorkerLocation(bookingId)

  setLocation(nextLocation)
} else {
  setLocation(null)
}
      setLocationNow(
        Date.now(),
      )

      setError(null)
    } catch (
      nextError
    ) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Unable to load booking.',
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()

    const refreshInterval =
      setInterval(
        () => {
          void refresh()
        },
        15000,
      )

    const clockInterval =
      setInterval(
        () => {
          setLocationNow(
            Date.now(),
          )
        },
        1000,
      )

    const channelName =
      `customer-booking-${bookingId}-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`

    const channel =
      supabase
        .channel(
          channelName,
        )

        /*
         * Booking status realtime.
         */
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'bookings',
            filter:
              `id=eq.${bookingId}`,
          },
          () => {
            void refresh()
          },
        )

        /*
         * Status history realtime.
         */
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table:
              'booking_status_history',
            filter:
              `booking_id=eq.${bookingId}`,
          },
          payload => {
            const nextHistory =
              payload.new as BookingStatusHistoryItem

            setStatusHistory(
              current => {
                if (
                  current.some(
                    item =>
                      item.id ===
                      nextHistory.id,
                  )
                ) {
                  return current
                }

                return [
                  ...current,
                  nextHistory,
                ].sort(
                  (
                    left,
                    right,
                  ) =>
                    Date.parse(
                      left.created_at,
                    ) -
                    Date.parse(
                      right.created_at,
                    ),
                )
              },
            )
          },
        )

        /*
         * LIVE WORKER TRACKING.
         *
         * Every new booking-scoped
         * worker_locations row is pushed
         * to the customer immediately.
         */
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table:
              'worker_locations',
            filter:
              `booking_id=eq.${bookingId}`,
          },
          payload => {
            const nextLocation =
              payload.new as WorkerLocation

            setLocation(
              nextLocation,
            )

            setLocationNow(
              Date.now(),
            )
          },
        )
        .subscribe()

    return () => {
      clearInterval(
        refreshInterval,
      )

      clearInterval(
        clockInterval,
      )

      void supabase.removeChannel(
        channel,
      )
    }
  }, [bookingId])

  useEffect(() => {
    const currentBooking =
      booking

    const startedAt =
      currentBooking?.started_at

    if (!startedAt) {
      setTimer(
        '00:00:00',
      )

      return
    }

    const update = () => {
      setTimer(
        elapsedSince(
          startedAt,
          currentBooking.completed_at,
        ),
      )
    }

    update()

    const interval =
      setInterval(
        update,
        1000,
      )

    return () =>
      clearInterval(
        interval,
      )
  }, [
    booking?.started_at,
    booking?.completed_at,
  ])

  async function handleCancelBooking() {
    const currentBooking =
      booking

    if (!currentBooking) {
      return
    }

    if (
      currentBooking.status ===
        'completed' ||
      currentBooking.status ===
        'cancelled' ||
      currentBooking.status ===
        'expired'
    ) {
      return
    }

    Alert.alert(
      'Cancel booking?',
      currentBooking.worker_id
        ? 'This booking has an assigned worker and requires support/admin cancellation.'
        : 'The cancellation policy will be applied. If a refund is due, a refund request will be created for processing.',
      [
        {
          text: 'Keep booking',
          style: 'cancel',
        },
        {
          text: 'Cancel booking',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                setError(null)

                await cancelCustomerBooking(
                  currentBooking.id,
                  currentBooking.booking_type,
                )

                setOtp(null)

                await refresh()
              } catch (
                nextError
              ) {
                setError(
                  nextError instanceof Error
                    ? nextError.message
                    : 'Unable to cancel the booking.',
                )
              }
            })()
          },
        },
      ],
    )
  }

  async function showOtp(
    type: 'start' | 'end',
  ) {
    if (!booking) {
      return
    }

    if (
      type === 'start' &&
      booking.status !==
        'arrived'
    ) {
      setError(
        'The start OTP is available after the worker arrives.',
      )

      return
    }

    if (
      type === 'end' &&
      booking.status !==
        'in_progress'
    ) {
      setError(
        'The end OTP is available while the service is in progress.',
      )

      return
    }

    try {
      const result =
        await requestBookingOtp(
          bookingId,
          type,
        )

      setOtp(
        result.otp ??
          'OTP sent to your registered contact.',
      )

      setError(null)
    } catch (
      nextError
    ) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Unable to generate the booking OTP.',
      )
    }
  }

  if (loading) {
    return (
      <ScreenContainer>
        <View
          style={
            styles.loading
          }
        >
          <ActivityIndicator />

          <Image
            source={
              tempStaffLogo
            }
            style={
              styles.loadingLogo
            }
            resizeMode="contain"
          />

          <Text
            style={
              styles.loadingText
            }
          >
            Loading your booking...
          </Text>
        </View>
      </ScreenContainer>
    )
  }

  if (!booking) {
    return (
      <ScreenContainer>
        <View
          style={
            styles.container
          }
        >
          <View
            style={
              styles.brandRow
            }
          >
            <Image
              source={
                tempStaffLogo
              }
              style={
                styles.logo
              }
              resizeMode="contain"
            />

            <Text
              style={
                styles.brandLabel
              }
            >
              BOOKING
            </Text>
          </View>

          <Text
            style={
              styles.title
            }
          >
            Booking unavailable
          </Text>

          <Text
            style={
              styles.error
            }
          >
            {error ??
              'Booking could not be loaded.'}
          </Text>
        </View>
      </ScreenContainer>
    )
  }

  const workerAssigned =
    booking.worker_id !==
    null

  const canReschedule =
    booking.booking_type ===
      'scheduled' &&
    booking.worker_id ===
      null &&
    booking.status !==
      'completed' &&
    booking.status !==
      'cancelled' &&
    booking.status !==
      'expired' &&
    booking.status !==
      'on_the_way' &&
    booking.status !==
      'arrived' &&
    booking.status !==
      'in_progress' &&
    booking.status !==
      'pending_payment' &&
    booking.status !==
      'payment_failed'

  const terminal =
    isTerminalStatus(
      booking.status,
    )

  const tracking =
    isTrackingStatus(
      booking.status,
    )

  const showLiveMap =
    tracking &&
    locationFreshness ===
      'fresh' &&
    location !==
      null

  return (
    <ScreenContainer>
      <ScrollView
        contentContainerStyle={
          styles.container
        }
        showsVerticalScrollIndicator={
          false
        }
      >
        <View
          style={
            styles.brandRow
          }
        >
          <Image
            source={
              tempStaffLogo
            }
            style={
              styles.logo
            }
            resizeMode="contain"
          />

          <Text
            style={
              styles.brandLabel
            }
          >
            {tracking
              ? 'LIVE TRACKING'
              : 'BOOKING'}
          </Text>
        </View>

        <View
          style={
            styles.headingRow
          }
        >
          <View
            style={
              styles.stepBadge
            }
          >
            <Text
              style={
                styles.stepBadgeText
              }
            >
              {tracking
                ? '12'
                : '11'}
            </Text>
          </View>

          <View
            style={{
              flex: 1,
            }}
          >
            <Text
              style={
                styles.title
              }
            >
              {tracking
                ? 'Your worker is on the move'
                : 'Booking confirmed'}
            </Text>

            <Text
              style={
                styles.subtitle
              }
            >
              {tracking
                ? 'Follow the latest verified worker location below.'
                : 'Your TempStaff booking status and details are shown here.'}
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.stateCard,

            booking.status ===
              'searching_worker' &&
              styles.searchingCard,

            booking.status ===
              'on_the_way' &&
              styles.trackingCard,

            booking.status ===
              'in_progress' &&
              styles.progressCard,
          ]}
        >
          <View
            style={
              styles.stateTopRow
            }
          >
            <View
              style={
                styles.stateIcon
              }
            >
              <Text
                style={
                  styles.stateIconText
                }
              >
                {tracking
                  ? 'LIVE'
                  : 'OK'}
              </Text>
            </View>

            <Image
              source={
                trackingHero
              }
              style={
                styles.stateHero
              }
              resizeMode="cover"
            />
          </View>

          <Text
            style={
              styles.stateTitle
            }
          >
            {getStateTitle(
              booking,
            )}
          </Text>

          <Text
            style={
              styles.stateMessage
            }
          >
            {getStateMessage(
              booking,
            )}
          </Text>
        </View>

        {error ? (
          <Text
            style={
              styles.error
            }
          >
            {error}
          </Text>
        ) : null}

        {tracking &&
        workerAssigned ? (
          <View
            style={
              styles.mapCard
            }
          >
            <View
              style={
                styles.mapHeader
              }
            >
              <Text
                style={
                  styles.mapTitle
                }
              >
                Worker location
              </Text>

              <Text
                style={[
                  styles.freshness,

                  locationFreshness ===
                    'fresh' &&
                    styles.freshText,

                  locationFreshness ===
                    'stale' &&
                    styles.staleText,
                ]}
              >
                {getTrackingLabel(
                  locationFreshness,
                )}
              </Text>
            </View>

            {showLiveMap &&
customerLocation ? (
  <LiveWorkerMap
    workerLocation={{
      latitude:
        location.latitude,
      longitude:
        location.longitude,
    }}
    customerLocation={
      customerLocation
    }
  />
) : (
              <View
                style={
                  styles.mapUnavailable
                }
              >
                <Text
                  style={
                    styles.mapUnavailableTitle
                  }
                >
                  {locationFreshness ===
                  'stale'
                    ? 'Live location unavailable'
                    : 'Waiting for worker location'}
                </Text>

                <Text
                  style={
                    styles.mapUnavailableMessage
                  }
                >
                  {locationFreshness ===
                  'stale'
                    ? 'The last location update is too old to display as the worker’s current position.'
                    : 'The worker has not sent a location update yet.'}
                </Text>
              </View>
            )}

            {showLiveMap ? (
              <Text
                style={
                  styles.locationAge
                }
              >
                Updated{' '}
                {locationAgeSeconds ??
                  0}{' '}
                seconds ago
              </Text>
            ) : null}
          </View>
        ) : null}

        <View
          style={
            styles.card
          }
        >
          <View
            style={
              styles.timelineHeader
            }
          >
            <View
              style={{
                flex: 1,
              }}
            >
              <Text
                style={
                  styles.sectionTitle
                }
              >
                Booking timeline
              </Text>

              <Text
                style={
                  styles.timelineSubtitle
                }
              >
                Status changes recorded
                for this booking.
              </Text>
            </View>

            <View
              style={
                styles.timelineCount
              }
            >
              <Text
                style={
                  styles.timelineCountText
                }
              >
                {statusHistory.length}
              </Text>
            </View>
          </View>

          {statusHistory.length >
          0 ? (
            <View
              style={
                styles.timeline
              }
            >
              {statusHistory.map(
                (
                  item,
                  index,
                ) => {
                  const isLast =
                    index ===
                    statusHistory.length -
                      1

                  const isCurrent =
                    isLast &&
                    item.new_status ===
                      booking.status

                  return (
                    <View
                      key={
                        item.id
                      }
                      style={
                        styles.timelineItem
                      }
                    >
                      <View
                        style={
                          styles.timelineRail
                        }
                      >
                        <View
                          style={[
                            styles.timelineDot,

                            isCurrent &&
                              styles.timelineDotCurrent,
                          ]}
                        />

                        {!isLast ? (
                          <View
                            style={
                              styles.timelineLine
                            }
                          />
                        ) : null}
                      </View>

                      <View
                        style={[
                          styles.timelineContent,

                          !isLast &&
                            styles.timelineContentSpaced,
                        ]}
                      >
                        <View
                          style={
                            styles.timelineTitleRow
                          }
                        >
                          <Text
                            style={
                              styles.timelineTitle
                            }
                          >
                            {formatStatus(
                              item.new_status,
                            )}
                          </Text>

                          {isCurrent ? (
                            <View
                              style={
                                styles.currentPill
                              }
                            >
                              <Text
                                style={
                                  styles.currentPillText
                                }
                              >
                                Current
                              </Text>
                            </View>
                          ) : null}
                        </View>

                        <Text
                          style={
                            styles.timelineTransition
                          }
                        >
                          {item.old_status
                            ? `From ${formatStatus(
                                item.old_status,
                              )}`
                            : 'Initial booking status'}
                        </Text>

                        <Text
                          style={
                            styles.timelineDate
                          }
                        >
                          {formatDateTime(
                            item.created_at,
                          )}
                        </Text>
                      </View>
                    </View>
                  )
                },
              )}
            </View>
          ) : (
            <View
              style={
                styles.timelineEmpty
              }
            >
              <Text
                style={
                  styles.timelineEmptyTitle
                }
              >
                No status history yet
              </Text>

              <Text
                style={
                  styles.timelineEmptyMessage
                }
              >
                The current booking
                status is still available
                above. New status changes
                will appear here
                automatically.
              </Text>
            </View>
          )}
        </View>

        <View
          style={
            styles.card
          }
        >
          <Text
            style={
              styles.sectionTitle
            }
          >
            Booking details
          </Text>

          <Row
            label="Service"
            value={
              booking.service_name ??
              'Service'
            }
          />

          <Row
            label="Status"
            value={formatStatus(
              booking.status,
            )}
          />

          <Row
            label="Booking ID"
            value={
              booking.id
            }
          />

          <Row
            label="Start"
            value={formatDateTime(
              booking.scheduled_start,
            )}
          />

          <Row
            label="End"
            value={formatDateTime(
              booking.scheduled_end,
            )}
          />

          <Row
            label="Working hours"
            value={
              booking.total_working_hours ===
              null
                ? '—'
                : String(
                    booking.total_working_hours,
                  )
            }
          />

          <Row
            label="Amount"
            value={formatMoney(
              booking.total_amount,
            )}
          />
        </View>

        {!terminal &&
        booking.status !==
          'pending_payment' &&
        booking.status !==
          'payment_failed' ? (
          <View
            style={
              styles.card
            }
          >
            <Text
              style={
                styles.sectionTitle
              }
            >
              Worker
            </Text>

            {workerAssigned ? (
              <>
                <Text
                  style={
                    styles.worker
                  }
                >
                  Worker assigned
                </Text>

                <Text
                  style={
                    styles.workerId
                  }
                >
                  Worker ID:{' '}
                  {booking.worker_id}
                </Text>

                {tracking ? (
                  <View
                    style={
                      styles.trackingPanel
                    }
                  >
                    <Text
                      style={
                        styles.trackingTitle
                      }
                    >
                      Tracking status
                    </Text>

                    <Text
                      style={[
                        styles.freshness,

                        locationFreshness ===
                          'fresh' &&
                          styles.freshText,

                        locationFreshness ===
                          'stale' &&
                          styles.staleText,
                      ]}
                    >
                      {getTrackingLabel(
                        locationFreshness,
                      )}
                    </Text>

                    {location &&
                    locationFreshness ===
                      'fresh' ? (
                      <>
                        <Text
                          style={
                            styles.location
                          }
                        >
                          Current position:{' '}
                          {location.latitude.toFixed(
                            5,
                          )}
                          ,{' '}
                          {location.longitude.toFixed(
                            5,
                          )}
                        </Text>

                        <Text
                          style={
                            styles.locationAge
                          }
                        >
                          Updated{' '}
                          {locationAgeSeconds ??
                            0}{' '}
                          seconds ago
                        </Text>
                      </>
                    ) : locationFreshness ===
                      'stale' ? (
                      <Text
                        style={
                          styles.staleMessage
                        }
                      >
                        The last known location
                        is too old to be
                        presented as live. We
                        will continue checking
                        for a fresh update.
                      </Text>
                    ) : (
                      <Text
                        style={
                          styles.staleMessage
                        }
                      >
                        Waiting for the
                        worker's first
                        location update.
                      </Text>
                    )}
                  </View>
                ) : null}
              </>
            ) : (
              <Text
                style={
                  styles.worker
                }
              >
                Searching for a worker...
              </Text>
            )}
          </View>
        ) : null}

        {booking.status ===
          'in_progress' &&
        booking.started_at ? (
          <View
            style={
              styles.timerCard
            }
          >
            <Text
              style={
                styles.timerLabel
              }
            >
              Service duration
            </Text>

            <Text
              style={
                styles.timer
              }
            >
              {timer}
            </Text>
          </View>
        ) : null}

        {booking.status ===
        'arrived' ? (
          <Pressable
            style={
              styles.button
            }
            onPress={() =>
              void showOtp(
                'start',
              )
            }
          >
            <Text
              style={
                styles.buttonText
              }
            >
              Show start OTP
            </Text>
          </Pressable>
        ) : null}

        {booking.status ===
        'in_progress' ? (
          <Pressable
            style={
              styles.button
            }
            onPress={() =>
              void showOtp(
                'end',
              )
            }
          >
            <Text
              style={
                styles.buttonText
              }
            >
              Show end OTP
            </Text>
          </Pressable>
        ) : null}

        {canReschedule &&
        booking.scheduled_start &&
        booking.scheduled_end ? (
          <Pressable
            style={
              styles.rescheduleButton
            }
            onPress={() =>
              onReschedule(
                booking.id,
                booking.scheduled_start!,
                booking.scheduled_end!,
              )
            }
          >
            <Text
              style={
                styles.rescheduleButtonText
              }
            >
              Reschedule booking
            </Text>
          </Pressable>
        ) : null}

        {!terminal &&
        !workerAssigned &&
        booking.status !==
          'in_progress' &&
        booking.status !==
          'arrived' ? (
          <Pressable
            style={
              styles.cancelButton
            }
            onPress={
              handleCancelBooking
            }
          >
            <Text
              style={
                styles.cancelButtonText
              }
            >
              Cancel booking
            </Text>
          </Pressable>
        ) : null}

        {otp ? (
          <View
            style={
              styles.otpCard
            }
          >
            <Text
              style={
                styles.otpLabel
              }
            >
              Booking OTP
            </Text>

            <Text
              style={
                styles.otp
              }
            >
              {otp}
            </Text>
          </View>
        ) : null}

        {booking.status ===
          'searching_worker' ? (
          <Text
            style={
              styles.refreshHint
            }
          >
            We will continue checking
            for an eligible worker
            automatically.
          </Text>
        ) : null}

        {booking.status ===
          'completed' ? (
          <Text
            style={
              styles.completedMessage
            }
          >
            Service completed at{' '}
            {formatDateTime(
              booking.completed_at,
            )}
            .
          </Text>
        ) : null}
      </ScrollView>
    </ScreenContainer>
  )
}

function Row({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <View
      style={
        styles.row
      }
    >
      <Text
        style={
          styles.label
        }
      >
        {label}
      </Text>

      <Text
        style={
          styles.value
        }
      >
        {value}
      </Text>
    </View>
  )
}

const styles =
  StyleSheet.create({
    loading: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
    },

    loadingLogo: {
      width: 150,
      height: 52,
      marginBottom: 8,
    },

    loadingText: {
      color: '#6B7280',
    },

    container: {
      padding: 18,
    },

    brandRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 16,
    },

    logo: {
      width: 132,
      height: 44,
    },

    brandLabel: {
      marginLeft: 10,
      color: '#00A7A7',
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 1.1,
    },

    headingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 16,
    },

    stepBadge: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#062F52',
      marginRight: 12,
    },

    stepBadgeText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '900',
    },

    title: {
      fontSize: 28,
      fontWeight: '700',
      color: '#062F52',
      marginBottom: 16,
    },

    subtitle: {
      marginTop: 4,
      color: '#607789',
      fontSize: 13,
      lineHeight: 19,
    },

    stateCard: {
      padding: 18,
      borderRadius: 16,
      backgroundColor: '#E8F7F7',
      marginBottom: 16,
    },

    searchingCard: {
      backgroundColor: '#EAF4FB',
    },

    trackingCard: {
      backgroundColor: '#EEF5F8',
    },

    progressCard: {
      backgroundColor: '#FFFFFF',
    },

    stateTopRow: {
      minHeight: 70,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },

    stateIcon: {
      width: 56,
      height: 56,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#062F52',
    },

    stateIconText: {
      color: '#FFFFFF',
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 0.7,
    },

    stateHero: {
      width: 92,
      height: 66,
      borderRadius: 18,
    },

    stateTitle: {
      fontSize: 20,
      fontWeight: '800',
      color: '#062F52',
    },

    stateMessage: {
      marginTop: 8,
      lineHeight: 21,
      color: '#374151',
    },

    mapCard: {
      marginBottom: 16,
      borderRadius: 16,
      overflow: 'hidden',
      backgroundColor: '#FFFFFF',
    },

    mapHeader: {
      paddingHorizontal: 18,
      paddingTop: 18,
      paddingBottom: 12,
    },

    mapTitle: {
      fontSize: 17,
      fontWeight: '800',
      color: '#062F52',
    },

    mapUnavailable: {
      height: 280,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
      backgroundColor: '#EEF5F8',
    },

    mapUnavailableTitle: {
      fontSize: 17,
      fontWeight: '800',
      color: '#062F52',
      textAlign: 'center',
    },

    mapUnavailableMessage: {
      marginTop: 8,
      color: '#6B7280',
      lineHeight: 20,
      textAlign: 'center',
    },

    card: {
      padding: 18,
      borderRadius: 16,
      backgroundColor: '#FFFFFF',
      marginBottom: 16,
    },

    sectionTitle: {
      fontSize: 17,
      fontWeight: '800',
      color: '#062F52',
      marginBottom: 10,
    },

    timelineHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 14,
    },

    timelineSubtitle: {
      marginTop: -4,
      color: '#6B7280',
      fontSize: 12,
      lineHeight: 18,
    },

    timelineCount: {
      minWidth: 32,
      height: 32,
      paddingHorizontal: 8,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#E8F7F7',
    },

    timelineCountText: {
      color: '#008A88',
      fontSize: 12,
      fontWeight: '900',
    },

    timeline: {
      marginTop: 2,
    },

    timelineItem: {
      flexDirection: 'row',
    },

    timelineRail: {
      width: 28,
      alignItems: 'center',
    },

    timelineDot: {
      width: 12,
      height: 12,
      marginTop: 4,
      borderRadius: 6,
      backgroundColor: '#B8CBD7',
      borderWidth: 2,
      borderColor: '#FFFFFF',
    },

    timelineDotCurrent: {
      width: 14,
      height: 14,
      borderRadius: 7,
      backgroundColor: '#00A7A7',
      borderWidth: 3,
      borderColor: '#D8F5F5',
    },

    timelineLine: {
      width: 2,
      flex: 1,
      minHeight: 42,
      marginVertical: 2,
      backgroundColor: '#DCE7ED',
    },

    timelineContent: {
      flex: 1,
      paddingLeft: 10,
      paddingBottom: 8,
    },

    timelineContentSpaced: {
      minHeight: 76,
    },

    timelineTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },

    timelineTitle: {
      flex: 1,
      color: '#062F52',
      fontSize: 15,
      fontWeight: '800',
    },

    currentPill: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
      backgroundColor: '#E8F7F7',
    },

    currentPillText: {
      color: '#008A88',
      fontSize: 10,
      fontWeight: '900',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },

    timelineTransition: {
      marginTop: 4,
      color: '#6B7280',
      fontSize: 12,
    },

    timelineDate: {
      marginTop: 4,
      color: '#8A9AA6',
      fontSize: 11,
    },

    timelineEmpty: {
      padding: 14,
      borderRadius: 12,
      backgroundColor: '#EEF5F8',
    },

    timelineEmptyTitle: {
      color: '#062F52',
      fontSize: 14,
      fontWeight: '800',
    },

    timelineEmptyMessage: {
      marginTop: 5,
      color: '#6B7280',
      fontSize: 12,
      lineHeight: 18,
    },

    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 16,
      paddingVertical: 8,
    },

    label: {
      color: '#6B7280',
    },

    value: {
      flex: 1,
      maxWidth: '65%',
      color: '#062F52',
      fontWeight: '600',
      textAlign: 'right',
    },

    worker: {
      marginTop: 4,
      fontSize: 17,
      fontWeight: '700',
      color: '#062F52',
    },

    workerId: {
      marginTop: 6,
      color: '#6B7280',
      fontSize: 12,
    },

    trackingPanel: {
      marginTop: 16,
      padding: 16,
      borderRadius: 12,
      backgroundColor: '#FFFFFF',
    },

    trackingTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: '#062F52',
    },

    freshness: {
      marginTop: 8,
      fontWeight: '700',
    },

    freshText: {
      color: '#008A88',
    },

    staleText: {
      color: '#B45309',
    },

    location: {
      marginTop: 12,
      color: '#374151',
      lineHeight: 20,
    },

    locationAge: {
      marginTop: 4,
      color: '#6B7280',
      fontSize: 12,
    },

    staleMessage: {
      marginTop: 12,
      color: '#6B7280',
      lineHeight: 20,
    },

    timerCard: {
      padding: 18,
      borderRadius: 16,
      backgroundColor: '#FFFFFF',
      marginBottom: 16,
      alignItems: 'center',
    },

    timerLabel: {
      color: '#6B7280',
    },

    timer: {
      marginTop: 6,
      fontSize: 36,
      fontWeight: '800',
      color: '#062F52',
    },

    button: {
      marginTop: 4,
      marginBottom: 12,
      padding: 14,
      borderRadius: 10,
      backgroundColor: '#00A7A7',
      alignItems: 'center',
    },

    buttonText: {
      color: '#FFFFFF',
      fontWeight: '700',
    },

    rescheduleButton: {
      marginTop: 4,
      marginBottom: 12,
      padding: 14,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: '#00A7A7',
      backgroundColor: '#E8F7F7',
      alignItems: 'center',
    },

    rescheduleButtonText: {
      color: '#008A88',
      fontWeight: '800',
    },

    cancelButton: {
      marginTop: 4,
      marginBottom: 12,
      padding: 14,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: '#F0B8B8',
      backgroundColor: '#FFF6F6',
      alignItems: 'center',
    },

    cancelButtonText: {
      color: '#B91C1C',
      fontWeight: '800',
    },

    otpCard: {
      marginTop: 4,
      marginBottom: 16,
      padding: 18,
      borderRadius: 16,
      backgroundColor: '#FFFFFF',
      alignItems: 'center',
    },

    otpLabel: {
      color: '#6B7280',
    },

    otp: {
      marginTop: 6,
      fontSize: 28,
      fontWeight: '800',
      color: '#062F52',
      letterSpacing: 4,
    },

    refreshHint: {
      marginTop: 4,
      marginBottom: 16,
      color: '#6B7280',
      textAlign: 'center',
      lineHeight: 20,
    },

    completedMessage: {
      marginTop: 4,
      marginBottom: 16,
      color: '#008A88',
      textAlign: 'center',
      lineHeight: 20,
    },

    error: {
      marginBottom: 12,
      color: '#B91C1C',
    },
  })