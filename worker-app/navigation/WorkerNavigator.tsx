import {
  useEffect,
} from 'react'
import WorkerNotificationRouter from '../components/runtime/WorkerNotificationRouter'
import {
  Alert,
  StyleSheet,
} from 'react-native'

import {
  Ionicons,
} from '@expo/vector-icons'

import {
  useNavigation,
} from '@react-navigation/native'

import type {
  NativeStackNavigationProp,
} from '@react-navigation/native-stack'

import {
  createBottomTabNavigator,
} from '@react-navigation/bottom-tabs'

import {
  createNativeStackNavigator,
} from '@react-navigation/native-stack'

import {
  UI,
} from '../constants/ui'

import {
  useWorkerRuntime,
} from '../context/WorkerRuntimeContext'

import {
  getWorkerBooking,
} from '../services/bookings/workerBookings.service'

import {
  getWorkerBookingOccurrencesForBooking,
} from '../services/bookings/workerBookingOccurrences.service'

import {
  isActiveBookingStatus,
} from '../lib/workerBookingUtils'

import type {
  BookingStatus,
  WorkerBookingOccurrence,
} from '../types/booking'

import type {
  WorkerStackParamList,
  WorkerTabParamList,
} from '../types/navigation'

import WorkerHomeScreen from '../screens/home/WorkerHomeScreen'
import WorkerBookingsScreen from '../screens/bookings/WorkerBookingsScreen'
import BookingOfferScreen from '../screens/bookings/BookingOfferScreen'
import ActiveBookingScreen from '../screens/bookings/ActiveBookingScreen'
import BookingDetailsScreen from '../screens/bookings/BookingDetailsScreen'
import BookingOccurrenceScreen from '../screens/bookings/BookingOccurrenceScreen'
import WorkerEarningsScreen from '../screens/earnings/WorkerEarningsScreen'
import EarningDetailsScreen from '../screens/earnings/EarningDetailsScreen'
import ProfileScreen from '../screens/profile/ProfileScreen'
import EditProfileScreen from '../screens/profile/EditProfileScreen'
import WorkerScheduleScreen from '../screens/schedule/WorkerScheduleScreen'
import NotificationsScreen from '../screens/notifications/NotificationsScreen'
import SupportScreen from '../screens/support/SupportScreen'
import SettingsScreen from '../screens/settings/SettingsScreen'

type WorkerStackNavigation =
  NativeStackNavigationProp<
    WorkerStackParamList
  >

const Tab =
  createBottomTabNavigator<
    WorkerTabParamList
  >()

const Stack =
  createNativeStackNavigator<
    WorkerStackParamList
  >()

async function navigateToWorkerBooking(
  navigation: WorkerStackNavigation,
  bookingId: string,
): Promise<void> {
  try {
    const booking =
      await getWorkerBooking(
        bookingId,
      )

    if (!booking) {
      Alert.alert(
        'Booking unavailable',
        'This booking is no longer assigned to your worker account.',
      )
      return
    }

    /*
     * Non-recurring active jobs use the dedicated
     * operational screen.
     *
     * Recurring jobs currently continue to their
     * occurrence screen so the existing recurring
     * lifecycle is preserved. It will receive the same
     * live-map treatment in the next recurring-booking
     * phase.
     */
    if (
      isActiveBookingStatus(
        booking.status,
      ) &&
      booking.bookingType !==
        'recurring'
    ) {
      navigation.navigate(
        'ActiveBooking',
        {
          bookingId:
            booking.id,
        },
      )
      return
    }

    if (
      booking.bookingType ===
        'recurring'
    ) {
      const occurrences =
        await getWorkerBookingOccurrencesForBooking(
          booking.id,
        )

      const activeOccurrence =
        occurrences.find(
          occurrence =>
            isActiveBookingStatus(
              occurrence.status as BookingStatus,
            ),
        )

      if (activeOccurrence) {
        navigation.navigate(
          'BookingOccurrence',
          {
            occurrenceId:
              activeOccurrence.id,
          },
        )
        return
      }
    }

    navigation.navigate(
      'BookingDetails',
      {
        bookingId:
          booking.id,
      },
    )
  } catch (cause) {
    Alert.alert(
      'Booking unavailable',
      cause instanceof Error
        ? cause.message
        : 'Unable to open this booking.',
    )
  }
}

function WorkerTabs() {
  const navigation =
    useNavigation<WorkerStackNavigation>()

  const {
    latestOfferBookingId,
  } = useWorkerRuntime()

  useEffect(() => {
    if (!latestOfferBookingId) {
      return
    }

    navigation.navigate(
      'BookingOffer',
      {
        bookingId:
          latestOfferBookingId,
      },
    )
  }, [
    latestOfferBookingId,
    navigation,
  ])

  return (
  <>
    <WorkerNotificationRouter
      onBookingPress={bookingId => {
        void navigateToWorkerBooking(
          navigation,
          bookingId,
        )
      }}
      onBookingOfferPress={bookingId => {
        navigation.navigate(
          'BookingOffer',
          {
            bookingId,
          },
        )
      }}
    />

    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle:
          styles.tabBar,
        tabBarLabelStyle:
          styles.tabBarLabel,
        tabBarActiveTintColor:
          UI.colors.tabBarActive,
        tabBarInactiveTintColor:
          UI.colors.tabBarInactive,
        tabBarHideOnKeyboard:
          true,
      }}
    >
      <Tab.Screen
        name="Home"
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({
            color,
            size,
            focused,
          }) => (
            <Ionicons
              name={
                focused
                  ? 'home'
                  : 'home-outline'
              }
              size={size}
              color={color}
            />
          ),
        }}
      >
        {({ navigation }) => (
          <WorkerHomeScreen
            onBookings={() => {
              navigation.navigate(
                'Bookings',
              )
            }}
            onSchedule={() => {
              navigation
                .getParent()
                ?.navigate(
                  'Schedule',
                )
            }}
            onNotifications={() => {
              navigation
                .getParent()
                ?.navigate(
                  'Notifications',
                )
            }}
            onProfile={() => {
              navigation.navigate(
                'Profile',
              )
            }}
          />
        )}
      </Tab.Screen>

      <Tab.Screen
        name="Bookings"
        options={{
          tabBarLabel: 'Jobs',
          tabBarIcon: ({
            color,
            size,
            focused,
          }) => (
            <Ionicons
              name={
                focused
                  ? 'briefcase'
                  : 'briefcase-outline'
              }
              size={size}
              color={color}
            />
          ),
        }}
      >
        {() => (
          <WorkerBookingsScreen
            onBookingPress={bookingId => {
              void navigateToWorkerBooking(
                navigation,
                bookingId,
              )
            }}
          />
        )}
      </Tab.Screen>

      <Tab.Screen
        name="Earnings"
        options={{
          tabBarLabel: 'Earnings',
          tabBarIcon: ({
            color,
            size,
            focused,
          }) => (
            <Ionicons
              name={
                focused
                  ? 'wallet'
                  : 'wallet-outline'
              }
              size={size}
              color={color}
            />
          ),
        }}
      >
        {({ navigation }) => (
          <WorkerEarningsScreen
            onEarningPress={earningId => {
              navigation
                .getParent()
                ?.navigate(
                  'EarningDetails',
                  {
                    earningId,
                  },
                )
            }}
          />
        )}
      </Tab.Screen>

      <Tab.Screen
        name="Profile"
        options={{
          tabBarLabel: 'Profile',
          tabBarIcon: ({
            color,
            size,
            focused,
          }) => (
            <Ionicons
              name={
                focused
                  ? 'person'
                  : 'person-outline'
              }
              size={size}
              color={color}
            />
          ),
        }}
      >
        {({ navigation }) => (
          <ProfileScreen
            onEditProfile={() => {
              navigation
                .getParent()
                ?.navigate(
                  'EditProfile',
                )
            }}
            onSettings={() => {
              navigation
                .getParent()
                ?.navigate(
                  'Settings',
                )
            }}
            onSignedOut={() => {
              navigation
                .getParent()
                ?.getParent()
                ?.reset({
                  index: 0,
                  routes: [
                    {
                      name: 'Login',
                    },
                  ],
                })
            }}
          />
        )}
      </Tab.Screen>
        </Tab.Navigator>
  </>
)
  
}

export default function WorkerNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="Tabs"
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="Tabs">
        {() => <WorkerTabs />}
      </Stack.Screen>

      <Stack.Screen
        name="BookingOffer"
      >
        {({
          navigation,
          route,
        }) => (
          <BookingOfferScreen
            bookingId={
              route.params.bookingId
            }
            onBack={() => {
              navigation.goBack()
            }}
            onAccepted={bookingId => {
              void navigateToWorkerBooking(
                navigation,
                bookingId,
              )
            }}
          />
        )}
      </Stack.Screen>

      <Stack.Screen
        name="ActiveBooking"
      >
        {({
          navigation,
          route,
        }) => (
          <ActiveBookingScreen
            bookingId={
              route.params.bookingId
            }
            onBack={() => {
              navigation.goBack()
            }}
            onFinished={bookingId => {
              navigation.replace(
                'BookingDetails',
                {
                  bookingId,
                },
              )
            }}
          />
        )}
      </Stack.Screen>

      <Stack.Screen
        name="BookingDetails"
      >
        {({
          navigation,
          route,
        }) => (
          <BookingDetailsScreen
            bookingId={
              route.params.bookingId
            }
            onBack={() => {
              navigation.goBack()
            }}
            onActiveBooking={bookingId => {
              navigation.replace(
                'ActiveBooking',
                {
                  bookingId,
                },
              )
            }}
            onOccurrencePress={occurrenceId => {
              navigation.navigate(
                'BookingOccurrence',
                {
                  occurrenceId,
                },
              )
            }}
          />
        )}
      </Stack.Screen>

      <Stack.Screen
        name="BookingOccurrence"
      >
        {({
          navigation,
          route,
        }) => (
          <BookingOccurrenceScreen
            occurrenceId={
              route.params.occurrenceId
            }
            onBack={() => {
              navigation.goBack()
            }}
          />
        )}
      </Stack.Screen>

      <Stack.Screen
        name="Schedule"
      >
        {({ navigation }) => (
          <WorkerScheduleScreen
            onBack={() => {
              navigation.goBack()
            }}
          />
        )}
      </Stack.Screen>

      <Stack.Screen
        name="Notifications"
      >
        {({ navigation }) => (
          <NotificationsScreen
            onBack={() => {
              navigation.goBack()
            }}
            onBookingPress={bookingId => {
              void navigateToWorkerBooking(
                navigation,
                bookingId,
              )
            }}
            onBookingOfferPress={bookingId => {
              navigation.navigate(
                'BookingOffer',
                {
                  bookingId,
                },
              )
            }}
          />
        )}
      </Stack.Screen>

      <Stack.Screen
        name="Support"
      >
        {({ navigation }) => (
          <SupportScreen
            onBack={() => {
              navigation.goBack()
            }}
          />
        )}
      </Stack.Screen>

      <Stack.Screen
        name="EditProfile"
      >
        {({ navigation }) => (
          <EditProfileScreen
            onSaved={() => {
              navigation.goBack()
            }}
            onBack={() => {
              navigation.goBack()
            }}
          />
        )}
      </Stack.Screen>

      <Stack.Screen
        name="Settings"
      >
        {({ navigation }) => (
          <SettingsScreen
            onBack={() => {
              navigation.goBack()
            }}
            onEditProfile={() => {
              navigation.navigate(
                'EditProfile',
              )
            }}
            onSchedule={() => {
              navigation.navigate(
                'Schedule',
              )
            }}
            onNotifications={() => {
              navigation.navigate(
                'Notifications',
              )
            }}
            onSupport={() => {
              navigation.navigate(
                'Support',
              )
            }}
            onSignedOut={() => {
              navigation
                .getParent()
                ?.reset({
                  index: 0,
                  routes: [
                    {
                      name: 'Login',
                    },
                  ],
                })
            }}
          />
        )}
      </Stack.Screen>

      <Stack.Screen
        name="EarningDetails"
      >
        {({
          navigation,
          route,
        }) => (
          <EarningDetailsScreen
            earningId={
              route.params.earningId
            }
            onBack={() => {
              navigation.goBack()
            }}
          />
        )}
      </Stack.Screen>
    </Stack.Navigator>
  )
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    bottom: UI.spacing.lg,
    left: UI.spacing.lg,
    right: UI.spacing.lg,
    height: 72,
    paddingTop: 8,
    paddingBottom: 8,
    borderRadius: UI.radius.lg,
    borderTopWidth: 0,
    borderWidth: 1,
    borderColor: UI.colors.border,
    backgroundColor: UI.colors.surface,
    elevation: 8,
    shadowColor: UI.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
  },
  tabBarLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
})
