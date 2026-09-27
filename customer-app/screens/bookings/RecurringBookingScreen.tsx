import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import {
  ScreenContainer,
} from '../../components/layout/ScreenContainer'

import {
  getCustomerBooking,
  getCustomerActiveBookingOccurrence,
  getCustomerBookingOccurrences,
  requestBookingOtp,
  type BookingStatus,
  type CustomerBooking,
  type CustomerBookingOccurrence,
} from '../../services/booking/bookingTracking.service'

import {
  cancelCustomerBooking,
} from '../../services/booking/bookingCancellation.service'

import {
  supabase,
} from '../../lib/supabase'

type RecurringBookingScreenProps = {
  bookingId: string
}

function formatStatus(
  status: string,
): string {
  return status
    .replace(/_/g, ' ')
    .replace(
      /\b\w/g,
      value =>
        value.toUpperCase(),
    )
}

function formatDateTime(
  value: string | null,
): string {
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

  return date.toLocaleString(
    undefined,
    {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    },
  )
}

function formatMoney(
  value: number | null,
): string {
  if (value === null) {
    return '—'
  }

  return value.toFixed(2)
}

function elapsedSince(
  startedAt: string,
  completedAt: string | null,
): string {
  const start =
    Date.parse(startedAt)

  const end =
    completedAt
      ? Date.parse(
          completedAt,
        )
      : Date.now()

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

  const remaining =
    seconds % 60

  return [
    hours,
    minutes,
    remaining,
  ]
    .map(value =>
      String(value).padStart(
        2,
        '0',
      ),
    )
    .join(':')
}

function getStatusVariant(
  status: string,
):
  | 'info'
  | 'warning'
  | 'success'
  | 'error'
  | 'default' {
  switch (status) {
    case 'assigned':
      return 'info'

    case 'on_the_way':
    case 'arrived':
    case 'in_progress':
      return 'warning'

    case 'completed':
      return 'success'

    case 'cancelled':
    case 'expired':
      return 'error'

    default:
      return 'default'
  }
}

function StatusBadge({
  status,
}: {
  status: string
}) {
  const variant =
    getStatusVariant(
      status,
    )

  return (
    <View
      style={[
        styles.badge,
        variant ===
          'info' &&
          styles.badgeInfo,
        variant ===
          'warning' &&
          styles.badgeWarning,
        variant ===
          'success' &&
          styles.badgeSuccess,
        variant ===
          'error' &&
          styles.badgeError,
      ]}
    >
      <Text
        style={[
          styles.badgeText,
          variant ===
            'info' &&
            styles.badgeTextInfo,
          variant ===
            'warning' &&
            styles.badgeTextWarning,
          variant ===
            'success' &&
            styles.badgeTextSuccess,
          variant ===
            'error' &&
            styles.badgeTextError,
        ]}
      >
        {formatStatus(
          status,
        )}
      </Text>
    </View>
  )
}

export default function RecurringBookingScreen({
  bookingId,
}: RecurringBookingScreenProps) {
  const [
    booking,
    setBooking,
  ] =
    useState<CustomerBooking | null>(
      null,
    )

  const [
    occurrences,
    setOccurrences,
  ] =
    useState<
      CustomerBookingOccurrence[]
    >([])

  const [
    activeOccurrence,
    setActiveOccurrence,
  ] =
    useState<CustomerBookingOccurrence | null>(
      null,
    )

  const [
    loading,
    setLoading,
  ] = useState(true)

  const [
    refreshing,
    setRefreshing,
  ] = useState(false)

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
    otpType,
    setOtpType,
  ] =
    useState<
      'start' | 'end' | null
    >(null)

  const [
    otpLoading,
    setOtpLoading,
  ] = useState(false)

  const [
    timer,
    setTimer,
  ] =
    useState('00:00:00')

  const loadData =
    useCallback(
      async (
        isRefresh = false,
      ) => {
        if (isRefresh) {
          setRefreshing(true)
        } else {
          setLoading(true)
        }

        setError(null)

        try {
          const [
            nextBooking,
            nextOccurrences,
            nextActiveOccurrence,
          ] =
            await Promise.all([
              getCustomerBooking(
                bookingId,
              ),

              getCustomerBookingOccurrences(
                bookingId,
              ),

              getCustomerActiveBookingOccurrence(
                bookingId,
              ),
            ])

          if (
            nextBooking.booking_type !==
            'recurring'
          ) {
            throw new Error(
              'This booking is not a recurring booking.',
            )
          }

          setBooking(
            nextBooking,
          )

          setOccurrences(
            nextOccurrences,
          )

          setActiveOccurrence(
            nextActiveOccurrence,
          )

          if (
            nextActiveOccurrence
              ?.status !==
              'arrived' &&
            nextActiveOccurrence
              ?.status !==
              'in_progress'
          ) {
            setOtp(null)
            setOtpType(null)
          }
        } catch (
          cause
        ) {
          setError(
            cause instanceof Error
              ? cause.message
              : 'Unable to load recurring booking.',
          )
        } finally {
          setLoading(false)
          setRefreshing(false)
        }
      },
      [bookingId],
    )

  useEffect(() => {
    void loadData()

    const refreshInterval =
      setInterval(
        () => {
          void loadData(
            true,
          )
        },
        15000,
      )

    const channel =
      supabase
        .channel(
          `customer-recurring-booking-${bookingId}`,
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table:
              'booking_schedule_occurrences',
            filter:
              `booking_id=eq.${bookingId}`,
          },
          () => {
            void loadData(
              true,
            )
          },
        )
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
            void loadData(
              true,
            )
          },
        )
        .subscribe()

    return () => {
      clearInterval(
        refreshInterval,
      )

      void supabase.removeChannel(
        channel,
      )
    }
  }, [
    bookingId,
    loadData,
  ])

  useEffect(() => {
    if (
      !activeOccurrence ||
      activeOccurrence.status !==
        'in_progress' ||
      !activeOccurrence.started_at
    ) {
      setTimer(
        '00:00:00',
      )
      return
    }

    const update =
      () => {
        setTimer(
          elapsedSince(
            activeOccurrence.started_at!,
            activeOccurrence.completed_at,
          ),
        )
      }

    update()

    const timerInterval =
      setInterval(
        update,
        1000,
      )

    return () =>
      clearInterval(
        timerInterval,
      )
  }, [
    activeOccurrence,
  ])

  async function handleShowOtp(
    type: 'start' | 'end',
  ) {
    if (
      !booking ||
      !activeOccurrence
    ) {
      return
    }

    if (
      type === 'start' &&
      activeOccurrence.status !==
        'arrived'
    ) {
      setError(
        'The Start OTP is available only after the worker arrives for this shift.',
      )
      return
    }

    if (
      type === 'end' &&
      activeOccurrence.status !==
        'in_progress'
    ) {
      setError(
        'The End OTP is available only while this shift is in progress.',
      )
      return
    }

    setOtpLoading(
      true,
    )
    setError(null)

    try {
      const result =
        await requestBookingOtp(
          booking.id,
          type,
          activeOccurrence.id,
        )

      setOtp(
        result.otp ??
          null,
      )

      setOtpType(
        type,
      )
    } catch (
      cause
    ) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Unable to generate the OTP.',
      )

      setOtp(null)
      setOtpType(null)
    } finally {
      setOtpLoading(
        false,
      )
    }
  }

  function confirmCancelSeries() {
    Alert.alert(
      'Cancel recurring booking',
      'This will cancel the recurring booking series. Continue?',
      [
        {
          text: 'Keep booking',
          style: 'cancel',
        },
        {
          text: 'Cancel series',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                setError(null)

                await cancelCustomerBooking(
                  bookingId,
                  'recurring',
                )

                await loadData(
                  true,
                )
              } catch (
                cause
              ) {
                setError(
                  cause instanceof Error
                    ? cause.message
                    : 'Unable to cancel the recurring booking.',
                )
              }
            })()
          },
        },
      ],
    )
  }

  const completedCount =
    useMemo(
      () =>
        occurrences.filter(
          occurrence =>
            occurrence.status ===
            'completed',
        ).length,
      [occurrences],
    )

  const cancelledCount =
    useMemo(
      () =>
        occurrences.filter(
          occurrence =>
            occurrence.status ===
            'cancelled',
        ).length,
      [occurrences],
    )

  const remainingCount =
    Math.max(
      0,
      occurrences.length -
        completedCount -
        cancelledCount,
    )

  if (loading) {
    return (
      <ScreenContainer>
        <View style={styles.loading}>
          <ActivityIndicator />
          <Text style={styles.loadingText}>
            Loading recurring booking...
          </Text>
        </View>
      </ScreenContainer>
    )
  }

  if (
    !booking ||
    error &&
      occurrences.length === 0
  ) {
    return (
      <ScreenContainer>
        <ScrollView
          contentContainerStyle={
            styles.container
          }
        >
          <Text style={styles.eyebrow}>
            RECURRING BOOKING
          </Text>

          <Text style={styles.title}>
            Booking unavailable
          </Text>

          <Text style={styles.errorText}>
            {error ??
              'Recurring booking could not be loaded.'}
          </Text>

          <Pressable
            style={styles.button}
            onPress={() => {
              void loadData()
            }}
          >
            <Text
              style={
                styles.buttonText
              }
            >
              Try again
            </Text>
          </Pressable>
        </ScrollView>
      </ScreenContainer>
    )
  }

  if (!booking) {
    return null
  }

  const isSeriesCompleted =
  occurrences.length > 0 &&
  completedCount === occurrences.length

const isSeriesCancelled =
  booking.status === 'cancelled' ||
  (
    occurrences.length > 0 &&
    cancelledCount === occurrences.length
  )

  return (
    <ScreenContainer>
      <ScrollView
        contentContainerStyle={
          styles.container
        }
        refreshControl={
          <RefreshControl
            refreshing={
              refreshing
            }
            onRefresh={() => {
              void loadData(
                true,
              )
            }}
          />
        }
        showsVerticalScrollIndicator={
          false
        }
      >
        <Text style={styles.eyebrow}>
          RECURRING BOOKING
        </Text>

        <Text style={styles.title}>
          Your recurring shifts
        </Text>

        <Text
          style={
            styles.subtitle
          }
        >
          Each shift has its own status,
          Start OTP, service timer and
          End OTP.
        </Text>

        {error ? (
          <View
            style={
              styles.errorBox
            }
          >
            <Text
              style={
                styles.errorBoxTitle
              }
            >
              Booking update notice
            </Text>

            <Text
              style={
                styles.errorBoxText
              }
            >
              {error}
            </Text>
          </View>
        ) : null}

        <View
          style={
            styles.summaryCard
          }
        >
          <View
            style={
              styles.summaryHeader
            }
          >
            <View style={{ flex: 1 }}>
              <Text
                style={
                  styles.summaryTitle
                }
              >
                Service
              </Text>

              <Text
                style={
                  styles.summaryService
                }
              >
                {booking.service_name ??
                  'Service'}
              </Text>
            </View>

            <StatusBadge
  status={
    isSeriesCancelled
      ? 'cancelled'
      : isSeriesCompleted
        ? 'completed'
        : activeOccurrence?.status ??
          booking.status
  }
/>
          </View>

          <View
            style={
              styles.divider
            }
          />

          <View
            style={
              styles.summaryGrid
            }
          >
            <View
              style={
                styles.summaryItem
              }
            >
              <Text
                style={
                  styles.summaryLabel
                }
              >
                Total shifts
              </Text>

              <Text
                style={
                  styles.summaryValue
                }
              >
                {occurrences.length}
              </Text>
            </View>

            <View
              style={
                styles.summaryItem
              }
            >
              <Text
                style={
                  styles.summaryLabel
                }
              >
                Completed
              </Text>

              <Text
                style={
                  styles.summaryValue
                }
              >
                {completedCount}
              </Text>
            </View>

            <View
              style={
                styles.summaryItem
              }
            >
              <Text
                style={
                  styles.summaryLabel
                }
              >
                Remaining
              </Text>

              <Text
                style={
                  styles.summaryValue
                }
              >
                {remainingCount}
              </Text>
            </View>
          </View>

          <View
            style={
              styles.divider
            }
          />

          <View
            style={
              styles.summaryMoneyRow
            }
          >
            <Text
              style={
                styles.summaryLabel
              }
            >
              Booking amount
            </Text>

            <Text
              style={
                styles.summaryMoney
              }
            >
              {formatMoney(
                booking.total_amount,
              )}
            </Text>
          </View>
        </View>

        {activeOccurrence ? (
          <View
            style={
              styles.currentCard
            }
          >
            <Text
              style={
                styles.currentEyebrow
              }
            >
              CURRENT / NEXT SHIFT
            </Text>

            <Text
              style={
                styles.currentTitle
              }
            >
              Occurrence{' '}
              {
                activeOccurrence.occurrence_index
              }
            </Text>

            <Text
              style={
                styles.currentDate
              }
            >
              {formatDateTime(
                activeOccurrence.scheduled_start,
              )}
            </Text>

            <Text
              style={
                styles.currentEnd
              }
            >
              Ends{' '}
              {formatDateTime(
                activeOccurrence.scheduled_end,
              )}
            </Text>

            <View
              style={
                styles.currentStatusRow
              }
            >
              <Text
                style={
                  styles.currentStatusLabel
                }
              >
                Shift status
              </Text>

              <StatusBadge
                status={
                  activeOccurrence.status
                }
              />
            </View>

            {activeOccurrence.status ===
            'arrived' ? (
              <Pressable
                style={styles.button}
                disabled={
                  otpLoading
                }
                onPress={() => {
                  void handleShowOtp(
                    'start',
                  )
                }}
              >
                <Text
                  style={
                    styles.buttonText
                  }
                >
                  {otpLoading &&
                  otpType === 'start'
                    ? 'Generating...'
                    : 'Show Start OTP'}
                </Text>
              </Pressable>
            ) : null}

            {activeOccurrence.status ===
            'in_progress' ? (
              <>
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
                    Current shift duration
                  </Text>

                  <Text
                    style={
                      styles.timer
                    }
                  >
                    {timer}
                  </Text>
                </View>

                <Pressable
                  style={styles.button}
                  disabled={
                    otpLoading
                  }
                  onPress={() => {
                    void handleShowOtp(
                      'end',
                    )
                  }}
                >
                  <Text
                    style={
                      styles.buttonText
                    }
                  >
                    {otpLoading &&
                    otpType === 'end'
                      ? 'Generating...'
                      : 'Show End OTP'}
                  </Text>
                </Pressable>
              </>
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
                  {otpType ===
                  'start'
                    ? 'START OTP'
                    : 'END OTP'}
                </Text>

                <Text
                  style={
                    styles.otp
                  }
                >
                  {otp}
                </Text>

                <Text
                  style={
                    styles.otpHint
                  }
                >
                  Give this 6-digit code to the
                  worker for this shift only.
                </Text>
              </View>
            ) : null}
          </View>
        ) : (
          <View
            style={
              styles.emptyCard
            }
          >
            <Text
              style={
                styles.emptyTitle
              }
            >
              All recurring shifts are closed
            </Text>

            <Text
              style={
                styles.emptyText
              }
            >
              There are no remaining active
              occurrences for this series.
            </Text>
          </View>
        )}

        <View
          style={
            styles.section
          }
        >
          <Text
            style={
              styles.sectionTitle
            }
          >
            All occurrences
          </Text>

          <Text
            style={
              styles.sectionSubtitle
            }
          >
            Every recurring shift is tracked
            independently.
          </Text>

          <View
            style={
              styles.occurrenceList
            }
          >
            {occurrences.map(
              occurrence => (
                <View
                  key={
                    occurrence.id
                  }
                  style={
                    styles.occurrenceRow
                  }
                >
                  <View
                    style={
                      styles.occurrenceCopy
                    }
                  >
                    <Text
                      style={
                        styles.occurrenceTitle
                      }
                    >
                      Occurrence{' '}
                      {
                        occurrence.occurrence_index
                      }
                    </Text>

                    <Text
                      style={
                        styles.occurrenceDate
                      }
                    >
                      {formatDateTime(
                        occurrence.scheduled_start,
                      )}
                    </Text>

                    <Text
                      style={
                        styles.occurrenceEnd
                      }
                    >
                      Ends{' '}
                      {formatDateTime(
                        occurrence.scheduled_end,
                      )}
                    </Text>
                  </View>

                  <StatusBadge
                    status={
                      occurrence.status
                    }
                  />
                </View>
              ),
            )}
          </View>
        </View>

        {!isSeriesCompleted &&
!isSeriesCancelled ? (
          <Pressable
            style={
              styles.cancelButton
            }
            onPress={
              confirmCancelSeries
            }
          >
            <Text
              style={
                styles.cancelButtonText
              }
            >
              Cancel recurring booking
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </ScreenContainer>
  )
}

const styles =
  StyleSheet.create({
    loading: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },

    loadingText: {
      marginTop: 12,
      color: '#6B7280',
    },

    container: {
      padding: 18,
      paddingBottom: 40,
    },

    eyebrow: {
      color: '#00A7A7',
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 1.2,
      marginBottom: 6,
    },

    title: {
      fontSize: 28,
      lineHeight: 34,
      fontWeight: '800',
      color: '#062F52',
    },

    subtitle: {
      marginTop: 8,
      marginBottom: 18,
      color: '#607789',
      fontSize: 14,
      lineHeight: 21,
    },

    errorBox: {
      marginBottom: 16,
      padding: 14,
      borderRadius: 12,
      backgroundColor: '#FFF7E5',
      borderWidth: 1,
      borderColor: '#F4C84B',
    },

    errorBoxTitle: {
      fontSize: 14,
      fontWeight: '800',
      color: '#9A4D00',
    },

    errorBoxText: {
      marginTop: 5,
      color: '#8A6670',
      fontSize: 13,
      lineHeight: 19,
    },

    errorText: {
      marginTop: 12,
      marginBottom: 18,
      color: '#B91C1C',
      fontSize: 14,
      lineHeight: 20,
    },

    summaryCard: {
      padding: 18,
      marginBottom: 16,
      borderRadius: 16,
      backgroundColor: '#FFFFFF',
      borderWidth: 1,
      borderColor: '#E5E7EB',
    },

    summaryHeader: {
      flexDirection: 'row',
      alignItems: 'center',
    },

    summaryTitle: {
      color: '#6B7280',
      fontSize: 12,
      fontWeight: '700',
    },

    summaryService: {
      marginTop: 4,
      color: '#062F52',
      fontSize: 19,
      fontWeight: '800',
    },

    divider: {
      height: 1,
      marginVertical: 14,
      backgroundColor: '#E5E7EB',
    },

    summaryGrid: {
      flexDirection: 'row',
    },

    summaryItem: {
      flex: 1,
    },

    summaryLabel: {
      color: '#718096',
      fontSize: 11,
      fontWeight: '700',
    },

    summaryValue: {
      marginTop: 4,
      color: '#062F52',
      fontSize: 20,
      fontWeight: '800',
    },

    summaryMoneyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },

    summaryMoney: {
      color: '#062F52',
      fontSize: 20,
      fontWeight: '900',
    },

    currentCard: {
      padding: 18,
      marginBottom: 16,
      borderRadius: 16,
      backgroundColor: '#EEF5F8',
      borderWidth: 1,
      borderColor: '#00A7A7',
    },

    currentEyebrow: {
      color: '#008A88',
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 1.1,
    },

    currentTitle: {
      marginTop: 6,
      color: '#062F52',
      fontSize: 22,
      fontWeight: '900',
    },

    currentDate: {
      marginTop: 8,
      color: '#062F52',
      fontSize: 15,
      fontWeight: '700',
    },

    currentEnd: {
      marginTop: 4,
      color: '#607789',
      fontSize: 12,
    },

    currentStatusRow: {
      marginTop: 16,
      marginBottom: 4,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },

    currentStatusLabel: {
      color: '#607789',
      fontSize: 12,
      fontWeight: '700',
    },

    timerCard: {
      marginTop: 14,
      marginBottom: 14,
      padding: 14,
      borderRadius: 12,
      backgroundColor: '#FFFFFF',
      borderWidth: 1,
      borderColor: '#D7E1E7',
      alignItems: 'center',
    },

    timerLabel: {
      color: '#718096',
      fontSize: 11,
      fontWeight: '700',
    },

    timer: {
      marginTop: 4,
      color: '#062F52',
      fontSize: 30,
      fontWeight: '900',
      letterSpacing: 1,
    },

    otpCard: {
      marginTop: 14,
      padding: 16,
      borderRadius: 14,
      backgroundColor: '#FFFFFF',
      borderWidth: 1,
      borderColor: '#00A7A7',
      alignItems: 'center',
    },

    otpLabel: {
      color: '#008A88',
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 1.2,
    },

    otp: {
      marginTop: 8,
      color: '#062F52',
      fontSize: 34,
      fontWeight: '900',
      letterSpacing: 8,
    },

    otpHint: {
      marginTop: 6,
      color: '#718096',
      fontSize: 11,
      lineHeight: 17,
      textAlign: 'center',
    },

    button: {
      marginTop: 14,
      paddingVertical: 15,
      borderRadius: 12,
      backgroundColor: '#062F52',
      alignItems: 'center',
    },

    buttonText: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '800',
    },

    section: {
      marginBottom: 18,
    },

    sectionTitle: {
      color: '#062F52',
      fontSize: 20,
      fontWeight: '800',
    },

    sectionSubtitle: {
      marginTop: 4,
      marginBottom: 10,
      color: '#718096',
      fontSize: 12,
      lineHeight: 18,
    },

    occurrenceList: {
      borderRadius: 14,
      backgroundColor: '#FFFFFF',
      borderWidth: 1,
      borderColor: '#E5E7EB',
      overflow: 'hidden',
    },

    occurrenceRow: {
      paddingHorizontal: 15,
      paddingVertical: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottomWidth: 1,
      borderBottomColor: '#E5E7EB',
    },

    occurrenceCopy: {
      flex: 1,
      paddingRight: 10,
    },

    occurrenceTitle: {
      color: '#062F52',
      fontSize: 14,
      fontWeight: '800',
    },

    occurrenceDate: {
      marginTop: 4,
      color: '#607789',
      fontSize: 12,
    },

    occurrenceEnd: {
      marginTop: 2,
      color: '#8A99A6',
      fontSize: 11,
    },

    badge: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
    },

    badgeInfo: {
      backgroundColor: '#EEF5FF',
      borderColor: '#93B4E8',
    },

    badgeWarning: {
      backgroundColor: '#FFF8E8',
      borderColor: '#F1C35B',
    },

    badgeSuccess: {
      backgroundColor: '#E8F8F0',
      borderColor: '#74C69D',
    },

    badgeError: {
      backgroundColor: '#FFF0F0',
      borderColor: '#F4A0A0',
    },

    badgeText: {
      fontSize: 10,
      fontWeight: '900',
    },

    badgeTextInfo: {
      color: '#315BA5',
    },

    badgeTextWarning: {
      color: '#9A5A00',
    },

    badgeTextSuccess: {
      color: '#087443',
    },

    badgeTextError: {
      color: '#B42318',
    },

    emptyCard: {
      marginBottom: 16,
      padding: 20,
      borderRadius: 16,
      backgroundColor: '#F7FAFC',
      borderWidth: 1,
      borderColor: '#E5E7EB',
    },

    emptyTitle: {
      color: '#062F52',
      fontSize: 17,
      fontWeight: '800',
    },

    emptyText: {
      marginTop: 6,
      color: '#718096',
      fontSize: 13,
      lineHeight: 19,
    },

    cancelButton: {
      marginTop: 4,
      marginBottom: 8,
      padding: 15,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: '#334155',
      alignItems: 'center',
    },

    cancelButtonText: {
      color: '#334155',
      fontWeight: '800',
      fontSize: 14,
    },
  })