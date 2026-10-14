#!/usr/bin/env python3
"""Guarded local patch for KvikStaff customer cancellation reporting.

Run from the repository root:
    python3 scripts/fix_customer_cancellation_reporting.py

The script edits only customer cancellation screens/service and one Jest test.
It does not run database commands or deploy anything.
"""
from pathlib import Path

ROOT = Path.cwd()
REPLACEMENTS = {
    "customer-app/services/booking/bookingCancellation.service.ts": [
        (
            "export async function cancelCustomerBooking(\n",
            """export function requireConfirmedCancellation(
  result: CustomerCancellationResult,
): CustomerCancellationResult {
  if (result.success !== true || result.status !== 'cancelled') {
    throw new Error(
      'The server did not confirm the cancellation. Refresh and check the booking status before trying again.',
    )
  }

  return result
}

export async function cancelCustomerBooking(
""",
            1,
        ),
    ],
    "customer-app/screens/bookings/ActiveBookingScreen.tsx": [
        (
            """import {
  cancelCustomerBooking,
  getCustomerBookingRefunds,
  type CustomerRefundRecord,
} from '../../services/booking/bookingCancellation.service'""",
            """import {
  cancelCustomerBooking,
  getCustomerBookingRefunds,
  requireConfirmedCancellation,
  type CustomerRefundRecord,
} from '../../services/booking/bookingCancellation.service'""",
            1,
        ),
        (
            "    async function refresh() {\n",
            "    async function refresh(suppressError = false) {\n",
            1,
        ),
        (
            "      bookingStatusRef.current = nextBooking.status\n\nsetBooking(nextBooking)\n\n            if (nextBooking.status === 'cancelled') {",
            """      if (
        bookingStatusRef.current === 'cancelled' &&
        nextBooking.status !== 'cancelled'
      ) {
        console.warn('Ignoring a stale booking response after cancellation.')
        return
      }

      bookingStatusRef.current = nextBooking.status
      setBooking(nextBooking)

      if (nextBooking.status === 'cancelled') {""",
            1,
        ),

        (
            """    } catch (
      nextError
    ) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Unable to load booking.',
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()""",
            """    } catch (
      nextError
    ) {
      if (suppressError || bookingStatusRef.current === 'cancelled') {
        console.warn(
          'Booking details could not be refreshed after cancellation:',
          nextError,
        )
      } else {
        setError(
          nextError instanceof Error
            ? nextError.message
            : 'Unable to load booking.',
        )
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()""",
            1,
        ),
        (
            """                const cancellationResult =
                  await cancelCustomerBooking(
                    currentBooking.id,
                    currentBooking.booking_type,
                  )

                setOtp(null)

                await refresh()""",
            """                const cancellationResult =
                  requireConfirmedCancellation(
                    await cancelCustomerBooking(
                      currentBooking.id,
                      currentBooking.booking_type,
                    ),
                  )

                // The cancellation API confirmed the terminal state. Reflect it
                // immediately so a secondary detail-refresh failure cannot make
                // a successful cancellation look like a failed operation.
                bookingStatusRef.current = 'cancelled'
                setBooking(current =>
                  current
                    ? { ...current, status: 'cancelled' }
                    : current,
                )
                setOtp(null)
                setOtpType(null)
                setOtpLoadingType(null)
                setError(null)

                // Treat this as a best-effort refresh after cancellation.
                void refresh(true)""",
            1,
        ),
    ],
    "customer-app/screens/bookings/RecurringBookingScreen.tsx": [
        (
            """import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'""",
            """import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'""",
            1,
        ),
        (
            """export default function RecurringBookingScreen({
  bookingId,
}: RecurringBookingScreenProps) {
  const [
    booking,
    setBooking,
  ] =
    useState<CustomerBooking | null>(
      null,
    )""",
            """export default function RecurringBookingScreen({
  bookingId,
}: RecurringBookingScreenProps) {
  const cancellationConfirmedBookingIdRef = useRef<string | null>(null)

  const [
    booking,
    setBooking,
  ] =
    useState<CustomerBooking | null>(
      null,
    )""",
            1,
        ),
        (
            """import {
  cancelCustomerBooking,
} from '../../services/booking/bookingCancellation.service'""",
            """import {
  cancelCustomerBooking,
  requireConfirmedCancellation,
} from '../../services/booking/bookingCancellation.service'""",
            1,
        ),
        (
            """      async (
        isRefresh = false,
      ) => {""",
            """      async (
        isRefresh = false,
        suppressError = false,
      ) => {""",
            1,
        ),
        (
            """          setBooking(
            nextBooking,
          )

          setOccurrences(
            nextOccurrences,
          )""",
            """          if (
            cancellationConfirmedBookingIdRef.current === bookingId &&
            nextBooking.status !== 'cancelled'
          ) {
            console.warn('Ignoring a stale recurring booking response after cancellation.')
            return
          }

          setBooking(
            nextBooking,
          )

          setOccurrences(
            nextOccurrences,
          )""",
            1,
        ),

        (
            """        } catch (
          cause
        ) {
          setError(
            cause instanceof Error
              ? cause.message
              : 'Unable to load recurring booking.',
          )
        } finally {
          setLoading(false)""",
            """        } catch (
          cause
        ) {
          if (
            suppressError ||
            cancellationConfirmedBookingIdRef.current === bookingId
          ) {
            console.warn(
              'Recurring booking details could not be refreshed after cancellation:',
              cause,
            )
          } else {
            setError(
              cause instanceof Error
                ? cause.message
                : 'Unable to load recurring booking.',
            )
          }
        } finally {
          setLoading(false)""",
            1,
        ),
        (
            """                await cancelCustomerBooking(
                  bookingId,
                  'recurring',
                )

                await loadData(
                  true,
                )""",
            """                const cancellationResult =
                  requireConfirmedCancellation(
                    await cancelCustomerBooking(
                      bookingId,
                      'recurring',
                    ),
                  )
                cancellationConfirmedBookingIdRef.current = bookingId

                // The server confirmed series cancellation. Update the visible
                // state before refreshing nonessential booking details.
                setBooking(current =>
                  current
                    ? { ...current, status: 'cancelled' }
                    : current,
                )
                setOccurrences(current =>
                  current.map(occurrence =>
                    occurrence.status === 'completed' ||
                    occurrence.status === 'cancelled'
                      ? occurrence
                      : {
                          ...occurrence,
                          status: 'cancelled',
                          worker_id: null,
                        },
                  ),
                )
                setActiveOccurrence(null)
                setOtp(null)
                setOtpType(null)
                setError(null)

                const refundAmount = Number(
                  cancellationResult.refund_amount ??
                    0,
                )
                Alert.alert(
                  'Recurring booking cancelled',
                  refundAmount > 0
                    ? `A refund of ₹${refundAmount.toFixed(2)} has been initiated. You can track its status separately.`
                    : 'The recurring booking has been cancelled. No refund is due under the cancellation policy.',
                )

                // A failed read after a successful cancel must not be reported
                // as if the cancellation itself failed.
                await loadData(true, true)""",
            1,
        ),
    ],
}

TEST_FILE = Path("customer-app/services/booking/bookingCancellation.service.test.ts")
TEST_CONTENT = """jest.mock('../../lib/api', () => ({ apiRequest: jest.fn() }))

import {
  requireConfirmedCancellation,
  type CustomerCancellationResult,
} from './bookingCancellation.service'

describe('bookingCancellation.service', () => {
  describe('requireConfirmedCancellation', () => {
    it('accepts a server-confirmed cancellation', () => {
      const result: CustomerCancellationResult = {
        success: true,
        booking_id: 'booking-1',
        status: 'cancelled',
        refund_amount: 0,
      }

      expect(requireConfirmedCancellation(result)).toBe(result)
    })

    it('rejects a response that does not confirm cancellation', () => {
      expect(() =>
        requireConfirmedCancellation({
          success: false,
          status: 'pending',
        }),
      ).toThrow('The server did not confirm the cancellation.')
    })

    it('rejects a success-shaped response without the cancelled status', () => {
      expect(() =>
        requireConfirmedCancellation({
          success: true,
          status: 'pending',
        }),
      ).toThrow('The server did not confirm the cancellation.')
    })
  })
})
"""

def stop(message: str) -> None:
    raise SystemExit(f"STOP: {message}\nNo files were written.")

prepared = {}
for filename, rules in REPLACEMENTS.items():
    path = ROOT / filename
    if not path.is_file():
        stop(f"Expected file not found: {filename}")
    updated = path.read_text(encoding="utf-8")
    for old, new, expected in rules:
        actual = updated.count(old)
        if actual != expected:
            stop(
                f"{filename}: expected {expected} occurrence(s) of a known anchor, "
                f"found {actual}. The source may differ from the reviewed version."
            )
        updated = updated.replace(old, new)
    prepared[path] = updated

test_path = ROOT / TEST_FILE
if test_path.exists():
    stop(f"Test file already exists: {TEST_FILE}; inspect it before applying this patch.")

if "bookingStatusRef.current = 'cancelled'" not in prepared[ROOT / "customer-app/screens/bookings/ActiveBookingScreen.tsx"]:
    stop("Active-booking cancellation guard was not prepared.")
if "await loadData(true, true)" not in prepared[ROOT / "customer-app/screens/bookings/RecurringBookingScreen.tsx"]:
    stop("Recurring cancellation refresh guard was not prepared.")

# All anchors have been checked before any writes are made.
for path, content in prepared.items():
    path.write_text(content, encoding="utf-8")
    print(f"Patched {path.relative_to(ROOT)}")
test_path.write_text(TEST_CONTENT, encoding="utf-8")
print(f"Created {TEST_FILE}")
print("Patch applied. No database migrations or production deployments were run.")
