
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { adminAction } from '../lib/adminAction'


type Review = {
  id: string
  booking_id: string
  customer_id: string
  worker_id: string
  rating: number
  comment: string | null
  created_at: string
  moderation_status: string | null
  moderated_at: string | null
  moderated_by: string | null
  moderation_reason: string | null
}

type ReviewStatus =
  | 'all'
  | 'pending'
  | 'approved'
  | 'rejected'

type RatingFilter =
  | 'all'
  | '5'
  | '4'
  | '3'
  | '2'
  | '1'

const PAGE_SIZE = 10

export default function Reviews() {
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] =
    useState<ReviewStatus>('all')
  const [ratingFilter, setRatingFilter] =
    useState<RatingFilter>('all')
  const [page, setPage] = useState(1)

  const [moderationReview, setModerationReview] =
    useState<Review | null>(null)

  const [moderationStatus, setModerationStatus] =
    useState<'approved' | 'rejected'>('approved')

  const [moderationReason, setModerationReason] =
    useState('')

  async function loadReviews() {
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const { data, error: reviewsError } =
        await supabase
          .from('reviews')
          .select(`
            id,
            booking_id,
            customer_id,
            worker_id,
            rating,
            comment,
            created_at,
            moderation_status,
            moderated_at,
            moderated_by,
            moderation_reason
          `)
          .order('created_at', {
            ascending: false,
          })

      if (reviewsError) {
        throw reviewsError
      }

      setReviews((data ?? []) as Review[])
    } catch (err) {
      console.error('Failed to load reviews:', err)

      setError(
        err instanceof Error
          ? err.message
          : 'Failed to load reviews.'
      )

      setReviews([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadReviews()
  }, [])

  useEffect(() => {
    setPage(1)
  }, [search, statusFilter, ratingFilter])

  const statistics = useMemo(() => {
    const total = reviews.length

    const ratingSum = reviews.reduce(
      (sum, review) =>
        sum + Number(review.rating || 0),
      0
    )

    const average =
      total > 0
        ? ratingSum / total
        : 0

    const pending = reviews.filter(
      review =>
        !review.moderation_status ||
        review.moderation_status === 'pending'
    ).length

    const approved = reviews.filter(
      review =>
        review.moderation_status === 'approved'
    ).length

    const rejected = reviews.filter(
      review =>
        review.moderation_status === 'rejected'
    ).length

    const ratingCounts: Record<number, number> = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    }

    for (const review of reviews) {
      const rating = Number(review.rating)

      if (rating >= 1 && rating <= 5) {
        ratingCounts[rating] += 1
      }
    }

    return {
      total,
      average,
      pending,
      approved,
      rejected,
      ratingCounts,
    }
  }, [reviews])

  const filteredReviews = useMemo(() => {
    const normalizedSearch =
      search.trim().toLowerCase()

    return reviews.filter(review => {
      const status =
        review.moderation_status ||
        'pending'

      if (
        statusFilter !== 'all' &&
        status !== statusFilter
      ) {
        return false
      }

      if (
        ratingFilter !== 'all' &&
        Number(review.rating) !==
          Number(ratingFilter)
      ) {
        return false
      }

      if (!normalizedSearch) {
        return true
      }

      return [
        review.id,
        review.booking_id,
        review.customer_id,
        review.worker_id,
        review.comment,
        review.moderation_reason,
      ].some(value =>
        value
          ?.toString()
          .toLowerCase()
          .includes(normalizedSearch)
      )
    })
  }, [
    reviews,
    search,
    statusFilter,
    ratingFilter,
  ])

  const totalPages = Math.max(
    1,
    Math.ceil(
      filteredReviews.length / PAGE_SIZE
    )
  )

  const currentPage = Math.min(
    page,
    totalPages
  )

  const paginatedReviews =
    filteredReviews.slice(
      (currentPage - 1) * PAGE_SIZE,
      currentPage * PAGE_SIZE
    )

  async function moderateReview() {
    if (!moderationReview) {
      return
    }

    if (
      moderationStatus === 'rejected' &&
      !moderationReason.trim()
    ) {
      setError(
        'A reason is required when rejecting a review.'
      )
      return
    }

    setProcessingId(
      moderationReview.id
    )

    setError('')
    setSuccess('')

    const { error: rpcError } =
      await adminAction(
        'admin_moderate_review',
        {
          p_review_id:
            moderationReview.id,
          p_moderation_status:
            moderationStatus,
          p_reason:
            moderationReason.trim() ||
            null,
        }
      )

    setProcessingId(null)

    if (rpcError) {
      console.error(
        'Failed to moderate review:',
        rpcError
      )

      setError(
        rpcError.message ||
          'Failed to moderate review.'
      )

      return
    }

    setSuccess(
      moderationStatus === 'approved'
        ? 'Review approved successfully.'
        : 'Review rejected successfully.'
    )

    setModerationReview(null)
    setModerationReason('')

    await loadReviews()
  }

  function openModeration(
    review: Review,
    status: 'approved' | 'rejected'
  ) {
    setError('')
    setSuccess('')

    setModerationReview(review)
    setModerationStatus(status)
    setModerationReason(
      review.moderation_reason || ''
    )
  }

  function formatDate(value: string) {
    const date = new Date(value)

    if (
      Number.isNaN(date.getTime())
    ) {
      return '—'
    }

    return date.toLocaleString(
      'en-IN',
      {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }
    )
  }

  function formatRating(rating: number) {
    const value = Math.max(
      0,
      Math.min(5, Number(rating))
    )

    return (
      <span
        aria-label={`${value} out of 5 stars`}
        style={styles.stars}
      >
        {'★'.repeat(value)}
        <span style={styles.emptyStars}>
          {'★'.repeat(5 - value)}
        </span>
      </span>
    )
  }

  function statusStyle(
    status: string | null
  ): React.CSSProperties {
    switch (status) {
      case 'approved':
        return styles.approved

      case 'rejected':
        return styles.rejected

      default:
        return styles.pending
    }
  }

  function statusLabel(
    status: string | null
  ) {
    if (!status || status === 'pending') {
      return 'Pending'
    }

    return (
      status.charAt(0).toUpperCase() +
      status.slice(1)
    )
  }

  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <h1>Reviews</h1>

          <p>
            Monitor customer feedback and
            moderate published reviews.
          </p>
        </div>

        <button
          className="dashboard-refresh"
          onClick={() => void loadReviews()}
          disabled={loading}
        >
          {loading
            ? 'Loading...'
            : 'Refresh'}
        </button>
      </div>

      {error && (
        <div
          className="error-banner"
          style={styles.message}
        >
          {error}
        </div>
      )}

      {success && (
        <div
          style={styles.success}
        >
          {success}
        </div>
      )}

      <div style={styles.summaryGrid}>
        <div className="panel">
          <span style={styles.metricLabel}>
            Total reviews
          </span>

          <strong style={styles.metricValue}>
            {statistics.total}
          </strong>
        </div>

        <div className="panel">
          <span style={styles.metricLabel}>
            Average rating
          </span>

          <strong style={styles.metricValue}>
            {statistics.average.toFixed(1)}
            <span style={styles.metricSuffix}>
              / 5
            </span>
          </strong>
        </div>

        <div className="panel">
          <span style={styles.metricLabel}>
            Pending moderation
          </span>

          <strong style={styles.metricValue}>
            {statistics.pending}
          </strong>
        </div>

        <div className="panel">
          <span style={styles.metricLabel}>
            Approved
          </span>

          <strong style={styles.metricValue}>
            {statistics.approved}
          </strong>
        </div>

        <div className="panel">
          <span style={styles.metricLabel}>
            Rejected
          </span>

          <strong style={styles.metricValue}>
            {statistics.rejected}
          </strong>
        </div>
      </div>

      <div
        className="panel"
        style={styles.ratingPanel}
      >
        <div>
          <h2 style={styles.sectionTitle}>
            Rating distribution
          </h2>

          <p style={styles.muted}>
            Distribution across all reviews
          </p>
        </div>

        <div style={styles.ratingDistribution}>
          {[5, 4, 3, 2, 1].map(
            rating => {
              const count =
                statistics.ratingCounts[
                  rating
                ]

              const percentage =
                statistics.total > 0
                  ? Math.round(
                      (count /
                        statistics.total) *
                        100
                    )
                  : 0

              return (
                <div
                  key={rating}
                  style={styles.ratingRow}
                >
                  <span
                    style={
                      styles.ratingNumber
                    }
                  >
                    {rating} ★
                  </span>

                  <div
                    style={
                      styles.ratingTrack
                    }
                  >
                    <div
                      style={{
                        ...styles.ratingBar,
                        width: `${percentage}%`,
                      }}
                    />
                  </div>

                  <span
                    style={
                      styles.ratingCount
                    }
                  >
                    {count}
                  </span>
                </div>
              )
            }
          )}
        </div>
      </div>

      <div
        className="panel"
        style={styles.filtersPanel}
      >
        <div style={styles.filters}>
          <label style={styles.filterField}>
            <strong>Search</strong>

            <input
              type="search"
              value={search}
              onChange={event =>
                setSearch(
                  event.target.value
                )
              }
              placeholder="Review, customer, worker or booking ID"
              style={styles.input}
            />
          </label>

          <label style={styles.filterField}>
            <strong>Status</strong>

            <select
              value={statusFilter}
              onChange={event =>
                setStatusFilter(
                  event.target
                    .value as ReviewStatus
                )
              }
              style={styles.input}
            >
              <option value="all">
                All statuses
              </option>
              <option value="pending">
                Pending
              </option>
              <option value="approved">
                Approved
              </option>
              <option value="rejected">
                Rejected
              </option>
            </select>
          </label>

          <label style={styles.filterField}>
            <strong>Rating</strong>

            <select
              value={ratingFilter}
              onChange={event =>
                setRatingFilter(
                  event.target
                    .value as RatingFilter
                )
              }
              style={styles.input}
            >
              <option value="all">
                All ratings
              </option>
              <option value="5">
                5 stars
              </option>
              <option value="4">
                4 stars
              </option>
              <option value="3">
                3 stars
              </option>
              <option value="2">
                2 stars
              </option>
              <option value="1">
                1 star
              </option>
            </select>
          </label>

          <button
            className="dashboard-refresh"
            onClick={() => {
              setSearch('')
              setStatusFilter('all')
              setRatingFilter('all')
            }}
          >
            Reset
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <h2>
              Customer feedback
            </h2>

            <p>
              {filteredReviews.length} of{' '}
              {reviews.length} reviews
            </p>
          </div>
        </div>

        {loading ? (
          <div className="bookings-empty">
            <strong>
              Loading reviews...
            </strong>

            <span>
              Please wait.
            </span>
          </div>
        ) : paginatedReviews.length ===
          0 ? (
          <div className="bookings-empty">
            <strong>
              No reviews found
            </strong>

            <span>
              Try changing the search
              or filters.
            </span>
          </div>
        ) : (
          <div style={styles.reviewList}>
            {paginatedReviews.map(
              review => (
                <div
                  key={review.id}
                  style={styles.reviewItem}
                >
                  <div
                    style={
                      styles.reviewHeader
                    }
                  >
                    <div>
                      <div
                        style={
                          styles.ratingLine
                        }
                      >
                        {formatRating(
                          Number(
                            review.rating
                          )
                        )}

                        <strong>
                          {Number(
                            review.rating
                          )}/5
                        </strong>
                      </div>

                      <div
                        style={
                          styles.reviewDate
                        }
                      >
                        {formatDate(
                          review.created_at
                        )}
                      </div>
                    </div>

                    <span
                      style={{
                        ...styles.status,
                        ...statusStyle(
                          review.moderation_status
                        ),
                      }}
                    >
                      {statusLabel(
                        review.moderation_status
                      )}
                    </span>
                  </div>

                  <p
                    style={
                      styles.reviewComment
                    }
                  >
                    {review.comment ||
                      'No written comment.'}
                  </p>

                  <div
                    style={
                      styles.reviewMetaGrid
                    }
                  >
                    <div>
                      <span
                        style={
                          styles.metaLabel
                        }
                      >
                        Review ID
                      </span>

                      <code>
                        {review.id.slice(
                          0,
                          8
                        )}
                      </code>
                    </div>

                    <div>
                      <span
                        style={
                          styles.metaLabel
                        }
                      >
                        Booking
                      </span>

                      <code>
                        {review.booking_id
                          ? review.booking_id.slice(
                              0,
                              8
                            )
                          : '—'}
                      </code>
                    </div>

                    <div>
                      <span
                        style={
                          styles.metaLabel
                        }
                      >
                        Customer
                      </span>

                      <code>
                        {review.customer_id
                          ? review.customer_id.slice(
                              0,
                              8
                            )
                          : '—'}
                      </code>
                    </div>

                    <div>
                      <span
                        style={
                          styles.metaLabel
                        }
                      >
                        Worker
                      </span>

                      <code>
                        {review.worker_id
                          ? review.worker_id.slice(
                              0,
                              8
                            )
                          : '—'}
                      </code>
                    </div>
                  </div>

                  {review.moderation_reason && (
                    <div
                      style={
                        styles.reasonBox
                      }
                    >
                      <strong>
                        Moderation reason
                      </strong>

                      <div>
                        {
                          review.moderation_reason
                        }
                      </div>
                    </div>
                  )}

                  <div
                    style={
                      styles.reviewActions
                    }
                  >
                    <button
                      style={
                        styles.approveButton
                      }
                      disabled={
                        processingId ===
                        review.id ||
                        review.moderation_status ===
                          'approved'
                      }
                      onClick={() =>
                        openModeration(
                          review,
                          'approved'
                        )
                      }
                    >
                      Approve
                    </button>

                    <button
                      style={
                        styles.rejectButton
                      }
                      disabled={
                        processingId ===
                        review.id ||
                        review.moderation_status ===
                          'rejected'
                      }
                      onClick={() =>
                        openModeration(
                          review,
                          'rejected'
                        )
                      }
                    >
                      Reject
                    </button>
                  </div>
                </div>
              )
            )}
          </div>
        )}

        {!loading &&
          filteredReviews.length >
            PAGE_SIZE && (
            <div
              style={
                styles.pagination
              }
            >
              <button
                className="dashboard-refresh"
                disabled={
                  currentPage <= 1
                }
                onClick={() =>
                  setPage(
                    currentPage - 1
                  )
                }
              >
                Previous
              </button>

              <span>
                Page {currentPage} of{' '}
                {totalPages}
              </span>

              <button
                className="dashboard-refresh"
                disabled={
                  currentPage >=
                  totalPages
                }
                onClick={() =>
                  setPage(
                    currentPage + 1
                  )
                }
              >
                Next
              </button>
            </div>
          )}
      </div>

      {moderationReview && (
        <div
          style={styles.modalOverlay}
          role="dialog"
          aria-modal="true"
        >
          <div style={styles.modal}>
            <h2>
              {moderationStatus ===
              'approved'
                ? 'Approve review'
                : 'Reject review'}
            </h2>

            <p style={styles.muted}>
              You are about to{' '}
              {moderationStatus ===
              'approved'
                ? 'approve'
                : 'reject'}{' '}
              this review.
            </p>

            <div
              style={
                styles.modalReview
              }
            >
              <div>
                {formatRating(
                  Number(
                    moderationReview.rating
                  )
                )}
              </div>

              <p>
                {moderationReview.comment ||
                  'No written comment.'}
              </p>
            </div>

            <label
              style={styles.filterField}
            >
              <strong>
                {moderationStatus ===
                'rejected'
                  ? 'Rejection reason'
                  : 'Moderation note'}
              </strong>

              <textarea
                value={
                  moderationReason
                }
                onChange={event =>
                  setModerationReason(
                    event.target.value
                  )
                }
                rows={4}
                placeholder={
                  moderationStatus ===
                  'rejected'
                    ? 'Explain why this review is being rejected...'
                    : 'Optional internal moderation note...'
                }
                style={
                  styles.textarea
                }
              />
            </label>

            <div
              style={
                styles.modalActions
              }
            >
              <button
                className="dashboard-refresh"
                disabled={
                  processingId ===
                  moderationReview.id
                }
                onClick={() => {
                  setModerationReview(
                    null
                  )
                  setModerationReason(
                    ''
                  )
                }}
              >
                Cancel
              </button>

              <button
                style={
                  moderationStatus ===
                  'approved'
                    ? styles.approveButton
                    : styles.rejectButton
                }
                disabled={
                  processingId ===
                  moderationReview.id
                }
                onClick={() =>
                  void moderateReview()
                }
              >
                {processingId ===
                moderationReview.id
                  ? 'Saving...'
                  : moderationStatus ===
                      'approved'
                    ? 'Confirm Approval'
                    : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const styles: Record<
  string,
  React.CSSProperties
> = {
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns:
      'repeat(5, minmax(0, 1fr))',
    gap: 12,
    marginBottom: 20,
  },

  metricLabel: {
    display: 'block',
    color: '#64748b',
    fontSize: 13,
  },

  metricValue: {
    display: 'block',
    marginTop: 7,
    fontSize: 28,
  },

  metricSuffix: {
    fontSize: 14,
    color: '#64748b',
    marginLeft: 3,
  },

  ratingPanel: {
    marginBottom: 20,
  },

  sectionTitle: {
    margin: 0,
    fontSize: 17,
  },

  muted: {
    color: '#64748b',
    fontSize: 13,
  },

  ratingDistribution: {
    marginTop: 18,
    maxWidth: 700,
  },

  ratingRow: {
    display: 'grid',
    gridTemplateColumns:
      '55px 1fr 50px',
    gap: 10,
    alignItems: 'center',
    marginBottom: 9,
  },

  ratingNumber: {
    fontSize: 13,
    fontWeight: 700,
  },

  ratingTrack: {
    height: 9,
    borderRadius: 999,
    background: '#e2e8f0',
    overflow: 'hidden',
  },

  ratingBar: {
    height: '100%',
    background: '#f59e0b',
    borderRadius: 999,
  },

  ratingCount: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'right',
  },

  filtersPanel: {
    marginBottom: 20,
  },

  filters: {
    display: 'grid',
    gridTemplateColumns:
      'minmax(260px, 2fr) repeat(2, minmax(150px, 1fr)) auto',
    gap: 12,
    alignItems: 'end',
  },

  filterField: {
    display: 'grid',
    gap: 6,
  },

  input: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '10px 12px',
    border: '1px solid #cbd5e1',
    borderRadius: 7,
    background: '#fff',
    fontFamily: 'inherit',
    fontSize: 14,
  },

  reviewList: {
    display: 'grid',
    gap: 12,
  },

  reviewItem: {
    border: '1px solid #e2e8f0',
    borderRadius: 10,
    padding: 18,
    background: '#fff',
  },

  reviewHeader: {
    display: 'flex',
    justifyContent:
      'space-between',
    alignItems: 'flex-start',
    gap: 16,
  },

  ratingLine: {
    display: 'flex',
    gap: 9,
    alignItems: 'center',
  },

  stars: {
    color: '#f59e0b',
    letterSpacing: 1,
  },

  emptyStars: {
    color: '#cbd5e1',
  },

  reviewDate: {
    marginTop: 5,
    color: '#64748b',
    fontSize: 12,
  },

  status: {
    display: 'inline-flex',
    padding: '5px 9px',
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
  },

  approved: {
    background: '#dcfce7',
    color: '#166534',
  },

  rejected: {
    background: '#fee2e2',
    color: '#991b1b',
  },

  pending: {
    background: '#fef3c7',
    color: '#92400e',
  },

  reviewComment: {
    margin:
      '16px 0',
    lineHeight: 1.6,
  },

  reviewMetaGrid: {
    display: 'grid',
    gridTemplateColumns:
      'repeat(4, minmax(0, 1fr))',
    gap: 10,
    paddingTop: 12,
    borderTop:
      '1px solid #f1f5f9',
  },

  metaLabel: {
    display: 'block',
    color: '#64748b',
    fontSize: 11,
    marginBottom: 4,
  },

  reasonBox: {
    marginTop: 14,
    padding: 12,
    borderRadius: 7,
    background: '#f8fafc',
    border:
      '1px solid #e2e8f0',
    fontSize: 13,
  },

  reviewActions: {
    display: 'flex',
    justifyContent:
      'flex-end',
    gap: 8,
    marginTop: 14,
  },

  approveButton: {
    padding: '9px 13px',
    border:
      '1px solid #15803d',
    borderRadius: 7,
    background: '#15803d',
    color: '#fff',
    fontWeight: 700,
    cursor: 'pointer',
  },

  rejectButton: {
    padding: '9px 13px',
    border:
      '1px solid #dc2626',
    borderRadius: 7,
    background: '#dc2626',
    color: '#fff',
    fontWeight: 700,
    cursor: 'pointer',
  },

  pagination: {
    display: 'flex',
    alignItems: 'center',
    justifyContent:
      'center',
    gap: 16,
    marginTop: 20,
  },

  message: {
    marginBottom: 20,
  },

  success: {
    padding: 14,
    marginBottom: 20,
    background: '#dcfce7',
    color: '#166534',
    borderRadius: 8,
  },

  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background:
      'rgba(15, 23, 42, 0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    zIndex: 1000,
  },

  modal: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '90vh',
    overflowY: 'auto',
    background: '#fff',
    borderRadius: 12,
    padding: 24,
    boxShadow:
      '0 20px 60px rgba(0,0,0,0.2)',
  },

  modalReview: {
    margin:
      '18px 0',
    padding: 14,
    background: '#f8fafc',
    borderRadius: 8,
  },

  textarea: {
    width: '100%',
    boxSizing: 'border-box',
    padding: 12,
    border:
      '1px solid #cbd5e1',
    borderRadius: 7,
    resize: 'vertical',
    fontFamily: 'inherit',
    fontSize: 14,
  },

  modalActions: {
    display: 'flex',
    justifyContent:
      'flex-end',
    gap: 10,
    marginTop: 20,
  },
}