import {
  createBottomTabNavigator,
} from '@react-navigation/bottom-tabs'
import {
  StyleSheet,
} from 'react-native'
import {
  createNativeStackNavigator,
} from '@react-navigation/native-stack'
import RescheduleBookingScreen from '../screens/bookings/RescheduleBookingScreen'
import BookingDetailsScreen from '../screens/bookings/BookingDetailsScreen'
import BookingScreen from '../screens/bookings/BookingScreen'
import HomeScreen from '../screens/home/HomeScreen'
import PaymentScreen from '../screens/payment/PaymentScreen'
import CustomerBookingRouter from '../screens/bookings/CustomerBookingRouter'
import MyBookingsScreen from '../screens/bookings/MyBookingsScreen'
import MyProfileScreen from '../screens/profile/MyProfileScreen'

import {
  getOrCreateCustomerAddress,
} from '../services/addresses/customerAddress.service'

import {
  createCustomerScheduledBooking,
} from '../services/booking/scheduledBooking.service'

import {
  createCustomerRecurringBooking,
} from '../services/booking/recurringBooking.service'
import {
  createCustomerInstantBooking,
} from '../services/booking/instantBooking.service'

import {
  getWeekdayIndex,
  toDateString,
  toTimeString,
} from '../lib/bookingUtils'

import type { BookingDraft } from '../types/booking'
import type { HomeService } from '../types/service'

type CustomerLocation = {
  latitude: number
  longitude: number
  address: string
}

type CustomerNavigatorProps = {
  location: CustomerLocation | null
  onLocationChange: (
    latitude: number,
    longitude: number,
    address: string,
  ) => void
  onSignOut: () => void
}

type CustomerStackParamList = {
  Tabs: undefined

  Booking: {
    service: HomeService
  }

  BookingDetails: {
    draft: BookingDraft
    service: HomeService
  }
    RescheduleBooking: {
    bookingId: string
    currentStart: string
    currentEnd: string
  }

  Payment: {
    bookingId: string
    finalAmount: number
    currency: string
    occurrenceCount: number
    totalWorkingHours: number
  }
  ActiveBooking: { bookingId: string }
}

const Tab =
  createBottomTabNavigator()

const Stack =
  createNativeStackNavigator<CustomerStackParamList>()



export default function CustomerNavigator({
  location,
  onLocationChange,
  onSignOut,
}: CustomerNavigatorProps) {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="Tabs">
        {({ navigation }) => (
          <Tab.Navigator
            screenOptions={{
              headerShown: false,
              tabBarStyle:
                styles.tabBar,
              tabBarLabelStyle:
                styles.tabBarLabel,
            }}
          >
            <Tab.Screen name="Home">
              {() => (
                <HomeScreen
                  location={location}
                  onLocationChange={
                    onLocationChange
                  }
                  onServicePress={service => {
                    navigation.navigate(
                      'Booking',
                      {
                        service,
                      },
                    )
                  }}
                />
              )}
            </Tab.Screen>

            <Tab.Screen name="My Bookings">
              {({ navigation }) => (
                <MyBookingsScreen
                  onBookingPress={bookingId => navigation.navigate('ActiveBooking', { bookingId })}
                />
              )}
            </Tab.Screen>

            <Tab.Screen name="My Profile">
              {() => <MyProfileScreen onSignOut={onSignOut} />}
            </Tab.Screen>
          </Tab.Navigator>
        )}
      </Stack.Screen>

      <Stack.Screen name="Booking">
        {({ route, navigation }) => (
          <BookingScreen
            service={
              route.params.service
            }
            location={location}
            onContinue={draft => {
              navigation.navigate(
                'BookingDetails',
                {
                  draft,
                  service:
                    route.params
                      .service,
                },
              )
            }}
          />
        )}
      </Stack.Screen>

      <Stack.Screen name="BookingDetails">
        {({ route, navigation }) => {
          const {
            draft,
            service,
          } = route.params

          async function handleContinue() {
            if (!draft.location) {
              throw new Error('A booking location is required.')
            }

            if (draft.bookingType !== 'instant' && (!draft.startDate || !draft.endDate)) {
              throw new Error(
                'Booking dates are required.',
              )
            }

            const addressId = await getOrCreateCustomerAddress(
                draft.location,
              )

            if (draft.bookingType === 'instant') {
              const result = await createCustomerInstantBooking({
                serviceVariantId: service.serviceVariantId,
                addressId,
                startTime: draft.startTime,
                endTime: draft.endTime,
              })
              if (
                result.instant_available === false ||
                result.fallback_to_scheduled === true
              ) {
                navigation.navigate('Booking', { service })
                return
              }
              navigation.navigate('Payment', {
                bookingId: result.booking_id,
                finalAmount: result.final_amount,
                currency: result.currency,
                occurrenceCount: result.occurrence_count,
                totalWorkingHours: result.total_working_hours,
              })
              return
            }

            if (
              draft.bookingType ===
              'scheduled'
            ) {
              const result =
                await createCustomerScheduledBooking(
                  {
                    serviceVariantId:
                      service.serviceVariantId,

                    addressId,

                    startDate:
  toDateString(
    new Date(draft.startDate!),
  ),

endDate:
  toDateString(
    new Date(draft.endDate!),
  ),

startTime:
  toTimeString(
    new Date(draft.startTime),
  ),

endTime:
  toTimeString(
    new Date(draft.endTime),
  ),

                    selectedWeekdays:
                      [0, 1, 2, 3, 4, 5, 6],

                    excludedDates:
                      draft.excludedDates,
                  },
                )

              navigation.navigate(
                'Payment',
                {
                  bookingId:
                    result.booking_id,

                  finalAmount:
                    result.final_amount,

                  currency:
                    result.currency,

                  occurrenceCount:
                    result.occurrence_count,

                  totalWorkingHours:
                    result.total_working_hours,
                },
              )

              return
            }

            const weekdayIndexes =
  draft.selectedWeekdays
    .map(getWeekdayIndex)
    .filter(index => index >= 0)

            if (
              weekdayIndexes.length ===
              0
            ) {
              throw new Error(
                'At least one recurring weekday is required.',
              )
            }

   const expectedWeekdayIndexes =
  Array.from(
    new Set(
      draft.selectedWeekdays
        .map(getWeekdayIndex)
        .filter(index => index >= 0),
    ),
  )

            const expectedExcludedDates =
              Array.from(
                new Set(draft.excludedDates),
              ).sort()

            if (
              expectedWeekdayIndexes.length === 0
            ) {
              throw new Error(
                'At least one recurring weekday is required.',
              )
            }

            if (
              expectedWeekdayIndexes.length !==
              draft.selectedWeekdays.length
            ) {
              throw new Error(
                `Invalid recurring weekday state: ${JSON.stringify(
                  draft.selectedWeekdays,
                )}`,
              )
            }

            if (
              expectedExcludedDates.length !==
              draft.excludedDates.length
            ) {
              throw new Error(
                `Invalid recurring exclusion state: ${JSON.stringify(
                  draft.excludedDates,
                )}`,
              )
            }

            const result =
              await createCustomerRecurringBooking(
                {
                  serviceVariantId:
                    service.serviceVariantId,

                  addressId,

                  startDate:
  toDateString(
    new Date(draft.startDate!),
  ),

endDate:
  toDateString(
    new Date(draft.endDate!),
  ),

startTime:
  toTimeString(
    new Date(draft.startTime),
  ),

endTime:
  toTimeString(
    new Date(draft.endTime),
  ),

                  selectedWeekdays:
                    expectedWeekdayIndexes,

                  excludedDates:
                    expectedExcludedDates,
                },
              )

            navigation.navigate(
              'Payment',
              {
                bookingId:
                  result.booking_id,

                finalAmount:
                  result.final_amount,

                currency:
                  result.currency,

                occurrenceCount:
                  result.occurrence_count,

                totalWorkingHours:
                  result.total_working_hours,
              },
            )
          }

          return (
            <BookingDetailsScreen
              service={service}
              bookingType={
                draft.bookingType
              }
              location={
                draft.location
              }
              startDate={
                draft.startDate
                  ? new Date(
                      draft.startDate,
                    )
                  : null
              }
              endDate={
                draft.endDate
                  ? new Date(
                      draft.endDate,
                    )
                  : null
              }
              startTime={
                new Date(
                  draft.startTime,
                )
              }
              endTime={
                new Date(
                  draft.endTime,
                )
              }
              selectedWeekdays={
                draft.selectedWeekdays
              }
              excludedDates={
                draft.excludedDates
              }
              onContinue={
                handleContinue
              }
            />
          )
        }}
      </Stack.Screen>

      <Stack.Screen name="Payment">
        {({ route, navigation }) => (
          <PaymentScreen
            bookingId={
              route.params.bookingId
            }
            finalAmount={
              route.params.finalAmount
            }
            currency={
              route.params.currency
            }
            occurrenceCount={
              route.params
                .occurrenceCount
            }
            totalWorkingHours={
              route.params
                .totalWorkingHours
            }
            onPaid={() => navigation.replace('ActiveBooking', {
              bookingId: route.params.bookingId,
            })}
          />
        )}
      </Stack.Screen>

      <Stack.Screen name="ActiveBooking">
        {({ route, navigation }) => (
          <CustomerBookingRouter
            bookingId={
              route.params.bookingId
            }
            onReschedule={(
              bookingId,
              currentStart,
              currentEnd,
            ) => {
              navigation.navigate(
                'RescheduleBooking',
                {
                  bookingId,
                  currentStart,
                  currentEnd,
                },
              )
            }}
          />
        )}
      </Stack.Screen>
<Stack.Screen name="RescheduleBooking">
  {({ route, navigation }) => (
    <RescheduleBookingScreen
      bookingId={route.params.bookingId}
      currentStart={route.params.currentStart}
      currentEnd={route.params.currentEnd}
      onCompleted={() =>
        navigation.replace(
          'ActiveBooking',
          {
            bookingId:
              route.params.bookingId,
          },
        )
      }
    />
  )}
</Stack.Screen>
    </Stack.Navigator>
  )
}

const styles = StyleSheet.create({
  tabBar: {
    height: 64,
    paddingBottom: 8,
    paddingTop: 8,
  },

  tabBarLabel: {
    fontSize: 12,
  },

})