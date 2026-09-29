import {
  useEffect,
  useMemo,
  useState,
} from 'react'

import type {
  ReactNode,
} from 'react'

import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

import {
  Ionicons,
} from '@expo/vector-icons'

import {
  AppButton,
} from '../../components/ui/AppButton'

import {
  ScreenContainer,
} from '../../components/layout/ScreenContainer'

import ErrorState from '../../components/ui/ErrorState'

import {
  UI,
} from '../../constants/ui'

import {
  SCHEDULE,
} from '../../constants/schedule'

import {
  useWorkerSchedule,
} from '../../hooks/useWorkerSchedule'

import type {
  WorkerDayOfWeek,
  WorkerScheduleException,
  WorkerScheduleExceptionType,
  WorkerWeeklySchedule,
} from '../../types/schedule'

import {
  isValidTimeString,
} from '../../lib/workerScheduleUtils'

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

const EXCEPTION_TYPES: WorkerScheduleExceptionType[] = [
  'unavailable',
  'available',
]

type WorkerScheduleScreenProps = {
  onBack?: () => void
}

function formatTime(
  value: string | null,
): string {
  return value
    ? value.slice(0, 5)
    : ''
}

function validateTime(
  value: string,
): boolean {
  return isValidTimeString(value)
}

function validateDate(
  value: string,
): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }

  const [
    year,
    month,
    day,
  ] = value
    .split('-')
    .map(Number)

  const daysInMonth = [
    31,
    28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ]

  if (
    month < 1 ||
    month > 12
  ) {
    return false
  }

  let maximumDay =
    daysInMonth[month - 1]

  const isLeapYear =
    year % 4 === 0 &&
    (
      year % 100 !== 0 ||
      year % 400 === 0
    )

  if (
    month === 2 &&
    isLeapYear
  ) {
    maximumDay = 29
  }

  return (
    day >= 1 &&
    day <= maximumDay
  )
}

function getScheduleForDay(
  schedules: WorkerWeeklySchedule[],
  dayOfWeek: WorkerDayOfWeek,
): WorkerWeeklySchedule | undefined {
  return schedules.find(
    schedule =>
      schedule.dayOfWeek === dayOfWeek,
  )
}

function sortExceptions(
  exceptions: WorkerScheduleException[],
): WorkerScheduleException[] {
  return [...exceptions].sort(
    (a, b) => {
      const dateComparison =
        a.exceptionDate.localeCompare(
          b.exceptionDate,
        )

      if (dateComparison !== 0) {
        return dateComparison
      }

      return (
        (a.startTime ?? '').localeCompare(
          b.startTime ?? '',
        )
      )
    },
  )
}

function SectionHeading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string
  title: string
  subtitle?: string
}) {
  return (
    <View style={styles.sectionHeading}>
      <Text style={styles.sectionEyebrow}>
        {eyebrow}
      </Text>

      <Text style={styles.sectionTitle}>
        {title}
      </Text>

      {subtitle ? (
        <Text style={styles.sectionSubtitle}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  )
}

function SettingRow({
  icon,
  label,
  description,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap
  label: string
  description: string
  children: ReactNode
}) {
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingIcon}>
        <Ionicons
          name={icon}
          size={19}
          color={UI.colors.secondary}
        />
      </View>

      <View style={styles.settingCopy}>
        <Text style={styles.settingLabel}>
          {label}
        </Text>

        <Text style={styles.settingDescription}>
          {description}
        </Text>
      </View>

      <View style={styles.settingControl}>
        {children}
      </View>
    </View>
  )
}

export default function WorkerScheduleScreen({
  onBack,
}: WorkerScheduleScreenProps) {
  const {
    schedule,
    loading,
    saving,
    error,
    refresh,
    replaceWeeklySchedules,
    setSettings,
    createException,
    deleteException,
  } = useWorkerSchedule()

  const [
    refreshing,
    setRefreshing,
  ] = useState(false)

  const [
    timezone,
    setTimezone,
  ] = useState<string>(
    SCHEDULE.defaults.timezone,
  )

  const [
    slotIntervalMinutes,
    setSlotIntervalMinutes,
  ] = useState(
    String(
      SCHEDULE.defaults
        .slotIntervalMinutes,
    ),
  )

  const [draftDays, setDraftDays] =
  useState<
    Record<
      WorkerDayOfWeek,
      {
        enabled: boolean
        startTime: string
        endTime: string
      }
    >
  >({
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
  })

  const [
    exceptionDate,
    setExceptionDate,
  ] = useState('')

  const [
    exceptionType,
    setExceptionType,
  ] = useState<WorkerScheduleExceptionType>(
    'unavailable',
  )

  const [
    exceptionStart,
    setExceptionStart,
  ] = useState('')

  const [
    exceptionEnd,
    setExceptionEnd,
  ] = useState('')

  const [
    exceptionReason,
    setExceptionReason,
  ] = useState('')

  const [
    localError,
    setLocalError,
  ] = useState('')

  const [
    savingSettings,
    setSavingSettings,
  ] = useState(false)

  const [
    savingException,
    setSavingException,
  ] = useState(false)

  const activeDayCount = useMemo(
    () =>
      Object.values(draftDays).filter(
        day => day.enabled,
      ).length,
    [draftDays],
  )

  const activeDayHours = useMemo(() => {
    return DAY_ORDER.reduce(
      (total, dayOfWeek) => {
        const day = draftDays[dayOfWeek]

        if (!day.enabled) {
          return total
        }

        const [startHour, startMinute] =
          day.startTime.split(':').map(Number)
        const [endHour, endMinute] =
          day.endTime.split(':').map(Number)

        if (
          !Number.isFinite(startHour) ||
          !Number.isFinite(startMinute) ||
          !Number.isFinite(endHour) ||
          !Number.isFinite(endMinute)
        ) {
          return total
        }

        const duration =
          endHour * 60 +
          endMinute -
          (startHour * 60 + startMinute)

        return duration > 0
          ? total + duration / 60
          : total
      },
      0,
    )
  }, [draftDays])

  const exceptions = useMemo(
    () =>
      sortExceptions(
        schedule?.exceptions ?? [],
      ),
    [schedule?.exceptions],
  )

  useEffect(() => {
    if (!schedule) {
      return
    }

    setTimezone(
      schedule.settings?.timezone ??
        SCHEDULE.defaults.timezone,
    )

    setSlotIntervalMinutes(
      String(
        schedule.settings
          ?.slotIntervalMinutes ??
          SCHEDULE.defaults
            .slotIntervalMinutes,
      ),
    )

    setDraftDays(current => {
      const next = {
        ...current,
      }

      DAY_ORDER.forEach(
        dayOfWeek => {
          const saved =
            getScheduleForDay(
              schedule.weeklySchedules,
              dayOfWeek,
            )

          if (saved) {
            next[dayOfWeek] = {
              enabled: saved.isActive,
              startTime: formatTime(
                saved.startTime,
              ),
              endTime: formatTime(
                saved.endTime,
              ),
            }
          }
        },
      )

      return next
    })
  }, [schedule])

  async function handleRefresh() {
    if (refreshing || saving || savingSettings || savingException) {
      return
    }

    setRefreshing(true)

    try {
      await refresh()
    } finally {
      setRefreshing(false)
    }
  }

  function updateDay(
    dayOfWeek: WorkerDayOfWeek,
    patch: Partial<{
      enabled: boolean
      startTime: string
      endTime: string
    }>,
  ) {
    setLocalError('')

    setDraftDays(current => ({
      ...current,
      [dayOfWeek]: {
        ...current[dayOfWeek],
        ...patch,
      },
    }))
  }

  function validateWeeklyForm(): string | null {
    const interval = Number(
      slotIntervalMinutes,
    )

    if (!timezone.trim()) {
      return 'Timezone is required.'
    }

    if (
      !Number.isInteger(interval) ||
      interval <
        SCHEDULE.validation
          .minimumSlotIntervalMinutes ||
      interval >
        SCHEDULE.validation
          .maximumSlotIntervalMinutes
    ) {
      return `Slot interval must be between ${SCHEDULE.validation.minimumSlotIntervalMinutes} and ${SCHEDULE.validation.maximumSlotIntervalMinutes} minutes.`
    }

    if (activeDayCount === 0) {
      return 'Enable at least one working day.'
    }

    for (const dayOfWeek of DAY_ORDER) {
      const day = draftDays[dayOfWeek]

      if (!day.enabled) {
        continue
      }

      if (
        !validateTime(day.startTime) ||
        !validateTime(day.endTime)
      ) {
        return `${SCHEDULE.dayLabels.long[dayOfWeek]} must use HH:MM format.`
      }

      if (day.startTime >= day.endTime) {
        return `${SCHEDULE.dayLabels.long[dayOfWeek]} end time must be after start time.`
      }
    }

    return null
  }

  async function handleSaveWeekly() {
    if (saving || savingSettings) {
      return
    }

    setLocalError('')

    const validationError =
      validateWeeklyForm()

    if (validationError) {
      setLocalError(validationError)
      return
    }

    setSavingSettings(true)

    try {
      await replaceWeeklySchedules(
        DAY_ORDER.map(dayOfWeek => ({
          dayOfWeek,
          startTime:
            draftDays[dayOfWeek].startTime,
          endTime:
            draftDays[dayOfWeek].endTime,
          isActive:
            draftDays[dayOfWeek].enabled,
        })),
      )

      await setSettings({
        timezone: timezone.trim(),
        slotIntervalMinutes: Number(
          slotIntervalMinutes,
        ),
      })

      Alert.alert(
        'Schedule saved',
        'Your weekly worker schedule has been updated.',
      )
    } catch {
      // The schedule hook exposes the server error through `error`.
    } finally {
      setSavingSettings(false)
    }
  }

  function validateExceptionForm(): string | null {
    if (!validateDate(exceptionDate.trim())) {
      return 'Enter a valid exception date in YYYY-MM-DD format.'
    }

    const hasStart =
      exceptionStart.trim().length > 0
    const hasEnd =
      exceptionEnd.trim().length > 0

    if (hasStart !== hasEnd) {
      return 'Exception start and end times must be provided together.'
    }

    if (hasStart && hasEnd) {
      if (
        !validateTime(exceptionStart.trim()) ||
        !validateTime(exceptionEnd.trim())
      ) {
        return 'Exception times must use HH:MM format.'
      }

      if (
        exceptionStart.trim() >=
        exceptionEnd.trim()
      ) {
        return 'Exception end time must be after the start time.'
      }
    }

    if (
      exceptionReason.trim().length > 0 &&
      exceptionReason.trim().length > 200
    ) {
      return 'Exception reason must be 200 characters or fewer.'
    }

    return null
  }

  async function handleAddException() {
    if (saving || savingException) {
      return
    }

    setLocalError('')

    const validationError =
      validateExceptionForm()

    if (validationError) {
      setLocalError(validationError)
      return
    }

    setSavingException(true)

    try {
      await createException({
        exceptionDate:
          exceptionDate.trim(),
        exceptionType,
        startTime:
          exceptionStart.trim()
            ? exceptionStart.trim()
            : null,
        endTime:
          exceptionEnd.trim()
            ? exceptionEnd.trim()
            : null,
        reason:
          exceptionReason.trim()
            ? exceptionReason.trim()
            : null,
        isActive: true,
      })

      setExceptionDate('')
      setExceptionStart('')
      setExceptionEnd('')
      setExceptionReason('')
      setExceptionType('unavailable')

      Alert.alert(
        'Exception added',
        'Your schedule exception has been saved.',
      )
    } catch {
      // The schedule hook exposes the server error through `error`.
    } finally {
      setSavingException(false)
    }
  }

  function handleDeleteException(
    exception: WorkerScheduleException,
  ) {
    Alert.alert(
      'Delete exception',
      `Remove the ${exception.exceptionDate} schedule exception?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void deleteException(exception.id)
          },
        },
      ],
    )
  }

  const isBusy =
    saving ||
    savingSettings ||
    savingException

  if (loading && !schedule) {
    return (
      <ScreenContainer>
        <View style={styles.loadingContainer}>
          <View style={styles.loadingIcon}>
            <Ionicons
              name="calendar-outline"
              size={26}
              color={UI.colors.secondary}
            />
          </View>

          <ActivityIndicator
            size="small"
            color={UI.colors.secondary}
          />

          <Text style={styles.loadingTitle}>
            Loading your schedule
          </Text>

          <Text style={styles.loadingText}>
            Fetching weekly availability and schedule exceptions.
          </Text>
        </View>
      </ScreenContainer>
    )
  }

  if (error && !schedule) {
    return (
      <ScreenContainer>
        <ErrorState
          title="Schedule unavailable"
          message={error}
          onAction={() => {
            void refresh()
          }}
        />
      </ScreenContainer>
    )
  }

  return (
    <ScreenContainer>
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={
          Platform.OS === 'ios'
            ? 'padding'
            : undefined
        }
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                void handleRefresh()
              }}
              tintColor={UI.colors.secondary}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.topBar}>
            {onBack ? (
              <Pressable
                onPress={onBack}
                disabled={isBusy}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Go back"
                style={({ pressed }) => [
                  styles.headerButton,
                  pressed && styles.headerButtonPressed,
                  isBusy && styles.headerButtonDisabled,
                ]}
              >
                <Ionicons
                  name="arrow-back"
                  size={21}
                  color={UI.colors.primary}
                />
              </Pressable>
            ) : (
              <View style={styles.headerButtonPlaceholder} />
            )}

            <View style={styles.topBarCenter}>
              <Text style={styles.topBarEyebrow}>
                TEMPSTAFF
              </Text>

              <Text style={styles.topBarTitle}>
                Availability
              </Text>
            </View>

            <Pressable
              onPress={() => {
                void handleRefresh()
              }}
              disabled={refreshing || isBusy}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Refresh schedule"
              style={({ pressed }) => [
                styles.headerButton,
                pressed && styles.headerButtonPressed,
                (refreshing || isBusy) && styles.headerButtonDisabled,
              ]}
            >
              <Ionicons
                name="refresh"
                size={20}
                color={UI.colors.primary}
              />
            </Pressable>
          </View>

          <View style={styles.heroCard}>
            <View style={styles.heroTopRow}>
              <View style={styles.heroIcon}>
                <Ionicons
                  name="time-outline"
                  size={26}
                  color={UI.colors.primary}
                />
              </View>

              <View style={styles.heroBadge}>
                <View style={styles.heroBadgeDot} />
                <Text style={styles.heroBadgeText}>
                  {activeDayCount} active day{activeDayCount === 1 ? '' : 's'}
                </Text>
              </View>
            </View>

            <Text style={styles.heroEyebrow}>
              YOUR WORKING HOURS
            </Text>

            <Text style={styles.heroTitle}>
              Control when you can receive jobs
            </Text>

            <Text style={styles.heroSubtitle}>
              Keep your weekly hours accurate so assignments can be matched against your real availability.
            </Text>

            <View style={styles.heroMetrics}>
              <View style={styles.heroMetric}>
                <Text style={styles.heroMetricValue}>
                  {activeDayCount}
                </Text>
                <Text style={styles.heroMetricLabel}>
                  Working days
                </Text>
              </View>

              <View style={styles.heroMetricDivider} />

              <View style={styles.heroMetric}>
                <Text style={styles.heroMetricValue}>
                  {Number.isFinite(activeDayHours)
                    ? activeDayHours.toFixed(1)
                    : '0.0'}h
                </Text>
                <Text style={styles.heroMetricLabel}>
                  Weekly hours
                </Text>
              </View>

              <View style={styles.heroMetricDivider} />

              <View style={styles.heroMetric}>
                <Text style={styles.heroMetricValue}>
                  {slotIntervalMinutes}m
                </Text>
                <Text style={styles.heroMetricLabel}>
                  Slot interval
                </Text>
              </View>
            </View>
          </View>

          {(localError || error) ? (
            <View style={styles.errorBox}>
              <View style={styles.errorIcon}>
                <Ionicons
                  name="alert-circle-outline"
                  size={18}
                  color={UI.colors.error}
                />
              </View>

              <View style={styles.errorCopy}>
                <Text style={styles.errorTitle}>
                  Schedule issue
                </Text>

                <Text style={styles.errorText}>
                  {localError || error}
                </Text>
              </View>
            </View>
          ) : null}

          <View style={styles.section}>
            <SectionHeading
              eyebrow="SETTINGS"
              title="Scheduling preferences"
              subtitle="These values control how your availability is stored and matched."
            />

            <View style={styles.card}>
              <SettingRow
                icon="globe-outline"
                label="Timezone"
                description="Used when interpreting your working hours."
              >
                <TextInput
                  value={timezone}
                  onChangeText={value => {
                    setTimezone(value)
                    setLocalError('')
                  }}
                  placeholder="Asia/Kolkata"
                  placeholderTextColor={UI.colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!isBusy}
                  style={styles.compactInput}
                />
              </SettingRow>

              <View style={styles.rowDivider} />

              <SettingRow
                icon="timer-outline"
                label="Slot interval"
                description="Length of available booking slots in minutes."
              >
                <View style={styles.intervalControl}>
                  <TextInput
                    value={slotIntervalMinutes}
                    onChangeText={value => {
                      setSlotIntervalMinutes(
                        value.replace(/\D/g, ''),
                      )
                      setLocalError('')
                    }}
                    placeholder="30"
                    placeholderTextColor={UI.colors.textMuted}
                    keyboardType="number-pad"
                    maxLength={3}
                    editable={!isBusy}
                    style={styles.intervalInput}
                  />

                  <Text style={styles.intervalSuffix}>
                    min
                  </Text>
                </View>
              </SettingRow>
            </View>
          </View>

          <View style={styles.section}>
            <SectionHeading
              eyebrow="WEEKLY AVAILABILITY"
              title="Your recurring hours"
              subtitle="Enable a day and define the hours when you are ready to accept work."
            />

            <View style={styles.card}>
              {DAY_ORDER.map(
                (dayOfWeek, index) => {
                  const day = draftDays[dayOfWeek]

                  return (
                    <View
                      key={dayOfWeek}
                      style={[
                        styles.dayRow,
                        index > 0 && styles.rowDivider,
                      ]}
                    >
                      <View style={styles.dayTopRow}>
                        <View style={styles.dayBadge}>
                          <Text style={styles.dayBadgeText}>
                            {SCHEDULE.dayLabels.short[dayOfWeek].slice(0, 1)}
                          </Text>
                        </View>

                        <View style={styles.dayCopy}>
                          <Text style={styles.dayName}>
                            {SCHEDULE.dayLabels.long[dayOfWeek]}
                          </Text>

                          <Text style={styles.dayStatus}>
                            {day.enabled
                              ? `${day.startTime} – ${day.endTime}`
                              : 'Unavailable'}
                          </Text>
                        </View>

                        <Pressable
                          onPress={() => {
                            updateDay(dayOfWeek, {
                              enabled: !day.enabled,
                            })
                          }}
                          disabled={isBusy}
                          accessibilityRole="switch"
                          accessibilityState={{
                            checked: day.enabled,
                            disabled: isBusy,
                          }}
                          accessibilityLabel={`${SCHEDULE.dayLabels.long[dayOfWeek]} availability`}
                          style={({ pressed }) => [
                            styles.toggle,
                            day.enabled && styles.toggleActive,
                            pressed && styles.togglePressed,
                            isBusy && styles.toggleDisabled,
                          ]}
                        >
                          <View
                            style={[
                              styles.toggleThumb,
                              day.enabled && styles.toggleThumbActive,
                            ]}
                          >
                            {day.enabled ? (
                              <Ionicons
                                name="checkmark"
                                size={14}
                                color={UI.colors.secondary}
                              />
                            ) : null}
                          </View>
                        </Pressable>
                      </View>

                      {day.enabled ? (
                        <View style={styles.timeRow}>
                          <View style={styles.timeField}>
                            <Text style={styles.timeLabel}>
                              Start
                            </Text>

                            <TextInput
                              value={day.startTime}
                              onChangeText={value => {
                                updateDay(dayOfWeek, {
                                  startTime: value,
                                })
                              }}
                              placeholder="09:00"
                              placeholderTextColor={UI.colors.textMuted}
                              autoCapitalize="none"
                              autoCorrect={false}
                              maxLength={5}
                              editable={!isBusy}
                              style={styles.timeInput}
                            />
                          </View>

                          <View style={styles.timeArrow}>
                            <Ionicons
                              name="arrow-forward-outline"
                              size={17}
                              color={UI.colors.textMuted}
                            />
                          </View>

                          <View style={styles.timeField}>
                            <Text style={styles.timeLabel}>
                              End
                            </Text>

                            <TextInput
                              value={day.endTime}
                              onChangeText={value => {
                                updateDay(dayOfWeek, {
                                  endTime: value,
                                })
                              }}
                              placeholder="18:00"
                              placeholderTextColor={UI.colors.textMuted}
                              autoCapitalize="none"
                              autoCorrect={false}
                              maxLength={5}
                              editable={!isBusy}
                              style={styles.timeInput}
                            />
                          </View>
                        </View>
                      ) : null}
                    </View>
                  )
                },
              )}

              <View style={styles.saveAction}>
                <AppButton
                  title={
                    savingSettings
                      ? 'Saving schedule...'
                      : 'Save weekly schedule'
                  }
                  onPress={() => {
                    void handleSaveWeekly()
                  }}
                  disabled={isBusy}
                />
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <SectionHeading
              eyebrow="DATE-SPECIFIC EXCEPTIONS"
              title="Override a working day"
              subtitle="Use an exception when one date should differ from your normal weekly schedule."
            />

            <View style={styles.card}>
              <View style={styles.field}>
                <Text style={styles.label}>
                  Date
                </Text>

                <View style={styles.inputWithIcon}>
                  <Ionicons
                    name="calendar-outline"
                    size={18}
                    color={UI.colors.textMuted}
                  />

                  <TextInput
                    value={exceptionDate}
                    onChangeText={value => {
                      setExceptionDate(value)
                      setLocalError('')
                    }}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={UI.colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={10}
                    editable={!isBusy}
                    style={styles.inputWithIconText}
                  />
                </View>
              </View>

              <Text style={styles.label}>
                Exception type
              </Text>

              <View style={styles.typeRow}>
                {EXCEPTION_TYPES.map(type => {
                  const selected = exceptionType === type

                  return (
                    <Pressable
                      key={type}
                      onPress={() => {
                        setExceptionType(type)
                        setLocalError('')
                      }}
                      disabled={isBusy}
                      accessibilityRole="radio"
                      accessibilityState={{
                        checked: selected,
                        disabled: isBusy,
                      }}
                      style={({ pressed }) => [
                        styles.typeCard,
                        selected && styles.typeCardSelected,
                        pressed && styles.typeCardPressed,
                        isBusy && styles.typeCardDisabled,
                      ]}
                    >
                      <View style={[
                        styles.typeIcon,
                        selected && styles.typeIconSelected,
                      ]}>
                        <Ionicons
                          name={
                            type === 'unavailable'
                              ? 'close-circle-outline'
                              : 'add-circle-outline'
                          }
                          size={19}
                          color={
                            selected
                              ? UI.colors.secondary
                              : UI.colors.textMuted
                          }
                        />
                      </View>

                      <View style={styles.typeCopy}>
                        <Text style={styles.typeTitle}>
                          {SCHEDULE.labels.exceptionType[type]}
                        </Text>

                        <Text style={styles.typeDescription}>
                          {type === 'unavailable'
                            ? 'Block jobs for this date.'
                            : 'Add availability beyond the normal schedule.'}
                        </Text>
                      </View>
                    </Pressable>
                  )
                })}
              </View>

              <View style={styles.timeRow}>
                <View style={styles.timeField}>
                  <Text style={styles.timeLabel}>
                    Start
                  </Text>

                  <TextInput
                    value={exceptionStart}
                    onChangeText={value => {
                      setExceptionStart(value)
                      setLocalError('')
                    }}
                    placeholder="Optional"
                    placeholderTextColor={UI.colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={5}
                    editable={!isBusy}
                    style={styles.timeInput}
                  />
                </View>

                <View style={styles.timeArrow}>
                  <Ionicons
                    name="arrow-forward-outline"
                    size={17}
                    color={UI.colors.textMuted}
                  />
                </View>

                <View style={styles.timeField}>
                  <Text style={styles.timeLabel}>
                    End
                  </Text>

                  <TextInput
                    value={exceptionEnd}
                    onChangeText={value => {
                      setExceptionEnd(value)
                      setLocalError('')
                    }}
                    placeholder="Optional"
                    placeholderTextColor={UI.colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={5}
                    editable={!isBusy}
                    style={styles.timeInput}
                  />
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>
                  Reason
                </Text>

                <TextInput
                  value={exceptionReason}
                  onChangeText={value => {
                    setExceptionReason(value)
                    setLocalError('')
                  }}
                  placeholder="Optional reason"
                  placeholderTextColor={UI.colors.textMuted}
                  multiline
                  maxLength={200}
                  editable={!isBusy}
                  style={[
                    styles.input,
                    styles.multilineInput,
                  ]}
                />
              </View>

              <View style={styles.saveAction}>
                <AppButton
                  title={
                    savingException
                      ? 'Adding exception...'
                      : 'Add schedule exception'
                  }
                  onPress={() => {
                    void handleAddException()
                  }}
                  disabled={isBusy}
                />
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <SectionHeading
              eyebrow="SAVED EXCEPTIONS"
              title="Upcoming changes"
              subtitle="Review and remove date-specific overrides below."
            />

            <View style={styles.card}>
              {exceptions.length === 0 ? (
                <View style={styles.emptyState}>
                  <View style={styles.emptyIcon}>
                    <Ionicons
                      name="calendar-clear-outline"
                      size={25}
                      color={UI.colors.secondary}
                    />
                  </View>

                  <Text style={styles.emptyTitle}>
                    No exceptions saved
                  </Text>

                  <Text style={styles.emptyText}>
                    Your weekly schedule is currently the only availability rule.
                  </Text>
                </View>
              ) : (
                exceptions.map((exception, index) => (
                  <View
                    key={exception.id}
                    style={[
                      styles.exceptionRow,
                      index > 0 && styles.rowDivider,
                    ]}
                  >
                    <View style={styles.exceptionIcon}>
                      <Ionicons
                        name={
                          exception.exceptionType === 'unavailable'
                            ? 'close-circle-outline'
                            : 'add-circle-outline'
                        }
                        size={21}
                        color={
                          exception.exceptionType === 'unavailable'
                            ? UI.colors.error
                            : UI.colors.secondary
                        }
                      />
                    </View>

                    <View style={styles.exceptionCopy}>
                      <Text style={styles.exceptionDate}>
                        {exception.exceptionDate}
                      </Text>

                      <Text style={styles.exceptionType}>
                        {SCHEDULE.labels.exceptionType[exception.exceptionType]}
                      </Text>

                      <Text style={styles.exceptionTime}>
                        {exception.startTime && exception.endTime
                          ? `${formatTime(exception.startTime)} – ${formatTime(exception.endTime)}`
                          : 'Whole day'}
                      </Text>

                      {exception.reason ? (
                        <Text style={styles.exceptionReason}>
                          {exception.reason}
                        </Text>
                      ) : null}
                    </View>

                    <Pressable
                      onPress={() => {
                        handleDeleteException(exception)
                      }}
                      disabled={isBusy}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`Delete exception for ${exception.exceptionDate}`}
                      style={({ pressed }) => [
                        styles.deleteButton,
                        pressed && styles.deleteButtonPressed,
                        isBusy && styles.deleteButtonDisabled,
                      ]}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={19}
                        color={UI.colors.error}
                      />
                    </Pressable>
                  </View>
                ))
              )}
            </View>
          </View>

          {onBack ? (
            <View style={styles.backAction}>
              <AppButton
                title="Back to profile"
                variant="secondary"
                onPress={onBack}
                disabled={isBusy}
              />
            </View>
          ) : null}

          <Text style={styles.footerText}>
            Keep your availability accurate so job offers can be matched against the hours you actually work.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  keyboard: {
    flex: 1,
  },

  content: {
    paddingHorizontal: UI.spacing.lg,
    paddingTop: UI.spacing.md,
    paddingBottom: UI.spacing.xxxl,
  },

  topBar: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  headerButton: {
    width: 44,
    height: 44,
    borderRadius: UI.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: UI.colors.surface,
    borderWidth: 1,
    borderColor: UI.colors.border,
  },

  headerButtonPlaceholder: {
    width: 44,
    height: 44,
  },

  headerButtonPressed: {
    opacity: 0.7,
  },

  headerButtonDisabled: {
    opacity: 0.5,
  },

  topBarCenter: {
    alignItems: 'center',
  },

  topBarEyebrow: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
    color: UI.colors.secondary,
  },

  topBarTitle: {
    marginTop: 2,
    fontSize: UI.typography.bodyLarge,
    fontWeight: '900',
    color: UI.colors.text,
  },

  heroCard: {
    marginTop: UI.spacing.lg,
    padding: UI.spacing.xl,
    borderRadius: UI.radius.xl,
    backgroundColor: UI.colors.primary,
  },

  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: UI.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: UI.colors.surface,
  },

  heroBadge: {
    minHeight: 34,
    paddingHorizontal: UI.spacing.md,
    borderRadius: UI.radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },

  heroBadgeDot: {
    width: 7,
    height: 7,
    marginRight: UI.spacing.xs,
    borderRadius: UI.radius.pill,
    backgroundColor: UI.colors.accent,
  },

  heroBadgeText: {
    fontSize: UI.typography.caption,
    fontWeight: '800',
    color: UI.colors.surface,
  },

  heroEyebrow: {
    marginTop: UI.spacing.xl,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
    color: UI.colors.surface,
    opacity: 0.7,
  },

  heroTitle: {
    marginTop: UI.spacing.sm,
    fontSize: 25,
    lineHeight: 31,
    fontWeight: '900',
    color: UI.colors.surface,
  },

  heroSubtitle: {
    marginTop: UI.spacing.sm,
    fontSize: UI.typography.small,
    lineHeight: 19,
    color: UI.colors.surface,
    opacity: 0.76,
  },

  heroMetrics: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: UI.spacing.xl,
    paddingTop: UI.spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.14)',
  },

  heroMetric: {
    flex: 1,
  },

  heroMetricValue: {
    fontSize: UI.typography.bodyLarge,
    fontWeight: '900',
    color: UI.colors.surface,
  },

  heroMetricLabel: {
    marginTop: 2,
    fontSize: UI.typography.caption,
    color: UI.colors.surface,
    opacity: 0.68,
  },

  heroMetricDivider: {
    width: 1,
    height: 30,
    marginHorizontal: UI.spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },

  errorBox: {
    marginTop: UI.spacing.lg,
    padding: UI.spacing.md,
    borderRadius: UI.radius.lg,
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: UI.colors.errorBackground,
    borderWidth: 1,
    borderColor: '#FECACA',
  },

  errorIcon: {
    width: 34,
    height: 34,
    borderRadius: UI.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: UI.colors.surface,
  },

  errorCopy: {
    flex: 1,
    marginLeft: UI.spacing.sm,
  },

  errorTitle: {
    fontSize: UI.typography.small,
    fontWeight: '800',
    color: UI.colors.error,
  },

  errorText: {
    marginTop: UI.spacing.xs,
    fontSize: UI.typography.small,
    lineHeight: 18,
    color: UI.colors.textSecondary,
  },

  section: {
    marginTop: UI.spacing.xxl,
  },

  sectionHeading: {
    marginBottom: UI.spacing.md,
  },

  sectionEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.05,
    color: UI.colors.secondary,
  },

  sectionTitle: {
    marginTop: UI.spacing.xs,
    fontSize: UI.typography.subtitle,
    lineHeight: 23,
    fontWeight: '800',
    color: UI.colors.text,
  },

  sectionSubtitle: {
    marginTop: UI.spacing.xs,
    fontSize: UI.typography.small,
    lineHeight: 18,
    color: UI.colors.textSecondary,
  },

  card: {
    paddingHorizontal: UI.spacing.lg,
    paddingVertical: UI.spacing.md,
    borderRadius: UI.radius.xl,
    backgroundColor: UI.colors.surface,
    borderWidth: 1,
    borderColor: UI.colors.border,
  },

  settingRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
  },

  settingIcon: {
    width: 40,
    height: 40,
    borderRadius: UI.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: UI.colors.infoBackground,
  },

  settingCopy: {
    flex: 1,
    marginLeft: UI.spacing.md,
    paddingRight: UI.spacing.md,
  },

  settingLabel: {
    fontSize: UI.typography.body,
    fontWeight: '800',
    color: UI.colors.text,
  },

  settingDescription: {
    marginTop: 2,
    fontSize: UI.typography.caption,
    lineHeight: 16,
    color: UI.colors.textSecondary,
  },

  settingControl: {
    width: 126,
    alignItems: 'flex-end',
  },

  compactInput: {
    width: 126,
    height: 42,
    paddingHorizontal: UI.spacing.sm,
    borderWidth: 1,
    borderColor: UI.colors.inputBorder,
    borderRadius: UI.radius.md,
    backgroundColor: UI.colors.background,
    fontSize: UI.typography.small,
    color: UI.colors.text,
    textAlign: 'right',
  },

  intervalControl: {
    width: 126,
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: UI.spacing.sm,
    borderWidth: 1,
    borderColor: UI.colors.inputBorder,
    borderRadius: UI.radius.md,
    backgroundColor: UI.colors.background,
  },

  intervalInput: {
    flex: 1,
    padding: 0,
    fontSize: UI.typography.small,
    fontWeight: '800',
    color: UI.colors.text,
    textAlign: 'right',
  },

  intervalSuffix: {
    marginLeft: UI.spacing.xs,
    fontSize: UI.typography.caption,
    color: UI.colors.textMuted,
  },

  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: UI.colors.border,
  },

  dayRow: {
    paddingVertical: UI.spacing.md,
  },

  dayTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  dayBadge: {
    width: 38,
    height: 38,
    borderRadius: UI.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: UI.colors.background,
    borderWidth: 1,
    borderColor: UI.colors.border,
  },

  dayBadgeText: {
    fontSize: UI.typography.body,
    fontWeight: '900',
    color: UI.colors.text,
  },

  dayCopy: {
    flex: 1,
    marginLeft: UI.spacing.md,
    paddingRight: UI.spacing.md,
  },

  dayName: {
    fontSize: UI.typography.bodyLarge,
    fontWeight: '800',
    color: UI.colors.text,
  },

  dayStatus: {
    marginTop: 2,
    fontSize: UI.typography.small,
    color: UI.colors.textSecondary,
  },

  toggle: {
    width: 48,
    height: 30,
    padding: 3,
    borderRadius: UI.radius.pill,
    justifyContent: 'center',
    backgroundColor: UI.colors.background,
    borderWidth: 1,
    borderColor: UI.colors.inputBorder,
  },

  toggleActive: {
    backgroundColor: UI.colors.infoBackground,
    borderColor: UI.colors.secondary,
  },

  toggleThumb: {
    width: 22,
    height: 22,
    borderRadius: UI.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: UI.colors.surface,
    borderWidth: 1,
    borderColor: UI.colors.border,
    transform: [{ translateX: 0 }],
  },

  toggleThumbActive: {
    borderColor: UI.colors.secondary,
    transform: [{ translateX: 18 }],
  },

  togglePressed: {
    opacity: 0.78,
  },

  toggleDisabled: {
    opacity: 0.5,
  },

  timeRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: UI.spacing.md,
  },

  timeField: {
    flex: 1,
  },

  timeLabel: {
    marginBottom: UI.spacing.xs,
    fontSize: UI.typography.small,
    fontWeight: '700',
    color: UI.colors.textSecondary,
  },

  timeInput: {
    height: 46,
    paddingHorizontal: UI.spacing.md,
    borderWidth: 1,
    borderColor: UI.colors.inputBorder,
    borderRadius: UI.radius.md,
    backgroundColor: UI.colors.background,
    fontSize: UI.typography.body,
    fontWeight: '700',
    color: UI.colors.text,
  },

  timeArrow: {
    width: 42,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },

  saveAction: {
    marginTop: UI.spacing.md,
    paddingTop: UI.spacing.md,
    borderTopWidth: 1,
    borderTopColor: UI.colors.border,
  },

  field: {
    marginTop: UI.spacing.md,
  },

  label: {
    marginBottom: UI.spacing.sm,
    fontSize: UI.typography.small,
    fontWeight: '700',
    color: UI.colors.text,
  },

  inputWithIcon: {
    minHeight: UI.sizes.inputHeight,
    paddingHorizontal: UI.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: UI.colors.inputBorder,
    borderRadius: UI.radius.md,
    backgroundColor: UI.colors.background,
  },

  inputWithIconText: {
    flex: 1,
    marginLeft: UI.spacing.sm,
    paddingVertical: 0,
    fontSize: UI.typography.bodyLarge,
    color: UI.colors.text,
  },

  input: {
    minHeight: UI.sizes.inputHeight,
    paddingHorizontal: UI.spacing.md,
    paddingVertical: UI.spacing.sm,
    borderWidth: 1,
    borderColor: UI.colors.inputBorder,
    borderRadius: UI.radius.md,
    backgroundColor: UI.colors.background,
    fontSize: UI.typography.bodyLarge,
    color: UI.colors.text,
  },

  multilineInput: {
    minHeight: 88,
    textAlignVertical: 'top',
  },

  typeRow: {
    gap: UI.spacing.sm,
  },

  typeCard: {
    minHeight: 72,
    padding: UI.spacing.md,
    borderRadius: UI.radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: UI.colors.background,
    borderWidth: 1,
    borderColor: UI.colors.border,
  },

  typeCardSelected: {
    backgroundColor: UI.colors.infoBackground,
    borderColor: UI.colors.secondary,
  },

  typeCardPressed: {
    opacity: 0.78,
  },

  typeCardDisabled: {
    opacity: 0.5,
  },

  typeIcon: {
    width: 40,
    height: 40,
    borderRadius: UI.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: UI.colors.surface,
  },

  typeIconSelected: {
    backgroundColor: UI.colors.surface,
  },

  typeCopy: {
    flex: 1,
    marginLeft: UI.spacing.md,
  },

  typeTitle: {
    fontSize: UI.typography.body,
    fontWeight: '800',
    color: UI.colors.text,
  },

  typeDescription: {
    marginTop: 2,
    fontSize: UI.typography.caption,
    lineHeight: 16,
    color: UI.colors.textSecondary,
  },

  emptyState: {
    paddingVertical: UI.spacing.xl,
    alignItems: 'center',
  },

  emptyIcon: {
    width: 56,
    height: 56,
    marginBottom: UI.spacing.sm,
    borderRadius: UI.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: UI.colors.infoBackground,
  },

  emptyTitle: {
    fontSize: UI.typography.bodyLarge,
    fontWeight: '800',
    color: UI.colors.text,
  },

  emptyText: {
    maxWidth: 280,
    marginTop: UI.spacing.xs,
    fontSize: UI.typography.small,
    lineHeight: 18,
    color: UI.colors.textSecondary,
    textAlign: 'center',
  },

  exceptionRow: {
    minHeight: 86,
    paddingVertical: UI.spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },

  exceptionIcon: {
    width: 40,
    height: 40,
    borderRadius: UI.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: UI.colors.background,
  },

  exceptionCopy: {
    flex: 1,
    marginLeft: UI.spacing.md,
    paddingRight: UI.spacing.md,
  },

  exceptionDate: {
    fontSize: UI.typography.bodyLarge,
    fontWeight: '800',
    color: UI.colors.text,
  },

  exceptionType: {
    marginTop: 2,
    fontSize: UI.typography.small,
    fontWeight: '700',
    color: UI.colors.secondary,
  },

  exceptionTime: {
    marginTop: 2,
    fontSize: UI.typography.small,
    color: UI.colors.textSecondary,
  },

  exceptionReason: {
    marginTop: UI.spacing.xs,
    fontSize: UI.typography.small,
    lineHeight: 18,
    color: UI.colors.textSecondary,
  },

  deleteButton: {
    width: 40,
    height: 40,
    borderRadius: UI.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: UI.colors.errorBackground,
  },

  deleteButtonPressed: {
    opacity: 0.7,
  },

  deleteButtonDisabled: {
    opacity: 0.5,
  },

  backAction: {
    marginTop: UI.spacing.xl,
  },

  footerText: {
    marginTop: UI.spacing.lg,
    fontSize: UI.typography.caption,
    lineHeight: 16,
    color: UI.colors.textMuted,
    textAlign: 'center',
  },

  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: UI.spacing.xxl,
  },

  loadingIcon: {
    width: 60,
    height: 60,
    marginBottom: UI.spacing.md,
    borderRadius: UI.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: UI.colors.infoBackground,
  },

  loadingTitle: {
    marginTop: UI.spacing.lg,
    fontSize: UI.typography.subtitle,
    fontWeight: '800',
    color: UI.colors.text,
    textAlign: 'center',
  },

  loadingText: {
    marginTop: UI.spacing.sm,
    maxWidth: 300,
    fontSize: UI.typography.body,
    lineHeight: 20,
    color: UI.colors.textSecondary,
    textAlign: 'center',
  },
})
