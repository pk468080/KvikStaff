import { useEffect, useMemo, useState } from 'react'
import { adminAction } from '../lib/adminAction'
import { DataTable, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/DataTable'

import { supabase } from '../lib/supabase'

type PaymentStatus =
  | 'pending'
  | 'paid'
  | 'failed'
  | 'refunded'
  | 'partially_refunded'
  | string

type Payment = {
  id: string
  booking_id: string
  provider: string
  provider_order_id: string | null
  provider_payment_id: string | null
  amount: number | string
  currency: string
  status: PaymentStatus
  paid_at: string | null
  created_at: string
  updated_at: string
}

type Refund = {
  id: string
  payment_id: string
  refund_request_id: string | null
  booking_id: string
  amount: number | string
  currency: string
  reason: string | null
  status: string
  provider_refund_id: string | null
  failure_reason: string | null
  requested_by: string | null
  requested_at: string
  processed_at: string | null
  created_at: string
  updated_at: string
}

type RefundRequest = {
  id: string
  booking_id: string
  payment_id: string
  amount: number | string
  currency: string
  status: string
  reason: string | null
  provider_refund_id: string | null
  requested_at: string
  processed_at: string | null
  created_at: string
  updated_at: string
}

type Invoice = {
  id: string
  booking_id: string
  invoice_number: string
  status: string
  currency: string
  base_amount: number | string
  platform_fee: number | string
  tax_amount: number | string
  total_amount: number | string
  pricing_snapshot: Record<string, unknown> | null
  issued_at: string
  created_at: string
}

type WebhookEvent = {
  id: string
  provider: string
  event_id: string
  event_name: string
  signature_verified: boolean
  status: string
  received_at: string
  processed_at: string | null
  error_message: string | null
}

type RazorpayWebhookEvent = {
  event_id: string
  event_type: string
  order_id: string | null
  payment_id: string | null
  received_at: string
}

type Tab = 'payments' | 'refunds' | 'invoices' | 'webhooks'

type PaymentFilter =
  | 'all'
  | 'pending'
  | 'paid'
  | 'failed'
  | 'refunded'
  | 'partially_refunded'

  const PAGE_SIZE = 10

  function paginate<T>(
  rows: T[],
  pageNumber: number,
): T[] {
  return rows.slice(
    (pageNumber - 1) * PAGE_SIZE,
    pageNumber * PAGE_SIZE,
  )
}

const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
})

function formatMoney(
  amount: number | string | null | undefined,
  currencyCode = 'INR',
) {
  const numeric = Number(amount || 0)

  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currencyCode || 'INR',
      maximumFractionDigits: 2,
    }).format(numeric)
  } catch {
    return currency.format(numeric)
  }
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return '—'
  }

  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function shortId(value: string | null | undefined) {
  if (!value) return '—'
  return `${value.slice(0, 8)}...`
}

function statusLabel(status: string | null | undefined) {
  if (!status) return 'Unknown'

  return status
    .replace(/_/g, ' ')
    .replace(/\b\w/g, character => character.toUpperCase())
}

function statusClass(status: string | null | undefined) {
  if (!status) return 'unknown'

  return status
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
}

function matchesSearch(value: unknown, search: string) {
  if (!search) return true

  return String(value ?? '')
    .toLowerCase()
    .includes(search.toLowerCase())
}

export default function Payments() {
  const [tab, setTab] = useState<Tab>('payments')

  const [payments, setPayments] = useState<Payment[]>([])
  const [refunds, setRefunds] = useState<Refund[]>([])
  const [refundRequests, setRefundRequests] = useState<RefundRequest[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [webhooks, setWebhooks] = useState<WebhookEvent[]>([])
  const [razorpayWebhooks, setRazorpayWebhooks] = useState<
    RazorpayWebhookEvent[]
  >([])

  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [processingRefundId, setProcessingRefundId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [paymentFilter, setPaymentFilter] =
    useState<PaymentFilter>('all')
  const [refundFilter, setRefundFilter] = useState('all')
  const [invoiceFilter, setInvoiceFilter] = useState('all')

  const [page, setPage] = useState(1)

  const [selectedPayment, setSelectedPayment] =
    useState<Payment | null>(null)

  const [refundModalOpen, setRefundModalOpen] = useState(false)
  const [refundTarget, setRefundTarget] = useState<Payment | null>(null)
  const [refundReason, setRefundReason] = useState('')

  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false)
  const [invoiceTarget, setInvoiceTarget] =
    useState<Invoice | null>(null)

  const [paymentDetailOpen, setPaymentDetailOpen] = useState(false)

  async function loadPaymentsData() {
  setLoading(true)
  setError(null)

  const [
    paymentsResult,
    refundsResult,
    refundRequestsResult,
    invoicesResult,
    webhookResult,
    razorpayWebhookResult,
  ] = await Promise.all([
    adminAction<Payment[]>('admin_list_payments'),

    adminAction<Refund[]>('admin_list_payment_refunds'),

    adminAction<RefundRequest[]>('admin_list_refund_requests'),

    adminAction<Invoice[]>('admin_list_invoices'),

    adminAction<WebhookEvent[]>(
      'admin_list_payment_webhook_events',
    ),

    adminAction<RazorpayWebhookEvent[]>(
      'admin_list_razorpay_webhook_events',
    ),
  ])

  const errors = [
    paymentsResult.error,
    refundsResult.error,
    refundRequestsResult.error,
    invoicesResult.error,
    webhookResult.error,
    razorpayWebhookResult.error,
  ].filter(Boolean)

  if (errors.length > 0) {
    setError(
      errors
        .map(item => item?.message)
        .filter(Boolean)
        .join(' | '),
    )
  }

  setPayments(
    (paymentsResult.data || []) as Payment[],
  )

  setRefunds(
    (refundsResult.data || []) as Refund[],
  )

  setRefundRequests(
    (refundRequestsResult.data || []) as RefundRequest[],
  )

  setInvoices(
    (invoicesResult.data || []) as Invoice[],
  )

  setWebhooks(
    (webhookResult.data || []) as WebhookEvent[],
  )

  setRazorpayWebhooks(
    (razorpayWebhookResult.data || []) as RazorpayWebhookEvent[],
  )

  setLoading(false)
}
  useEffect(() => {
    loadPaymentsData()
  }, [])

  useEffect(() => {
    setPage(1)
  }, [search, paymentFilter, refundFilter, invoiceFilter, tab])

  const paidPayments = useMemo(
    () => payments.filter(payment => payment.status === 'paid'),
    [payments],
  )


  const failedPayments = useMemo(
    () => payments.filter(payment => payment.status === 'failed'),
    [payments],
  )

  const pendingPayments = useMemo(
    () => payments.filter(payment => payment.status === 'pending'),
    [payments],
  )

  const grossPaid = useMemo(
  () =>
    payments
      .filter(
        payment =>
          payment.status === 'paid' ||
          payment.status === 'partially_refunded' ||
          payment.status === 'refunded',
      )
      .reduce(
        (total, payment) => total + Number(payment.amount || 0),
        0,
      ),
  [payments],
)

  const successfulRefundTotal = useMemo(
    () =>
      refunds
        .filter(refund => refund.status === 'succeeded')
        .reduce(
          (total, refund) => total + Number(refund.amount || 0),
          0,
        ),
    [refunds],
  )

  const netCollected = grossPaid - successfulRefundTotal

  const filteredPayments = useMemo(() => {
    return payments.filter(payment => {
      const matchesStatus =
        paymentFilter === 'all' ||
        payment.status === paymentFilter

      const matches =
        matchesSearch(payment.id, search) ||
        matchesSearch(payment.booking_id, search) ||
        matchesSearch(payment.provider, search) ||
        matchesSearch(payment.provider_order_id, search) ||
        matchesSearch(payment.provider_payment_id, search)

      return matchesStatus && matches
    })
  }, [payments, paymentFilter, search])

  const filteredRefunds = useMemo(() => {
    return refunds.filter(refund => {
      const matchesStatus =
        refundFilter === 'all' ||
        refund.status === refundFilter

      const matches =
        matchesSearch(refund.id, search) ||
        matchesSearch(refund.booking_id, search) ||
        matchesSearch(refund.payment_id, search) ||
        matchesSearch(refund.provider_refund_id, search) ||
        matchesSearch(refund.reason, search)

      return matchesStatus && matches
    })
  }, [refunds, refundFilter, search])

  const filteredInvoices = useMemo(() => {
    return invoices.filter(invoice => {
      const matchesStatus =
        invoiceFilter === 'all' ||
        invoice.status === invoiceFilter

      const matches =
        matchesSearch(invoice.id, search) ||
        matchesSearch(invoice.booking_id, search) ||
        matchesSearch(invoice.invoice_number, search)

      return matchesStatus && matches
    })
  }, [invoices, invoiceFilter, search])

  const filteredWebhooks = useMemo(() => {
    return webhooks.filter(webhook => {
      return (
        matchesSearch(webhook.event_id, search) ||
        matchesSearch(webhook.event_name, search) ||
        matchesSearch(webhook.provider, search) ||
        matchesSearch(webhook.status, search)
      )
    })
  }, [webhooks, search])

  const activeRowCount =
  tab === 'payments'
    ? filteredPayments.length
    : tab === 'refunds'
      ? filteredRefunds.length
      : tab === 'invoices'
        ? filteredInvoices.length
        : filteredWebhooks.length

const totalPages = Math.max(
  1,
  Math.ceil(activeRowCount / PAGE_SIZE),
)

const safePage = Math.min(page, totalPages)

  async function requestRefund(payment: Payment) {
    if (payment.status !== 'paid') {
      setError(
        'Only a paid payment can be submitted for a refund.',
      )
      return
    }

    if (!window.confirm(
      `Create a refund request for ${formatMoney(
        payment.amount,
        payment.currency,
      )} for payment ${shortId(payment.id)}?`,
    )) {
      return
    }

    setActionLoading(true)
    setError(null)
    setSuccess(null)

    const { data, error } = await adminAction<{
      success?: boolean
      refund_id?: string
      status?: string
      idempotent?: boolean
    }>('request_booking_refund', {
      p_booking_id: payment.booking_id,
      p_reason: refundReason.trim() || null,
    })

    setActionLoading(false)

    if (error) {
      setError(error.message)
      return
    }

    setRefundModalOpen(false)
    setRefundTarget(null)
    setRefundReason('')

    setSuccess(
      data?.idempotent
        ? 'An existing refund request was returned.'
        : 'Refund request created successfully.',
    )

    await loadPaymentsData()
  }
  async function processRefund(refund: Refund) {
  if (!refund.id) {
    setError('Refund ID is missing.')
    return
  }

  if (
    refund.status !== 'pending' &&
    refund.status !== 'processing'
  ) {
    setError(
      `Refund cannot be processed from status "${refund.status}".`,
    )
    return
  }

  const isReconciliation = refund.status === 'processing'

  const confirmed = window.confirm(
    isReconciliation
      ? `This refund is already marked as processing. Check Razorpay for the existing refund and reconcile it? No new refund will be created if Razorpay already has one.`
      : `Process refund of ${formatMoney(
          refund.amount,
          refund.currency,
        )} for payment ${shortId(
          refund.payment_id,
        )} through Razorpay?`,
  )

  if (!confirmed) {
    return
  }

  setProcessingRefundId(refund.id)
  setError(null)
  setSuccess(null)

  try {
    const { data, error } =
      await supabase.functions.invoke(
        'process-razorpay-refund',
        {
          body: {
            refundId: refund.id,
          },
        },
      )

    if (error) {
      let detailedMessage = error.message

      try {
        const context = (error as {
          context?: Response
        }).context

        if (context) {
          const body = await context.json()

          if (
            body &&
            typeof body.error === 'string'
          ) {
            detailedMessage = body.error
          }
        }
      } catch {
        // Keep the original Supabase error message.
      }

      setError(detailedMessage)
      return
    }

    if (!data?.success) {
      setError(
        data?.error ||
          'Unable to process the refund.',
      )
      return
    }

    if (data?.reconciled) {
      setSuccess(
        'The existing Razorpay refund was found and reconciled successfully.',
      )
    } else if (data?.alreadyProcessed) {
      setSuccess(
        'This refund had already been processed.',
      )
    } else {
      setSuccess(
        'Refund processed successfully.',
      )
    }

    await loadPaymentsData()
  } catch (caughtError) {
    setError(
      caughtError instanceof Error
        ? caughtError.message
        : 'Unexpected refund processing error.',
    )
  } finally {
    setProcessingRefundId(null)
  }
}

  async function issueInvoice(bookingId: string) {
    if (!bookingId) return

    setActionLoading(true)
    setError(null)
    setSuccess(null)

    const { data, error } = await adminAction<{
      success?: boolean
      invoice_id?: string
      invoice_number?: string
      total_amount?: number
      status?: string
    }>('issue_booking_invoice', {
      p_booking_id: bookingId,
    })

    setActionLoading(false)

    if (error) {
      setError(error.message)
      return
    }

    setSuccess(
      data?.invoice_number
        ? `Invoice ${data.invoice_number} is available.`
        : 'Invoice processed successfully.',
    )

    await loadPaymentsData()
  }

  function openRefundModal(payment: Payment) {
    setRefundTarget(payment)
    setRefundReason('')
    setRefundModalOpen(true)
    setError(null)
    setSuccess(null)
  }

  function openPaymentDetails(payment: Payment) {
    setSelectedPayment(payment)
    setPaymentDetailOpen(true)
  }

  function openInvoice(invoice: Invoice) {
    setInvoiceTarget(invoice)
    setInvoiceModalOpen(true)
  }

  function exportPaymentsCsv() {
    const rows = filteredPayments

    if (rows.length === 0) {
      setError('There are no payment records to export.')
      return
    }

    const header = [
      'Payment ID',
      'Booking ID',
      'Provider',
      'Provider Order ID',
      'Provider Payment ID',
      'Amount',
      'Currency',
      'Status',
      'Paid At',
      'Created At',
    ]

    const escapeCsv = (value: unknown) => {
      const text = String(value ?? '')
      return `"${text.replace(/"/g, '""')}"`
    }

    const csv = [
      header,
      ...rows.map(payment => [
        payment.id,
        payment.booking_id,
        payment.provider,
        payment.provider_order_id,
        payment.provider_payment_id,
        payment.amount,
        payment.currency,
        payment.status,
        payment.paid_at,
        payment.created_at,
      ]),
    ]
      .map(row => row.map(escapeCsv).join(','))
      .join('\n')

    const blob = new Blob([csv], {
      type: 'text/csv;charset=utf-8;',
    })

    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')

    anchor.href = url
    anchor.download = `tempstaf-payments-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`

    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()

    URL.revokeObjectURL(url)
  }

  function renderPaymentStatus(status: string) {
    return (
      <span
        className={`booking-status booking-status-${statusClass(
          status,
        )}`}
      >
        {statusLabel(status)}
      </span>
    )
  }

  function renderPagination(total: number) {
    if (total <= PAGE_SIZE) return null

    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          padding: '16px 0 0',
          flexWrap: 'wrap',
        }}
      >
        <span style={{ color: '#64748b', fontSize: 13 }}>
          Showing {(safePage - 1) * PAGE_SIZE + 1}-
          {Math.min(safePage * PAGE_SIZE, total)} of {total}
        </span>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="dashboard-refresh"
            disabled={safePage <= 1}
            onClick={() => setPage(current => Math.max(1, current - 1))}
          >
            Previous
          </button>

          <button
            className="dashboard-refresh"
            disabled={safePage >= totalPages}
            onClick={() =>
              setPage(current =>
                Math.min(totalPages, current + 1),
              )
            }
          >
            Next
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <h1>Payment Operations</h1>
          <p>
            Monitor payments, refunds, invoices, and payment events.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            className="dashboard-refresh"
            onClick={exportPaymentsCsv}
            disabled={loading || payments.length === 0}
          >
            Export CSV
          </button>

          <button
            className="dashboard-refresh"
            onClick={loadPaymentsData}
            disabled={loading}
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          {error}
        </div>
      )}

      {success && (
        <div
          style={{
            marginBottom: 16,
            padding: '12px 14px',
            borderRadius: 8,
            border: '1px solid #bbf7d0',
            background: '#f0fdf4',
            color: '#166534',
          }}
        >
          {success}
        </div>
      )}

      <div className="metric-grid">
        <div className="panel metric-card">
          <span className="metric-label">Gross paid</span>
          <strong>{currency.format(grossPaid)}</strong>
          <small>{paidPayments.length} successful payments</small>
        </div>

        <div className="panel metric-card">
          <span className="metric-label">Refunded</span>
          <strong>
            {currency.format(successfulRefundTotal)}
          </strong>
          <small>{refunds.filter(r => r.status === 'succeeded').length} successful refunds</small>
        </div>

        <div className="panel metric-card">
          <span className="metric-label">Net collected</span>
          <strong>{currency.format(netCollected)}</strong>
          <small>Paid less successful refunds</small>
        </div>

        <div className="panel metric-card">
          <span className="metric-label">Failed payments</span>
          <strong>{failedPayments.length}</strong>
          <small>{pendingPayments.length} still pending</small>
        </div>
      </div>

      <div className="panel">
        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            marginBottom: 16,
          }}
        >
          {(
            [
              ['payments', 'Payments'],
              ['refunds', 'Refunds'],
              ['invoices', 'Invoices'],
              ['webhooks', 'Webhook Events'],
            ] as [Tab, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              style={{
                padding: '9px 14px',
                borderRadius: 8,
                border:
                  tab === value
                    ? '1px solid #0f172a'
                    : '1px solid #e2e8f0',
                background:
                  tab === value ? '#0f172a' : '#fff',
                color:
                  tab === value ? '#fff' : '#334155',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div
          style={{
            display: 'flex',
            gap: 10,
            flexWrap: 'wrap',
            marginBottom: 16,
          }}
        >
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder={
              tab === 'payments'
                ? 'Search payment, booking, order or Razorpay ID...'
                : tab === 'refunds'
                  ? 'Search refund, booking, payment or provider ID...'
                  : tab === 'invoices'
                    ? 'Search invoice, booking or invoice ID...'
                    : 'Search event ID, event name or provider...'
            }
            style={{
              flex: '1 1 280px',
              minWidth: 220,
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid #cbd5e1',
              fontSize: 14,
            }}
          />

          {tab === 'payments' && (
            <select
              value={paymentFilter}
              onChange={event =>
                setPaymentFilter(
                  event.target.value as PaymentFilter,
                )
              }
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid #cbd5e1',
                background: '#fff',
              }}
            >
              <option value="all">All payment statuses</option>
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
              <option value="failed">Failed</option>
              <option value="refunded">Refunded</option>
              <option value="partially_refunded">
                Partially refunded
              </option>
            </select>
          )}

          {tab === 'refunds' && (
            <select
              value={refundFilter}
              onChange={event =>
                setRefundFilter(event.target.value)
              }
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid #cbd5e1',
                background: '#fff',
              }}
            >
              <option value="all">All refund statuses</option>
              <option value="processing">Processing</option>
              <option value="succeeded">Succeeded</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          )}

          {tab === 'invoices' && (
            <select
              value={invoiceFilter}
              onChange={event =>
                setInvoiceFilter(event.target.value)
              }
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid #cbd5e1',
                background: '#fff',
              }}
            >
              <option value="all">All invoice statuses</option>
              <option value="issued">Issued</option>
              <option value="paid">Paid</option>
              <option value="cancelled">Cancelled</option>
            </select>
          )}
        </div>

        {loading ? (
          <div className="bookings-empty">
            <strong>Loading payment operations...</strong>
            <span>Please wait.</span>
          </div>
        ) : tab === 'payments' ? (
          filteredPayments.length === 0 ? (
            <div className="bookings-empty">
              <strong>No payments found</strong>
              <span>
                No payment records match the current filters.
              </span>
            </div>
          ) : (
            <>
              <div className="bookings-table-wrap">
                <DataTable>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Payment</TableHead>
                      <TableHead>Booking</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Paid</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {paginate(filteredPayments, safePage).map(payment => (
                      <TableRow>
                        <TableCell>
                          <strong>{shortId(payment.id)}</strong>
                          <div style={{ fontSize: 12, color: '#64748b' }}>
                            {formatDate(payment.created_at)}
                          </div>
                        </TableCell>

                        <TableCell>
                          <strong>{shortId(payment.booking_id)}</strong>
                        </TableCell>

                        <TableCell>
                          <div>{payment.provider}</div>
                          <div
                            style={{
                              fontSize: 12,
                              color: '#64748b',
                            }}
                          >
                            Order: {shortId(payment.provider_order_id)}
                          </div>
                        </TableCell>

                        <TableCell>
                          {formatMoney(
                            payment.amount,
                            payment.currency,
                          )}
                        </TableCell>

                        <TableCell>
                          {renderPaymentStatus(payment.status)}
                        </TableCell>

                        <TableCell>{formatDate(payment.paid_at)}</TableCell>

                        <TableCell>
                          <div
                            style={{
                              display: 'flex',
                              gap: 6,
                              flexWrap: 'wrap',
                            }}
                          >
                            <button
                              className="dashboard-refresh"
                              onClick={() =>
                                openPaymentDetails(payment)
                              }
                            >
                              Details
                            </button>

                            {payment.status === 'paid' && (
                              <button
                                className="dashboard-refresh"
                                onClick={() =>
                                  openRefundModal(payment)
                                }
                                disabled={actionLoading}
                              >
                                Refund
                              </button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </DataTable>
              </div>

              {renderPagination(filteredPayments.length)}
            </>
          )
        ) : tab === 'refunds' ? (
          filteredRefunds.length === 0 ? (
            <div className="bookings-empty">
              <strong>No refunds found</strong>
              <span>
                Refund records will appear here when created.
              </span>
            </div>
          ) : (
            <>
              <div className="bookings-table-wrap">
                <DataTable>
                  <TableHeader>
                    <TableRow>
  <TableHead>Refund</TableHead>
  <TableHead>Payment</TableHead>
  <TableHead>Booking</TableHead>
  <TableHead>Amount</TableHead>
  <TableHead>Status</TableHead>
  <TableHead>Provider Refund</TableHead>
  <TableHead>Requested</TableHead>
  <TableHead>Actions</TableHead>
</TableRow>
                  </TableHeader>

                  <TableBody>
                    {paginate(filteredRefunds, safePage).map(refund => (
                      <TableRow>
                        
                          <TableCell>
  <strong>{shortId(refund.id)}</strong>

  <div
    style={{
      fontSize: 12,
      color: '#64748b',
    }}
  >
    Request: {shortId(refund.refund_request_id)}
  </div>

  <div
    style={{
      fontSize: 12,
      color: '#64748b',
    }}
  >
    {refund.reason || 'No reason'}
  </div>
</TableCell>

                        <TableCell>{shortId(refund.payment_id)}</TableCell>
                        <TableCell>{shortId(refund.booking_id)}</TableCell>

                        <TableCell>
                          {formatMoney(
                            refund.amount,
                            refund.currency,
                          )}
                        </TableCell>

                        <TableCell>
                          {renderPaymentStatus(refund.status)}
                        </TableCell>

                        <TableCell>
                          {shortId(refund.provider_refund_id)}
                        </TableCell>

                        <TableCell>
                          {formatDate(refund.requested_at)}
                        </TableCell>
                        <TableCell>
  {refund.status === 'pending' && (
  <button
    className="dashboard-refresh"
    onClick={() => processRefund(refund)}
    disabled={processingRefundId !== null}
  >
    {processingRefundId === refund.id
      ? 'Processing...'
      : 'Process Refund'}
  </button>
)}

  {refund.status === 'processing' && (
  <div
    style={{
      display: 'flex',
      gap: 8,
      alignItems: 'center',
      flexWrap: 'wrap',
    }}
  >
    <span
      style={{
        fontSize: 13,
        color: '#92400e',
        fontWeight: 600,
      }}
    >
      Processing
    </span>

    <button
      className="dashboard-refresh"
      onClick={() => processRefund(refund)}
      disabled={processingRefundId !== null}
    >
      {processingRefundId === refund.id
        ? 'Checking...'
        : 'Reconcile'}
    </button>
  </div>
)}

  {refund.status === 'succeeded' && (
    <span
      style={{
        fontSize: 13,
        color: '#166534',
        fontWeight: 600,
      }}
    >
      Completed
    </span>
  )}

  {refund.status === 'failed' && (
    <span
      style={{
        fontSize: 13,
        color: '#991b1b',
        fontWeight: 600,
      }}
      title={refund.failure_reason || undefined}
    >
      Failed
    </span>
  )}
</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </DataTable>
              </div>

              {renderPagination(filteredRefunds.length)}
            </>
          )
        ) : tab === 'invoices' ? (
          filteredInvoices.length === 0 ? (
            <div className="bookings-empty">
              <strong>No invoices found</strong>
              <span>
                Issued invoices will appear here.
              </span>
            </div>
          ) : (
            <>
              <div className="bookings-table-wrap">
                <DataTable>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Booking</TableHead>
                      <TableHead>Base</TableHead>
                      <TableHead>Platform Fee</TableHead>
                      <TableHead>Tax</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Issued</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {paginate(filteredInvoices, safePage).map(invoice => (
                      <TableRow onClick={() => openInvoice(invoice)}
                        style={{ cursor: 'pointer' }}
                      >
                        <TableCell>
                          <strong>{invoice.invoice_number}</strong>
                          <div
                            style={{
                              fontSize: 12,
                              color: '#64748b',
                            }}
                          >
                            {shortId(invoice.id)}
                          </div>
                        </TableCell>

                        <TableCell>{shortId(invoice.booking_id)}</TableCell>

                        <TableCell>
                          {formatMoney(
                            invoice.base_amount,
                            invoice.currency,
                          )}
                        </TableCell>

                        <TableCell>
                          {formatMoney(
                            invoice.platform_fee,
                            invoice.currency,
                          )}
                        </TableCell>

                        <TableCell>
                          {formatMoney(
                            invoice.tax_amount,
                            invoice.currency,
                          )}
                        </TableCell>

                        <TableCell>
                          <strong>
                            {formatMoney(
                              invoice.total_amount,
                              invoice.currency,
                            )}
                          </strong>
                        </TableCell>

                        <TableCell>
                          {renderPaymentStatus(invoice.status)}
                        </TableCell>

                        <TableCell>{formatDate(invoice.issued_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </DataTable>
              </div>

              {renderPagination(filteredInvoices.length)}
            </>
          )
        ) : filteredWebhooks.length === 0 ? (
          <div className="bookings-empty">
            <strong>No webhook events found</strong>
            <span>
              Payment webhook events will appear here.
            </span>
          </div>
        ) : (
          <>
            <div className="bookings-table-wrap">
              <DataTable>
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Event ID</TableHead>
                    <TableHead>Signature</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Received</TableHead>
                    <TableHead>Processed</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {paginate(filteredWebhooks, safePage).map(webhook => (
                    <TableRow>
                      <TableCell>{webhook.provider}</TableCell>

                      <TableCell>
                        <strong>{webhook.event_name}</strong>
                      </TableCell>

                      <TableCell>{shortId(webhook.event_id)}</TableCell>

                      <TableCell>
                        <span
                          style={{
                            color: webhook.signature_verified
                              ? '#166534'
                              : '#991b1b',
                            fontWeight: 600,
                          }}
                        >
                          {webhook.signature_verified
                            ? 'Verified'
                            : 'Not verified'}
                        </span>
                      </TableCell>

                      <TableCell>
                        {renderPaymentStatus(webhook.status)}
                      </TableCell>

                      <TableCell>
                        {formatDate(webhook.received_at)}
                      </TableCell>

                      <TableCell>
                        {formatDate(webhook.processed_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </DataTable>
            </div>

            {renderPagination(filteredWebhooks.length)}

            {razorpayWebhooks.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <h3>Razorpay webhook history</h3>

                <div className="bookings-table-wrap">
                  <DataTable>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Event</TableHead>
                        <TableHead>Order ID</TableHead>
                        <TableHead>Payment ID</TableHead>
                        <TableHead>Received</TableHead>
                      </TableRow>
                    </TableHeader>

                    <TableBody>
                      {razorpayWebhooks
                        .slice(0, 20)
                        .map(event => (
                          <TableRow>
                            <TableCell>{event.event_type}</TableCell>
                            <TableCell>
                              {shortId(event.order_id)}
                            </TableCell>
                            <TableCell>
                              {shortId(event.payment_id)}
                            </TableCell>
                            <TableCell>
                              {formatDate(event.received_at)}
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </DataTable>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {refundRequests.length > 0 && (
        <div className="panel" style={{ marginTop: 20 }}>
          <div className="panel-header">
            <div>
              <h2>Refund requests</h2>
              <p>
                Requests generated through the booking refund workflow.
              </p>
            </div>
          </div>

          <div className="bookings-table-wrap">
            <DataTable>
              <TableHeader>
                <TableRow>
                  <TableHead>Request</TableHead>
                  <TableHead>Booking</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Requested</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {refundRequests.slice(0, 20).map(request => (
                  <TableRow>
                    <TableCell>
                      <strong>{shortId(request.id)}</strong>
                    </TableCell>

                    <TableCell>{shortId(request.booking_id)}</TableCell>

                    <TableCell>
                      {formatMoney(
                        request.amount,
                        request.currency,
                      )}
                    </TableCell>

                    <TableCell>
                      {renderPaymentStatus(request.status)}
                    </TableCell>

                    <TableCell>
                      {request.reason || '—'}
                    </TableCell>

                    <TableCell>
                      {formatDate(request.requested_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </DataTable>
          </div>
        </div>
      )}

      {paymentDetailOpen && selectedPayment && (
        <div style={modalBackdropStyle}>
          <div style={modalStyle}>
            <div style={modalHeaderStyle}>
              <div>
                <h2>Payment details</h2>
                <p>{selectedPayment.id}</p>
              </div>

              <button
                className="dashboard-refresh"
                onClick={() => setPaymentDetailOpen(false)}
              >
                Close
              </button>
            </div>

            <div style={detailGridStyle}>
              <Detail label="Payment ID" value={selectedPayment.id} />
              <Detail
                label="Booking ID"
                value={selectedPayment.booking_id}
              />
              <Detail
                label="Provider"
                value={selectedPayment.provider}
              />
              <Detail
                label="Amount"
                value={formatMoney(
                  selectedPayment.amount,
                  selectedPayment.currency,
                )}
              />
              <Detail
                label="Status"
                value={statusLabel(selectedPayment.status)}
              />
              <Detail
                label="Order ID"
                value={selectedPayment.provider_order_id || '—'}
              />
              <Detail
                label="Provider Payment ID"
                value={
                  selectedPayment.provider_payment_id || '—'
                }
              />
              <Detail
                label="Paid At"
                value={formatDate(selectedPayment.paid_at)}
              />
              <Detail
                label="Created At"
                value={formatDate(selectedPayment.created_at)}
              />
              <Detail
                label="Updated At"
                value={formatDate(selectedPayment.updated_at)}
              />
            </div>

            {selectedPayment.status === 'paid' && (
              <div
                style={{
                  marginTop: 20,
                  paddingTop: 20,
                  borderTop: '1px solid #e2e8f0',
                }}
              >
                <button
                  className="dashboard-refresh"
                  onClick={() => {
                    setPaymentDetailOpen(false)
                    openRefundModal(selectedPayment)
                  }}
                >
                  Create refund request
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {refundModalOpen && refundTarget && (
        <div style={modalBackdropStyle}>
          <div style={modalStyle}>
            <div style={modalHeaderStyle}>
              <div>
                <h2>Create refund request</h2>
                <p>
                  This creates the refund request through the
                  existing protected backend workflow.
                </p>
              </div>

              <button
                className="dashboard-refresh"
                onClick={() => setRefundModalOpen(false)}
                disabled={actionLoading}
              >
                Close
              </button>
            </div>

            <div
              style={{
                padding: 14,
                background: '#f8fafc',
                borderRadius: 8,
                marginBottom: 16,
              }}
            >
              <div>
                <strong>Payment:</strong>{' '}
                {shortId(refundTarget.id)}
              </div>

              <div>
                <strong>Booking:</strong>{' '}
                {shortId(refundTarget.booking_id)}
              </div>

              <div>
                <strong>Amount:</strong>{' '}
                {formatMoney(
                  refundTarget.amount,
                  refundTarget.currency,
                )}
              </div>
            </div>

            <label
              style={{
                display: 'block',
                fontWeight: 600,
                marginBottom: 8,
              }}
            >
              Refund reason
            </label>

            <textarea
              value={refundReason}
              onChange={event =>
                setRefundReason(event.target.value)
              }
              placeholder="Enter the reason for this refund request..."
              rows={4}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: 12,
                borderRadius: 8,
                border: '1px solid #cbd5e1',
                resize: 'vertical',
              }}
            />

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 8,
                marginTop: 16,
              }}
            >
              <button
                className="dashboard-refresh"
                onClick={() => setRefundModalOpen(false)}
                disabled={actionLoading}
              >
                Cancel
              </button>

              <button
                className="dashboard-refresh"
                onClick={() => requestRefund(refundTarget)}
                disabled={actionLoading}
              >
                {actionLoading
                  ? 'Processing...'
                  : 'Create refund request'}
              </button>
            </div>
          </div>
        </div>
      )}

      {invoiceModalOpen && invoiceTarget && (
        <div style={modalBackdropStyle}>
          <div style={modalStyle}>
            <div style={modalHeaderStyle}>
              <div>
                <h2>Invoice details</h2>
                <p>{invoiceTarget.invoice_number}</p>
              </div>

              <button
                className="dashboard-refresh"
                onClick={() => setInvoiceModalOpen(false)}
              >
                Close
              </button>
            </div>

            <div style={detailGridStyle}>
              <Detail
                label="Invoice Number"
                value={invoiceTarget.invoice_number}
              />
              <Detail
                label="Invoice ID"
                value={invoiceTarget.id}
              />
              <Detail
                label="Booking ID"
                value={invoiceTarget.booking_id}
              />
              <Detail
                label="Status"
                value={statusLabel(invoiceTarget.status)}
              />
              <Detail
                label="Base Amount"
                value={formatMoney(
                  invoiceTarget.base_amount,
                  invoiceTarget.currency,
                )}
              />
              <Detail
                label="Platform Fee"
                value={formatMoney(
                  invoiceTarget.platform_fee,
                  invoiceTarget.currency,
                )}
              />
              <Detail
                label="Tax"
                value={formatMoney(
                  invoiceTarget.tax_amount,
                  invoiceTarget.currency,
                )}
              />
              <Detail
                label="Total"
                value={formatMoney(
                  invoiceTarget.total_amount,
                  invoiceTarget.currency,
                )}
              />
              <Detail
                label="Issued At"
                value={formatDate(invoiceTarget.issued_at)}
              />
              <Detail
                label="Created At"
                value={formatDate(invoiceTarget.created_at)}
              />
            </div>

            {invoiceTarget.pricing_snapshot && (
              <details style={{ marginTop: 20 }}>
                <summary
                  style={{
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  Pricing snapshot
                </summary>

                <pre
                  style={{
                    marginTop: 12,
                    padding: 12,
                    background: '#0f172a',
                    color: '#e2e8f0',
                    borderRadius: 8,
                    overflow: 'auto',
                    fontSize: 12,
                  }}
                >
                  {JSON.stringify(
                    invoiceTarget.pricing_snapshot,
                    null,
                    2,
                  )}
                </pre>
              </details>
            )}

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                marginTop: 20,
              }}
            >
              <button
                className="dashboard-refresh"
                onClick={() =>
                  issueInvoice(invoiceTarget.booking_id)
                }
                disabled={actionLoading}
              >
                {actionLoading
                  ? 'Processing...'
                  : 'Refresh / issue invoice'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Detail({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div
      style={{
        padding: 12,
        border: '1px solid #e2e8f0',
        borderRadius: 8,
      }}
    >
      <div
        style={{
          fontSize: 12,
          color: '#64748b',
          marginBottom: 5,
        }}
      >
        {label}
      </div>

      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          overflowWrap: 'anywhere',
        }}
      >
        {value}
      </div>
    </div>
  )
}

const modalBackdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15, 23, 42, 0.55)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 20,
  zIndex: 1000,
}

const modalStyle: React.CSSProperties = {
  width: 'min(760px, 100%)',
  maxHeight: '90vh',
  overflow: 'auto',
  background: '#fff',
  borderRadius: 12,
  padding: 24,
  boxShadow: '0 20px 50px rgba(15, 23, 42, 0.25)',
}

const modalHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 16,
  marginBottom: 20,
}

const detailGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 12,
}