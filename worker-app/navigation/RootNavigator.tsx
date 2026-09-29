import {
  useEffect,
} from 'react'

import {
  NavigationContainer,
  useNavigationContainerRef,
} from '@react-navigation/native'

import {
  createNativeStackNavigator,
} from '@react-navigation/native-stack'

import SplashScreen from '../screens/auth/SplashScreen'

import LoginScreen from '../screens/auth/LoginScreen'

import WorkerRegistrationScreen from '../screens/auth/WorkerRegistrationScreen'

import WorkerOnboardingScreen from '../screens/onboarding/WorkerOnboardingScreen'

import WorkerPushRegistration from '../components/runtime/WorkerPushRegistration'

import WorkerPresenceRuntime from '../components/runtime/WorkerPresenceRuntime'

import WorkerNavigator from './WorkerNavigator'

import {
  useWorkerRuntime,
} from '../context/WorkerRuntimeContext'

import type {
  RootStackParamList,
} from '../types/navigation'

const Stack =
  createNativeStackNavigator<
    RootStackParamList
  >()

function WorkerAuthNavigationGuard() {
  const navigationRef =
    useNavigationContainerRef<RootStackParamList>()

  const {
    session,
    sessionReady,
  } = useWorkerRuntime()

  useEffect(() => {
    if (!sessionReady) {
      return
    }

    if (session) {
      return
    }

    if (
      !navigationRef.isReady()
    ) {
      return
    }

    const currentRoute =
      navigationRef.getCurrentRoute()

    /*
     * SplashScreen owns the initial anonymous
     * session decision. Do not interrupt it.
     */
    if (
      currentRoute?.name ===
      'Splash'
    ) {
      return
    }

    /*
     * Login is already the correct anonymous
     * destination.
     */
    if (
      currentRoute?.name ===
      'Login'
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
  }, [
    navigationRef,
    session,
    sessionReady,
  ])

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
        <Stack.Screen
          name="Splash"
        >
          {({ navigation }) => (
            <SplashScreen
              onFinished={
                authState => {
                  if (
                    !authState.authenticated
                  ) {
                    navigation.replace(
                      'Login',
                    )

                    return
                  }

                  if (
                    authState.needsRegistration
                  ) {
                    navigation.replace(
                      'WorkerOnboarding',
                    )

                    return
                  }

                  navigation.replace(
                    'Worker',
                  )
                }
              }
            />
          )}
        </Stack.Screen>

        <Stack.Screen
          name="Login"
        >
          {({ navigation }) => (
            <LoginScreen
              onAuthenticated={() => {
                navigation.replace(
                  'Worker',
                )
              }}
              onOnboardingRequired={() => {
                navigation.replace(
                  'WorkerOnboarding',
                )
              }}
              onRegister={() => {
                navigation.navigate(
                  'WorkerRegistration',
                )
              }}
            />
          )}
        </Stack.Screen>

        <Stack.Screen
          name="WorkerRegistration"
        >
          {({ navigation }) => (
            <WorkerRegistrationScreen
              onRegistered={() => {
                navigation.replace(
                  'WorkerOnboarding',
                )
              }}
              onBackToLogin={() => {
                navigation.replace(
                  'Login',
                )
              }}
            />
          )}
        </Stack.Screen>

        <Stack.Screen
          name="WorkerOnboarding"
        >
          {({ navigation }) => (
            <WorkerOnboardingScreen
              onCompleted={() => {
                navigation.replace(
                  'Worker',
                )
              }}
            />
          )}
        </Stack.Screen>

        <Stack.Screen
          name="Worker"
        >
          {() => (
            <>
              <WorkerPushRegistration />

              <WorkerPresenceRuntime />

              <WorkerNavigator />
            </>
          )}
        </Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>
  )
}

export default function RootNavigator() {
  return (
    <WorkerAuthNavigationGuard />
  )
}