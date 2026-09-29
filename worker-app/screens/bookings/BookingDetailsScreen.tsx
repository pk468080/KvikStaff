import {
  useCallback,
  useEffect,
  useState,
} from 'react'

import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import { Ionicons } from '@expo/vector-icons'

import { ScreenContainer } from '../../components/layout/ScreenContainer'
import ErrorState from '../../components/ui/ErrorState'
import StatusBadge from '../../components/ui/StatusBadge'
import { UI } from '../../constants/ui'

import {
  getWorkerBooking,
} from '../../services/bookings/workerBookings.service'

import {
  getWorkerBookingContext,
  type WorkerBookingContext,
} from '../../services/bookings/workerBookingContext.service'

import {
  getWorkerBookingOccurrencesForBooking,
} from '../../services/bookings/workerBookingOccurrences.service'

import {
  formatBookingAmount,
  formatBookingDate,
  formatBookingDateTime,
  getBookingDurationHours,
  getBookingStatusLabel,
  getBookingTypeLabel,
  getCompletedOccurrenceCount,
  getRemainingOccurrenceCount,
  isActiveBookingStatus,
} from '../../lib/workerBookingUtils'

import type {
  BookingStatus,
  WorkerBooking,
  WorkerBookingOccurrence,
} from '../../types/booking'

type BookingDetailsScreenProps = {
  bookingId: string
  onBack?: () => void
  onActiveBooking?: (
    bookingId: string,
  ) => void
  onOccurrencePress?: (
    occurrenceId: string,
  ) => void
}

function getStatusVariant(
  status: BookingStatus,
): 'default' | 'success' | 'warning' | 'error' | 'info' {
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

function getInitials(
  value: string | null | undefined,
): string {
  const normalized =
    value?.trim() ?? ''

  if (!normalized) {
    return 'CU'
  }

  const words =
    normalized
      .split(/\s+/)
      .filter(Boolean)

  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase()
  }

  return normalized
    .slice(0, 2)
    .toUpperCase()
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap
  label: string
  value: string
}) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}>
        <Ionicons
          name={icon}
          size={18}
          color={UI.colors.secondary}
        />
      </View>

      <View style={styles.infoCopy}>
        <Text style={styles.infoLabel}>
          {label}
        </Text>

        <Text
          style={styles.infoValue}
          numberOfLines={4}
        >
          {value}
        </Text>
      </View>
    </View>
  )
}

function InfoDivider() {
  return <View style={styles.infoDivider} />
}

function HistoryRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap
  label: string
  value: string | null
}) {
  const completed =
    Boolean(value)

  return (
    <View style={styles.historyRow}>
      <View
        style={[
          styles.historyIcon,
          completed &&
            styles.historyIconComplete,
        ]}
      >
        <Ionicons
          name={icon}
          size={18}
          color={
            completed
              ? UI.colors.success
              : UI.colors.textMuted
          }
        />
      </View>

      <View style={styles.historyCopy}>
        <Text style={styles.historyLabel}>
          {label}
        </Text>

        <Text
          style={[
            styles.historyValue,
            completed &&
              styles.historyValueComplete,
          ]}
        >
          {value
            ? formatBookingDateTime(value)
            : 'Not recorded'}
        </Text>
      </View>
    </View>
  )
}

function occurrenceStatusVariant(
  status: WorkerBookingOccurrence['status'],
): 'default' | 'success' | 'warning' | 'error' | 'info' {
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

export default function BookingDetailsScreen({
  bookingId,
  onBack,
  onActiveBooking,
  onOccurrencePress,
}: BookingDetailsScreenProps) {
  const [booking, setBooking] =
    useState<WorkerBooking | null>(null)

  const [context, setContext] =
    useState<WorkerBookingContext | null>(null)

  const [occurrences, setOccurrences] =
    useState<WorkerBookingOccurrence[]>([])

  const [loading, setLoading] =
    useState(true)

  const [refreshing, setRefreshing] =
    useState(false)

  const [error, setError] =
    useState<string | null>(null)

  const [contextError, setContextError] =
    useState<string | null>(null)

  const loadBooking =
    useCallback(
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

          /*
           * Defence in depth:
           * active jobs always belong on the operational
           * screen, even when a stale/deep link opens this
           * historical screen.
           */
          if (
            isActiveBookingStatus(
              nextBooking.status,
            )
          ) {
            onActiveBooking?.(
              nextBooking.id,
            )

            return
          }

          setBooking(
            nextBooking,
          )

          const nextOccurrences =
            nextBooking.bookingType ===
            'recurring'
              ? await getWorkerBookingOccurrencesForBooking(
                  nextBooking.id,
                )
              : []

          setOccurrences(
            nextOccurrences,
          )

          try {
            const nextContext =
              await getWorkerBookingContext(
                nextBooking.id,
              )

            setContext(
              nextContext,
            )

            setContextError(
              null,
            )
          } catch (cause) {
            setContext(null)

            setContextError(
              cause instanceof Error
                ? cause.message
                : 'Customer and service details are unavailable.',
            )
          }
        } catch (cause) {
          setError(
            cause instanceof Error
              ? cause.message
              : 'Unable to load booking history.',
          )
        } finally {
          setLoading(false)
          setRefreshing(false)
        }
      },
      [
        bookingId,
        onActiveBooking,
      ],
    )

  useEffect(() => {
    void loadBooking()
  }, [
    loadBooking,
  ])

  if (loading) {
    return (
      <ScreenContainer>
        <View style={styles.loadingContainer}>
          <ActivityIndicator
            size="large"
            color={UI.colors.secondary}
          />

          <Text style={styles.loadingTitle}>
            Loading booking history
          </Text>

          <Text style={styles.loadingText}>
            Loading the recorded details for this job.
          </Text>
        </View>
      </ScreenContainer>
    )
  }

  if (error && !booking) {
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
          message="The requested booking history could not be loaded."
          onAction={() => {
            void loadBooking()
          }}
        />
      </ScreenContainer>
    )
  }

  const customerName =
    context?.customerName ??
    'Customer'

  const serviceName =
    context?.serviceName ??
    'Service details unavailable'

  const variantName =
    context?.variantName ??
    null

  const addressLabel =
    context?.addressLabel ??
    'Service location'

  const addressLine =
    context?.addressLine ??
    'Service location not available'

  const completed =
    booking.status ===
    'completed'

  const cancelled =
    booking.status ===
      'cancelled' ||
    booking.status ===
      'expired'

  const completedOccurrences =
    getCompletedOccurrenceCount(
      occurrences,
    )

  const remainingOccurrences =
    getRemainingOccurrenceCount(
      occurrences,
    )

  return (
    <ScreenContainer>
      <ScrollView
        contentContainerStyle={
          styles.content
        }
        refreshControl={
          <RefreshControl
            refreshing={
              refreshing
            }
            onRefresh={() => {
              void loadBooking(
                true,
              )
            }}
            tintColor={
              UI.colors.secondary
            }
          />
        }
        showsVerticalScrollIndicator={
          false
        }
      >
        <View style={styles.topBar}>
          {onBack ? (
            <Pressable
              onPress={onBack}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              hitSlop={8}
              style={({ pressed }) => [
                styles.headerButton,
                pressed &&
                  styles.headerButtonPressed,
              ]}
            >
              <Ionicons
                name="arrow-back"
                size={21}
                color={
                  UI.colors.primary
                }
              />
            </Pressable>
          ) : (
            <View
              style={
                styles.headerPlaceholder
              }
            />
          )}

          <View
            style={styles.topBarCenter}
          >
            <Text
              style={styles.topBarEyebrow}
            >
              TEMPSTAFF
            </Text>

            <Text
              style={styles.topBarTitle}
            >
              Booking history
            </Text>
          </View>

          <Pressable
            onPress={() => {
              void loadBooking(
                true,
              )
            }}
            disabled={refreshing}
            accessibilityRole="button"
            accessibilityLabel="Refresh booking history"
            hitSlop={8}
            style={({ pressed }) => [
              styles.headerButton,
              pressed &&
                styles.headerButtonPressed,
            ]}
          >
            <Ionicons
              name="refresh"
              size={20}
              color={
                UI.colors.primary
              }
            />
          </Pressable>
        </View>

        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View
              style={styles.customerAvatar}
            >
              <Text
                style={
                  styles.customerAvatarText
                }
              >
                {getInitials(
                  customerName,
                )}
              </Text>
            </View>

            <StatusBadge
              label={getBookingStatusLabel(
                booking.status,
              )}
              variant={getStatusVariant(
                booking.status,
              )}
            />
          </View>

          <Text style={styles.heroEyebrow}>
            RECORDED JOB
          </Text>

          <Text style={styles.heroTitle}>
            {serviceName}
          </Text>

          <Text style={styles.heroMeta}>
            {variantName
              ? `${variantName} · `
              : ''}
            {formatBookingDate(
              booking.scheduledStart,
            )}
          </Text>

          <View style={styles.heroFooter}>
            <View>
              <Text style={styles.heroLabel}>
                BOOKING VALUE
              </Text>

              <Text style={styles.heroAmount}>
                {formatBookingAmount(
                  booking.totalAmount,
                  booking.currency,
                )}
              </Text>
            </View>

            <View
              style={
                styles.heroStatusCopy
              }
            >
              <Text style={styles.heroLabel}>
                BOOKING TYPE
              </Text>

              <Text
                style={
                  styles.heroStatusValue
                }
              >
                {getBookingTypeLabel(
                  booking.bookingType,
                )}
              </Text>
            </View>
          </View>
        </View>

        {error ? (
          <View style={styles.warningBox}>
            <Ionicons
              name="alert-circle-outline"
              size={19}
              color={
                UI.colors.warning
              }
            />

            <Text style={styles.warningText}>
              {error}
            </Text>
          </View>
        ) : null}

        {contextError ? (
          <View style={styles.infoBox}>
            <Ionicons
              name="information-circle-outline"
              size={19}
              color={
                UI.colors.info
              }
            />

            <Text style={styles.infoText}>
              Customer or service details could not be loaded. Pull to refresh.
            </Text>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>
            CUSTOMER
          </Text>

          <Text style={styles.sectionTitle}>
            Booking contact
          </Text>

          <View style={styles.customerCard}>
            <View
              style={styles.customerIcon}
            >
              <Ionicons
                name="person-outline"
                size={21}
                color={
                  UI.colors.secondary
                }
              />
            </View>

            <View
              style={styles.customerCopy}
            >
              <Text
                style={styles.customerName}
              >
                {customerName}
              </Text>

              <Text
                style={
                  styles.customerSubtitle
                }
              >
                Historical booking information only. No customer phone number is displayed here.
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>
            SERVICE
          </Text>

          <Text style={styles.sectionTitle}>
            What was delivered
          </Text>

          <View style={styles.infoCard}>
            <InfoRow
              icon="briefcase-outline"
              label="Service"
              value={
                serviceName
              }
            />

            {variantName ? (
              <>
                <InfoDivider />

                <InfoRow
                  icon="layers-outline"
                  label="Variant"
                  value={
                    variantName
                  }
                />
              </>
            ) : null}

            <InfoDivider />

            <InfoRow
              icon="calendar-outline"
              label="Booking type"
              value={
                getBookingTypeLabel(
                  booking.bookingType,
                )
              }
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>
            SERVICE LOCATION
          </Text>

          <Text style={styles.sectionTitle}>
            Recorded service location
          </Text>

          <View style={styles.locationCard}>
            <View
              style={
                styles.locationIcon
              }
            >
              <Ionicons
                name="location-outline"
                size={22}
                color={
                  UI.colors.secondary
                }
              />
            </View>

            <View
              style={
                styles.locationCopy
              }
            >
              <Text
                style={
                  styles.locationLabel
                }
              >
                {addressLabel}
              </Text>

              <Text
                style={
                  styles.locationAddress
                }
              >
                {addressLine}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>
            SCHEDULE
          </Text>

          <Text style={styles.sectionTitle}>
            Recorded booking timing
          </Text>

          <View style={styles.infoCard}>
            <InfoRow
              icon="calendar-outline"
              label="Scheduled start"
              value={
                formatBookingDateTime(
                  booking.scheduledStart,
                )
              }
            />

            <InfoDivider />

            <InfoRow
              icon="timer-outline"
              label="Duration"
              value={formatDuration(
                booking,
              )}
            />

            <InfoDivider />

            <InfoRow
              icon="stopwatch-outline"
              label="Scheduled end"
              value={
                formatBookingDateTime(
                  booking.scheduledEnd,
                )
              }
            />

            {booking.scheduleStartDate &&
            booking.scheduleEndDate ? (
              <>
                <InfoDivider />

                <InfoRow
                  icon="repeat-outline"
                  label="Recurring period"
                  value={`${booking.scheduleStartDate} → ${booking.scheduleEndDate}`}
                />
              </>
            ) : null}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>
            OUTCOME
          </Text>

          <Text style={styles.sectionTitle}>
            Recorded result
          </Text>

          <View style={styles.outcomeCard}>
            <View
              style={styles.outcomeIcon}
            >
              <Ionicons
                name={
                  completed
                    ? 'checkmark-done-outline'
                    : cancelled
                      ? 'close-outline'
                      : 'document-text-outline'
                }
                size={25}
                color={
                  completed
                    ? UI.colors.success
                    : cancelled
                      ? UI.colors.error
                      : UI.colors.info
                }
              />
            </View>

            <View
              style={styles.outcomeCopy}
            >
              <Text
                style={styles.outcomeTitle}
              >
                {completed
                  ? 'Service completed'
                  : cancelled
                    ? 'Booking closed'
                    : 'Booking recorded'}
              </Text>

              <Text
                style={styles.outcomeText}
              >
                {completed &&
                booking.completedAt
                  ? `Completed ${formatBookingDateTime(booking.completedAt)}.`
                  : cancelled
                    ? 'This booking is no longer active.'
                    : `Current status: ${getBookingStatusLabel(booking.status)}.`}
              </Text>
            </View>
          </View>

          <View style={styles.infoCard}>
            <InfoRow
              icon="cash-outline"
              label="Booking value"
              value={formatBookingAmount(
                booking.totalAmount,
                booking.currency,
              )}
            />

            <InfoDivider />

            <InfoRow
              icon="time-outline"
              label="Working hours"
              value={
                booking.totalWorkingHours !==
                null
                  ? `${booking.totalWorkingHours}h`
                  : 'Not recorded'
              }
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>
            JOB HISTORY
          </Text>

          <Text style={styles.sectionTitle}>
            Lifecycle timestamps
          </Text>

          <View style={styles.historyCard}>
            <HistoryRow
              icon="person-add-outline"
              label="Worker accepted"
              value={
                booking.workerAcceptedAt
              }
            />

            <HistoryRow
              icon="navigate-outline"
              label="Journey started"
              value={
                booking.journeyStartedAt
              }
            />

            <HistoryRow
              icon="location-outline"
              label="Arrived"
              value={
                booking.arrivedAt
              }
            />

            <HistoryRow
              icon="play-circle-outline"
              label="Service started"
              value={
                booking.startedAt
              }
            />

            <HistoryRow
              icon="checkmark-circle-outline"
              label="Completed"
              value={
                booking.completedAt
              }
            />
          </View>
        </View>

        {booking.notes ? (
          <View style={styles.section}>
            <Text style={styles.sectionEyebrow}>
              CUSTOMER NOTES
            </Text>

            <Text style={styles.sectionTitle}>
              Saved instructions
            </Text>

            <View style={styles.notesCard}>
              <Ionicons
                name="document-text-outline"
                size={20}
                color={
                  UI.colors.secondary
                }
              />

              <Text style={styles.notesText}>
                {booking.notes}
              </Text>
            </View>
          </View>
        ) : null}

        {occurrences.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionEyebrow}>
              RECURRING HISTORY
            </Text>

            <Text style={styles.sectionTitle}>
              Recorded occurrences
            </Text>

            <Text
              style={
                styles.sectionSubtitle
              }
            >
              {completedOccurrences}{' '}
              completed · {remainingOccurrences}{' '}
              open or cancelled
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
                      styles.occurrenceCard
                    }
                  >
                    <View
                      style={
                        styles.occurrenceTop
                      }
                    >
                      <View
                        style={
                          styles.occurrenceIcon
                        }
                      >
                        <Ionicons
                          name="calendar-outline"
                          size={19}
                          color={
                            UI.colors.secondary
                          }
                        />
                      </View>

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
                        label={getBookingStatusLabel(
                          occurrence.status,
                        )}
                        variant={occurrenceStatusVariant(
                          occurrence.status,
                        )}
                      />
                    </View>

                    {onOccurrencePress ? (
                      <Pressable
                        onPress={() => {
                          onOccurrencePress(
                            occurrence.id,
                          )
                        }}
                        accessibilityRole="button"
                        accessibilityLabel="Open booking occurrence"
                        style={({ pressed }) => [
                          styles.occurrenceAction,
                          pressed &&
                            styles.occurrenceActionPressed,
                        ]}
                      >
                        <Text
                          style={
                            styles.occurrenceActionText
                          }
                        >
                          View occurrence
                        </Text>

                        <Ionicons
                          name="chevron-forward"
                          size={17}
                          color={
                            UI.colors.secondary
                          }
                        />
                      </Pressable>
                    ) : null}
                  </View>
                ),
              )}
            </View>
          </View>
        ) : null}

        <Text style={styles.footerText}>
          TempStaff booking history
        </Text>

        <View style={styles.bottomSpacing} />
      </ScrollView>
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal:
      UI.spacing.lg,
    paddingTop:
      UI.spacing.md,
    paddingBottom:
      UI.spacing.xxxl,
  },

  topBar: {
    minHeight: 44,
    flexDirection:
      'row',
    alignItems:
      'center',
    justifyContent:
      'space-between',
  },

  headerButton: {
    width: 44,
    height: 44,
    borderRadius:
      UI.radius.pill,
    alignItems:
      'center',
    justifyContent:
      'center',
    backgroundColor:
      UI.colors.surface,
    borderWidth: 1,
    borderColor:
      UI.colors.border,
  },

  headerPlaceholder: {
    width: 44,
    height: 44,
  },

  headerButtonPressed: {
    opacity: 0.7,
  },

  topBarCenter: {
    alignItems:
      'center',
  },

  topBarEyebrow: {
    fontSize: 9,
    fontWeight:
      '800',
    letterSpacing: 1,
    color:
      UI.colors.secondary,
  },

  topBarTitle: {
    marginTop: 2,
    fontSize:
      UI.typography.bodyLarge,
    fontWeight:
      '900',
    color:
      UI.colors.text,
  },

  heroCard: {
    marginTop:
      UI.spacing.lg,
    padding:
      UI.spacing.xl,
    borderRadius:
      UI.radius.xl,
    backgroundColor:
      UI.colors.primary,
  },

  heroTop: {
    flexDirection:
      'row',
    alignItems:
      'center',
    justifyContent:
      'space-between',
  },

  customerAvatar: {
    width: 56,
    height: 56,
    borderRadius:
      UI.radius.lg,
    alignItems:
      'center',
    justifyContent:
      'center',
    backgroundColor:
      UI.colors.surface,
  },

  customerAvatarText: {
    fontSize: 18,
    fontWeight:
      '900',
    color:
      UI.colors.primary,
  },

  heroEyebrow: {
    marginTop:
      UI.spacing.xl,
    fontSize: 10,
    fontWeight:
      '800',
    letterSpacing:
      1.1,
    color:
      UI.colors.surface,
    opacity:
      0.7,
  },

  heroTitle: {
    marginTop:
      UI.spacing.sm,
    fontSize: 26,
    lineHeight:
      32,
    fontWeight:
      '900',
    color:
      UI.colors.surface,
  },

  heroMeta: {
    marginTop:
      UI.spacing.sm,
    fontSize:
      UI.typography.body,
    lineHeight:
      20,
    color:
      UI.colors.surface,
    opacity:
      0.78,
  },

  heroFooter: {
    marginTop:
      UI.spacing.xl,
    paddingTop:
      UI.spacing.md,
    borderTopWidth:
      1,
    borderTopColor:
      'rgba(255,255,255,0.14)',
    flexDirection:
      'row',
    alignItems:
      'flex-end',
    justifyContent:
      'space-between',
  },

  heroLabel: {
    fontSize: 9,
    fontWeight:
      '800',
    letterSpacing:
      0.8,
    color:
      UI.colors.surface,
    opacity:
      0.64,
  },

  heroAmount: {
    marginTop:
      3,
    fontSize:
      20,
    fontWeight:
      '900',
    color:
      UI.colors.surface,
  },

  heroStatusCopy: {
    alignItems:
      'flex-end',
    maxWidth:
      '52%',
  },

  heroStatusValue: {
    marginTop:
      3,
    fontSize:
      UI.typography.small,
    fontWeight:
      '800',
    color:
      UI.colors.surface,
    textAlign:
      'right',
  },

  warningBox: {
    marginTop:
      UI.spacing.lg,
    padding:
      UI.spacing.md,
    borderRadius:
      UI.radius.lg,
    flexDirection:
      'row',
    alignItems:
      'flex-start',
    backgroundColor:
      UI.colors.warningBackground,
    borderWidth:
      1,
    borderColor:
      '#FDE68A',
  },

  warningText: {
    flex: 1,
    marginLeft:
      UI.spacing.sm,
    fontSize:
      UI.typography.small,
    lineHeight:
      18,
    color:
      UI.colors.textSecondary,
  },

  infoBox: {
    marginTop:
      UI.spacing.lg,
    padding:
      UI.spacing.md,
    borderRadius:
      UI.radius.lg,
    flexDirection:
      'row',
    alignItems:
      'flex-start',
    backgroundColor:
      UI.colors.infoBackground,
    borderWidth:
      1,
    borderColor:
      UI.colors.border,
  },

  infoText: {
    flex: 1,
    marginLeft:
      UI.spacing.sm,
    fontSize:
      UI.typography.small,
    lineHeight:
      18,
    color:
      UI.colors.textSecondary,
  },

  section: {
    marginTop:
      UI.spacing.xxl,
  },

  sectionEyebrow: {
    fontSize: 10,
    fontWeight:
      '800',
    letterSpacing:
      1.05,
    color:
      UI.colors.secondary,
  },

  sectionTitle: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.subtitle,
    lineHeight:
      24,
    fontWeight:
      '800',
    color:
      UI.colors.text,
  },

  sectionSubtitle: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.small,
    lineHeight:
      18,
    color:
      UI.colors.textSecondary,
  },

  customerCard: {
    marginTop:
      UI.spacing.md,
    padding:
      UI.spacing.lg,
    borderRadius:
      UI.radius.xl,
    flexDirection:
      'row',
    alignItems:
      'flex-start',
    backgroundColor:
      UI.colors.surface,
    borderWidth:
      1,
    borderColor:
      UI.colors.border,
  },

  customerIcon: {
    width: 44,
    height: 44,
    borderRadius:
      UI.radius.lg,
    alignItems:
      'center',
    justifyContent:
      'center',
    backgroundColor:
      UI.colors.infoBackground,
  },

  customerCopy: {
    flex: 1,
    marginLeft:
      UI.spacing.md,
  },

  customerName: {
    fontSize:
      UI.typography.bodyLarge,
    fontWeight:
      '800',
    color:
      UI.colors.text,
  },

  customerSubtitle: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.small,
    lineHeight:
      18,
    color:
      UI.colors.textSecondary,
  },

  infoCard: {
    marginTop:
      UI.spacing.md,
    paddingHorizontal:
      UI.spacing.lg,
    paddingVertical:
      UI.spacing.sm,
    borderRadius:
      UI.radius.xl,
    backgroundColor:
      UI.colors.surface,
    borderWidth:
      1,
    borderColor:
      UI.colors.border,
  },

  infoRow: {
    flexDirection:
      'row',
    alignItems:
      'center',
    paddingVertical:
      UI.spacing.md,
  },

  infoIcon: {
    width: 38,
    height: 38,
    borderRadius:
      UI.radius.md,
    alignItems:
      'center',
    justifyContent:
      'center',
    backgroundColor:
      UI.colors.infoBackground,
  },

  infoCopy: {
    flex: 1,
    marginLeft:
      UI.spacing.md,
  },

  infoLabel: {
    fontSize:
      UI.typography.caption,
    color:
      UI.colors.textMuted,
  },

  infoValue: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.small,
    fontWeight:
      '800',
    color:
      UI.colors.text,
  },

  infoDivider: {
    height:
      1,
    backgroundColor:
      UI.colors.border,
  },

  locationCard: {
    marginTop:
      UI.spacing.md,
    padding:
      UI.spacing.lg,
    borderRadius:
      UI.radius.xl,
    flexDirection:
      'row',
    alignItems:
      'flex-start',
    backgroundColor:
      UI.colors.surface,
    borderWidth:
      1,
    borderColor:
      UI.colors.border,
  },

  locationIcon: {
    width: 44,
    height: 44,
    borderRadius:
      UI.radius.lg,
    alignItems:
      'center',
    justifyContent:
      'center',
    backgroundColor:
      UI.colors.infoBackground,
  },

  locationCopy: {
    flex: 1,
    marginLeft:
      UI.spacing.md,
  },

  locationLabel: {
    fontSize:
      UI.typography.small,
    fontWeight:
      '800',
    color:
      UI.colors.secondary,
  },

  locationAddress: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.body,
    lineHeight:
      21,
    color:
      UI.colors.text,
  },

  outcomeCard: {
    marginTop:
      UI.spacing.md,
    padding:
      UI.spacing.lg,
    borderRadius:
      UI.radius.xl,
    flexDirection:
      'row',
    alignItems:
      'flex-start',
    backgroundColor:
      UI.colors.surface,
    borderWidth:
      1,
    borderColor:
      UI.colors.border,
  },

  outcomeIcon: {
    width: 48,
    height: 48,
    borderRadius:
      UI.radius.lg,
    alignItems:
      'center',
    justifyContent:
      'center',
    backgroundColor:
      UI.colors.successBackground,
  },

  outcomeCopy: {
    flex: 1,
    marginLeft:
      UI.spacing.md,
  },

  outcomeTitle: {
    fontSize:
      UI.typography.bodyLarge,
    fontWeight:
      '900',
    color:
      UI.colors.text,
  },

  outcomeText: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.small,
    lineHeight:
      19,
    color:
      UI.colors.textSecondary,
  },

  historyCard: {
    marginTop:
      UI.spacing.md,
    paddingHorizontal:
      UI.spacing.lg,
    paddingVertical:
      UI.spacing.sm,
    borderRadius:
      UI.radius.xl,
    backgroundColor:
      UI.colors.surface,
    borderWidth:
      1,
    borderColor:
      UI.colors.border,
  },

  historyRow: {
    flexDirection:
      'row',
    alignItems:
      'center',
    paddingVertical:
      UI.spacing.md,
  },

  historyIcon: {
    width: 40,
    height: 40,
    borderRadius:
      UI.radius.pill,
    alignItems:
      'center',
    justifyContent:
      'center',
    backgroundColor:
      UI.colors.background,
  },

  historyIconComplete: {
    backgroundColor:
      UI.colors.successBackground,
  },

  historyCopy: {
    flex: 1,
    marginLeft:
      UI.spacing.md,
  },

  historyLabel: {
    fontSize:
      UI.typography.small,
    fontWeight:
      '700',
    color:
      UI.colors.text,
  },

  historyValue: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.caption,
    color:
      UI.colors.textMuted,
  },

  historyValueComplete: {
    color:
      UI.colors.success,
  },

  notesCard: {
    marginTop:
      UI.spacing.md,
    padding:
      UI.spacing.lg,
    borderRadius:
      UI.radius.xl,
    flexDirection:
      'row',
    alignItems:
      'flex-start',
    backgroundColor:
      UI.colors.background,
    borderWidth:
      1,
    borderColor:
      UI.colors.border,
  },

  notesText: {
    flex: 1,
    marginLeft:
      UI.spacing.sm,
    fontSize:
      UI.typography.body,
    lineHeight:
      21,
    color:
      UI.colors.text,
  },

  occurrenceList: {
    marginTop:
      UI.spacing.md,
  },

  occurrenceCard: {
    marginBottom:
      UI.spacing.md,
    padding:
      UI.spacing.lg,
    borderRadius:
      UI.radius.xl,
    backgroundColor:
      UI.colors.surface,
    borderWidth:
      1,
    borderColor:
      UI.colors.border,
  },

  occurrenceTop: {
    flexDirection:
      'row',
    alignItems:
      'flex-start',
  },

  occurrenceIcon: {
    width: 40,
    height: 40,
    borderRadius:
      UI.radius.md,
    alignItems:
      'center',
    justifyContent:
      'center',
    backgroundColor:
      UI.colors.infoBackground,
  },

  occurrenceCopy: {
    flex: 1,
    marginLeft:
      UI.spacing.md,
    paddingRight:
      UI.spacing.sm,
  },

  occurrenceIndex: {
    fontSize:
      UI.typography.caption,
    fontWeight:
      '700',
    color:
      UI.colors.textMuted,
  },

  occurrenceDate: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.bodyLarge,
    fontWeight:
      '800',
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

  occurrenceAction: {
    marginTop:
      UI.spacing.md,
    paddingTop:
      UI.spacing.md,
    flexDirection:
      'row',
    alignItems:
      'center',
    justifyContent:
      'flex-end',
    borderTopWidth:
      1,
    borderTopColor:
      UI.colors.border,
  },

  occurrenceActionPressed: {
    opacity:
      0.7,
  },

  occurrenceActionText: {
    marginRight:
      UI.spacing.xs,
    fontSize:
      UI.typography.small,
    fontWeight:
      '800',
    color:
      UI.colors.secondary,
  },

  footerText: {
    marginTop:
      UI.spacing.xl,
    fontSize:
      UI.typography.caption,
    color:
      UI.colors.textMuted,
    textAlign:
      'center',
  },

  bottomSpacing: {
    height:
      UI.spacing.xxl,
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
    fontWeight:
      '800',
    color:
      UI.colors.text,
    textAlign:
      'center',
  },

  loadingText: {
    marginTop:
      UI.spacing.sm,
    maxWidth:
      300,
    fontSize:
      UI.typography.body,
    lineHeight:
      20,
    color:
      UI.colors.textSecondary,
    textAlign:
      'center',
  },
})
