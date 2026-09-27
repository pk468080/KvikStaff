import { supabase } from '../../lib/supabase'

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

function getBookingCurrency(
  pricingSnapshot: unknown,
): string | null {
  if (
    pricingSnapshot &&
    typeof pricingSnapshot === 'object' &&
    'currency' in pricingSnapshot &&
    typeof pricingSnapshot.currency === 'string'
  ) {
    return pricingSnapshot.currency
  }

  return null
}

function getDateOnly(
  date: Date,
): string {
  const year = date.getFullYear()
  const month = String(
    date.getMonth() + 1,
  ).padStart(2, '0')
  const day = String(
    date.getDate(),
  ).padStart(2, '0')

  return `${year}-${month}-${day}`
}

/**
 * Loads the payment values from the booking itself.
 *
 * Navigation parameters are display/navigation context only.
 * The booking row remains the authoritative customer payment source.
 */
export async function getBookingPaymentDetails(
  bookingId: string,
): Promise<BookingPaymentDetails> {
  if (!bookingId) {
    throw new Error('A booking ID is required.')
  }

  const {
    data,
    error,
  } = await supabase
    .from('bookings')
    .select(
      `
        id,
        total_amount,
        pricing_snapshot,
        total_working_hours,
        fulfillment_type,
        schedule_start_date,
        schedule_end_date,
        selected_weekdays,
        off_dates
      `,
    )
    .eq('id', bookingId)
    .single()

  if (error) {
    throw error
  }

  if (!data) {
    throw new Error(
      'The booking could not be found.',
    )
  }

  const amount = Number(
    data.total_amount,
  )

  const currency = getBookingCurrency(
    data.pricing_snapshot,
  )

  const totalWorkingHours = Number(
    data.total_working_hours,
  )

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    throw new Error(
      'The booking payment amount is invalid.',
    )
  }

  if (!currency) {
    throw new Error(
      'The booking payment currency is missing.',
    )
  }

  if (
    !Number.isFinite(
      totalWorkingHours,
    ) ||
    totalWorkingHours <= 0
  ) {
    throw new Error(
      'The booking working hours are invalid.',
    )
  }

  /*
   * Instant bookings always contain one occurrence.
   */
  /*
 * Instant and scheduled bookings are single-record bookings.
 * Only recurring bookings use the persisted recurring schedule
 * fields to calculate the occurrence count.
 */
if (
  data.fulfillment_type ===
  'instant' ||
  data.fulfillment_type ===
  'scheduled'
) {
  return {
    bookingId: data.id,
    amount,
    currency,
    occurrenceCount: 1,
    totalWorkingHours,
  }
}

  /*
   * Scheduled and recurring bookings derive their
   * occurrence count from the persisted booking schedule.
   *
   * The price itself is NOT recalculated here.
   * total_amount remains authoritative.
   */
  const startDate =
    data.schedule_start_date

  const endDate =
    data.schedule_end_date

  const selectedWeekdays =
    Array.isArray(
      data.selected_weekdays,
    )
      ? data.selected_weekdays
          .map(Number)
          .filter(Number.isInteger)
      : []

  const excludedDates = new Set(
    Array.isArray(data.off_dates)
      ? data.off_dates.map(String)
      : [],
  )

  if (
    !startDate ||
    !endDate ||
    selectedWeekdays.length === 0
  ) {
    throw new Error(
      'The booking schedule is incomplete.',
    )
  }

  /*
   * These are date-only values from the database.
   * Constructing local midnight avoids introducing a
   * UTC date shift while calculating weekday occurrences.
   */
  const start = new Date(
    `${startDate}T00:00:00`,
  )

  const end = new Date(
    `${endDate}T00:00:00`,
  )

  if (
    !Number.isFinite(
      start.getTime(),
    ) ||
    !Number.isFinite(
      end.getTime(),
    ) ||
    end < start
  ) {
    throw new Error(
      'The booking schedule is invalid.',
    )
  }

  let occurrenceCount = 0

  for (
    const cursor = new Date(start);
    cursor <= end;
    cursor.setDate(
      cursor.getDate() + 1,
    )
  ) {
    const dateOnly = getDateOnly(
      cursor,
    )

    if (
      selectedWeekdays.includes(
        cursor.getDay(),
      ) &&
      !excludedDates.has(
        dateOnly,
      )
    ) {
      occurrenceCount += 1
    }
  }

  if (
    occurrenceCount <= 0
  ) {
    throw new Error(
      'The booking has no payable occurrences.',
    )
  }

  return {
    bookingId: data.id,
    amount,
    currency,
    occurrenceCount,
    totalWorkingHours,
  }
}

export async function markRazorpayPaymentFailed(
  bookingId: string,
): Promise<void> {
  const {
    data,
    error,
  } = await supabase.functions.invoke(
    'create-razorpay-order',
    {
      body: {
        bookingId,
        action: 'mark_payment_failed',
      },
    },
  )

  if (error) {
    throw error
  }

  const result =
    data as Record<
      string,
      unknown
    > | null

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
): Promise<RazorpayOrder> {
  /*
   * We only need the service variant so the Edge Function
   * can validate the booking/service relationship.
   *
   * The payment amount and currency are NOT sent to the
   * server as authoritative values.
   */
  const {
    data: booking,
    error: bookingError,
  } = await supabase
    .from('bookings')
    .select(
      'service_variant_id',
    )
    .eq('id', bookingId)
    .single()

  if (bookingError) {
    throw bookingError
  }

  const packageId = (
    booking as {
      service_variant_id?: unknown
    }
  ).service_variant_id

  if (
    typeof packageId !== 'string' ||
    packageId.length === 0
  ) {
    throw new Error(
      'The booking service variant is missing.',
    )
  }

  const {
    data,
    error,
  } = await supabase.functions.invoke(
    'create-razorpay-order',
    {
      body: {
        bookingId,
        packageId,
      },
    },
  )

  if (error) {
    throw error
  }

  const result =
    data as Record<
      string,
      unknown
    > | null

  /*
   * The backend found that Razorpay already captured
   * this booking's payment and reconciled it.
   *
   * Never open Checkout again.
   */
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
    currency: expectedCurrency,
    alreadyPaid: false,
    paymentPending: true,
    status:
      typeof result.status === 'string'
        ? result.status
        : 'authorized',
  }
}

  const amount =
    Number(result?.amount) / 100

  if (
    result?.success !== true ||
    typeof result.keyId !==
      'string' ||
    typeof result.orderId !==
      'string' ||
    !Number.isFinite(amount) ||
    Math.round(
      amount * 100,
    ) !==
      Math.round(
        expectedAmount * 100,
      ) ||
    result.currency !==
      expectedCurrency
  ) {
    throw new Error(
      'The payment order does not match the booking amount.',
    )
  }

  return {
    keyId: result.keyId,
    orderId: result.orderId,
    amount: Number(
      result.amount,
    ),
    currency:
      result.currency,
    alreadyPaid: false,
  }
}

export async function verifyRazorpayPayment(
  bookingId: string,
  checkout: RazorpayCheckoutResult,
): Promise<RazorpayPaymentResult> {
  const {
    data,
    error,
  } = await supabase.functions.invoke(
    'verify-razorpay-payment',
    {
      body: {
        bookingId,
        razorpayOrderId:
          checkout.razorpay_order_id,
        razorpayPaymentId:
          checkout.razorpay_payment_id,
        razorpaySignature:
          checkout.razorpay_signature,
      },
    },
  )

  /*
   * Supabase functions.invoke() can return a generic
   * FunctionsHttpError for a non-2xx response.
   *
   * Try to read the actual JSON response from the
   * Edge Function so the customer app can show the
   * real verification/finalization error.
   */
  if (error) {
    let serverMessage: string | null = null

    try {
      const context = (
        error as {
          context?: {
            json?: () => Promise<unknown>
          }
        }
      ).context

      if (
        context &&
        typeof context.json === 'function'
      ) {
        const responseBody =
          await context.json()

        if (
          responseBody &&
          typeof responseBody === 'object' &&
          'error' in responseBody &&
          typeof (
            responseBody as {
              error?: unknown
            }
          ).error === 'string'
        ) {
          serverMessage = (
            responseBody as {
              error: string
            }
          ).error
        }
      }
    } catch (readError) {
      console.error(
        'Unable to read payment verification error:',
        readError,
      )
    }

    throw new Error(
      serverMessage ??
        error.message ??
        'Payment verification failed.',
    )
  }

  const result =
    data as Record<
      string,
      unknown
    > | null

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
      'string'
        ? result.error
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