import { supabase } from '../../lib/supabase'

export type CustomerInvoice = {
  invoiceReference: string
  bookingId: string
  paymentId: string
  serviceName: string
  bookingType: string | null
  scheduledStart: string | null
  scheduledEnd: string | null
  workingHours: number | null
  completedAt: string | null
  subtotal: number
  discountAmount: number
  platformFee: number
  taxAmount: number
  totalAmount: number
  currency: string
  paymentStatus: string
  paymentProvider: string
  providerPaymentId: string | null
  providerOrderId: string | null
  paidAt: string | null
  createdAt: string | null
}

type InvoiceBookingRow = {
  id: string
  customer_id: string
  status: string
  fulfillment_type: string | null
  scheduled_start: string | null
  scheduled_end: string | null
  total_working_hours: number | null
  base_amount: number
  discount_amount: number
  platform_fee: number
  tax_amount: number
  total_amount: number
  completed_at: string | null
  created_at: string
  service_variant?: {
    service?: {
      name?: string | null
    } | null
  } | null
}

type InvoicePaymentRow = {
  id: string
  booking_id: string
  amount: number
  currency: string
  status: string
  provider: string
  provider_order_id: string | null
  provider_payment_id: string | null
  paid_at: string | null
  created_at: string
}

const INVOICE_BOOKING_SELECT = `
  id,
  customer_id,
  status,
  fulfillment_type,
  scheduled_start,
  scheduled_end,
  total_working_hours,
  base_amount,
  discount_amount,
  platform_fee,
  tax_amount,
  total_amount,
  completed_at,
  created_at,
  service_variant:service_variants(
    service:services(
      name
    )
  )
`

const INVOICE_PAYMENT_SELECT = `
  id,
  booking_id,
  amount,
  currency,
  status,
  provider,
  provider_order_id,
  provider_payment_id,
  paid_at,
  created_at
`

function requireMoney(
  value: unknown,
  label: string,
): number {
  const amount = Number(value)

  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`The stored ${label} is invalid.`)
  }

  return amount
}

function requireCurrency(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('The stored payment currency is invalid.')
  }

  return value.trim().toUpperCase()
}

export function createReceiptReference(bookingId: string): string {
  const normalized = bookingId.trim()

  if (!normalized) {
    throw new Error('A booking ID is required.')
  }

  return `TEMPSTAFF-REC-${normalized.slice(0, 8).toUpperCase()}`
}

export function mapCustomerInvoice(
  booking: InvoiceBookingRow,
  payment: InvoicePaymentRow,
): CustomerInvoice {
  if (booking.status !== 'completed') {
    throw new Error('A payment receipt is available only for completed bookings.')
  }

  if (payment.booking_id !== booking.id) {
    throw new Error('The payment does not belong to this booking.')
  }

  const paymentAmount = requireMoney(payment.amount, 'payment amount')
  const totalAmount = requireMoney(booking.total_amount, 'booking total')

  if (paymentAmount !== totalAmount) {
    throw new Error('The stored payment and booking totals do not match.')
  }

  return {
    invoiceReference: createReceiptReference(booking.id),
    bookingId: booking.id,
    paymentId: payment.id,
    serviceName:
      booking.service_variant?.service?.name ??
      'Service',
    bookingType: booking.fulfillment_type,
    scheduledStart: booking.scheduled_start,
    scheduledEnd: booking.scheduled_end,
    workingHours:
      booking.total_working_hours === null
        ? null
        : requireMoney(booking.total_working_hours, 'working hours'),
    completedAt: booking.completed_at,
    subtotal: requireMoney(booking.base_amount, 'subtotal'),
    discountAmount: requireMoney(booking.discount_amount, 'discount'),
    platformFee: requireMoney(booking.platform_fee, 'platform fee'),
    taxAmount: requireMoney(booking.tax_amount, 'tax'),
    totalAmount,
    currency: requireCurrency(payment.currency),
    paymentStatus: payment.status,
    paymentProvider: payment.provider,
    providerPaymentId: payment.provider_payment_id,
    providerOrderId: payment.provider_order_id,
    paidAt: payment.paid_at,
    createdAt: payment.created_at,
  }
}

export async function getCustomerInvoice(
  bookingId: string,
): Promise<CustomerInvoice> {
  if (!bookingId.trim()) {
    throw new Error('A booking ID is required.')
  }

  const {
    data: userData,
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !userData.user) {
    throw new Error('Authentication is required to view this receipt.')
  }

  const {
    data: booking,
    error: bookingError,
  } = await supabase
    .from('bookings')
    .select(INVOICE_BOOKING_SELECT)
    .eq('id', bookingId)
    .eq('customer_id', userData.user.id)
    .maybeSingle()

  if (bookingError) {
    throw new Error('Unable to load the booking receipt.')
  }

  if (!booking) {
    throw new Error('Booking not found or unavailable.')
  }

  if (booking.status !== 'completed') {
    throw new Error('A payment receipt is available only for completed bookings.')
  }

  const {
    data: payment,
    error: paymentError,
  } = await supabase
    .from('payments')
    .select(INVOICE_PAYMENT_SELECT)
    .eq('booking_id', bookingId)
    .maybeSingle()

  if (paymentError) {
    throw new Error('Unable to load the booking payment receipt.')
  }

  if (!payment) {
    throw new Error('No valid payment record was found for this booking.')
  }

  return mapCustomerInvoice(
    booking as unknown as InvoiceBookingRow,
    payment as unknown as InvoicePaymentRow,
  )
}
