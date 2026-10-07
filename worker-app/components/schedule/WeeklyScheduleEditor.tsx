import {
  useEffect,
  useState,
} from 'react'

import {
  StyleSheet,
  Text,
  View,
} from 'react-native'

import {
  AppButton,
} from '../ui/AppButton'

import {
  UI,
} from '../../constants/ui'

import {
  SCHEDULE,
} from '../../constants/schedule'

import type {
  WorkerDayOfWeek,
  WorkerWeeklyScheduleInput,
} from '../../types/schedule'

import ScheduleDayRow from './ScheduleDayRow'

import ScheduleTimePicker from './ScheduleTimePicker'

type DayDraft = {
  enabled: boolean
  startTime: string
  endTime: string
}

type WeeklyScheduleEditorProps = {
  value: WorkerWeeklyScheduleInput[]
  onChange: (
    value: WorkerWeeklyScheduleInput[],
  ) => void
  disabled?: boolean
  title?: string
  description?: string
}

const DAY_ORDER: WorkerDayOfWeek[] = [
  0,
  1,
  2,
  3,
  4,
  5,
  6,
]

const DEFAULT_START = '09:00'
const DEFAULT_END = '18:00'

function createDefaultDays(): Record<
  WorkerDayOfWeek,
  DayDraft
> {
  return {
    0: {
      enabled: false,
      startTime: DEFAULT_START,
      endTime: DEFAULT_END,
    },
    1: {
      enabled: true,
      startTime: DEFAULT_START,
      endTime: DEFAULT_END,
    },
    2: {
      enabled: true,
      startTime: DEFAULT_START,
      endTime: DEFAULT_END,
    },
    3: {
      enabled: true,
      startTime: DEFAULT_START,
      endTime: DEFAULT_END,
    },
    4: {
      enabled: true,
      startTime: DEFAULT_START,
      endTime: DEFAULT_END,
    },
    5: {
      enabled: true,
      startTime: DEFAULT_START,
      endTime: DEFAULT_END,
    },
    6: {
      enabled: false,
      startTime: DEFAULT_START,
      endTime: DEFAULT_END,
    },
  }
}

function buildDaysFromValue(
  value: WorkerWeeklyScheduleInput[],
): Record<
  WorkerDayOfWeek,
  DayDraft
> {
  const days =
    createDefaultDays()

  value.forEach(
    schedule => {
      days[
        schedule.dayOfWeek
      ] = {
        enabled:
          schedule.isActive,
        startTime:
          schedule.startTime.slice(
            0,
            5,
          ),
        endTime:
          schedule.endTime.slice(
            0,
            5,
          ),
      }
    },
  )

  return days
}

function areDaysEqual(
  first: Record<
    WorkerDayOfWeek,
    DayDraft
  >,
  second: Record<
    WorkerDayOfWeek,
    DayDraft
  >,
): boolean {
  return DAY_ORDER.every(
    dayOfWeek => {
      const a =
        first[dayOfWeek]

      const b =
        second[dayOfWeek]

      return (
        a.enabled ===
          b.enabled &&
        a.startTime ===
          b.startTime &&
        a.endTime ===
          b.endTime
      )
    },
  )
}

function mapDaysToValue(
  days: Record<
    WorkerDayOfWeek,
    DayDraft
  >,
): WorkerWeeklyScheduleInput[] {
  return DAY_ORDER.map(
    dayOfWeek => ({
      dayOfWeek,
      startTime:
        days[dayOfWeek]
          .startTime,
      endTime:
        days[dayOfWeek]
          .endTime,
      isActive:
        days[dayOfWeek]
          .enabled,
    }),
  )
}

export default function WeeklyScheduleEditor({
  value,
  onChange,
  disabled = false,
  title = 'Weekly availability',
  description = 'Choose the days and hours when you are available for work.',
}: WeeklyScheduleEditorProps) {
  const [
    days,
    setDays,
  ] = useState(
    () =>
      buildDaysFromValue(
        value,
      ),
  )

  const [
    pickerVisible,
    setPickerVisible,
  ] = useState(false)

  const [
    pickerDay,
    setPickerDay,
  ] = useState<
    WorkerDayOfWeek | null
  >(null)

  const [
    pickerMode,
    setPickerMode,
  ] = useState<
    'start' | 'end'
  >('start')

 useEffect(() => {
  let active = true

  const incoming =
    buildDaysFromValue(
      value,
    )

  queueMicrotask(() => {
    if (!active) {
      return
    }

    setDays(current =>
      areDaysEqual(
        current,
        incoming,
      )
        ? current
        : incoming,
    )
  })

  return () => {
    active = false
  }
}, [value])

  function publishDays(
    nextDays: Record<
      WorkerDayOfWeek,
      DayDraft
    >,
  ) {
    setDays(nextDays)
    onChange(
      mapDaysToValue(
        nextDays,
      ),
    )
  }

  function updateDay(
    dayOfWeek: WorkerDayOfWeek,
    patch: Partial<DayDraft>,
  ) {
    const nextDays = {
      ...days,
      [dayOfWeek]: {
        ...days[dayOfWeek],
        ...patch,
      },
    }

    publishDays(
      nextDays,
    )
  }

  function openPicker(
    dayOfWeek: WorkerDayOfWeek,
    mode: 'start' | 'end',
  ) {
    setPickerDay(
      dayOfWeek,
    )

    setPickerMode(
      mode,
    )

    setPickerVisible(
      true,
    )
  }

  function closePicker() {
    setPickerVisible(
      false,
    )

    setPickerDay(
      null,
    )
  }

  function handlePickerSelect(
    selectedTime: string,
  ) {
    if (
      pickerDay === null
    ) {
      return
    }

    if (
      pickerMode ===
      'start'
    ) {
      updateDay(
        pickerDay,
        {
          startTime:
            selectedTime,
        },
      )
    } else {
      updateDay(
        pickerDay,
        {
          endTime:
            selectedTime,
        },
      )
    }

    closePicker()
  }

  function setAllDays(
    enabled: boolean,
  ) {
    const nextDays =
      DAY_ORDER.reduce(
        (
          current,
          dayOfWeek,
        ) => ({
          ...current,
          [dayOfWeek]: {
            ...days[
              dayOfWeek
            ],
            enabled,
          },
        }),
        {} as Record<
          WorkerDayOfWeek,
          DayDraft
        >,
      )

    publishDays(
      nextDays,
    )
  }

  const pickerValue =
    pickerDay === null
      ? DEFAULT_START
      : pickerMode ===
          'start'
        ? days[pickerDay]
            .startTime
        : days[pickerDay]
            .endTime

  const pickerTitle =
    pickerDay === null
      ? 'Select time'
      : `${SCHEDULE.dayLabels.long[pickerDay]} ${
          pickerMode === 'start'
            ? 'start'
            : 'end'
        } time`

  return (
    <View
      style={[
        styles.container,
        disabled &&
          styles.containerDisabled,
      ]}
    >
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
              styles.description
            }
          >
            {description}
          </Text>
        </View>
      </View>

      <View
        style={styles.bulkActions}
      >
        <View
          style={styles.bulkButton}
        >
          <AppButton
            title="Weekdays"
            variant="secondary"
            onPress={() => {
              const nextDays =
                {
                  ...days,
                }

              DAY_ORDER.forEach(
                dayOfWeek => {
                  nextDays[
                    dayOfWeek
                  ] = {
                    ...nextDays[
                      dayOfWeek
                    ],
                    enabled:
                      dayOfWeek >=
                        SCHEDULE.days
                          .monday &&
                      dayOfWeek <=
                        SCHEDULE.days
                          .friday,
                  }
                },
              )

              publishDays(
                nextDays,
              )
            }}
            disabled={
              disabled
            }
          />
        </View>

        <View
          style={styles.bulkButton}
        >
          <AppButton
            title="All days"
            variant="secondary"
            onPress={() => {
              setAllDays(
                true,
              )
            }}
            disabled={
              disabled
            }
          />
        </View>

        <View
          style={styles.bulkButton}
        >
          <AppButton
            title="Clear"
            variant="secondary"
            onPress={() => {
              setAllDays(
                false,
              )
            }}
            disabled={
              disabled
            }
          />
        </View>
      </View>

      <View
        style={styles.days}
      >
        {DAY_ORDER.map(
          dayOfWeek => {
            const day =
              days[dayOfWeek]

            return (
              <View
                key={dayOfWeek}
                style={styles.day}
              >
                <ScheduleDayRow
                  dayOfWeek={
                    dayOfWeek
                  }
                  enabled={
                    day.enabled
                  }
                  startTime={
                    day.startTime
                  }
                  endTime={
                    day.endTime
                  }
                  onEnabledChange={(
                    enabled,
                  ) => {
                    updateDay(
                      dayOfWeek,
                      {
                        enabled,
                      },
                    )
                  }}
                  onStartPress={() => {
                    openPicker(
                      dayOfWeek,
                      'start',
                    )
                  }}
                  onEndPress={() => {
                    openPicker(
                      dayOfWeek,
                      'end',
                    )
                  }}
                  disabled={
                    disabled
                  }
                />
              </View>
            )
          },
        )}
      </View>

      <ScheduleTimePicker
        visible={
          pickerVisible
        }
        value={
          pickerValue
        }
        title={
          pickerTitle
        }
        minimumTime={
          SCHEDULE.time
            .startOfDay
        }
        maximumTime={
          SCHEDULE.time
            .endOfDay
        }
        onSelect={
          handlePickerSelect
        }
        onClose={
          closePicker
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },

  containerDisabled: {
    opacity: 0.65,
  },

  header: {
    flexDirection:
      'row',
    alignItems:
      'flex-start',
  },

  headerCopy: {
    flex: 1,
  },

  title: {
    fontSize:
      UI.typography.subtitle,
    fontWeight: '800',
    color:
      UI.colors.text,
  },

  description: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.small,
    lineHeight: 18,
    color:
      UI.colors.textSecondary,
  },

  bulkActions: {
    flexDirection:
      'row',
    marginTop:
      UI.spacing.lg,
    marginLeft:
      -UI.spacing.xs,
  },

  bulkButton: {
    flex: 1,
    marginLeft:
      UI.spacing.xs,
  },

  days: {
    marginTop:
      UI.spacing.lg,
  },

  day: {
    marginBottom:
      UI.spacing.md,
  },
})