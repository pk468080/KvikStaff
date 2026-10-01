import {
  useEffect,
  useState,
} from 'react'

import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'

import { ScreenContainer } from '../../components/layout/ScreenContainer'
import {
  getCustomerInvoice,
  type CustomerInvoice,
} from '../../services/invoice/invoice.service'

 type InvoiceReceiptScreenProps = {
  bookingId: string
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

function formatMoney(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
  } catch {
    return `${currency} ${value.toFixed(2)}`
  }
}

function formatStatus(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, character => character.toUpperCase())
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export function buildReceiptHtml(invoice: CustomerInvoice): string {
  const money = (value: number) =>
    escapeHtml(formatMoney(value, invoice.currency))
  const text = (value: string | null) =>
    escapeHtml(value ?? 'Not recorded')

  return `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; color: #17354A; padding: 28px; }
      h1 { margin: 0 0 4px; font-size: 24px; }
      h2 { margin: 24px 0 8px; font-size: 16px; }
      .muted { color: #6B7F8D; font-size: 12px; }
      .row { display: flex; justify-content: space-between; gap: 20px; padding: 8px 0; border-bottom: 1px solid #E5EDF1; }
      .label { color: #6B7F8D; }
      .total { font-size: 18px; font-weight: 700; border-bottom: 0; }
    </style>
  </head>
  <body>
    <h1>TempStaff</h1>
    <div class="muted">Payment Receipt</div>
    <h2>${text(invoice.serviceName)}</h2>
    <div class="muted">Receipt Reference: ${text(invoice.invoiceReference)}</div>
    <h2>Booking</h2>
    <div class="row"><span class="label">Booking ID</span><span>${text(invoice.bookingId)}</span></div>
    <div class="row"><span class="label">Booking type</span><span>${text(invoice.bookingType ? formatStatus(invoice.bookingType) : null)}</span></div>
    <div class="row"><span class="label">Scheduled start</span><span>${text(formatDateTime(invoice.scheduledStart))}</span></div>
    <div class="row"><span class="label">Scheduled end</span><span>${text(formatDateTime(invoice.scheduledEnd))}</span></div>
    <div class="row"><span class="label">Working hours</span><span>${text(invoice.workingHours === null ? null : `${invoice.workingHours} hours`)}</span></div>
    <div class="row"><span class="label">Completed at</span><span>${text(formatDateTime(invoice.completedAt))}</span></div>
    <h2>Amount</h2>
    <div class="row"><span class="label">Subtotal</span><span>${money(invoice.subtotal)}</span></div>
    <div class="row"><span class="label">Discount</span><span>${money(invoice.discountAmount)}</span></div>
    <div class="row"><span class="label">Platform fee</span><span>${money(invoice.platformFee)}</span></div>
    <div class="row"><span class="label">Tax</span><span>${money(invoice.taxAmount)}</span></div>
    <div class="row total"><span>Total paid</span><span>${money(invoice.totalAmount)}</span></div>
    <h2>Payment</h2>
    <div class="row"><span class="label">Status</span><span>${text(formatStatus(invoice.paymentStatus))}</span></div>
    <div class="row"><span class="label">Provider</span><span>${text(invoice.paymentProvider)}</span></div>
    <div class="row"><span class="label">Payment ID</span><span>${text(invoice.providerPaymentId)}</span></div>
    <div class="row"><span class="label">Order reference</span><span>${text(invoice.providerOrderId)}</span></div>
    <div class="row"><span class="label">Paid at</span><span>${text(formatDateTime(invoice.paidAt))}</span></div>
  </body>
</html>`
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
      <Text style={styles.infoValue} selectable>{value}</Text>
    </View>
  )
}

export default function InvoiceReceiptScreen({
  bookingId,
}: InvoiceReceiptScreenProps) {
  const [invoice, setInvoice] = useState<CustomerInvoice | null>(null)
  const [loading, setLoading] = useState(true)
  const [sharing, setSharing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    async function loadInvoice() {
      try {
        setLoading(true)
        setError(null)
        const nextInvoice = await getCustomerInvoice(bookingId)

        if (mounted) {
          setInvoice(nextInvoice)
        }
      } catch (cause) {
        if (mounted) {
          setError(
            cause instanceof Error
              ? cause.message
              : 'Unable to load the payment receipt.',
          )
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    void loadInvoice()

    return () => {
      mounted = false
    }
  }, [bookingId])

  async function handleShare() {
    if (!invoice || sharing) {
      return
    }

    if (Platform.OS === 'web') {
      Alert.alert('Sharing unavailable', 'Receipt sharing is available on a supported mobile device.')
      return
    }

    try {
      setSharing(true)
      const result = await Print.printToFileAsync({
        html: buildReceiptHtml(invoice),
      })
      const available = await Sharing.isAvailableAsync()

      if (!available) {
        Alert.alert('Sharing unavailable', 'Receipt sharing is not available on this device.')
        return
      }

      await Sharing.shareAsync(result.uri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Share payment receipt',
        UTI: 'com.adobe.pdf',
      })
    } catch {
      Alert.alert('Receipt unavailable', 'The receipt PDF could not be generated or shared.')
    } finally {
      setSharing(false)
    }
  }

  if (loading) {
    return (
      <ScreenContainer>
        <View style={styles.centered}>
          <ActivityIndicator />
          <Text style={styles.mutedText}>Loading payment receipt...</Text>
        </View>
      </ScreenContainer>
    )
  }

  if (!invoice) {
    return (
      <ScreenContainer>
        <View style={styles.centered}>
          <Text style={styles.errorTitle}>Receipt unavailable</Text>
          <Text style={styles.errorText}>{error ?? 'The payment receipt could not be loaded.'}</Text>
        </View>
      </ScreenContainer>
    )
  }

  const money = (value: number) => formatMoney(value, invoice.currency)

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.brandRow}>
          <Image
            source={require('../../assets/branding/tempstuff-logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.brandLabel}>PAYMENT RECEIPT</Text>
        </View>

        <View style={styles.heroCard}>
          <Text style={styles.eyebrow}>TEMPSTAFF</Text>
          <Text style={styles.heroTitle}>Payment Receipt</Text>
          <Text style={styles.heroService}>{invoice.serviceName}</Text>
          <Text style={styles.heroAmount}>{money(invoice.totalAmount)}</Text>
          <Text style={styles.heroStatus}>{formatStatus(invoice.paymentStatus)}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Booking</Text>
          <InfoRow label="Booking ID" value={invoice.bookingId} />
          <InfoRow label="Receipt reference" value={invoice.invoiceReference} />
          <InfoRow label="Booking type" value={invoice.bookingType ? formatStatus(invoice.bookingType) : 'Not recorded'} />
          <InfoRow label="Scheduled start" value={formatDateTime(invoice.scheduledStart)} />
          <InfoRow label="Scheduled end" value={formatDateTime(invoice.scheduledEnd)} />
          <InfoRow label="Working hours" value={invoice.workingHours === null ? 'Not recorded' : `${invoice.workingHours} hours`} />
          <InfoRow label="Completion time" value={formatDateTime(invoice.completedAt)} />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Amount breakdown</Text>
          <InfoRow label="Subtotal" value={money(invoice.subtotal)} />
          <InfoRow label="Discount" value={money(invoice.discountAmount)} />
          <InfoRow label="Platform fee" value={money(invoice.platformFee)} />
          <InfoRow label="Tax" value={money(invoice.taxAmount)} />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total paid</Text>
            <Text style={styles.totalValue}>{money(invoice.totalAmount)}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Payment</Text>
          <InfoRow label="Payment status" value={formatStatus(invoice.paymentStatus)} />
          <InfoRow label="Provider" value={invoice.paymentProvider} />
          <InfoRow label="Payment ID" value={invoice.providerPaymentId ?? 'Not available'} />
          <InfoRow label="Order reference" value={invoice.providerOrderId ?? 'Not available'} />
          <InfoRow label="Paid at" value={formatDateTime(invoice.paidAt)} />
        </View>

        <Pressable
          onPress={() => void handleShare()}
          disabled={sharing}
          style={[styles.shareButton, sharing && styles.disabledButton]}
        >
          <Text style={styles.shareButtonText}>{sharing ? 'Preparing receipt...' : 'Share Receipt'}</Text>
        </Pressable>

        <Text style={styles.disclaimer}>
          This is a payment receipt based on the booking and payment records stored by TempStaff. It is not an official tax invoice.
        </Text>
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
  mutedText: {
    marginTop: 12,
    color: '#6B7280',
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#17354A',
  },
  errorText: {
    marginTop: 8,
    textAlign: 'center',
    color: '#B42318',
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
    color: '#00A7A7',
  },
  heroCard: {
    padding: 20,
    borderRadius: 22,
    backgroundColor: '#062F52',
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
    color: '#7EE7E0',
  },
  heroTitle: {
    marginTop: 6,
    fontSize: 27,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  heroService: {
    marginTop: 12,
    fontSize: 14,
    color: '#C9DDE7',
  },
  heroAmount: {
    marginTop: 22,
    fontSize: 25,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  heroStatus: {
    marginTop: 6,
    fontSize: 12,
    color: '#7EE7E0',
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
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#B9CBD4',
  },
  totalLabel: {
    fontSize: 15,
    fontWeight: '900',
    color: '#17354A',
  },
  totalValue: {
    fontSize: 15,
    fontWeight: '900',
    color: '#00A7A7',
  },
  shareButton: {
    marginTop: 14,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#00A7A7',
  },
  disabledButton: {
    opacity: 0.55,
  },
  shareButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  disclaimer: {
    marginTop: 16,
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
    color: '#6B7F8D',
  },
})
