import {
  useCallback,
  useEffect,
  useState,
} from 'react'

import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import WorkerBookingOtpPanel from '../../components/bookings/WorkerBookingOtpPanel'

import BookingChatPanel from '../../components/bookings/BookingChatPanel'
import {
  AppButton,
} from '../../components/ui/AppButton'

import {
  ScreenContainer,
} from '../../components/layout/ScreenContainer'

import ErrorState from '../../components/ui/ErrorState'

import StatusBadge from '../../components/ui/StatusBadge'

import {
  UI,
} from '../../constants/ui'

import {
  getWorkerBooking,
} from '../../services/bookings/workerBookings.service'

import {
  performWorkerBookingAction,
} from '../../services/bookings/workerBookingActions.service'

import {
  getWorkerBookingOccurrencesForBooking,
} from '../../services/bookings/workerBookingOccurrences.service'

import {
  formatBookingAmount,
  formatBookingDateTime,
  getBookingDurationHours,
  getBookingStatusLabel,
  getBookingTypeLabel,
  getNextPendingOccurrence,
  isActiveBookingStatus,

} from '../../lib/workerBookingUtils'

import type {
  BookingStatus,
  WorkerBooking,
  WorkerBookingAction,
  WorkerBookingOccurrence,
} from '../../types/booking'

type BookingDetailsScreenProps = {
  bookingId: string
  onBack?: () => void
  onOccurrencePress?: (
    occurrenceId: string,
  ) => void
}

function getStatusVariant(
  status: BookingStatus,
):
  | 'default'
  | 'success'
  | 'warning'
  | 'error'
  | 'info' {
  switch (status) {
    case 'assigned':
    case 'paid':
      return 'info'

    case 'on_the_way':
    case 'arrived':
    case 'in_progress':
      return 'warning'

    case 'completed':
      return 'success'

    case 'cancelled':
    case 'expired':
    case 'payment_failed':
      return 'error'

    default:
      return 'default'
  }
}

function getOccurrenceVariant(
  status: WorkerBookingOccurrence['status'],
):
  | 'default'
  | 'success'
  | 'warning'
  | 'error'
  | 'info' {
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
      return 'error'

    default:
      return 'default'
  }
}

function getPrimaryAction(
  booking: WorkerBooking,
): {
  action: WorkerBookingAction
  title: string
} | null {
  if (
    booking.bookingType ===
    'recurring'
  ) {
    return null
  }

  switch (booking.status) {
    case 'assigned':
      return {
        action: 'on_the_way',
        title: 'Start Journey',
      }

    case 'on_the_way':
      return {
        action: 'arrived',
        title: 'Mark Arrived',
      }

    default:
      return null
  }
}

function formatDuration(
  booking: WorkerBooking,
): string {
  const hours =
    getBookingDurationHours(
      booking,
    )

  if (hours === null) {
    return `${booking.durationValue} ${booking.durationUnit}`
  }

  return `${booking.durationValue} ${booking.durationUnit} · ${hours}h`
}

function ActionButton({
  title,
  onPress,
  disabled,
  variant = 'primary',
}: {
  title: string
  onPress: () => void
  disabled: boolean
  variant?: 'primary' | 'secondary'
}) {
  return (
    <View
      style={
        styles.actionButton
      }
    >
      <AppButton
        title={title}
        variant={variant}
        disabled={disabled}
        onPress={onPress}
      />
    </View>
  )
}

export default function BookingDetailsScreen({
  bookingId,
  onBack,
  onOccurrencePress,
}: BookingDetailsScreenProps) {
  const [
    booking,
    setBooking,
  ] = useState<WorkerBooking | null>(
    null,
  )

  const [
    occurrences,
    setOccurrences,
  ] = useState<
    WorkerBookingOccurrence[]
  >([])

  const [
    loading,
    setLoading,
  ] = useState(true)

  const [
    refreshing,
    setRefreshing,
  ] = useState(false)

  const [
    actionLoading,
    setActionLoading,
  ] = useState(false)

  const [
    error,
    setError,
  ] = useState<string | null>(
    null,
  )

  const loadBooking = useCallback(
    async (
      isRefresh = false,
    ): Promise<void> => {
      if (isRefresh) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }

      setError(null)

      try {
       const nextBooking =
  await getWorkerBooking(
    bookingId,
  )

if (!nextBooking) {
  throw new Error(
    'Booking not found or not assigned to this worker.',
  )
}

const nextOccurrences =
  nextBooking.bookingType ===
  'recurring'
    ? await getWorkerBookingOccurrencesForBooking(
        bookingId,
      )
    : []

        if (!nextBooking) {
          throw new Error(
            'Booking not found or not assigned to this worker.',
          )
        }

        setBooking(
          nextBooking,
        )

        setOccurrences(
          nextOccurrences,
        )
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : 'Unable to load booking details.',
        )
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [bookingId],
  )

  useEffect(() => {
    void loadBooking()
  }, [
    loadBooking,
  ])

  const runAction = useCallback(
    async (
      action: WorkerBookingAction,
    ): Promise<void> => {
      if (!booking) {
        return
      }

      setActionLoading(true)
      setError(null)

      try {
        await performWorkerBookingAction(
          booking.id,
          action,
        )

        await loadBooking(
          true,
        )
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : 'Unable to update this booking.',
        )
      } finally {
        setActionLoading(false)
      }
    },
    [
      booking,
      loadBooking,
    ],
  )

  function confirmAction(
    action: WorkerBookingAction,
    title: string,
    message: string,
  ) {
    Alert.alert(
      title,
      message,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: title,
          style:
            action === 'cancel'
              ? 'destructive'
              : 'default',
          onPress: () => {
            void runAction(
              action,
            )
          },
        },
      ],
    )
  }

  if (loading) {
    return (
      <ScreenContainer>
        <View
          style={
            styles.loadingContainer
          }
        >
          <ActivityIndicator
            size="large"
            color={
              UI.colors.secondary
            }
          />

          <Text
            style={
              styles.loadingTitle
            }
          >
            Loading booking
          </Text>

          <Text
            style={
              styles.loadingText
            }
          >
            Fetching booking details and scheduled occurrences...
          </Text>
        </View>
      </ScreenContainer>
    )
  }

  if (
    error &&
    !booking
  ) {
    return (
      <ScreenContainer>
        <ErrorState
          title="Booking unavailable"
          message={error}
          onAction={() => {
            void loadBooking()
          }}
        />
      </ScreenContainer>
    )
  }

  if (!booking) {
    return (
      <ScreenContainer>
        <ErrorState
          title="Booking unavailable"
          message="The requested booking could not be loaded."
          onAction={() => {
            void loadBooking()
          }}
        />
      </ScreenContainer>
    )
  }

  const primaryAction =
    getPrimaryAction(
      booking,
    )

  const nextOccurrence =
    getNextPendingOccurrence(
      occurrences,
    )

  const canCancel =
    booking.status ===
      'assigned' ||
    booking.status ===
      'on_the_way' ||
    booking.status ===
      'arrived' ||
    booking.status ===
      'in_progress'

  return (
    <ScreenContainer>
      <ScrollView
        contentContainerStyle={
          styles.content
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void loadBooking(
                true,
              )
            }}
          />
        }
        showsVerticalScrollIndicator={
          false
        }
      >
        <View
          style={styles.header}
        >
          <View
            style={
              styles.headerCopy
            }
          >
            <Text
              style={
                styles.eyebrow
              }
            >
              BOOKING DETAILS
            </Text>

            <Text
              style={styles.title}
            >
              Booking
            </Text>

            <Text
              style={
                styles.bookingId
              }
            >
              {booking.id}
            </Text>
          </View>

          {onBack ? (
            <View
              style={
                styles.headerButton
              }
            >
              <AppButton
                title="Back"
                variant="secondary"
                onPress={
                  onBack
                }
              />
            </View>
          ) : null}
        </View>

        {error ? (
          <View
            style={
              styles.warningBox
            }
          >
            <Text
              style={
                styles.warningTitle
              }
            >
              Booking update notice
            </Text>

            <Text
              style={
                styles.warningText
              }
            >
              {error}
            </Text>
          </View>
        ) : null}

        <View
          style={
            styles.statusCard
          }
        >
          <View
            style={
              styles.statusHeader
            }
          >
            <Text
              style={
                styles.sectionEyebrow
              }
            >
              CURRENT STATUS
            </Text>

            <StatusBadge
              label={getBookingStatusLabel(
                booking.status,
              )}
              variant={getStatusVariant(
                booking.status,
              )}
            />
          </View>

          <Text
            style={
              styles.scheduleText
            }
          >
            {formatBookingDateTime(
              booking.scheduledStart,
            )}
          </Text>

          <Text
            style={
              styles.scheduleEndText
            }
          >
            Ends{' '}
            {formatBookingDateTime(
              booking.scheduledEnd,
            )}
          </Text>
        </View>

        {primaryAction ? (
          <View
            style={
              styles.primaryActionCard
            }
          >
            <Text
              style={
                styles.actionTitle
              }
            >
              Next worker action
            </Text>

            <Text
              style={
                styles.actionDescription
              }
            >
              {primaryAction.action ===
              'on_the_way'
                ? 'Start your journey to the customer location when you are ready.'
                : 'Mark that you have arrived at the customer location.'}
            </Text>

            <ActionButton
              title={
                primaryAction.title
              }
              disabled={
                actionLoading
              }
              onPress={() => {
                void runAction(
                  primaryAction.action,
                )
              }}
            />
          </View>
        ) : null}

        {booking.bookingType !==
          'recurring' &&
        booking.status ===
          'on_the_way' ? (
          <BookingChatPanel
            bookingId={booking.id}
            customerId={booking.customerId}
          />
        ) : null}

        {canCancel ? (
          <View
            style={
              styles.cancelAction
            }
          >
            <ActionButton
              title="Cancel Booking"
              variant="secondary"
              disabled={
                actionLoading
              }
              onPress={() => {
                confirmAction(
                  'cancel',
                  'Cancel booking',
                  'Are you sure you want to cancel this booking?',
                )
              }}
            />
          </View>
        ) : null}

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
            Schedule
          </Text>

          <View
            style={
              styles.card
            }
          >
            <View
              style={
                styles.infoRow
              }
            >
              <Text
                style={
                  styles.infoLabel
                }
              >
                Booking type
              </Text>

              <Text
                style={
                  styles.infoValue
                }
              >
                {getBookingTypeLabel(
                  booking.bookingType,
                )}
              </Text>
            </View>

            <View
              style={
                styles.infoDivider
              }
            />

            <View
              style={
                styles.infoRow
              }
            >
              <Text
                style={
                  styles.infoLabel
                }
              >
                Duration
              </Text>

              <Text
                style={
                  styles.infoValue
                }
              >
                {formatDuration(
                  booking,
                )}
              </Text>
            </View>

            {booking.bookingType ===
              'recurring' &&
            booking.scheduleStartDate &&
            booking.scheduleEndDate ? (
              <>
                <View
                  style={
                    styles.infoDivider
                  }
                />

                <View
                  style={
                    styles.infoRow
                  }
                >
                  <Text
                    style={
                      styles.infoLabel
                    }
                  >
                    Recurring period
                  </Text>

                  <Text
                    style={
                      styles.infoValue
                    }
                  >
                    {booking.scheduleStartDate}
                    {' → '}
                    {booking.scheduleEndDate}
                  </Text>
                </View>
              </>
            ) : null}
          </View>
        </View>

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
            Payment
          </Text>

          <View
            style={
              styles.card
            }
          >
            <View
              style={
                styles.amountRow
              }
            >
              <Text
                style={
                  styles.infoLabel
                }
              >
                Booking amount
              </Text>

              <Text
                style={
                  styles.amountValue
                }
              >
                {formatBookingAmount(
                  booking.totalAmount,
                  booking.currency,
                )}
              </Text>
            </View>

            <View
              style={
                styles.infoDivider
              }
            />

            <View
              style={
                styles.infoRow
              }
            >
              <Text
                style={
                  styles.infoLabel
                }
              >
                Working hours
              </Text>

              <Text
                style={
                  styles.infoValue
                }
              >
                {booking.totalWorkingHours !==
                null
                  ? `${booking.totalWorkingHours}h`
                  : '—'}
              </Text>
            </View>
          </View>
        </View>

        {booking.notes ? (
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
              Customer notes
            </Text>

            <View
              style={
                styles.notesCard
              }
            >
              <Text
                style={
                  styles.notesText
                }
              >
                {booking.notes}
              </Text>
            </View>
          </View>
        ) : null}

        {isActiveBookingStatus(
          booking.status,
        ) ? (
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
              Service progress
            </Text>

            <View
              style={
                styles.card
              }
            >
              <ProgressRow
                label="Journey started"
                value={
                  booking.journeyStartedAt
                }
              />

              <ProgressRow
                label="Arrived"
                value={
                  booking.arrivedAt
                }
              />

              <ProgressRow
                label="Started"
                value={
                  booking.startedAt
                }
              />

              <ProgressRow
                label="Completed"
                value={
                  booking.completedAt
                }
              />
            </View>

                        {booking.bookingType !== 'recurring' ? (
              <WorkerBookingOtpPanel
                booking={booking}
                onVerified={() => {
                  void loadBooking(true)
                }}
              />
            ) : null}
          </View>
        ) : null}

        {occurrences.length >
        0 ? (
          <View
            style={
              styles.section
            }
          >
            <View
              style={
                styles.sectionHeader
              }
            >
              <View>
                <Text
                  style={
                    styles.sectionTitle
                  }
                >
                  Scheduled occurrences
                </Text>

                <Text
                  style={
                    styles.sectionSubtitle
                  }
                >
                  {occurrences.length}{' '}
                  {occurrences.length ===
                  1
                    ? 'occurrence'
                    : 'occurrences'}
                </Text>
              </View>
            </View>

            {nextOccurrence ? (
              <View
                style={
                  styles.nextOccurrenceBox
                }
              >
                <Text
                  style={
                    styles.nextOccurrenceLabel
                  }
                >
                  NEXT OCCURRENCE
                </Text>

                <Text
                  style={
                    styles.nextOccurrenceDate
                  }
                >
                  {formatBookingDateTime(
                    nextOccurrence.scheduledStart,
                  )}
                </Text>

                <Text
                  style={
                    styles.nextOccurrenceStatus
                  }
                >
                  {getBookingStatusLabel(
                    nextOccurrence.status,
                  )}
                </Text>
              </View>
            ) : null}

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
                      styles.occurrenceCard
                    }
                  >
                    <View
                      style={
                        styles.occurrenceHeader
                      }
                    >
                      <View
                        style={
                          styles.occurrenceCopy
                        }
                      >
                        <Text
                          style={
                            styles.occurrenceIndex
                          }
                        >
                          Occurrence{' '}
                          {
                            occurrence.occurrenceIndex
                          }
                        </Text>

                        <Text
                          style={
                            styles.occurrenceDate
                          }
                        >
                          {formatBookingDateTime(
                            occurrence.scheduledStart,
                          )}
                        </Text>

                        <Text
                          style={
                            styles.occurrenceEnd
                          }
                        >
                          Ends{' '}
                          {formatBookingDateTime(
                            occurrence.scheduledEnd,
                          )}
                        </Text>
                      </View>

                      <StatusBadge
                        label={
                          occurrence.status
                            .replace(
                              /_/g,
                              ' ',
                            )
                            .replace(
                              /^./,
                              value =>
                                value.toUpperCase(),
                            )
                        }
                        variant={getOccurrenceVariant(
                          occurrence.status,
                        )}
                      />
                    </View>

                    {onOccurrencePress ? (
                      <AppButton
                        title="Open occurrence"
                        variant="secondary"
                        onPress={() => {
                          onOccurrencePress(
                            occurrence.id,
                          )
                        }}
                      />
                    ) : null}
                  </View>
                ),
              )}
            </View>
          </View>
        ) : null}

        <Text
          style={
            styles.footerText
          }
        >
          Booking data is loaded for the authenticated worker assignment only.
        </Text>
      </ScrollView>
    </ScreenContainer>
  )
}

function ProgressRow({
  label,
  value,
}: {
  label: string
  value: string | null
}) {
  return (
    <View
      style={
        styles.progressRow
      }
    >
      <Text
        style={
          styles.infoLabel
        }
      >
        {label}
      </Text>

      <Text
        style={
          styles.infoValue
        }
      >
        {value
          ? formatBookingDateTime(
              value,
            )
          : 'Pending'}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal:
      UI.spacing.xl,
    paddingTop:
      UI.spacing.xl,
    paddingBottom:
      UI.spacing.xxxl,
  },

  header: {
    flexDirection:
      'row',
    alignItems:
      'flex-start',
    marginBottom:
      UI.spacing.lg,
  },

  headerCopy: {
    flex: 1,
    paddingRight:
      UI.spacing.md,
  },

  headerButton: {
    width: 76,
  },

  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
    color:
      UI.colors.secondary,
  },

  title: {
    marginTop:
      UI.spacing.sm,
    fontSize:
      UI.typography.title,
    lineHeight: 30,
    fontWeight: '800',
    color:
      UI.colors.text,
  },

  bookingId: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.caption,
    color:
      UI.colors.textMuted,
  },

  warningBox: {
    marginBottom:
      UI.spacing.lg,
    padding:
      UI.spacing.md,
    borderRadius:
      UI.radius.md,
    backgroundColor:
      UI.colors.warningBackground,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },

  warningTitle: {
    fontSize:
      UI.typography.small,
    fontWeight: '800',
    color:
      UI.colors.warning,
  },

  warningText: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.small,
    lineHeight: 18,
    color:
      UI.colors.textSecondary,
  },

  statusCard: {
    padding:
      UI.spacing.xl,
    borderRadius:
      UI.radius.xl,
    backgroundColor:
      UI.colors.primary,
  },

  statusHeader: {
    flexDirection:
      'row',
    alignItems:
      'center',
    justifyContent:
      'space-between',
  },

  sectionEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    color:
      UI.colors.surface,
    opacity: 0.72,
  },

  scheduleText: {
    marginTop:
      UI.spacing.lg,
    fontSize:
      UI.typography.bodyLarge,
    lineHeight: 23,
    fontWeight: '800',
    color:
      UI.colors.surface,
  },

  scheduleEndText: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.small,
    color:
      UI.colors.surface,
    opacity: 0.72,
  },

  primaryActionCard: {
    marginTop:
      UI.spacing.lg,
    padding:
      UI.spacing.lg,
    borderRadius:
      UI.radius.lg,
    backgroundColor:
      UI.colors.infoBackground,
    borderWidth: 1,
    borderColor:
      UI.colors.info,
  },

  actionTitle: {
    fontSize:
      UI.typography.bodyLarge,
    fontWeight: '800',
    color:
      UI.colors.text,
  },

  actionDescription: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.small,
    lineHeight: 18,
    color:
      UI.colors.textSecondary,
  },

  actionButton: {
    marginTop:
      UI.spacing.md,
  },

  cancelAction: {
    marginTop:
      UI.spacing.sm,
  },

  section: {
    marginTop:
      UI.spacing.xl,
  },

  sectionHeader: {
    flexDirection:
      'row',
    alignItems:
      'center',
    justifyContent:
      'space-between',
  },

  sectionTitle: {
    fontSize:
      UI.typography.subtitle,
    lineHeight: 23,
    fontWeight: '800',
    color:
      UI.colors.text,
  },

  sectionSubtitle: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.small,
    color:
      UI.colors.textSecondary,
  },

  card: {
    marginTop:
      UI.spacing.md,
    padding:
      UI.spacing.lg,
    borderRadius:
      UI.radius.lg,
    backgroundColor:
      UI.colors.surface,
    borderWidth: 1,
    borderColor:
      UI.colors.border,
  },

  infoRow: {
    flexDirection:
      'row',
    alignItems:
      'flex-start',
    justifyContent:
      'space-between',
    gap: UI.spacing.md,
  },

  amountRow: {
    flexDirection:
      'row',
    alignItems:
      'center',
    justifyContent:
      'space-between',
    gap: UI.spacing.md,
  },

  infoLabel: {
    flex: 1,
    fontSize:
      UI.typography.small,
    color:
      UI.colors.textSecondary,
  },

  infoValue: {
    flex: 1,
    fontSize:
      UI.typography.small,
    fontWeight: '700',
    color:
      UI.colors.text,
    textAlign: 'right',
  },

  amountValue: {
    fontSize:
      UI.typography.bodyLarge,
    fontWeight: '900',
    color:
      UI.colors.text,
    textAlign: 'right',
  },

  infoDivider: {
    height: 1,
    marginVertical:
      UI.spacing.md,
    backgroundColor:
      UI.colors.border,
  },

  notesCard: {
    marginTop:
      UI.spacing.md,
    padding:
      UI.spacing.lg,
    borderRadius:
      UI.radius.lg,
    backgroundColor:
      UI.colors.background,
  },

  notesText: {
    fontSize:
      UI.typography.body,
    lineHeight: 21,
    color:
      UI.colors.textSecondary,
  },

  progressRow: {
    flexDirection:
      'row',
    alignItems:
      'flex-start',
    justifyContent:
      'space-between',
    paddingVertical:
      UI.spacing.sm,
    gap: UI.spacing.md,
  },

  otpBox: {
    marginTop:
      UI.spacing.md,
    padding:
      UI.spacing.md,
    borderRadius:
      UI.radius.md,
    backgroundColor:
      UI.colors.warningBackground,
    borderWidth: 1,
    borderColor:
      UI.colors.warning,
  },

  otpTitle: {
    fontSize:
      UI.typography.small,
    fontWeight: '800',
    color:
      UI.colors.warning,
  },

  otpText: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.small,
    lineHeight: 18,
    color:
      UI.colors.textSecondary,
  },

  nextOccurrenceBox: {
    marginTop:
      UI.spacing.md,
    padding:
      UI.spacing.lg,
    borderRadius:
      UI.radius.lg,
    backgroundColor:
      UI.colors.infoBackground,
    borderWidth: 1,
    borderColor:
      UI.colors.info,
  },

  nextOccurrenceLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    color:
      UI.colors.info,
  },

  nextOccurrenceDate: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.bodyLarge,
    fontWeight: '800',
    color:
      UI.colors.text,
  },

  nextOccurrenceStatus: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.small,
    color:
      UI.colors.textSecondary,
  },

  occurrenceList: {
    marginTop:
      UI.spacing.md,
    gap: UI.spacing.md,
  },

  occurrenceCard: {
    padding:
      UI.spacing.lg,
    borderRadius:
      UI.radius.lg,
    backgroundColor:
      UI.colors.surface,
    borderWidth: 1,
    borderColor:
      UI.colors.border,
  },

  occurrenceHeader: {
    flexDirection:
      'row',
    alignItems:
      'flex-start',
  },

  occurrenceCopy: {
    flex: 1,
    paddingRight:
      UI.spacing.md,
  },

  occurrenceIndex: {
    fontSize:
      UI.typography.caption,
    fontWeight: '700',
    color:
      UI.colors.textMuted,
  },

  occurrenceDate: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.bodyLarge,
    fontWeight: '800',
    color:
      UI.colors.text,
  },

  occurrenceEnd: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.small,
    color:
      UI.colors.textSecondary,
  },

  footerText: {
    marginTop:
      UI.spacing.xl,
    fontSize:
      UI.typography.caption,
    lineHeight: 16,
    color:
      UI.colors.textMuted,
    textAlign: 'center',
  },

  loadingContainer: {
    flex: 1,
    alignItems:
      'center',
    justifyContent:
      'center',
    paddingHorizontal:
      UI.spacing.xxl,
  },

  loadingTitle: {
    marginTop:
      UI.spacing.lg,
    fontSize:
      UI.typography.subtitle,
    fontWeight: '800',
    color:
      UI.colors.text,
    textAlign: 'center',
  },

  loadingText: {
    marginTop:
      UI.spacing.sm,
    fontSize:
      UI.typography.body,
    lineHeight: 20,
    color:
      UI.colors.textSecondary,
    textAlign: 'center',
  },
})
