import {
  useEffect,
} from 'react'

import {
  StyleSheet,
} from 'react-native'

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

import type {
  WorkerStackParamList,
  WorkerTabParamList,
} from '../types/navigation'

type WorkerStackNavigation =
  NativeStackNavigationProp<
    WorkerStackParamList
  >

import WorkerHomeScreen from '../screens/home/WorkerHomeScreen'

import WorkerBookingsScreen from '../screens/bookings/WorkerBookingsScreen'

import BookingOfferScreen from '../screens/bookings/BookingOfferScreen'

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

const Tab =
  createBottomTabNavigator<
    WorkerTabParamList
  >()

const Stack =
  createNativeStackNavigator<
    WorkerStackParamList
  >()



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
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle:
          styles.tabBar,
        tabBarLabelStyle:
          styles.tabBarLabel,
        tabBarActiveTintColor:
          UI.colors.secondary,
        tabBarInactiveTintColor:
          UI.colors.textMuted,
      }}
    >
      <Tab.Screen name="Home">
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

      <Tab.Screen name="Bookings">
        {({ navigation }) => (
          <WorkerBookingsScreen
            onBookingPress={(
              bookingId,
            ) => {
              navigation
                .getParent()
                ?.navigate(
                  'BookingDetails',
                  {
                    bookingId,
                  },
                )
            }}
          />
        )}
      </Tab.Screen>

      <Tab.Screen name="Earnings">
        {({ navigation }) => (
          <WorkerEarningsScreen
            onEarningPress={(
              earningId,
            ) => {
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

      <Tab.Screen name="Profile">
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
        {({ navigation, route }) => (
          <BookingOfferScreen
            bookingId={
              route.params.bookingId
            }
            onBack={() => {
              navigation.goBack()
            }}
            onAccepted={bookingId => {
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
        {({ navigation, route }) => (
          <BookingDetailsScreen
            bookingId={
              route.params.bookingId
            }
            onBack={() => {
              navigation.goBack()
            }}
            onOccurrencePress={(
              occurrenceId,
            ) => {
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
        {({ navigation, route }) => (
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

      <Stack.Screen name="Schedule">
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
      onBookingPress={(
        bookingId,
      ) => {
        navigation.navigate(
          'BookingDetails',
          {
            bookingId,
          },
        )
      }}
      onBookingOfferPress={(
        bookingId,
      ) => {
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

      <Stack.Screen name="Support">
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

      <Stack.Screen name="Settings">
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
        {({ navigation, route }) => (
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
    height:
      UI.sizes.tabBarHeight,
    paddingTop:
      UI.spacing.sm,
    paddingBottom:
      UI.spacing.sm,
    borderTopWidth: 1,
    borderTopColor:
      UI.colors.border,
    backgroundColor:
      UI.colors.surface,
  },

  tabBarLabel: {
    fontSize:
      UI.typography.small,
    fontWeight: '600',
  },
})