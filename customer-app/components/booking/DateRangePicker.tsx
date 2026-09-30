import { useState } from 'react'
import {
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker'

import {
  formatDateDisplay,
  startOfDay,
  toDateKey,
} from '../../lib/bookingUtils'

interface DateRangePickerProps {
  startDate: Date | null
  endDate: Date | null
  excludedDates: string[]
  minDate?: Date
  maxDate?: Date
  onStartDateChange: (date: Date) => void
  onEndDateChange: (date: Date) => void
  onExcludedDateToggle: (dateKey: string) => void
  disabled?: boolean
}

export default function DateRangePicker({
  startDate,
  endDate,
  excludedDates,
  minDate = new Date(),
  maxDate,
  onStartDateChange,
  onEndDateChange,
  onExcludedDateToggle,
  disabled = false,
}: DateRangePickerProps) {
  const [pickerMode, setPickerMode] = useState<'start' | 'end' | null>(null)
  const [pickerDate, setPickerDate] = useState(new Date())

  function handleDatePicked(date: Date) {
  const normalizedDate =
    startOfDay(date)

  const minimumAllowedDate =
    pickerMode === 'end'
      ? startOfDay(effectiveEndMinDate)
      : startOfDay(minDate)

  // Never allow a date earlier than
  // the business-defined minimum date.
  if (
    normalizedDate.getTime() <
    minimumAllowedDate.getTime()
  ) {
    setPickerMode(null)
    return
  }

  if (pickerMode === 'start') {
    onStartDateChange(normalizedDate)

    // Keep the range valid when the start date
    // moves past the current end date.
    if (
      endDate &&
      normalizedDate > endDate
    ) {
      onEndDateChange(
        normalizedDate,
      )
    }
  } else if (pickerMode === 'end') {
    onEndDateChange(
      normalizedDate,
    )
  }

  setPickerMode(null)
}

  function handlePickerChange(
    event: DateTimePickerEvent,
    selectedDate?: Date,
  ) {
    if (event.type === 'dismissed' || !selectedDate) {
      if (Platform.OS === 'android') {
        setPickerMode(null)
      }
      return
    }

    if (Platform.OS === 'android') {
      handleDatePicked(selectedDate)
    } else {
      setPickerDate(selectedDate)
    }
  }

  function generateCalendarDays(): {
  date: Date
  isInRange: boolean
  isExcluded: boolean
  isStartEnd: boolean
}[] {
    if (!startDate || !endDate) return []

    const days: {
  date: Date
  isInRange: boolean
  isExcluded: boolean
  isStartEnd: boolean
}[] = []

    const cursor = new Date(startDate)

    while (cursor <= endDate) {
      const dateKey = toDateKey(cursor)

      const isInRange =
        cursor >= startDate &&
        cursor <= endDate

      const isExcluded = excludedDates.includes(dateKey)

      const isStartEnd =
        toDateKey(cursor) === toDateKey(startDate) ||
        toDateKey(cursor) === toDateKey(endDate)

      days.push({
        date: new Date(cursor),
        isInRange,
        isExcluded,
        isStartEnd,
      })

      cursor.setDate(cursor.getDate() + 1)
    }

    return days
  }

  const calendarDays = generateCalendarDays()

  // The end date can never be earlier than the selected start date.
  const effectiveEndMinDate = startDate ?? minDate

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[
          styles.dateButton,
          disabled && styles.dateButtonDisabled,
        ]}
        onPress={() => {
  if (!disabled) {
    const nextPickerDate =
      startDate &&
      startOfDay(startDate).getTime() >=
        startOfDay(minDate).getTime()
        ? startDate
        : minDate

    setPickerDate(
      nextPickerDate,
    )
    setPickerMode('start')
  }
}}
        disabled={disabled}
      >
        <Text style={styles.dateButtonLabel}>
          Start date
        </Text>

        <Text style={styles.dateButtonValue}>
          {formatDateDisplay(startDate)}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.dateButton,
          disabled && styles.dateButtonDisabled,
        ]}
        onPress={() => {
          if (!disabled) {
            const nextPickerDate =
              endDate && endDate >= effectiveEndMinDate
                ? endDate
                : effectiveEndMinDate

            setPickerDate(nextPickerDate)
            setPickerMode('end')
          }
        }}
        disabled={disabled}
      >
        <Text style={styles.dateButtonLabel}>
          End date
        </Text>

        <Text style={styles.dateButtonValue}>
          {formatDateDisplay(endDate)}
        </Text>
      </TouchableOpacity>

      {startDate && endDate && (
        <View style={styles.calendarSection}>
          <Text style={styles.calendarTitle}>
            Select dates to exclude:
          </Text>

          <View style={styles.calendar}>
            {calendarDays.map((day, index) => {
              const dateKey = toDateKey(day.date)
              const dayOfMonth = day.date.getDate()

              return (
                <TouchableOpacity
                  key={`${dateKey}-${index}`}
                  style={[
                    styles.calendarDay,
                    day.isInRange &&
                      !day.isStartEnd &&
                      styles.calendarDayInRange,
                    day.isStartEnd &&
                      styles.calendarDayStartEnd,
                    day.isExcluded &&
                      styles.calendarDayExcluded,
                  ]}
                  onPress={() =>
                    onExcludedDateToggle(dateKey)
                  }
                  disabled={disabled}
                >
                  <Text
                    style={[
                      styles.calendarDayText,
                      (day.isInRange || day.isStartEnd) &&
                        styles.calendarDayTextActive,
                      day.isExcluded &&
                        styles.calendarDayTextExcluded,
                    ]}
                  >
                    {dayOfMonth}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>
      )}

      {pickerMode && Platform.OS !== 'android' && (
        <Modal
          transparent
          visible={pickerMode !== null}
          animationType="slide"
        >
          <View style={styles.pickerModal}>
            <View style={styles.pickerHeader}>
              <TouchableOpacity
                onPress={() => setPickerMode(null)}
              >
                <Text style={styles.pickerHeaderButton}>
                  Cancel
                </Text>
              </TouchableOpacity>

              <Text style={styles.pickerHeaderTitle}>
                {pickerMode === 'start'
                  ? 'Start date'
                  : 'End date'}
              </Text>

              <TouchableOpacity
                onPress={() => handleDatePicked(pickerDate)}
              >
                <Text style={styles.pickerHeaderButtonDone}>
                  Done
                </Text>
              </TouchableOpacity>
            </View>

            <DateTimePicker
              value={pickerDate}
              mode="date"
              display="spinner"
              onChange={handlePickerChange}
              minimumDate={
                pickerMode === 'end'
                  ? effectiveEndMinDate
                  : minDate
              }
              maximumDate={maxDate}
            />
          </View>
        </Modal>
      )}

      {pickerMode && Platform.OS === 'android' && (
        <DateTimePicker
          value={pickerDate}
          mode="date"
          display="default"
          onChange={handlePickerChange}
          minimumDate={
            pickerMode === 'end'
              ? effectiveEndMinDate
              : minDate
          }
          maximumDate={maxDate}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },

  dateButton: {
    padding: 14,
    borderRadius: 10,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },

  dateButtonDisabled: {
    opacity: 0.5,
  },

  dateButtonLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 4,
  },

  dateButtonValue: {
    fontSize: 15,
    fontWeight: '500',
    color: '#111827',
  },

  calendarSection: {
    marginTop: 8,
    gap: 12,
  },

  calendarTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },

  calendar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    backgroundColor: '#F3F4F6',
    padding: 12,
    borderRadius: 10,
  },

  calendarDay: {
    width: '14%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },

  calendarDayInRange: {
    backgroundColor: '#E0E7FF',
    borderColor: '#C7D2FE',
  },

  calendarDayStartEnd: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },

  calendarDayExcluded: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FECACA',
  },

  calendarDayText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#111827',
  },

  calendarDayTextActive: {
    color: '#4F46E5',
  },

  calendarDayTextExcluded: {
    color: '#DC2626',
  },

  pickerModal: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },

  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },

  pickerHeaderTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },

  pickerHeaderButton: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },

  pickerHeaderButtonDone: {
    fontSize: 14,
    color: '#4F46E5',
    fontWeight: '600',
  },
})