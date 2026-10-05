import { apiRequest } from '../../lib/api'

export type ScheduledAvailabilitySlot = {
  start: string
  end: string
  available_worker_count: number
}

export type ScheduledAvailabilityResult = {
  service_area_available: boolean
  slots: ScheduledAvailabilitySlot[]
}

type ScheduledAvailabilityResponse = {
  service_area_available: boolean
  slots: ScheduledAvailabilitySlot[]
}

export async function getScheduledAvailabilitySlots(
  serviceVariantId: string,
  addressId: string,
  start: string,
  end: string,
  durationHours = 1,
): Promise<ScheduledAvailabilityResult> {
  if (!serviceVariantId.trim()) {
    throw new Error(
      'Service variant ID is required.',
    )
  }

  if (!addressId.trim()) {
    throw new Error(
      'Address ID is required.',
    )
  }

  if (!start || !end) {
    throw new Error(
      'Availability start and end are required.',
    )
  }

  if (
    !Number.isFinite(durationHours) ||
    durationHours < 1 ||
    durationHours > 24
  ) {
    throw new Error(
      'Duration must be between 1 and 24 hours.',
    )
  }

  const result =
    await apiRequest<ScheduledAvailabilityResponse>(
      '/availability/scheduled/slots',
      {
        method: 'POST',
        body: JSON.stringify({
          service_variant_id:
            serviceVariantId,
          address_id: addressId,
          start,
          end,
          duration_hours: durationHours,
        }),
      },
    )

  return {
    service_area_available:
      result.service_area_available === true,
    slots: Array.isArray(result.slots)
      ? result.slots
      : [],
  }
}
