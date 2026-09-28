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

import { formatTimeDisplay } from '../../lib/bookingUtils'

interface TimeRangePickerProps {
  startTime: Date
  endTime: Date

  onStartTimeChange: (
    time: Date,
  ) => void

  onEndTimeChange: (
    time: Date,
  ) => void

  disabled?: boolean

  mode?: 'range' | 'start' | 'end'

  minimumTime?: Date

  startHint?: string

  endHint?: string
}

export default function TimeRangePicker({
  startTime,
  endTime,
  onStartTimeChange,
  onEndTimeChange,
  disabled = false,
  mode = 'range',
  minimumTime,
  startHint = 'Choose the service start time',
  endHint = 'Choose the service end time',
}: TimeRangePickerProps) {
  const [
    pickerMode,
    setPickerMode,
  ] = useState<
    'start' | 'end' | null
  >(null)

  const [
    pickerTime,
    setPickerTime,
  ] = useState(new Date())

  function clampEndTime(time: Date) {
    if (!minimumTime) {
      return time
    }

    const selectedMinutes =
      time.getHours() * 60 +
      time.getMinutes()

    const minimumMinutes =
      minimumTime.getHours() * 60 +
      minimumTime.getMinutes()

    if (
      selectedMinutes <
      minimumMinutes
    ) {
      const result =
        new Date(minimumTime)

      result.setSeconds(0, 0)

      return result
    }

    return time
  }

  function handleTimePicked(
    time: Date,
  ) {
    if (pickerMode === 'start') {
      onStartTimeChange(time)

      if (time >= endTime) {
        const nextEnd =
          new Date(time)

        nextEnd.setHours(
          nextEnd.getHours() + 1,
        )

        onEndTimeChange(
          nextEnd,
        )
      }
    }

    if (pickerMode === 'end') {
      onEndTimeChange(
        clampEndTime(time),
      )
    }

    setPickerMode(null)
  }

  function handlePickerChange(
    event: DateTimePickerEvent,
    selectedDate?: Date,
  ) {
    if (
      event.type === 'dismissed' ||
      !selectedDate
    ) {
      if (
        Platform.OS === 'android'
      ) {
        setPickerMode(null)
      }

      return
    }

    let nextDate = selectedDate

    if (
      pickerMode === 'end'
    ) {
      nextDate =
        clampEndTime(
          selectedDate,
        )
    }

    if (
      Platform.OS === 'android'
    ) {
      handleTimePicked(nextDate)
    } else {
      setPickerTime(nextDate)
    }
  }

  function openStartPicker() {
    if (disabled) {
      return
    }

    setPickerTime(startTime)
    setPickerMode('start')
  }

  function openEndPicker() {
    if (disabled) {
      return
    }

    setPickerTime(
      clampEndTime(endTime),
    )

    setPickerMode('end')
  }

  const showStart =
    mode !== 'end'

  const showEnd =
    mode !== 'start'

  return (
    <View
      style={
        styles.timeRangeContainer
      }
    >
      {showStart && (
        <TouchableOpacity
          style={[
            styles.timeButton,
            disabled &&
              styles.timeButtonDisabled,
          ]}
          onPress={
            openStartPicker
          }
          disabled={disabled}
          activeOpacity={0.86}
        >
          <Text
            style={
              styles.timeButtonLabel
            }
          >
            Start time
          </Text>

          <Text
            style={
              styles.timeButtonValue
            }
          >
            {formatTimeDisplay(
              startTime,
            )}
          </Text>

          <Text
            style={
              styles.timeButtonHint
            }
          >
            {startHint}
          </Text>
        </TouchableOpacity>
      )}

      {showEnd && (
        <TouchableOpacity
          style={[
            styles.timeButton,
            disabled &&
              styles.timeButtonDisabled,
          ]}
          onPress={
            openEndPicker
          }
          disabled={disabled}
          activeOpacity={0.86}
        >
          <Text
            style={
              styles.timeButtonLabel
            }
          >
            End time
          </Text>

          <Text
            style={
              styles.timeButtonValue
            }
          >
            {formatTimeDisplay(
              endTime,
            )}
          </Text>

          <Text
            style={
              styles.timeButtonHint
            }
          >
            {endHint}
          </Text>
        </TouchableOpacity>
      )}

      {pickerMode &&
        Platform.OS !==
          'android' && (
          <Modal
            transparent
            visible
            animationType="slide"
          >
            <View
              style={
                styles.pickerModal
              }
            >
              <View
                style={
                  styles.pickerHeader
                }
              >
                <TouchableOpacity
                  onPress={() =>
                    setPickerMode(
                      null,
                    )
                  }
                >
                  <Text
                    style={
                      styles.pickerHeaderButton
                    }
                  >
                    Cancel
                  </Text>
                </TouchableOpacity>

                <Text
                  style={
                    styles.pickerHeaderTitle
                  }
                >
                  {pickerMode ===
                  'start'
                    ? 'Start time'
                    : 'End time'}
                </Text>

                <TouchableOpacity
                  onPress={() =>
                    handleTimePicked(
                      pickerTime,
                    )
                  }
                >
                  <Text
                    style={
                      styles.pickerHeaderButtonDone
                    }
                  >
                    Done
                  </Text>
                </TouchableOpacity>
              </View>

              <DateTimePicker
                value={pickerTime}
                mode="time"
                display="spinner"
                onChange={
                  handlePickerChange
                }
              />
            </View>
          </Modal>
        )}

      {pickerMode &&
        Platform.OS ===
          'android' && (
          <DateTimePicker
            value={pickerTime}
            mode="time"
            display="default"
            onChange={
              handlePickerChange
            }
          />
        )}
    </View>
  )
}

const styles = StyleSheet.create({
  timeRangeContainer: {
    flexDirection: 'row',
    gap: 12,
  },

  timeButton: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },

  timeButtonDisabled: {
    opacity: 0.5,
  },

  timeButtonLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 4,
  },

  timeButtonValue: {
    fontSize: 15,
    fontWeight: '500',
    color: '#111827',
  },

  timeButtonHint: {
    marginTop: 4,
    fontSize: 10,
    lineHeight: 14,
    color: '#9CA3AF',
  },

  pickerModal: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor:
      'rgba(0,0,0,0.45)',
  },

  pickerHeader: {
    flexDirection: 'row',
    justifyContent:
      'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor:
      '#E5E7EB',
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