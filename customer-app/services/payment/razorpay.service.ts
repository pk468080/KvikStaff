import {
  apiRequest,
} from '../../lib/api'

export type RazorpayOrder = {
  keyId: string
  orderId: string
  amount: number
  currency: string
  alreadyPaid?: boolean
  paymentPending?: boolean
  paymentId?: string
  status?: string
}

export type RazorpayPaymentResult = {
  success: boolean
  bookingId: string
  paymentId: string
  status: string
  paymentPending?: boolean
}

export type RazorpayCheckoutResult = {
  razorpay_payment_id: string
  razorpay_order_id: string
  razorpay_signature: string
}

export type BookingPaymentDetails = {
  bookingId: string
  amount: number
  currency: string
  occurrenceCount: number
  totalWorkingHours: number
}

type BookingPaymentDetailsApiResponse = {
  bookingId: string
  amount: number | string
  currency: string
  occurrenceCount: number | string
  totalWorkingHours: number | string
}

function parseAmount(
  value: unknown,
): number {
  const amount =
    typeof value === 'number'
      ? value
      : Number(value)

  if (
    !Number.isFinite(amount)
  ) {
    throw new Error(
      'The booking payment amount is invalid.',
    )
  }

  return amount
}

export async function getBookingPaymentDetails(
  bookingId: string,
): Promise<BookingPaymentDetails> {
  if (!bookingId) {
    throw new Error(
      'A booking ID is required.',
    )
  }

  const result =
    await apiRequest<BookingPaymentDetailsApiResponse>(
      `/payments/bookings/${bookingId}`,
      {
        method: 'GET',
      },
    )

  const amount =
    parseAmount(result.amount)

  const totalWorkingHours =
    parseAmount(
      result.totalWorkingHours,
    )

  const occurrenceCount =
    Number(
      result.occurrenceCount,
    )

  if (
    amount <= 0
  ) {
    throw new Error(
      'The booking payment amount is invalid.',
    )
  }

  if (
    !result.currency ||
    typeof result.currency !== 'string'
  ) {
    throw new Error(
      'The booking payment currency is missing.',
    )
  }

  if (
    !Number.isInteger(
      occurrenceCount,
    ) ||
    occurrenceCount <= 0
  ) {
    throw new Error(
      'The booking occurrence count is invalid.',
    )
  }

  if (
    totalWorkingHours <= 0
  ) {
    throw new Error(
      'The booking working hours are invalid.',
    )
  }

  return {
    bookingId:
      result.bookingId,
    amount,
    currency:
      result.currency,
    occurrenceCount,
    totalWorkingHours,
  }
}

export async function markRazorpayPaymentFailed(
  bookingId: string,
): Promise<void> {
  if (!bookingId) {
    throw new Error(
      'A booking ID is required.',
    )
  }

  const result =
    await apiRequest<{
      success: boolean
      bookingId: string
      status: string
    }>(
      '/payments/mark-failed',
      {
        method: 'POST',
        body: JSON.stringify({
          booking_id:
            bookingId,
        }),
      },
    )

  if (
    result?.success !== true
  ) {
    throw new Error(
      'Unable to update the booking payment status.',
    )
  }
}

export async function createRazorpayOrder(
  bookingId: string,
  expectedAmount: number,
  expectedCurrency: string,
  idempotencyKey: string,
): Promise<RazorpayOrder> {
  if (!bookingId) {
    throw new Error(
      'A booking ID is required.',
    )
  }

  const result =
    await apiRequest<
      Record<string, unknown>
    >(
      '/payments/order',
      {
        method: 'POST',
        idempotencyKey,
        body: JSON.stringify({
          booking_id:
            bookingId,
        }),
      },
    )

  if (
    result?.success === true &&
    result?.alreadyPaid === true
  ) {
    return {
      keyId:
        typeof result.keyId === 'string'
          ? result.keyId
          : '',
      orderId:
        typeof result.orderId === 'string'
          ? result.orderId
          : '',
      amount:
        typeof result.amount === 'number'
          ? result.amount
          : Math.round(
              expectedAmount * 100,
            ),
      currency:
        typeof result.currency === 'string'
          ? result.currency
          : expectedCurrency,
      alreadyPaid: true,
      paymentId:
        typeof result.paymentId === 'string'
          ? result.paymentId
          : undefined,
      status:
        typeof result.status === 'string'
          ? result.status
          : 'paid',
    }
  }

  if (
    result?.success === true &&
    result?.paymentPending === true
  ) {
    return {
      keyId: '',
      orderId:
        typeof result.orderId === 'string'
          ? result.orderId
          : '',
      amount: 0,
      currency:
        typeof result.currency === 'string'
          ? result.currency
          : expectedCurrency,
      alreadyPaid: false,
      paymentPending: true,
      status:
        typeof result.status === 'string'
          ? result.status
          : 'authorized',
    }
  }

  const amount =
    Number(result?.amount)

  const keyId =
    typeof result?.keyId === 'string'
      ? result.keyId
      : ''

  const orderId =
    typeof result?.orderId === 'string'
      ? result.orderId
      : ''

  const currency =
    typeof result?.currency === 'string'
      ? result.currency
      : ''

  if (
    result?.success !== true ||
    !keyId ||
    !orderId ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !currency
  ) {
    throw new Error(
      'The payment order returned by the server is invalid.',
    )
  }

  const expectedAmountPaise =
    Math.round(
      expectedAmount * 100,
    )

  if (
    amount !==
    expectedAmountPaise
  ) {
    throw new Error(
      'The payment order does not match the booking amount.',
    )
  }

  if (
    currency !==
    expectedCurrency
  ) {
    throw new Error(
      'The payment order does not match the booking currency.',
    )
  }

  return {
    keyId,
    orderId,
    amount,
    currency,
    alreadyPaid: false,
  }
}

export async function verifyRazorpayPayment(
  bookingId: string,
  checkout: RazorpayCheckoutResult,
): Promise<RazorpayPaymentResult> {
  if (!bookingId) {
    throw new Error(
      'A booking ID is required.',
    )
  }

  if (
    !checkout.razorpay_order_id ||
    !checkout.razorpay_payment_id ||
    !checkout.razorpay_signature
  ) {
    throw new Error(
      'Razorpay returned incomplete payment verification data.',
    )
  }

  const result =
    await apiRequest<
      Record<string, unknown>
    >(
      '/payments/verify',
      {
        method: 'POST',
        body: JSON.stringify({
          booking_id:
            bookingId,
          razorpay_order_id:
            checkout.razorpay_order_id,
          razorpay_payment_id:
            checkout.razorpay_payment_id,
          razorpay_signature:
            checkout.razorpay_signature,
        }),
      },
    )

  if (
    result?.success !== true ||
    typeof result.bookingId !==
      'string' ||
    typeof result.paymentId !==
      'string' ||
    typeof result.status !==
      'string'
  ) {
    const serverError =
      typeof result?.error ===
        'object' &&
      result.error !== null &&
      typeof (
        result.error as {
          message?: unknown
        }
      ).message === 'string'
        ? (
            result.error as {
              message: string
            }
          ).message
        : null

    throw new Error(
      serverError ??
        'Payment verification failed.',
    )
  }

  return {
    success: true,
    bookingId:
      result.bookingId,
    paymentId:
      result.paymentId,
    status:
      result.status,
    paymentPending:
      result.paymentPending === true,
  }
}