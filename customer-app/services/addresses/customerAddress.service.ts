import { apiRequest } from '../../lib/api'

export type CustomerAddressInput = {
  latitude: number
  longitude: number
  address: string
  label?: string
}

export type CustomerSavedAddress = {
  id: string
  label: string | null
  addressLine: string
  latitude: number
  longitude: number
  createdAt?: string
}

type CustomerAddressApiResponse = {
  id: string
  label: string | null
  address_line: string
  latitude: number
  longitude: number
  created_at: string
}

type CustomerAddressCreateApiResponse = {
  address: CustomerAddressApiResponse
}

function validateCoordinates(
  latitude: number,
  longitude: number,
) {
  if (
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90
  ) {
    throw new Error(
      'Invalid latitude.',
    )
  }

  if (
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new Error(
      'Invalid longitude.',
    )
  }
}

function mapAddress(
  row: CustomerAddressApiResponse,
): CustomerSavedAddress {
  return {
    id: row.id,
    label: row.label,
    addressLine: row.address_line,
    latitude: row.latitude,
    longitude: row.longitude,
    createdAt: row.created_at,
  }
}

export async function getOrCreateCustomerAddress(
  input: CustomerAddressInput,
): Promise<string> {
  const address =
    input.address.trim()

  if (!address) {
    throw new Error(
      'A customer address is required.',
    )
  }

  validateCoordinates(
    input.latitude,
    input.longitude,
  )

  const response =
    await apiRequest<CustomerAddressCreateApiResponse>(
      '/addresses',
      {
        method: 'POST',
        body: JSON.stringify({
          latitude:
            input.latitude,
          longitude:
            input.longitude,
          address,
          label:
            input.label?.trim() || null,
        }),
      },
    )

  if (!response?.address?.id) {
    throw new Error(
      'The customer address was not created.',
    )
  }

  return response.address.id
}

export async function getCustomerSavedAddresses(): Promise<
  CustomerSavedAddress[]
> {
  const response =
    await apiRequest<
      CustomerAddressApiResponse[]
    >('/addresses')

  return (response ?? []).map(
    mapAddress,
  )
}

export async function getLatestCustomerAddress(): Promise<
  CustomerSavedAddress | null
> {
  const addresses =
    await getCustomerSavedAddresses()

  return addresses[0] ?? null
}

export async function deleteCustomerAddress(
  addressId: string,
): Promise<void> {
  if (!addressId) {
    throw new Error(
      'An address is required.',
    )
  }

  await apiRequest<void>(
    `/addresses/${encodeURIComponent(
      addressId,
    )}`,
    {
      method: 'DELETE',
    },
  )
}