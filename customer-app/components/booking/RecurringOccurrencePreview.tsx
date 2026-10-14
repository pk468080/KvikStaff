import { FlatList, StyleSheet, Text, View } from 'react-native'

import { formatDateDisplay, formatTimeDisplay } from '../../lib/bookingUtils'
import { UI } from '../../constants/ui';

interface RecurringOccurrencePreviewProps {
  occurrences: Date[]
  startTime: Date
  endTime: Date
  loading?: boolean
}

export default function RecurringOccurrencePreview({
  occurrences,
  startTime,
  endTime,
  loading = false,
}: RecurringOccurrencePreviewProps) {
  if (occurrences.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No occurrences selected</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Service occurrences</Text>
        <Text style={styles.count}>{occurrences.length} dates</Text>
      </View>

      <View style={styles.timeInfo}>
        <Text style={styles.timeText}>
          {formatTimeDisplay(startTime)} — {formatTimeDisplay(endTime)}
        </Text>
      </View>

      <FlatList
        data={occurrences}
        keyExtractor={(date, index) => `${date.getTime()}-${index}`}
        renderItem={({ item, index }) => (
          <View style={[styles.occurrenceItem, index === occurrences.length - 1 && styles.occurrenceItemLast]}>
            <Text style={styles.occurrenceDate}>{formatDateDisplay(item)}</Text>
          </View>
        )}
        scrollEnabled={false}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 12,
    borderRadius: UI.radius.md,
    backgroundColor: '#F9FAFB',
    overflow: 'hidden',
  },

  emptyContainer: {
    padding: UI.spacing.lg,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: UI.colors.disabledBackground,
    borderRadius: 10,
    minHeight: 50,
  },

  emptyText: {
    fontSize: UI.typography.body,
    color: '#9CA3AF',
    fontWeight: '500',
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: UI.spacing.md,
    paddingHorizontal: UI.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },

  title: {
    fontSize: UI.typography.body,
    fontWeight: '600',
    color: '#111827',
  },

  count: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4F46E5',
  },

  timeInfo: {
    paddingVertical: 10,
    paddingHorizontal: UI.spacing.lg,
    backgroundColor: '#F0F4FF',
  },

  timeText: {
    fontSize: 13,
    color: '#4F46E5',
    fontWeight: '500',
  },

  occurrenceItem: {
    paddingVertical: 10,
    paddingHorizontal: UI.spacing.lg,
  },

  occurrenceItemLast: {
    paddingBottom: 12,
  },

  occurrenceDate: {
    fontSize: UI.typography.body,
    color: '#374151',
    fontWeight: '500',
  },

  separator: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 16,
  },
})
