import { useEffect, useState } from 'react'
import {
  NavigationContainer,
  useNavigationContainerRef,
} from '@react-navigation/native'
import {
  createNativeStackNavigator,
} from '@react-navigation/native-stack'

import { supabase } from '../lib/supabase'

import CustomerNavigator from './CustomerNavigator'

import SplashScreen from '../screens/auth/SplashScreen'
import LoginScreen from '../screens/auth/LoginScreen'
import OtpScreen from '../screens/auth/OtpScreen'
import RegistrationScreen from '../screens/auth/RegistrationScreen'
import LocationFetchingScreen from '../screens/location/LocationFetchingScreen'

import {
  createCustomerProfile,
  sendOtp,
} from '../services/auth/auth.service'

import {
  getOrCreateCustomerAddress,
} from '../services/addresses/customerAddress.service'

import {
  CustomerAuthState,
} from '../services/auth/auth.service'

import {
  RootStackParamList,
} from '../types/navigation'

const Stack =
  createNativeStackNavigator<RootStackParamList>()

type CustomerLocation = {
  latitude: number
  longitude: number
  address: string
}

export default function RootNavigator() {
  const navigationRef =
    useNavigationContainerRef<RootStackParamList>()

  const [phone, setPhone] =
    useState('')

  const [
    customerLocation,
    setCustomerLocation,
  ] =
    useState<CustomerLocation | null>(
      null,
    )

  useEffect(() => {
    const {
      data: {
        subscription,
      },
    } =
      supabase.auth.onAuthStateChange(
        event => {
          if (
            event !== 'SIGNED_OUT'
          ) {
            return
          }

          if (
            !navigationRef.isReady()
          ) {
            return
          }

          const currentRoute =
            navigationRef.getCurrentRoute()
              ?.name

          if (
            currentRoute ===
              'Login' ||
            currentRoute ===
              'Splash'
          ) {
            return
          }

          navigationRef.resetRoot({
            index: 0,
            routes: [
              {
                name: 'Login',
              },
            ],
          })
        },
      )

    return () => {
      subscription.unsubscribe()
    }
  }, [navigationRef])

  function redirectToLogin() {
    if (
      !navigationRef.isReady()
    ) {
      return
    }

    const currentRoute =
      navigationRef.getCurrentRoute()
        ?.name

    if (
      currentRoute ===
        'Login' ||
      currentRoute ===
        'Splash'
    ) {
      return
    }

    navigationRef.resetRoot({
      index: 0,
      routes: [
        {
          name: 'Login',
        },
      ],
    })
  }

  function handleSplashFinished(
    authState: CustomerAuthState,
    navigation: {
      replace: (
        screen: keyof RootStackParamList,
      ) => void
    },
  ) {
    setPhone(authState.phone)

    if (!authState.authenticated) {
      navigation.replace('Login')
      return
    }

    if (authState.needsRegistration) {
      navigation.replace('Registration')
      return
    }

    /*
     * Returning customers go directly to Home.
     *
     * Home will refresh the current GPS location
     * without displaying the onboarding Location screen.
     */
    navigation.replace('Customer')
  }

  async function handleLocationFetched(
    latitude: number,
    longitude: number,
    address: string,
  ) {
    const locationAddress =
      address.trim() ||
      'Current location'

    /*
     * Save the customer's first/current service
     * location in Supabase.
     */
    await getOrCreateCustomerAddress({
      latitude,
      longitude,
      address: locationAddress,
      label: 'Current',
    })

    setCustomerLocation({
      latitude,
      longitude,
      address: locationAddress,
    })
  }

  async function handleLocationChange(
    latitude: number,
    longitude: number,
    address: string,
  ) {
    const locationAddress =
      address.trim() ||
      'Current location'

    /*
     * Every location selected from Home is also
     * persisted so it can be reused later.
     */
    try {
      await getOrCreateCustomerAddress({
        latitude,
        longitude,
        address: locationAddress,
        label: 'Saved location',
      })
    } catch (error) {
      /*
       * Do not block the customer from using the
       * newly selected location if persistence fails.
       */
      console.error(
        'Unable to save customer location:',
        error,
      )
    }

    setCustomerLocation({
      latitude,
      longitude,
      address: locationAddress,
    })
  }

  return (
    <NavigationContainer
      ref={navigationRef}
    >
      <Stack.Navigator
        initialRouteName="Splash"
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Screen name="Splash">
          {({ navigation }) => (
            <SplashScreen
              onFinished={authState => {
                handleSplashFinished(
                  authState,
                  navigation,
                )
              }}
            />
          )}
        </Stack.Screen>

        <Stack.Screen name="Login">
          {({ navigation }) => (
            <LoginScreen
              onContinue={async mobile => {
                await sendOtp(mobile)

                setPhone(mobile)

                navigation.navigate('Otp')
              }}
            />
          )}
        </Stack.Screen>

        <Stack.Screen name="Otp">
          {({ navigation }) => (
            <OtpScreen
              phone={phone}
              onVerified={(
                verifiedPhone,
                needsRegistration,
              ) => {
                setPhone(
                  verifiedPhone,
                )

                if (
                  needsRegistration
                ) {
                  navigation.replace(
                    'Registration',
                  )
                  return
                }

                navigation.replace(
                  'Customer',
                )
              }}
            />
          )}
        </Stack.Screen>

        <Stack.Screen name="Registration">
          {({ navigation }) => (
            <RegistrationScreen
              phone={phone}
              onContinue={async (
                name,
                companyName,
              ) => {
                const result =
                  await createCustomerProfile(
                    phone,
                    name,
                    companyName,
                  )

                if (!result.success) {
                  throw new Error(
                    result.error,
                  )
                }

                setPhone(
                  result.profile.phone ??
                    phone,
                )

                navigation.replace(
                  'Location',
                )
              }}
            />
          )}
        </Stack.Screen>

        <Stack.Screen name="Location">
          {({ navigation }) => (
            <LocationFetchingScreen
              onLocationFetched={async (
                latitude,
                longitude,
                address,
              ) => {
                await handleLocationFetched(
                  latitude,
                  longitude,
                  address,
                )

                navigation.replace(
                  'Customer',
                )
              }}
            />
          )}
        </Stack.Screen>

        <Stack.Screen name="Customer">
          {() => (
            <CustomerNavigator
              location={
                customerLocation
              }
              onLocationChange={
                handleLocationChange
              }
              onSignOut={
                redirectToLogin
              }
            />
          )}
        </Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>
  )
}