import { StyleSheet, Text, TouchableOpacity } from 'react-native'

import { formatDateDisplay } from '../../lib/bookingUtils'
import CustomerIcon from '../ui/CustomerIcon'
import { UI } from '../../constants/ui';

interface SelectedDateChipProps {
  date: Date
  onRemove?: () => void
}

export default function SelectedDateChip({ date, onRemove }: SelectedDateChipProps) {
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
    backgroundColor: '#E0E7FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    gap: UI.spacing.sm,
  },

  text: {
    fontSize: UI.typography.small,
    fontWeight: '600',
    color: '#4F46E5',
  },

  removeIcon: {
    fontSize: UI.typography.small,
    color: '#4F46E5',
    fontWeight: '700',
  },
})
