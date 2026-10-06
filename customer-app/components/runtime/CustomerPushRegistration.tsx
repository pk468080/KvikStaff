import {
  useEffect,
  useRef,
} from 'react'

import {
  Platform,
} from 'react-native'

import Constants from 'expo-constants'
import * as Notifications from 'expo-notifications'

import {
  markCustomerNotificationRead,
  registerCustomerPushToken,
} from '../../services/notifications/customerNotifications.service'
import {
  handleCustomerNotificationResponse,
} from '../../services/notifications/customerNotificationResponse'

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
        'KvikStaff Customer',
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

export default function CustomerPushRegistration({
  onOpenBooking,
}: {
  onOpenBooking: (
    bookingId: string,
  ) => void
}) {
  const handledNotificationId =
    useRef<string | null>(
      null,
    )

  const latestOnOpenBookingRef =
    useRef(onOpenBooking)

  const registeredTokenRef =
    useRef<string | null>(
      null,
    )

  const registrationPromiseRef =
    useRef<Promise<void> | null>(
      null,
    )

  useEffect(() => {
    latestOnOpenBookingRef.current =
      onOpenBooking
  }, [
    onOpenBooking,
  ])

  useEffect(() => {
    const registerPushToken = async (): Promise<void> => {
      if (
        registrationPromiseRef.current
      ) {
        return registrationPromiseRef.current
      }

      const registrationPromise =
        (async () => {
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
            throw new Error(
              'Notification permission was not granted.',
            )
          }

          const projectId =
            getExpoProjectId()

          if (!projectId) {
            throw new Error(
              'Expo/EAS projectId is not configured.',
            )
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

          if (
            registeredTokenRef.current ===
            token
          ) {
            return
          }

          const platform =
            Platform.OS === 'ios'
              ? 'ios'
              : Platform.OS === 'android'
                ? 'android'
                : 'web'

          await registerCustomerPushToken(
            token,
            platform,
          )

          registeredTokenRef.current =
            token

          console.log(
            'Customer push token registered successfully.',
          )
        })().finally(() => {
          registrationPromiseRef.current =
            null
        })

      registrationPromiseRef.current =
        registrationPromise

      return registrationPromise
    }

    void registerPushToken().catch(
      error => {
        console.error(
          'Customer push registration failed:',
          error,
        )
      },
    )

    const pushTokenSubscription =
      Notifications.addPushTokenListener(
        () => {
          void registerPushToken().catch(
            error => {
              console.error(
                'Customer push token refresh failed:',
                error,
              )
            },
          )
        },
      )

    function handleNotificationResponse(
      response: Notifications.NotificationResponse,
    ): void {
      const data =
        response.notification
          .request.content.data

      void handleCustomerNotificationResponse(
        data,
        handledNotificationId,
        markCustomerNotificationRead,
        bookingId =>
          latestOnOpenBookingRef.current(
            bookingId,
          ),
      )
    }

    const responseSubscription =
      Notifications.addNotificationResponseReceivedListener(
        handleNotificationResponse,
      )

    void Notifications.getLastNotificationResponseAsync()
      .then(response => {
        if (response) {
          handleNotificationResponse(
            response,
          )
        }
      })
      .catch(error => {
        console.error(
          'Unable to read the last customer notification response:',
          error,
        )
      })

    return () => {
      pushTokenSubscription.remove()
      responseSubscription.remove()
    }
  }, [])

  return null
}