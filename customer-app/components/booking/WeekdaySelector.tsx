import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { UI } from '../../constants/ui';

interface WeekdaySelectorProps {
  selectedWeekdays: string[]
  onToggleWeekday: (weekday: string) => void
  disabled?: boolean
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function WeekdaySelector({
  selectedWeekdays,
  onToggleWeekday,
  disabled = false,
}: WeekdaySelectorProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Recurring days</Text>

      <View style={styles.weekdayGrid}>
        {WEEKDAYS.map((weekday, index) => {
          const isSelected = selectedWeekdays.includes(weekday)

          return (
            <TouchableOpacity
              key={weekday}
              style={[
                styles.weekdayButton,
                isSelected && styles.weekdayButtonSelected,
                disabled && styles.weekdayButtonDisabled,
              ]}
              onPress={() => onToggleWeekday(weekday)}
              disabled={disabled}
            >
              <Text
                style={[
                  styles.weekdayText,
                  isSelected && styles.weekdayTextSelected,
                  disabled && styles.weekdayTextDisabled,
                ]}
              >
                {WEEKDAY_SHORT[index]}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>

      {selectedWeekdays.length > 0 && (
        <Text style={styles.selectedCount}>
          {selectedWeekdays.length} {selectedWeekdays.length === 1 ? 'day' : 'days'} selected
        </Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    gap: UI.spacing.md,
  },

  label: {
    fontSize: UI.typography.body,
    fontWeight: '600',
    color: UI.colors.text,
  },

  weekdayGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: UI.spacing.sm,
  },

  weekdayButton: {
    width: '48%',
    paddingVertical: UI.spacing.md,
    paddingHorizontal: UI.spacing.md,
    borderRadius: 10,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
  },

  weekdayButtonSelected: {
    backgroundColor: UI.colors.primaryBlue,
    borderColor: UI.colors.primaryBlue,
  },

  weekdayButtonDisabled: {
    opacity: 0.5,
  },

  weekdayText: {
    fontSize: UI.typography.body,
    fontWeight: '600',
    color: UI.colors.text,
  },

  weekdayTextSelected: {
    color: UI.colors.surface,
  },

  weekdayTextDisabled: {
    color: UI.colors.textMuted,
  },

  selectedCount: {
    fontSize: UI.typography.small,
    color: UI.colors.textMuted,
    fontWeight: '500',
    marginTop: UI.spacing.xs,
  },
})
