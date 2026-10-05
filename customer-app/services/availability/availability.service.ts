import {
  publicApiRequest,
} from '../../lib/api'

export type ServiceArea = {
  id: string
  serviceId: string | null
  name: string
  city: string | null
  state: string | null
  centerLatitude: number
  centerLongitude: number
  radiusKm: number
}

type ServiceAreaResponse = {
  id: string
  service_id: string | null
  name: string
  city: string | null
  state: string | null
  center_latitude: number
  center_longitude: number
  radius_km: number
}

type AvailableServiceIdsResponse = {
  latitude: number
  longitude: number
  service_ids: string[]
}

export async function getActiveServiceAreas(): Promise<
  ServiceArea[]
> {
  const data =
    await publicApiRequest<ServiceAreaResponse[]>(
      '/availability/service-areas',
    )

  return data.map(area => ({
    id: area.id,
    serviceId: area.service_id,
    name: area.name,
    city: area.city,
    state: area.state,
    centerLatitude: Number(
      area.center_latitude,
    ),
    centerLongitude: Number(
      area.center_longitude,
    ),
    radiusKm: Number(area.radius_km),
  }))
}

export async function getAvailableServiceIds(
  latitude: number,
  longitude: number,
  serviceIds: string[] = [],
): Promise<Set<string>> {
  if (
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    return new Set<string>()
  }

  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
  })

  for (const serviceId of serviceIds) {
    if (serviceId.trim()) {
      params.append(
        'service_ids',
        serviceId,
      )
    }
  }

  const data =
    await publicApiRequest<AvailableServiceIdsResponse>(
      `/availability/service-ids?${params.toString()}`,
    )

  return new Set(
    data.service_ids ?? [],
  )
}
