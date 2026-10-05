import { apiRequest } from '../../lib/api'
import type { AvailabilityResult } from '../../types/availability'

type InstantAvailabilityResponse = {
  service_area_available: boolean
  nearby_worker_available: boolean
  instant_available: boolean
  recommended_booking_type:
    | 'instant'
    | 'scheduled'
  nearby_worker_count: number
  nearest_worker_id: string | null
  nearest_worker_distance_km: number | string | null
  checked_at: string
  error_message?: string | null
}

export async function checkInstantAvailability(
  serviceId: string,
  latitude: number,
  longitude: number,
): Promise<AvailabilityResult> {
  const checkedAt =
    new Date().toISOString()

  if (
    !serviceId ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return {
      serviceAreaAvailable: false,
      nearbyWorkerAvailable: false,
      instantAvailable: false,
      recommendedBookingType: 'scheduled',
      nearbyWorkerCount: 0,
      nearestWorkerId: null,
      nearestWorkerDistanceKm: null,
      checkedAt,
      errorMessage:
        'A valid service and location are required.',
    }
  }

  const result =
    await apiRequest<InstantAvailabilityResponse>(
      '/availability/instant/check',
      {
        method: 'POST',
        body: JSON.stringify({
          service_id: serviceId,
          latitude,
          longitude,
        }),
      },
    )

  const nearbyWorkerCount = Number(
    result.nearby_worker_count ?? 0,
  )

  const nearestWorkerDistanceValue =
    result.nearest_worker_distance_km

  const nearestWorkerDistanceKm =
    nearestWorkerDistanceValue == null
      ? null
      : Number(nearestWorkerDistanceValue)

  return {
    serviceAreaAvailable:
      result.service_area_available === true,
    nearbyWorkerAvailable:
      result.nearby_worker_available === true ||
      nearbyWorkerCount > 0,
    instantAvailable:
      result.instant_available === true &&
      result.service_area_available === true &&
      (result.nearby_worker_available === true ||
        nearbyWorkerCount > 0),
    recommendedBookingType:
      result.recommended_booking_type,
    nearbyWorkerCount:
      Number.isFinite(nearbyWorkerCount)
        ? nearbyWorkerCount
        : 0,
    nearestWorkerId:
      result.nearest_worker_id ?? null,
    nearestWorkerDistanceKm:
      nearestWorkerDistanceKm !== null &&
      Number.isFinite(nearestWorkerDistanceKm)
        ? nearestWorkerDistanceKm
        : null,
    checkedAt:
      result.checked_at ?? checkedAt,
    errorMessage:
      result.error_message ?? undefined,
  }
}
