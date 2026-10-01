import { supabase } from '../../lib/supabase'

export type WorkerBookingChangeRequestType =
  | 'cancel'
  | 'reschedule'

export async function createWorkerBookingChangeRequest(
  input: {
    bookingId: string
    requestType: WorkerBookingChangeRequestType
    reason: string
    requestedStart?: string | null
    requestedEnd?: string | null
    occurrenceId?: string | null
  },
): Promise<unknown> {
  const reason = input.reason.trim()

  if (!reason) {
    throw new Error('Please provide a reason for the request.')
  }

  const { data, error } =
    await supabase.rpc(
      'worker_create_booking_change_request',
      {
        p_booking_id: input.bookingId,
        p_request_type: input.requestType,
        p_reason: reason,
        p_requested_start:
          input.requestedStart ?? null,
        p_requested_end:
          input.requestedEnd ?? null,
        p_occurrence_id:
          input.occurrenceId ?? null,
      },
    )

  if (error) {
    throw error
  }

  return data
}

export async function withdrawWorkerBookingChangeRequest(
  requestId: string,
): Promise<unknown> {
  const normalizedId = requestId.trim()

  if (!normalizedId) {
    throw new Error('A change request id is required.')
  }

  const { data, error } =
    await supabase.rpc(
      'worker_withdraw_booking_change_request',
      {
        p_request_id: normalizedId,
      },
    )

  if (error) {
    throw error
  }

  return data
}
