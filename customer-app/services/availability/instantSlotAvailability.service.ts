import { apiRequest } from '../../lib/api'

export type InstantAvailabilitySlot = {
  start: string
  end: string
  available_worker_count: number
}

export type InstantAvailabilityResult = {
  service_area_available: boolean
  instant_available: boolean
  slots: InstantAvailabilitySlot[]
}

type InstantAvailabilitySlotResponse = {
  service_area_available: boolean
  instant_available: boolean
  slots: InstantAvailabilitySlot[]
}

export async function getInstantAvailabilitySlots(
  serviceVariantId: string,
  addressId: string,
  durationHours = 1,
): Promise<InstantAvailabilityResult> {
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
    await apiRequest<InstantAvailabilitySlotResponse>(
      '/availability/instant/slots',
      {
        method: 'POST',
        body: JSON.stringify({
          service_variant_id:
            serviceVariantId,
          address_id: addressId,
          duration_hours: durationHours,
        }),
      },
    )

  return {
    service_area_available:
      result.service_area_available === true,
    instant_available:
      result.instant_available === true,
    slots: Array.isArray(result.slots)
      ? result.slots
      : [],
  }
}
