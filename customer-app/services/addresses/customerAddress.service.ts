import { supabase } from '../../lib/supabase'

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

async function getAuthenticatedUserId() {
  const {
    data: sessionData,
    error: sessionError,
  } = await supabase.auth.getSession()

  if (sessionError) {
    throw sessionError
  }

  const userId =
    sessionData.session?.user.id

  if (!userId) {
    throw new Error(
      'A customer authentication session is required.',
    )
  }

  return userId
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

export async function getOrCreateCustomerAddress(
  input: CustomerAddressInput,
): Promise<string> {
  const userId =
    await getAuthenticatedUserId()

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

  const {
    data: existingAddress,
    error: lookupError,
  } = await supabase
    .from('addresses')
    .select('id')
    .eq('user_id', userId)
    .eq('address_line', address)
    .eq('latitude', input.latitude)
    .eq('longitude', input.longitude)
    .limit(1)
    .maybeSingle()

  if (lookupError) {
    throw lookupError
  }

  if (existingAddress?.id) {
    return existingAddress.id
  }

  const {
    data: createdAddress,
    error: createError,
  } = await supabase
    .from('addresses')
    .insert({
      user_id: userId,
      label:
        input.label?.trim() || null,
      address_line: address,
      latitude: input.latitude,
      longitude: input.longitude,
    })
    .select('id')
    .single()

  if (createError) {
    throw createError
  }

  if (!createdAddress?.id) {
    throw new Error(
      'The customer address was not created.',
    )
  }

  return createdAddress.id
}

export async function getCustomerSavedAddresses(): Promise<
  CustomerSavedAddress[]
> {
  const userId =
    await getAuthenticatedUserId()

  const {
    data,
    error,
  } = await supabase
    .from('addresses')
    .select(
      'id, label, address_line, latitude, longitude, created_at',
    )
    .eq('user_id', userId)
    .order('created_at', {
      ascending: false,
    })

  if (error) {
    throw error
  }

  return (data ?? []).map(
    row => ({
      id: row.id,
      label: row.label,
      addressLine:
        row.address_line,
      latitude: row.latitude,
      longitude: row.longitude,
      createdAt:
        row.created_at,
    }),
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
  const userId =
    await getAuthenticatedUserId()

  if (!addressId) {
    throw new Error(
      'An address is required.',
    )
  }

  const {
    error,
  } = await supabase
    .from('addresses')
    .delete()
    .eq('id', addressId)
    .eq('user_id', userId)

  if (error) {
    throw error
  }
}
