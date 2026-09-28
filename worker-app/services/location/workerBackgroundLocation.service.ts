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
      console.warn(
        '[WorkerLocationTask] Background location task error:',
        error,
      )

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

      console.log(
        '[WorkerLocationTask] Received location:',
        latitude,
        longitude,
      )

      /*
       * Refresh worker presence when possible.
       *
       * IMPORTANT:
       * Do NOT return when heartbeat succeeds.
       *
       * An active booking also needs a booking-scoped
       * worker_locations row. updateWorkerLocation(...)
       * with null booking_id copies the location into
       * active booking rows on the database side.
       */
      try {
        await sendWorkerPresenceHeartbeat(
          latitude,
          longitude,
        )
      } catch (
        heartbeatError
      ) {
        console.warn(
          '[WorkerLocationTask] Presence heartbeat unavailable:',
          heartbeatError,
        )
      }

      /*
       * Always publish the generic worker location.
       *
       * The database function is responsible for copying
       * this position into active booking-scoped rows.
       */
      const result =
        await updateWorkerLocation(
          latitude,
          longitude,
          null,
        )

      console.log(
        '[WorkerLocationTask] Location published:',
        result.latitude,
        result.longitude,
        result.recordedAt,
      )
    } catch (
      taskError
    ) {
      console.warn(
        '[WorkerLocationTask] Failed to publish location:',
        taskError,
      )
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
    WORKER.location.defaultUpdateIntervalSeconds,
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

  /*
   * If an old task is already running, stop it first.
   *
   * This is important because the previous task may have
   * been started with the old 30-second configuration.
   */
  const alreadyStarted =
    await isWorkerBackgroundLocationTrackingStarted()

  if (alreadyStarted) {
    await Location.stopLocationUpdatesAsync(
      WORKER_BACKGROUND_LOCATION_TASK,
    )
  }

  console.log(
    `[WorkerLocation] Starting background tracking every ${safeIntervalSeconds}s`,
  )

  await Location.startLocationUpdatesAsync(
    WORKER_BACKGROUND_LOCATION_TASK,
    {
      accuracy:
        Location.Accuracy.Balanced,

      timeInterval:
        intervalMs,

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
       * Do not batch the updates.
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
  intervalSeconds: number =
    WORKER.location.defaultUpdateIntervalSeconds,
): Promise<void> {
  await stopWorkerBackgroundLocationTracking()

  await startWorkerBackgroundLocationTracking(
    intervalSeconds,
  )
}