
import { supabase } from '../../lib/supabase'

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

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '')
}

function normalizeIndianLocalPhone(phone: string): string {
  const digits = normalizePhone(phone)
  let localPhone = digits

  if (digits.length === 11 && digits.startsWith('0')) {
    localPhone = digits.slice(1)
  } else if (digits.length === 12 && digits.startsWith('91')) {
    localPhone = digits.slice(2)
  }

  if (!/^[6-9]\d{9}$/.test(localPhone)) {
    throw new Error(
      'Enter a valid 10-digit Indian mobile number.',
    )
  }

  return localPhone
}

function safeNormalizeIndianLocalPhone(
  phone: string | null | undefined,
): string {
  if (!phone) {
    return ''
  }

  try {
    return normalizeIndianLocalPhone(phone)
  } catch {
    return ''
  }
}

function formatIndianE164Phone(phone: string): string {
  return `+91${normalizeIndianLocalPhone(phone)}`
}

async function getCustomerProfile(
  userId: string,
): Promise<CustomerProfile | null> {
  const { data: profile, error } = await supabase
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

function profileNeedsRegistration(
  profile: CustomerProfile | null,
): boolean {
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
    !profile.full_name?.trim() ||
    !profile.company_name?.trim()
  )
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

export async function getCurrentCustomerProfile():
  Promise<CustomerProfile | null> {
  const session = await getCurrentSession()

  if (!session) {
    return null
  }

  const profile = await getCustomerProfile(session.user.id)

  if (!profile) {
    return null
  }

  // Display the Auth phone rather than trusting a stale
  // or incorrectly populated profile.phone value.
  const authPhone = safeNormalizeIndianLocalPhone(
    session.user.phone,
  )

  return {
    ...profile,
    phone: authPhone || null,
  }
}

export async function sendOtp(phone: string) {
  const localPhone = normalizeIndianLocalPhone(phone)

  const { error } = await supabase.auth.signInWithOtp({
    phone: formatIndianE164Phone(localPhone),
    options: {
      shouldCreateUser: true,
    },
  })

  if (error) {
    if (__DEV__) {
      console.error(
        'Customer SMS OTP request failed:',
        error.message,
      )
    }

    throw new Error(
      'Unable to send a verification code. Please try again.',
    )
  }

  return { success: true }
}

export async function getCustomerAuthState():
  Promise<CustomerAuthState> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession()

  if (error) {
    throw error
  }

  if (!session) {
    return {
      authenticated: false,
      needsRegistration: true,
      phone: '',
    }
  }

  const authPhone = safeNormalizeIndianLocalPhone(
    session.user.phone,
  )

  if (!authPhone || !session.user.phone_confirmed_at) {
    throw new Error(
      'A verified Indian mobile number is required. Please sign in again.',
    )
  }

  const profile = await getCustomerProfile(session.user.id)

  const needsRegistration = profileNeedsRegistration(profile)

  return {
    authenticated: true,
    needsRegistration,
    phone: authPhone,
  }
}

export async function verifyOtp(
  phone: string,
  otp: string,
): Promise<VerifyOtpResult> {
  let localPhone: string

  try {
    localPhone = normalizeIndianLocalPhone(phone)
  } catch {
    return {
      success: false,
      error: 'Please enter a valid mobile number.',
    }
  }

  const token = otp.trim()

  if (!/^\d{6}$/.test(token)) {
    return {
      success: false,
      error: 'Enter the six-digit verification code.',
    }
  }

  try {
    const { data, error } = await supabase.auth.verifyOtp({
      phone: formatIndianE164Phone(localPhone),
      token,
      type: 'sms',
    })

    if (error || !data.user || !data.session) {
      return {
        success: false,
        error: 'The verification code is invalid or expired.',
      }
    }

    const verifiedAuthPhone = safeNormalizeIndianLocalPhone(
      data.user.phone,
    )

    if (
      !data.user.phone_confirmed_at ||
      verifiedAuthPhone !== localPhone
    ) {
      await supabase.auth.signOut({ scope: 'local' })

      return {
        success: false,
        error: 'Unable to confirm the verified mobile number.',
      }
    }

    const profile = await getCustomerProfile(data.user.id)
    const needsRegistration = profileNeedsRegistration(profile)

    return {
      success: true,
      // The just-verified number is authoritative.
      phone: localPhone,
      session: data.session,
      needsRegistration,
    }
  } catch (error) {
    await supabase.auth.signOut({ scope: 'local' })

    if (__DEV__) {
      console.error(
        'Customer account validation failed:',
        error,
      )
    }

    return {
      success: false,
      error: 'Unable to validate this customer account.',
    }
  }
}

export async function createCustomerProfile(
  phone: string,
  name: string,
  companyName: string,
): Promise<CreateCustomerProfileResult> {
  const trimmedName = name.trim()
  const trimmedCompanyName = companyName.trim()

  if (!trimmedName) {
    return {
      success: false,
      error: 'Name is required.',
    }
  }

  if (trimmedName.length > MAX_NAME_LENGTH) {
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

  if (trimmedCompanyName.length > MAX_COMPANY_NAME_LENGTH) {
    return {
      success: false,
      error: `Company name must be ${MAX_COMPANY_NAME_LENGTH} characters or fewer.`,
    }
  }

  try {
    // Validate the user with Supabase Auth rather than accepting
    // the client-provided phone as the identity source.
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError) {
      throw userError
    }

    if (!user) {
      throw new Error(
        'A customer authentication session is required.',
      )
    }

    const authPhone = safeNormalizeIndianLocalPhone(user.phone)

    if (!authPhone || !user.phone_confirmed_at) {
      throw new Error(
        'Verify your Indian mobile number before saving your profile.',
      )
    }

    const userId = user.id
    const existingProfile = await getCustomerProfile(userId)

    // For new registrations, the number passed from the OTP flow
    // must match Auth. For existing profiles, ignore the stored
    // phone argument and repair it from the verified Auth identity.
    if (!existingProfile) {
      const requestedPhone = safeNormalizeIndianLocalPhone(phone)

      if (requestedPhone !== authPhone) {
        throw new Error(
          'The registration number does not match the mobile number verified by OTP.',
        )
      }
    } else if (
      existingProfile.role !== 'customer' ||
      existingProfile.is_active !== true
    ) {
      throw new Error(
        'The authenticated account is not an active customer account.',
      )
    }

    if (existingProfile) {
      const {
        data: updatedProfile,
        error: updateError,
      } = await supabase
        .from('profiles')
        .update({
          full_name: trimmedName,
          phone: authPhone,
          company_name: trimmedCompanyName,
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

    const {
      data: createdProfile,
      error: createError,
    } = await supabase
      .from('profiles')
      .insert({
        id: userId,
        full_name: trimmedName,
        phone: authPhone,
        company_name: trimmedCompanyName,
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
    if (__DEV__) {
      console.error('Customer profile save failed:', error)
    }

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Unable to create or update the customer account.',
    }
  }
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()

  if (error) {
    throw error
  }
}
