import * as Location from 'expo-location'
import * as TaskManager from 'expo-task-manager'

import {
  WORKER,
} from '../../constants/worker'

import {
  ensureWorkerBackgroundLocationPermission,
} from './workerLocation.service'

import {
  sendWorkerPresenceHeartbeat,
  updateWorkerLocation,
} from '../worker/workerPresence.service'

export const WORKER_BACKGROUND_LOCATION_TASK =
  'tempstaff-worker-background-location'

type BackgroundLocationTaskData = {
  locations?: Location.LocationObject[]
}

function mapLocation(
  location: Location.LocationObject,
): {
  latitude: number
  longitude: number
} {
  const latitude =
    location.coords.latitude

  const longitude =
    location.coords.longitude

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    throw new Error(
      'Background worker location coordinates are invalid.',
    )
  }

  if (
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new Error(
      'Background worker location coordinates are outside the valid range.',
    )
  }

  return {
    latitude,
    longitude,
  }
}

TaskManager.defineTask(
  WORKER_BACKGROUND_LOCATION_TASK,
  async ({
    data,
    error,
  }) => {
    if (error) {
      return
    }

    const taskData =
      data as
        | BackgroundLocationTaskData
        | undefined

    const locations =
      taskData?.locations ?? []

    if (
      locations.length === 0
    ) {
      return
    }

    const latestLocation =
      locations[
        locations.length - 1
      ]

    try {
      const {
        latitude,
        longitude,
      } = mapLocation(
        latestLocation,
      )

      /*
       * Available workers use the presence
       * heartbeat.
       *
       * Workers handling an active booking
       * fall through to updateWorkerLocation()
       * so the booking-scoped location rows
       * are written.
       */
      try {
        const result =
          await sendWorkerPresenceHeartbeat(
            latitude,
            longitude,
          )

        if (
          result.status ===
          'available'
        ) {
          return
        }
      } catch {
        /*
         * Busy/tracking workers may not be
         * eligible for the presence heartbeat.
         * Continue with the generic location
         * update so active bookings receive it.
         */
      }

      await updateWorkerLocation(
        latitude,
        longitude,
        null,
      )
    } catch {
      /*
       * Background tasks should not throw for
       * transient location/auth/network errors.
       */
    }
  },
)

export async function isWorkerBackgroundLocationTrackingAvailable(): Promise<boolean> {
  return Location.isBackgroundLocationAvailableAsync()
}

export async function isWorkerBackgroundLocationTrackingStarted(): Promise<boolean> {
  return Location.hasStartedLocationUpdatesAsync(
    WORKER_BACKGROUND_LOCATION_TASK,
  )
}

export async function startWorkerBackgroundLocationTracking(
  intervalSeconds: number = WORKER.location
    .defaultUpdateIntervalSeconds,
): Promise<void> {
  await ensureWorkerBackgroundLocationPermission()

  const servicesEnabled =
    await Location.hasServicesEnabledAsync()

  if (!servicesEnabled) {
    throw new Error(
      'Device location services are disabled.',
    )
  }

  const available =
    await isWorkerBackgroundLocationTrackingAvailable()

  if (!available) {
    throw new Error(
      'Background location tracking is not available on this device.',
    )
  }

  if (
    !Number.isFinite(
      intervalSeconds,
    ) ||
    intervalSeconds <= 0
  ) {
    throw new Error(
      'Worker background location interval must be greater than zero.',
    )
  }

  const safeIntervalSeconds =
    Math.max(
      1,
      Math.trunc(
        intervalSeconds,
      ),
    )

  const intervalMs =
    safeIntervalSeconds *
    1000

  const alreadyStarted =
    await isWorkerBackgroundLocationTrackingStarted()

  if (alreadyStarted) {
    return
  }

  await Location.startLocationUpdatesAsync(
    WORKER_BACKGROUND_LOCATION_TASK,
    {
      accuracy:
        Location.Accuracy.Balanced,

      /*
       * Active booking:
       * 10 seconds from WORKER.location.
       *
       * Normal/available:
       * 30 seconds from WORKER.location.
       */
      timeInterval:
        intervalMs,

      /*
       * The worker may also publish when they
       * have moved the configured minimum distance.
       */
      distanceInterval:
        WORKER.location
          .minimumDistanceMeters,

      pausesUpdatesAutomatically:
        false,

      showsBackgroundLocationIndicator:
        true,

      activityType:
        Location.ActivityType.OtherNavigation,

      /*
       * Avoid aggressive batching. The interval
       * above remains the requested update cadence.
       */
      deferredUpdatesDistance:
        0,

      deferredUpdatesInterval:
        intervalMs,
    },
  )
}

export async function stopWorkerBackgroundLocationTracking(): Promise<void> {
  const started =
    await isWorkerBackgroundLocationTrackingStarted()

  if (!started) {
    return
  }

  await Location.stopLocationUpdatesAsync(
    WORKER_BACKGROUND_LOCATION_TASK,
  )
}

export async function restartWorkerBackgroundLocationTracking(
  intervalSeconds: number = WORKER.location
    .defaultUpdateIntervalSeconds,
): Promise<void> {
  await stopWorkerBackgroundLocationTracking()

  await startWorkerBackgroundLocationTracking(
    intervalSeconds,
  )
}