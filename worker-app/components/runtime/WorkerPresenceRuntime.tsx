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

const HEARTBEAT_INTERVAL_MS =
  WORKER.presence
    .heartbeatIntervalSeconds *
  1000

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

    stoppedRef.current = false

    let backgroundTrackingAttempted =
      false

    let backgroundTrackingIntervalSeconds:
      number | null = null

    let lastHeartbeatAt = 0

    let inFlight = false

    async function stopBackgroundTracking() {
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
       * Parent bookings.
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

      if (hasLiveParentBooking) {
        return true
      }

      /*
       * Recurring bookings use occurrence-level
       * lifecycle states.
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
    ) {
      const desiredInterval =
        activeTrackingBooking
          ? WORKER.location
              .activeBookingUpdateIntervalSeconds
          : WORKER.location
              .defaultUpdateIntervalSeconds

      if (
        backgroundTrackingAttempted &&
        backgroundTrackingIntervalSeconds ===
          desiredInterval
      ) {
        return
      }

      if (
        backgroundTrackingAttempted
      ) {
        await stopWorkerBackgroundLocationTracking()

        backgroundTrackingAttempted =
          false

        backgroundTrackingIntervalSeconds =
          null
      }

      try {
        await startWorkerBackgroundLocationTracking(
          desiredInterval,
        )

        backgroundTrackingAttempted =
          true

        backgroundTrackingIntervalSeconds =
          desiredInterval
      } catch (cause) {
        console.warn(
          'Worker background location tracking is unavailable:',
          cause,
        )

        backgroundTrackingAttempted =
          false

        backgroundTrackingIntervalSeconds =
          null
      }
    }

    async function runCycle() {
      if (
        stoppedRef.current ||
        inFlight
      ) {
        return
      }

      inFlight = true

      try {
        const presence =
          await getWorkerPresence()

        if (stoppedRef.current) {
          return
        }

        const workerIsAvailable =
          presence?.status ===
          'available'

        const activeTrackingBooking =
          await hasActiveTrackingBooking()

        if (stoppedRef.current) {
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

        await ensureBackgroundTracking(
          activeTrackingBooking,
        )

        if (stoppedRef.current) {
          return
        }

        const now =
          Date.now()

        /*
         * Background location is the primary
         * high-frequency source.
         *
         * This foreground update remains as
         * a fallback/initial update.
         */
        if (
          activeTrackingBooking
        ) {
          if (
            now -
              lastHeartbeatAt <
            WORKER.location
              .activeBookingUpdateIntervalSeconds *
              1000
          ) {
            return
          }
        } else if (
          now -
            lastHeartbeatAt <
          HEARTBEAT_INTERVAL_MS
        ) {
          return
        }

        const location =
          await getCurrentWorkerLocation(
            {
              accuracy:
                activeTrackingBooking
                  ? undefined
                  : undefined,

              maximumAge: 5_000,

              timeout: 10_000,
            },
          )

        if (stoppedRef.current) {
          return
        }

        if (
          workerIsAvailable &&
          !activeTrackingBooking
        ) {
          await sendWorkerPresenceHeartbeat(
            location.latitude,
            location.longitude,
          )
        } else if (
          activeTrackingBooking
        ) {
          await updateWorkerLocation(
            location.latitude,
            location.longitude,
            null,
          )
        }

        lastHeartbeatAt =
          Date.now()
      } catch (cause) {
        console.warn(
          'Worker presence runtime update failed:',
          cause,
        )
      } finally {
        inFlight = false
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
      stoppedRef.current = true

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