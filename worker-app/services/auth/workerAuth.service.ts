import type {
  Session,
} from '@supabase/supabase-js'

import { supabase } from '../../lib/supabase'
import {
  deactivateCurrentWorkerPushToken,
} from '../notifications/workerNotifications.service'
import {
  goOffline,
} from '../worker/workerPresence.service'
import {
  getCurrentWorkerApplication,
} from '../../services/onboarding/workerApplication.service'
import type {
  WorkerLocation,
  WorkerProfile,
  WorkerStatus,
} from '../../types/worker'

const MAX_NAME_LENGTH = 100

export type WorkerAuthState =
  | {
      authenticated: false
      needsRegistration: true
      email: string
    }
  | {
      authenticated: true
      needsRegistration: true
      email: string
    }
  | {
      authenticated: true
      needsRegistration: false
      email: string
    }

export type WorkerAuthResult =
  | {
      success: true
      session: Session
    }
  | {
      success: false
      error: string
    }

export type WorkerRegistrationResult =
  | {
      success: true
      session: Session
    }
  | {
      success: false
      error: string
      needsEmailConfirmation?: boolean
    }

type ProfileRow = {
  id: string
  full_name: string | null
  phone: string | null
  email: string | null
  role: string
  is_active: boolean
}

type WorkerProfileRow = {
  id: string
  worker_status: WorkerStatus
  service_radius_km: number
  is_verified: boolean
  is_featured: boolean
  rating: number
  total_completed_jobs: number
  current_location: unknown
  created_at: string
  updated_at: string
}

type WorkerLocationRow = {
  latitude: number
  longitude: number
  recorded_at: string
}

function normalizeEmail(
  email: string,
): string {
  return email
    .trim()
    .toLowerCase()
}

function normalizePhone(
  phone: string,
): string {
  return phone.replace(
    /\D/g,
    '',
  )
}

function isValidEmail(
  email: string,
): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    email,
  )
}

function isValidPhone(
  phone: string,
): boolean {
  const normalizedPhone =
    normalizePhone(
      phone,
    )

  return (
    normalizedPhone.length >= 10 &&
    normalizedPhone.length <= 15
  )
}

function parseWorkerLocation(
  value: unknown,
  recordedAt: string | null,
): WorkerLocation | null {
  if (
    !value ||
    !recordedAt
  ) {
    return null
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    'coordinates' in value
  ) {
    const coordinates = (
      value as {
        coordinates?: unknown
      }
    ).coordinates

    if (
      Array.isArray(
        coordinates,
      ) &&
      typeof coordinates[0] ===
        'number' &&
      typeof coordinates[1] ===
        'number'
    ) {
      return {
        longitude:
          coordinates[0],
        latitude:
          coordinates[1],
        recordedAt,
      }
    }
  }

  return null
}

async function fetchLatestWorkerLocation(
  workerId: string,
): Promise<WorkerLocationRow | null> {
  const {
    data,
    error,
  } =
    await supabase
      .from(
        'worker_locations',
      )
      .select(
        'latitude, longitude, recorded_at',
      )
      .eq(
  'worker_id',
  workerId,
)
.is(
  'booking_id',
  null,
)
.order(
  'recorded_at',
  {
    ascending: false,
  },
)
      .limit(1)
      .maybeSingle()

  if (error) {
    throw error
  }

  if (!data) {
    return null
  }

  return {
    latitude:
      Number(
        data.latitude,
      ),

    longitude:
      Number(
        data.longitude,
      ),

    recorded_at:
      data.recorded_at,
  }
}

function mapWorkerProfile(
  profile: ProfileRow,
  workerProfile: WorkerProfileRow,
  latestLocation: WorkerLocationRow | null,
): WorkerProfile {
  const currentLocation =
    latestLocation
      ? {
          latitude:
            latestLocation.latitude,

          longitude:
            latestLocation.longitude,

          recordedAt:
            latestLocation.recorded_at,
        }
      : null

  return {
    id:
      profile.id,

    fullName:
      profile.full_name,

    email:
      profile.email,

    phone:
      profile.phone,

    isActive:
      profile.is_active,

    workerStatus:
      workerProfile.worker_status,

    isVerified:
      workerProfile.is_verified,

    isFeatured:
      workerProfile.is_featured,

    rating:
      Number(
        workerProfile.rating ??
          0,
      ),

    totalCompletedJobs:
      Number(
        workerProfile.total_completed_jobs ??
          0,
      ),

    serviceRadiusKm:
      Number(
        workerProfile.service_radius_km ??
          0,
      ),

    currentLocation,

    createdAt:
      workerProfile.created_at,

    updatedAt:
      workerProfile.updated_at,
  }
}

async function getCurrentSession(): Promise<Session | null> {
  const {
    data: {
      session,
    },
    error,
  } =
    await supabase.auth.getSession()

  if (error) {
    throw error
  }

  return session
}

async function getWorkerProfile(
  userId: string,
): Promise<WorkerProfile | null> {
  const {
    data: profile,
    error: profileError,
  } =
    await supabase
      .from('profiles')
      .select(
        'id, full_name, phone, email, role, is_active',
      )
      .eq(
        'id',
        userId,
      )
      .maybeSingle()

  if (profileError) {
    throw profileError
  }

  if (!profile) {
    return null
  }

  if (
    profile.role !==
    'worker'
  ) {
    throw new Error(
      'The authenticated account is not a worker account.',
    )
  }

  if (
    !profile.is_active
  ) {
    throw new Error(
      'The worker account is inactive.',
    )
  }

  const {
    data: workerProfile,
    error:
      workerProfileError,
  } =
    await supabase
      .from(
        'worker_profiles',
      )
      .select(
        'id, worker_status, service_radius_km, is_verified, is_featured, rating, total_completed_jobs, current_location, created_at, updated_at',
      )
      .eq(
        'id',
        userId,
      )
      .maybeSingle()

  if (
    workerProfileError
  ) {
    throw workerProfileError
  }

  if (!workerProfile) {
    return null
  }

  const latestLocation =
    await fetchLatestWorkerLocation(
      userId,
    )

  return mapWorkerProfile(
    profile,
    workerProfile,
    latestLocation,
  )
}

function workerProfileNeedsRegistration(
  profile: WorkerProfile | null,
): boolean {
  if (!profile) {
    return true
  }

  return (
    !profile.fullName ||
    profile.fullName
      .trim()
      .length === 0 ||
    !profile.phone ||
    !isValidPhone(
      profile.phone,
    )
  )
}
async function workerNeedsOnboarding(): Promise<boolean> {
  const application =
    await getCurrentWorkerApplication()

  if (!application) {
    return true
  }

  return (
    application.status ===
      'draft' ||
    application.status ===
      'changes_required'
  )
}

export async function getCurrentWorkerProfile(): Promise<
  WorkerProfile | null
> {
  const session =
    await getCurrentSession()

  if (!session) {
    return null
  }

  return getWorkerProfile(
    session.user.id,
  )
}

export async function getWorkerAuthState(): Promise<WorkerAuthState> {
  const session =
    await getCurrentSession()

  if (!session) {
    return {
      authenticated: false,
      needsRegistration: true,
      email: '',
    }
  }

  const profile =
    await getWorkerProfile(
      session.user.id,
    )

  const email =
    typeof session.user.email ===
    'string'
      ? normalizeEmail(
          session.user.email,
        )
      : ''

  const needsProfileRegistration =
    workerProfileNeedsRegistration(
      profile,
    )

  if (needsProfileRegistration) {
    return {
      authenticated: true,
      needsRegistration: true,
      email,
    }
  }

  const needsOnboarding =
    await workerNeedsOnboarding()

  return {
    authenticated: true,
    needsRegistration:
      needsOnboarding,
    email,
  }
}

export async function signInWorker(
  email: string,
  password: string,
): Promise<WorkerAuthResult> {
  const normalizedEmail =
    normalizeEmail(email)

  if (
    !isValidEmail(
      normalizedEmail,
    )
  ) {
    return {
      success: false,
      error:
        'Please enter a valid email address.',
    }
  }

  if (!password) {
    return {
      success: false,
      error:
        'Password is required.',
    }
  }

  try {
    const {
      data,
      error,
    } =
      await supabase.auth.signInWithPassword(
        {
          email:
            normalizedEmail,
          password,
        },
      )

    if (error) {
      return {
        success: false,
        error:
          error.message,
      }
    }

    if (!data.session) {
      return {
        success: false,
        error:
          'Authentication succeeded but no session was returned.',
      }
    }

    const profile =
      await getWorkerProfile(
        data.user.id,
      )

    if (!profile) {
      await supabase.auth.signOut()

      return {
        success: false,
        error:
          'This account is not configured as a worker account.',
      }
    }

    return {
      success: true,
      session:
        data.session,
    }
  } catch (error) {
    console.error(
      'Worker sign-in failed:',
      error,
    )

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Unable to sign in.',
    }
  }
}

export async function registerWorkerAuth(
  email: string,
  password: string,
  fullName: string,
  phone: string,
): Promise<WorkerRegistrationResult> {
  const normalizedEmail =
    normalizeEmail(email)

  const normalizedPhone =
    normalizePhone(phone)

  const trimmedName =
    fullName.trim()

  if (
    !isValidEmail(
      normalizedEmail,
    )
  ) {
    return {
      success: false,
      error:
        'Please enter a valid email address.',
    }
  }

  if (
    password.length < 8
  ) {
    return {
      success: false,
      error:
        'Password must contain at least 8 characters.',
    }
  }

  if (!trimmedName) {
    return {
      success: false,
      error:
        'Full name is required.',
    }
  }

  if (
    trimmedName.length >
    MAX_NAME_LENGTH
  ) {
    return {
      success: false,
      error:
        `Name must be ${MAX_NAME_LENGTH} characters or fewer.`,
    }
  }

  if (
    !isValidPhone(
      normalizedPhone,
    )
  ) {
    return {
      success: false,
      error:
        'Please enter a valid mobile number.',
    }
  }

  try {
    const {
      data,
      error,
    } =
      await supabase.auth.signUp(
        {
          email:
            normalizedEmail,

          password,

          options: {
            data: {
              full_name:
                trimmedName,

              phone:
                normalizedPhone,

              role:
                'worker',
            },
          },
        },
      )

    if (error) {
      return {
        success: false,
        error:
          error.message,
      }
    }

    if (!data.session) {
      return {
        success: false,
        error:
          'Your account was created. Please verify your email before continuing.',
        needsEmailConfirmation:
          true,
      }
    }

    return {
      success: true,
      session:
        data.session,
    }
  } catch (error) {
    console.error(
      'Worker registration failed:',
      error,
    )

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Unable to create the worker account.',
    }
  }
}

export async function refreshWorkerSession(): Promise<Session | null> {
  const {
    data,
    error,
  } =
    await supabase.auth.refreshSession()

  if (error) {
    throw error
  }

  return data.session
}

export async function signOutWorker(): Promise<void> {
  try {
    await goOffline()
  } catch {
    console.warn(
      'Worker presence cleanup failed during sign out.',
    )
  }

  try {
    await deactivateCurrentWorkerPushToken()
  } catch {
    console.warn(
      'Worker push-token cleanup failed during sign out.',
    )
  }

  const {
    error,
  } =
    await supabase.auth.signOut()

  if (error) {
    throw error
  }
}

export function subscribeToWorkerAuthChanges(
  callback: (
    session: Session | null,
  ) => void,
) {
  return supabase.auth.onAuthStateChange(
    (
      _event,
      session,
    ) => {
      callback(
        session,
      )
    },
  )
}