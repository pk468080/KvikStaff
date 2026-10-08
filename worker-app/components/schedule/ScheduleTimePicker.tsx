import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import {
  UI,
} from '../../constants/ui'

type ScheduleTimePickerProps = {
  visible: boolean
  value: string
  title?: string
  minimumTime?: string
  maximumTime?: string
  onSelect: (
    value: string,
  ) => void
  onClose: () => void
}

function parseTime(
  value: string,
): number {
  const [hours, minutes] =
    value.split(':').map(Number)

  if (
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes)
  ) {
    return -1
  }

  return hours * 60 + minutes
}

function formatTime(
  totalMinutes: number,
): string {
  const hours = Math.floor(
    totalMinutes / 60,
  )

  const minutes =
    totalMinutes % 60

  return `${String(hours).padStart(
    2,
    '0',
  )}:${String(minutes).padStart(
    2,
    '0',
  )}`
}

function formatDisplayTime(
  value: string,
): string {
  const totalMinutes =
    parseTime(value)

  if (totalMinutes < 0) {
    return value
  }

  const hours = Math.floor(
    totalMinutes / 60,
  )

  const minutes =
    totalMinutes % 60

  const period =
    hours >= 12 ? 'PM' : 'AM'

  const displayHours =
    hours % 12 || 12

  return `${displayHours}:${String(
    minutes,
  ).padStart(2, '0')} ${period}`
}

export default function ScheduleTimePicker({
  visible,
  value,
  title = 'Select time',
  minimumTime = '00:00',
  maximumTime = '23:59',
  onSelect,
  onClose,
}: ScheduleTimePickerProps) {
  const minimumMinutes =
    parseTime(minimumTime)

  const maximumMinutes =
    parseTime(maximumTime)

  const selectedMinutes =
    parseTime(value)

  const start =
    minimumMinutes >= 0
      ? minimumMinutes
      : 0

  const end =
    maximumMinutes >= start
      ? maximumMinutes
      : 23 * 60 + 59

  const normalizedSelected =
    selectedMinutes >= start &&
    selectedMinutes <= end
      ? selectedMinutes
      : start

  const timeOptions: string[] = []

  for (
    let minutes = start;
    minutes <= end;
    minutes += 30
  ) {
    timeOptions.push(
      formatTime(minutes),
    )
  }

  if (
    timeOptions.length === 0 ||
    timeOptions[
      timeOptions.length - 1
    ] !== formatTime(end)
  ) {
    timeOptions.push(
      formatTime(end),
    )
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={
        onClose
      }
    >
      <View style={styles.overlay}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
        />

        <View
          style={styles.sheet}
        >
          <View style={styles.handle} />

          <View
            style={styles.header}
          >
            <View
              style={styles.headerCopy}
            >
              <Text
                style={
                  styles.title
                }
              >
                {title}
              </Text>

              <Text
                style={
                  styles.selectedText
                }
              >
                {formatDisplayTime(
                  formatTime(
                    normalizedSelected,
                  ),
                )}
              </Text>
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.closeButton,
                pressed &&
                  styles.pressed,
              ]}
              onPress={onClose}
            >
              <Text
                style={
                  styles.closeText
                }
              >
                Close
              </Text>
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={
              styles.options
            }
            showsVerticalScrollIndicator={
              false
            }
          >
            {timeOptions.map(
              option => {
                const optionMinutes =
                  parseTime(
                    option,
                  )

                const selected =
                  optionMinutes ===
                  normalizedSelected

                return (
                  <Pressable
                    key={option}
                    style={({
                      pressed,
                    }) => [
                      styles.option,
                      selected &&
                        styles.optionSelected,
                      pressed &&
                        styles.pressed,
                    ]}
                    onPress={() => {
                      onSelect(
                        option,
                      )
                    }}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        selected &&
                          styles.optionTextSelected,
                      ]}
                    >
                      {formatDisplayTime(
                        option,
                      )}
                    </Text>

                    {selected ? (
                      <Text
                        style={
                          styles.check
                        }
                      >
                        Selected
                      </Text>
                    ) : null}
                  </Pressable>
                )
              },
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent:
      'flex-end',
    backgroundColor:
      'rgba(11, 31, 51, 0.45)',
  },

  backdrop: {
  ...StyleSheet.absoluteFill,
},

  sheet: {
    maxHeight: '82%',
    paddingTop: UI.spacing.sm,
    paddingHorizontal:
      UI.spacing.xl,
    paddingBottom:
      UI.spacing.xxxl,
    borderTopLeftRadius:
      UI.radius.xl,
    borderTopRightRadius:
      UI.radius.xl,
    backgroundColor:
      UI.colors.surface,
  },

  handle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    marginBottom:
      UI.spacing.lg,
    borderRadius:
      UI.radius.pill,
    backgroundColor:
      UI.colors.border,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent:
      'space-between',
    marginBottom:
      UI.spacing.md,
  },

  headerCopy: {
    flex: 1,
    paddingRight:
      UI.spacing.md,
  },

  title: {
    fontSize:
      UI.typography.subtitle,
    fontWeight: '800',
    color: UI.colors.text,
  },

  selectedText: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.small,
    color:
      UI.colors.textSecondary,
  },

  closeButton: {
    minHeight: 40,
    justifyContent:
      'center',
    paddingHorizontal:
      UI.spacing.sm,
  },

  closeText: {
    fontSize:
      UI.typography.body,
    fontWeight: '700',
    color:
      UI.colors.primaryBlue,
  },

  options: {
    paddingTop:
      UI.spacing.xs,
    paddingBottom:
      UI.spacing.lg,
  },

  option: {
    minHeight: 52,
    marginBottom:
      UI.spacing.sm,
    paddingHorizontal:
      UI.spacing.lg,
    borderRadius:
      UI.radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent:
      'space-between',
    backgroundColor:
      UI.colors.background,
    borderWidth: 1,
    borderColor:
      UI.colors.border,
  },

  optionSelected: {
    backgroundColor:
      UI.colors.infoBackground,
    borderColor:
      UI.colors.primaryBlue,
  },

  optionText: {
    fontSize:
      UI.typography.bodyLarge,
    fontWeight: '600',
    color: UI.colors.text,
  },

  optionTextSelected: {
    fontWeight: '800',
    color:
      UI.colors.primaryBlue,
  },

  check: {
    fontSize:
      UI.typography.small,
    fontWeight: '700',
    color:
      UI.colors.primaryBlue,
  },

  pressed: {
    opacity: 0.75,
  },
})