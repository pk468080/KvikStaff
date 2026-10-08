import {
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native'

import {
  UI,
} from '../../constants/ui'

import {
  SCHEDULE,
} from '../../constants/schedule'

import type {
  WorkerDayOfWeek,
} from '../../types/schedule'

type ScheduleDayRowProps = {
  dayOfWeek: WorkerDayOfWeek
  enabled: boolean
  startTime: string
  endTime: string
  onEnabledChange: (
    value: boolean,
  ) => void
  onStartPress?: () => void
  onEndPress?: () => void
  disabled?: boolean
}

function formatTime(
  value: string,
): string {
  const parts = value.split(':')

  if (parts.length < 2) {
    return value
  }

  const hours = Number(parts[0])
  const minutes = Number(parts[1])

  if (
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes)
  ) {
    return value
  }

  const period =
    hours >= 12 ? 'PM' : 'AM'

  const normalizedHours =
    hours % 12 || 12

  return `${normalizedHours}:${String(
    minutes,
  ).padStart(2, '0')} ${period}`
}

export default function ScheduleDayRow({
  dayOfWeek,
  enabled,
  startTime,
  endTime,
  onEnabledChange,
  onStartPress,
  onEndPress,
  disabled = false,
}: ScheduleDayRowProps) {
  const label =
    SCHEDULE.dayLabels.long[
      dayOfWeek
    ]

  return (
    <View
      style={[
        styles.container,
        disabled &&
          styles.containerDisabled,
      ]}
    >
      <View style={styles.topRow}>
        <View style={styles.dayCopy}>
          <Text style={styles.dayLabel}>
            {label}
          </Text>

          <Text
            style={[
              styles.stateLabel,
              enabled
                ? styles.stateEnabled
                : styles.stateDisabled,
            ]}
          >
            {enabled
              ? 'Available'
              : 'Unavailable'}
          </Text>
        </View>

        <Switch
          value={enabled}
          onValueChange={
            onEnabledChange
          }
          disabled={disabled}
          trackColor={{
            false:
              UI.colors.border,
            true:
              UI.colors.primaryBlue,
          }}
          thumbColor={
            UI.colors.surface
          }
          ios_backgroundColor={
            UI.colors.border
          }
        />
      </View>

      {enabled ? (
        <View style={styles.timeRow}>
          <View style={styles.timeColumn}>
            <Text style={styles.timeLabel}>
              Start
            </Text>

            <Pressable
              style={({ pressed }) => [
                styles.timeButton,
                pressed &&
                  styles.timeButtonPressed,
                disabled &&
                  styles.timeButtonDisabled,
              ]}
              onPress={onStartPress}
              disabled={
                disabled ||
                !onStartPress
              }
            >
              <Text
                style={[
                  styles.timeValue,
                  disabled &&
                    styles.disabledText,
                ]}
              >
                {formatTime(
                  startTime,
                )}
              </Text>
            </Pressable>
          </View>

          <View style={styles.separator}>
            <Text style={styles.separatorText}>
              to
            </Text>
          </View>

          <View style={styles.timeColumn}>
            <Text style={styles.timeLabel}>
              End
            </Text>

            <Pressable
              style={({ pressed }) => [
                styles.timeButton,
                pressed &&
                  styles.timeButtonPressed,
                disabled &&
                  styles.timeButtonDisabled,
              ]}
              onPress={onEndPress}
              disabled={
                disabled ||
                !onEndPress
              }
            >
              <Text
                style={[
                  styles.timeValue,
                  disabled &&
                    styles.disabledText,
                ]}
              >
                {formatTime(
                  endTime,
                )}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Text style={styles.unavailableText}>
          This day is not included in your
          weekly availability.
        </Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    padding: UI.spacing.lg,
    borderRadius: UI.radius.lg,
    backgroundColor:
      UI.colors.surface,
    borderWidth: 1,
    borderColor:
      UI.colors.border,
  },

  containerDisabled: {
    opacity: 0.65,
  },

  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent:
      'space-between',
  },

  dayCopy: {
    flex: 1,
    paddingRight: UI.spacing.md,
  },

  dayLabel: {
    fontSize:
      UI.typography.bodyLarge,
    fontWeight: '800',
    color: UI.colors.text,
  },

  stateLabel: {
    marginTop: UI.spacing.xs,
    fontSize:
      UI.typography.small,
  },

  stateEnabled: {
    color: UI.colors.success,
  },

  stateDisabled: {
    color: UI.colors.textMuted,
  },

  timeRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: UI.spacing.lg,
  },

  timeColumn: {
    flex: 1,
  },

  timeLabel: {
    marginBottom: UI.spacing.xs,
    fontSize:
      UI.typography.caption,
    fontWeight: '700',
    color:
      UI.colors.textSecondary,
  },

  timeButton: {
    minHeight: 48,
    justifyContent:
      'center',
    paddingHorizontal:
      UI.spacing.md,
    borderRadius:
      UI.radius.md,
    backgroundColor:
      UI.colors.background,
    borderWidth: 1,
    borderColor:
      UI.colors.inputBorder,
  },

  timeButtonPressed: {
    opacity: 0.75,
  },

  timeButtonDisabled: {
    backgroundColor:
      UI.colors.background,
  },

  timeValue: {
    fontSize:
      UI.typography.body,
    fontWeight: '700',
    color: UI.colors.text,
  },

  disabledText: {
    color: UI.colors.disabled,
  },

  separator: {
    width: 34,
    alignItems: 'center',
    justifyContent:
      'flex-end',
    paddingBottom: 14,
  },

  separatorText: {
    fontSize:
      UI.typography.caption,
    color:
      UI.colors.textMuted,
  },

  unavailableText: {
    marginTop: UI.spacing.md,
    fontSize:
      UI.typography.small,
    lineHeight: 18,
    color:
      UI.colors.textMuted,
  },
})