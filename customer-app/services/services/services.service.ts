import { publicApiRequest } from '../../lib/api'
import type { HomeService } from '../../types/service'

type ServiceResponse = {
  id: string
  service_variant_id: string
  name: string
  description: string | null
  hourly_price: number
  currency: string | null
  image_url: string | null
  display_order: number
  is_featured: boolean
  category_id: string | null
  category_name: string | null
}

function toHomeService(
  service: ServiceResponse,
): HomeService {
  const hourlyPrice =
    Number(service.hourly_price)

  if (
    !Number.isFinite(hourlyPrice) ||
    hourlyPrice < 0
  ) {
    throw new Error(
      'The backend returned an invalid service price.',
    )
  }

  return {
    id: service.id,
    serviceVariantId:
      service.service_variant_id,
    name: service.name,
    description:
      service.description,
    hourlyPrice,
    currency:
      service.currency ?? null,
    imageUrl:
      service.image_url ?? null,
    displayOrder:
      Number(service.display_order ?? 0),
    isFeatured:
      service.is_featured === true,
    categoryId:
      service.category_id ?? null,
    categoryName:
      service.category_name ?? null,
  }
}

export async function getHomeServices(): Promise<HomeService[]> {
  const data =
    await publicApiRequest<ServiceResponse[]>(
      '/services',
    )

  return data.map(toHomeService)
}

export async function getHomeServicesForLocation(
  latitude: number,
  longitude: number,
): Promise<HomeService[]> {
  if (
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    return []
  }

  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
  })

  const data =
    await publicApiRequest<ServiceResponse[]>(
      `/services?${params.toString()}`,
    )

  return data.map(toHomeService)
}
