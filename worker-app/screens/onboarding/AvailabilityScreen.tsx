import {
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'


import {
  AppButton,
} from '../../components/ui/AppButton'

import OnboardingProgress from '../../components/onboarding/OnboardingProgress'

import ErrorState from '../../components/ui/ErrorState'

import {
  ScreenContainer,
} from '../../components/layout/ScreenContainer'

import {
  UI,
} from '../../constants/ui'

import {
  SCHEDULE,
} from '../../constants/schedule'

import {
  getWorkerWeeklySchedules,
  getWorkerScheduleSettings,
  replaceWorkerWeeklySchedules,
  setWorkerScheduleSettings,
} from '../../services/schedule/workerSchedule.service'

import {
  saveWorkerOnboarding,
} from '../../services/onboarding/workerOnboarding.service'

import {
  isValidTimeRange,
} from '../../lib/workerScheduleUtils'

import type {
  WorkerDayOfWeek,
  WorkerWeeklyScheduleInput,
} from '../../types/schedule'

type AvailabilityScreenProps = {
  onContinue: () => void
  onBack: () => void
}

type DayDraft = {
  enabled: boolean
  startTime: string
  endTime: string
}

type DayDraftMap = Record<
  WorkerDayOfWeek,
  DayDraft
>

const ONBOARDING_LABELS = [
  'Personal information',
  'Services',
  'Documents',
  'Availability',
  'Consent',
]

const DEFAULT_START_TIME = '09:00'
const DEFAULT_END_TIME = '18:00'

function createDefaultDays(): DayDraftMap {
  return {
    0: {
      enabled: false,
      startTime: DEFAULT_START_TIME,
      endTime: DEFAULT_END_TIME,
    },
    1: {
      enabled: true,
      startTime: DEFAULT_START_TIME,
      endTime: DEFAULT_END_TIME,
    },
    2: {
      enabled: true,
      startTime: DEFAULT_START_TIME,
      endTime: DEFAULT_END_TIME,
    },
    3: {
      enabled: true,
      startTime: DEFAULT_START_TIME,
      endTime: DEFAULT_END_TIME,
    },
    4: {
      enabled: true,
      startTime: DEFAULT_START_TIME,
      endTime: DEFAULT_END_TIME,
    },
    5: {
      enabled: true,
      startTime: DEFAULT_START_TIME,
      endTime: DEFAULT_END_TIME,
    },
    6: {
      enabled: false,
      startTime: DEFAULT_START_TIME,
      endTime: DEFAULT_END_TIME,
    },
  }
}

function createDaysFromSchedules(
  schedules: Array<{
    dayOfWeek: WorkerDayOfWeek
    startTime: string
    endTime: string
    isActive: boolean
  }>,
): DayDraftMap {
  const days = createDefaultDays()

  schedules.forEach(schedule => {
    days[schedule.dayOfWeek] = {
      enabled:
        schedule.isActive,
      startTime:
        schedule.startTime.slice(0, 5),
      endTime:
        schedule.endTime.slice(0, 5),
    }
  })

  return days
}

export default function AvailabilityScreen({
  onContinue,
  onBack,
}: AvailabilityScreenProps) {
  const [days, setDays] =
    useState<DayDraftMap>(
      createDefaultDays(),
    )

  const [timezone, setTimezone] =
    useState<string>(
      SCHEDULE.defaults.timezone,
    )

  const [
    slotIntervalMinutes,
    setSlotIntervalMinutes,
  ] = useState<string>(
    String(
      SCHEDULE.defaults
        .slotIntervalMinutes,
    ),
  )

  const [loading, setLoading] =
    useState(true)

  const [saving, setSaving] =
    useState(false)

  const [errorMessage, setErrorMessage] =
    useState('')

  const activeDayCount =
    useMemo(
      () =>
        Object.values(days).filter(
          day => day.enabled,
        ).length,
      [days],
    )

  useEffect(() => {
    let mounted = true

    async function loadSchedule() {
      setLoading(true)
      setErrorMessage('')

      try {
        const [
          schedules,
          settings,
        ] = await Promise.all([
          getWorkerWeeklySchedules(),
          getWorkerScheduleSettings(),
        ])

        if (!mounted) {
          return
        }

        setDays(
          createDaysFromSchedules(
            schedules,
          ),
        )

        if (settings?.timezone) {
          setTimezone(
            settings.timezone,
          )
        }

        if (
          settings?.slotIntervalMinutes
        ) {
          setSlotIntervalMinutes(
            String(
              settings.slotIntervalMinutes,
            ),
          )
        }
      } catch (error) {
        console.error(
          'Unable to load worker availability:',
          error,
        )

        if (!mounted) {
          return
        }

        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'Unable to load your availability.',
        )
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    void loadSchedule()

    return () => {
      mounted = false
    }
  }, [])

  function updateDay(
    dayOfWeek: WorkerDayOfWeek,
    patch: Partial<DayDraft>,
  ) {
    setErrorMessage('')

    setDays(current => ({
      ...current,
      [dayOfWeek]: {
        ...current[dayOfWeek],
        ...patch,
      },
    }))
  }

  function validateAvailability(): string | null {
    if (!timezone.trim()) {
      return 'Timezone is required.'
    }

    const interval =
      Number(
        slotIntervalMinutes,
      )

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
      return 'Select at least one working day.'
    }

    for (
      let day = 0;
      day <= 6;
      day += 1
    ) {
      const dayOfWeek =
        day as WorkerDayOfWeek

      const draft =
        days[dayOfWeek]

      if (!draft.enabled) {
        continue
      }

      if (
        !isValidTimeRange(
          draft.startTime,
          draft.endTime,
        )
      ) {
        return `${SCHEDULE.dayLabels.long[dayOfWeek]} must have a valid start and end time.`
      }
    }

    return null
  }

  async function handleContinue() {
    if (saving) {
      return
    }

    setErrorMessage('')

    const validationError =
      validateAvailability()

    if (validationError) {
      setErrorMessage(
        validationError,
      )
      return
    }

    setSaving(true)

    try {
      const schedules: WorkerWeeklyScheduleInput[] =
        []

      for (
        let day = 0;
        day <= 6;
        day += 1
      ) {
        const dayOfWeek =
          day as WorkerDayOfWeek

        const draft =
          days[dayOfWeek]

        schedules.push({
          dayOfWeek,
          startTime:
            draft.startTime,
          endTime:
            draft.endTime,
          isActive:
            draft.enabled,
        })
      }

      await replaceWorkerWeeklySchedules(
        schedules,
      )

      await setWorkerScheduleSettings({
        timezone:
          timezone.trim(),
        slotIntervalMinutes:
          Number(
            slotIntervalMinutes,
          ),
      })

      await saveWorkerOnboarding({
        onboardingStep: 5,
      })

      onContinue()
    } catch (error) {
      console.error(
        'Unable to save worker availability:',
        error,
      )

      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Unable to save your availability.',
      )
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <ScreenContainer>
        <View style={styles.loadingContainer}>
          <ActivityIndicator
            size="large"
            color={UI.colors.primaryBlue}
          />

          <Text style={styles.loadingTitle}>
            Loading your availability
          </Text>

          <Text style={styles.loadingText}>
            Checking your saved weekly schedule...
          </Text>
        </View>
      </ScreenContainer>
    )
  }

  if (
    errorMessage &&
    activeDayCount === 0 &&
    loading === false
  ) {
    return (
      <ScreenContainer>
        <ErrorState
          message={errorMessage}
          onAction={() => {
            setLoading(true)
            setErrorMessage('')

            void Promise.all([
              getWorkerWeeklySchedules(),
              getWorkerScheduleSettings(),
            ])
              .then(
                ([
                  schedules,
                  settings,
                ]) => {
                  setDays(
                    createDaysFromSchedules(
                      schedules,
                    ),
                  )

                  if (
                    settings?.timezone
                  ) {
                    setTimezone(
                      settings.timezone,
                    )
                  }

                  if (
                    settings?.slotIntervalMinutes
                  ) {
                    setSlotIntervalMinutes(
                      String(
                        settings.slotIntervalMinutes,
                      ),
                    )
                  }
                },
              )
              .catch(error => {
                setErrorMessage(
                  error instanceof Error
                    ? error.message
                    : 'Unable to load your availability.',
                )
              })
              .finally(() => {
                setLoading(false)
              })
          }}
        />
      </ScreenContainer>
    )
  }

  return (
    <ScreenContainer>
      <ScrollView
        contentContainerStyle={
          styles.content
        }
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>
            STEP 4 · AVAILABILITY
          </Text>

          <Text style={styles.title}>
            Set your working schedule
          </Text>

          <Text style={styles.subtitle}>
            Tell KvikStaff when you are normally
            available to accept jobs.
          </Text>
        </View>

        <OnboardingProgress
          currentStep={4}
          totalSteps={5}
          labels={ONBOARDING_LABELS}
        />

        {errorMessage ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>
              Availability issue
            </Text>

            <Text style={styles.errorText}>
              {errorMessage}
            </Text>
          </View>
        ) : null}

        <View style={styles.settingsCard}>
          <Text style={styles.sectionTitle}>
            Schedule settings
          </Text>

          <Text style={styles.sectionDescription}>
            These settings control how your weekly
            availability is stored.
          </Text>

          <View style={styles.field}>
            <Text style={styles.label}>
              Timezone
            </Text>

            <TextInput
              value={timezone}
              onChangeText={value => {
                setTimezone(value)
                setErrorMessage('')
              }}
              placeholder="Asia/Kolkata"
              placeholderTextColor={
                UI.colors.textMuted
              }
              autoCapitalize="none"
              autoCorrect={false}
              editable={!saving}
              style={styles.input}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>
              Slot interval (minutes)
            </Text>

            <TextInput
              value={
                slotIntervalMinutes
              }
              onChangeText={value => {
                setSlotIntervalMinutes(
                  value.replace(
                    /\D/g,
                    '',
                  ),
                )
                setErrorMessage('')
              }}
              placeholder="30"
              placeholderTextColor={
                UI.colors.textMuted
              }
              keyboardType="number-pad"
              editable={!saving}
              maxLength={3}
              style={styles.input}
            />
          </View>
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>
            Weekly availability
          </Text>

          <Text style={styles.summaryCount}>
            {activeDayCount} working day
            {activeDayCount === 1
              ? ''
              : 's'}
          </Text>

          <Text style={styles.summaryText}>
            Enable the days you normally accept
            worker assignments.
          </Text>
        </View>

        <View style={styles.daysCard}>
          {(
            Object.keys(days).map(
              Number,
            ) as WorkerDayOfWeek[]
          ).map(dayOfWeek => {
            const draft = days[dayOfWeek]

            return (
              <View
                key={dayOfWeek}
                style={[
                  styles.dayRow,
                  dayOfWeek !== 0 &&
                    styles.dayRowBorder,
                ]}
              >
                <View style={styles.dayHeader}>
                  <View
                    style={[
                      styles.dayToggle,
                      draft.enabled &&
                        styles.dayToggleActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayToggleText,
                        draft.enabled &&
                          styles.dayToggleTextActive,
                      ]}
                    >
                      {draft.enabled ? 'ON' : 'OFF'}
                    </Text>
                  </View>

                  <Text style={styles.dayName}>
                    {
                      SCHEDULE.dayLabels
                        .long[dayOfWeek]
                    }
                  </Text>

                  <View style={styles.dayAction}>
                    <AppButton
                      title={
                        draft.enabled
                          ? 'Disable'
                          : 'Enable'
                      }
                      variant="secondary"
                      onPress={() => {
                        updateDay(dayOfWeek, {
                          enabled: !draft.enabled,
                        })
                      }}
                      disabled={saving}
                    />
                  </View>
                </View>

                {draft.enabled ? (
                  <View style={styles.timeRow}>
                    <View style={styles.timeField}>
                      <Text style={styles.timeLabel}>
                        Start
                      </Text>

                      <TextInput
                        value={draft.startTime}
                        onChangeText={value => {
                          updateDay(dayOfWeek, {
                            startTime: value,
                          })
                        }}
                        placeholder="09:00"
                        placeholderTextColor={
                          UI.colors.textMuted
                        }
                        autoCapitalize="none"
                        autoCorrect={false}
                        editable={!saving}
                        maxLength={5}
                        style={styles.timeInput}
                      />
                    </View>

                    <View style={styles.timeDivider}>
                      <Text style={styles.timeDividerText}>
                        to
                      </Text>
                    </View>

                    <View style={styles.timeField}>
                      <Text style={styles.timeLabel}>
                        End
                      </Text>

                      <TextInput
                        value={draft.endTime}
                        onChangeText={value => {
                          updateDay(dayOfWeek, {
                            endTime: value,
                          })
                        }}
                        placeholder="18:00"
                        placeholderTextColor={
                          UI.colors.textMuted
                        }
                        autoCapitalize="none"
                        autoCorrect={false}
                        editable={!saving}
                        maxLength={5}
                        style={styles.timeInput}
                      />
                    </View>
                  </View>
                ) : (
                  <Text style={styles.disabledText}>
                    You will not receive scheduled jobs
                    for this day.
                  </Text>
                )}
              </View>
            )
          })}
        </View>

        <View style={styles.noteCard}>
          <Text style={styles.noteTitle}>
            Schedule note
          </Text>

          <Text style={styles.noteText}>
            Keep your availability realistic. Job
            assignments can depend on your schedule,
            location and active worker status.
          </Text>
        </View>

        <View style={styles.actions}>
          <View style={styles.actionButton}>
            <AppButton
              title="Back"
              variant="secondary"
              onPress={onBack}
              disabled={saving}
            />
          </View>

          <View style={styles.actionButton}>
            <AppButton
              title={
                saving
                  ? 'Saving...'
                  : 'Continue'
              }
              onPress={() => {
                void handleContinue()
              }}
              disabled={saving}
            />
          </View>
        </View>

        {saving ? (
          <View style={styles.savingRow}>
            <ActivityIndicator
              size="small"
              color={UI.colors.primaryBlue}
            />

            <Text style={styles.savingText}>
              Saving your weekly availability...
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: UI.spacing.xl,
    paddingTop: UI.spacing.xl,
    paddingBottom: UI.spacing.xxxl,
  },

  header: {
    marginBottom: UI.spacing.lg,
  },

  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
    color: UI.colors.primaryBlue,
  },

  title: {
    marginTop: UI.spacing.sm,
    fontSize: UI.typography.title,
    lineHeight: 30,
    fontWeight: '800',
    color: UI.colors.text,
  },

  subtitle: {
    marginTop: UI.spacing.sm,
    fontSize: UI.typography.body,
    lineHeight: 21,
    color: UI.colors.textSecondary,
  },

  errorBox: {
    marginTop: UI.spacing.md,
    padding: UI.spacing.md,
    borderRadius: UI.radius.md,
    backgroundColor:
      UI.colors.errorBackground,
    borderWidth: 1,
    borderColor: UI.colors.errorBackground,
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
    color: UI.colors.error,
  },

  settingsCard: {
    marginTop: UI.spacing.lg,
    padding: UI.spacing.lg,
    borderRadius: UI.radius.lg,
    backgroundColor: UI.colors.surface,
    borderWidth: 1,
    borderColor: UI.colors.border,
  },

  sectionTitle: {
    fontSize: UI.typography.bodyLarge,
    fontWeight: '800',
    color: UI.colors.text,
  },

  sectionDescription: {
    marginTop: UI.spacing.xs,
    fontSize: UI.typography.small,
    lineHeight: 18,
    color: UI.colors.textSecondary,
  },

  field: {
    marginTop: UI.spacing.lg,
  },

  label: {
    marginBottom: UI.spacing.sm,
    fontSize: UI.typography.small,
    fontWeight: '700',
    color: UI.colors.text,
  },

  input: {
    height: UI.sizes.inputHeight,
    paddingHorizontal: UI.spacing.md,
    borderWidth: 1,
    borderColor: UI.colors.inputBorder,
    borderRadius: UI.radius.md,
    backgroundColor: UI.colors.surface,
    fontSize: UI.typography.bodyLarge,
    color: UI.colors.text,
  },

  summaryCard: {
    marginTop: UI.spacing.lg,
    padding: UI.spacing.lg,
    borderRadius: UI.radius.lg,
    backgroundColor: UI.colors.infoBackground,
    borderWidth: 1,
    borderColor: UI.colors.info,
  },

  summaryTitle: {
    fontSize: UI.typography.small,
    fontWeight: '700',
    color: UI.colors.textSecondary,
  },

  summaryCount: {
    marginTop: UI.spacing.xs,
    fontSize: UI.typography.subtitle,
    fontWeight: '800',
    color: UI.colors.text,
  },

  summaryText: {
    marginTop: UI.spacing.xs,
    fontSize: UI.typography.small,
    lineHeight: 18,
    color: UI.colors.textSecondary,
  },

  daysCard: {
    marginTop: UI.spacing.lg,
    paddingHorizontal: UI.spacing.lg,
    borderRadius: UI.radius.lg,
    backgroundColor: UI.colors.surface,
    borderWidth: 1,
    borderColor: UI.colors.border,
  },

  dayRow: {
    paddingVertical: UI.spacing.lg,
  },

  dayRowBorder: {
    borderTopWidth: 1,
    borderTopColor: UI.colors.border,
  },

  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  dayToggle: {
    width: 34,
    height: 28,
    borderRadius: UI.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: UI.colors.background,
    borderWidth: 1,
    borderColor: UI.colors.border,
  },

  dayToggleActive: {
    backgroundColor:
      UI.colors.successBackground,
    borderColor: UI.colors.success,
  },

  dayToggleText: {
    fontSize: 10,
    fontWeight: '800',
    color: UI.colors.textMuted,
  },

  dayToggleTextActive: {
    color: UI.colors.success,
  },

  dayName: {
    flex: 1,
    marginLeft: UI.spacing.md,
    fontSize: UI.typography.bodyLarge,
    fontWeight: '700',
    color: UI.colors.text,
  },

  dayAction: {
    width: 92,
  },

  timeRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: UI.spacing.lg,
  },

  timeField: {
    flex: 1,
  },

  timeLabel: {
    marginBottom: UI.spacing.xs,
    fontSize: UI.typography.small,
    fontWeight: '600',
    color: UI.colors.textSecondary,
  },

  timeInput: {
    height: 44,
    paddingHorizontal: UI.spacing.md,
    borderWidth: 1,
    borderColor: UI.colors.inputBorder,
    borderRadius: UI.radius.md,
    backgroundColor: UI.colors.surface,
    fontSize: UI.typography.bodyLarge,
    color: UI.colors.text,
  },

  timeDivider: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 12,
  },

  timeDividerText: {
    fontSize: UI.typography.small,
    fontWeight: '600',
    color: UI.colors.textMuted,
  },

  disabledText: {
    marginTop: UI.spacing.md,
    fontSize: UI.typography.small,
    lineHeight: 18,
    color: UI.colors.textMuted,
  },

  noteCard: {
    marginTop: UI.spacing.lg,
    padding: UI.spacing.lg,
    borderRadius: UI.radius.lg,
    backgroundColor: UI.colors.background,
    borderWidth: 1,
    borderColor: UI.colors.border,
  },

  noteTitle: {
    fontSize: UI.typography.small,
    fontWeight: '800',
    color: UI.colors.text,
  },

  noteText: {
    marginTop: UI.spacing.xs,
    fontSize: UI.typography.small,
    lineHeight: 18,
    color: UI.colors.textSecondary,
  },

  actions: {
    flexDirection: 'row',
    marginTop: UI.spacing.xxl,
  },

  actionButton: {
    flex: 1,
    marginLeft: UI.spacing.sm,
  },

  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: UI.spacing.xxl,
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
    fontSize: UI.typography.body,
    lineHeight: 20,
    color: UI.colors.textSecondary,
    textAlign: 'center',
  },

  savingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: UI.spacing.md,
  },

  savingText: {
    marginLeft: UI.spacing.sm,
    fontSize: UI.typography.small,
    color: UI.colors.textSecondary,
  },
})