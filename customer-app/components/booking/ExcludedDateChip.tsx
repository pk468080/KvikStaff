import { StyleSheet, Text, TouchableOpacity } from 'react-native'

import { formatDateDisplay } from '../../lib/bookingUtils'
import CustomerIcon from '../ui/CustomerIcon'

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
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
    gap: 8,
  },

  text: {
    fontSize: 12,
    fontWeight: '600',
    color: '#DC2626',
  },

  removeIcon: {
    fontSize: 12,
    color: '#DC2626',
    fontWeight: '700',
  },
})
