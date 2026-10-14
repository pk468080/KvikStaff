#!/usr/bin/env python3
"""Guarded patch for KvikStaff completed-booking, home-content, and review-prompt bugs.

Run from the KvikStaff repository root. It validates all target anchors before writing
any files and does not access or modify the live database.
"""
from pathlib import Path

ROOT = Path.cwd()


def read_repo_file(relative: str) -> tuple[Path, str]:
    path = ROOT / relative
    if not path.is_file():
        raise SystemExit(f"STOP: required file not found: {relative}")
    return path, path.read_text(encoding="utf-8")


def replace_exact(text: str, old: str, new: str, count: int, label: str) -> str:
    actual = text.count(old)
    if actual != count:
        raise SystemExit(
            f"STOP: {label}: expected {count} occurrence(s), found {actual}.\n"
            "No files were written. Make sure your local main branch is up to date."
        )
    return text.replace(old, new)


patches: dict[str, list[tuple[str, str, int, str]]] = {
    "backend/app/modules/reviews/repository.py": [
        (
            "(:occurrence_id IS NULL AND r.occurrence_id IS NULL)",
            "(CAST(:occurrence_id AS uuid) IS NULL AND r.occurrence_id IS NULL)",
            1,
            "Type nullable occurrence UUID in review lookup",
        ),
        (
            "r.occurrence_id = :occurrence_id",
            "r.occurrence_id = CAST(:occurrence_id AS uuid)",
            1,
            "Type occurrence UUID comparison in review lookup",
        ),
    ],
    "backend/app/modules/home/schemas.py": [
        (
            "from uuid import UUID\n",
            "from datetime import datetime\nfrom uuid import UUID\n",
            1,
            "Import datetime for home rebook response schema",
        ),
        (
            "    created_at: str\n",
            "    created_at: datetime\n",
            1,
            "Match rebook created_at schema to database datetime",
        ),
        (
            "    scheduled_start: str | None",
            "    scheduled_start: datetime | None",
            1,
            "Match rebook scheduled_start schema to database datetime",
        ),
    ],
    "customer-app/screens/bookings/CustomerBookingRouter.tsx": [],
    "customer-app/screens/bookings/CompletedBookingScreen.tsx": [],
}

prepared: dict[Path, str] = {}
originals: dict[Path, str] = {}
for relative, rules in patches.items():
    path, original = read_repo_file(relative)
    updated = original
    for old, new, expected, label in rules:
        updated = replace_exact(updated, old, new, expected, f"{relative}: {label}")
    originals[path] = original
    prepared[path] = updated

# CustomerBookingRouter: re-evaluate route when the booking or a recurring occurrence changes.
router_path = ROOT / "customer-app/screens/bookings/CustomerBookingRouter.tsx"
router = prepared[router_path]
router = replace_exact(
    router,
    "import {\n  useEffect,\n  useState,\n} from 'react'\n",
    "import {\n  useEffect,\n  useState,\n} from 'react'\n\nimport {\n  supabase,\n} from '../../lib/supabase'\n",
    1,
    "customer-app/screens/bookings/CustomerBookingRouter.tsx: import Supabase realtime client",
)
old_router_effect = """  useEffect(() => {
    let mounted = true

    async function load() {
      try {
        setLoading(true)
        setError(null)
        setBookingView(null)

        const booking = await getCustomerBooking(bookingId)

        if (!mounted) {
          return
        }

        if (booking.status === 'completed') {
          setBookingView('completed')
          return
        }

        if (booking.booking_type === 'recurring') {
          const occurrences = await getCustomerBookingOccurrences(bookingId)

          if (!mounted) {
            return
          }

          const seriesCompleted =
            occurrences.length > 0 &&
            occurrences.every(occurrence => occurrence.status === 'completed')

          setBookingView(seriesCompleted ? 'completed' : 'recurring')
          return
        }

        setBookingView('active')
      } catch (cause) {
        if (!mounted) {
          return
        }

        setError(
          cause instanceof Error
            ? cause.message
            : 'Unable to load booking.',
        )
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      mounted = false
    }
  }, [bookingId])"""
new_router_effect = """  useEffect(() => {
    let mounted = true
    let requestVersion = 0
    let hasResolvedInitialLoad = false

    async function load(isInitial = false) {
      const currentRequestVersion = ++requestVersion

      if (isInitial) {
        setLoading(true)
        setError(null)
        setBookingView(null)
      }

      try {
        const booking = await getCustomerBooking(bookingId)

        if (!mounted || currentRequestVersion !== requestVersion) {
          return
        }

        if (booking.status === 'completed') {
          setBookingView('completed')
          return
        }

        if (booking.booking_type === 'recurring') {
          const occurrences = await getCustomerBookingOccurrences(bookingId)

          if (!mounted || currentRequestVersion !== requestVersion) {
            return
          }

          const seriesCompleted =
            occurrences.length > 0 &&
            occurrences.every(occurrence => occurrence.status === 'completed')

          setBookingView(seriesCompleted ? 'completed' : 'recurring')
          return
        }

        setBookingView('active')
        setError(null)
      } catch (cause) {
        if (!mounted || currentRequestVersion !== requestVersion) {
          return
        }

        if (isInitial || !hasResolvedInitialLoad) {
          setError(
            cause instanceof Error
              ? cause.message
              : 'Unable to load booking.',
          )
        } else {
          console.warn('Unable to refresh customer booking state:', cause)
        }
      } finally {
        if (mounted && currentRequestVersion === requestVersion) {
          hasResolvedInitialLoad = true
          setLoading(false)
        }
      }
    }

    void load(true)

    const channel = supabase
      .channel(`customer-booking-router-${bookingId}-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'bookings',
          filter: `id=eq.${bookingId}`,
        },
        () => {
          if (hasResolvedInitialLoad) {
            void load(false)
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'booking_schedule_occurrences',
          filter: `booking_id=eq.${bookingId}`,
        },
        () => {
          if (hasResolvedInitialLoad) {
            void load(false)
          }
        },
      )
      .subscribe()

    return () => {
      mounted = false
      requestVersion += 1
      void supabase.removeChannel(channel)
    }
  }, [bookingId])"""
router = replace_exact(
    router,
    old_router_effect,
    new_router_effect,
    1,
    "customer-app/screens/bookings/CustomerBookingRouter.tsx: refresh booking route on completion",
)
prepared[router_path] = router

# CompletedBookingScreen: implement an actual first-visit review modal, including instant bookings.
completed_path = ROOT / "customer-app/screens/bookings/CompletedBookingScreen.tsx"
completed = prepared[completed_path]
completed = replace_exact(
    completed,
    "import {\n  useCallback,\n  useEffect,\n  useState,\n} from 'react'\n",
    "import {\n  useCallback,\n  useEffect,\n  useRef,\n  useState,\n} from 'react'\n",
    1,
    "customer-app/screens/bookings/CompletedBookingScreen.tsx: import useRef",
)
completed = replace_exact(
    completed,
    "import {\n  ActivityIndicator,\n  Alert,\n  Image,\n  Pressable,\n  RefreshControl,\n  ScrollView,\n  StyleSheet,\n  Text,\n  TextInput,\n  TouchableOpacity,\n  View,\n} from 'react-native'\n",
    "import {\n  ActivityIndicator,\n  Alert,\n  Image,\n  Modal,\n  Pressable,\n  RefreshControl,\n  ScrollView,\n  StyleSheet,\n  Text,\n  TextInput,\n  TouchableOpacity,\n  View,\n} from 'react-native'\n",
    1,
    "customer-app/screens/bookings/CompletedBookingScreen.tsx: import Modal",
)
completed = replace_exact(
    completed,
    """  const [occurrenceReviews, setOccurrenceReviews] = useState<
    Record<string, CustomerReview | null>
  >({})
""",
    """  const [occurrenceReviews, setOccurrenceReviews] = useState<
    Record<string, CustomerReview | null>
  >({})
  const [reviewPromptVisible, setReviewPromptVisible] = useState(false)
  const reviewPromptDismissedRef = useRef(false)
""",
    1,
    "customer-app/screens/bookings/CompletedBookingScreen.tsx: review modal state",
)
completed = replace_exact(
    completed,
    """          setReviewableOccurrences(
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
""",
    """          const firstUnreviewedOccurrence = nextOccurrences.find(
            occurrence =>
              Boolean(occurrence.worker_id) &&
              !nextOccurrenceReviews[occurrence.id],
          )

          setReviewableOccurrences(nextOccurrences)
          setOccurrenceReviews(nextOccurrenceReviews)
          setReview(null)
          setReviewOccurrenceId(firstUnreviewedOccurrence?.id ?? null)
          setReviewWorkerId(firstUnreviewedOccurrence?.worker_id ?? null)
          setReviewText('')
          setReviewRating(5)
          setReviewPromptVisible(
            Boolean(firstUnreviewedOccurrence) &&
              !reviewPromptDismissedRef.current,
          )
""",
    1,
    "customer-app/screens/bookings/CompletedBookingScreen.tsx: select first unreviewed occurrence",
)
completed = replace_exact(
    completed,
    """          setReviewableOccurrences([])
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
""",
    """          const resolvedReviewWorkerId =
            nextReviewMeta.workerId ?? nextBooking.worker_id ?? null

          setReviewableOccurrences([])
          setOccurrenceReviews({})
          setReview(nextReview)
          setReviewOccurrenceId(nextReviewMeta.occurrenceId)
          // Instant bookings don't have a schedule-occurrence row; use the booking worker.
          setReviewWorkerId(resolvedReviewWorkerId)
          setReviewText(nextReview?.comment ?? '')
          setReviewRating(nextReview?.rating ?? 5)
          setReviewPromptVisible(
            !nextReview &&
              Boolean(resolvedReviewWorkerId) &&
              !reviewPromptDismissedRef.current,
          )
""",
    1,
    "customer-app/screens/bookings/CompletedBookingScreen.tsx: fallback to booking worker for reviews",
)
completed = replace_exact(
    completed,
    """  useEffect(() => {
    void loadBooking()
  }, [loadBooking])
""",
    """  useEffect(() => {
    reviewPromptDismissedRef.current = false
    setReviewPromptVisible(false)
  }, [bookingId])

  useEffect(() => {
    void loadBooking()
  }, [loadBooking])
""",
    1,
    "customer-app/screens/bookings/CompletedBookingScreen.tsx: reset prompt for a new booking",
)
completed = replace_exact(
    completed,
    """      setReview(nextReview)
      setReviewText(nextReview.comment ?? '')
      setReviewRating(nextReview.rating)
      Alert.alert(
""",
    """      setReview(nextReview)
      setReviewText(nextReview.comment ?? '')
      setReviewRating(nextReview.rating)
      setReviewPromptVisible(false)
      reviewPromptDismissedRef.current = true
      Alert.alert(
""",
    1,
    "customer-app/screens/bookings/CompletedBookingScreen.tsx: close prompt after successful review",
)
modal_markup = """      <Modal
        visible={reviewPromptVisible && !review}
        transparent
        animationType="fade"
        onRequestClose={() => {
          reviewPromptDismissedRef.current = true
          setReviewPromptVisible(false)
        }}
      >
        <View style={styles.reviewModalOverlay}>
          <View style={styles.reviewModalCard}>
            <Text style={styles.reviewModalEyebrow}>KVIKSTAFF · SERVICE FEEDBACK</Text>
            <Text style={styles.reviewModalTitle}>How was your service?</Text>
            <Text style={styles.reviewModalSubtitle}>
              {booking.booking_type === 'recurring' && reviewOccurrenceId
                ? `Rate completed occurrence ${(reviewableOccurrences.find(item => item.id === reviewOccurrenceId)?.occurrence_index ?? 0) + 1}.`
                : 'Rate your completed booking and share your experience.'}
            </Text>

            <View style={styles.reviewSummaryRow}>
              {[1, 2, 3, 4, 5].map(star => (
                <TouchableOpacity
                  key={star}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={`${star} star${star === 1 ? '' : 's'}`}
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
              placeholder="How was your experience? (optional)"
              placeholderTextColor="#7B8D98"
              multiline
              maxLength={2000}
              style={styles.reviewInput}
              textAlignVertical="top"
            />

            {reviewError ? (
              <Text style={styles.reviewError}>{reviewError}</Text>
            ) : null}

            <View style={styles.reviewModalActions}>
              <Pressable
                onPress={() => {
                  reviewPromptDismissedRef.current = true
                  setReviewPromptVisible(false)
                }}
                style={styles.reviewModalLaterButton}
              >
                <Text style={styles.reviewModalLaterButtonText}>Later</Text>
              </Pressable>
              <Pressable
                disabled={!canSubmitReview}
                onPress={() => {
                  void handleSubmitReview()
                }}
                style={[
                  styles.reviewModalSubmitButton,
                  !canSubmitReview && styles.reviewModalSubmitButtonDisabled,
                ]}
              >
                <Text style={styles.reviewModalSubmitButtonText}>
                  {reviewSubmitting ? 'Submitting...' : 'Submit review'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
"""
completed = replace_exact(
    completed,
    """      </ScrollView>
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  container: {
""",
    """      </ScrollView>
""" + modal_markup + """    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  reviewModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 22,
    backgroundColor: 'rgba(4, 24, 42, 0.62)',
  },
  reviewModalCard: {
    width: '100%',
    maxWidth: 480,
    padding: 22,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
  },
  reviewModalEyebrow: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    color: '#0784FB',
  },
  reviewModalTitle: {
    marginTop: 8,
    fontSize: 23,
    lineHeight: 29,
    fontWeight: '900',
    color: '#0A3972',
  },
  reviewModalSubtitle: {
    marginTop: 8,
    marginBottom: 18,
    fontSize: 13,
    lineHeight: 19,
    color: '#607789',
  },
  reviewModalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  reviewModalLaterButton: {
    flex: 1,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D9E6ED',
    backgroundColor: '#FFFFFF',
  },
  reviewModalLaterButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#36546A',
  },
  reviewModalSubmitButton: {
    flex: 1.2,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#0784FB',
  },
  reviewModalSubmitButtonDisabled: {
    opacity: 0.5,
  },
  reviewModalSubmitButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  container: {
""",
    1,
    "customer-app/screens/bookings/CompletedBookingScreen.tsx: add review modal UI and styles",
)
prepared[completed_path] = completed

# Ensure every source file is still based on the exact original contents, then write all at once.
# All replacements above are guarded; this also avoids overwriting a file changed mid-run.
for path, original in originals.items():
    if path.read_text(encoding="utf-8") != original:
        raise SystemExit(f"STOP: {path.relative_to(ROOT)} changed while patch was being prepared. No files written.")

for path, updated in prepared.items():
    path.write_text(updated, encoding="utf-8")
    print(f"Patched {path.relative_to(ROOT)}")

print("Patch applied. No database migrations or production deployments were run.")
