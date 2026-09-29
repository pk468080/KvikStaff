import * as Location from 'expo-location'
import * as TaskManager from 'expo-task-manager'

import {
  WORKER,
} from '../../constants/worker'

import {
  ensureWorkerBackgroundLocationPermission,
} from './workerLocation.service'

import {
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

      /*
       * A single background GPS event uses a single RPC.
       *
       * The database function:
       * - records generic worker location
       * - renews worker presence when the worker is available
       * - copies the location into active booking rows
       * - copies recurring active-booking location as needed
       * - updates worker_profiles.current_location
       *
       * This avoids the previous duplicate heartbeat +
       * location-write sequence.
       */
      const result =
        await updateWorkerLocation(
          latitude,
          longitude,
          null,
        )

      /*
       * Do not log latitude/longitude in production.
       * Location data is privacy-sensitive.
       */
      if (__DEV__) {
        console.log(
          '[WorkerLocationTask] Location published at:',
          result.recordedAt,
        )
      }
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
   * Restart an already-running task so a changed interval
   * takes effect immediately.
   */
  const alreadyStarted =
    await isWorkerBackgroundLocationTrackingStarted()

  if (alreadyStarted) {
    await Location.stopLocationUpdatesAsync(
      WORKER_BACKGROUND_LOCATION_TASK,
    )
  }

  if (__DEV__) {
    console.log(
      `[WorkerLocation] Starting background tracking every ${safeIntervalSeconds}s`,
    )
  }

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
       * Do not intentionally batch updates.
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