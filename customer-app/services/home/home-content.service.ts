import {
  apiRequest,
  publicApiRequest,
} from '../../lib/api'
import { supabase } from '../../lib/supabase'

export type HomePromotion = {
  id: string
  title: string
  subtitle: string | null
  ctaText: string | null
  serviceId: string | null
  imageUrl: string | null
}

export type HomeRebook = {
  serviceId: string
  createdAt: string
  durationValue: number | null
  durationUnit: string | null
  scheduledStart: string | null
}

type HomePromotionApi = {
  id: string
  title: string
  subtitle: string | null
  cta_text: string | null
  service_id: string | null
  image_url: string | null
  sort_order: number
}

type HomeRebookApi = {
  service_id: string
  created_at: string
  duration_value: number | null
  duration_unit: string | null
  scheduled_start: string | null
}

async function getCurrentCustomerId(): Promise<
  string | null
> {
  const {
    data,
    error,
  } = await supabase.auth.getUser()

  if (error || !data.user) {
    return null
  }

  return data.user.id
}

export async function getCustomerFavouriteServiceIds(): Promise<
  Set<string>
> {
  const customerId =
    await getCurrentCustomerId()

  if (!customerId) {
    return new Set<string>()
  }

  const serviceIds =
    await apiRequest<string[]>(
      '/home/favourites',
    )

  return new Set(serviceIds)
}

export async function setCustomerFavouriteService(
  serviceId: string,
  isFavourite: boolean,
): Promise<void> {
  const customerId =
    await getCurrentCustomerId()

  if (!customerId) {
    throw new Error(
      'Please sign in to save favourite services.',
    )
  }

  if (isFavourite) {
    await apiRequest(
      `/home/favourites/${serviceId}`,
      {
        method: 'POST',
      },
    )

    return
  }

  await apiRequest(
    `/home/favourites/${serviceId}`,
    {
      method: 'DELETE',
    },
  )
}

export async function getHomePromotions(
  availableServiceIds: Set<string>,
): Promise<HomePromotion[]> {
  const serviceIds = Array.from(
    availableServiceIds,
  )

  const path =
    serviceIds.length > 0
      ? `/home/promotions?service_ids=${encodeURIComponent(
          serviceIds.join(','),
        )}`
      : '/home/promotions?service_ids='

  const rows =
    await publicApiRequest<
      HomePromotionApi[]
    >(path)

  return rows.map(row => ({
    id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    ctaText: row.cta_text,
    serviceId: row.service_id,
    imageUrl: row.image_url,
  }))
}

export async function getCustomerRebookHistory(): Promise<
  HomeRebook[]
> {
  const customerId =
    await getCurrentCustomerId()

  if (!customerId) {
    return []
  }

  const rows =
    await apiRequest<HomeRebookApi[]>(
      '/home/rebook-history',
    )

  return rows.map(row => ({
    serviceId: row.service_id,
    createdAt: row.created_at,
    durationValue:
      row.duration_value,
    durationUnit:
      row.duration_unit,
    scheduledStart:
      row.scheduled_start,
  }))
}