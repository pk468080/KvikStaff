import {
  useCallback,
  useEffect,
  useRef,
} from 'react'

import * as Notifications from 'expo-notifications'

import {
  useNavigation,
} from '@react-navigation/native'

import type {
  NativeStackNavigationProp,
} from '@react-navigation/native-stack'

import {
  Alert,
} from 'react-native'

import {
  markWorkerNotificationRead,
} from '../../services/notifications/workerNotificationActions.service'

import type {
  WorkerStackParamList,
} from '../../types/navigation'

type WorkerStackNavigation =
  NativeStackNavigationProp<
    WorkerStackParamList
  >

type WorkerNotificationRouterProps = {
  onBookingPress: (
    bookingId: string,
  ) => void

  onBookingOfferPress: (
    bookingId: string,
  ) => void
}

type NotificationData = {
  notification_id?: unknown
  booking_id?: unknown
  notification_type?: unknown
}

function getString(
  value: unknown,
): string | null {
  if (
    typeof value !==
    'string'
  ) {
    return null
  }

  const trimmed =
    value.trim()

  return trimmed || null
}

export default function WorkerNotificationRouter({
  onBookingPress,
  onBookingOfferPress,
}: WorkerNotificationRouterProps) {
  const navigation =
    useNavigation<WorkerStackNavigation>()

  const handledNotificationIds =
    useRef(
      new Set<string>(),
    )

  const handlingRef =
    useRef(false)

  const handleNotificationResponse =
    useCallback(
      async (
        response: Notifications.NotificationResponse,
      ): Promise<void> => {
        if (
          handlingRef.current
        ) {
          return
        }

        const data =
          (
            response
              .notification
              .request
              .content
              .data ??
            {}
          ) as NotificationData

        const notificationId =
          getString(
            data.notification_id,
          )

        const bookingId =
          getString(
            data.booking_id,
          )

        const notificationType =
          getString(
            data.notification_type,
          )

        if (
          notificationId &&
          handledNotificationIds.current.has(
            notificationId,
          )
        ) {
          return
        }

        if (
          notificationId
        ) {
          handledNotificationIds.current.add(
            notificationId,
          )

          if (
            handledNotificationIds.current
              .size > 50
          ) {
            const first =
              handledNotificationIds.current
                .values()
                .next()
                .value

            if (
              typeof first ===
              'string'
            ) {
              handledNotificationIds.current.delete(
                first,
              )
            }
          }
        }

        handlingRef.current =
          true

        try {
          if (
            notificationId
          ) {
            try {
              await markWorkerNotificationRead(
                notificationId,
              )
            } catch {
              /*
               * Routing must still work even if
               * read-state persistence temporarily
               * fails.
               */
            }
          }

          if (
            notificationType ===
              'booking_offer' &&
            bookingId
          ) {
            onBookingOfferPress(
              bookingId,
            )

            return
          }

          if (
            bookingId
          ) {
            onBookingPress(
              bookingId,
            )

            return
          }

          navigation.navigate(
            'Notifications',
          )
        } catch (
          cause
        ) {
          Alert.alert(
            'Notification unavailable',
            cause instanceof Error
              ? cause.message
              : 'Unable to open this notification.',
          )
        } finally {
          handlingRef.current =
            false
        }
      },
      [
        navigation,
        onBookingOfferPress,
        onBookingPress,
      ],
    )

  useEffect(() => {
    const subscription =
      Notifications.addNotificationResponseReceivedListener(
        response => {
          void handleNotificationResponse(
            response,
          )
        },
      )

    let mounted = true

    async function loadLastResponse() {
      try {
        const response =
          await Notifications.getLastNotificationResponseAsync()

        if (
          !mounted ||
          !response
        ) {
          return
        }

        await handleNotificationResponse(
          response,
        )

        await Notifications.clearLastNotificationResponseAsync()
      } catch {
        /*
         * A notification response should never
         * prevent the worker app from starting.
         */
      }
    }

    void loadLastResponse()

    return () => {
      mounted = false
      subscription.remove()
    }
  }, [
    handleNotificationResponse,
  ])

  return null
}