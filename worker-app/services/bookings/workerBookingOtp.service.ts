import * as Crypto from 'expo-crypto'

import {
  supabase,
} from '../../lib/supabase'

import type {
  WorkerBooking,
  WorkerBookingOccurrence,
  WorkerOtpType,
  WorkerOtpVerificationResponse,
} from '../../types/booking'

const OTP_LENGTH = 6

async function sha256(
  value: string,
): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    value,
    {
      encoding:
        Crypto.CryptoEncoding.HEX,
    },
  )
}

function validateOtp(
  otp: string,
): string {
  const normalized =
    otp.trim()

  if (
    !new RegExp(
      `^\\d{${OTP_LENGTH}}$`,
    ).test(normalized)
  ) {
    throw new Error(
      `OTP must be a ${OTP_LENGTH}-digit number.`,
    )
  }

  return normalized
}

function validateOtpType(
  otpType: WorkerOtpType,
): void {
  if (
    otpType !== 'start' &&
    otpType !== 'end'
  ) {
    throw new Error(
      'OTP type must be start or end.',
    )
  }
}

function validateBookingId(
  bookingId: string,
): void {
  if (!bookingId.trim()) {
    throw new Error(
      'Booking id is required.',
    )
  }
}

function validateOccurrenceId(
  occurrenceId: string,
): void {
  if (!occurrenceId.trim()) {
    throw new Error(
      'Occurrence id is required.',
    )
  }
}

type BookingOtpRpcResult = {
  success?: boolean
  booking_id?: string
  otp_type?: string
  status?: string
  error?: string
}

type OccurrenceOtpRpcResult = {
  success?: boolean
  occurrence_id?: string
  booking_id?: string
  otp_type?: string
  status?: string
  booking_completed?: boolean
  error?: string
}

function mapBookingOtpResult(
  result: BookingOtpRpcResult,
): WorkerOtpVerificationResponse {
  return {
    success:
      result.success === true,

    bookingId:
      result.booking_id,

    occurrenceId:
      null,

    otpType:
      result.otp_type as
        | WorkerOtpType
        | undefined,

    status:
      result.status,

    error:
      result.error,
  }
}

function mapOccurrenceOtpResult(
  result: OccurrenceOtpRpcResult,
): WorkerOtpVerificationResponse {
  return {
    success:
      result.success === true,

    bookingId:
      result.booking_id,

    occurrenceId:
      result.occurrence_id,

    otpType:
      result.otp_type as
        | WorkerOtpType
        | undefined,

    status:
      result.status,

    bookingCompleted:
      result.booking_completed,

    error:
      result.error,
  }
}

async function verifyBookingOtp(
  bookingId: string,
  otpType: WorkerOtpType,
  otp: string,
): Promise<WorkerOtpVerificationResponse> {
  validateBookingId(
    bookingId,
  )

  validateOtpType(
    otpType,
  )

  const normalizedOtp =
    validateOtp(otp)

  const otpHash =
    await sha256(
      `${bookingId}:${normalizedOtp}`,
    )

  const {
    data,
    error,
  } =
    await supabase.rpc(
      'verify_booking_otp_atomic',
      {
        p_booking_id:
          bookingId,

        p_otp_type:
          otpType,

        p_otp_hash:
          otpHash,
      },
    )

  if (error) {
    throw error
  }

  const result =
    (data ?? {}) as BookingOtpRpcResult

  const response =
    mapBookingOtpResult(
      result,
    )

  if (!response.success) {
    throw new Error(
      response.error ||
        'Booking OTP verification failed.',
    )
  }

  if (
    response.bookingId &&
    response.bookingId !==
      bookingId
  ) {
    throw new Error(
      'OTP response belongs to a different booking.',
    )
  }

  if (
    response.otpType &&
    response.otpType !==
      otpType
  ) {
    throw new Error(
      'OTP response type does not match the requested OTP.',
    )
  }

  return response
}

async function verifyOccurrenceOtp(
  occurrenceId: string,
  otpType: WorkerOtpType,
  otp: string,
): Promise<WorkerOtpVerificationResponse> {
  validateOccurrenceId(
    occurrenceId,
  )

  validateOtpType(
    otpType,
  )

  const normalizedOtp =
    validateOtp(otp)

  const otpHash =
    await sha256(
      `${occurrenceId}:${normalizedOtp}`,
    )

  const {
    data,
    error,
  } =
    await supabase.rpc(
      'verify_booking_occurrence_otp_atomic',
      {
        p_occurrence_id:
          occurrenceId,

        p_otp_type:
          otpType,

        p_otp_hash:
          otpHash,
      },
    )

  if (error) {
    throw error
  }

  const result =
    (data ?? {}) as OccurrenceOtpRpcResult

  const response =
    mapOccurrenceOtpResult(
      result,
    )

  if (!response.success) {
    throw new Error(
      response.error ||
        'Occurrence OTP verification failed.',
    )
  }

  if (
    response.occurrenceId &&
    response.occurrenceId !==
      occurrenceId
  ) {
    throw new Error(
      'OTP response belongs to a different occurrence.',
    )
  }

  if (
    response.otpType &&
    response.otpType !==
      otpType
  ) {
    throw new Error(
      'OTP response type does not match the requested OTP.',
    )
  }

  return response
}

export async function verifyWorkerBookingStartOtp(
  bookingId: string,
  otp: string,
): Promise<WorkerOtpVerificationResponse> {
  return verifyBookingOtp(
    bookingId,
    'start',
    otp,
  )
}

export async function verifyWorkerBookingEndOtp(
  bookingId: string,
  otp: string,
): Promise<WorkerOtpVerificationResponse> {
  return verifyBookingOtp(
    bookingId,
    'end',
    otp,
  )
}

export async function verifyWorkerOccurrenceStartOtp(
  occurrenceId: string,
  otp: string,
): Promise<WorkerOtpVerificationResponse> {
  return verifyOccurrenceOtp(
    occurrenceId,
    'start',
    otp,
  )
}

export async function verifyWorkerOccurrenceEndOtp(
  occurrenceId: string,
  otp: string,
): Promise<WorkerOtpVerificationResponse> {
  return verifyOccurrenceOtp(
    occurrenceId,
    'end',
    otp,
  )
}

export async function verifyWorkerOtp(
  target:
    | WorkerBooking
    | WorkerBookingOccurrence,
  otpType: WorkerOtpType,
  otp: string,
): Promise<WorkerOtpVerificationResponse> {
  if (
    'bookingType' in target
  ) {
    return verifyBookingOtp(
      target.id,
      otpType,
      otp,
    )
  }

  return verifyOccurrenceOtp(
    target.id,
    otpType,
    otp,
  )
}

export function canVerifyBookingStartOtp(
  booking: WorkerBooking,
): boolean {
  return (
    booking.status ===
      'arrived' &&
    booking.startedAt === null &&
    booking.startOtpVerifiedAt === null
  )
}

export function canVerifyBookingEndOtp(
  booking: WorkerBooking,
): boolean {
  return (
    booking.status ===
      'in_progress' &&
    booking.completedAt === null &&
    booking.endOtpVerifiedAt === null
  )
}

export function canVerifyOccurrenceStartOtp(
  occurrence: WorkerBookingOccurrence,
): boolean {
  return (
    occurrence.status ===
      'arrived' &&
    occurrence.startedAt === null &&
    occurrence.startOtpVerifiedAt === null
  )
}

export function canVerifyOccurrenceEndOtp(
  occurrence: WorkerBookingOccurrence,
): boolean {
  return (
    occurrence.status ===
      'in_progress' &&
    occurrence.completedAt === null &&
    occurrence.endOtpVerifiedAt === null
  )
}

export function getOtpVerificationError(
  response: WorkerOtpVerificationResponse,
): string | null {
  return response.success
    ? null
    : response.error ||
        'OTP verification failed.'
}