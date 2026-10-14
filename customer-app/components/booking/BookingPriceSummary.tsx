import {
  StyleSheet,
  Text,
  View,
} from 'react-native'

import { formatMoney } from '../../lib/bookingUtils'
import { UI } from '../../constants/ui';

interface BookingPriceSummaryProps {
  baseAmount?: number

  discountAmount?: number

  serviceDiscountPercent?: number

  serviceDiscountAmount?: number

  discountTierName?: string | null

  promotionTitle?: string | null

  promotionDiscountAmount?: number

  recurringDiscountPercent?: number

  recurringDiscountAmount?: number

  recurringDiscountTierName?: string | null

  platformFee?: number

  taxAmount?: number

  finalAmount?: number

  currency?: string

  occurrenceCount?: number

  loading?: boolean

  error?: string | null
}

export default function BookingPriceSummary({
  baseAmount,

  discountAmount,

  serviceDiscountPercent = 0,

  serviceDiscountAmount = 0,

  discountTierName,

  promotionTitle,

  promotionDiscountAmount = 0,

  recurringDiscountPercent = 0,

  recurringDiscountAmount = 0,

  recurringDiscountTierName,

  platformFee,

  taxAmount,

  finalAmount,

  currency,

  occurrenceCount,

  loading = false,

  error,
}: BookingPriceSummaryProps) {
  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>
          Calculating price...
        </Text>
      </View>
    )
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>
          {error}
        </Text>
      </View>
    )
  }

  if (finalAmount === undefined) {
    return null
  }

  const hasDurationDiscount =
    serviceDiscountAmount > 0

  const hasPromotion =
    promotionDiscountAmount > 0

  const hasRecurringDiscount =
    recurringDiscountAmount > 0

  const effectiveDurationPercent =
    serviceDiscountPercent > 0
      ? serviceDiscountPercent
      : baseAmount &&
          baseAmount > 0 &&
          serviceDiscountAmount > 0
        ? (serviceDiscountAmount / baseAmount) * 100
        : 0

  const totalCalculatedDiscount =
    serviceDiscountAmount +
    promotionDiscountAmount +
    recurringDiscountAmount

  const displayedDiscountAmount =
    discountAmount !== undefined
      ? discountAmount
      : totalCalculatedDiscount

  return (
    <View style={styles.container}>
      {/* Base Amount */}
      <View style={styles.row}>
        <Text style={styles.label}>
          Base amount
        </Text>

        <Text style={styles.value}>
          {formatMoney(
            baseAmount,
            currency,
          )}
        </Text>
      </View>

      {/* Duration Discount */}
      {hasDurationDiscount && (
        <View style={styles.row}>
          <View style={styles.rowTextBlock}>
            <Text style={styles.label}>
              Duration discount
            </Text>

            <Text style={styles.helperText}>
              {discountTierName ||
                `${effectiveDurationPercent.toFixed(0)}% for this duration`}
            </Text>
          </View>

          <Text
            style={[
              styles.value,
              styles.discount,
            ]}
          >
            −
            {formatMoney(
              serviceDiscountAmount,
              currency,
            )}
          </Text>
        </View>
      )}

      {/* Promotion */}
      {hasPromotion && (
        <View style={styles.row}>
          <View style={styles.rowTextBlock}>
            <Text style={styles.label}>
              Promotion
            </Text>

            <Text style={styles.helperText}>
              {promotionTitle ||
                'Active promotion'}
            </Text>
          </View>

          <Text
            style={[
              styles.value,
              styles.discount,
            ]}
          >
            −
            {formatMoney(
              promotionDiscountAmount,
              currency,
            )}
          </Text>
        </View>
      )}

      {/* Recurring Commitment Discount */}
      {hasRecurringDiscount && (
        <View style={styles.row}>
          <View style={styles.rowTextBlock}>
            <Text style={styles.label}>
              Recurring discount
            </Text>

            <Text style={styles.helperText}>
              {recurringDiscountTierName ||
                `${recurringDiscountPercent.toFixed(0)}% commitment discount`}
            </Text>
          </View>

          <Text
            style={[
              styles.value,
              styles.discount,
            ]}
          >
            −
            {formatMoney(
              recurringDiscountAmount,
              currency,
            )}
          </Text>
        </View>
      )}

      {/* Generic Discount Fallback */}
      {!hasDurationDiscount &&
        !hasPromotion &&
        !hasRecurringDiscount &&
        discountAmount !== undefined &&
        discountAmount > 0 && (
          <View style={styles.row}>
            <Text style={styles.label}>
              Discount
            </Text>

            <Text
              style={[
                styles.value,
                styles.discount,
              ]}
            >
              −
              {formatMoney(
                discountAmount,
                currency,
              )}
            </Text>
          </View>
        )}

      {/* Total Discount */}
      {(hasDurationDiscount ||
        hasPromotion ||
        hasRecurringDiscount) && (
        <View style={styles.row}>
          <Text style={styles.label}>
            Total discount
          </Text>

          <Text
            style={[
              styles.value,
              styles.discount,
            ]}
          >
            −
            {formatMoney(
              displayedDiscountAmount,
              currency,
            )}
          </Text>
        </View>
      )}

      {/* Platform Fee */}
      {platformFee !== undefined &&
        platformFee > 0 && (
          <View style={styles.row}>
            <Text style={styles.label}>
              Platform fee
            </Text>

            <Text style={styles.value}>
              {formatMoney(
                platformFee,
                currency,
              )}
            </Text>
          </View>
        )}

      {/* Tax */}
      {taxAmount !== undefined &&
        taxAmount > 0 && (
          <View style={styles.row}>
            <Text style={styles.label}>
              Tax
            </Text>

            <Text style={styles.value}>
              {formatMoney(
                taxAmount,
                currency,
              )}
            </Text>
          </View>
        )}

      {/* Occurrences */}
      {occurrenceCount !== undefined && (
        <View style={styles.row}>
          <Text style={styles.label}>
            Occurrences
          </Text>

          <Text style={styles.value}>
            {occurrenceCount}
          </Text>
        </View>
      )}

      {/* Savings Banner */}
      {(hasDurationDiscount ||
        hasPromotion ||
        hasRecurringDiscount) && (
        <View style={styles.savingsBanner}>
          <Text style={styles.savingsTitle}>
            You save{' '}
            {formatMoney(
              displayedDiscountAmount,
              currency,
            )}
          </Text>

          <Text style={styles.savingsText}>
            Discounts are applied
            automatically at checkout.
          </Text>
        </View>
      )}

      {/* Final Total */}
      <View style={styles.divider} />

      <View style={styles.rowFinal}>
        <Text style={styles.labelFinal}>
          Total amount
        </Text>

        <Text style={styles.valueFinal}>
          {formatMoney(
            finalAmount,
            currency,
          )}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    padding: UI.spacing.lg,
    marginVertical: 12,
    borderRadius: UI.radius.md,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },

  loadingText: {
    fontSize: UI.typography.body,
    color: UI.colors.textMuted,
    textAlign: 'center',
    fontWeight: '500',
  },

  errorText: {
    fontSize: UI.typography.body,
    color: UI.colors.error,
    textAlign: 'center',
    fontWeight: '500',
  },

  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    gap: UI.spacing.md,
  },

  rowTextBlock: {
    flex: 1,
    minWidth: 0,
  },

  helperText: {
    marginTop: 3,
    fontSize: UI.typography.caption,
    color: '#64748B',
    fontWeight: '500',
  },

  rowFinal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: UI.spacing.md,
  },

  label: {
    fontSize: UI.typography.body,
    color: UI.colors.textMuted,
    fontWeight: '500',
  },

  labelFinal: {
    fontSize: 15,
    color: UI.colors.text,
    fontWeight: '700',
  },

  value: {
    fontSize: UI.typography.body,
    color: UI.colors.text,
    fontWeight: '600',
  },

  valueFinal: {
    fontSize: UI.typography.subtitle,
    color: UI.colors.text,
    fontWeight: '800',
  },

  discount: {
    color: '#059669',
  },

  savingsBanner: {
    marginTop: 6,
    padding: UI.spacing.md,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },

  savingsTitle: {
    fontSize: UI.typography.small,
    fontWeight: '800',
    color: '#047857',
  },

  savingsText: {
    marginTop: 3,
    fontSize: UI.typography.caption,
    color: '#065F46',
  },

  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 10,
  },
})