#!/usr/bin/env node
/**
 * Apply the worker-app source changes needed by the accompanying SQL migration.
 * Run from the KvikStaff repository root:
 *   node scripts/apply-worker-app-patch.mjs
 *
 * Every replacement is guarded. If source code has changed, the script stops
 * instead of guessing. It does not commit, push, or deploy anything.
 */
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const pendingWrites = new Map()

function read(rel) {
  const file = path.join(root, rel)
  if (!fs.existsSync(file)) throw new Error(`Missing expected file: ${rel}`)
  return {
    file,
    content: pendingWrites.has(file)
      ? pendingWrites.get(file)
      : fs.readFileSync(file, 'utf8'),
  }
}

function replaceExactlyOnce(content, oldText, newText, label) {
  const first = content.indexOf(oldText)
  if (first < 0) throw new Error(`Patch anchor not found: ${label}`)
  if (content.indexOf(oldText, first + oldText.length) >= 0) {
    throw new Error(`Patch anchor appeared more than once: ${label}`)
  }
  return content.slice(0, first) + newText + content.slice(first + oldText.length)
}

function write(rel, oldText, newText, label) {
  const item = read(rel)
  const updated = replaceExactlyOnce(item.content, oldText, newText, label)
  pendingWrites.set(item.file, updated)
  console.log(`Prepared patch ${rel}`)
}

// Keep the latest offer ID, not just the parent booking ID.
// Multiple recurring occurrences can belong to the same booking.
write(
  'worker-app/context/WorkerRuntimeContext.tsx',
  `  latestOfferBookingId: string | null
  latestAssignedBookingId: string | null`,
  `  latestOfferBookingId: string | null
  latestOfferId: string | null
  latestAssignedBookingId: string | null`,
  'worker runtime latest offer ID type',
)
write(
  'worker-app/context/WorkerRuntimeContext.tsx',
  `  const [
    latestOfferBookingId,
    setLatestOfferBookingId,
  ] = useState<string | null>(null)`,
  `  const [
    latestOfferBookingId,
    setLatestOfferBookingId,
  ] = useState<string | null>(null)

  const [
    latestOfferId,
    setLatestOfferId,
  ] = useState<string | null>(null)`,
  'worker runtime latest offer ID state',
)
write(
  'worker-app/context/WorkerRuntimeContext.tsx',
  `      setLatestOfferBookingId(
        null,
      )

      setLatestAssignedBookingId(`,
  `      setLatestOfferBookingId(
        null,
      )

      setLatestOfferId(null)

      setLatestAssignedBookingId(`,
  'worker runtime clear latest offer on sign-out',
)
write(
  'worker-app/context/WorkerRuntimeContext.tsx',
  `        if (
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
        )`,
  `        const offerId =
          typeof record.id === 'string'
            ? record.id
            : null

        if (
          status ===
          'pending'
        ) {
          setLatestOfferBookingId(
            bookingId,
          )

          if (offerId) {
            setLatestOfferId(offerId)
          }

          return
        }

        if (offerId) {
          setLatestOfferId(current => current === offerId ? null : current)
        }
        // Keep bookingId until another pending offer replaces it or the worker
        // signs out: one parent booking can represent multiple occurrences.`,
  'worker runtime exact offer ID in realtime handler',
)
write(
  'worker-app/context/WorkerRuntimeContext.tsx',
  `        notificationRevision,

        latestOfferBookingId,
        latestAssignedBookingId,

        realtimeConnected,
      }),`,
  `        notificationRevision,

        latestOfferBookingId,
        latestOfferId,
        latestAssignedBookingId,

        realtimeConnected,
      }),`,
  'worker runtime expose exact offer ID',
)
write(
  'worker-app/context/WorkerRuntimeContext.tsx',
  `        latestOfferBookingId,
        latestAssignedBookingId,

        realtimeConnected,
      ],`,
  `        latestOfferBookingId,
        latestOfferId,
        latestAssignedBookingId,

        realtimeConnected,
      ],`,
  'worker runtime latest offer memo dependency',
)

// Navigate using the actual offer ID, especially for recurring occurrences.
write(
  'worker-app/navigation/WorkerNavigator.tsx',
  `import {
  useWorkerRuntime,
} from '../context/WorkerRuntimeContext'`,
  `import {
  useWorkerRuntime,
} from '../context/WorkerRuntimeContext'

import {
  getWorkerBookingOffer,
} from '../services/bookings/workerBookingOffers.service'`,
  'worker navigator offer lookup import',
)
write(
  'worker-app/navigation/WorkerNavigator.tsx',
  `  const {
    latestOfferBookingId,
  } = useWorkerRuntime()

  useEffect(() => {
    if (!latestOfferBookingId) {
      return
    }

    navigation.navigate(
      'BookingOffer',
      {
        bookingId:
          latestOfferBookingId,
      },
    )
  }, [
    latestOfferBookingId,
    navigation,
  ])`,
  `  const {
    latestOfferBookingId,
    latestOfferId,
  } = useWorkerRuntime()

  useEffect(() => {
    if (!latestOfferBookingId || !latestOfferId) {
      return
    }

    let active = true
    void (async () => {
      try {
        const offer = await getWorkerBookingOffer(latestOfferId)
        if (!active || !offer || offer.status !== 'pending') {
          return
        }
        navigation.navigate('BookingOffer', {
          bookingId: offer.bookingId,
          offerId: offer.id,
        })
      } catch (cause) {
        console.warn('Unable to open the latest worker offer:', cause)
      }
    })()

    return () => { active = false }
  }, [
    latestOfferBookingId,
    latestOfferId,
    navigation,
  ])`,
  'worker navigator exact offer route',
)
write(
  'worker-app/types/navigation.ts',
  `  BookingOffer: {
    bookingId: string
  }`,
  `  BookingOffer: {
    bookingId: string
    offerId?: string
  }`,
  'worker navigator optional offer ID route parameter',
)
write(
  'worker-app/navigation/WorkerNavigator.tsx',
  `          <BookingOfferScreen
            bookingId={
              route.params.bookingId
            }
            onBack={() => {`,
  `          <BookingOfferScreen
            bookingId={
              route.params.bookingId
            }
            offerId={route.params.offerId}
            onBack={() => {`,
  'worker navigator passes offer ID',
)

// Offer records have an optional occurrence ID.
write(
  'worker-app/services/bookings/workerBookingOffers.service.ts',
  `  bookingId: string
  workerId: string`,
  `  bookingId: string
  occurrenceId?: string | null
  workerId: string`,
  'worker offer type occurrence ID',
)
write(
  'worker-app/services/bookings/workerBookingOffers.service.ts',
  `  booking_id: string
  worker_id: string`,
  `  booking_id: string
  occurrence_id: string | null
  worker_id: string`,
  'worker offer row occurrence ID',
)
write(
  'worker-app/services/bookings/workerBookingOffers.service.ts',
  `  id,
  booking_id,
  worker_id,
  status,`,
  `  id,
  booking_id,
  occurrence_id,
  worker_id,
  status,`,
  'worker offer query selects occurrence ID',
)
write(
  'worker-app/services/bookings/workerBookingOffers.service.ts',
  `    bookingId:
      row.booking_id,

    workerId:`,
  `    bookingId:
      row.booking_id,

    occurrenceId:
      row.occurrence_id ?? null,

    workerId:`,
  'worker offer mapper occurrence ID',
)
write(
  'worker-app/services/bookings/workerBookingOffers.service.ts',
  `    .eq('booking_id', bookingId)
    .order('created_at', { ascending: false })`,
  `    .eq('booking_id', bookingId)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: true })`,
  'booking offer fallback selects an active pending offer',
)
write(
  'worker-app/screens/bookings/BookingOfferScreen.tsx',
  `  getWorkerBookingOffers,
  getWorkerBookingOfferByBookingId,`,
  `  getWorkerBookingOffers,
  getWorkerBookingOffer,
  getWorkerBookingOfferByBookingId,`,
  'booking offer screen exact offer service import',
)

// Load privacy-limited details for an offer, including the specific occurrence
// times and amount, instead of requiring the parent booking to be assigned first.
write(
  'worker-app/services/bookings/workerBookings.service.ts',
  `export async function requireWorkerBooking(`,
  `export async function getWorkerBookingForOffer(
  offerId: string,
): Promise<WorkerBooking | null> {
  if (!offerId.trim()) {
    throw new Error('Offer id is required.')
  }

  const { data, error } = await supabase.rpc(
    'worker_get_booking_offer_details',
    { p_offer_id: offerId },
  )

  if (error) {
    throw error
  }

  if (!data || typeof data !== 'object') {
    return null
  }

  const payload = data as unknown as { booking?: unknown }
  if (!payload.booking || typeof payload.booking !== 'object') {
    return null
  }

  return mapWorkerBooking(payload.booking as unknown as WorkerBookingRow)
}

export async function requireWorkerBooking(`,
  'worker booking offer details RPC loader',
)
write(
  'worker-app/screens/bookings/BookingOfferScreen.tsx',
  `import {
  getWorkerBooking,
} from '../../services/bookings/workerBookings.service'`,
  `import {
  getWorkerBookingForOffer,
} from '../../services/bookings/workerBookings.service'`,
  'booking offer screen details import',
)
write(
  'worker-app/screens/bookings/BookingOfferScreen.tsx',
  `            const nextBooking =
              await getWorkerBooking(
                bookingId,
              )`,
  `            const nextBooking =
              await getWorkerBookingForOffer(
                matchingOffer.id,
              )`,
  'booking offer loads offer-specific details',
)
write(
  'worker-app/screens/bookings/BookingOfferScreen.tsx',
  `          if (!matchingOffer) {
            throw new Error(
              'Booking offer not found for this worker account.',
            )
          }`,
  `          if (!matchingOffer || matchingOffer.bookingId !== bookingId) {
            throw new Error(
              'Booking offer not found for this worker account.',
            )
          }`,
  'booking offer validates booking ownership',
)
write(
  'worker-app/screens/bookings/BookingOfferScreen.tsx',
  `  bookingId: string
  onBack?: () => void`,
  `  bookingId: string
  offerId?: string
  onBack?: () => void`,
  'booking offer screen optional offer ID prop',
)
write(
  'worker-app/screens/bookings/BookingOfferScreen.tsx',
  `export default function BookingOfferScreen({
  bookingId,
  onBack,
  onAccepted,
}: BookingOfferScreenProps) {`,
  `export default function BookingOfferScreen({
  bookingId,
  offerId,
  onBack,
  onAccepted,
}: BookingOfferScreenProps) {`,
  'booking offer screen extracts offer ID',
)
write(
  'worker-app/screens/bookings/BookingOfferScreen.tsx',
  `          const matchingOffer =
            await getWorkerBookingOfferByBookingId(bookingId)`,
  `          const matchingOffer = offerId
            ? await getWorkerBookingOffer(offerId)
            : await getWorkerBookingOfferByBookingId(bookingId)`,
  'booking offer screen fetches exact offer ID',
)
write(
  'worker-app/screens/bookings/BookingOfferScreen.tsx',
  `      [
        bookingId,
      ],
    )`,
  `      [
        bookingId,
        offerId,
      ],
    )`,
  'booking offer loader tracks offer ID',
)
write(
  'worker-app/screens/bookings/BookingOfferScreen.tsx',
  `  onAccepted?: (bookingId: string) => void`,
  `  onAccepted?: (bookingId: string, occurrenceId?: string | null) => void`,
  'booking offer acceptance callback type',
)
write(
  'worker-app/screens/bookings/BookingOfferScreen.tsx',
  `            onAccepted?.(
              result.bookingId ||
                bookingId,
            )`,
  `            onAccepted?.(
              result.bookingId ||
                bookingId,
              offer.occurrenceId ?? null,
            )`,
  'booking offer returns occurrence ID',
)
write(
  'worker-app/navigation/WorkerNavigator.tsx',
  `            onAccepted={bookingId => {
              void navigateToWorkerBooking(
                navigation,
                bookingId,
              )
            }}`,
  `            onAccepted={(bookingId, occurrenceId) => {
              if (occurrenceId) {
                navigation.navigate('BookingOccurrence', { occurrenceId })
                return
              }

              void navigateToWorkerBooking(
                navigation,
                bookingId,
              )
            }}`,
  'worker navigation opens the accepted occurrence',
)

// Carry the exact offer ID through notification records and push-response routing.
write(
  'worker-app/types/notifications.ts',
  `  userId: string
  bookingId: string | null

  title:`,
  `  userId: string
  bookingId: string | null
  bookingWorkerOfferId: string | null

  title:`,
  'worker notification exact offer ID type',
)
write(
  'worker-app/services/notifications/workerNotifications.service.ts',
  `  booking_id: string | null
  title: string`,
  `  booking_id: string | null
  booking_worker_offer_id: string | null
  title: string`,
  'worker notification database row offer ID',
)
write(
  'worker-app/services/notifications/workerNotifications.service.ts',
  `  booking_id,
  title,
  message,
  notification_type,`,
  `  booking_id,
  booking_worker_offer_id,
  title,
  message,
  notification_type,`,
  'worker notification query offer ID',
)
write(
  'worker-app/services/notifications/workerNotifications.service.ts',
  `    bookingId:
      row.booking_id,

    title:`,
  `    bookingId:
      row.booking_id,

    bookingWorkerOfferId:
      row.booking_worker_offer_id ?? null,

    title:`,
  'worker notification mapper offer ID',
)
write(
  'worker-app/components/runtime/WorkerNotificationRouter.tsx',
  `  onBookingOfferPress: (
    bookingId: string,
  ) => void`,
  `  onBookingOfferPress: (
    bookingId: string,
    offerId?: string | null,
  ) => void`,
  'notification router callback offer ID',
)
write(
  'worker-app/components/runtime/WorkerNotificationRouter.tsx',
  `  booking_id?: unknown
  notification_type?: unknown`,
  `  booking_id?: unknown
  offer_id?: unknown
  notification_type?: unknown`,
  'push notification offer ID field',
)
write(
  'worker-app/components/runtime/WorkerNotificationRouter.tsx',
  `        const bookingId =
          getString(
            data.booking_id,
          )

        const notificationType =`,
  `        const bookingId =
          getString(
            data.booking_id,
          )

        const offerId =
          getString(
            data.offer_id,
          )

        const notificationType =`,
  'push notification parses offer ID',
)
write(
  'worker-app/components/runtime/WorkerNotificationRouter.tsx',
  `            onBookingOfferPress(
              bookingId,
            )`,
  `            onBookingOfferPress(
              bookingId,
              offerId,
            )`,
  'push notification routes exact offer',
)
write(
  'worker-app/screens/notifications/NotificationsScreen.tsx',
  `  onBookingOfferPress?: (
    bookingId: string,
  ) => void`,
  `  onBookingOfferPress?: (
    bookingId: string,
    offerId?: string | null,
  ) => void`,
  'notification screen offer callback',
)
write(
  'worker-app/screens/notifications/NotificationsScreen.tsx',
  `                          onBookingOfferPress?.(
                            notification.bookingId,
                          )`,
  `                          onBookingOfferPress?.(
                            notification.bookingId,
                            notification.bookingWorkerOfferId,
                          )`,
  'notification list passes exact offer ID',
)
write(
  'worker-app/navigation/WorkerNavigator.tsx',
  `      onBookingOfferPress={bookingId => {
        navigation.navigate(
          'BookingOffer',
          {
            bookingId,
          },
        )
      }}`,
  `      onBookingOfferPress={(bookingId, offerId) => {
        navigation.navigate(
          'BookingOffer',
          {
            bookingId,
            offerId: offerId ?? undefined,
          },
        )
      }}`,
  'worker runtime notification navigation offer ID',
)
write(
  'worker-app/navigation/WorkerNavigator.tsx',
  `            onBookingOfferPress={bookingId => {
              navigation.navigate(
                'BookingOffer',
                {
                  bookingId,
                },
              )
            }}`,
  `            onBookingOfferPress={(bookingId, offerId) => {
              navigation.navigate(
                'BookingOffer',
                {
                  bookingId,
                  offerId: offerId ?? undefined,
                },
              )
            }}`,
  'notification screen navigation offer ID',
)

// Keep the push Edge Function source aligned with the deployed Supabase version.
write(
  'supabase/functions/send-worker-push/index.ts',
  `                booking_id:
                  record.booking_id ??
                  null,

                notification_type:`,
  `                booking_id:
                  record.booking_id ??
                  null,

                offer_id:
                  record.booking_worker_offer_id ??
                  null,

                notification_type:`,
  'worker push payload includes exact offer ID',
)

// Update generated types for the schema changes already installed in Supabase.
for (const rel of ['worker-app/types/database.ts', 'customer-app/types/database.ts']) {
  const item = read(rel)
  let updated = item.content

  if (rel.startsWith('worker-app/')) {
    updated = replaceExactlyOnce(
      updated,
      `      booking_worker_offers: TableDefinition<{
        id: string
        booking_id: string
        worker_id: string`,
      `      booking_worker_offers: TableDefinition<{
        id: string
        booking_id: string
        occurrence_id: string | null
        worker_id: string`,
      `${rel} offer row occurrence ID`,
    )
    updated = replaceExactlyOnce(
      updated,
      `      notifications: TableDefinition<{
        id: string
        user_id: string
        booking_id: string | null
        title: string`,
      `      notifications: TableDefinition<{
        id: string
        user_id: string
        booking_id: string | null
        booking_worker_offer_id: string | null
        title: string`,
      `${rel} notification offer ID`,
    )
    updated = replaceExactlyOnce(
      updated,
      `    worker_get_booking_context: {
    Args: {
      p_booking_id: string
    }
    Returns: Json
  }`,
      `    worker_get_booking_offer_details: {
    Args: {
      p_offer_id: string
    }
    Returns: Json
  }
    worker_get_booking_context: {
    Args: {
      p_booking_id: string
    }
    Returns: Json
  }`,
      `${rel} offer details RPC typing`,
    )
  } else {
    updated = replaceExactlyOnce(
      updated,
      `      booking_worker_offers: {
        Row: {
          booking_id: string
          created_at: string`,
      `      booking_worker_offers: {
        Row: {
          booking_id: string
          occurrence_id: string | null
          created_at: string`,
      `${rel} offer row occurrence ID`,
    )
    updated = replaceExactlyOnce(
      updated,
      `          status: Database["public"]["Enums"]["booking_worker_offer_status"]
          updated_at: string
          worker_id: string
        }
        Insert: {
          booking_id: string
          created_at?: string`,
      `          status: Database["public"]["Enums"]["booking_worker_offer_status"]
          updated_at: string
          worker_id: string
        }
        Insert: {
          booking_id: string
          occurrence_id?: string | null
          created_at?: string`,
      `${rel} offer insert occurrence ID`,
    )
    updated = replaceExactlyOnce(
      updated,
      `          created_at?: string
          expires_at: string
          id?: string
          offered_at?: string
          responded_at?: string | null
          status?: Database["public"]["Enums"]["booking_worker_offer_status"]
          updated_at?: string
          worker_id: string
        }
        Update: {
          booking_id?: string
          created_at?: string`,
      `          created_at?: string
          expires_at: string
          id?: string
          offered_at?: string
          responded_at?: string | null
          status?: Database["public"]["Enums"]["booking_worker_offer_status"]
          updated_at?: string
          worker_id: string
        }
        Update: {
          booking_id?: string
          occurrence_id?: string | null
          created_at?: string`,
      `${rel} offer update occurrence ID`,
    )
    updated = replaceExactlyOnce(
      updated,
      `      notifications: {
        Row: {
          booking_id: string | null
          created_at: string`,
      `      notifications: {
        Row: {
          booking_id: string | null
          booking_worker_offer_id: string | null
          created_at: string`,
      `${rel} notification row offer ID`,
    )
    updated = replaceExactlyOnce(
      updated,
      `        Insert: {
          booking_id?: string | null
          created_at?: string`,
      `        Insert: {
          booking_id?: string | null
          booking_worker_offer_id?: string | null
          created_at?: string`,
      `${rel} notification insert offer ID`,
    )
    updated = replaceExactlyOnce(
      updated,
      `        Update: {
          booking_id?: string | null
          created_at?: string`,
      `        Update: {
          booking_id?: string | null
          booking_worker_offer_id?: string | null
          created_at?: string`,
      `${rel} notification update offer ID`,
    )
  }

  pendingWrites.set(item.file, updated)
  console.log(`Prepared patch ${rel}`)
}

// Nothing is written until every source anchor has been checked successfully.
for (const [file, content] of pendingWrites) {
  fs.writeFileSync(file, content, 'utf8')
  console.log(`Wrote ${path.relative(root, file)}`)
}

console.log('\nWorker-app patch applied locally. Review git diff before committing.')
