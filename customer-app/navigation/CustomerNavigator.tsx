import {
  createBottomTabNavigator,
} from '@react-navigation/bottom-tabs'
import {
  StyleSheet,
  Text,
} from 'react-native'
import {
  useSafeAreaInsets,
} from 'react-native-safe-area-context'
import {
  createNativeStackNavigator,
} from '@react-navigation/native-stack'
import CustomerPushRegistration from '../components/runtime/CustomerPushRegistration'
import RescheduleBookingScreen from '../screens/bookings/RescheduleBookingScreen'
import BookingDetailsScreen from '../screens/bookings/BookingDetailsScreen'
import BookingScreen from '../screens/bookings/BookingScreen'
import CustomerBookingRouter from '../screens/bookings/CustomerBookingRouter'
import MyBookingsScreen from '../screens/bookings/MyBookingsScreen'
import HomeScreen from '../screens/home/HomeScreen'
import PaymentScreen from '../screens/payment/PaymentScreen'
import InvoiceReceiptScreen from '../screens/bookings/InvoiceReceiptScreen'
import CustomerProfileNavigator from './CustomerProfileNavigator'

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

export type CustomerStackParamList = {
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

  ActiveBooking: {
    bookingId: string
  }

  InvoiceReceipt: {
    bookingId: string
  }
}

const Tab = createBottomTabNavigator()
const Stack =
  createNativeStackNavigator<CustomerStackParamList>()

export default function CustomerNavigator({
  location,
  onLocationChange,
  onSignOut,
}: CustomerNavigatorProps) {
  const insets = useSafeAreaInsets()

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="Tabs">
  {({ navigation: stackNavigation }) => (
    <>
      <CustomerPushRegistration
        onOpenBooking={bookingId =>
          stackNavigation.navigate(
            'ActiveBooking',
            { bookingId },
          )
        }
      />

      <Tab.Navigator
            screenOptions={{
              headerShown: false,
              tabBarActiveTintColor: '#007AFF',
              tabBarInactiveTintColor: '#8E939B',
              tabBarStyle: [
  styles.tabBar,
  {
    marginBottom:
      Math.max(
        8,
        insets.bottom + 4,
      ),
  },
],
              tabBarLabelStyle: styles.tabBarLabel,
              tabBarItemStyle: styles.tabBarItem,
              tabBarActiveBackgroundColor: '#EEF6FF',
              tabBarHideOnKeyboard: true,
            }}
          >
            <Tab.Screen
              name="Home"
              options={{
                tabBarIcon: ({ color }) => (
                  <Text
                    style={[
                      styles.tabIcon,
                      { color },
                    ]}
                  >
                    ⌂
                  </Text>
                ),
              }}
            >
              {() => (
               <HomeScreen
  location={location}
  onLocationChange={
    onLocationChange
  }
  onServicePress={service => {
    stackNavigation.navigate(
      'Booking',
      { service },
    )
  }}
  onBookingPress={bookingId => {
    stackNavigation.navigate(
      'ActiveBooking',
      {
        bookingId,
      },
    )
  }}
/>
              )}
            </Tab.Screen>

            <Tab.Screen
              name="My Bookings"
              options={{
                tabBarIcon: ({ color }) => (
                  <Text
                    style={[
                      styles.tabIcon,
                      { color },
                    ]}
                  >
                    ▤
                  </Text>
                ),
              }}
            >
              {({ navigation }) => (
                <MyBookingsScreen
                  onBookingPress={bookingId =>
                    stackNavigation.navigate(
                      'ActiveBooking',
                      { bookingId },
                    )
                  }
                />
              )}
            </Tab.Screen>

            <Tab.Screen
              name="My Profile"
              options={{
                tabBarIcon: ({ color }) => (
                  <Text
                    style={[
                      styles.tabIcon,
                      { color },
                    ]}
                  >
                    ◯
                  </Text>
                ),
              }}
            >
              {() => (
                <CustomerProfileNavigator
                  onOpenBooking={bookingId =>
  stackNavigation.navigate(
    'ActiveBooking',
    { bookingId },
  )
}
                  onSignOut={onSignOut}
                />
              )}
            </Tab.Screen>
          </Tab.Navigator>
    </>
        )}
        
      </Stack.Screen>

      <Stack.Screen name="Booking">
        {({ route, navigation }) => (
          <BookingScreen
            service={route.params.service}
            location={location}
            onContinue={draft => {
              navigation.navigate(
                'BookingDetails',
                {
                  draft,
                  service:
                    route.params.service,
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
              throw new Error(
                'A booking location is required.',
              )
            }

            if (
              draft.bookingType !==
                'instant' &&
              (!draft.startDate ||
                !draft.endDate)
            ) {
              throw new Error(
                'Booking dates are required.',
              )
            }

            const addressId =
              await getOrCreateCustomerAddress(
                draft.location,
              )

            if (
              draft.bookingType ===
              'instant'
            ) {
              const result =
                await createCustomerInstantBooking(
                  {
                    serviceVariantId:
                      service.serviceVariantId,
                    addressId,
                    startTime:
                      draft.startTime,
                    endTime:
                      draft.endTime,
                  },
                )

              if (
                result.instant_available ===
                  false ||
                result.fallback_to_scheduled ===
                  true
              ) {
                navigation.navigate(
                  'Booking',
                  { service },
                )
                return
              }

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
                        new Date(
                          draft.startDate!,
                        ),
                      ),
                    endDate:
                      toDateString(
                        new Date(
                          draft.endDate!,
                        ),
                      ),
                    startTime:
                      toTimeString(
                        new Date(
                          draft.startTime,
                        ),
                      ),
                    endTime:
                      toTimeString(
                        new Date(
                          draft.endTime,
                        ),
                      ),
                    selectedWeekdays: [
                      0,
                      1,
                      2,
                      3,
                      4,
                      5,
                      6,
                    ],
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
                .filter(
                  index => index >= 0,
                )

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
                    .map(
                      getWeekdayIndex,
                    )
                    .filter(
                      index =>
                        index >= 0,
                    ),
                ),
              )

            const expectedExcludedDates =
              Array.from(
                new Set(
                  draft.excludedDates,
                ),
              ).sort()

            if (
              expectedWeekdayIndexes.length ===
              0
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
                      new Date(
                        draft.startDate!,
                      ),
                    ),
                  endDate:
                    toDateString(
                      new Date(
                        draft.endDate!,
                      ),
                    ),
                  startTime:
                    toTimeString(
                      new Date(
                        draft.startTime,
                      ),
                    ),
                  endTime:
                    toTimeString(
                      new Date(
                        draft.endTime,
                      ),
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
            onPaid={() =>
              navigation.replace(
                'ActiveBooking',
                {
                  bookingId:
                    route.params
                      .bookingId,
                },
              )
            }
          />
        )}
      </Stack.Screen>

      <Stack.Screen name="ActiveBooking">
        {({ route, navigation }) => (
          <CustomerBookingRouter
            bookingId={
              route.params.bookingId
            }
            onViewInvoice={bookingId => {
              navigation.navigate(
                'InvoiceReceipt',
                { bookingId },
              )
            }}
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
            bookingId={
              route.params.bookingId
            }
            currentStart={
              route.params.currentStart
            }
            currentEnd={
              route.params.currentEnd
            }
            onCompleted={() =>
              navigation.replace(
                'ActiveBooking',
                {
                  bookingId:
                    route.params
                      .bookingId,
                },
              )
            }
          />
        )}
      </Stack.Screen>

      <Stack.Screen name="InvoiceReceipt">
        {({ route }) => (
          <InvoiceReceiptScreen
            bookingId={route.params.bookingId}
          />
        )}
      </Stack.Screen>
    </Stack.Navigator>
  )
}

const styles = StyleSheet.create({
    tabBar: {
    height: 70,
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 6,
    paddingTop: 6,
    paddingBottom: 6,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 0,
    borderWidth: 1,
    borderColor: '#E8EEF2',
    borderRadius: 22,
    elevation: 10,
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 5,
    },
    shadowOpacity: 0.1,
    shadowRadius: 12,
  },

    tabBarItem: {
    marginHorizontal: 2,
    borderRadius: 16,
    paddingTop: 1,
    paddingBottom: 1,
  },

   tabBarLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    marginTop: 1,
    marginBottom: 0,
    letterSpacing: 0,
  },

    tabIcon: {
    fontSize: 21,
    fontWeight: '500',
    lineHeight: 23,
    textAlign: 'center',
  },
})
