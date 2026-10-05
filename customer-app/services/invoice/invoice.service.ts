import { apiRequest } from '../../lib/api'

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

function normalizeMoney(
  value: unknown,
  label: string,
): number {
  const amount = Number(value)

  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(
      `The stored ${label} is invalid.`,
    )
  }

  return amount
}

function normalizeCurrency(
  value: unknown,
): string {
  if (
    typeof value !== 'string' ||
    !value.trim()
  ) {
    throw new Error(
      'The stored payment currency is invalid.',
    )
  }

  return value.trim().toUpperCase()
}

function normalizeInvoice(
  data: unknown,
): CustomerInvoice {
  if (
    !data ||
    typeof data !== 'object'
  ) {
    throw new Error(
      'The backend did not return a valid payment receipt.',
    )
  }

  const result =
    data as Record<string, unknown>

  if (
    typeof result.invoice_reference !== 'string' ||
    typeof result.booking_id !== 'string' ||
    typeof result.payment_id !== 'string' ||
    typeof result.service_name !== 'string'
  ) {
    throw new Error(
      'The payment receipt response is missing required information.',
    )
  }

  if (
    typeof result.payment_status !== 'string' ||
    typeof result.payment_provider !== 'string'
  ) {
    throw new Error(
      'The payment receipt response is missing payment information.',
    )
  }

  return {
    invoiceReference:
      result.invoice_reference,
    bookingId:
      result.booking_id,
    paymentId:
      result.payment_id,
    serviceName:
      result.service_name,
    bookingType:
      typeof result.booking_type === 'string'
        ? result.booking_type
        : null,
    scheduledStart:
      typeof result.scheduled_start === 'string'
        ? result.scheduled_start
        : null,
    scheduledEnd:
      typeof result.scheduled_end === 'string'
        ? result.scheduled_end
        : null,
    workingHours:
      result.working_hours == null
        ? null
        : normalizeMoney(
            result.working_hours,
            'working hours',
          ),
    completedAt:
      typeof result.completed_at === 'string'
        ? result.completed_at
        : null,
    subtotal:
      normalizeMoney(
        result.subtotal,
        'subtotal',
      ),
    discountAmount:
      normalizeMoney(
        result.discount_amount,
        'discount',
      ),
    platformFee:
      normalizeMoney(
        result.platform_fee,
        'platform fee',
      ),
    taxAmount:
      normalizeMoney(
        result.tax_amount,
        'tax',
      ),
    totalAmount:
      normalizeMoney(
        result.total_amount,
        'booking total',
      ),
    currency:
      normalizeCurrency(
        result.currency,
      ),
    paymentStatus:
      result.payment_status,
    paymentProvider:
      result.payment_provider,
    providerPaymentId:
      typeof result.provider_payment_id === 'string'
        ? result.provider_payment_id
        : null,
    providerOrderId:
      typeof result.provider_order_id === 'string'
        ? result.provider_order_id
        : null,
    paidAt:
      typeof result.paid_at === 'string'
        ? result.paid_at
        : null,
    createdAt:
      typeof result.created_at === 'string'
        ? result.created_at
        : null,
  }
}

export function createReceiptReference(
  bookingId: string,
): string {
  const normalized =
    bookingId.trim()

  if (!normalized) {
    throw new Error(
      'A booking ID is required.',
    )
  }

  return (
    `TEMPSTAFF-REC-${normalized
      .slice(0, 8)
      .toUpperCase()}`
  )
}

export function mapCustomerInvoice(
  invoice: CustomerInvoice,
): CustomerInvoice {
  return invoice
}

export async function getCustomerInvoice(
  bookingId: string,
): Promise<CustomerInvoice> {
  const normalizedBookingId =
    bookingId.trim()

  if (!normalizedBookingId) {
    throw new Error(
      'A booking ID is required.',
    )
  }

  const data =
    await apiRequest<unknown>(
      `/invoices/bookings/${encodeURIComponent(
        normalizedBookingId,
      )}`,
    )

  return normalizeInvoice(data)
}
