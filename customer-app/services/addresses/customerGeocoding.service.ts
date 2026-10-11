import { apiRequest } from '../../lib/api'

export type CustomerGeocodingResult = {
  latitude: number
  longitude: number
  formattedAddress: string
}

type GeocodeAddressApiResponse = {
  latitude: number
  longitude: number
  formatted_address: string
}

export async function geocodeCustomerAddress(
  address: string,
): Promise<CustomerGeocodingResult> {
  const normalizedAddress = address.trim()

  if (
    normalizedAddress.length < 3 ||
    normalizedAddress.length > 256
  ) {
    throw new Error(
      'Enter a more specific service address, area, or PIN code.',
    )
  }

  const response = await apiRequest<GeocodeAddressApiResponse>(
    '/locations/geocode',
    {
      method: 'POST',
      body: JSON.stringify({
        address: normalizedAddress,
      }),
    },
  )

  if (
    !response ||
    !Number.isFinite(response.latitude) ||
    response.latitude < -90 ||
    response.latitude > 90 ||
    !Number.isFinite(response.longitude) ||
    response.longitude < -180 ||
    response.longitude > 180 ||
    typeof response.formatted_address !== 'string' ||
    !response.formatted_address.trim()
  ) {
    throw new Error(
      'The address search returned invalid coordinates.',
    )
  }

  return {
    latitude: response.latitude,
    longitude: response.longitude,
    formattedAddress: response.formatted_address.trim(),
  }
}