import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import { ScreenContainer } from '../../components/layout/ScreenContainer'
import {
  getCustomerBookings,
  type BookingStatus,
  type CustomerBooking,
} from '../../services/booking/bookingTracking.service'

type MyBookingsScreenProps = {
  onBookingPress: (bookingId: string) => void
}

type BookingFilter =
  | 'all'
  | 'upcoming'
  | 'active'
  | 'completed'
  | 'cancelled'

const ACTIVE_STATUSES = new Set<BookingStatus>([
  'searching_worker',
  'assigned',
  'on_the_way',
  'arrived',
  'in_progress',
])

const UPCOMING_STATUSES = new Set<BookingStatus>([
  'pending_payment',
  'paid',
])

const CANCELLED_STATUSES = new Set<BookingStatus>([
  'cancelled',
  'expired',
  'payment_failed',
])

const tempStaffLogo = require('../../assets/branding/tempstuff-logo.png')

function formatStatus(status: BookingStatus) {
  return status
    .replace(/_/g, ' ')
    .replace(/\b\w/g, value => value.toUpperCase())
}

function formatBookingType(value: string) {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, character => character.toUpperCase())
}

function getStatusTone(status: BookingStatus) {
  if (ACTIVE_STATUSES.has(status)) {
    return {
      background: '#E5F7F7',
      text: '#008C8C',
      label: 'Active',
    }
  }

  if (UPCOMING_STATUSES.has(status)) {
    return {
      background: '#EAF3FB',
      text: '#155A87',
      label: status === 'pending_payment' ? 'Payment pending' : 'Upcoming',
    }
  }

  if (status === 'completed') {
    return {
      background: '#EAF7EF',
      text: '#27734A',
      label: 'Completed',
    }
  }

  return {
    background: '#FFF1E6',
    text: '#B65D16',
    label: status === 'payment_failed' ? 'Payment failed' : formatStatus(status),
  }
}

function formatDateTime(value: string | null) {
  if (!value) {
    return 'Schedule pending'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString([], {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatMoney(amount: number | null) {
  if (amount === null) {
    return 'Amount pending'
  }

  return `₹${amount.toFixed(2)}`
}

function formatHours(hours: number | null) {
  if (hours === null) {
    return 'Duration pending'
  }

  return `${hours} ${hours === 1 ? 'hour' : 'hours'}`
}

function getBookingGroup(
  booking: CustomerBooking,
): Exclude<BookingFilter, 'all'> {
  if (ACTIVE_STATUSES.has(booking.status)) {
    return 'active'
  }

  if (UPCOMING_STATUSES.has(booking.status)) {
    return 'upcoming'
  }

  if (booking.status === 'completed') {
    return 'completed'
  }

  return 'cancelled'
}

function getFilterDescription(filter: BookingFilter) {
  switch (filter) {
    case 'upcoming':
      return 'Bookings that are confirmed or waiting for payment.'
    case 'active':
      return 'Bookings currently moving through worker assignment or service.'
    case 'completed':
      return 'Your completed TempStaff services.'
    case 'cancelled':
      return 'Cancelled, expired, or unsuccessful bookings.'
    default:
      return 'All of your TempStaff bookings in one place.'
  }
}

function EmptyState({
  filter,
}: {
  filter: BookingFilter
}) {
  const titles: Record<BookingFilter, string> = {
    all: 'No bookings yet',
    upcoming: 'No upcoming bookings',
    active: 'No active bookings',
    completed: 'No completed bookings',
    cancelled: 'No cancelled bookings',
  }

  const messages: Record<BookingFilter, string> = {
    all: 'Your bookings will appear here after you make your first booking.',
    upcoming: 'Confirmed and scheduled bookings will appear here.',
    active: 'When a booking is in progress or a worker is being assigned, it will appear here.',
    completed: 'Completed services will move here for your records.',
    cancelled: 'Cancelled or expired bookings will appear here.',
  }

  return (
    <View style={styles.emptyCard}>
      <View style={styles.emptyIcon}>
        <Text style={styles.emptyIconText}>
          {filter === 'completed' ? '✓' : '＋'}
        </Text>
      </View>

      <Text style={styles.emptyTitle}>
        {titles[filter]}
      </Text>

      <Text style={styles.emptyMessage}>
        {messages[filter]}
      </Text>
    </View>
  )
}

function BookingCard({
  booking,
  onPress,
}: {
  booking: CustomerBooking
  onPress: () => void
}) {
  const statusTone = getStatusTone(booking.status)
  const image = booking.service_image_url
  const group = getBookingGroup(booking)

  return (
    <Pressable
      style={({ pressed }) => [
        styles.bookingCard,
        pressed && styles.bookingCardPressed,
      ]}
      onPress={onPress}
    >
      <View style={styles.cardTopRow}>
        <View style={styles.serviceVisual}>
          {image ? (
            <Image
              source={{
                uri: image,
              }}
              style={styles.serviceImage}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.serviceImageFallback}>
              <Text style={styles.serviceImageFallbackText}>
                TS
              </Text>
            </View>
          )}
        </View>

        <View style={styles.serviceCopy}>
          <Text
            style={styles.serviceName}
            numberOfLines={2}
          >
            {booking.service_name ?? 'Service booking'}
          </Text>

          <Text style={styles.bookingType}>
            {booking.booking_type
              ? `${formatBookingType(booking.booking_type)} booking`
              : 'TempStaff booking'}
          </Text>
        </View>

        <View
          style={[
            styles.statusPill,
            { backgroundColor: statusTone.background },
          ]}
        >
          <Text
            style={[
              styles.statusPillText,
              { color: statusTone.text },
            ]}
          >
            {statusTone.label}
          </Text>
        </View>
      </View>

      <View style={styles.divider} />

      <View style={styles.infoGrid}>
        <View style={styles.infoItem}>
          <Text style={styles.infoLabel}>Schedule</Text>
          <Text
            style={styles.infoValue}
            numberOfLines={2}
          >
            {formatDateTime(booking.scheduled_start)}
          </Text>
        </View>

        <View style={styles.infoItem}>
          <Text style={styles.infoLabel}>Duration</Text>
          <Text style={styles.infoValue}>
            {formatHours(booking.total_working_hours)}
          </Text>
        </View>
      </View>

      <View style={styles.bottomRow}>
        <View>
          <Text style={styles.amountLabel}>Total</Text>
          <Text style={styles.amount}>
            {formatMoney(booking.total_amount)}
          </Text>
        </View>

        <View style={styles.actionButton}>
          <Text style={styles.actionButtonText}>
            {group === 'active' ? 'Track booking' : 'View booking'}
          </Text>
        </View>
      </View>

      <Text style={styles.bookingId}>
        ID · {booking.id}
      </Text>
    </Pressable>
  )
}

export default function MyBookingsScreen({
  onBookingPress,
}: MyBookingsScreenProps) {
  const [bookings, setBookings] = useState<CustomerBooking[]>([])
  const [filter, setFilter] = useState<BookingFilter>('all')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadBookings = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }

      try {
        setBookings(await getCustomerBookings())
        setError(null)
      } catch (nextError) {
        setError(
          nextError instanceof Error
            ? nextError.message
            : 'Unable to load your bookings.',
        )
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [],
  )

  useEffect(() => {
    void loadBookings()
  }, [loadBookings])

  const counts = useMemo(() => {
    const next = {
      all: bookings.length,
      upcoming: 0,
      active: 0,
      completed: 0,
      cancelled: 0,
    }

    bookings.forEach(booking => {
      const group = getBookingGroup(booking)
      next[group] += 1
    })

    return next
  }, [bookings])

  const visibleBookings = useMemo(() => {
    if (filter === 'all') {
      return bookings
    }

    return bookings.filter(
      booking => getBookingGroup(booking) === filter,
    )
  }, [bookings, filter])

  if (loading) {
    return (
      <ScreenContainer>
        <View style={styles.loadingScreen}>
          <Image
            source={tempStaffLogo}
            style={styles.loadingLogo}
            resizeMode="contain"
          />
          <ActivityIndicator />
          <Text style={styles.loadingText}>
            Loading your bookings...
          </Text>
        </View>
      </ScreenContainer>
    )
  }

  return (
    <ScreenContainer>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void loadBookings(true)}
            tintColor="#00A7A7"
          />
        }
      >
        <View style={styles.brandRow}>
          <Image
            source={tempStaffLogo}
            style={styles.logo}
            resizeMode="contain"
          />
          <View style={styles.brandDivider} />
          <Text style={styles.brandLabel}>
            MY BOOKINGS
          </Text>
        </View>

        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>
              YOUR TEMPS
            </Text>
            <Text style={styles.title}>
              My bookings
            </Text>
            <Text style={styles.subtitle}>
              Manage every TempStaff booking from one place.
            </Text>
          </View>

          <View style={styles.countBadge}>
            <Text style={styles.countNumber}>
              {counts.all}
            </Text>
            <Text style={styles.countLabel}>
              {counts.all === 1 ? 'BOOKING' : 'BOOKINGS'}
            </Text>
          </View>
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorIcon}>!</Text>
            <Text style={styles.errorText}>
              {error}
            </Text>
          </View>
        ) : null}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {(
            [
              ['all', 'All'],
              ['upcoming', 'Upcoming'],
              ['active', 'Active'],
              ['completed', 'Completed'],
              ['cancelled', 'Cancelled'],
            ] as const
          ).map(([value, label]) => {
            const selected = filter === value

            return (
              <Pressable
                key={value}
                onPress={() => setFilter(value)}
                style={[
                  styles.filterChip,
                  selected && styles.filterChipSelected,
                ]}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    selected && styles.filterChipTextSelected,
                  ]}
                >
                  {label}
                </Text>

                <View
                  style={[
                    styles.filterCount,
                    selected && styles.filterCountSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.filterCountText,
                      selected &&
                        styles.filterCountTextSelected,
                    ]}
                  >
                    {counts[value]}
                  </Text>
                </View>
              </Pressable>
            )
          })}
        </ScrollView>

        <Text style={styles.filterDescription}>
          {getFilterDescription(filter)}
        </Text>

        {visibleBookings.length === 0 ? (
          <EmptyState filter={filter} />
        ) : (
          <View style={styles.list}>
            {visibleBookings.map(booking => (
              <BookingCard
                key={booking.id}
                booking={booking}
                onPress={() => onBookingPress(booking.id)}
              />
            ))}
          </View>
        )}

        <View style={styles.footerCard}>
          <View style={styles.footerIcon}>
            <Text style={styles.footerIconText}>TS</Text>
          </View>

          <View style={styles.footerCopy}>
            <Text style={styles.footerTitle}>
              Need help with a booking?
            </Text>
            <Text style={styles.footerText}>
              Open the booking to view its latest status and details.
            </Text>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 40,
    backgroundColor: '#F7FBFD',
  },

  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F7FBFD',
  },

  loadingLogo: {
    width: 138,
    height: 42,
    marginBottom: 22,
  },

  loadingText: {
    marginTop: 12,
    fontSize: 13,
    color: '#6D8290',
  },

  brandRow: {
    height: 38,
    flexDirection: 'row',
    alignItems: 'center',
  },

  logo: {
    width: 118,
    height: 34,
  },

  brandDivider: {
    width: 1,
    height: 18,
    marginHorizontal: 12,
    backgroundColor: '#D8E6ED',
  },

  brandLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
    color: '#6C8190',
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: 20,
    marginBottom: 18,
  },

  headerCopy: {
    flex: 1,
    paddingRight: 14,
  },

  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
    color: '#00A7A7',
    marginBottom: 5,
  },

  title: {
    fontSize: 30,
    lineHeight: 35,
    fontWeight: '800',
    color: '#062F52',
  },

  subtitle: {
    marginTop: 7,
    fontSize: 13,
    lineHeight: 19,
    color: '#718491',
  },

  countBadge: {
    minWidth: 70,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 18,
    alignItems: 'center',
    backgroundColor: '#062F52',
  },

  countNumber: {
    fontSize: 22,
    lineHeight: 25,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  countLabel: {
    marginTop: 2,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: '#BFDDEB',
  },

  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 13,
    borderRadius: 13,
    backgroundColor: '#FFF2F0',
  },

  errorIcon: {
    width: 19,
    height: 19,
    marginRight: 8,
    borderRadius: 10,
    textAlign: 'center',
    lineHeight: 19,
    fontSize: 11,
    fontWeight: '900',
    color: '#FFFFFF',
    backgroundColor: '#D92D20',
  },

  errorText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: '#B42318',
    fontWeight: '600',
  },

  filterRow: {
    paddingVertical: 2,
    paddingRight: 10,
  },

  filterChip: {
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 15,
    paddingRight: 8,
    marginRight: 8,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: '#D7E4EA',
    backgroundColor: '#FFFFFF',
  },

  filterChipSelected: {
    borderColor: '#00A7A7',
    backgroundColor: '#00A7A7',
  },

  filterChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#526977',
  },

  filterChipTextSelected: {
    color: '#FFFFFF',
  },

  filterCount: {
    minWidth: 24,
    height: 24,
    marginLeft: 8,
    paddingHorizontal: 6,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EDF3F6',
  },

  filterCountSelected: {
    backgroundColor: 'rgba(255,255,255,0.18)',
  },

  filterCountText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#607684',
  },

  filterCountTextSelected: {
    color: '#FFFFFF',
  },

  filterDescription: {
    marginTop: 10,
    marginBottom: 14,
    fontSize: 12,
    lineHeight: 17,
    color: '#7A8D99',
  },

  list: {
    gap: 12,
  },

  bookingCard: {
    padding: 15,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#DFEAF0',
    backgroundColor: '#FFFFFF',
    shadowColor: '#062F52',
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: {
      width: 0,
      height: 6,
    },
    elevation: 3,
  },

  bookingCardPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.99 }],
  },

  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  serviceVisual: {
    width: 62,
    height: 62,
    marginRight: 12,
    overflow: 'hidden',
    borderRadius: 17,
    backgroundColor: '#EAF4F7',
  },

  serviceImage: {
    width: '100%',
    height: '100%',
  },

  serviceImageFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#062F52',
  },

  serviceImageFallbackText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
  },

  serviceCopy: {
    flex: 1,
    minWidth: 0,
    paddingRight: 7,
  },

  serviceName: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '800',
    color: '#17354A',
  },

  bookingType: {
    marginTop: 5,
    fontSize: 11,
    fontWeight: '600',
    color: '#8497A2',
  },

  statusPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 12,
  },

  statusPillText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  divider: {
    height: 1,
    marginTop: 14,
    marginBottom: 13,
    backgroundColor: '#EDF2F5',
  },

  infoGrid: {
    flexDirection: 'row',
    gap: 16,
  },

  infoItem: {
    flex: 1,
  },

  infoLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: '#91A1AA',
    textTransform: 'uppercase',
  },

  infoValue: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
    color: '#29465A',
  },

  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
  },

  amountLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: '#91A1AA',
    textTransform: 'uppercase',
  },

  amount: {
    marginTop: 3,
    fontSize: 18,
    fontWeight: '800',
    color: '#062F52',
  },

  actionButton: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    borderRadius: 13,
    backgroundColor: '#E5F7F7',
  },

  actionButtonText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#008C8C',
  },

  bookingId: {
    marginTop: 10,
    fontSize: 9,
    color: '#9AA9B1',
    letterSpacing: 0.2,
  },

  emptyCard: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 34,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#DFEAF0',
    backgroundColor: '#FFFFFF',
  },

  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E5F7F7',
  },

  emptyIconText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#00A7A7',
  },

  emptyTitle: {
    marginTop: 13,
    fontSize: 17,
    fontWeight: '800',
    color: '#17354A',
  },

  emptyMessage: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    color: '#7A8D99',
  },

  footerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
    padding: 14,
    borderRadius: 18,
    backgroundColor: '#062F52',
  },

  footerIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
    backgroundColor: '#00A7A7',
  },

  footerIconText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },

  footerCopy: {
    flex: 1,
  },

  footerTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  footerText: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 16,
    color: '#C6DCE7',
  },
})
