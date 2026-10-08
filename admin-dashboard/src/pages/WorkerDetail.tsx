import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { adminAction } from '../lib/adminAction'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { LoadingState } from '../components/ui/LoadingState'
import { ErrorState } from '../components/ui/ErrorState'


type Worker = {
  id: string
  full_name: string | null
  email: string | null
  worker_status: string
  is_verified: boolean
  rating: number
  total_completed_jobs: number
  service_radius_km: number
  current_location: unknown
}

type Availability = {
  id?: string
  available_from: string
  available_until: string
  is_available: boolean
}

type Location = {
  latitude: number
  longitude: number
  recorded_at: string
}

type Job = {
  id: string
  status: string
  service_id: string
  scheduled_start: string | null
  total_amount: number | null
  created_at: string
}

type Application = {
  id: string
  worker_id: string
  onboarding_type: string
  status: string
  submitted_at: string | null
  reviewed_at: string | null
  review_notes: string | null
  reapply_after: string | null
  created_at: string
}

type DocumentStatus = 'pending' | 'approved' | 'rejected'

type WorkerDocument = {
  id: string
  application_id: string
  worker_id: string
  document_type: string
  file_path: string
  file_name: string | null
  mime_type: string | null
  file_size: number | null
  status: DocumentStatus
  rejection_reason: string | null
  reviewed_at: string | null
  created_at: string
}

const REQUIRED_DOCUMENTS = [
  {
    type: 'aadhaar',
    label: 'Aadhaar',
  },
  {
    type: 'pan',
    label: 'PAN',
  },
  {
    type: 'passport_photo',
    label: 'Passport Photo',
  },
  {
    type: 'address_proof',
    label: 'Address Proof',
  },
  {
    type: 'police_verification',
    label: 'Police Verification',
  },
  {
    type: 'bank_account',
    label: 'Bank Account / Cancelled Cheque',
  },
]

export default function WorkerDetail() {
  const { workerId } = useParams()

  const [worker, setWorker] = useState<Worker | null>(null)
  const [application, setApplication] = useState<Application | null>(null)
  const [documents, setDocuments] = useState<WorkerDocument[]>([])
  const [services, setServices] = useState<string[]>([])
  const [availability, setAvailability] = useState<Availability[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [serviceNames, setServiceNames] = useState<Record<string, string>>({})

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [rejectApplicationOpen, setRejectApplicationOpen] = useState(false)
  const [rejectApplicationReason, setRejectApplicationReason] = useState('')

  const [rejectDocumentId, setRejectDocumentId] = useState<string | null>(null)
  const [rejectDocumentReason, setRejectDocumentReason] = useState('')

  async function loadWorker() {
    if (!workerId) return

    setLoading(true)
    setError('')
    setSuccess('')

    const [
      workerResult,
      profileResult,
      applicationResult,
      documentsResult,
      serviceLinks,
      availabilityResult,
      locationResult,
      jobsResult,
    ] = await Promise.all([
      supabase
        .from('worker_profiles')
        .select(
          'id, worker_status, is_verified, rating, total_completed_jobs, service_radius_km, current_location'
        )
        .eq('id', workerId)
        .maybeSingle(),

      supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', workerId)
        .maybeSingle(),

      supabase
        .from('worker_applications')
        .select(
          'id, worker_id, onboarding_type, status, submitted_at, reviewed_at, review_notes, reapply_after, created_at'
        )
        .eq('worker_id', workerId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),

      supabase
        .from('worker_documents')
        .select(
          'id, application_id, worker_id, document_type, file_path, file_name, mime_type, file_size, status, rejection_reason, reviewed_at, created_at'
        )
        .eq('worker_id', workerId)
        .order('created_at', { ascending: true }),

      supabase
        .from('worker_services')
        .select('service_id')
        .eq('worker_id', workerId),

      supabase
        .from('worker_availability')
        .select('available_from, available_until, is_available')
        .eq('worker_id', workerId)
        .order('available_from'),

      supabase
  .from('worker_locations')
  .select('latitude, longitude, recorded_at')
  .eq('worker_id', workerId)
  .order('recorded_at', { ascending: false })
  .limit(10),

      supabase
        .from('bookings')
        .select(
          'id, status, service_id, scheduled_start, total_amount, created_at'
        )
        .eq('worker_id', workerId)
        .order('created_at', { ascending: false })
        .limit(25),
    ])

    const firstError = [
      workerResult,
      profileResult,
      applicationResult,
      documentsResult,
      serviceLinks,
      availabilityResult,
      locationResult,
      jobsResult,
    ].find(result => result.error)?.error

    if (firstError) {
      setError(firstError.message)
      setLoading(false)
      return
    }

    if (!workerResult.data) {
      setError('Worker not found.')
      setLoading(false)
      return
    }

    const workerData = workerResult.data

    setWorker({
      id: workerData.id,
      full_name: profileResult.data?.full_name ?? null,
      email: profileResult.data?.email ?? null,
      worker_status: workerData.worker_status,
      is_verified: Boolean(workerData.is_verified),
      rating: Number(workerData.rating ?? 0),
      total_completed_jobs: Number(workerData.total_completed_jobs ?? 0),
      service_radius_km: Number(workerData.service_radius_km ?? 0),
      current_location: workerData.current_location,
    })

    setApplication((applicationResult.data ?? null) as Application | null)
    setDocuments((documentsResult.data ?? []) as WorkerDocument[])
    setAvailability((availabilityResult.data ?? []) as Availability[])
    setLocations((locationResult.data ?? []) as Location[])
    setJobs((jobsResult.data ?? []) as Job[])

    const serviceIds = (serviceLinks.data ?? []).map(row => row.service_id)
    setServices(serviceIds)

    if (serviceIds.length) {
      const servicesResult = await supabase
        .from('services')
        .select('id, name')
        .in('id', serviceIds)

      if (!servicesResult.error) {
        setServiceNames(
          Object.fromEntries(
            (servicesResult.data ?? []).map(service => [
              service.id,
              service.name,
            ])
          )
        )
      }
    }

    setLoading(false)
  }

  async function updateWorker(
  values: Record<string, unknown>,
) {
  if (!workerId) return

  try {
    setError('')

    await adminAction(
      'admin_update_worker',
      {
        p_worker_id: workerId,
        p_full_name:
          typeof values.full_name === 'string'
            ? values.full_name
            : undefined,
        p_phone:
          typeof values.phone === 'string'
            ? values.phone
            : undefined,
        p_worker_status:
          typeof values.worker_status === 'string'
            ? values.worker_status
            : undefined,
        p_is_verified:
          typeof values.is_verified === 'boolean'
            ? values.is_verified
            : undefined,
        p_service_radius_km:
          typeof values.service_radius_km === 'number'
            ? values.service_radius_km
            : undefined,
        p_is_featured:
          typeof values.is_featured === 'boolean'
            ? values.is_featured
            : undefined,
      },
    )

    await loadWorker()
  } catch (err) {
    console.error(err)

    setError(
      err instanceof Error
        ? err.message
        : 'Unable to update worker.',
    )
  }
}
  async function reviewDocument(
    documentId: string,
    status: DocumentStatus,
    rejectionReason?: string
  ) {
    setSaving(true)
    setError('')
    setSuccess('')

    const { error: updateError } = await adminAction(
      'admin_review_worker_document',
      {
        p_document_id: documentId,
        p_status: status,
        p_rejection_reason:
          status === 'rejected'
            ? rejectionReason?.trim() || null
            : null,
      }
    )

    if (updateError) {
      setError(updateError.message)
      setSaving(false)
      return
    }

    if (status === 'rejected' && application) {
      const { error: applicationError } = await adminAction(
        'admin_review_worker_application',
        {
          p_application_id: application.id,
          p_status: 'changes_required',
          p_notes:
            rejectionReason?.trim() ||
            'One or more worker documents were rejected.',
        }
      )

      if (applicationError) {
        setError(
          `Document rejected, but application status update failed: ${applicationError.message}`
        )
        setSaving(false)
        return
      }
    }

    setRejectDocumentId(null)
    setRejectDocumentReason('')
    setSuccess(
      status === 'approved'
        ? 'Document approved.'
        : 'Document rejected and changes requested.'
    )

    await loadWorker()
    setSaving(false)
  }

  async function approveApplication() {
    if (!application || !workerId) return

    const missingDocuments = REQUIRED_DOCUMENTS.filter(
      required =>
        !documents.some(
          document =>
            document.document_type === required.type &&
            document.status === 'approved'
        )
    )

    if (missingDocuments.length) {
      setError(
        `Cannot approve worker. Missing approved documents: ${missingDocuments
          .map(document => document.label)
          .join(', ')}`
      )
      return
    }

    setSaving(true)
    setError('')
    setSuccess('')

    const { error: applicationError } = await adminAction(
      'admin_review_worker_application',
      {
        p_application_id: application.id,
        p_status: 'approved',
        p_notes: 'Application approved by admin.',
      }
    )

    if (applicationError) {
      setError(applicationError.message)
      setSaving(false)
      return
    }

    const { error: workerError } = await adminAction(
      'admin_update_worker',
      {
        p_worker_id: workerId,
        p_is_verified: true,
      }
    )

    if (workerError) {
      setError(
        `Application approved, but worker verification update failed: ${workerError.message}`
      )
      setSaving(false)
      return
    }

    setSuccess(
      'Worker onboarding approved. The worker is now verified and eligible for work.'
    )

    await loadWorker()
    setSaving(false)
  }

  async function rejectApplication() {
    if (!application || !workerId) return

    const reason = rejectApplicationReason.trim()

    if (!reason) {
      setError('Please enter a rejection reason.')
      return
    }

    setSaving(true)
    setError('')
    setSuccess('')

    const { error: applicationError } = await adminAction(
      'admin_review_worker_application',
      {
        p_application_id: application.id,
        p_status: 'rejected',
        p_notes: reason,
      }
    )

    if (applicationError) {
      setError(applicationError.message)
      setSaving(false)
      return
    }

    const { error: workerError } = await adminAction(
      'admin_update_worker',
      {
        p_worker_id: workerId,
        p_is_verified: false,
      }
    )

    if (workerError) {
      setError(
        `Application rejected, but worker verification update failed: ${workerError.message}`
      )
      setSaving(false)
      return
    }

    setRejectApplicationOpen(false)
    setRejectApplicationReason('')

    const reapplyDate = new Date()
    reapplyDate.setDate(reapplyDate.getDate() + 30)

    setSuccess(
      `Application rejected. Worker can apply again after ${formatDate(
        reapplyDate.toISOString()
      )}.`
    )

    await loadWorker()
    setSaving(false)
  }

  async function viewDocument(document: WorkerDocument) {
    setError('')

    const { data, error: signedUrlError } = await supabase.storage
      .from('worker-documents')
      .createSignedUrl(document.file_path, 600)

    if (signedUrlError) {
      setError(`Unable to open document: ${signedUrlError.message}`)
      return
    }

    if (!data?.signedUrl) {
      setError('Unable to generate a secure document URL.')
      return
    }

    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  useEffect(() => {
    loadWorker()
  }, [workerId])

  const approvedDocumentCount = useMemo(() => {
    return REQUIRED_DOCUMENTS.filter(required =>
      documents.some(
        document =>
          document.document_type === required.type &&
          document.status === 'approved'
      )
    ).length
  }, [documents])

  const applicationReadyForApproval =
    approvedDocumentCount === REQUIRED_DOCUMENTS.length

  if (loading) {
    return (
      <div style={styles.page}>
        <p>Loading worker...</p>
      </div>
    )
  }

  if (!worker) {
    return (
      <div style={styles.page}>
        <p style={styles.error}>{error || 'Worker not found.'}</p>
        <Link to="/workers">Back to workers</Link>
      </div>
    )
  }

  const location = getLocation(worker.current_location)
  const latestLocation = locations[0]

  return (
    <div style={styles.page}>
      <Link to="/workers" style={styles.back}>
        ← Back to workers
      </Link>

      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>
            {worker.full_name || 'Unnamed worker'}
          </h1>

          <p style={styles.subtitle}>
            {worker.email || 'No email'} · {worker.id}
          </p>
        </div>

        <div style={styles.actions}>
          <button
            style={styles.button}
            disabled={saving}
            onClick={() =>
              updateWorker({ is_verified: !worker.is_verified })
            }
          >
            {worker.is_verified ? 'Revoke verification' : 'Verify worker'}
          </button>

          <button
            style={
              worker.worker_status === 'suspended'
                ? styles.button
                : styles.dangerButton
            }
            disabled={saving}
            onClick={() =>
              updateWorker({
                worker_status:
                  worker.worker_status === 'suspended'
                    ? 'offline'
                    : 'suspended',
              })
            }
          >
            {worker.worker_status === 'suspended'
              ? 'Unsuspend'
              : 'Suspend worker'}
          </button>
        </div>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      {success && <div style={styles.success}>{success}</div>}

      <div style={styles.summaryGrid}>
        <Summary label="Status" value={worker.worker_status} />

        <Summary
          label="Verification"
          value={worker.is_verified ? 'Verified' : 'Pending'}
        />

        <Summary
          label="Rating"
          value={`★ ${worker.rating.toFixed(1)}`}
        />

        <Summary
          label="Completed jobs"
          value={String(worker.total_completed_jobs)}
        />

        <Summary
          label="Service radius"
          value={`${worker.service_radius_km} km`}
        />
      </div>

      {/* ONBOARDING / APPLICATION */}
      <Panel title="Worker Onboarding">
        {!application ? (
          <div style={styles.emptyBox}>
            <strong>No onboarding application found.</strong>
            <p style={styles.muted}>
              This worker does not currently have a worker application.
            </p>
          </div>
        ) : (
          <>
            <div style={styles.applicationGrid}>
              <InfoItem
                label="Onboarding type"
                value={formatOnboardingType(application.onboarding_type)}
              />

              <InfoItem
                label="Application status"
                value={formatStatus(application.status)}
              />

              <InfoItem
                label="Submitted"
                value={
                  application.submitted_at
                    ? formatDate(application.submitted_at)
                    : 'Not submitted'
                }
              />

              <InfoItem
                label="Last reviewed"
                value={
                  application.reviewed_at
                    ? formatDate(application.reviewed_at)
                    : 'Not reviewed'
                }
              />
            </div>

            <div style={styles.documentProgress}>
              <div>
                <strong>
                  Documents approved: {approvedDocumentCount}/
                  {REQUIRED_DOCUMENTS.length}
                </strong>

                <p style={styles.muted}>
                  All six required documents must be approved before the
                  application can be approved.
                </p>
              </div>

              <div style={styles.progressTrack}>
                <div
                  style={{
                    ...styles.progressBar,
                    width: `${
                      (approvedDocumentCount /
                        REQUIRED_DOCUMENTS.length) *
                      100
                    }%`,
                  }}
                />
              </div>
            </div>

            {application.review_notes && (
              <div style={styles.notesBox}>
                <strong>Review notes</strong>
                <p>{application.review_notes}</p>
              </div>
            )}

            {application.reapply_after &&
              application.status === 'rejected' && (
                <div style={styles.warningBox}>
                  <strong>Re-application date</strong>
                  <p>
                    This worker can apply again after{' '}
                    {formatDate(application.reapply_after)}.
                  </p>
                </div>
              )}

            <div style={styles.applicationActions}>
              <button
                style={
                  applicationReadyForApproval
                    ? styles.approveButton
                    : styles.disabledButton
                }
                disabled={
                  saving ||
                  !applicationReadyForApproval ||
                  application.status === 'approved'
                }
                onClick={approveApplication}
              >
                {application.status === 'approved'
                  ? 'Application Approved'
                  : 'Approve Application'}
              </button>

              <button
                style={styles.rejectButton}
                disabled={saving || application.status === 'approved'}
                onClick={() => setRejectApplicationOpen(true)}
              >
                Reject Application
              </button>
            </div>

            {rejectApplicationOpen && (
              <div style={styles.reviewBox}>
                <h3 style={styles.reviewTitle}>
                  Reject Worker Application
                </h3>

                <p style={styles.muted}>
                  The worker will be able to apply again after 30 days.
                </p>

                <textarea
                  value={rejectApplicationReason}
                  onChange={event =>
                    setRejectApplicationReason(event.target.value)
                  }
                  placeholder="Enter the reason for rejection..."
                  rows={4}
                  style={styles.textarea}
                />

                <div style={styles.reviewActions}>
                  <button
                    style={styles.button}
                    disabled={saving}
                    onClick={() => {
                      setRejectApplicationOpen(false)
                      setRejectApplicationReason('')
                    }}
                  >
                    Cancel
                  </button>

                  <button
                    style={styles.rejectButton}
                    disabled={saving}
                    onClick={rejectApplication}
                  >
                    Confirm Rejection
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </Panel>

      {/* DOCUMENTS */}
      <Panel title="Worker Documents">
        {!application ? (
          <Empty text="No worker application exists, so there are no onboarding documents to review." />
        ) : (
          <div style={styles.documentsGrid}>
            {REQUIRED_DOCUMENTS.map(required => {
              const document = documents.find(
                item => item.document_type === required.type
              )

              return (
                <DocumentCard
                  key={required.type}
                  required={required}
                  document={document}
                  saving={saving}
                  onView={() =>
                    document ? viewDocument(document) : undefined
                  }
                  onApprove={() =>
                    document
                      ? reviewDocument(document.id, 'approved')
                      : undefined
                  }
                  onReject={() =>
                    document
                      ? setRejectDocumentId(document.id)
                      : undefined
                  }
                />
              )
            })}
          </div>
        )}

        {rejectDocumentId && (
          <div style={styles.reviewBox}>
            <h3 style={styles.reviewTitle}>Reject Document</h3>

            <p style={styles.muted}>
              Enter a clear reason so the worker knows what needs to be
              corrected.
            </p>

            <textarea
              value={rejectDocumentReason}
              onChange={event =>
                setRejectDocumentReason(event.target.value)
              }
              placeholder="Example: Document is unclear or expired..."
              rows={4}
              style={styles.textarea}
            />

            <div style={styles.reviewActions}>
              <button
                style={styles.button}
                disabled={saving}
                onClick={() => {
                  setRejectDocumentId(null)
                  setRejectDocumentReason('')
                }}
              >
                Cancel
              </button>

              <button
                style={styles.rejectButton}
                disabled={saving}
                onClick={() =>
                  reviewDocument(
                    rejectDocumentId,
                    'rejected',
                    rejectDocumentReason
                  )
                }
              >
                Confirm Document Rejection
              </button>
            </div>
          </div>
        )}
      </Panel>

      {/* EXISTING WORKER INFORMATION */}
      <div style={styles.grid}>
        <Panel title="Services">
          {services.length ? (
            <ul style={styles.list}>
              {services.map(id => (
                <li key={id}>{serviceNames[id] || id}</li>
              ))}
            </ul>
          ) : (
            <Empty text="No services assigned." />
          )}
        </Panel>

        <Panel title="Current location">
          {location || latestLocation ? (
            <div>
              <strong>
                {location
                  ? `${location.latitude}, ${location.longitude}`
                  : `${latestLocation.latitude}, ${latestLocation.longitude}`}
              </strong>

              <p style={styles.muted}>
                {location
                  ? 'Profile location'
                  : `Last reported ${formatDate(
                      latestLocation.recorded_at
                    )}`}
              </p>
            </div>
          ) : (
            <Empty text="Location has not been shared." />
          )}
        </Panel>

        <Panel title="Availability">
          {availability.length ? (
            <div>
              {availability.map((slot, index) => (
                <div
                  key={slot.id || index}
                  style={styles.row}
                >
                  <span>
                    {slot.available_from} - {slot.available_until}
                  </span>

                  <span
                    style={{
                      ...styles.badge,
                      ...(slot.is_available
                        ? styles.good
                        : styles.neutral),
                    }}
                  >
                    {slot.is_available
                      ? 'Available'
                      : 'Unavailable'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <Empty text="No availability schedule found." />
          )}
        </Panel>

        <Panel title="Recent location reports">
          {locations.length ? (
            <div>
              {locations.slice(0, 5).map(locationItem => (
                <div
                  key={locationItem.recorded_at}
                  style={styles.row}
                >
                  <span>
                    {locationItem.latitude},{' '}
                    {locationItem.longitude}
                  </span>

                  <span style={styles.muted}>
                    {formatDate(locationItem.recorded_at)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <Empty text="No location history found." />
          )}
        </Panel>
      </div>

      <Panel title="Job history">
        {jobs.length ? (
          <div style={styles.jobTable}>
            <div style={styles.jobHeader}>
              <span>Booking</span>
              <span>Service</span>
              <span>Status</span>
              <span>Date</span>
              <span>Amount</span>
            </div>

            {jobs.map(job => (
              <div
                key={job.id}
                style={styles.jobRow}
              >
                <span>{job.id.slice(0, 8)}...</span>

                <span>
                  {serviceNames[job.service_id] ||
                    job.service_id}
                </span>

                <span
                  style={{
                    ...styles.badge,
                    ...statusStyle(job.status),
                  }}
                >
                  {job.status}
                </span>

                <span>
                  {formatDate(
                    job.scheduled_start || job.created_at
                  )}
                </span>

                <span>
                  {job.total_amount == null
                    ? '-'
                    : `₹${Number(job.total_amount).toFixed(2)}`}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <Empty text="No jobs found for this worker." />
        )}
      </Panel>
    </div>
  )
}

function DocumentCard({
  required,
  document,
  saving,
  onView,
  onApprove,
  onReject,
}: {
  required: {
    type: string
    label: string
  }
  document?: WorkerDocument
  saving: boolean
  onView: () => void
  onApprove: () => void
  onReject: () => void
}) {
  return (
    <div style={styles.documentCard}>
      <div style={styles.documentHeader}>
        <div>
          <h3 style={styles.documentTitle}>
            {required.label}
          </h3>

          <p style={styles.muted}>
            {document?.file_name || 'Not uploaded'}
          </p>
        </div>

        <span
          style={{
            ...styles.badge,
            ...(document
              ? document.status === 'approved'
                ? styles.good
                : document.status === 'rejected'
                ? styles.bad
                : styles.neutral
              : styles.missing),
          }}
        >
          {document
            ? formatStatus(document.status)
            : 'Missing'}
        </span>
      </div>

      {document && (
        <>
          <div style={styles.documentMeta}>
            {document.mime_type && (
              <span>{document.mime_type}</span>
            )}

            {document.file_size != null && (
              <span>{formatFileSize(document.file_size)}</span>
            )}
          </div>

          {document.rejection_reason && (
            <div style={styles.rejectionBox}>
              <strong>Rejection reason</strong>
              <p>{document.rejection_reason}</p>
            </div>
          )}

          <div style={styles.documentActions}>
            <button
              style={styles.button}
              disabled={saving}
              onClick={onView}
            >
              View Document
            </button>

            <button
              style={styles.approveSmallButton}
              disabled={
                saving || document.status === 'approved'
              }
              onClick={onApprove}
            >
              Approve
            </button>

            <button
              style={styles.rejectSmallButton}
              disabled={saving}
              onClick={onReject}
            >
              Reject
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function Summary({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div style={styles.summary}>
      <span style={styles.muted}>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function InfoItem({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div style={styles.infoItem}>
      <span style={styles.muted}>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function Panel({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section style={styles.panel}>
      <h2 style={styles.panelTitle}>{title}</h2>
      {children}
    </section>
  )
}

function Empty({ text }: { text: string }) {
  return <p style={styles.muted}>{text}</p>
}

function formatDate(value: string) {
  return new Date(value).toLocaleString()
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024)
    return `${(bytes / 1024).toFixed(1)} KB`

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatStatus(value: string) {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, character => character.toUpperCase())
}

function formatOnboardingType(value: string) {
  if (value === 'self_registered') return 'Worker Self-Registered'
  if (value === 'admin_created') return 'Admin Created'
  return formatStatus(value)
}

function getLocation(
  value: unknown
): { latitude: number; longitude: number } | null {
  if (!value || typeof value !== 'object') return null

  const candidate = value as Record<string, unknown>

  const latitude = Number(
    candidate.latitude ?? candidate.lat
  )

  const longitude = Number(
    candidate.longitude ??
      candidate.lng ??
      candidate.lon
  )

  return Number.isFinite(latitude) &&
    Number.isFinite(longitude)
    ? { latitude, longitude }
    : null
}

function statusStyle(
  status: string
): React.CSSProperties {
  return status === 'completed'
    ? styles.good
    : status === 'cancelled'
    ? styles.bad
    : styles.neutral
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    padding: 32,
    maxWidth: 1500,
    margin: '0 auto',
  },

  back: {
    color: '#0f766e',
    fontWeight: 700,
    textDecoration: 'none',
  },

  header: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 20,
    alignItems: 'flex-start',
    margin: '20px 0 24px',
  },

  title: {
    margin: 0,
    fontSize: 32,
  },

  subtitle: {
    marginTop: 6,
    color: '#64748b',
    fontSize: 13,
  },

  actions: {
    display: 'flex',
    gap: 10,
    flexWrap: 'wrap',
  },

  button: {
    padding: '10px 14px',
    border: '1px solid #cbd5e1',
    borderRadius: 7,
    background: '#fff',
    fontWeight: 700,
    cursor: 'pointer',
  },

  approveButton: {
    padding: '11px 18px',
    border: '1px solid #15803d',
    borderRadius: 7,
    background: '#15803d',
    color: '#fff',
    fontWeight: 700,
    cursor: 'pointer',
  },

  disabledButton: {
    padding: '11px 18px',
    border: '1px solid #cbd5e1',
    borderRadius: 7,
    background: '#e2e8f0',
    color: '#64748b',
    fontWeight: 700,
    cursor: 'not-allowed',
  },

  rejectButton: {
    padding: '11px 18px',
    border: '1px solid #dc2626',
    borderRadius: 7,
    background: '#dc2626',
    color: '#fff',
    fontWeight: 700,
    cursor: 'pointer',
  },

  dangerButton: {
    padding: '10px 14px',
    border: '1px solid #fecaca',
    borderRadius: 7,
    background: '#fff1f2',
    color: '#be123c',
    fontWeight: 700,
    cursor: 'pointer',
  },

  error: {
    padding: 14,
    marginBottom: 20,
    background: '#fee2e2',
    color: '#991b1b',
    borderRadius: 8,
  },

  success: {
    padding: 14,
    marginBottom: 20,
    background: '#dcfce7',
    color: '#166534',
    borderRadius: 8,
  },

  summaryGrid: {
    display: 'grid',
    gridTemplateColumns:
      'repeat(5, minmax(0, 1fr))',
    gap: 12,
    marginBottom: 20,
  },

  summary: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 10,
    padding: 18,
    display: 'grid',
    gap: 8,
  },

  grid: {
    display: 'grid',
    gridTemplateColumns:
      'repeat(2, minmax(0, 1fr))',
    gap: 18,
    marginBottom: 18,
  },

  panel: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 10,
    padding: 20,
    marginBottom: 18,
  },

  panelTitle: {
    margin: '0 0 16px',
    fontSize: 17,
  },

  applicationGrid: {
    display: 'grid',
    gridTemplateColumns:
      'repeat(4, minmax(0, 1fr))',
    gap: 12,
    marginBottom: 20,
  },

  infoItem: {
    background: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    padding: 14,
    display: 'grid',
    gap: 7,
  },

  documentProgress: {
    marginBottom: 20,
  },

  progressTrack: {
    height: 10,
    background: '#e2e8f0',
    borderRadius: 999,
    overflow: 'hidden',
    marginTop: 10,
  },

  progressBar: {
    height: '100%',
    background: '#0f766e',
    borderRadius: 999,
    transition: 'width 0.2s ease',
  },

  applicationActions: {
    display: 'flex',
    gap: 10,
    flexWrap: 'wrap',
    marginTop: 20,
  },

  notesBox: {
    padding: 14,
    background: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    marginBottom: 14,
  },

  warningBox: {
    padding: 14,
    background: '#fff7ed',
    border: '1px solid #fed7aa',
    color: '#9a3412',
    borderRadius: 8,
    marginBottom: 14,
  },

  reviewBox: {
    marginTop: 18,
    padding: 18,
    background: '#f8fafc',
    border: '1px solid #cbd5e1',
    borderRadius: 10,
  },

  reviewTitle: {
    margin: '0 0 8px',
    fontSize: 16,
  },

  reviewActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 12,
  },

  textarea: {
    width: '100%',
    boxSizing: 'border-box',
    padding: 12,
    border: '1px solid #cbd5e1',
    borderRadius: 7,
    resize: 'vertical',
    fontFamily: 'inherit',
    fontSize: 14,
  },

  documentsGrid: {
    display: 'grid',
    gridTemplateColumns:
      'repeat(2, minmax(0, 1fr))',
    gap: 14,
  },

  documentCard: {
    border: '1px solid #e2e8f0',
    borderRadius: 10,
    padding: 16,
    background: '#f8fafc',
  },

  documentHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 14,
    alignItems: 'flex-start',
  },

  documentTitle: {
    margin: 0,
    fontSize: 16,
  },

  documentMeta: {
    display: 'flex',
    gap: 12,
    marginTop: 12,
    color: '#64748b',
    fontSize: 12,
  },

  documentActions: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
    marginTop: 14,
  },

  approveSmallButton: {
    padding: '8px 11px',
    border: '1px solid #15803d',
    borderRadius: 7,
    background: '#dcfce7',
    color: '#166534',
    fontWeight: 700,
    cursor: 'pointer',
  },

  rejectSmallButton: {
    padding: '8px 11px',
    border: '1px solid #dc2626',
    borderRadius: 7,
    background: '#fee2e2',
    color: '#991b1b',
    fontWeight: 700,
    cursor: 'pointer',
  },

  rejectionBox: {
    marginTop: 12,
    padding: 10,
    background: '#fee2e2',
    color: '#991b1b',
    borderRadius: 7,
    fontSize: 13,
  },

  emptyBox: {
    padding: 18,
    background: '#f8fafc',
    borderRadius: 8,
  },

  list: {
    margin: 0,
    paddingLeft: 20,
    lineHeight: 1.9,
  },

  row: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 16,
    padding: '10px 0',
    borderBottom: '1px solid #f1f5f9',
  },

  muted: {
    color: '#64748b',
    fontSize: 13,
  },

  badge: {
    display: 'inline-block',
    padding: '4px 8px',
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    whiteSpace: 'nowrap',
  },

  good: {
    background: '#dcfce7',
    color: '#166534',
  },

  bad: {
    background: '#fee2e2',
    color: '#991b1b',
  },

  neutral: {
    background: '#e2e8f0',
    color: '#334155',
  },

  missing: {
    background: '#ffedd5',
    color: '#9a3412',
  },

  jobTable: {
    overflowX: 'auto',
  },

  jobHeader: {
    display: 'grid',
    gridTemplateColumns:
      '1fr 1.5fr 1fr 1.4fr 1fr',
    gap: 14,
    padding: '10px 0',
    color: '#64748b',
    fontSize: 12,
    fontWeight: 700,
  },

  jobRow: {
    display: 'grid',
    gridTemplateColumns:
      '1fr 1.5fr 1fr 1.4fr 1fr',
    gap: 14,
    alignItems: 'center',
    padding: '13px 0',
    borderTop: '1px solid #f1f5f9',
    fontSize: 13,
  },
}