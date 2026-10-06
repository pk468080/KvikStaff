import {
  useCallback,
  useEffect,
  useState,
} from 'react'

import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'

import {
  ScreenContainer,
} from '../../components/layout/ScreenContainer'

import {
  getCustomerBooking,
  type CustomerBooking,
} from '../../services/booking/bookingTracking.service'

import {
  getCustomerReviewForBooking,
  getReviewableOccurrencesForBooking,
  getReviewEligibilityError,
  normalizeReviewSubmission,
  resolveCompletedOccurrenceForReview,
  submitCustomerBookingReview,
  type CustomerReviewableOccurrence,
  type CustomerReview,
} from '../../services/reviews/review.service'

type CompletedBookingScreenProps = {
  bookingId: string
  onViewInvoice: (bookingId: string) => void
}

const KvikStaffLogo = require('../../assets/branding/tempstuff-logo.png')

function formatStatus(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, character => character.toUpperCase())
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return 'Not recorded'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatMoney(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return 'Amount unavailable'
  }

  return `₹${value.toFixed(2)}`
}

function formatHours(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return 'Not recorded'
  }

  return `${value} ${value === 1 ? 'hour' : 'hours'}`
}

function InfoRow({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  )
}

export default function CompletedBookingScreen({
  bookingId,
  onViewInvoice,
}: CompletedBookingScreenProps) {
  const [booking, setBooking] = useState<CustomerBooking | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [review, setReview] = useState<CustomerReview | null>(null)
  const [reviewText, setReviewText] = useState('')
  const [reviewRating, setReviewRating] = useState(5)
  const [reviewSubmitting, setReviewSubmitting] = useState(false)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [reviewOccurrenceId, setReviewOccurrenceId] = useState<string | null>(null)
  const [reviewWorkerId, setReviewWorkerId] = useState<string | null>(null)
  const [reviewableOccurrences, setReviewableOccurrences] = useState<
    CustomerReviewableOccurrence[]
  >([])
  const [occurrenceReviews, setOccurrenceReviews] = useState<
    Record<string, CustomerReview | null>
  >({})

  const loadBooking = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }

      try {
        const nextBooking = await getCustomerBooking(bookingId)

        if (nextBooking.status !== 'completed') {
          throw new Error(
            'This booking is no longer in the completed state. Refresh to load its current status.',
          )
        }

        if (nextBooking.booking_type === 'recurring') {
          const nextOccurrences =
            await getReviewableOccurrencesForBooking(
              bookingId,
            )
          const nextOccurrenceReviews: Record<
            string,
            CustomerReview | null
          > = {}

          await Promise.all(
            nextOccurrences.map(
              async occurrence => {
                nextOccurrenceReviews[occurrence.id] =
                  await getCustomerReviewForBooking(
                    bookingId,
                    occurrence.id,
                  )
              },
            ),
          )

          setReviewableOccurrences(
            nextOccurrences,
          )
          setOccurrenceReviews(
            nextOccurrenceReviews,
          )
          setReview(null)
          setReviewOccurrenceId(null)
          setReviewWorkerId(null)
          setReviewText('')
          setReviewRating(5)
        } else {
          const nextReviewMeta =
            await resolveCompletedOccurrenceForReview(
              bookingId,
            )
          const nextReview =
            await getCustomerReviewForBooking(
              bookingId,
              nextReviewMeta.occurrenceId,
            )

          setReviewableOccurrences([])
          setOccurrenceReviews({})
          setReview(nextReview)
          setReviewOccurrenceId(
            nextReviewMeta.occurrenceId,
          )
          setReviewWorkerId(
            nextReviewMeta.workerId,
          )
          setReviewText(nextReview?.comment ?? '')
          setReviewRating(nextReview?.rating ?? 5)
        }

        setReviewError(null)
        setBooking(nextBooking)
        setError(null)
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : 'Unable to load the completed booking.',
        )
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [bookingId],
  )

  useEffect(() => {
    void loadBooking()
  }, [loadBooking])

  const reviewEligibilityError = getReviewEligibilityError({
    bookingStatus: booking?.status ?? null,
    hasWorker: Boolean(reviewWorkerId),
    hasExistingReview: Boolean(review),
  })

  function selectOccurrenceForReview(
    occurrence: CustomerReviewableOccurrence,
  ) {
    const nextReview =
      occurrenceReviews[occurrence.id] ?? null

    setReviewOccurrenceId(occurrence.id)
    setReviewWorkerId(occurrence.worker_id)
    setReview(nextReview)
    setReviewText(nextReview?.comment ?? '')
    setReviewRating(nextReview?.rating ?? 5)
    setReviewError(null)
  }

  const canSubmitReview =
    booking?.status === 'completed' &&
    Boolean(reviewWorkerId) &&
    (booking.booking_type !== 'recurring' ||
      Boolean(reviewOccurrenceId)) &&
    !review &&
    !reviewSubmitting &&
    !reviewEligibilityError

  async function handleSubmitReview() {
    if (
      !booking ||
      !reviewWorkerId ||
      reviewSubmitting ||
      review ||
      (booking.booking_type === 'recurring' &&
        !reviewOccurrenceId)
    ) {
      return
    }

    try {
      setReviewSubmitting(true)
      setReviewError(null)

      const normalized = normalizeReviewSubmission({
        rating: reviewRating,
        reviewText,
      })

      const nextReview = await submitCustomerBookingReview({
        bookingId: booking.id,
        occurrenceId: reviewOccurrenceId,
        rating: normalized.rating,
        reviewText: normalized.reviewText,
      })

      if (
        booking.booking_type === 'recurring' &&
        reviewOccurrenceId
      ) {
        setOccurrenceReviews(
          current => ({
            ...current,
            [reviewOccurrenceId]: nextReview,
          }),
        )
      }

      setReview(nextReview)
      setReviewText(nextReview.comment ?? '')
      setReviewRating(nextReview.rating)
      Alert.alert(
        'Review submitted',
        'Thanks for sharing your experience.',
      )
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : 'Unable to submit your review.'

      setReviewError(message)
    } finally {
      setReviewSubmitting(false)
    }
  }

  if (loading) {
    return (
      <ScreenContainer>
        <View style={styles.centered}>
          <Image
            source={KvikStaffLogo}
            style={styles.loadingLogo}
            resizeMode="contain"
          />
          <ActivityIndicator />
          <Text style={styles.loadingText}>
            Loading completed booking...
          </Text>
        </View>
      </ScreenContainer>
    )
  }

  if (!booking) {
    return (
      <ScreenContainer>
        <View style={styles.centered}>
          <Text style={styles.errorTitle}>Booking unavailable</Text>
          <Text style={styles.errorText}>
            {error ?? 'The completed booking could not be loaded.'}
          </Text>
          <Pressable
            onPress={() => {
              void loadBooking()
            }}
            style={styles.retryButton}
          >
            <Text style={styles.retryButtonText}>Try again</Text>
          </Pressable>
        </View>
      </ScreenContainer>
    )
  }

  return (
    <ScreenContainer>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void loadBooking(true)
            }}
            tintColor="#0784FB"
          />
        }
      >
        <View style={styles.brandRow}>
          <Image
            source={KvikStaffLogo}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.brandLabel}>COMPLETED BOOKING</Text>
        </View>

        <View style={styles.heroCard}>
          <View style={styles.completedMark}>
            <Text style={styles.completedMarkText}>✓</Text>
          </View>

          <Text style={styles.eyebrow}>SERVICE COMPLETE</Text>
          <Text style={styles.heroTitle}>
            {booking.service_name ?? 'Service'}
          </Text>
          <Text style={styles.heroSubtitle}>
            Completed {formatDateTime(booking.completed_at)}
          </Text>

          <View style={styles.amountBlock}>
            <Text style={styles.amountLabel}>TOTAL</Text>
            <Text style={styles.amountValue}>
              {formatMoney(booking.total_amount)}
            </Text>
          </View>
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorBoxTitle}>Booking update notice</Text>
            <Text style={styles.errorBoxText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Service details</Text>
          <InfoRow
            label="Service"
            value={booking.service_name ?? 'Not recorded'}
          />
          <InfoRow
            label="Booking type"
            value={
              booking.booking_type
                ? formatStatus(booking.booking_type)
                : 'Not recorded'
            }
          />
          <InfoRow
            label="Scheduled start"
            value={formatDateTime(booking.scheduled_start)}
          />
          <InfoRow
            label="Scheduled end"
            value={formatDateTime(booking.scheduled_end)}
          />
          <InfoRow
            label="Working time"
            value={formatHours(booking.total_working_hours)}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Payment</Text>
          <InfoRow
            label="Final amount"
            value={formatMoney(booking.total_amount)}
          />
          <InfoRow
            label="Completed at"
            value={formatDateTime(booking.completed_at)}
          />
        </View>

        <Pressable
          onPress={() => onViewInvoice(booking.id)}
          style={styles.invoiceButton}
        >
          <Text style={styles.invoiceButtonText}>
            View Invoice / Receipt
          </Text>
        </Pressable>

        {booking.booking_type === 'recurring' ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Occurrence reviews</Text>
            <Text style={styles.reviewEligibilityText}>
              Review each completed service occurrence separately.
            </Text>

            {reviewableOccurrences.length === 0 ? (
              <Text style={styles.occurrenceEmptyText}>
                No completed occurrences are available for review yet.
              </Text>
            ) : (
              reviewableOccurrences.map(occurrence => {
                const occurrenceReview =
                  occurrenceReviews[occurrence.id] ?? null
                const occurrenceEligibilityError =
                  getReviewEligibilityError({
                    bookingStatus: booking.status,
                    hasWorker: Boolean(occurrence.worker_id),
                    hasExistingReview: Boolean(occurrenceReview),
                  })
                const isSelected =
                  reviewOccurrenceId === occurrence.id

                return (
                  <View
                    key={occurrence.id}
                    style={styles.occurrenceReviewCard}
                  >
                    <View style={styles.occurrenceHeader}>
                      <Text style={styles.occurrenceTitle}>
                        Occurrence {occurrence.occurrence_index + 1}
                      </Text>
                      <Text style={styles.occurrenceStatus}>
                        Completed
                      </Text>
                    </View>

                    {occurrenceReview ? (
                      <View>
                        <View style={styles.reviewSummaryRow}>
                          {[1, 2, 3, 4, 5].map(star => (
                            <Text
                              key={star}
                              style={[
                                styles.starText,
                                star <= occurrenceReview.rating
                                  ? styles.starFilled
                                  : null,
                              ]}
                            >
                              {star <= occurrenceReview.rating ? '★' : '☆'}
                            </Text>
                          ))}
                        </View>

                        {occurrenceReview.comment ? (
                          <Text style={styles.reviewText}>
                            {occurrenceReview.comment}
                          </Text>
                        ) : (
                          <Text style={styles.reviewTextMuted}>
                            No written feedback was provided.
                          </Text>
                        )}

                        <Text style={styles.reviewSubmittedBadge}>
                          Reviewed
                        </Text>
                      </View>
                    ) : isSelected ? (
                      occurrenceEligibilityError ? (
                        <Text style={styles.reviewEligibilityText}>
                          {occurrenceEligibilityError}
                        </Text>
                      ) : (
                        <>
                          <View style={styles.reviewSummaryRow}>
                            {[1, 2, 3, 4, 5].map(star => (
                              <TouchableOpacity
                                key={star}
                                activeOpacity={0.8}
                                onPress={() => setReviewRating(star)}
                                hitSlop={8}
                              >
                                <Text
                                  style={[
                                    styles.starText,
                                    star <= reviewRating
                                      ? styles.starFilled
                                      : null,
                                  ]}
                                >
                                  {star <= reviewRating ? '★' : '☆'}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </View>

                          <TextInput
                            value={reviewText}
                            onChangeText={setReviewText}
                            placeholder="How was your experience?"
                            placeholderTextColor="#7B8D98"
                            multiline
                            maxLength={2000}
                            style={styles.reviewInput}
                            textAlignVertical="top"
                          />

                          {reviewError ? (
                            <Text style={styles.reviewError}>
                              {reviewError}
                            </Text>
                          ) : null}

                          <Pressable
                            disabled={!canSubmitReview}
                            onPress={() => {
                              void handleSubmitReview()
                            }}
                            style={[
                              styles.submitReviewButton,
                              !canSubmitReview &&
                                styles.submitReviewButtonDisabled,
                            ]}
                          >
                            <Text style={styles.submitReviewButtonText}>
                              {reviewSubmitting
                                ? 'Submitting...'
                                : 'Submit Review'}
                            </Text>
                          </Pressable>
                        </>
                      )
                    ) : occurrenceEligibilityError ? (
                      <Text style={styles.reviewEligibilityText}>
                        {occurrenceEligibilityError}
                      </Text>
                    ) : (
                      <Pressable
                        onPress={() =>
                          selectOccurrenceForReview(occurrence)
                        }
                        style={styles.occurrenceActionButton}
                      >
                        <Text style={styles.occurrenceActionButtonText}>
                          Rate this service
                        </Text>
                      </Pressable>
                    )}
                  </View>
                )
              })
            )}
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>
              {review ? 'Your review' : 'Rate your experience'}
            </Text>

            {review ? (
              <View>
                <View style={styles.reviewSummaryRow}>
                  {[1, 2, 3, 4, 5].map(star => (
                    <Text
                      key={star}
                      style={[
                        styles.starText,
                        star <= review.rating ? styles.starFilled : null,
                      ]}
                    >
                      {star <= review.rating ? '★' : '☆'}
                    </Text>
                  ))}
                </View>

                {review.comment ? (
                  <Text style={styles.reviewText}>{review.comment}</Text>
                ) : (
                  <Text style={styles.reviewTextMuted}>
                    No written feedback was provided.
                  </Text>
                )}

                <Text style={styles.reviewSubmittedBadge}>Reviewed</Text>
              </View>
            ) : (
              <View>
                {reviewEligibilityError ? (
                  <Text style={styles.reviewEligibilityText}>
                    {reviewEligibilityError}
                  </Text>
                ) : (
                  <>
                    <View style={styles.reviewSummaryRow}>
                      {[1, 2, 3, 4, 5].map(star => (
                        <TouchableOpacity
                          key={star}
                          activeOpacity={0.8}
                          onPress={() => setReviewRating(star)}
                          hitSlop={8}
                        >
                          <Text
                            style={[
                              styles.starText,
                              star <= reviewRating ? styles.starFilled : null,
                            ]}
                          >
                            {star <= reviewRating ? '★' : '☆'}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <TextInput
                      value={reviewText}
                      onChangeText={setReviewText}
                      placeholder="How was your experience?"
                      placeholderTextColor="#7B8D98"
                      multiline
                      maxLength={2000}
                      style={styles.reviewInput}
                      textAlignVertical="top"
                    />

                    {reviewError ? (
                      <Text style={styles.reviewError}>{reviewError}</Text>
                    ) : null}

                    <Pressable
                      disabled={!canSubmitReview}
                      onPress={() => {
                        void handleSubmitReview()
                      }}
                      style={[
                        styles.submitReviewButton,
                        !canSubmitReview && styles.submitReviewButtonDisabled,
                      ]}
                    >
                      <Text style={styles.submitReviewButtonText}>
                        {reviewSubmitting ? 'Submitting...' : 'Submit Review'}
                      </Text>
                    </Pressable>
                  </>
                )}
              </View>
            )}
          </View>
        )}

        <View style={styles.idCard}>
          <Text style={styles.idLabel}>BOOKING ID</Text>
          <Text selectable style={styles.idValue}>
            {booking.id}
          </Text>
        </View>

        <View style={styles.footerCard}>
          <Text style={styles.footerTitle}>This booking is closed</Text>
          <Text style={styles.footerText}>
            Live worker tracking, chat, OTP controls, cancellation and rescheduling are no longer available for this completed booking.
          </Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  container: {
    padding: 18,
    paddingBottom: 40,
    backgroundColor: '#F7FBFD',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingLogo: {
    width: 150,
    height: 52,
    marginBottom: 18,
  },
  loadingText: {
    marginTop: 12,
    color: '#6B7280',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },
  logo: {
    width: 125,
    height: 40,
  },
  brandLabel: {
    marginLeft: 10,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    color: '#0784FB',
  },
  heroCard: {
    padding: 20,
    borderRadius: 22,
    backgroundColor: '#0A3972',
  },
  completedMark: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0784FB',
  },
  completedMarkText: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  eyebrow: {
    marginTop: 18,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
    color: '#7EE7E0',
  },
  heroTitle: {
    marginTop: 6,
    fontSize: 27,
    lineHeight: 33,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  heroSubtitle: {
    marginTop: 7,
    fontSize: 13,
    lineHeight: 19,
    color: '#C9DDE7',
  },
  amountBlock: {
    marginTop: 22,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.16)',
  },
  amountLabel: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
    color: '#A9C2CF',
  },
  amountValue: {
    marginTop: 3,
    fontSize: 24,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  errorBox: {
    marginTop: 14,
    padding: 13,
    borderRadius: 14,
    backgroundColor: '#FFF1F0',
  },
  errorBoxTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#B42318',
  },
  errorBoxText: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 18,
    color: '#7C2D12',
  },
  card: {
    marginTop: 14,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#DFEAF0',
    backgroundColor: '#FFFFFF',
  },
  sectionTitle: {
    marginBottom: 7,
    fontSize: 16,
    fontWeight: '900',
    color: '#17354A',
  },
  infoRow: {
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: '#EDF2F5',
  },
  infoLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: '#91A1AA',
  },
  infoValue: {
    marginTop: 3,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    color: '#29465A',
  },
  reviewSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  starText: {
    fontSize: 30,
    marginRight: 4,
    color: '#D6DEE4',
  },
  starFilled: {
    color: '#F5B301',
  },
  reviewInput: {
    minHeight: 120,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DDE7ED',
    backgroundColor: '#F7FBFD',
    fontSize: 14,
    lineHeight: 20,
    color: '#17354A',
  },
  reviewText: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: '#29465A',
  },
  reviewTextMuted: {
    marginTop: 8,
    fontSize: 12,
    color: '#6B7F8D',
  },
  reviewSubmittedBadge: {
    marginTop: 12,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#EAF7EF',
    color: '#27734A',
    fontSize: 11,
    fontWeight: '800',
  },
  reviewEligibilityText: {
    fontSize: 12,
    lineHeight: 18,
    color: '#6B7F8D',
  },
  occurrenceEmptyText: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 18,
    color: '#6B7F8D',
  },
  occurrenceReviewCard: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#EDF2F5',
  },
  occurrenceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  occurrenceTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#29465A',
  },
  occurrenceStatus: {
    fontSize: 11,
    fontWeight: '800',
    color: '#27734A',
  },
  occurrenceActionButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#E8F7F7',
  },
  occurrenceActionButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#008A88',
  },
  reviewError: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 18,
    color: '#B42318',
  },
  submitReviewButton: {
    marginTop: 14,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#0784FB',
  },
  submitReviewButtonDisabled: {
    opacity: 0.45,
  },
  submitReviewButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  invoiceButton: {
    marginTop: 14,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#17354A',
  },
  invoiceButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  idCard: {
    marginTop: 14,
    padding: 15,
    borderRadius: 18,
    backgroundColor: '#EAF3F7',
  },
  idLabel: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
    color: '#6B7F8D',
  },
  idValue: {
    marginTop: 4,
    fontSize: 12,
    color: '#29465A',
  },
  footerCard: {
    marginTop: 14,
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#0A3972',
  },
  footerTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  footerText: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 17,
    color: '#C9DDE7',
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#17354A',
    textAlign: 'center',
  },
  errorText: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 19,
    color: '#6D8290',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    minHeight: 46,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: '#0784FB',
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
})
