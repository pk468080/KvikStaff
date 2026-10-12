import { supabase } from '../../lib/supabase'

import type {
  WorkerBookingActionResponse,
} from '../../types/booking'

export type WorkerBookingOfferStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'expired'
  | 'cancelled'

export type WorkerBookingOffer = {
  id: string

  bookingId: string
  workerId: string

  status: WorkerBookingOfferStatus

  offeredAt: string
  expiresAt: string

  respondedAt: string | null

  createdAt: string
  updatedAt: string
}

type WorkerBookingOfferRow = {
  id: string
  booking_id: string
  worker_id: string
  status: WorkerBookingOfferStatus
  offered_at: string
  expires_at: string
  responded_at: string | null
  created_at: string
  updated_at: string
}

type WorkerOfferRpcResult = {
  success?: boolean

  action?: string

  offer_id?: string
  booking_id?: string
  worker_id?: string

  status?: string

  error?: string
}

const OFFER_SELECT = `
  id,
  booking_id,
  worker_id,
  status,
  offered_at,
  expires_at,
  responded_at,
  created_at,
  updated_at
`

function mapWorkerBookingOffer(
  row: WorkerBookingOfferRow,
): WorkerBookingOffer {
  return {
    id:
      row.id,

    bookingId:
      row.booking_id,

    workerId:
      row.worker_id,

    status:
      row.status,

    offeredAt:
      row.offered_at,

    expiresAt:
      row.expires_at,

    respondedAt:
      row.responded_at,

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,
  }
}

async function getCurrentWorkerId(): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error) {
    throw error
  }

  if (!user) {
    throw new Error(
      'A worker authentication session is required.',
    )
  }

  return user.id
}

function validateOfferId(
  offerId: string,
): void {
  if (!offerId.trim()) {
    throw new Error(
      'Offer id is required.',
    )
  }
}

async function getWorkerOffer(
  workerId: string,
  offerId: string,
): Promise<WorkerBookingOffer | null> {
  const {
    data,
    error,
  } = await supabase
    .from('booking_worker_offers')
    .select(
      OFFER_SELECT,
    )
    .eq('id', offerId)
    .eq('worker_id', workerId)
    .maybeSingle()

  if (error) {
    throw error
  }

  return data
    ? mapWorkerBookingOffer(
        data as WorkerBookingOfferRow,
      )
    : null
}

export async function getWorkerBookingOffers(): Promise<
  WorkerBookingOffer[]
> {
  const workerId =
    await getCurrentWorkerId()

  const {
    data,
    error,
  } = await supabase
    .from('booking_worker_offers')
    .select(
      OFFER_SELECT,
    )
    .eq('worker_id', workerId)
    .order('offered_at', {
      ascending: false,
    })

  if (error) {
    throw error
  }

  return (data ?? []).map(
    (row) =>
      mapWorkerBookingOffer(
        row as WorkerBookingOfferRow,
      ),
  )
}

export async function getPendingWorkerBookingOffers(): Promise<
  WorkerBookingOffer[]
> {
  const workerId =
    await getCurrentWorkerId()

  const now =
    new Date().toISOString()

  const {
    data,
    error,
  } = await supabase
    .from('booking_worker_offers')
    .select(
      OFFER_SELECT,
    )
    .eq('worker_id', workerId)
    .eq('status', 'pending')
    .gt(
      'expires_at',
      now,
    )
    .order('expires_at', {
      ascending: true,
    })

  if (error) {
    throw error
  }

  return (data ?? []).map(
    (row) =>
      mapWorkerBookingOffer(
        row as WorkerBookingOfferRow,
      ),
  )
}


export async function getWorkerBookingOfferByBookingId(
  bookingId: string,
): Promise<WorkerBookingOffer | null> {
  if (!bookingId?.trim()) {
    throw new Error('Booking id is required.');
  }

  const workerId =
    await getCurrentWorkerId()

  const {
    data,
    error,
  } = await supabase
    .from('booking_worker_offers')
    .select(
      OFFER_SELECT,
    )
    .eq('worker_id', workerId)
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw error
  }

  return data
    ? mapWorkerBookingOffer(
        data as WorkerBookingOfferRow,
      )
    : null
}

export async function getWorkerBookingOffer(
  offerId: string,
): Promise<WorkerBookingOffer | null> {
  validateOfferId(
    offerId,
  )

  const workerId =
    await getCurrentWorkerId()

  return getWorkerOffer(
    workerId,
    offerId,
  )
}

export async function requireWorkerBookingOffer(
  offerId: string,
): Promise<WorkerBookingOffer> {
  const offer =
    await getWorkerBookingOffer(
      offerId,
    )

  if (!offer) {
    throw new Error(
      'Booking offer not found.',
    )
  }

  return offer
}

export async function respondToWorkerBookingOffer(
  offerId: string,
  response: 'accept' | 'decline',
): Promise<WorkerBookingActionResponse> {
  validateOfferId(
    offerId,
  )

  if (
    response !== 'accept' &&
    response !== 'decline'
  ) {
    throw new Error(
      'Invalid booking offer response.',
    )
  }

  const workerId =
    await getCurrentWorkerId()

  const existingOffer =
    await getWorkerOffer(
      workerId,
      offerId,
    )

  if (!existingOffer) {
    throw new Error(
      'Booking offer not found.',
    )
  }

  if (
    existingOffer.status !==
    'pending'
  ) {
    throw new Error(
      'Booking offer is no longer available.',
    )
  }

  if (
    new Date(
      existingOffer.expiresAt,
    ).getTime() <=
    Date.now()
  ) {
    throw new Error(
      'Booking offer has expired.',
    )
  }

  const {
    data,
    error,
  } = await supabase.rpc(
    'worker_respond_to_offer',
    {
      p_offer_id:
        offerId,

      p_response:
        response,
    },
  )

  if (error) {
    throw error
  }

  const result =
    (data ?? {}) as WorkerOfferRpcResult

  if (result.success !== true) {
    throw new Error(
      result.error ||
        'Booking offer response could not be processed.',
    )
  }

  if (
    result.offer_id &&
    result.offer_id !== offerId
  ) {
    throw new Error(
      'Offer response belongs to a different offer.',
    )
  }

  if (
    result.worker_id &&
    result.worker_id !== workerId
  ) {
    throw new Error(
      'Offer response belongs to a different worker account.',
    )
  }

  return {
    success: true,

    bookingId:
      result.booking_id,

    action:
      response,

    status:
      result.status,

    error:
      result.error,
  }
}

export async function acceptWorkerBookingOffer(
  offerId: string,
): Promise<WorkerBookingActionResponse> {
  return respondToWorkerBookingOffer(
    offerId,
    'accept',
  )
}

export async function declineWorkerBookingOffer(
  offerId: string,
): Promise<WorkerBookingActionResponse> {
  return respondToWorkerBookingOffer(
    offerId,
    'decline',
  )
}

export function isWorkerBookingOfferExpired(
  offer: WorkerBookingOffer,
  now: Date = new Date(),
): boolean {
  if (
    offer.status !==
    'pending'
  ) {
    return true
  }

  const expiresAt =
    new Date(
      offer.expiresAt,
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

export function getWorkerBookingOfferRemainingSeconds(
  offer: WorkerBookingOffer,
  now: Date = new Date(),
): number {
  if (
    offer.status !==
    'pending'
  ) {
    return 0
  }

  const expiresAt =
    new Date(
      offer.expiresAt,
    )

  if (
    Number.isNaN(
      expiresAt.getTime(),
    )
  ) {
    return 0
  }

  return Math.max(
    0,
    Math.ceil(
      (
        expiresAt.getTime() -
        now.getTime()
      ) / 1000,
    ),
  )
}

export function isWorkerBookingOfferPending(
  offer: WorkerBookingOffer,
  now: Date = new Date(),
): boolean {
  return (
    offer.status ===
      'pending' &&
    !isWorkerBookingOfferExpired(
      offer,
      now,
    )
  )
}