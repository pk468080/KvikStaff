
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'

import type {
  WorkerLocation,
  WorkerPresence,
} from '../types/worker'

import {
  getWorkerPresence,
  goOnline,
  goOffline,
  sendWorkerPresenceHeartbeat,
  updateWorkerLocation,
} from '../services/worker/workerPresence.service'

import {
  getCurrentWorkerLocation,
} from '../services/location/workerLocation.service'

export type UseWorkerPresenceResult = {
  presence: WorkerPresence | null
  loading: boolean
  updating: boolean
  error: string | null

  isOnline: boolean
  isExpired: boolean

  refresh: () => Promise<void>

  goOnline: (
    location?: WorkerLocation,
  ) => Promise<WorkerPresence>

  goOffline: () => Promise<WorkerPresence>

  heartbeat: (
    location?: WorkerLocation,
  ) => Promise<WorkerPresence>

  updateLocation: (
    location?: WorkerLocation,
  ) => Promise<WorkerLocation>

  clearError: () => void
}

export function useWorkerPresence(
  autoLoad = true,
): UseWorkerPresenceResult {
  const [presence, setPresence] =
    useState<WorkerPresence | null>(null)

  const [loading, setLoading] =
    useState(autoLoad)

  const [updating, setUpdating] =
    useState(false)

  const [error, setError] =
    useState<string | null>(null)

  const mountedRef = useRef(false)

  // Reset the mounted flag on every effect setup.
  // This also handles React Strict Mode's development effect cycle.
  useEffect(() => {
    mountedRef.current = true

    return () => {
      mountedRef.current = false
    }
  }, [])

  const refresh = useCallback(
    async (): Promise<void> => {
      setLoading(true)
      setError(null)

      try {
        const currentPresence =
          await getWorkerPresence()

        if (mountedRef.current) {
          setPresence(currentPresence)
        }
      } catch (cause) {
        const message =
          cause instanceof Error
            ? cause.message
            : 'Unable to load worker presence.'

        if (mountedRef.current) {
          setError(message)
        }
      } finally {
        if (mountedRef.current) {
          setLoading(false)
        }
      }
    },
    [],
  )

  useEffect(() => {
    if (!autoLoad) {
      return
    }

    void refresh()
  }, [autoLoad, refresh])

  const resolveLocation = useCallback(
    async (
      location?: WorkerLocation,
    ): Promise<WorkerLocation> => {
      if (location) {
        return location
      }

      return getCurrentWorkerLocation()
    },
    [],
  )

  const setOnline = useCallback(
    async (
      location?: WorkerLocation,
    ): Promise<WorkerPresence> => {
      setUpdating(true)
      setError(null)

      // GPS failure occurs before the backend online request.
      // Only attempt rollback once that request has started.
      let onlineRequestStarted = false

      try {
        const resolvedLocation =
          await resolveLocation(location)

        onlineRequestStarted = true

        await goOnline()

        const nextHeartbeat =
          await sendWorkerPresenceHeartbeat(
            resolvedLocation.latitude,
            resolvedLocation.longitude,
          )

        if (mountedRef.current) {
          setPresence(nextHeartbeat)
        }

        return nextHeartbeat
      } catch (cause) {
        const message =
          cause instanceof Error
            ? cause.message
            : 'Unable to set worker status to online.'

        // Display the error before attempting rollback.
        if (mountedRef.current) {
          setError(message)
        }

        // If GPS failed, the backend online request was never
        // started, so do not make an unnecessary offline request.
        if (onlineRequestStarted) {
          try {
            const rolledBackPresence =
              await goOffline()

            if (mountedRef.current) {
              setPresence(rolledBackPresence)
            }
          } catch (rollbackError) {
            console.error(
              'Unable to roll back worker online status:',
              rollbackError,
            )
          }
        }

        throw cause
      } finally {
        if (mountedRef.current) {
          setUpdating(false)
        }
      }
    },
    [resolveLocation],
  )

  const setOffline = useCallback(
    async (): Promise<WorkerPresence> => {
      setUpdating(true)
      setError(null)

      try {
        const nextPresence = await goOffline()

        if (mountedRef.current) {
          setPresence(nextPresence)
        }

        return nextPresence
      } catch (cause) {
        const message =
          cause instanceof Error
            ? cause.message
            : 'Unable to set worker status to offline.'

        if (mountedRef.current) {
          setError(message)
        }

        throw cause
      } finally {
        if (mountedRef.current) {
          setUpdating(false)
        }
      }
    },
    [],
  )

  const heartbeat = useCallback(
    async (
      location?: WorkerLocation,
    ): Promise<WorkerPresence> => {
      setUpdating(true)
      setError(null)

      try {
        const resolvedLocation =
          await resolveLocation(location)

        const nextPresence =
          await sendWorkerPresenceHeartbeat(
            resolvedLocation.latitude,
            resolvedLocation.longitude,
          )

        if (mountedRef.current) {
          setPresence(nextPresence)
        }

        return nextPresence
      } catch (cause) {
        const message =
          cause instanceof Error
            ? cause.message
            : 'Unable to refresh worker presence.'

        if (mountedRef.current) {
          setError(message)
        }

        throw cause
      } finally {
        if (mountedRef.current) {
          setUpdating(false)
        }
      }
    },
    [resolveLocation],
  )

  const updateLocation = useCallback(
    async (
      location?: WorkerLocation,
    ): Promise<WorkerLocation> => {
      setUpdating(true)
      setError(null)

      try {
        const resolvedLocation =
          await resolveLocation(location)

        const nextLocation =
          await updateWorkerLocation(
            resolvedLocation.latitude,
            resolvedLocation.longitude,
            null,
          )

        if (
          mountedRef.current &&
          presence
        ) {
          setPresence({
            ...presence,
            latitude: nextLocation.latitude,
            longitude: nextLocation.longitude,
            lastHeartbeatAt: nextLocation.recordedAt,
          })
        }

        return nextLocation
      } catch (cause) {
        const message =
          cause instanceof Error
            ? cause.message
            : 'Unable to update worker location.'

        if (mountedRef.current) {
          setError(message)
        }

        throw cause
      } finally {
        if (mountedRef.current) {
          setUpdating(false)
        }
      }
    },
    [presence, resolveLocation],
  )

  const clearError = useCallback((): void => {
    setError(null)
  }, [])

  const isExpired =
    presence?.presenceExpiresAt
      ? new Date(
          presence.presenceExpiresAt,
        ).getTime() <= Date.now()
      : true

  return {
    presence,
    loading,
    updating,
    error,

    isOnline:
      presence?.status === 'available' &&
      !isExpired,

    isExpired,

    refresh,
    goOnline: setOnline,
    goOffline: setOffline,
    heartbeat,
    updateLocation,
    clearError,
  }
}
