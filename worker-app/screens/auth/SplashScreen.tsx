import {
  useEffect,
  useRef,
} from 'react'

import {
  Image,
  StyleSheet,
  View,
} from 'react-native'

import { UI } from '../../constants/ui'

import {
  getWorkerAuthState,
} from '../../services/auth/workerAuth.service'

import type {
  WorkerAuthState,
} from '../../services/auth/workerAuth.service'

type SplashScreenProps = {
  onFinished: (
    authState: WorkerAuthState,
  ) => void
}

const splashImage =
    require('../../assets/splash/splash_worker.png')

export default function SplashScreen({
  onFinished,
}: SplashScreenProps) {
  const onFinishedRef =
    useRef(onFinished)

  useEffect(() => {
    onFinishedRef.current =
      onFinished
  }, [
    onFinished,
  ])

  useEffect(() => {
    let mounted = true

    async function initialize() {
      const fallbackAuthState: WorkerAuthState = {
        authenticated: false,
        needsRegistration: true,
        email: '',
      }

      /**
       * Restore the existing worker auth state.
       *
       * If session restoration fails, preserve the
       * existing safe fallback behavior.
       */
      const authStatePromise =
        getWorkerAuthState().catch(
          error => {
            console.error(
              'Unable to restore worker session:',
              error,
            )

            return fallbackAuthState
          },
        )

      /**
       * Keep the splash visible for at least the
       * configured duration, exactly as before.
       */
      const minimumSplashPromise =
        new Promise<void>(
          resolve => {
            setTimeout(
              resolve,
              UI.splashDuration,
            )
          },
        )

      const [
        authState,
      ] = await Promise.all([
        authStatePromise,
        minimumSplashPromise,
      ])

      if (!mounted) {
        return
      }

      /**
       * Preserve the existing navigation contract.
       *
       * RootNavigator decides whether the worker goes to:
       * Login
       * WorkerRegistration / WorkerOnboarding
       * Worker
       */
      onFinishedRef.current(
        authState,
      )
    }

    void initialize()

    return () => {
      mounted = false
    }
  }, [])

  return (
    <View style={styles.container}>
      <Image
        source={splashImage}
        style={styles.image}
        resizeMode="cover"
        accessible
        accessibilityLabel="KvikStaff Worker"
      />
    </View>
  )
}

const styles =
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor:
        UI.colors.background,
    },

    image: {
      width: '100%',
      height: '100%',
    },
  })