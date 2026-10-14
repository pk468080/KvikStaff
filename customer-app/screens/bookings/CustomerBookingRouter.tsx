import {
  useEffect,
  useState,
} from 'react'

import {
  supabase,
} from '../../lib/supabase'

import {
  ActivityIndicator,
  Text,
  View,
} from 'react-native'

import {
  ScreenContainer,
} from '../../components/layout/ScreenContainer'

import {
  getCustomerBooking,
  getCustomerBookingOccurrences,
} from '../../services/booking/bookingTracking.service'

import ActiveBookingScreen from './ActiveBookingScreen'
import CompletedBookingScreen from './CompletedBookingScreen'
import RecurringBookingScreen from './RecurringBookingScreen'

type CustomerBookingRouterProps = {
  bookingId: string
  onOpenSupport: () => void
  onViewInvoice: (bookingId: string) => void
  onReschedule: (
    bookingId: string,
    currentStart: string,
    currentEnd: string,
  ) => void
}

type BookingView =
  | 'active'
  | 'recurring'
  | 'completed'

export default function CustomerBookingRouter({
  bookingId,
  onOpenSupport,
  onViewInvoice,
  onReschedule,
}: CustomerBookingRouterProps) {
  const [bookingView, setBookingView] =
    useState<BookingView | null>(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    let requestVersion = 0
    let hasResolvedInitialLoad = false

    async function load(isInitial = false) {
      const currentRequestVersion = ++requestVersion

      if (isInitial) {
        setLoading(true)
        setError(null)
        setBookingView(null)
      }

      try {
        const booking = await getCustomerBooking(bookingId)

        if (!mounted || currentRequestVersion !== requestVersion) {
          return
        }

        if (booking.status === 'completed') {
          setBookingView('completed')
          return
        }

        if (booking.booking_type === 'recurring') {
          const occurrences = await getCustomerBookingOccurrences(bookingId)

          if (!mounted || currentRequestVersion !== requestVersion) {
            return
          }

          const seriesCompleted =
            occurrences.length > 0 &&
            occurrences.every(occurrence => occurrence.status === 'completed')

          setBookingView(seriesCompleted ? 'completed' : 'recurring')
          return
        }

        setBookingView('active')
        setError(null)
      } catch (cause) {
        if (!mounted || currentRequestVersion !== requestVersion) {
          return
        }

        if (isInitial || !hasResolvedInitialLoad) {
          setError(
            cause instanceof Error
              ? cause.message
              : 'Unable to load booking.',
          )
        } else {
          console.warn('Unable to refresh customer booking state:', cause)
        }
      } finally {
        if (mounted && currentRequestVersion === requestVersion) {
          hasResolvedInitialLoad = true
          setLoading(false)
        }
      }
    }

    void load(true)

    const channel = supabase
      .channel(`customer-booking-router-${bookingId}-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'bookings',
          filter: `id=eq.${bookingId}`,
        },
        () => {
          if (hasResolvedInitialLoad) {
            void load(false)
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'booking_schedule_occurrences',
          filter: `booking_id=eq.${bookingId}`,
        },
        () => {
          if (hasResolvedInitialLoad) {
            void load(false)
          }
        },
      )
      .subscribe()

    return () => {
      mounted = false
      requestVersion += 1
      void supabase.removeChannel(channel)
    }
  }, [bookingId])

  if (loading) {
    return (
      <ScreenContainer>
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
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

  if (error || !bookingView) {
    return (
      <ScreenContainer>
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
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
            {error ?? 'Unable to determine the booking state.'}
          </Text>
        </View>
      </ScreenContainer>
    )
  }

  if (bookingView === 'completed') {
    return (
      <CompletedBookingScreen
        bookingId={bookingId}
        onViewInvoice={onViewInvoice}
      />
    )
  }

  if (bookingView === 'recurring') {
    return <RecurringBookingScreen bookingId={bookingId} />
  }

  return (
    <ActiveBookingScreen
      bookingId={bookingId}
      onOpenSupport={onOpenSupport}
      onReschedule={onReschedule}
    />
  )
}
