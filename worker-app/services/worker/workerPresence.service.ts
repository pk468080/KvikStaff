import { apiRequest } from '../../lib/api'

import type {
  WorkerLocation,
  WorkerPresence,
  WorkerStatus,
} from '../../types/worker'

type WorkerPresenceResponse = {
  worker_id: string
  status: WorkerStatus
  latitude: number | null
  longitude: number | null
  last_heartbeat_at: string | null
  presence_expires_at: string | null
}

type WorkerLocationResponse = {
  latitude: number
  longitude: number
  recorded_at: string
}

function mapPresence(
  data: WorkerPresenceResponse,
): WorkerPresence {
  return {
    workerId: data.worker_id,
    status: data.status,

    latitude:
      data.latitude,

    longitude:
      data.longitude,

    lastHeartbeatAt:
      data.last_heartbeat_at,

    presenceExpiresAt:
      data.presence_expires_at,
  }
}

export async function getWorkerPresence(): Promise<
  WorkerPresence | null
> {
  const data =
    await apiRequest<
      WorkerPresenceResponse | null
    >(
      '/worker/presence',
    )

  return data
    ? mapPresence(data)
    : null
}

export async function setWorkerPresence(
  available: boolean,
): Promise<WorkerPresence> {
  const data =
    await apiRequest<
      WorkerPresenceResponse
    >(
      '/worker/presence',
      {
        method: 'POST',
        body: JSON.stringify({
          available,
        }),
      },
    )

  return mapPresence(data)
}

export async function goOnline(): Promise<WorkerPresence> {
  return setWorkerPresence(true)
}

export async function goOffline(): Promise<WorkerPresence> {
  return setWorkerPresence(false)
}

export async function sendWorkerPresenceHeartbeat(
  latitude: number,
  longitude: number,
): Promise<WorkerPresence> {
  validateCoordinates(
    latitude,
    longitude,
  )

  const data =
    await apiRequest<
      WorkerPresenceResponse
    >(
      '/worker/presence/heartbeat',
      {
        method: 'POST',
        body: JSON.stringify({
          latitude,
          longitude,
        }),
      },
    )

  return mapPresence(data)
}

export async function updateWorkerLocation(
  latitude: number,
  longitude: number,
  bookingId: string | null = null,
): Promise<WorkerLocation> {
  validateCoordinates(
    latitude,
    longitude,
  )

  const data =
    await apiRequest<
      WorkerLocationResponse
    >(
      '/worker/presence/location',
      {
        method: 'POST',
        body: JSON.stringify({
          latitude,
          longitude,
          booking_id: bookingId,
        }),
      },
    )

  return {
    latitude:
      data.latitude,

    longitude:
      data.longitude,

    recordedAt:
      data.recorded_at,
  }
}

export async function getLatestLocation(): Promise<
  WorkerLocation | null
> {
  const data =
    await apiRequest<
      WorkerLocationResponse | null
    >(
      '/worker/presence/location',
    )

  if (!data) {
    return null
  }

  return {
    latitude:
      data.latitude,

    longitude:
      data.longitude,

    recordedAt:
      data.recorded_at,
  }
}

export function isPresenceExpired(
  presence: WorkerPresence | null,
  now: Date = new Date(),
): boolean {
  if (!presence?.presenceExpiresAt) {
    return true
  }

  const expiresAt =
    new Date(
      presence.presenceExpiresAt,
    )

  if (
    Number.isNaN(
      expiresAt.getTime(),
    )
  ) {
    return true
  }

  return (
    expiresAt.getTime() <=
    now.getTime()
  )
}

export function isPresenceActive(
  presence: WorkerPresence | null,
  now: Date = new Date(),
): boolean {
  return (
    presence?.status === 'available' &&
    !isPresenceExpired(
      presence,
      now,
    )
  )
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