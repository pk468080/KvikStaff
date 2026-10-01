import { supabase } from '../../lib/supabase'

export const WORKER_INCIDENT_TYPES = [
  'customer_unavailable',
  'wrong_address',
  'unsafe_location',
  'access_problem',
  'extra_work_requested',
  'customer_behaviour',
  'worker_emergency',
  'other',
] as const

export type WorkerIncidentType =
  (typeof WORKER_INCIDENT_TYPES)[number]

export type WorkerBookingIncident = {
  id: string
  bookingId: string
  occurrenceId: string | null
  incidentType: WorkerIncidentType
  description: string
  status: string
  createdAt: string
}

export async function reportWorkerBookingIncident(
  input: {
    bookingId: string
    incidentType: WorkerIncidentType
    description: string
    occurrenceId?: string | null
  },
): Promise<unknown> {
  const description = input.description.trim()

  if (!description) {
    throw new Error('Please describe the incident.')
  }

  const { data, error } =
    await supabase.rpc(
      'worker_report_booking_incident',
      {
        p_booking_id: input.bookingId,
        p_incident_type: input.incidentType,
        p_description: description,
        p_occurrence_id:
          input.occurrenceId ?? null,
      },
    )

  if (error) {
    throw error
  }

  return data
}

export async function listWorkerBookingIncidents(
  bookingId: string,
  limit = 20,
): Promise<unknown> {
  const { data, error } =
    await supabase.rpc(
      'worker_list_booking_incidents',
      {
        p_booking_id: bookingId,
        p_limit: Math.max(1, Math.min(limit, 100)),
      },
    )

  if (error) {
    throw error
  }

  return data
}

export async function getWorkerIncidentSummary(
  bookingId: string,
): Promise<unknown> {
  const { data, error } =
    await supabase.rpc(
      'worker_get_incident_summary',
      {
        p_booking_id: bookingId,
      },
    )

  if (error) {
    throw error
  }

  return data
}
