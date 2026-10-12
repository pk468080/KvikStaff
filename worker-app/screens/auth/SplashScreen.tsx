import {
  useEffect,
  useRef,
  useState,
} from 'react'

import {
  Image,
  Pressable,
  StyleSheet,
  Text,
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

const AUTH_RESTORE_TIMEOUT_MS = 15_000

const splashImage = require('../../assets/splash/splash_worker.png')

export default function SplashScreen({
  onFinished,
}: SplashScreenProps) {
  const onFinishedRef = useRef(onFinished)
  const [retryAttempt, setRetryAttempt] = useState(0)
  const [restoreError, setRestoreError] = useState(false)

  useEffect(() => {
    onFinishedRef.current = onFinished
  }, [onFinished])

  useEffect(() => {
    let mounted = true
    setRestoreError(false)

    let minimumTimer:
      | ReturnType<typeof setTimeout>
      | undefined
    let timeoutTimer:
      | ReturnType<typeof setTimeout>
      | undefined

    const minimumSplashPromise = new Promise<void>(resolve => {
      minimumTimer = setTimeout(
        resolve,
        UI.splashDuration,
      )
    })

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutTimer = setTimeout(() => {
        reject(new Error('Worker session restoration timed out'))
      }, AUTH_RESTORE_TIMEOUT_MS)
    })

    async function initialize() {
      try {
        const [authState] = await Promise.all([
          Promise.race([
            getWorkerAuthState(),
            timeoutPromise,
          ]),
          minimumSplashPromise,
        ])

        if (!mounted) {
          return
        }

        onFinishedRef.current(authState)
      } catch {
        await minimumSplashPromise

        if (!mounted) {
          return
        }

        // A network or session-restoration failure does not prove
        // that the worker is logged out. Keep the worker on this
        // screen and let them retry instead of routing to Login.
        console.warn(
          'Unable to restore worker session. Retry required.',
        )
        setRestoreError(true)
      } finally {
        if (minimumTimer !== undefined) {
          clearTimeout(minimumTimer)
        }

        if (timeoutTimer !== undefined) {
          clearTimeout(timeoutTimer)
        }
      }
    }

    void initialize()

    return () => {
      mounted = false
    }
  }, [retryAttempt])

  return (
    <View style={styles.container}>
      <Image
        source={splashImage}
        style={styles.image}
        resizeMode="cover"
        accessible
        accessibilityLabel="KvikStaff Worker"
      />

      {restoreError ? (
        <View style={styles.errorOverlay}>
          <View style={styles.errorContent}>
            <Text style={styles.errorTitle}>
              Unable to connect
            </Text>

            <Text style={styles.errorMessage}>
              We could not restore your worker session.
              Check your internet connection and try again.
            </Text>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Retry session restoration"
              onPress={() => {
                setRetryAttempt(current => current + 1)
              }}
              style={({ pressed }) => [
                styles.retryButton,
                pressed && styles.retryButtonPressed,
              ]}
            >
              <Text style={styles.retryButtonText}>
                Try Again
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: UI.colors.background,
  },

  image: {
    width: '100%',
    height: '100%',
  },

  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    backgroundColor: UI.colors.background,
  },

  errorContent: {
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
  },

  errorTitle: {
    color: UI.colors.primary,
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
  },

  errorMessage: {
    marginTop: 12,
    color: UI.colors.textSecondary,
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'center',
  },

  retryButton: {
    minHeight: 50,
    minWidth: 160,
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: UI.colors.primary,
  },

  retryButtonPressed: {
    opacity: 0.78,
  },

  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
})
