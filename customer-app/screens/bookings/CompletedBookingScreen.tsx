import {
  useCallback,
  useEffect,
  useState,
} from 'react'

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

import {
  ScreenContainer,
} from '../../components/layout/ScreenContainer'

import {
  getCustomerBooking,
  type CustomerBooking,
} from '../../services/booking/bookingTracking.service'

type CompletedBookingScreenProps = {
  bookingId: string
}

const tempStaffLogo = require('../../assets/branding/tempstuff-logo.png')

function formatStatus(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, character => character.toUpperCase())
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return 'Not recorded'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatMoney(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return 'Amount unavailable'
  }

  return `₹${value.toFixed(2)}`
}

function formatHours(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return 'Not recorded'
  }

  return `${value} ${value === 1 ? 'hour' : 'hours'}`
}

function InfoRow({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  )
}

export default function CompletedBookingScreen({
  bookingId,
}: CompletedBookingScreenProps) {
  const [booking, setBooking] = useState<CustomerBooking | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadBooking = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }

      try {
        const nextBooking = await getCustomerBooking(bookingId)

        if (nextBooking.status !== 'completed') {
          throw new Error(
            'This booking is no longer in the completed state. Refresh to load its current status.',
          )
        }

        setBooking(nextBooking)
        setError(null)
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : 'Unable to load the completed booking.',
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
  }, [loadBooking])

  if (loading) {
    return (
      <ScreenContainer>
        <View style={styles.centered}>
          <Image
            source={tempStaffLogo}
            style={styles.loadingLogo}
            resizeMode="contain"
          />
          <ActivityIndicator />
          <Text style={styles.loadingText}>
            Loading completed booking...
          </Text>
        </View>
      </ScreenContainer>
    )
  }

  if (!booking) {
    return (
      <ScreenContainer>
        <View style={styles.centered}>
          <Text style={styles.errorTitle}>Booking unavailable</Text>
          <Text style={styles.errorText}>
            {error ?? 'The completed booking could not be loaded.'}
          </Text>
          <Pressable
            onPress={() => {
              void loadBooking()
            }}
            style={styles.retryButton}
          >
            <Text style={styles.retryButtonText}>Try again</Text>
          </Pressable>
        </View>
      </ScreenContainer>
    )
  }



  return (
    <ScreenContainer>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void loadBooking(true)
            }}
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
          <Text style={styles.brandLabel}>COMPLETED BOOKING</Text>
        </View>

        <View style={styles.heroCard}>
          <View style={styles.completedMark}>
            <Text style={styles.completedMarkText}>✓</Text>
          </View>

          <Text style={styles.eyebrow}>SERVICE COMPLETE</Text>
          <Text style={styles.heroTitle}>
            {booking.service_name ?? 'Service'}
          </Text>
          <Text style={styles.heroSubtitle}>
            Completed {formatDateTime(booking.completed_at)}
          </Text>

          <View style={styles.amountBlock}>
            <Text style={styles.amountLabel}>TOTAL</Text>
            <Text style={styles.amountValue}>
              {formatMoney(booking.total_amount)}
            </Text>
          </View>
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorBoxTitle}>Booking update notice</Text>
            <Text style={styles.errorBoxText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Service details</Text>
          <InfoRow
            label="Service"
            value={booking.service_name ?? 'Not recorded'}
          />
          <InfoRow
            label="Booking type"
            value={
              booking.booking_type
                ? formatStatus(booking.booking_type)
                : 'Not recorded'
            }
          />
          <InfoRow
            label="Scheduled start"
            value={formatDateTime(booking.scheduled_start)}
          />
          <InfoRow
            label="Scheduled end"
            value={formatDateTime(booking.scheduled_end)}
          />
          <InfoRow
            label="Working time"
            value={formatHours(booking.total_working_hours)}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Payment</Text>
          <InfoRow
            label="Final amount"
            value={formatMoney(booking.total_amount)}
          />
          <InfoRow
            label="Completed at"
            value={formatDateTime(booking.completed_at)}
          />
        </View>

        <View style={styles.idCard}>
          <Text style={styles.idLabel}>BOOKING ID</Text>
          <Text selectable style={styles.idValue}>
            {booking.id}
          </Text>
        </View>

        <View style={styles.footerCard}>
          <Text style={styles.footerTitle}>This booking is closed</Text>
          <Text style={styles.footerText}>
            Live worker tracking, chat, OTP controls, cancellation and rescheduling are no longer available for this completed booking.
          </Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  container: {
    padding: 18,
    paddingBottom: 40,
    backgroundColor: '#F7FBFD',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingLogo: {
    width: 150,
    height: 52,
    marginBottom: 18,
  },
  loadingText: {
    marginTop: 12,
    color: '#6B7280',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },
  logo: {
    width: 125,
    height: 40,
  },
  brandLabel: {
    marginLeft: 10,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    color: '#00A7A7',
  },
  heroCard: {
    padding: 20,
    borderRadius: 22,
    backgroundColor: '#062F52',
  },
  completedMark: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00A7A7',
  },
  completedMarkText: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  eyebrow: {
    marginTop: 18,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
    color: '#7EE7E0',
  },
  heroTitle: {
    marginTop: 6,
    fontSize: 27,
    lineHeight: 33,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  heroSubtitle: {
    marginTop: 7,
    fontSize: 13,
    lineHeight: 19,
    color: '#C9DDE7',
  },
  amountBlock: {
    marginTop: 22,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.16)',
  },
  amountLabel: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
    color: '#A9C2CF',
  },
  amountValue: {
    marginTop: 3,
    fontSize: 24,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  errorBox: {
    marginTop: 14,
    padding: 13,
    borderRadius: 14,
    backgroundColor: '#FFF1F0',
  },
  errorBoxTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#B42318',
  },
  errorBoxText: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 18,
    color: '#7C2D12',
  },
  card: {
    marginTop: 14,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#DFEAF0',
    backgroundColor: '#FFFFFF',
  },
  sectionTitle: {
    marginBottom: 7,
    fontSize: 16,
    fontWeight: '900',
    color: '#17354A',
  },
  infoRow: {
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: '#EDF2F5',
  },
  infoLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: '#91A1AA',
  },
  infoValue: {
    marginTop: 3,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    color: '#29465A',
  },
  idCard: {
    marginTop: 14,
    padding: 15,
    borderRadius: 18,
    backgroundColor: '#EAF3F7',
  },
  idLabel: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
    color: '#6B7F8D',
  },
  idValue: {
    marginTop: 4,
    fontSize: 12,
    color: '#29465A',
  },
  footerCard: {
    marginTop: 14,
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#062F52',
  },
  footerTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  footerText: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 17,
    color: '#C9DDE7',
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#17354A',
    textAlign: 'center',
  },
  errorText: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 19,
    color: '#6D8290',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    minHeight: 46,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: '#00A7A7',
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
})
