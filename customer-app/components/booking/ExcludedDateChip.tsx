import { StyleSheet, Text, TouchableOpacity } from 'react-native'

import { formatDateDisplay } from '../../lib/bookingUtils'
import CustomerIcon from '../ui/CustomerIcon'
import { UI } from '../../constants/ui';

interface ExcludedDateChipProps {
  date: Date
  onRemove?: () => void
}

export default function ExcludedDateChip({ date, onRemove }: ExcludedDateChipProps) {
  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onRemove}
      disabled={!onRemove}
    >
      <Text style={styles.text}>{formatDateDisplay(date)}</Text>
      {onRemove && (
        <CustomerIcon
          name="close"
          size={14}
          color="#6B7F8D"
        />
      )}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: UI.spacing.md,
    paddingVertical: UI.spacing.sm,
    borderRadius: UI.radius.xl,
    backgroundColor: UI.colors.errorBackground,
    borderWidth: 1,
    borderColor: '#FECACA',
    gap: UI.spacing.sm,
  },

  text: {
    fontSize: UI.typography.small,
    fontWeight: '600',
    color: UI.colors.error,
  },

  removeIcon: {
    fontSize: UI.typography.small,
    color: UI.colors.error,
    fontWeight: '700',
  },
})
