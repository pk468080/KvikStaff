import {
  useMemo,
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

import {
  Ionicons,
} from '@expo/vector-icons'

import {
  ScreenContainer,
} from '../../components/layout/ScreenContainer'

import EmptyState from '../../components/ui/EmptyState'

import ErrorState from '../../components/ui/ErrorState'

import StatusBadge from '../../components/ui/StatusBadge';


import {
  UI,
} from '../../constants/ui'

import {
  useWorkerBookings,
} from '../../hooks/useWorkerBookings'

import {
  formatBookingAmount,
  formatBookingDateTime,
  getBookingDurationHours,
  getBookingStatusLabel,
  getBookingTypeLabel,
  isActiveBookingStatus,
} from '../../lib/workerBookingUtils'

import type {
  BookingStatus,
  WorkerBooking,
} from '../../types/booking'

type WorkerBookingsScreenProps = {
  onBookingPress?: (
    bookingId: string,
  ) => void
  onBack?: () => void
}

type BookingFilter =
  | 'all'
  | 'active'
  | 'upcoming'
  | 'completed'
  | 'cancelled'

const FILTERS: Array<{
  key: BookingFilter
  label: string
}> = [
  {
    key: 'all',
    label: 'All',
  },
  {
    key: 'active',
    label: 'Active',
  },
  {
    key: 'upcoming',
    label: 'Upcoming',
  },
  {
    key: 'completed',
    label: 'Completed',
  },
  {
    key: 'cancelled',
    label: 'Cancelled',
  },
]

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

function isUpcomingBooking(
  booking: WorkerBooking,
): boolean {
  if (
    booking.status ===
      'completed' ||
    booking.status ===
      'cancelled' ||
    booking.status ===
      'expired' ||
    booking.status ===
      'payment_failed'
  ) {
    return false
  }

  if (
    isActiveBookingStatus(
      booking.status,
    )
  ) {
    return true
  }

  const timestamp = new Date(
    booking.scheduledStart,
  ).getTime()

  return (
    Number.isFinite(
      timestamp,
    ) &&
    timestamp >=
      Date.now()
  )
}

function matchesFilter(
  booking: WorkerBooking,
  filter: BookingFilter,
): boolean {
  switch (filter) {
    case 'active':
      return isActiveBookingStatus(
        booking.status,
      )

    case 'upcoming':
      return isUpcomingBooking(
        booking,
      )

    case 'completed':
      return (
        booking.status ===
        'completed'
      )

    case 'cancelled':
      return (
        booking.status ===
          'cancelled' ||
        booking.status ===
          'expired'
      )

    case 'all':
    default:
      return true
  }
}

function sortBookings(
  bookings: WorkerBooking[],
): WorkerBooking[] {
  return [
    ...bookings,
  ].sort(
    (a, b) => {
      return (
        new Date(
          a.scheduledStart,
        ).getTime() -
        new Date(
          b.scheduledStart,
        ).getTime()
      )
    },
  )
}

function getJobIcon(
  booking: WorkerBooking,
): keyof typeof Ionicons.glyphMap {
  if (
    isActiveBookingStatus(
      booking.status,
    )
  ) {
    return 'briefcase'
  }

  switch (booking.status) {
    case 'completed':
      return 'checkmark-circle'

    case 'cancelled':
    case 'expired':
    case 'payment_failed':
      return 'close-circle'

    default:
      return 'calendar'
  }
}

function getFilterDescription(
  filter: BookingFilter,
): string {
  switch (filter) {
    case 'active':
      return 'Jobs you are currently working on'
    case 'upcoming':
      return 'Your scheduled assignments'
    case 'completed':
      return 'Jobs you have completed'
    case 'cancelled':
      return 'Cancelled or expired jobs'
    case 'all':
    default:
      return 'All assignments linked to your account'
  }
}

export default function WorkerBookingsScreen({
  onBookingPress,
  onBack,
}: WorkerBookingsScreenProps) {
  const {
    bookings,
    loading,
    error,
    refresh,
  } = useWorkerBookings()

  const [
    filter,
    setFilter,
  ] = useState<BookingFilter>(
    'all',
  )

  const filteredBookings =
    useMemo(
      () => {
        const filtered =
          bookings.filter(
            booking =>
              matchesFilter(
                booking,
                filter,
              ),
          )

        return sortBookings(
          filtered,
        )
      },
      [
        bookings,
        filter,
      ],
    )

  const counts =
    useMemo(
      () => ({
        all: bookings.length,

        active:
          bookings.filter(
            booking =>
              matchesFilter(
                booking,
                'active',
              ),
          ).length,

        upcoming:
          bookings.filter(
            booking =>
              matchesFilter(
                booking,
                'upcoming',
              ),
          ).length,

        completed:
          bookings.filter(
            booking =>
              matchesFilter(
                booking,
                'completed',
              ),
          ).length,

        cancelled:
          bookings.filter(
            booking =>
              matchesFilter(
                booking,
                'cancelled',
              ),
          ).length,
      }),
      [bookings],
    )

  function handleRefresh() {
    void refresh()
  }

  if (
    loading &&
    bookings.length === 0
  ) {
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
              UI.colors.primaryBlue
            }
          />

          <Text
            style={
              styles.loadingTitle
            }
          >
            Loading your jobs
          </Text>

          <Text
            style={
              styles.loadingText
            }
          >
            Fetching your latest worker assignments...
          </Text>
        </View>
      </ScreenContainer>
    )
  }

  if (
    error &&
    bookings.length === 0
  ) {
    return (
      <ScreenContainer>
        <ErrorState
          title="Jobs unavailable"
          message={error}
          onAction={
            handleRefresh
          }
        />
      </ScreenContainer>
    )
  }

  return (
    <ScreenContainer>
      <ScrollView
        contentContainerStyle={
          styles.content
        }
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={
              handleRefresh
            }
            tintColor={
              UI.colors.primaryBlue
            }
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
              YOUR WORK
            </Text>

            <Text
              style={styles.title}
            >
              My Jobs
            </Text>

            <Text
              style={
                styles.subtitle
              }
            >
              Track assigned, scheduled and completed work in one place.
            </Text>
          </View>

          {onBack ? (
            <Pressable
              onPress={
                onBack
              }
              accessibilityRole="button"
              accessibilityLabel="Go back"
              hitSlop={8}
              style={({ pressed }) => [
                styles.headerIconButton,
                pressed &&
                  styles.headerIconPressed,
              ]}
            >
              <Ionicons
                name="arrow-back"
                size={22}
                color={
                  UI.colors.primary
                }
              />
            </Pressable>
          ) : null}
        </View>

        {error ? (
          <View
            style={
              styles.warningBox
            }
          >
            <View
              style={
                styles.warningIcon
              }
            >
              <Ionicons
                name="alert-circle-outline"
                size={17}
                color={
                  UI.colors.warning
                }
              />
            </View>

            <View
              style={
                styles.warningCopy
              }
            >
              <Text
                style={
                  styles.warningTitle
                }
              >
                Jobs update notice
              </Text>

              <Text
                style={
                  styles.warningText
                }
              >
                {error}
              </Text>
            </View>
          </View>
        ) : null}

        <View
          style={
            styles.filterHeader
          }
        >
          <View
            style={
              styles.filterHeaderCopy
            }
          >
            <Text
              style={
                styles.filterTitle
              }
            >
              Job status
            </Text>

            <Text
              style={
                styles.filterSubtitle
              }
            >
              {getFilterDescription(
                filter,
              )}
            </Text>
          </View>

          <View
            style={
              styles.totalBadge
            }
          >
            <Text
              style={
                styles.totalBadgeText
              }
            >
              {filteredBookings.length}
            </Text>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={
            false
          }
          contentContainerStyle={
            styles.filterRow
          }
        >
          {FILTERS.map(
            item => {
              const selected =
                filter ===
                item.key

              return (
                <Pressable
                  key={
                    item.key
                  }
                  onPress={() => {
                    setFilter(
                      item.key,
                    )
                  }}
                  accessibilityRole="button"
                  accessibilityState={{
                    selected,
                  }}
                  style={({ pressed }) => [
                    styles.filterChip,
                    selected &&
                      styles.filterChipSelected,
                    pressed &&
                      styles.filterChipPressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.filterLabel,
                      selected &&
                        styles.filterLabelSelected,
                    ]}
                  >
                    {item.label}
                  </Text>

                  <View
                    style={[
                      styles.filterCount,
                      selected &&
                        styles.filterCountSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterCountText,
                        selected &&
                          styles.filterCountTextSelected,
                      ]}
                    >
                      {
                        counts[
                          item.key
                        ]
                      }
                    </Text>
                  </View>
                </Pressable>
              )
            },
          )}
        </ScrollView>

        {filteredBookings.length ===
        0 ? (
          <View
            style={
              styles.emptyWrapper
            }
          >
            <View
              style={
                styles.emptyIcon
              }
            >
              <Ionicons
                name={
                  filter ===
                  'completed'
                    ? 'checkmark-done-outline'
                    : filter ===
                        'cancelled'
                      ? 'close-outline'
                      : 'briefcase-outline'
                }
                size={28}
                color={
                  UI.colors.primaryBlue
                }
              />
            </View>

            <EmptyState
              title={
                filter ===
                'all'
                  ? 'No jobs yet'
                  : `No ${filter} jobs`
              }
              message={
                filter ===
                'active'
                  ? 'Active worker assignments will appear here.'
                  : filter ===
                      'upcoming'
                    ? 'Upcoming assigned jobs will appear here.'
                    : filter ===
                        'completed'
                      ? 'Completed services will appear here.'
                      : filter ===
                          'cancelled'
                        ? 'Cancelled or expired bookings will appear here.'
                        : 'Jobs assigned to your worker account will appear here.'
              }
              actionLabel="Refresh"
              onAction={
                handleRefresh
              }
            />
          </View>
        ) : (
          <View
            style={styles.list}
          >
            {filteredBookings.map(
              booking => {
                const durationHours =
                  getBookingDurationHours(
                    booking,
                  )

                const active =
                  isActiveBookingStatus(
                    booking.status,
                  )

                return (
                  <Pressable
                    key={
                      booking.id
                    }
                    disabled={
                      !onBookingPress
                    }
                    onPress={() => {
                      onBookingPress?.(
                        booking.id,
                      )
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Open job ${booking.id}`}
                    style={({ pressed }) => [
                      styles.bookingCard,
                      active &&
                        styles.bookingCardActive,
                      pressed &&
                        onBookingPress &&
                        styles.bookingPressed,
                    ]}
                  >
                    <View
                      style={
                        styles.bookingTop
                      }
                    >
                      <View
                        style={[
                          styles.jobIcon,
                          active &&
                            styles.jobIconActive,
                          booking.status ===
                            'completed' &&
                            styles.jobIconCompleted,
                        ]}
                      >
                        <Ionicons
                          name={
                            getJobIcon(
                              booking,
                            )
                          }
                          size={20}
                          color={
                            active
                              ? UI.colors.surface
                              : booking.status ===
                                  'completed'
                                ? UI.colors.success
                                : UI.colors.primaryBlue
                          }
                        />
                      </View>

                      <View
                        style={
                          styles.bookingTopCopy
                        }
                      >
                        <Text
                          style={
                            styles.bookingEyebrow
                          }
                        >
                          {active
                            ? 'CURRENT JOB'
                            : 'ASSIGNED JOB'}
                        </Text>

                        <Text
                          style={
                            styles.bookingDate
                          }
                        >
                          {formatBookingDateTime(
                            booking.scheduledStart,
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

                    <View
                      style={
                        styles.scheduleRow
                      }
                    >
                      <View
                        style={
                          styles.scheduleItem
                        }
                      >
                        <Ionicons
                          name="time-outline"
                          size={17}
                          color={
                            UI.colors.textSecondary
                          }
                        />

                        <Text
                          style={
                            styles.scheduleValue
                          }
                        >
                          {formatBookingDateTime(
                            booking.scheduledStart,
                          )
                            .split(',')
                            .slice(-1)
                            .join(',')
                            .trim()}
                        </Text>
                      </View>

                      <View
                        style={
                          styles.scheduleItem
                        }
                      >
                        <Ionicons
                          name="hourglass-outline"
                          size={16}
                          color={
                            UI.colors.textSecondary
                          }
                        />

                        <Text
                          style={
                            styles.scheduleValue
                          }
                        >
                          {booking.durationValue}{' '}
                          {
                            booking.durationUnit
                          }
                          {durationHours !==
                          null
                            ? ` · ${durationHours}h`
                            : ''}
                        </Text>
                      </View>

                      <View
                        style={
                          styles.scheduleItem
                        }
                      >
                        <Ionicons
                          name="layers-outline"
                          size={16}
                          color={
                            UI.colors.textSecondary
                          }
                        />

                        <Text
                          style={
                            styles.scheduleValue
                          }
                        >
                          {getBookingTypeLabel(
                            booking.bookingType,
                          )}
                        </Text>
                      </View>
                    </View>

                    <View
                      style={
                        styles.amountRow
                      }
                    >
                      <View
                        style={
                          styles.amountIcon
                        }
                      >
                        <Ionicons
                          name="cash-outline"
                          size={18}
                          color={
                            UI.colors.success
                          }
                        />
                      </View>

                      <View
                        style={
                          styles.amountCopy
                        }
                      >
                        <Text
                          style={
                            styles.amountLabel
                          }
                        >
                          Booking value
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

                      <Text
                        style={
                          styles.bookingId
                        }
                      >
                        #{booking.id.slice(
                          0,
                          8,
                        )}
                      </Text>
                    </View>

                    {booking.notes ? (
                      <View
                        style={
                          styles.notesBox
                        }
                      >
                        <Ionicons
                          name="document-text-outline"
                          size={16}
                          color={
                            UI.colors.textMuted
                          }
                        />

                        <Text
                          style={
                            styles.notesText
                          }
                          numberOfLines={2}
                        >
                          {booking.notes}
                        </Text>
                      </View>
                    ) : null}

                    {onBookingPress ? (
                      <View
                        style={
                          styles.cardFooter
                        }
                      >
                        <Text
                          style={
                            styles.openText
                          }
                        >
                          View job details
                        </Text>

                        <Ionicons
                          name="chevron-forward"
                          size={18}
                          color={
                            UI.colors.primaryBlue
                          }
                        />
                      </View>
                    ) : null}
                  </Pressable>
                )
              },
            )}
          </View>
        )}

        <View
          style={
            styles.bottomSpacing
          }
        />
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

  header: {
    flexDirection:
      'row',
    alignItems:
      'center',
    justifyContent:
      'space-between',
  },

  headerCopy: {
    flex: 1,
    paddingRight:
      UI.spacing.md,
  },

  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
    color:
      UI.colors.primaryBlue,
  },

  title: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.largeTitle,
    lineHeight: 34,
    fontWeight: '900',
    color:
      UI.colors.text,
  },

  subtitle: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.body,
    lineHeight: 20,
    color:
      UI.colors.textSecondary,
  },

  headerIconButton: {
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

  headerIconPressed: {
    opacity: 0.7,
  },

  warningBox: {
    flexDirection:
      'row',
    alignItems:
      'flex-start',
    marginTop:
      UI.spacing.lg,
    padding:
      UI.spacing.md,
    borderRadius:
      UI.radius.lg,
    backgroundColor:
      UI.colors.warningBackground,
    borderWidth: 1,
    borderColor:
      UI.colors.warningBackground,
  },

  warningIcon: {
    width: 32,
    height: 32,
    borderRadius:
      UI.radius.pill,
    alignItems:
      'center',
    justifyContent:
      'center',
    backgroundColor:
      UI.colors.surface,
  },

  warningCopy: {
    flex: 1,
    marginLeft:
      UI.spacing.sm,
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

  filterHeader: {
    flexDirection:
      'row',
    alignItems:
      'center',
    justifyContent:
      'space-between',
    marginTop:
      UI.spacing.xxl,
    marginBottom:
      UI.spacing.sm,
  },

  filterHeaderCopy: {
    flex: 1,
  },

  filterTitle: {
    fontSize:
      UI.typography.bodyLarge,
    fontWeight: '800',
    color:
      UI.colors.text,
  },

  filterSubtitle: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.caption,
    color:
      UI.colors.textMuted,
  },

  totalBadge: {
    minWidth: 36,
    height: 36,
    paddingHorizontal:
      UI.spacing.sm,
    borderRadius:
      UI.radius.pill,
    alignItems:
      'center',
    justifyContent:
      'center',
    backgroundColor:
      UI.colors.infoBackground,
  },

  totalBadgeText: {
    fontSize:
      UI.typography.small,
    fontWeight: '800',
    color:
      UI.colors.primaryBlue,
  },

  filterRow: {
    paddingRight:
      UI.spacing.lg,
  },

  filterChip: {
    flexDirection:
      'row',
    alignItems:
      'center',
    minHeight: 42,
    marginRight:
      UI.spacing.sm,
    paddingLeft:
      UI.spacing.md,
    paddingRight:
      UI.spacing.sm,
    borderRadius:
      UI.radius.pill,
    backgroundColor:
      UI.colors.surface,
    borderWidth: 1,
    borderColor:
      UI.colors.border,
  },

  filterChipSelected: {
    backgroundColor:
      UI.colors.primary,
    borderColor:
      UI.colors.primary,
  },

  filterChipPressed: {
    opacity: 0.78,
  },

  filterLabel: {
    fontSize:
      UI.typography.small,
    fontWeight: '700',
    color:
      UI.colors.textSecondary,
  },

  filterLabelSelected: {
    color:
      UI.colors.surface,
  },

  filterCount: {
    minWidth: 24,
    height: 24,
    marginLeft:
      UI.spacing.sm,
    paddingHorizontal:
      UI.spacing.xs,
    borderRadius:
      UI.radius.pill,
    alignItems:
      'center',
    justifyContent:
      'center',
    backgroundColor:
      UI.colors.background,
  },

  filterCountSelected: {
    backgroundColor:
      '#173B55',
  },

  filterCountText: {
    fontSize:
      UI.typography.caption,
    fontWeight: '800',
    color:
      UI.colors.text,
  },

  filterCountTextSelected: {
    color:
      UI.colors.surface,
  },

  list: {
    marginTop:
      UI.spacing.lg,
  },

  bookingCard: {
    marginBottom:
      UI.spacing.md,
    padding:
      UI.spacing.lg,
    borderRadius:
      UI.radius.xl,
    backgroundColor:
      UI.colors.surface,
    borderWidth: 1,
    borderColor:
      UI.colors.border,
  },

  bookingCardActive: {
    borderColor:
      UI.colors.primaryBlue,
    borderLeftWidth: 4,
  },

  bookingPressed: {
    opacity: 0.84,
  },

  bookingTop: {
    flexDirection:
      'row',
    alignItems:
      'center',
  },

  jobIcon: {
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

  jobIconActive: {
    backgroundColor:
      UI.colors.primaryBlue,
  },

  jobIconCompleted: {
    backgroundColor:
      UI.colors.successBackground,
  },

  bookingTopCopy: {
    flex: 1,
    marginLeft:
      UI.spacing.md,
    paddingRight:
      UI.spacing.sm,
  },

  bookingEyebrow: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
    color:
      UI.colors.primaryBlue,
  },

  bookingDate: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.bodyLarge,
    lineHeight: 21,
    fontWeight: '800',
    color:
      UI.colors.text,
  },

  scheduleRow: {
    flexDirection:
      'row',
    flexWrap:
      'wrap',
    marginTop:
      UI.spacing.lg,
    paddingTop:
      UI.spacing.md,
    borderTopWidth: 1,
    borderTopColor:
      UI.colors.border,
  },

  scheduleItem: {
    flexDirection:
      'row',
    alignItems:
      'center',
    marginRight:
      UI.spacing.lg,
    marginBottom:
      UI.spacing.xs,
  },

  scheduleValue: {
    marginLeft:
      UI.spacing.xs,
    fontSize:
      UI.typography.small,
    fontWeight: '700',
    color:
      UI.colors.textSecondary,
  },

  amountRow: {
    flexDirection:
      'row',
    alignItems:
      'center',
    marginTop:
      UI.spacing.md,
    paddingTop:
      UI.spacing.md,
    borderTopWidth: 1,
    borderTopColor:
      UI.colors.border,
  },

  amountIcon: {
    width: 36,
    height: 36,
    borderRadius:
      UI.radius.md,
    alignItems:
      'center',
    justifyContent:
      'center',
    backgroundColor:
      UI.colors.successBackground,
  },

  amountCopy: {
    flex: 1,
    marginLeft:
      UI.spacing.sm,
  },

  amountLabel: {
    fontSize:
      UI.typography.caption,
    color:
      UI.colors.textMuted,
  },

  amountValue: {
    marginTop: 2,
    fontSize:
      UI.typography.bodyLarge,
    fontWeight: '900',
    color:
      UI.colors.text,
  },

  bookingId: {
    maxWidth: 90,
    marginLeft:
      UI.spacing.sm,
    fontSize:
      UI.typography.caption,
    fontWeight: '700',
    color:
      UI.colors.textMuted,
  },

  notesBox: {
    flexDirection:
      'row',
    alignItems:
      'flex-start',
    marginTop:
      UI.spacing.md,
    padding:
      UI.spacing.md,
    borderRadius:
      UI.radius.md,
    backgroundColor:
      UI.colors.background,
  },

  notesText: {
    flex: 1,
    marginLeft:
      UI.spacing.sm,
    fontSize:
      UI.typography.small,
    lineHeight: 18,
    color:
      UI.colors.textSecondary,
  },

  cardFooter: {
    flexDirection:
      'row',
    alignItems:
      'center',
    justifyContent:
      'flex-end',
    marginTop:
      UI.spacing.lg,
    paddingTop:
      UI.spacing.md,
    borderTopWidth: 1,
    borderTopColor:
      UI.colors.border,
  },

  openText: {
    marginRight:
      UI.spacing.xs,
    fontSize:
      UI.typography.small,
    fontWeight: '800',
    color:
      UI.colors.primaryBlue,
  },

  emptyWrapper: {
    minHeight: 360,
    marginTop:
      UI.spacing.lg,
    padding:
      UI.spacing.lg,
    borderRadius:
      UI.radius.xl,
    alignItems:
      'center',
    justifyContent:
      'center',
    backgroundColor:
      UI.colors.background,
    borderWidth: 1,
    borderColor:
      UI.colors.border,
  },

  emptyIcon: {
    width: 58,
    height: 58,
    borderRadius:
      UI.radius.pill,
    alignItems:
      'center',
    justifyContent:
      'center',
    marginBottom:
      UI.spacing.sm,
    backgroundColor:
      UI.colors.surface,
    borderWidth: 1,
    borderColor:
      UI.colors.border,
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
    fontWeight: '800',
    color:
      UI.colors.text,
    textAlign: 'center',
  },

  loadingText: {
    marginTop:
      UI.spacing.sm,
    maxWidth: 300,
    fontSize:
      UI.typography.body,
    lineHeight: 20,
    color:
      UI.colors.textSecondary,
    textAlign: 'center',
  },
})
