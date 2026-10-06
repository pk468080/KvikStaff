import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import { useEffect, useState } from 'react'
import RazorpayCheckout from 'react-native-razorpay'

import { ScreenContainer } from '../../components/layout/ScreenContainer'

import {
  createRazorpayOrder,
  getBookingPaymentDetails,
  verifyRazorpayPayment,
  type BookingPaymentDetails,
  type RazorpayOrder,
} from '../../services/payment/razorpay.service'

type PaymentScreenProps = {
  bookingId: string
  finalAmount: number
  currency: string
  occurrenceCount: number
  totalWorkingHours: number
  onPaid: () => void
}

function formatMoney(amount: number, currency: string) {
  return `${currency} ${amount.toFixed(2)}`
}

export default function PaymentScreen({
  bookingId,
  finalAmount: navigationAmount,
  currency: navigationCurrency,
  occurrenceCount: navigationOccurrenceCount,
  totalWorkingHours: navigationTotalWorkingHours,
  onPaid,
}: PaymentScreenProps) {
  const [details, setDetails] =
    useState<BookingPaymentDetails | null>(null)

  const [processing, setProcessing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadPaymentDetails() {
      setLoading(true)
      setError(null)

      try {
        const authoritative =
          await getBookingPaymentDetails(bookingId)

        if (cancelled) {
          return
        }

        setDetails(authoritative)
      } catch (loadError) {
        if (cancelled) {
          return
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : 'Unable to load the booking payment details.',
        )
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadPaymentDetails()

    return () => {
      cancelled = true
    }
  }, [bookingId])

  async function handlePayment() {
    if (processing || loading || !details) {
      return
    }

    setProcessing(true)
    setError(null)

    try {
      let order: RazorpayOrder

      order = await createRazorpayOrder(
        bookingId,
        details.amount,
        details.currency,
      )

      /*
       * The backend discovered that this payment was
       * already captured and finalized.
       *
       * Never launch Checkout a second time.
       */
      if (order.alreadyPaid) {
        onPaid()
        return
      }

      if (order.paymentPending) {
        Alert.alert(
          'Payment is being confirmed',
          'This payment is still being processed by Razorpay. Please do not make another payment.',
        )
        return
      }

      if (
        !order.keyId ||
        !order.orderId ||
        !Number.isFinite(order.amount) ||
        order.amount <= 0 ||
        !order.currency
      ) {
        throw new Error(
          'The payment order returned by the server is invalid.',
        )
      }

      let checkout

      try {
        checkout = await RazorpayCheckout.open({
          key: order.keyId,
          amount: order.amount,
          currency: order.currency,
          order_id: order.orderId,
          name: 'KvikStaff',
          description: 'KvikStaff booking',
        })
      } catch (checkoutError) {
        /*
         * Do not mark the booking payment_failed here.
         *
         * Razorpay may have accepted/captured the payment even
         * when the mobile checkout callback is interrupted.
         * The backend/webhook reconciliation remains authoritative.
         */
        throw checkoutError
      }

      /*
       * Verification and finalization are server-side.
       */
      const verification = await verifyRazorpayPayment(
        bookingId,
        checkout,
      )

      if (verification.paymentPending) {
        Alert.alert(
          'Payment authorized',
          'Razorpay has authorized your payment and is completing the capture. Please do not make another payment. Your booking will be confirmed after capture.',
        )
        return
      }

      onPaid()
    } catch (paymentError) {
      const message =
        paymentError instanceof Error
          ? paymentError.message
          : 'Payment was not completed.'

      setError(message)

      Alert.alert(
        'Payment not completed',
        message,
      )
    } finally {
      setProcessing(false)
    }
  }

  /*
   * The navigation values are retained only as a temporary
   * display fallback before authoritative booking data loads.
   *
   * Payment cannot be initiated until details are loaded.
   */
  const amount = details?.amount ?? navigationAmount
  const displayCurrency =
    details?.currency ?? navigationCurrency

  const occurrenceCount =
    details?.occurrenceCount ?? navigationOccurrenceCount

  const totalWorkingHours =
    details?.totalWorkingHours ?? navigationTotalWorkingHours

  return (
    <ScreenContainer>
      <View style={styles.screen}>
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <Image
              source={require('../../assets/branding/tempstuff-logo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
            <View style={styles.headerCopy}>
              <Text style={styles.headerTitle}>Secure payment</Text>
              <Text style={styles.headerSubtitle}>
                Complete your KvikStaff booking
              </Text>
            </View>
          </View>

          <View style={styles.progressRow}>
            <ProgressStep label="Review" complete />
            <View style={styles.progressLine} />
            <ProgressStep label="Payment" active />
            <View style={styles.progressLineMuted} />
            <ProgressStep label="Confirmed" />
          </View>
        </View>

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heroCard}>
            <View style={styles.heroIcon}>
              <Text style={styles.heroIconText}>₹</Text>
            </View>

            <View style={styles.heroCopy}>
              <Text style={styles.eyebrow}>PAYMENT</Text>

              <Text style={styles.heroTitle}>
                Ready to pay
              </Text>

              <Text style={styles.heroSubtitle}>
                Your payable amount is calculated from the booking
                data stored on the server.
              </Text>
            </View>
          </View>

          <View style={styles.amountCard}>
            <Text style={styles.amountLabel}>
              Amount payable
            </Text>

            {loading ? (
              <ActivityIndicator
                style={styles.amountLoader}
                color="#0784FB"
              />
            ) : (
              <Text style={styles.amount}>
                {formatMoney(
                  amount,
                  displayCurrency,
                )}
              </Text>
            )}

            <View style={styles.divider} />

            <SummaryRow
              label="Occurrences"
              value={String(occurrenceCount)}
            />

            <SummaryRow
              label="Working hours"
              value={String(totalWorkingHours)}
            />

            <SummaryRow
              label="Booking ID"
              value={bookingId}
            />
          </View>

          <View style={styles.securityCard}>
            <View style={styles.securityBadge}>
              <Text style={styles.securityBadgeText}>
                ✓
              </Text>
            </View>

            <View style={styles.securityCopy}>
              <Text style={styles.securityTitle}>
                Secure Razorpay checkout
              </Text>

              <Text style={styles.securityText}>
                Payment is processed through Razorpay. KvikStaff does
                not treat the mobile screen as the final payment authority.
              </Text>
            </View>
          </View>

          {error ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorTitle}>
                Payment issue
              </Text>

              <Text style={styles.errorText}>
                {error}
              </Text>
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            style={[
              styles.payButton,
              (processing ||
                loading ||
                !details) &&
                styles.disabledButton,
            ]}
            disabled={
              processing ||
              loading ||
              !details
            }
            onPress={() =>
              void handlePayment()
            }
          >
            {processing ? (
              <View style={styles.processingRow}>
                <ActivityIndicator color="#FFFFFF" />

                <Text style={styles.payButtonText}>
                  Processing securely...
                </Text>
              </View>
            ) : (
              <Text style={styles.payButtonText}>
                Pay{' '}
                {loading
                  ? ''
                  : formatMoney(
                      amount,
                      displayCurrency,
                    )}
              </Text>
            )}
          </Pressable>

          <Text style={styles.footerNote}>
            Do not close the payment flow while your payment is being
            processed.
          </Text>
        </View>
      </View>
    </ScreenContainer>
  )
}

function ProgressStep({
  label,
  active = false,
  complete = false,
}: {
  label: string
  active?: boolean
  complete?: boolean
}) {
  return (
    <View style={styles.progressStep}>
      <View
        style={[
          styles.progressDot,
          active &&
            styles.progressDotActive,
          complete &&
            styles.progressDotComplete,
        ]}
      >
        <Text
          style={[
            styles.progressDotText,
            (active || complete) &&
              styles.progressDotTextActive,
          ]}
        >
          {complete
            ? '✓'
            : active
              ? '2'
              : '3'}
        </Text>
      </View>

      <Text
        style={[
          styles.progressLabel,
          active &&
            styles.progressLabelActive,
        ]}
      >
        {label}
      </Text>
    </View>
  )
}

function SummaryRow({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>
        {label}
      </Text>

      <Text style={styles.rowValue}>
        {value}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F5FAFD',
  },

  header: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#DCEAF2',
  },

  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  logo: {
    width: 54,
    height: 42,
  },

  headerCopy: {
    flex: 1,
    marginLeft: 10,
  },

  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0A3972',
  },

  headerSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: '#61798A',
  },

  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
  },

  progressStep: {
    alignItems: 'center',
    minWidth: 64,
  },

  progressDot: {
    width: 25,
    height: 25,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E7EFF4',
  },

  progressDotActive: {
    backgroundColor: '#0784FB',
  },

  progressDotComplete: {
    backgroundColor: '#0A3972',
  },

  progressDotText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6B8292',
  },

  progressDotTextActive: {
    color: '#FFFFFF',
  },

  progressLabel: {
    marginTop: 5,
    fontSize: 10,
    fontWeight: '600',
    color: '#708493',
  },

  progressLabelActive: {
    color: '#0784FB',
    fontWeight: '800',
  },

  progressLine: {
    flex: 1,
    height: 2,
    marginHorizontal: 3,
    backgroundColor: '#0A3972',
  },

  progressLineMuted: {
    flex: 1,
    height: 2,
    marginHorizontal: 3,
    backgroundColor: '#DDE9EF',
  },

  content: {
    flex: 1,
  },

  contentContainer: {
    flexGrow: 1,
    padding: 20,
    paddingBottom: 28,
  },

  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    borderRadius: 20,
    backgroundColor: '#0A3972',
  },

  heroIcon: {
    width: 50,
    height: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0784FB',
  },

  heroIconText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
  },

  heroCopy: {
    flex: 1,
    marginLeft: 14,
  },

  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: '#78E2E0',
  },

  heroTitle: {
    marginTop: 3,
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  heroSubtitle: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
    color: '#D9EAF3',
  },

  amountCard: {
    marginTop: 14,
    padding: 20,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DCEAF2',
  },

  amountLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#61798A',
  },

  amount: {
    marginTop: 7,
    fontSize: 32,
    fontWeight: '900',
    color: '#0A3972',
  },

  amountLoader: {
    marginTop: 18,
    alignSelf: 'flex-start',
  },

  divider: {
    height: 1,
    backgroundColor: '#E3EDF2',
    marginVertical: 16,
  },

  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
    paddingVertical: 6,
  },

  rowLabel: {
    color: '#718594',
    fontSize: 13,
  },

  rowValue: {
    flex: 1,
    textAlign: 'right',
    fontSize: 13,
    fontWeight: '700',
    color: '#173B52',
  },

  securityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    padding: 15,
    borderRadius: 18,
    backgroundColor: '#EAF8F7',
    borderWidth: 1,
    borderColor: '#C7E9E6',
  },

  securityBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0784FB',
  },

  securityBadgeText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
  },

  securityCopy: {
    flex: 1,
    marginLeft: 11,
  },

  securityTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0A3972',
  },

  securityText: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 16,
    color: '#4F6B7B',
  },

  errorCard: {
    marginTop: 14,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#FFF4F2',
    borderWidth: 1,
    borderColor: '#F2C8C1',
  },

  errorTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#A33A2B',
  },

  errorText: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
    color: '#7E4038',
  },

  footer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#DCEAF2',
  },

  payButton: {
    minHeight: 54,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0784FB',
  },

  disabledButton: {
    opacity: 0.55,
  },

  processingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  payButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 16,
  },

  footerNote: {
    marginTop: 8,
    textAlign: 'center',
    fontSize: 10,
    lineHeight: 14,
    color: '#718594',
  },
})