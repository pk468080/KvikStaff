import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type RequestStatus = 'pending' | 'processing' | 'approved' | 'rejected' | 'cancelled'

type DeletionRequest = {
  id: string
  user_id: string
  reason: string | null
  status: RequestStatus
  requested_at: string
  reviewed_at: string | null
  full_name: string | null
  email: string | null
  phone: string | null
}

function formatDate(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'

  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function statusColor(status: RequestStatus) {
  if (status === 'pending') return { color: '#92400e', background: '#fef3c7' }
  if (status === 'processing') return { color: '#1d4ed8', background: '#dbeafe' }
  if (status === 'approved') return { color: '#166534', background: '#dcfce7' }
  return { color: '#374151', background: '#f3f4f6' }
}

export default function AccountDeletionRequests() {
  const [requests, setRequests] = useState<DeletionRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const loadRequests = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const { data, error: fetchError } = await supabase.rpc(
        'admin_list_account_deletion_requests',
      )

      if (fetchError) throw fetchError
      setRequests((data as DeletionRequest[] | null) ?? [])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load deletion requests.')
      setRequests([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadRequests()
  }, [loadRequests])

  async function reviewRequest(
    request: DeletionRequest,
    status: 'approved' | 'rejected',
  ) {
    if (savingId) return

    const isApproval = status === 'approved'
    const displayName = request.full_name || request.email || request.user_id

    const confirmed = window.confirm(
      isApproval
        ? `Permanently remove the login identity and redact identifying data for ${displayName}? Historic booking, invoice, payment, refund and dispute records may be retained in de-identified form. This action cannot be undone.`
        : `Reject the deletion request for ${displayName}? The account will remain available according to its existing account status.`,
    )

    if (!confirmed) return

    setSavingId(request.id)
    setError('')
    setSuccess('')

    try {
      const { data, error: invokeError } = await supabase.functions.invoke('admin-action', {
        body: {
          action: 'admin_review_account_deletion',
          params: { p_request_id: request.id, p_status: status },
        },
      })

      if (invokeError) {
        let message = invokeError.message
        const response = (invokeError as { context?: Response }).context

        if (response && typeof response.clone === 'function') {
          try {
            const payload = await response.clone().json() as { error?: string }
            if (payload.error) message = payload.error
          } catch {
            // Retain the SDK message when the response has no JSON error body.
          }
        }

        throw new Error(message)
      }

      if (data?.success === false) {
        throw new Error(
          typeof data.error === 'string'
            ? data.error
            : 'The request could not be completed.',
        )
      }

      setSuccess(
        isApproval
          ? 'Account deletion processed, or queued for safe retry if Auth verification is temporarily unavailable.'
          : 'Deletion request rejected.',
      )

      await loadRequests()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to review this request.')
      await loadRequests()
    } finally {
      setSavingId(null)
    }
  }

  const pendingCount = requests.filter((request) => request.status === 'pending').length
  const processingCount = requests.filter((request) => request.status === 'processing').length

  return (
    <div className="page-content">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 16,
        }}
      >
        <div>
          <h1 className="page-heading" style={{ marginBottom: 4 }}>
            Account Deletion Requests
          </h1>
          <p style={{ color: '#6b7280', margin: 0, fontSize: 13 }}>
            Approval permanently removes the customer login. Eligible historical service
            and financial records are retained in de-identified form.
          </p>
        </div>

        <button
          className="dashboard-refresh"
          onClick={() => void loadRequests()}
          disabled={loading}
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div className="panel" style={{ padding: 16 }}>
          <div style={{ color: '#6b7280', fontSize: 12 }}>Awaiting review</div>
          <div style={{ fontSize: 26, fontWeight: 800, marginTop: 4 }}>
            {pendingCount}
          </div>
        </div>

        <div className="panel" style={{ padding: 16 }}>
          <div style={{ color: '#1d4ed8', fontSize: 12 }}>Processing / retry</div>
          <div style={{ fontSize: 26, fontWeight: 800, marginTop: 4 }}>
            {processingCount}
          </div>
        </div>
      </div>

      {error && (
        <div className="error-banner" style={{ marginBottom: 14 }}>
          {error}
        </div>
      )}

      {success && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 8,
            border: '1px solid #86efac',
            background: '#f0fdf4',
            color: '#166534',
            marginBottom: 14,
            fontSize: 13,
          }}
        >
          {success}
        </div>
      )}

      <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div className="bookings-empty">
            <strong>Loading requests…</strong>
            <span>Please wait.</span>
          </div>
        ) : requests.length === 0 ? (
          <div className="bookings-empty">
            <strong>No deletion requests</strong>
            <span>There are no requests to display.</span>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 880 }}>
              <thead>
                <tr
                  style={{
                    textAlign: 'left',
                    background: '#f9fafb',
                    color: '#6b7280',
                    fontSize: 12,
                  }}
                >
                  {['Customer / ID', 'Reason', 'Requested', 'Status', 'Action'].map(
                    (heading) => (
                      <th
                        key={heading}
                        style={{
                          padding: '12px 14px',
                          borderBottom: '1px solid #e5e7eb',
                        }}
                      >
                        {heading}
                      </th>
                    ),
                  )}
                </tr>
              </thead>

              <tbody>
                {requests.map((request) => {
                  const statusStyle = statusColor(request.status)
                  const isProcessing = request.status === 'processing'
                  const isPending = request.status === 'pending'
                  const isSaving = savingId === request.id

                  return (
                    <tr
                      key={request.id}
                      style={{ borderBottom: '1px solid #f0f2f5', verticalAlign: 'top' }}
                    >
                      <td style={{ padding: 14, maxWidth: 260 }}>
                        <div style={{ fontWeight: 700, color: '#111827' }}>
                          {request.full_name || 'Customer'}
                        </div>
                        <div
                          style={{
                            color: '#6b7280',
                            fontSize: 12,
                            marginTop: 3,
                          }}
                        >
                          {request.email || 'No email'}
                          {request.phone ? ` · ${request.phone}` : ''}
                        </div>
                        <div
                          style={{
                            fontFamily: 'monospace',
                            fontSize: 11,
                            color: '#9ca3af',
                            marginTop: 6,
                          }}
                        >
                          {request.user_id}
                        </div>
                        <div
                          style={{
                            fontFamily: 'monospace',
                            fontSize: 10,
                            color: '#9ca3af',
                            marginTop: 2,
                          }}
                        >
                          Request {request.id}
                        </div>
                      </td>

                      <td
                        style={{
                          padding: 14,
                          color: '#374151',
                          fontSize: 13,
                          maxWidth: 300,
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {request.reason || 'No reason provided'}
                      </td>

                      <td
                        style={{
                          padding: 14,
                          color: '#4b5563',
                          fontSize: 12,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {formatDate(request.requested_at)}
                        {request.reviewed_at && (
                          <div style={{ marginTop: 5, color: '#9ca3af' }}>
                            Reviewed {formatDate(request.reviewed_at)}
                          </div>
                        )}
                      </td>

                      <td style={{ padding: 14 }}>
                        <span
                          style={{
                            ...statusStyle,
                            display: 'inline-block',
                            borderRadius: 999,
                            padding: '4px 9px',
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        >
                          {request.status.toUpperCase()}
                        </span>
                      </td>

                      <td style={{ padding: 14, minWidth: 170 }}>
                        {isPending && (
                          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                            <button
                              disabled={Boolean(savingId)}
                              onClick={() => void reviewRequest(request, 'approved')}
                              style={{
                                border: 0,
                                borderRadius: 6,
                                padding: '7px 10px',
                                background: '#b91c1c',
                                color: '#fff',
                                cursor: 'pointer',
                                fontWeight: 700,
                              }}
                            >
                              {isSaving ? 'Processing…' : 'Approve & erase'}
                            </button>

                            <button
                              disabled={Boolean(savingId)}
                              onClick={() => void reviewRequest(request, 'rejected')}
                              style={{
                                border: '1px solid #d1d5db',
                                borderRadius: 6,
                                padding: '7px 10px',
                                background: '#fff',
                                color: '#374151',
                                cursor: 'pointer',
                              }}
                            >
                              Reject
                            </button>
                          </div>
                        )}

                        {isProcessing && (
                          <button
                            disabled={Boolean(savingId)}
                            onClick={() => void reviewRequest(request, 'approved')}
                            style={{
                              border: 0,
                              borderRadius: 6,
                              padding: '7px 10px',
                              background: '#1d4ed8',
                              color: '#fff',
                              cursor: 'pointer',
                              fontWeight: 700,
                            }}
                          >
                            {isSaving ? 'Resuming…' : 'Resume deletion'}
                          </button>
                        )}

                        {!isPending && !isProcessing && (
                          <span style={{ color: '#9ca3af', fontSize: 12 }}>
                            No action needed
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}