import { publicApiRequest } from '../../lib/api'

export type HomePromotion = {
  id: string
  title: string
  subtitle: string | null
  ctaText: string | null
  serviceId: string | null
  imageUrl: string | null
  sortOrder: number
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

export async function getHomePromotions(): Promise<
  HomePromotion[]
> {
  const rows =
    await publicApiRequest<
      HomePromotionApi[]
    >('/home/promotions')

  return rows.map(row => ({
    id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    ctaText: row.cta_text,
    serviceId: row.service_id,
    imageUrl: row.image_url,
    sortOrder: row.sort_order,
  }))
}