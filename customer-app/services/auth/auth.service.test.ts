import { supabase } from '../../lib/supabase'
import {
  createCustomerProfile,
  getCustomerAuthState,
  sendOtp,
  verifyOtp,
  type CustomerProfile,
} from './auth.service'

jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
      getUser: jest.fn(),
      signInWithOtp: jest.fn(),
      verifyOtp: jest.fn(),
      signOut: jest.fn(),
    },
    from: jest.fn(),
  },
}))

type AuthUserFixture = {
  id: string
  phone: string
  phone_confirmed_at: string | null
}

const auth = supabase.auth as unknown as {
  getSession: jest.Mock
  getUser: jest.Mock
  signInWithOtp: jest.Mock
  verifyOtp: jest.Mock
  signOut: jest.Mock
}
const fromMock = supabase.from as unknown as jest.Mock

function makeAuthUser(
  overrides: Partial<AuthUserFixture> = {},
): AuthUserFixture {
  return {
    id: 'user-123',
    phone: '+919876543210',
    phone_confirmed_at: '2026-10-10T06:00:00.000Z',
    ...overrides,
  }
}

function makeCustomerProfile(
  overrides: Partial<CustomerProfile> = {},
): CustomerProfile {
  return {
    id: 'user-123',
    full_name: 'A Customer',
    phone: '9876543210',
    role: 'customer',
    is_active: true,
    company_name: 'Example Company',
    ...overrides,
  }
}

function makeProfileLookup(
  profile: CustomerProfile | null,
  error: Error | null = null,
) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({
      data: profile,
      error,
    }),
  }
}

function makeProfileWriteQuery(
  profile: CustomerProfile | null,
  error: Error | null = null,
) {
  return {
    update: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({
      data: profile,
      error,
    }),
  }
}

function mockOtpSuccess(
  user: AuthUserFixture = makeAuthUser(),
) {
  auth.verifyOtp.mockResolvedValue({
    data: {
      user,
      session: { user },
    },
    error: null,
  })
}

beforeEach(() => {
  jest.resetAllMocks()
  auth.signOut.mockResolvedValue({ error: null })
})

describe('sendOtp', () => {
  it('normalizes an Indian number and requests SMS OTP', async () => {
    auth.signInWithOtp.mockResolvedValue({ error: null })

    await expect(sendOtp('09876543210')).resolves.toEqual({
      success: true,
    })

    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      phone: '+919876543210',
      options: { shouldCreateUser: true },
    })
  })

  it('rejects an invalid phone number without calling Supabase Auth', async () => {
    await expect(sendOtp('12345')).rejects.toThrow(
      'Enter a valid 10-digit Indian mobile number.',
    )

    expect(auth.signInWithOtp).not.toHaveBeenCalled()
  })

  it('returns a generic error when Supabase cannot send the OTP', async () => {
    auth.signInWithOtp.mockResolvedValue({
      error: new Error('Provider internals'),
    })

    await expect(sendOtp('9876543210')).rejects.toThrow(
      'Unable to send a verification code. Please try again.',
    )
  })
})

describe('verifyOtp', () => {
  it('rejects a malformed code without calling Supabase Auth', async () => {
    const result = await verifyOtp('9876543210', '12ab')

    expect(result).toEqual({
      success: false,
      error: 'Enter the six-digit verification code.',
    })
    expect(auth.verifyOtp).not.toHaveBeenCalled()
  })

  it('rejects a response whose verified Auth phone differs from the requested phone', async () => {
    mockOtpSuccess(makeAuthUser({ phone: '+919812345678' }))

    const result = await verifyOtp('9876543210', '123456')

    expect(result).toEqual({
      success: false,
      error: 'Unable to confirm the verified mobile number.',
    })
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('accepts the verified Auth phone and returns registration state for an active customer', async () => {
    mockOtpSuccess()
    fromMock.mockReturnValueOnce(
      makeProfileLookup(makeCustomerProfile()),
    )

    const result = await verifyOtp('9876543210', '123456')

    expect(result).toMatchObject({
      success: true,
      phone: '9876543210',
      needsRegistration: false,
    })
    expect(auth.verifyOtp).toHaveBeenCalledWith({
      phone: '+919876543210',
      token: '123456',
      type: 'sms',
    })
    expect(auth.signOut).not.toHaveBeenCalled()
  })

  it('signs out locally when the authenticated profile is not an active customer', async () => {
    mockOtpSuccess()
    fromMock.mockReturnValueOnce(
      makeProfileLookup(makeCustomerProfile({ role: 'admin' })),
    )

    const result = await verifyOtp('9876543210', '123456')

    expect(result).toEqual({
      success: false,
      error: 'Unable to validate this customer account.',
    })
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })
})

describe('getCustomerAuthState', () => {
  it('reports an unauthenticated state when there is no session', async () => {
    auth.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    })

    await expect(getCustomerAuthState()).resolves.toEqual({
      authenticated: false,
      needsRegistration: true,
      phone: '',
    })
  })

  it('rejects a session whose phone is not verified', async () => {
    auth.getSession.mockResolvedValue({
      data: {
        session: {
          user: makeAuthUser({ phone_confirmed_at: null }),
        },
      },
      error: null,
    })

    await expect(getCustomerAuthState()).rejects.toThrow(
      'A verified Indian mobile number is required. Please sign in again.',
    )
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('marks a customer with missing profile details as needing registration', async () => {
    auth.getSession.mockResolvedValue({
      data: { session: { user: makeAuthUser() } },
      error: null,
    })
    fromMock.mockReturnValueOnce(
      makeProfileLookup(makeCustomerProfile({ company_name: '  ' })),
    )

    await expect(getCustomerAuthState()).resolves.toEqual({
      authenticated: true,
      needsRegistration: true,
      phone: '9876543210',
    })
  })
})

describe('createCustomerProfile', () => {
  it('refuses to save a profile without a verified Auth phone', async () => {
    auth.getUser.mockResolvedValue({
      data: { user: makeAuthUser({ phone_confirmed_at: null }) },
      error: null,
    })

    const result = await createCustomerProfile(
      '9876543210',
      'A Customer',
      'Example Company',
    )

    expect(result).toMatchObject({
      success: false,
      error: 'Verify your Indian mobile number before saving your profile.',
    })
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('creates a new profile using the verified Auth phone', async () => {
    const newProfile = makeCustomerProfile()
    const writeQuery = makeProfileWriteQuery(newProfile)

    auth.getUser.mockResolvedValue({
      data: { user: makeAuthUser() },
      error: null,
    })
    fromMock
      .mockReturnValueOnce(makeProfileLookup(null))
      .mockReturnValueOnce(writeQuery)

    const result = await createCustomerProfile(
      '+919876543210',
      '  A Customer  ',
      '  Example Company  ',
    )

    expect(result).toEqual({ success: true, profile: newProfile })
    expect(writeQuery.insert).toHaveBeenCalledWith({
      id: 'user-123',
      full_name: 'A Customer',
      phone: '9876543210',
      company_name: 'Example Company',
    })
  })

  it('rejects a new registration phone that differs from verified Auth', async () => {
    auth.getUser.mockResolvedValue({
      data: { user: makeAuthUser() },
      error: null,
    })
    fromMock.mockReturnValueOnce(makeProfileLookup(null))

    const result = await createCustomerProfile(
      '9812345678',
      'A Customer',
      'Example Company',
    )

    expect(result).toMatchObject({
      success: false,
      error: 'The registration number does not match the mobile number verified by OTP.',
    })
    expect(fromMock).toHaveBeenCalledTimes(1)
  })

  it('repairs an existing profile phone from verified Auth instead of trusting the supplied phone', async () => {
    const existingProfile = makeCustomerProfile({
      phone: '9812345678',
    })
    const updatedProfile = makeCustomerProfile({
      phone: '9876543210',
      full_name: 'Updated Customer',
    })
    const writeQuery = makeProfileWriteQuery(updatedProfile)

    auth.getUser.mockResolvedValue({
      data: { user: makeAuthUser() },
      error: null,
    })
    fromMock
      .mockReturnValueOnce(makeProfileLookup(existingProfile))
      .mockReturnValueOnce(writeQuery)

    const result = await createCustomerProfile(
      '9812345678',
      'Updated Customer',
      'Example Company',
    )

    expect(result).toEqual({ success: true, profile: updatedProfile })
    expect(writeQuery.update).toHaveBeenCalledWith({
      full_name: 'Updated Customer',
      phone: '9876543210',
      company_name: 'Example Company',
    })
    expect(writeQuery.eq).toHaveBeenCalledWith('id', 'user-123')
  })
})
