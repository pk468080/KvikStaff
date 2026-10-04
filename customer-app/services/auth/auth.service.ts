import { supabase } from '../../lib/supabase'

export const TEMP_OTP = '123456'

const MAX_NAME_LENGTH = 100
const MAX_COMPANY_NAME_LENGTH = 150

export type CustomerAuthState =
  | {
      authenticated: false
      needsRegistration: true
      phone: string
    }
  | {
      authenticated: true
      needsRegistration: true
      phone: string
    }
  | {
      authenticated: true
      needsRegistration: false
      phone: string
    }

export type CustomerProfile = {
  id: string
  full_name: string | null
  phone: string | null
  role: string
  is_active: boolean
  company_name: string | null
}

type VerifyOtpSuccess = {
  success: true
  phone: string
  session: NonNullable<
    Awaited<
      ReturnType<typeof supabase.auth.getSession>
    >['data']['session']
  >
  needsRegistration: boolean
}

type VerifyOtpFailure = {
  success: false
  error: string
}

type VerifyOtpResult =
  | VerifyOtpSuccess
  | VerifyOtpFailure

type CreateCustomerProfileSuccess = {
  success: true
  profile: CustomerProfile
}

type CreateCustomerProfileFailure = {
  success: false
  error: string
}

type CreateCustomerProfileResult =
  | CreateCustomerProfileSuccess
  | CreateCustomerProfileFailure

function normalizePhone(phone: string) {
  return phone.replace(/\D/g, '')
}

function getUserMetadataPhone(
  user: {
    user_metadata?: Record<string, unknown>
  } | null,
) {
  const value = user?.user_metadata?.phone

  return typeof value === 'string'
    ? normalizePhone(value)
    : ''
}

async function getCustomerProfile(
  userId: string,
): Promise<CustomerProfile | null> {
  const {
    data: profile,
    error,
  } = await supabase
    .from('profiles')
    .select(
      'id, full_name, phone, role, is_active, company_name',
    )
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    throw error
  }

  return profile
}

export async function getCurrentCustomerProfile(): Promise<CustomerProfile | null> {
  const session = await getCurrentSession()

  if (!session) {
    return null
  }

  return getCustomerProfile(session.user.id)
}

function profileNeedsRegistration(
  profile: CustomerProfile | null,
) {
  if (!profile) {
    return true
  }

  if (
    profile.role !== 'customer' ||
    profile.is_active !== true
  ) {
    throw new Error(
      'The authenticated account is not an active customer account.',
    )
  }

  return (
    !profile.full_name ||
    profile.full_name.trim().length === 0 ||
    !profile.company_name ||
    profile.company_name.trim().length === 0
  )
}

export async function sendOtp(phone: string) {
  const normalizedPhone = normalizePhone(phone)

  if (
    normalizedPhone.length < 10 ||
    normalizedPhone.length > 15
  ) {
    throw new Error(
      'Please enter a valid mobile number.',
    )
  }

  console.log(
    'Development OTP:',
    TEMP_OTP,
  )

  console.log(
    'OTP requested for:',
    normalizedPhone,
  )

  return {
    success: true,
  }
}

export async function getCustomerAuthState(): Promise<CustomerAuthState> {
  const {
    data: sessionData,
    error: sessionError,
  } = await supabase.auth.getSession()

  if (sessionError) {
    throw sessionError
  }

  const session = sessionData.session

  if (!session) {
    return {
      authenticated: false,
      needsRegistration: true,
      phone: '',
    }
  }

  const profile = await getCustomerProfile(
    session.user.id,
  )

  const needsRegistration =
    profileNeedsRegistration(profile)

  const profilePhone = profile?.phone
    ? normalizePhone(profile.phone)
    : ''

  const metadataPhone =
    getUserMetadataPhone(session.user)

  return {
    authenticated: true,
    needsRegistration,
    phone:
      profilePhone ||
      metadataPhone,
  }
}

export async function verifyOtp(
  phone: string,
  otp: string,
): Promise<VerifyOtpResult> {
  const normalizedPhone = normalizePhone(phone)

  if (otp !== TEMP_OTP) {
    return {
      success: false,
      error: 'Invalid OTP',
    }
  }

  if (
    normalizedPhone.length < 10 ||
    normalizedPhone.length > 15
  ) {
    return {
      success: false,
      error: 'Invalid mobile number.',
    }
  }

  try {
    const { data, error } =
      await supabase.functions.invoke(
        'customer-auth',
        {
          body: {
            phone: normalizedPhone,
            otp: TEMP_OTP,
          },
        },
      )

    if (error) {
      throw error
    }

    if (!data?.success) {
      return {
        success: false,
        error:
          typeof data?.error === 'string'
            ? data.error
            : 'Unable to verify the OTP.',
      }
    }

    const session = data.session

    if (!session) {
      throw new Error(
        'Authentication succeeded but no session was returned.',
      )
    }

    /*
     * functions.invoke returns the session from the Edge Function,
     * but the local Supabase client must also adopt it so the rest of
     * the customer app sees the authenticated customer identity.
     */
    const { error: sessionError } =
      await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      })

    if (sessionError) {
      throw sessionError
    }

    const authenticatedSession =
      await getCurrentSession()

    if (!authenticatedSession) {
      throw new Error(
        'Supabase did not persist the customer session.',
      )
    }

    return {
      success: true,
      phone:
        typeof data.phone === 'string'
          ? normalizePhone(data.phone)
          : normalizedPhone,
      session: authenticatedSession,
      needsRegistration:
        data.needsRegistration === true,
    }
  } catch (error) {
    console.error(
      'Customer OTP verification failed:',
      error,
    )

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Unable to verify the OTP.',
    }
  }
}

export async function createCustomerProfile(
  phone: string,
  name: string,
  companyName: string,
): Promise<CreateCustomerProfileResult> {
  const trimmedName = name.trim()
  const trimmedCompanyName =
    companyName.trim()

  if (!trimmedName) {
    return {
      success: false,
      error: 'Name is required.',
    }
  }

  if (
    trimmedName.length >
    MAX_NAME_LENGTH
  ) {
    return {
      success: false,
      error: `Name must be ${MAX_NAME_LENGTH} characters or fewer.`,
    }
  }

  if (!trimmedCompanyName) {
    return {
      success: false,
      error: 'Company name is required.',
    }
  }

  if (
    trimmedCompanyName.length >
    MAX_COMPANY_NAME_LENGTH
  ) {
    return {
      success: false,
      error: `Company name must be ${MAX_COMPANY_NAME_LENGTH} characters or fewer.`,
    }
  }

  try {
    const {
      data: sessionData,
      error: sessionError,
    } = await supabase.auth.getSession()

    if (sessionError) {
      throw sessionError
    }

    const session = sessionData.session

    if (!session) {
      throw new Error(
        'A customer authentication session is required.',
      )
    }

    const userId = session.user.id

    const existingProfile =
      await getCustomerProfile(userId)

    if (existingProfile) {
      if (
        existingProfile.role !== 'customer' ||
        existingProfile.is_active !== true
      ) {
        throw new Error(
          'The authenticated account is not an active customer account.',
        )
      }

      const existingPhone =
        existingProfile.phone
          ? normalizePhone(
              existingProfile.phone,
            )
          : ''

      const metadataPhone =
        getUserMetadataPhone(session.user)

      const normalizedPhone =
        normalizePhone(phone) ||
        existingPhone ||
        metadataPhone

      if (
        normalizedPhone.length < 10 ||
        normalizedPhone.length > 15
      ) {
        throw new Error(
          'A valid customer mobile number is required.',
        )
      }

      const {
        data: updatedProfile,
        error: updateError,
      } = await supabase
        .from('profiles')
        .update({
          full_name: trimmedName,
          phone: normalizedPhone,
          company_name:
            trimmedCompanyName,
        })
        .eq('id', userId)
        .select(
          'id, full_name, phone, role, is_active, company_name',
        )
        .single()

      if (updateError) {
        throw updateError
      }

      if (!updatedProfile) {
        throw new Error(
          'The customer profile could not be updated.',
        )
      }

      return {
        success: true,
        profile: updatedProfile,
      }
    }

    const metadataPhone =
      getUserMetadataPhone(session.user)

    const normalizedPhone =
      normalizePhone(phone) ||
      metadataPhone

    if (
      normalizedPhone.length < 10 ||
      normalizedPhone.length > 15
    ) {
      throw new Error(
        'A valid customer mobile number is required.',
      )
    }

    const {
      data: createdProfile,
      error: createError,
    } = await supabase
      .from('profiles')
      .insert({
        id: userId,
        full_name: trimmedName,
        phone: normalizedPhone,
        company_name:
          trimmedCompanyName,
      })
      .select(
        'id, full_name, phone, role, is_active, company_name',
      )
      .single()

    if (createError) {
      throw createError
    }

    if (!createdProfile) {
      throw new Error(
        'The customer profile was not created.',
      )
    }

    return {
      success: true,
      profile: createdProfile,
    }
  } catch (error) {
    console.error(
      'Customer registration failed:',
      error,
    )

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Unable to create the customer account.',
    }
  }
}

export async function getCurrentSession() {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession()

  if (error) {
    throw error
  }

  

  return session
}
  

export async function signOut() {
  const { error } =
    await supabase.auth.signOut()

  if (error) {
    throw error
  }
}
