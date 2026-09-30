import * as Location from 'expo-location'

import type {
  WorkerLocation,
} from '../../types/worker'

import {
  WORKER,
} from '../../constants/worker'

export type WorkerLocationPermissionState =
  | 'granted'
  | 'denied'
  | 'undetermined'

export type WorkerLocationPermissionResult = {
  foreground: WorkerLocationPermissionState
  background: WorkerLocationPermissionState
}

export type WorkerLocationOptions = {
  accuracy?: Location.Accuracy
  maximumAge?: number
  timeout?: number
  timeInterval?: number
}

function mapPermissionStatus(
  status: Location.PermissionStatus,
): WorkerLocationPermissionState {
  switch (status) {
    case Location.PermissionStatus.GRANTED:
      return 'granted'

    case Location.PermissionStatus.DENIED:
      return 'denied'

    default:
      return 'undetermined'
  }
}

function validateCoordinates(
  latitude: number,
  longitude: number,
): void {
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    throw new Error(
      'Worker location coordinates are invalid.',
    )
  }

  if (
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new Error(
      'Worker location coordinates are outside the valid range.',
    )
  }
}

function mapLocation(
  location: Location.LocationObject,
): WorkerLocation {
  const latitude =
    location.coords.latitude

  const longitude =
    location.coords.longitude

  validateCoordinates(
    latitude,
    longitude,
  )

  return {
    latitude,
    longitude,
    recordedAt:
      new Date(
        location.timestamp,
      ).toISOString(),
  }
}

function normalizePositiveMilliseconds(
  value: number | undefined,
): number | undefined {
  if (
    value === undefined ||
    !Number.isFinite(value) ||
    value <= 0
  ) {
    return undefined
  }

  return Math.trunc(value)
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number | undefined,
): Promise<T> {
  const normalizedTimeout =
    normalizePositiveMilliseconds(
      timeoutMs,
    )

  if (
    normalizedTimeout ===
    undefined
  ) {
    return promise
  }

  let timeoutId:
    | ReturnType<typeof setTimeout>
    | undefined

  try {
    return await Promise.race([
      promise,
      new Promise<T>(
        (_, reject) => {
          timeoutId =
            setTimeout(
              () => {
                reject(
                  new Error(
                    'Worker location request timed out.',
                  ),
                )
              },
              normalizedTimeout,
            )
        },
      ),
    ])
  } finally {
    if (
      timeoutId !== undefined
    ) {
      clearTimeout(
        timeoutId,
      )
    }
  }
}

export async function getWorkerLocationPermissions(): Promise<
  WorkerLocationPermissionResult
> {
  const foreground =
    await Location.getForegroundPermissionsAsync()

  const background =
    await Location.getBackgroundPermissionsAsync()

  return {
    foreground:
      mapPermissionStatus(
        foreground.status,
      ),

    background:
      mapPermissionStatus(
        background.status,
      ),
  }
}

export async function requestWorkerForegroundLocationPermission(): Promise<WorkerLocationPermissionState> {
  const permission =
    await Location.requestForegroundPermissionsAsync()

  return mapPermissionStatus(
    permission.status,
  )
}

export async function requestWorkerBackgroundLocationPermission(): Promise<WorkerLocationPermissionState> {
  const permission =
    await Location.requestBackgroundPermissionsAsync()

  return mapPermissionStatus(
    permission.status,
  )
}

export async function requestWorkerLocationPermissions(): Promise<
  WorkerLocationPermissionResult
> {
  const foregroundStatus =
    await requestWorkerForegroundLocationPermission()

  if (
    foregroundStatus !==
    'granted'
  ) {
    return {
      foreground:
        foregroundStatus,

      background:
        'denied',
    }
  }

  const backgroundStatus =
    await requestWorkerBackgroundLocationPermission()

  return {
    foreground:
      foregroundStatus,

    background:
      backgroundStatus,
  }
}

export async function ensureWorkerForegroundLocationPermission(): Promise<void> {
  const permission =
    await Location.getForegroundPermissionsAsync()

  if (
    mapPermissionStatus(
      permission.status,
    ) === 'granted'
  ) {
    return
  }

  const status =
    await requestWorkerForegroundLocationPermission()

  if (
    status !== 'granted'
  ) {
    throw new Error(
      'Foreground location permission is required for worker location updates.',
    )
  }
}

export async function ensureWorkerBackgroundLocationPermission(): Promise<void> {
  await ensureWorkerForegroundLocationPermission()

  const permissions =
    await getWorkerLocationPermissions()

  if (
    permissions.background ===
    'granted'
  ) {
    return
  }

  const status =
    await requestWorkerBackgroundLocationPermission()

  if (
    status !== 'granted'
  ) {
    throw new Error(
      'Background location permission is required for background worker tracking.',
    )
  }
}

export async function isWorkerLocationServicesEnabled(): Promise<boolean> {
  return Location.hasServicesEnabledAsync()
}

export async function getCurrentWorkerLocation(
  options: WorkerLocationOptions = {},
): Promise<WorkerLocation> {
  await ensureWorkerForegroundLocationPermission()

  const servicesEnabled =
    await isWorkerLocationServicesEnabled()

  if (!servicesEnabled) {
    throw new Error(
      'Device location services are disabled.',
    )
  }

  const maximumAge =
    normalizePositiveMilliseconds(
      options.maximumAge,
    )

  if (
    maximumAge !==
    undefined
  ) {
    const lastKnownLocation =
      await Location.getLastKnownPositionAsync(
        {
          maxAge:
            maximumAge,
          requiredAccuracy: 250,
        },
      )

    if (
      lastKnownLocation
    ) {
      return mapLocation(
        lastKnownLocation,
      )
    }
  }

  const locationPromise =
    Location.getCurrentPositionAsync(
      {
        accuracy:
          options.accuracy ??
          Location.Accuracy.High,

        mayShowUserSettingsDialog:
          true,
      },
    )

  const location =
    await withTimeout(
      locationPromise,
      options.timeout,
    )

  return mapLocation(
    location,
  )
}

export async function getLastKnownWorkerLocation(
  maximumAgeMs =
    WORKER.location
      .defaultUpdateIntervalSeconds *
    1000,
): Promise<WorkerLocation | null> {
  const permission =
    await Location.getForegroundPermissionsAsync()

  if (
    mapPermissionStatus(
      permission.status,
    ) !== 'granted'
  ) {
    return null
  }

  const safeMaximumAge =
    normalizePositiveMilliseconds(
      maximumAgeMs,
    ) ??
    WORKER.location
      .defaultUpdateIntervalSeconds *
    1000

  const location =
    await Location.getLastKnownPositionAsync(
      {
        maxAge:
          safeMaximumAge,
        requiredAccuracy: 250,
      },
    )

  if (!location) {
    return null
  }

  return mapLocation(
    location,
  )
}

export async function getWorkerLocationAccuracy(): Promise<number | null> {
  const permission =
    await Location.getForegroundPermissionsAsync()

  if (
    mapPermissionStatus(
      permission.status,
    ) !== 'granted'
  ) {
    return null
  }

  const servicesEnabled =
    await isWorkerLocationServicesEnabled()

  if (!servicesEnabled) {
    return null
  }

  const location =
    await Location.getCurrentPositionAsync(
      {
        accuracy:
          Location.Accuracy.Balanced,

        mayShowUserSettingsDialog:
          true,
      },
    )

  return Number.isFinite(
    location.coords.accuracy,
  )
    ? location.coords.accuracy
    : null
}

export async function watchWorkerLocation(
  callback: (
    location: WorkerLocation,
  ) => void,
  options: WorkerLocationOptions = {},
): Promise<Location.LocationSubscription> {
  await ensureWorkerForegroundLocationPermission()

  const servicesEnabled =
    await isWorkerLocationServicesEnabled()

  if (!servicesEnabled) {
    throw new Error(
      'Device location services are disabled.',
    )
  }

  const interval =
    normalizePositiveMilliseconds(
      options.timeInterval,
    ) ??
    WORKER.location
      .defaultUpdateIntervalSeconds *
    1000

  const subscription =
    await Location.watchPositionAsync(
      {
        accuracy:
          options.accuracy ??
          Location.Accuracy.High,

        distanceInterval:
          WORKER.location
            .minimumDistanceMeters,

        timeInterval:
          interval,
      },
      location => {
        callback(
          mapLocation(
            location,
          ),
        )
      },
    )

  return subscription
}

export async function stopWorkerLocationWatch(
  subscription:
    | Location.LocationSubscription
    | null
    | undefined,
): Promise<void> {
  if (!subscription) {
    return
  }

  subscription.remove()
}

export function shouldPublishWorkerLocation(
  location: WorkerLocation | null,
  previousLocation: WorkerLocation | null,
  minimumDistanceMeters =
    WORKER.location
      .minimumDistanceMeters,
): boolean {
  if (!location) {
    return false
  }

  if (!previousLocation) {
    return true
  }

  const distance =
    calculateWorkerLocationDistanceMeters(
      previousLocation,
      location,
    )

  return (
    distance >=
    minimumDistanceMeters
  )
}

export function calculateWorkerLocationDistanceMeters(
  from: WorkerLocation,
  to: WorkerLocation,
): number {
  validateCoordinates(
    from.latitude,
    from.longitude,
  )

  validateCoordinates(
    to.latitude,
    to.longitude,
  )

  const earthRadiusMeters =
    6371000

  const latitudeDelta =
    toRadians(
      to.latitude -
        from.latitude,
    )

  const longitudeDelta =
    toRadians(
      to.longitude -
        from.longitude,
    )

  const fromLatitude =
    toRadians(
      from.latitude,
    )

  const toLatitude =
    toRadians(
      to.latitude,
    )

  const a =
    Math.sin(
      latitudeDelta / 2,
    ) ** 2 +
    Math.cos(
      fromLatitude,
    ) *
      Math.cos(
        toLatitude,
      ) *
      Math.sin(
        longitudeDelta / 2,
      ) ** 2

  const c =
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a),
    )

  return (
    earthRadiusMeters *
    c
  )
}

export function isWorkerLocationFresh(
  location: WorkerLocation | null,
  maxAgeSeconds =
    WORKER.location
      .defaultUpdateIntervalSeconds *
    3,
  now: Date = new Date(),
): boolean {
  if (!location) {
    return false
  }

  const recordedAt =
    new Date(
      location.recordedAt,
    )

  if (
    Number.isNaN(
      recordedAt.getTime(),
    )
  ) {
    return false
  }

  const ageMs =
    now.getTime() -
    recordedAt.getTime()

  return (
    ageMs >= 0 &&
    ageMs <=
      maxAgeSeconds * 1000
  )
}

function toRadians(
  degrees: number,
): number {
  return (
    degrees *
    (Math.PI / 180)
  )
}