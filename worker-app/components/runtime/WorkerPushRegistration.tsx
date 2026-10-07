
import {
  useEffect,
} from 'react'

import {
  Platform,
} from 'react-native'

import Constants from 'expo-constants'

import * as Notifications from 'expo-notifications'

import {
  useWorkerRuntime,
} from '../../context/WorkerRuntimeContext'

import {
  clearCurrentWorkerPushToken,
  registerWorkerPushToken,
} from '../../services/notifications/workerNotifications.service'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
})

function getExpoProjectId(): string | null {
  const projectId =
    Constants.expoConfig?.extra?.eas
      ?.projectId ??
    Constants.easConfig?.projectId ??
    null

  if (
    typeof projectId !==
    'string'
  ) {
    return null
  }

  const trimmed =
    projectId.trim()

  return trimmed || null
}

async function configureAndroidNotifications(): Promise<void> {
  if (
    Platform.OS !==
    'android'
  ) {
    return
  }

  await Notifications.setNotificationChannelAsync(
  'booking-assignment',
  {
      name:
        'KvikStaff Worker',
      importance:
        Notifications.AndroidImportance.MAX,
      vibrationPattern: [
        0,
        250,
        250,
        250,
      ],
    },
  )
}

async function registerPushToken(): Promise<void> {
  try {
    await configureAndroidNotifications()

    const {
      status: existingStatus,
    } =
      await Notifications.getPermissionsAsync()

    let finalStatus =
      existingStatus

    if (
      existingStatus !==
      'granted'
    ) {
      const {
        status,
      } =
        await Notifications.requestPermissionsAsync()

      finalStatus =
        status
    }

    if (
      finalStatus !==
      'granted'
    ) {
      console.warn(
        'Worker push notification permission was not granted.',
      )

      return
    }

    const projectId =
      getExpoProjectId()

    if (!projectId) {
      console.warn(
        'Worker push token registration skipped because the Expo/EAS projectId is not configured.',
      )

      return
    }

    const tokenResponse =
      await Notifications.getExpoPushTokenAsync({
        projectId,
      })

    const token =
      tokenResponse.data?.trim()

    if (!token) {
      throw new Error(
        'Expo did not return a push token.',
      )
    }

    const platform =
      Platform.OS ===
      'ios'
        ? 'ios'
        : Platform.OS ===
            'android'
          ? 'android'
          : 'web'

    await registerWorkerPushToken(
      token,
      platform,
    )

    console.log(
      'Worker push token registered successfully.',
    )
  } catch (cause) {
    console.error(
      'Worker push token registration failed:',
      cause,
    )
  }
}

export default function WorkerPushRegistration() {
  const {
    session,
  } = useWorkerRuntime()

  useEffect(() => {
    if (!session?.user?.id) {
      clearCurrentWorkerPushToken()

      return
    }

    void registerPushToken()

    return () => {
      clearCurrentWorkerPushToken()
    }
  }, [
    session?.user?.id,
  ])

  return null
}