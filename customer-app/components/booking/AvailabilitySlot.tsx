import { StyleSheet, TouchableOpacity, Text, View } from 'react-native'

import { formatTimeDisplay } from '../../lib/bookingUtils'
import { UI } from '../../constants/ui';

interface AvailabilitySlotProps {
  start: string
  end: string
  availableWorkerCount: number
  selected?: boolean
  onPress: () => void
}

export default function AvailabilitySlot({
  start,
  end,
  availableWorkerCount,
  selected = false,
  onPress,
}: AvailabilitySlotProps) {
  const startTime = new Date(start)
  const endTime = new Date(end)

  const isAvailable = availableWorkerCount > 0

  return (
    <TouchableOpacity
      style={[
        styles.container,
        selected && styles.containerSelected,
        !isAvailable && styles.containerDisabled,
      ]}
      onPress={onPress}
      disabled={!isAvailable}
    >
      <View style={styles.timeSection}>
        <Text
          style={[
            styles.time,
            selected && styles.timeSelected,
            !isAvailable && styles.timeDisabled,
          ]}
        >
          {formatTimeDisplay(startTime)}
        </Text>

        <Text style={[styles.separator, selected && styles.separatorSelected]}>—</Text>

        <Text
          style={[
            styles.time,
            selected && styles.timeSelected,
            !isAvailable && styles.timeDisabled,
          ]}
        >
          {formatTimeDisplay(endTime)}
        </Text>
      </View>

      <Text
        style={[
          styles.workers,
          selected && styles.workersSelected,
          !isAvailable && styles.workersDisabled,
        ]}
      >
        {availableWorkerCount} {availableWorkerCount === 1 ? 'worker' : 'workers'}
      </Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    marginBottom: 10,
    borderRadius: 10,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },

  containerSelected: {
    backgroundColor: '#F0F4FF',
    borderColor: '#4F46E5',
    borderWidth: 2,
  },

  containerDisabled: {
    opacity: 0.5,
  },

  timeSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: UI.spacing.sm,
  },

  time: {
    fontSize: UI.typography.body,
    fontWeight: '600',
    color: '#111827',
  },

  timeSelected: {
    color: '#4F46E5',
  },

  timeDisabled: {
    color: '#9CA3AF',
  },

  separator: {
    fontSize: UI.typography.body,
    color: '#D1D5DB',
  },

  separatorSelected: {
    color: '#4F46E5',
  },

  workers: {
    fontSize: UI.typography.small,
    fontWeight: '600',
    color: '#6B7280',
  },

  workersSelected: {
    color: '#4F46E5',
  },

  workersDisabled: {
    color: '#9CA3AF',
  },
})
