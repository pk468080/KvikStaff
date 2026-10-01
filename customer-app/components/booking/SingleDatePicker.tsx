import { useState } from 'react'

import {
  Modal,
  Platform,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import CustomerIcon from '../ui/CustomerIcon'

import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker'

import {
  formatDateDisplay,
  startOfDay,
} from '../../lib/bookingUtils'

import { styles } from './bookingStyles'

type Props = {
  date: Date
  minDate: Date
  onChange: (date: Date) => void
}

export default function SingleDatePicker({
  date,
  minDate,
  onChange,
}: Props) {
  const [visible, setVisible] =
    useState(false)

  const [pickerDate, setPickerDate] =
    useState(date)

  function handlePickerChange(
    event: DateTimePickerEvent,
    selectedDate?: Date,
  ) {
    if (
      event.type === 'dismissed' ||
      !selectedDate
    ) {
      if (Platform.OS === 'android') {
        setVisible(false)
      }

      return
    }

    if (Platform.OS === 'android') {
      if (
        selectedDate.getTime() >=
        startOfDay(minDate).getTime()
      ) {
        onChange(
          startOfDay(selectedDate),
        )
      }

      setVisible(false)
      return
    }

    setPickerDate(selectedDate)
  }

  function openPicker() {
    const nextDate =
      date.getTime() >=
      minDate.getTime()
        ? date
        : minDate

    setPickerDate(nextDate)
    setVisible(true)
  }

  function closePicker() {
    setVisible(false)
  }

  function confirmPicker() {
    if (
      pickerDate.getTime() >=
      minDate.getTime()
    ) {
      onChange(
        startOfDay(pickerDate),
      )
    }

    setVisible(false)
  }

  return (
    <View>
      <TouchableOpacity
        activeOpacity={0.86}
        style={styles.selectionCard}
        onPress={openPicker}
      >
        <View
          style={styles.selectionIcon}
        >
          <Text
            style={
              styles.selectionIconText
            }
          >
            D
          </Text>
        </View>

        <View
          style={styles.selectionContent}
        >
          <Text
            style={styles.selectionLabel}
          >
            Booking date
          </Text>

          <Text
            style={styles.selectionValue}
          >
            {formatDateDisplay(date)}
          </Text>

          <Text
            style={styles.selectionHint}
          >
            Tomorrow onward
          </Text>
        </View>

        <CustomerIcon
          name="chevron-right"
          size={15}
          color="#78909C"
        />
      </TouchableOpacity>

      {visible &&
        Platform.OS !== 'android' && (
          <Modal
            transparent
            visible
            animationType="slide"
          >
            <View
              style={styles.pickerModal}
            >
              <View
                style={styles.pickerSheet}
              >
                <View
                  style={styles.pickerHeader}
                >
                  <TouchableOpacity
                    onPress={
                      closePicker
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
                    Select date
                  </Text>

                  <TouchableOpacity
                    onPress={
                      confirmPicker
                    }
                  >
                    <Text
                      style={
                        styles.pickerHeaderDone
                      }
                    >
                      Done
                    </Text>
                  </TouchableOpacity>
                </View>

                <DateTimePicker
                  value={pickerDate}
                  mode="date"
                  display="spinner"
                  minimumDate={minDate}
                  onChange={
                    handlePickerChange
                  }
                />
              </View>
            </View>
          </Modal>
        )}

      {visible &&
        Platform.OS === 'android' && (
          <DateTimePicker
            value={
              date.getTime() >=
              minDate.getTime()
                ? date
                : minDate
            }
            mode="date"
            display="default"
            minimumDate={minDate}
            onChange={
              handlePickerChange
            }
          />
        )}
    </View>
  )
}