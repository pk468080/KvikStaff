import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

import type {
  PropsWithChildren,
} from 'react'

import type {
  Session,
} from '@supabase/supabase-js'

import {
  supabase,
} from '../lib/supabase'

export type WorkerRuntimeContextValue = {
  session: Session | null

  sessionReady: boolean

  bookingRevision: number
  offerRevision: number
  occurrenceRevision: number
  notificationRevision: number

  latestOfferBookingId: string | null
  latestAssignedBookingId: string | null

  realtimeConnected: boolean
}

type BookingRealtimeRecord = {
  id?: unknown
  worker_id?: unknown
  status?: unknown
}

type OfferRealtimeRecord = {
  id?: unknown
  booking_id?: unknown
  worker_id?: unknown
  status?: unknown
}

type OccurrenceRealtimeRecord = {
  id?: unknown
  booking_id?: unknown
  worker_id?: unknown
  status?: unknown
}

const WorkerRuntimeContext =
  createContext<
    WorkerRuntimeContextValue | undefined
  >(undefined)

export function WorkerRuntimeProvider({
  children,
}: PropsWithChildren) {
  const [
    session,
    setSession,
  ] = useState<Session | null>(null)

  const [
    sessionReady,
    setSessionReady,
  ] = useState(false)

  const [
    bookingRevision,
    setBookingRevision,
  ] = useState(0)

  const [
    offerRevision,
    setOfferRevision,
  ] = useState(0)

  const [
    occurrenceRevision,
    setOccurrenceRevision,
  ] = useState(0)

  const [
    notificationRevision,
    setNotificationRevision,
  ] = useState(0)

  const [
    latestOfferBookingId,
    setLatestOfferBookingId,
  ] = useState<string | null>(null)

  const [
    latestAssignedBookingId,
    setLatestAssignedBookingId,
  ] = useState<string | null>(null)

  const [
    realtimeConnected,
    setRealtimeConnected,
  ] = useState(false)

  useEffect(() => {
    let mounted = true

    const loadSession =
      async (): Promise<void> => {
        try {
          const {
            data,
            error,
          } =
            await supabase.auth.getSession()

          if (error) {
            throw error
          }

          if (!mounted) {
            return
          }

          setSession(
            data.session,
          )
        } catch (cause) {
          console.error(
            'Worker runtime session initialization failed:',
            cause,
          )

          if (!mounted) {
            return
          }

          setSession(null)
        } finally {
          if (mounted) {
            setSessionReady(true)
          }
        }
      }

    void loadSession()

    const {
      data: {
        subscription,
      },
    } =
      supabase.auth.onAuthStateChange(
        (
          _event,
          nextSession,
        ) => {
          if (!mounted) {
            return
          }

          setSession(
            nextSession,
          )

          /*
           * The listener can fire before the initial
           * getSession() promise resolves. Mark the
           * runtime ready as soon as Supabase gives us
           * an authoritative auth-state event.
           */
          setSessionReady(true)
        },
      )

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    const workerId =
      session?.user?.id

    if (!workerId) {
      setRealtimeConnected(
        false,
      )

      setLatestOfferBookingId(
        null,
      )

      setLatestAssignedBookingId(
        null,
      )

      return
    }

    let active = true

    const channel =
      supabase.channel(
        `worker-runtime:${workerId}`,
      )

    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'bookings',
        filter:
          `worker_id=eq.${workerId}`,
      },
      payload => {
        if (!active) {
          return
        }

        setBookingRevision(
          current =>
            current + 1,
        )

        const record =
          (
            payload.new ??
            {}
          ) as BookingRealtimeRecord

        const bookingId =
          typeof record.id ===
          'string'
            ? record.id
            : null

        const workerIdFromRecord =
          typeof record.worker_id ===
          'string'
            ? record.worker_id
            : null

        const status =
          typeof record.status ===
          'string'
            ? record.status
            : null

        if (
          bookingId &&
          workerIdFromRecord ===
            workerId &&
          status ===
            'assigned'
        ) {
          setLatestAssignedBookingId(
            bookingId,
          )
        }
      },
    )

    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table:
          'booking_worker_offers',
        filter:
          `worker_id=eq.${workerId}`,
      },
      payload => {
        if (!active) {
          return
        }

        setOfferRevision(
          current =>
            current + 1,
        )

        const record =
          (
            payload.new ??
            {}
          ) as OfferRealtimeRecord

        const bookingId =
          typeof record.booking_id ===
          'string'
            ? record.booking_id
            : null

        const workerIdFromRecord =
          typeof record.worker_id ===
          'string'
            ? record.worker_id
            : null

        const status =
          typeof record.status ===
          'string'
            ? record.status
            : null

        if (
          !bookingId ||
          workerIdFromRecord !==
            workerId
        ) {
          return
        }

        if (
          status ===
          'pending'
        ) {
          setLatestOfferBookingId(
            bookingId,
          )

          return
        }

        setLatestOfferBookingId(
          current =>
            current ===
            bookingId
              ? null
              : current,
        )
      },
    )

    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table:
          'booking_schedule_occurrences',
        filter:
          `worker_id=eq.${workerId}`,
      },
      payload => {
        if (!active) {
          return
        }

        setOccurrenceRevision(
          current =>
            current + 1,
        )

        const record =
          (
            payload.new ??
            {}
          ) as OccurrenceRealtimeRecord

        const bookingId =
          typeof record.booking_id ===
          'string'
            ? record.booking_id
            : null

        const workerIdFromRecord =
          typeof record.worker_id ===
          'string'
            ? record.worker_id
            : null

        const status =
          typeof record.status ===
          'string'
            ? record.status
            : null

        if (
          bookingId &&
          workerIdFromRecord ===
            workerId &&
          (
            status ===
              'arrived' ||
            status ===
              'in_progress' ||
            status ===
              'completed'
          )
        ) {
          setLatestAssignedBookingId(
            bookingId,
          )
        }
      },
    )

    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table:
          'notifications',
        filter:
          `user_id=eq.${workerId}`,
      },
      () => {
        if (!active) {
          return
        }

        setNotificationRevision(
          current =>
            current + 1,
        )
      },
    )

    channel.subscribe(
      status => {
        if (!active) {
          return
        }

        switch (status) {
          case 'SUBSCRIBED':
            setRealtimeConnected(
              true,
            )
            break

          case 'CHANNEL_ERROR':
          case 'TIMED_OUT':
          case 'CLOSED':
            setRealtimeConnected(
              false,
            )
            break

          default:
            break
        }
      },
    )

    return () => {
      active = false

      setRealtimeConnected(
        false,
      )

      void supabase.removeChannel(
        channel,
      )
    }
  }, [
    session?.user?.id,
  ])

  const value =
    useMemo<WorkerRuntimeContextValue>(
      () => ({
        session,

        sessionReady,

        bookingRevision,
        offerRevision,
        occurrenceRevision,
        notificationRevision,

        latestOfferBookingId,
        latestAssignedBookingId,

        realtimeConnected,
      }),
      [
        session,
        sessionReady,

        bookingRevision,
        offerRevision,
        occurrenceRevision,
        notificationRevision,

        latestOfferBookingId,
        latestAssignedBookingId,

        realtimeConnected,
      ],
    )

  return (
    <WorkerRuntimeContext.Provider
      value={value}
    >
      {children}
    </WorkerRuntimeContext.Provider>
  )
}

export function useWorkerRuntime():
  WorkerRuntimeContextValue {
  const context =
    useContext(
      WorkerRuntimeContext,
    )

  if (!context) {
    throw new Error(
      'useWorkerRuntime must be used inside WorkerRuntimeProvider.',
    )
  }

  return context
}
