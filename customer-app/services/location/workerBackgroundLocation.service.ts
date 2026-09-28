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

    if (!latestLocation) {
      return
    }

    try {
      const {
        latitude,
        longitude,
      } = mapLocation(
        latestLocation,
      )

      /*
       * Available worker:
       * refresh presence + generic location.
       *
       * Busy/active worker:
       * worker_presence_heartbeat() will reject
       * because the worker is no longer available.
       * We then fall through to worker_update_location()
       * which creates booking-scoped rows for the
       * active booking(s).
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
         * Worker is probably busy with an active booking.
         * Continue with booking-scoped location update.
         */
      }

      await updateWorkerLocation(
        latitude,
        longitude,
        null,
      )
    } catch {
      /*
       * A transient background location,
       * authentication, or network failure
       * must not crash the task.
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
  intervalSeconds: number =
    WORKER.location
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

  const alreadyStarted =
    await isWorkerBackgroundLocationTrackingStarted()

  if (alreadyStarted) {
    return
  }

  const safeIntervalSeconds =
    Number.isFinite(
      intervalSeconds,
    ) &&
    intervalSeconds > 0
      ? Math.trunc(
          intervalSeconds,
        )
      : WORKER.location
          .defaultUpdateIntervalSeconds

  const safeIntervalMs =
    safeIntervalSeconds * 1000

  await Location.startLocationUpdatesAsync(
    WORKER_BACKGROUND_LOCATION_TASK,
    {
      accuracy:
        Location.Accuracy.High,

      distanceInterval:
        WORKER.location
          .minimumDistanceMeters,

      timeInterval:
        safeIntervalMs,

      pausesUpdatesAutomatically:
        false,

      showsBackgroundLocationIndicator:
        true,

      activityType:
        Location.ActivityType.OtherNavigation,

      deferredUpdatesDistance:
        WORKER.location
          .minimumDistanceMeters,

      deferredUpdatesInterval:
        safeIntervalMs,
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
  intervalSeconds: number =
    WORKER.location
      .defaultUpdateIntervalSeconds,
): Promise<void> {
  await stopWorkerBackgroundLocationTracking()

  await startWorkerBackgroundLocationTracking(
    intervalSeconds,
  )
}