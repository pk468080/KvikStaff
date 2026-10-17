import {
  useCallback,
  useRef,
  useState,
} from 'react'
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import RazorpayCheckout from 'react-native-razorpay'

import { ScreenContainer } from '../../components/layout/ScreenContainer'
import { UI } from '../../constants/ui'
import { createIdempotencyKey } from '../../lib/api'
import {
  createWalletTopupOrder,
  getWalletSummary,
  getWalletTransactions,
  verifyWalletTopupPayment,
  type WalletSummary,
  type WalletTransaction,
} from '../../services/wallet/wallet.service'

const TOPUP_AMOUNTS = [100, 500, 1000, 2000]

type TopupAttempt = {
  amountPaise: number
  idempotencyKey: string
}

function formatMoney(amountPaise: number): string {
  return `₹${(amountPaise / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function transactionTitle(transactionType: string): string {
  switch (transactionType) {
    case 'topup':
      return 'Wallet top-up'
    case 'booking_payment':
      return 'Booking payment'
    case 'booking_refund':
      return 'Booking refund'
    case 'topup_refund':
      return 'Top-up refund'
    case 'admin_adjustment':
      return 'Wallet adjustment'
    default:
      return 'Wallet transaction'
  }
}

function transactionDate(value: string): string {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'Date unavailable'
  }

  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default function WalletScreen() {
  const [wallet, setWallet] = useState<WalletSummary | null>(null)
  const [transactions, setTransactions] = useState<WalletTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [selectedAmount, setSelectedAmount] = useState(500)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // Reuse the same key when retrying the same amount in this screen.
  // This helps avoid creating duplicate top-up intents on network retries.
  const topupAttemptRef = useRef<TopupAttempt | null>(null)

  const loadWallet = useCallback(
    async (showSpinner = true) => {
      if (showSpinner) {
        setLoading(true)
      }

      try {
        const [summary, history] = await Promise.all([
          getWalletSummary(),
          getWalletTransactions(20, 0),
        ])

        setWallet(summary)
        setTransactions(history.items)
      } catch (nextError) {
        setError(
          nextError instanceof Error
            ? nextError.message
            : 'Unable to load your wallet.',
        )
      } finally {
        if (showSpinner) {
          setLoading(false)
        }
      }
    },
    [],
  )

  useFocusEffect(
    useCallback(() => {
      void loadWallet()
    }, [loadWallet]),
  )

  async function handleRefresh() {
    setRefreshing(true)

    try {
      await loadWallet(false)
    } finally {
      setRefreshing(false)
    }
  }

  async function handleAddMoney() {
    if (processing) {
      return
    }

    if (wallet && wallet.status !== 'active') {
      setError('Your wallet is not active. Contact support for assistance.')
      return
    }

    const amountPaise = selectedAmount * 100
    const previousAttempt = topupAttemptRef.current

    const idempotencyKey =
      previousAttempt?.amountPaise === amountPaise
        ? previousAttempt.idempotencyKey
        : createIdempotencyKey('wallet-topup')

    topupAttemptRef.current = {
      amountPaise,
      idempotencyKey,
    }

    setProcessing(true)
    setError(null)
    setNotice(null)

    try {
      const order = await createWalletTopupOrder(
        amountPaise,
        idempotencyKey,
      )

      if (order.alreadyPaid) {
        topupAttemptRef.current = null
        await loadWallet(false)
        setNotice(
          'This top-up was already completed. Your wallet has been refreshed.',
        )
        return
      }

      if (
        !order.topupId ||
        !order.keyId ||
        !order.orderId ||
        order.amountPaise !== amountPaise ||
        order.currency !== 'INR'
      ) {
        throw new Error(
          'The server returned an invalid wallet payment order. Do not retry payment if you may have completed checkout.',
        )
      }

      const checkout = await RazorpayCheckout.open({
        key: order.keyId,
        amount: order.amountPaise,
        currency: order.currency,
        order_id: order.orderId,
        name: 'KvikStaff',
        description: 'Add money to your wallet',
      })

      const verification = await verifyWalletTopupPayment(
        order.topupId,
        checkout,
      )

      if (
        verification.success !== true ||
        verification.status !== 'succeeded'
      ) {
        throw new Error(
          'The payment has not been confirmed by the server. Do not make another payment until its status has been checked.',
        )
      }

      topupAttemptRef.current = null

      await loadWallet(false)

      setNotice(
        `Wallet top-up of ${formatMoney(amountPaise)} was confirmed.`,
      )
    } catch (nextError) {
      // A checkout or network error does not prove that Razorpay
      // failed to capture a payment. Keep the idempotency key.
      await loadWallet(false)

      const message =
        nextError instanceof Error
          ? nextError.message
          : 'The wallet payment could not be confirmed.'

      setError(
        `${message} If you completed checkout or the payment status is unclear, do not pay again yet. Refresh your wallet or contact support.`,
      )
    } finally {
      setProcessing(false)
    }
  }

  if (loading) {
    return (
      <ScreenContainer style={styles.screen}>
        <View style={styles.center}>
          <ActivityIndicator
            size="large"
            color={UI.colors.primaryBlue}
          />
          <Text style={styles.loadingText}>
            Loading your wallet...
          </Text>
        </View>
      </ScreenContainer>
    )
  }

  return (
    <ScreenContainer style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void handleRefresh()}
          />
        }
      >
        <View style={styles.intro}>
          <Text style={styles.eyebrow}>
            KVIKSTAFF PAYMENTS
          </Text>
          <Text style={styles.title}>
            My Wallet
          </Text>
          <Text style={styles.subtitle}>
            View your balance, add funds, and track wallet activity.
          </Text>
        </View>

        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>
            Available balance
          </Text>

          <Text style={styles.balance}>
            {wallet
              ? formatMoney(wallet.balancePaise)
              : 'Balance unavailable'}
          </Text>

          <Text style={styles.balanceFootnote}>
            {wallet?.currency ?? 'INR'} · Customer wallet
          </Text>
        </View>

        {error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>
              Wallet update
            </Text>
            <Text style={styles.errorText}>
              {error}
            </Text>
          </View>
        ) : null}

        {notice ? (
          <View style={styles.noticeCard}>
            <Text style={styles.noticeText}>
              {notice}
            </Text>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Add money
          </Text>

          <Text style={styles.helperText}>
            Select an amount between ₹100 and ₹50,000 per top-up.
          </Text>

          <View style={styles.amountGrid}>
            {TOPUP_AMOUNTS.map((amount) => {
              const selected = selectedAmount === amount

              return (
                <Pressable
                  key={amount}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  disabled={processing}
                  onPress={() => {
                    setSelectedAmount(amount)
                    setError(null)
                    setNotice(null)
                  }}
                  style={[
                    styles.amountOption,
                    selected && styles.amountOptionSelected,
                    processing && styles.disabled,
                  ]}
                >
                  <Text
                    style={[
                      styles.amountOptionText,
                      selected && styles.amountOptionTextSelected,
                    ]}
                  >
                    ₹{amount.toLocaleString('en-IN')}
                  </Text>
                </Pressable>
              )
            })}
          </View>

          <Pressable
            accessibilityRole="button"
            disabled={processing || !wallet || wallet.status !== 'active'}
            onPress={() => void handleAddMoney()}
            style={({ pressed }) => [
              styles.addButton,
              (processing ||
                !wallet ||
                wallet.status !== 'active') &&
                styles.disabled,
              pressed && !processing && styles.addButtonPressed,
            ]}
          >
            {processing ? (
              <View style={styles.processingRow}>
                <ActivityIndicator color="#FFFFFF" />
                <Text style={styles.addButtonText}>
                  Checking payment...
                </Text>
              </View>
            ) : (
              <Text style={styles.addButtonText}>
                Add {formatMoney(selectedAmount * 100)}
              </Text>
            )}
          </Pressable>

          <Text style={styles.testModeNote}>
            Wallet top-ups are restricted to Razorpay test-mode credentials
            during development. Do not use real money for development tests.
          </Text>
        </View>

        <View style={styles.section}>
          <View style={styles.historyHeader}>
            <Text style={styles.sectionTitle}>
              Recent activity
            </Text>
            <Text style={styles.historyCount}>
              {transactions.length} shown
            </Text>
          </View>

          {transactions.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>
                No wallet activity yet
              </Text>
              <Text style={styles.emptyText}>
                Your top-ups, booking payments, and refunds will appear here.
              </Text>
            </View>
          ) : (
            <View style={styles.historyCard}>
              {transactions.map((transaction, index) => {
                const isCredit = transaction.direction === 'credit'

                return (
                  <View
                    key={transaction.transactionId}
                    style={[
                      styles.transactionRow,
                      index < transactions.length - 1 &&
                        styles.transactionBorder,
                    ]}
                  >
                    <View
                      style={[
                        styles.transactionIcon,
                        isCredit
                          ? styles.creditIcon
                          : styles.debitIcon,
                      ]}
                    >
                      <Text
                        style={[
                          styles.transactionIconText,
                          isCredit
                            ? styles.creditText
                            : styles.debitText,
                        ]}
                      >
                        {isCredit ? '+' : '−'}
                      </Text>
                    </View>

                    <View style={styles.transactionCopy}>
                      <Text style={styles.transactionTitle}>
                        {transactionTitle(transaction.transactionType)}
                      </Text>
                      <Text style={styles.transactionDate}>
                        {transactionDate(transaction.createdAt)}
                      </Text>
                    </View>

                    <View style={styles.transactionAmountColumn}>
                      <Text
                        style={[
                          styles.transactionAmount,
                          isCredit
                            ? styles.creditText
                            : styles.debitText,
                        ]}
                      >
                        {isCredit ? '+' : '−'}
                        {formatMoney(transaction.amountPaise)}
                      </Text>
                      <Text style={styles.balanceAfter}>
                        Balance {formatMoney(transaction.balanceAfterPaise)}
                      </Text>
                    </View>
                  </View>
                )
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: UI.colors.background,
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 36,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: UI.colors.textSecondary,
  },
  intro: {
    marginBottom: 18,
  },
  eyebrow: {
    color: UI.colors.primaryBlue,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  title: {
    marginTop: 4,
    fontSize: 28,
    fontWeight: '900',
    color: UI.colors.text,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
    color: UI.colors.textSecondary,
  },
  balanceCard: {
    padding: 22,
    borderRadius: 22,
    backgroundColor: UI.colors.primary,
    marginBottom: 20,
  },
  balanceLabel: {
    color: '#D7EAF4',
    fontSize: 13,
    fontWeight: '700',
  },
  balance: {
    marginTop: 8,
    fontSize: 34,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  balanceFootnote: {
    marginTop: 8,
    fontSize: 12,
    color: '#D7EAF4',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: UI.colors.text,
  },
  helperText: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
    color: UI.colors.textSecondary,
  },
  amountGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 14,
  },
  amountOption: {
    flexGrow: 1,
    minWidth: '22%',
    paddingHorizontal: 12,
    paddingVertical: 15,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: UI.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: UI.colors.surface,
  },
  amountOptionSelected: {
    borderColor: UI.colors.primaryBlue,
    backgroundColor: '#EAF3FF',
  },
  amountOptionText: {
    fontSize: 15,
    fontWeight: '800',
    color: UI.colors.text,
  },
  amountOptionTextSelected: {
    color: UI.colors.primaryBlue,
  },
  addButton: {
    minHeight: 54,
    borderRadius: 15,
    backgroundColor: UI.colors.primaryBlue,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    paddingHorizontal: 18,
  },
  addButtonPressed: {
    opacity: 0.85,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  processingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  disabled: {
    opacity: 0.55,
  },
  testModeNote: {
    marginTop: 11,
    fontSize: 12,
    lineHeight: 18,
    color: UI.colors.textSecondary,
  },
  errorCard: {
    padding: 14,
    marginBottom: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FFD7D2',
    backgroundColor: '#FFF3F2',
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#B42318',
  },
  errorText: {
    marginTop: 5,
    fontSize: 13,
    lineHeight: 19,
    color: '#B42318',
  },
  noticeCard: {
    padding: 14,
    marginBottom: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#B9E4D0',
    backgroundColor: '#EFFAF4',
  },
  noticeText: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
    color: '#176B45',
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  historyCount: {
    fontSize: 12,
    color: UI.colors.textSecondary,
  },
  historyCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: UI.colors.border,
    overflow: 'hidden',
    backgroundColor: UI.colors.surface,
  },
  emptyCard: {
    padding: 20,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: UI.colors.border,
    backgroundColor: UI.colors.surface,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: UI.colors.text,
  },
  emptyText: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
    color: UI.colors.textSecondary,
  },
  transactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    paddingVertical: 15,
    gap: 11,
  },
  transactionBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#EEF1F5',
  },
  transactionIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  creditIcon: {
    backgroundColor: '#EAF8F0',
  },
  debitIcon: {
    backgroundColor: '#FFF1F0',
  },
  transactionIconText: {
    fontSize: 21,
    fontWeight: '800',
  },
  creditText: {
    color: '#16804A',
  },
  debitText: {
    color: '#C43228',
  },
  transactionCopy: {
    flex: 1,
    minWidth: 80,
  },
  transactionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: UI.colors.text,
  },
  transactionDate: {
    marginTop: 4,
    fontSize: 11,
    color: UI.colors.textSecondary,
  },
  transactionAmountColumn: {
    alignItems: 'flex-end',
  },
  transactionAmount: {
    fontSize: 13,
    fontWeight: '800',
  },
  balanceAfter: {
    marginTop: 4,
    fontSize: 10,
    color: UI.colors.textSecondary,
  },
})