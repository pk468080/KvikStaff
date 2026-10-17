import { useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'

import { ScreenContainer } from '../../components/layout/ScreenContainer'
import { UI } from '../../constants/ui';
import {
  rescheduleCustomerBooking,
} from '../../services/booking/bookingReschedule.service'

type RescheduleBookingScreenProps = {
  bookingId: string
  currentStart: string
  currentEnd: string
  onCompleted: () => void
}

const KvikStaffLogo = require('../../assets/branding/tempstuff-logo.png')

function parseDate(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return new Date()
  }

  return date
}

function formatDate(value: Date) {
  return value.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatTime(value: Date) {
  return value.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
}

function combineDateAndTime(
  date: Date,
  time: Date,
) {
  const result = new Date(date)

  result.setHours(
    time.getHours(),
    time.getMinutes(),
    0,
    0,
  )

  return result
}

function getDurationMilliseconds(
  start: Date,
  end: Date,
) {
  return end.getTime() - start.getTime()
}

export default function RescheduleBookingScreen({
  bookingId,
  currentStart,
  currentEnd,
  onCompleted,
}: RescheduleBookingScreenProps) {
  const originalStart = useMemo(
    () => parseDate(currentStart),
    [currentStart],
  )

  const originalEnd = useMemo(
    () => parseDate(currentEnd),
    [currentEnd],
  )

  const originalDuration = useMemo(
    () =>
      getDurationMilliseconds(
        originalStart,
        originalEnd,
      ),
    [originalStart, originalEnd],
  )

    const [selectedDate, setSelectedDate] =
    useState(originalStart)

  const [selectedStartTime, setSelectedStartTime] =
    useState(originalStart)

  const tomorrow = useMemo(() => {
    const date = new Date()

    date.setHours(
      0,
      0,
      0,
      0,
    )

    date.setDate(
      date.getDate() + 1,
    )

    return date
  }, [])

  const [showDatePicker, setShowDatePicker] =
    useState(false)

  const [showTimePicker, setShowTimePicker] =
    useState(false)

  const [saving, setSaving] =
    useState(false)

  const selectedStart = useMemo(
    () =>
      combineDateAndTime(
        selectedDate,
        selectedStartTime,
      ),
    [selectedDate, selectedStartTime],
  )

  const selectedEnd = useMemo(
    () =>
      new Date(
        selectedStart.getTime() +
          originalDuration,
      ),
    [selectedStart, originalDuration],
  )

  const hasChanged =
    selectedStart.getTime() !==
    originalStart.getTime()

  const isFuture =
    selectedStart.getTime() > Date.now()

  const durationHours =
    originalDuration / (1000 * 60 * 60)

  function handleDateChange(
    _event: unknown,
    value?: Date,
  ) {
    setShowDatePicker(false)

    if (!value) {
      return
    }

    setSelectedDate(value)
  }

  function handleTimeChange(
    _event: unknown,
    value?: Date,
  ) {
    setShowTimePicker(false)

    if (!value) {
      return
    }

    setSelectedStartTime(value)
  }

  async function handleReschedule() {
    if (saving) {
      return
    }

    if (!hasChanged) {
      Alert.alert(
        'No change',
        'Choose a different date or start time before rescheduling.',
      )
      return
    }

    if (!isFuture) {
      Alert.alert(
        'Choose a future time',
        'The new booking time must be in the future.',
      )
      return
    }

    setSaving(true)

    try {
      await rescheduleCustomerBooking(
        bookingId,
        selectedStart.toISOString(),
        selectedEnd.toISOString(),
      )

      Alert.alert(
        'Booking rescheduled',
        `Your booking is now scheduled for ${formatDate(
          selectedStart,
        )} at ${formatTime(selectedStart)}.`,
        [
          {
            text: 'Continue',
            onPress: onCompleted,
          },
        ],
      )
    } catch (error) {
      Alert.alert(
        'Unable to reschedule',
        error instanceof Error
          ? error.message
          : 'Unable to reschedule the booking. Please try another time.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <ScreenContainer>
      <View style={styles.container}>
        <View style={styles.brandRow}>
          <Image
            source={KvikStaffLogo}
            style={styles.logo}
            resizeMode="contain"
          />

          <Text style={styles.brandLabel}>
            RESCHEDULE
          </Text>
        </View>

        <View style={styles.headingRow}>
          <View style={styles.stepBadge}>
            <Text style={styles.stepBadgeText}>
              ↻
            </Text>
          </View>

          <View style={styles.headingCopy}>
            <Text style={styles.title}>
              Reschedule booking
            </Text>

            <Text style={styles.subtitle}>
              Choose a new start date and time. Your
              booking duration stays the same.
            </Text>
          </View>
        </View>

        <View style={styles.currentCard}>
          <Text style={styles.cardEyebrow}>
            CURRENT SCHEDULE
          </Text>

          <Text style={styles.currentDate}>
            {formatDate(originalStart)}
          </Text>

          <Text style={styles.currentTime}>
            {formatTime(originalStart)} –{' '}
            {formatTime(originalEnd)}
          </Text>

          <Text style={styles.durationText}>
            Duration: {durationHours.toFixed(2)} hours
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>
            New date
          </Text>

          <Pressable
            style={styles.selector}
            onPress={() => setShowDatePicker(true)}
            disabled={saving}
          >
            <View>
              <Text style={styles.selectorLabel}>
                Booking date
              </Text>

              <Text style={styles.selectorValue}>
                {formatDate(selectedDate)}
              </Text>
            </View>

            <Text style={styles.selectorAction}>
              Change
            </Text>
          </Pressable>

                    {showDatePicker ? (
            <DateTimePicker
              value={
                selectedDate.getTime() <
                tomorrow.getTime()
                  ? tomorrow
                  : selectedDate
              }
              mode="date"
              minimumDate={tomorrow}
              onChange={handleDateChange}
            />
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>
            New start time
          </Text>

          <Pressable
            style={styles.selector}
            onPress={() => setShowTimePicker(true)}
            disabled={saving}
          >
            <View>
              <Text style={styles.selectorLabel}>
                Start time
              </Text>

              <Text style={styles.selectorValue}>
                {formatTime(selectedStart)}
              </Text>
            </View>

            <Text style={styles.selectorAction}>
              Change
            </Text>
          </Pressable>

          {showTimePicker ? (
            <DateTimePicker
              value={selectedStartTime}
              mode="time"
              is24Hour={false}
              onChange={handleTimeChange}
            />
          ) : null}
        </View>

        <View style={styles.previewCard}>
          <Text style={styles.cardEyebrow}>
            NEW SCHEDULE
          </Text>

          <Text style={styles.previewDate}>
            {formatDate(selectedStart)}
          </Text>

          <Text style={styles.previewTime}>
            {formatTime(selectedStart)} –{' '}
            {formatTime(selectedEnd)}
          </Text>

          <View style={styles.previewDivider} />

          <Text style={styles.previewNote}>
            Duration remains {durationHours.toFixed(2)}{' '}
            hours.
          </Text>
        </View>

        {!isFuture ? (
          <View style={styles.warningCard}>
            <Text style={styles.warningTitle}>
              Choose a future time
            </Text>

            <Text style={styles.warningText}>
              The selected start time has already passed.
            </Text>
          </View>
        ) : null}

        <Pressable
          style={[
            styles.primaryButton,
            (saving || !hasChanged || !isFuture) &&
              styles.primaryButtonDisabled,
          ]}
          onPress={() => void handleReschedule()}
          disabled={
            saving ||
            !hasChanged ||
            !isFuture
          }
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryButtonText}>
              Confirm reschedule
            </Text>
          )}
        </Pressable>

        <Text style={styles.footerNote}>
          The system will validate operating hours and
          worker availability before changing the booking.
        </Text>
      </View>
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  container: {
    padding: 18,
  },

  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: UI.spacing.lg,
  },

  logo: {
    width: 132,
    height: 44,
  },

  brandLabel: {
    marginLeft: 10,
    color: UI.colors.primaryBlue,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.1,
  },

  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },

  stepBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: UI.colors.primary,
    marginRight: 12,
  },

  stepBadgeText: {
    color: UI.colors.surface,
    fontSize: UI.typography.body,
    fontWeight: '900',
  },

  headingCopy: {
    flex: 1,
  },

  title: {
    color: UI.colors.primary,
    fontSize: 27,
    fontWeight: '800',
  },

  subtitle: {
    marginTop: 5,
    color: '#607789',
    fontSize: 13,
    lineHeight: 19,
  },

  currentCard: {
    padding: 18,
    borderRadius: 18,
    backgroundColor: UI.colors.primary,
    marginBottom: UI.spacing.lg,
  },

  cardEyebrow: {
    color: '#7DDDDD',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },

  currentDate: {
    marginTop: 9,
    color: UI.colors.surface,
    fontSize: 20,
    fontWeight: '800',
  },

  currentTime: {
    marginTop: 5,
    color: '#DCECF5',
    fontSize: UI.typography.bodyLarge,
    fontWeight: '700',
  },

  durationText: {
    marginTop: 9,
    color: '#BFD4E1',
    fontSize: UI.typography.small,
  },

  card: {
    padding: 18,
    borderRadius: UI.radius.lg,
    backgroundColor: UI.colors.surface,
    marginBottom: 14,
  },

  sectionTitle: {
    marginBottom: 11,
    color: UI.colors.primary,
    fontSize: 17,
    fontWeight: '800',
  },

  selector: {
    minHeight: 66,
    paddingHorizontal: 14,
    paddingVertical: UI.spacing.md,
    borderRadius: UI.radius.md,
    borderWidth: 1,
    borderColor: '#DCE7ED',
    backgroundColor: '#F8FBFC',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  selectorLabel: {
    color: '#718493',
    fontSize: UI.typography.caption,
    fontWeight: '700',
  },

  selectorValue: {
    marginTop: 3,
    color: UI.colors.primary,
    fontSize: UI.typography.bodyLarge,
    fontWeight: '800',
  },

  selectorAction: {
    color: '#008A88',
    fontSize: UI.typography.small,
    fontWeight: '900',
  },

  previewCard: {
    padding: 18,
    borderRadius: UI.radius.lg,
    backgroundColor: '#E8F7F7',
    marginBottom: 14,
  },

  previewDate: {
    marginTop: UI.spacing.sm,
    color: UI.colors.primary,
    fontSize: 19,
    fontWeight: '800',
  },

  previewTime: {
    marginTop: UI.spacing.xs,
    color: '#008A88',
    fontSize: UI.typography.bodyLarge,
    fontWeight: '800',
  },

  previewDivider: {
    height: 1,
    marginVertical: 12,
    backgroundColor: '#C6E8E8',
  },

  previewNote: {
    color: '#45616F',
    fontSize: UI.typography.small,
  },

  warningCard: {
    padding: 15,
    borderRadius: 14,
    backgroundColor: '#FFF7E8',
    borderWidth: 1,
    borderColor: '#F2D49A',
    marginBottom: 14,
  },

  warningTitle: {
    color: '#8A5700',
    fontSize: UI.typography.body,
    fontWeight: '800',
  },

  warningText: {
    marginTop: UI.spacing.xs,
    color: '#876A36',
    fontSize: UI.typography.small,
    lineHeight: 18,
  },

  primaryButton: {
    minHeight: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: UI.colors.primaryBlue,
  },

  primaryButtonDisabled: {
    opacity: 0.45,
  },

  primaryButtonText: {
    color: UI.colors.surface,
    fontSize: 15,
    fontWeight: '900',
  },

  footerNote: {
    marginTop: UI.spacing.md,
    marginBottom: 18,
    color: '#7A8D99',
    fontSize: UI.typography.caption,
    lineHeight: 17,
    textAlign: 'center',
  },
})