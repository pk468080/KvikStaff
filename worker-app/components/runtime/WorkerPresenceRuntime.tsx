import {
  useEffect,
  useRef,
} from 'react'

import {
  useWorkerRuntime,
} from '../../context/WorkerRuntimeContext'

import {
  getWorkerPresence,
  sendWorkerPresenceHeartbeat,
  updateWorkerLocation,
} from '../../services/worker/workerPresence.service'

import {
  getCurrentWorkerLocation,
} from '../../services/location/workerLocation.service'

import {
  startWorkerBackgroundLocationTracking,
  stopWorkerBackgroundLocationTracking,
  isWorkerBackgroundLocationTrackingStarted,
} from '../../services/location/workerBackgroundLocation.service'

import {
  getActiveWorkerBookings,
} from '../../services/bookings/workerBookings.service'

import {
  supabase,
} from '../../lib/supabase'

import {
  WORKER,
} from '../../constants/worker'

const PRESENCE_POLL_INTERVAL_MS =
  15_000

const FOREGROUND_FALLBACK_INTERVAL_MS =
  WORKER.presence
    .heartbeatIntervalSeconds *
  1000

const ACTIVE_FOREGROUND_FALLBACK_INTERVAL_MS =
  WORKER.location
    .activeBookingUpdateIntervalSeconds *
  1000

const BACKGROUND_RETRY_DELAY_MS =
  5 * 60 * 1000

const LIVE_TRACKING_STATUSES = [
  'on_the_way',
  'arrived',
  'in_progress',
] as const

export default function WorkerPresenceRuntime() {
  const {
    session,
  } = useWorkerRuntime()

  const stoppedRef =
    useRef(false)

  useEffect(() => {
    if (
      !session?.user?.id
    ) {
      return
    }

    const workerId =
      session.user.id

    stoppedRef.current =
      false

    let backgroundTrackingAttempted =
      false

    let backgroundTrackingIntervalSeconds:
      number | null = null

    let backgroundUnavailableUntil =
      0

    let lastLocationPublishAt =
      0

    let inFlight =
      false

    async function stopBackgroundTracking(): Promise<void> {
      try {
        await stopWorkerBackgroundLocationTracking()
      } catch (cause) {
        console.warn(
          'Unable to stop worker background location tracking:',
          cause,
        )
      }

      backgroundTrackingAttempted =
        false

      backgroundTrackingIntervalSeconds =
        null
    }

    async function hasActiveTrackingBooking(): Promise<boolean> {
      /*
       * Normal parent bookings.
       */
      const activeBookings =
        await getActiveWorkerBookings()

      const hasLiveParentBooking =
        activeBookings.some(
          booking =>
            LIVE_TRACKING_STATUSES.includes(
              booking.status as (
                typeof LIVE_TRACKING_STATUSES
              )[number],
            ),
        )

      if (
        hasLiveParentBooking
      ) {
        return true
      }

      /*
       * Recurring bookings use
       * occurrence-level lifecycle states.
       */
      const {
        data,
        error,
      } = await supabase
        .from(
          'booking_schedule_occurrences',
        )
        .select('id')
        .eq(
          'worker_id',
          workerId,
        )
        .in(
          'status',
          [
            ...LIVE_TRACKING_STATUSES,
          ],
        )
        .limit(1)

      if (error) {
        throw error
      }

      return (
        (data?.length ?? 0) >
        0
      )
    }

    async function ensureBackgroundTracking(
      activeTrackingBooking: boolean,
    ): Promise<boolean> {
      const desiredInterval =
        activeTrackingBooking
          ? WORKER.location
              .activeBookingUpdateIntervalSeconds
          : WORKER.location
              .defaultUpdateIntervalSeconds

      /*
       * Avoid repeatedly requesting background
       * permission after a denial/failure.
       */
      if (
        Date.now() <
        backgroundUnavailableUntil
      ) {
        return false
      }

      if (
        backgroundTrackingAttempted &&
        backgroundTrackingIntervalSeconds ===
          desiredInterval
      ) {
        try {
          const started =
            await isWorkerBackgroundLocationTrackingStarted()

          if (started) {
            return true
          }
        } catch {
          /*
           * Fall through and attempt to
           * restore the background task.
           */
        }

        backgroundTrackingAttempted =
          false

        backgroundTrackingIntervalSeconds =
          null
      }

      if (
        backgroundTrackingAttempted
      ) {
        try {
          await stopWorkerBackgroundLocationTracking()
        } catch {
          /*
           * Continue with a fresh start attempt.
           */
        }

        backgroundTrackingAttempted =
          false

        backgroundTrackingIntervalSeconds =
          null
      }

      try {
        await startWorkerBackgroundLocationTracking(
          desiredInterval,
        )

        const started =
          await isWorkerBackgroundLocationTrackingStarted()

        if (!started) {
          throw new Error(
            'Background location tracking did not start.',
          )
        }

        backgroundTrackingAttempted =
          true

        backgroundTrackingIntervalSeconds =
          desiredInterval

        backgroundUnavailableUntil =
          0

        return true
      } catch (cause) {
        console.warn(
          'Worker background location tracking is unavailable. Using foreground fallback:',
          cause,
        )

        backgroundTrackingAttempted =
          false

        backgroundTrackingIntervalSeconds =
          null

        backgroundUnavailableUntil =
          Date.now() +
          BACKGROUND_RETRY_DELAY_MS

        return false
      }
    }

    async function publishForegroundFallback(
      workerIsAvailable: boolean,
      activeTrackingBooking: boolean,
    ): Promise<void> {
      const now =
        Date.now()

      const minimumInterval =
        activeTrackingBooking
          ? ACTIVE_FOREGROUND_FALLBACK_INTERVAL_MS
          : FOREGROUND_FALLBACK_INTERVAL_MS

      if (
        now -
          lastLocationPublishAt <
        minimumInterval
      ) {
        return
      }

      const location =
        await getCurrentWorkerLocation(
          {
            maximumAge:
              5_000,

            timeout:
              10_000,
          },
        )

      if (
        stoppedRef.current
      ) {
        return
      }

      /*
       * Available worker:
       * renew presence and publish generic
       * worker location.
       */
      if (
        workerIsAvailable &&
        !activeTrackingBooking
      ) {
        await sendWorkerPresenceHeartbeat(
          location.latitude,
          location.longitude,
        )

        lastLocationPublishAt =
          Date.now()

        return
      }

      /*
       * Active booking:
       * publish one generic location.
       *
       * The server-side function copies it
       * into the currently active parent/recurring
       * booking locations.
       */
      if (
        activeTrackingBooking
      ) {
        await updateWorkerLocation(
          location.latitude,
          location.longitude,
          null,
        )

        lastLocationPublishAt =
          Date.now()
      }
    }

    async function runCycle(): Promise<void> {
      if (
        stoppedRef.current ||
        inFlight
      ) {
        return
      }

      inFlight =
        true

      try {
        const presence =
          await getWorkerPresence()

        if (
          stoppedRef.current
        ) {
          return
        }

        const workerIsAvailable =
          presence?.status ===
          'available'

        const activeTrackingBooking =
          await hasActiveTrackingBooking()

        if (
          stoppedRef.current
        ) {
          return
        }

        const shouldTrackLocation =
          workerIsAvailable ||
          activeTrackingBooking

        if (
          !shouldTrackLocation
        ) {
          if (
            backgroundTrackingAttempted
          ) {
            await stopBackgroundTracking()
          }

          return
        }

        const backgroundTrackingActive =
          await ensureBackgroundTracking(
            activeTrackingBooking,
          )

        if (
          stoppedRef.current
        ) {
          return
        }

        /*
         * Background tracking is the primary
         * GPS publisher.
         *
         * Do not publish another foreground
         * GPS update while it is running.
         */
        if (
          backgroundTrackingActive
        ) {
          return
        }

        /*
         * Background tracking is unavailable,
         * so use the foreground fallback.
         */
        await publishForegroundFallback(
          workerIsAvailable,
          activeTrackingBooking,
        )
      } catch (cause) {
        console.warn(
          'Worker presence runtime update failed:',
          cause,
        )
      } finally {
        inFlight =
          false
      }
    }

    void runCycle()

    const intervalId =
      setInterval(
        () => {
          void runCycle()
        },
        PRESENCE_POLL_INTERVAL_MS,
      )

    return () => {
      stoppedRef.current =
        true

      clearInterval(
        intervalId,
      )

      void stopBackgroundTracking()
    }
  }, [
    session?.user?.id,
  ])

  return null
}