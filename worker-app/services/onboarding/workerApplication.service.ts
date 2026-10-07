import { supabase } from '../../lib/supabase'

import type {
  WorkerApplication,
  WorkerApplicationStatus,
  WorkerApplicationWithProfile,
  WorkerOnboardingProfile,
  WorkerOnboardingType,
} from '../../types/application'

type ApplicationRow = {
  id: string
  worker_id: string
  onboarding_type: WorkerOnboardingType
  status: WorkerApplicationStatus
  submitted_at: string | null
  reviewed_at: string | null
  review_notes: string | null
  reapply_after: string | null
  created_at: string
  updated_at: string
}

type OnboardingProfileRow = {
  date_of_birth: string | null
  gender: string | null
  current_address: string | null
  permanent_address: string | null
  city: string | null
  state: string | null
  pincode: string | null
  experience_years: number | null
  experience_summary: string | null
  service_latitude: number | null
  service_longitude: number | null
  onboarding_step: number
  consent_at: string | null
}

function mapApplication(
  row: ApplicationRow,
): WorkerApplication {
  return {
    id: row.id,
    workerId: row.worker_id,
    onboardingType: row.onboarding_type,
    status: row.status,
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at,
    reviewNotes: row.review_notes,
    reapplyAfter: row.reapply_after,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapOnboardingProfile(
  row: OnboardingProfileRow | null,
): WorkerOnboardingProfile | null {
  if (!row) {
    return null
  }

  return {
    dateOfBirth: row.date_of_birth,
    gender: row.gender,

    currentAddress: row.current_address,
    permanentAddress: row.permanent_address,

    city: row.city,
    state: row.state,
    pincode: row.pincode,

    experienceYears:
      row.experience_years === null
        ? null
        : Number(row.experience_years),

    experienceSummary: row.experience_summary,

    serviceLatitude:
      row.service_latitude === null
        ? null
        : Number(row.service_latitude),

    serviceLongitude:
      row.service_longitude === null
        ? null
        : Number(row.service_longitude),

    onboardingStep: row.onboarding_step,

    consentAt: row.consent_at,
  }
}

async function getCurrentWorkerId(): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error) {
    throw error
  }

  if (!user) {
    throw new Error(
      'A worker authentication session is required.',
    )
  }

  return user.id
}

async function getLatestApplicationRow(
  workerId: string,
): Promise<ApplicationRow | null> {
  const {
    data,
    error,
  } = await supabase
    .from('worker_applications')
    .select(
      'id, worker_id, onboarding_type, status, submitted_at, reviewed_at, review_notes, reapply_after, created_at, updated_at',
    )
    .eq('worker_id', workerId)
    .order('created_at', {
      ascending: false,
    })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw error
  }

  return data
}

export async function getCurrentWorkerApplication(): Promise<
  WorkerApplication | null
> {
  const workerId = await getCurrentWorkerId()

  const application =
    await getLatestApplicationRow(workerId)

  return application
    ? mapApplication(application)
    : null
}

export async function getCurrentWorkerApplicationWithProfile(): Promise<
  WorkerApplicationWithProfile | null
> {
  const workerId = await getCurrentWorkerId()

  const application =
    await getLatestApplicationRow(workerId)

  if (!application) {
    return null
  }

  const {
    data: onboardingProfile,
    error: onboardingProfileError,
  } = await supabase
    .from('worker_onboarding_profiles')
    .select(
      'date_of_birth, gender, current_address, permanent_address, city, state, pincode, experience_years, experience_summary, service_latitude, service_longitude, onboarding_step, consent_at',
    )
    .eq('worker_id', workerId)
    .maybeSingle()

  if (onboardingProfileError) {
    throw onboardingProfileError
  }

  return {
    ...mapApplication(application),
    onboardingProfile:
      mapOnboardingProfile(onboardingProfile),
  }
}

export async function createWorkerApplication(): Promise<
  WorkerApplication
> {
  const workerId = await getCurrentWorkerId()

  const application =
    await getLatestApplicationRow(workerId)

  if (!application) {
    throw new Error(
      'No worker application exists for this account. Please contact KvikStaff support.',
    )
  }

  return mapApplication(application)
}

export async function submitWorkerApplication(): Promise<
  WorkerApplication
> {
  const workerId = await getCurrentWorkerId()

  const application =
    await getLatestApplicationRow(workerId)

  if (!application) {
    throw new Error(
      'No worker application exists.',
    )
  }

  const { error } = await supabase.rpc(
    'submit_worker_application',
    {},
  )

  if (error) {
    throw error
  }

  const updatedApplication =
    await getLatestApplicationRow(workerId)

  if (!updatedApplication) {
    throw new Error(
      'The worker application could not be loaded after submission.',
    )
  }

  return mapApplication(updatedApplication)
}