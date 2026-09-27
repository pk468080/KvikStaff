import {
  useEffect,
  useState,
} from 'react'

import {
  ActivityIndicator,
  Text,
  View,
} from 'react-native'

import {
  ScreenContainer,
} from '../../components/layout/ScreenContainer'

import ActiveBookingScreen from './ActiveBookingScreen'
import RecurringBookingScreen from './RecurringBookingScreen'

import {
  getCustomerBooking,
} from '../../services/booking/bookingTracking.service'

type CustomerBookingRouterProps = {
  bookingId: string
  onReschedule: (
    bookingId: string,
    currentStart: string,
    currentEnd: string,
  ) => void
}

export default function CustomerBookingRouter({
  bookingId,
  onReschedule,
}: CustomerBookingRouterProps) {
  const [
    bookingType,
    setBookingType,
  ] =
    useState<string | null>(
      null,
    )

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

  useEffect(() => {
    let mounted = true

    async function load() {
      try {
        setLoading(true)
        setError(null)

        const booking =
          await getCustomerBooking(
            bookingId,
          )

        if (!mounted) {
          return
        }

        setBookingType(
          booking.booking_type ??
            null,
        )
      } catch (
        cause
      ) {
        if (!mounted) {
          return
        }

        setError(
          cause instanceof Error
            ? cause.message
            : 'Unable to load booking.',
        )
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      mounted = false
    }
  }, [
    bookingId,
  ])

  if (loading) {
    return (
      <ScreenContainer>
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent:
              'center',
          }}
        >
          <ActivityIndicator />

          <Text
            style={{
              marginTop: 12,
              color: '#6B7280',
            }}
          >
            Loading booking...
          </Text>
        </View>
      </ScreenContainer>
    )
  }

  if (error) {
    return (
      <ScreenContainer>
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent:
              'center',
            padding: 24,
          }}
        >
          <Text
            style={{
              color: '#B91C1C',
              textAlign: 'center',
              lineHeight: 20,
            }}
          >
            {error}
          </Text>
        </View>
      </ScreenContainer>
    )
  }

  if (
    bookingType ===
    'recurring'
  ) {
    return (
      <RecurringBookingScreen
        bookingId={
          bookingId
        }
      />
    )
  }

  return (
    <ActiveBookingScreen
      bookingId={
        bookingId
      }
      onReschedule={
        onReschedule
      }
    />
  )
}