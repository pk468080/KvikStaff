import {
  useCallback,
  useEffect,
  useState,
} from 'react'

import {
  ActivityIndicator,
  Alert,
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
  ScreenContainer,
} from '../../components/layout/ScreenContainer'

import ErrorState from '../../components/ui/ErrorState'

import StatusBadge from '../../components/ui/StatusBadge'

import {
  UI,
} from '../../constants/ui'

import {
  getWorkerBookingOccurrence,
  getWorkerBookingOccurrencesForBooking,
  performWorkerOccurrenceAction,
} from '../../services/bookings/workerBookingOccurrences.service'

import {
  getWorkerBooking,
} from '../../services/bookings/workerBookings.service'

import {
  verifyWorkerOccurrenceEndOtp,
  verifyWorkerOccurrenceStartOtp,
} from '../../services/bookings/workerBookingOtp.service'

import BookingChatPanel from '../../components/bookings/BookingChatPanel'

import type {
  WorkerBookingActionResponse,
  WorkerBookingOccurrence,
  WorkerOccurrenceAction,
} from '../../types/booking'

type BookingOccurrenceScreenProps = {
  occurrenceId: string
  onBack?: () => void
}

function getStatusVariant(
  status: WorkerBookingOccurrence['status'],
):
  | 'default'
  | 'success'
  | 'warning'
  | 'error'
  | 'info' {
  switch (status) {
    case 'assigned':
      return 'info'

    case 'on_the_way':
    case 'arrived':
    case 'in_progress':
      return 'warning'

    case 'completed':
      return 'success'

    case 'cancelled':
      return 'error'

    default:
      return 'default'
  }
}

function getStatusLabel(
  status: WorkerBookingOccurrence['status'],
): string {
  switch (status) {
    case 'on_the_way':
      return 'On the way'

    case 'in_progress':
      return 'In progress'

    default:
      return (
        status
          .charAt(0)
          .toUpperCase() +
        status
          .slice(1)
          .replace(
            /_/g,
            ' ',
          )
      )
  }
}

function formatDateTime(
  value: string | null,
): string {
  if (!value) {
    return '—'
  }

  const date =
    new Date(value)

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return '—'
  }

  return date.toLocaleString(
    'en-IN',
    {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    },
  )
}

function formatAmount(
  value: number,
): string {
  if (
    !Number.isFinite(value)
  ) {
    return '—'
  }

  return new Intl.NumberFormat(
    'en-IN',
    {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    },
  ).format(value)
}

function isStartOtpRequired(
  occurrence: WorkerBookingOccurrence,
): boolean {
  return (
    occurrence.status ===
      'arrived' &&
    occurrence.startedAt === null &&
    occurrence.startOtpVerifiedAt === null
  )
}

function isEndOtpRequired(
  occurrence: WorkerBookingOccurrence,
): boolean {
  return (
    occurrence.status ===
      'in_progress' &&
    occurrence.completedAt === null &&
    occurrence.endOtpVerifiedAt === null
  )
}

function getPrimaryAction(
  occurrence: WorkerBookingOccurrence,
): {
  action: WorkerOccurrenceAction
  title: string
  subtitle: string
  icon: keyof typeof Ionicons.glyphMap
  disabled?: boolean
} | null {
  switch (occurrence.status) {
    case 'assigned': {
      const scheduledStart =
        new Date(
          occurrence.scheduledStart,
        ).getTime()

      const hasStarted =
        Number.isFinite(
          scheduledStart,
        ) &&
        Date.now() >=
          scheduledStart

      return {
        action: 'on_the_way',
        title: 'Start journey',
        subtitle:
          hasStarted
            ? 'Head to the customer location when you are ready.'
            : `Available from ${formatDateTime(occurrence.scheduledStart)}.`,
        icon: 'navigate-outline',
        disabled:
          !hasStarted,
      }
    }

    case 'on_the_way':
      return {
        action: 'arrived',
        title: 'Mark arrived',
        subtitle:
          'Confirm when you reach the customer location.',
        icon: 'location-outline',
      }

    default:
      return null
  }
}

function ActionCard({
  title,
  subtitle,
  icon,
  onPress,
  disabled,
}: {
  title: string
  subtitle: string
  icon: keyof typeof Ionicons.glyphMap
  onPress: () => void
  disabled: boolean
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [
        styles.actionCard,
        pressed &&
          !disabled &&
          styles.actionPressed,
        disabled &&
          styles.actionDisabled,
      ]}
    >
      <View
        style={
          styles.actionIcon
        }
      >
        <Ionicons
          name={icon}
          size={22}
          color={
            UI.colors.surface
          }
        />
      </View>

      <View
        style={
          styles.actionCopy
        }
      >
        <Text
          style={
            styles.actionTitle
          }
        >
          {title}
        </Text>

        <Text
          style={
            styles.actionSubtitle
          }
        >
          {subtitle}
        </Text>
      </View>

      <Ionicons
        name="chevron-forward"
        size={19}
        color={
          UI.colors.surface
        }
      />
    </Pressable>
  )
}

export default function BookingOccurrenceScreen({
  occurrenceId,
  onBack,
}: BookingOccurrenceScreenProps) {
  const [
    occurrence,
    setOccurrence,
  ] =
    useState<WorkerBookingOccurrence | null>(
      null,
    )

  const [
    customerId,
    setCustomerId,
  ] = useState<string | null>(
    null,
  )

  const [
    loading,
    setLoading,
  ] = useState(true)

  const [
    refreshing,
    setRefreshing,
  ] = useState(false)

  const [
    actionLoading,
    setActionLoading,
  ] = useState(false)

  const [
    otpLoading,
    setOtpLoading,
  ] = useState(false)

  const [
    otp,
    setOtp,
  ] = useState('')

  const [
    error,
    setError,
  ] = useState<string | null>(
    null,
  )

  const loadOccurrence =
    useCallback(
      async (
        isRefresh = false,
      ): Promise<void> => {
        if (isRefresh) {
          setRefreshing(true)
        } else {
          setLoading(true)
        }

        setError(null)

        try {
          const nextOccurrence =
            await getWorkerBookingOccurrence(
              occurrenceId,
            )

          if (
            !nextOccurrence
          ) {
            throw new Error(
              'Booking occurrence not found or not assigned to this worker.',
            )
          }

          setOccurrence(
            nextOccurrence,
          )

          try {
            const parentBooking =
              await getWorkerBooking(
                nextOccurrence.bookingId,
              )

            setCustomerId(
              parentBooking?.customerId ??
                null,
            )
          } catch {
            setCustomerId(null)
          }
        } catch (cause) {
          setError(
            cause instanceof Error
              ? cause.message
              : 'Unable to load booking occurrence.',
          )
        } finally {
          setLoading(false)
          setRefreshing(false)
        }
      },
      [occurrenceId],
    )

  useEffect(() => {
    void loadOccurrence()
  }, [
    loadOccurrence,
  ])

  const runAction =
    useCallback(
      async (
        action: WorkerOccurrenceAction,
      ): Promise<void> => {
        if (!occurrence) {
          return
        }

        setActionLoading(
          true,
        )
        setError(null)

        try {
          const response: WorkerBookingActionResponse =
            await performWorkerOccurrenceAction(
              occurrence.id,
              action,
            )

          if (
            response.success !== true
          ) {
            throw new Error(
              response.error ||
                'Unable to update the occurrence.',
            )
          }

          await loadOccurrence(
            true,
          )
        } catch (cause) {
          setError(
            cause instanceof Error
              ? cause.message
              : 'Unable to update the occurrence.',
          )
        } finally {
          setActionLoading(
            false,
          )
        }
      },
      [
        occurrence,
        loadOccurrence,
      ],
    )

  const verifyOtp =
    useCallback(
      async (): Promise<void> => {
        if (!occurrence) {
          return
        }

        const normalizedOtp =
          otp.trim()

        if (
          !/^\d{6}$/.test(
            normalizedOtp,
          )
        ) {
          setError(
            'OTP must be a 6-digit number.',
          )
          return
        }

        const otpType =
          isStartOtpRequired(
            occurrence,
          )
            ? 'start'
            : isEndOtpRequired(
                  occurrence,
                )
              ? 'end'
              : null

        if (!otpType) {
          return
        }

        setOtpLoading(
          true,
        )
        setError(null)

        try {
          if (
            otpType ===
            'start'
          ) {
            await verifyWorkerOccurrenceStartOtp(
              occurrence.id,
              normalizedOtp,
            )
          } else {
            await verifyWorkerOccurrenceEndOtp(
              occurrence.id,
              normalizedOtp,
            )
          }

          setOtp('')

          await loadOccurrence(
            true,
          )
        } catch (cause) {
          setError(
            cause instanceof Error
              ? cause.message
              : 'Unable to verify the OTP.',
          )
        } finally {
          setOtpLoading(
            false,
          )
        }
      },
      [
        occurrence,
        otp,
        loadOccurrence,
      ],
    )

  function confirmCancel() {
    Alert.alert(
      'Cancel occurrence',
      'Are you sure you want to cancel this occurrence?',
      [
        {
          text: 'Keep',
          style: 'cancel',
        },
        {
          text: 'Cancel occurrence',
          style: 'destructive',
          onPress: () => {
            void runAction(
              'cancel',
            )
          },
        },
      ],
    )
  }

  if (loading) {
    return (
      <ScreenContainer>
        <View
          style={
            styles.loadingContainer
          }
        >
          <ActivityIndicator
            size="large"
            color={
              UI.colors.secondary
            }
          />

          <Text
            style={
              styles.loadingTitle
            }
          >
            Loading job
          </Text>

          <Text
            style={
              styles.loadingText
            }
          >
            Fetching your scheduled occurrence...
          </Text>
        </View>
      </ScreenContainer>
    )
  }

  if (
    error &&
    !occurrence
  ) {
    return (
      <ScreenContainer>
        <ErrorState
          title="Occurrence unavailable"
          message={error}
          onAction={() => {
            void loadOccurrence()
          }}
        />
      </ScreenContainer>
    )
  }

  if (!occurrence) {
    return (
      <ScreenContainer>
        <ErrorState
          title="Occurrence unavailable"
          message="The requested occurrence could not be loaded."
          onAction={() => {
            void loadOccurrence()
          }}
        />
      </ScreenContainer>
    )
  }

  const primaryAction =
    getPrimaryAction(
      occurrence,
    )

  const startOtpRequired =
    isStartOtpRequired(
      occurrence,
    )

  const endOtpRequired =
    isEndOtpRequired(
      occurrence,
    )

  const canCancel =
    occurrence.status ===
      'assigned' ||
    occurrence.status ===
      'on_the_way' ||
    occurrence.status ===
      'arrived' ||
    occurrence.status ===
      'in_progress'

  return (
    <ScreenContainer>
      <ScrollView
        contentContainerStyle={
          styles.content
        }
        refreshControl={
          <RefreshControl
            refreshing={
              refreshing
            }
            onRefresh={() => {
              void loadOccurrence(
                true,
              )
            }}
            tintColor={
              UI.colors.secondary
            }
          />
        }
        showsVerticalScrollIndicator={
          false
        }
      >
        <View
          style={
            styles.topBar
          }
        >
          {onBack ? (
            <Pressable
              onPress={
                onBack
              }
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              style={({ pressed }) => [
                styles.headerButton,
                pressed &&
                  styles.headerButtonPressed,
              ]}
            >
              <Ionicons
                name="arrow-back"
                size={21}
                color={
                  UI.colors.primary
                }
              />
            </Pressable>
          ) : (
            <View
              style={
                styles.headerButtonPlaceholder
              }
            />
          )}

          <View
            style={
              styles.topBarCenter
            }
          >
            <Text
              style={
                styles.topBarEyebrow
              }
            >
              TEMPSTAFF
            </Text>

            <Text
              style={
                styles.topBarTitle
              }
            >
              Occurrence
            </Text>
          </View>

          <Pressable
            onPress={() => {
              void loadOccurrence(
                true,
              )
            }}
            disabled={
              refreshing ||
              actionLoading ||
              otpLoading
            }
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Refresh occurrence"
            style={({ pressed }) => [
              styles.headerButton,
              pressed &&
                styles.headerButtonPressed,
            ]}
          >
            <Ionicons
              name="refresh"
              size={20}
              color={
                UI.colors.primary
              }
            />
          </Pressable>
        </View>

        <View
          style={
            styles.heroCard
          }
        >
          <View
            style={
              styles.heroTop
            }
          >
            <View
              style={
                styles.occurrenceIcon
              }
            >
              <Ionicons
                name="calendar-outline"
                size={26}
                color={
                  UI.colors.primary
                }
              />
            </View>

            <StatusBadge
              label={getStatusLabel(
                occurrence.status,
              )}
              variant={getStatusVariant(
                occurrence.status,
              )}
            />
          </View>

          <Text
            style={
              styles.heroEyebrow
            }
          >
            SCHEDULED JOB
          </Text>

          <Text
            style={
              styles.heroTitle
            }
          >
            Occurrence{' '}
            {occurrence.occurrenceIndex}
          </Text>

          <Text
            style={
              styles.heroDate
            }
          >
            {formatDateTime(
              occurrence.scheduledStart,
            )}
          </Text>

          <Text
            style={
              styles.heroEnd
            }
          >
            Ends{' '}
            {formatDateTime(
              occurrence.scheduledEnd,
            )}
          </Text>

          <View
            style={
              styles.heroIdRow
            }
          >
            <Text
              style={
                styles.heroIdLabel
              }
            >
              JOB ID
            </Text>

            <Text
              style={
                styles.heroId
              }
              numberOfLines={1}
            >
              #{occurrence.bookingId.slice(
                0,
                8,
              )}
            </Text>
          </View>
        </View>

        {error ? (
          <View
            style={
              styles.warningBox
            }
          >
            <View
              style={
                styles.warningIcon
              }
            >
              <Ionicons
                name="alert-circle-outline"
                size={18}
                color={
                  UI.colors.warning
                }
              />
            </View>

            <View
              style={
                styles.warningCopy
              }
            >
              <Text
                style={
                  styles.warningTitle
                }
              >
                Job update notice
              </Text>

              <Text
                style={
                  styles.warningText
                }
              >
                {error}
              </Text>
            </View>
          </View>
        ) : null}

        {primaryAction ? (
          <View
            style={
              styles.nextStepSection
            }
          >
            <Text
              style={
                styles.sectionEyebrow
              }
            >
              NEXT STEP
            </Text>

            <Text
              style={
                styles.sectionTitle
              }
            >
              Keep the job moving
            </Text>

            <ActionCard
              title={
                primaryAction.title
              }
              subtitle={
                primaryAction.subtitle
              }
              icon={
                primaryAction.icon
              }
              disabled={
                actionLoading ||
                primaryAction.disabled ===
                  true
              }
              onPress={() => {
                void runAction(
                  primaryAction.action,
                )
              }}
            />
          </View>
        ) : null}

        {occurrence.status ===
          'on_the_way' &&
        customerId ? (
          <View
            style={
              styles.section
            }
          >
            <BookingChatPanel
              bookingId={
                occurrence.bookingId
              }
              customerId={
                customerId
              }
              occurrenceId={
                occurrence.id
              }
            />
          </View>
        ) : null}

        {startOtpRequired ||
        endOtpRequired ? (
          <View
            style={
              styles.section
            }
          >
            <Text
              style={
                styles.sectionEyebrow
              }
            >
              VERIFICATION
            </Text>

            <Text
              style={
                styles.sectionTitle
              }
            >
              {startOtpRequired
                ? 'Start service'
                : 'Complete service'}
            </Text>

            <View
              style={
                styles.otpCard
              }
            >
              <View
                style={
                  styles.otpHeader
                }
              >
                <View
                  style={
                    styles.otpIcon
                  }
                >
                  <Ionicons
                    name="shield-checkmark-outline"
                    size={21}
                    color={
                      UI.colors.warning
                    }
                  />
                </View>

                <View
                  style={
                    styles.otpHeaderCopy
                  }
                >
                  <Text
                    style={
                      styles.otpTitle
                    }
                  >
                    Customer verification
                  </Text>

                  <Text
                    style={
                      styles.otpDescription
                    }
                  >
                    {startOtpRequired
                      ? 'Enter the 6-digit OTP provided by the customer before starting the service.'
                      : 'Enter the 6-digit OTP provided by the customer to complete the service.'}
                  </Text>
                </View>
              </View>

              <TextInput
                value={
                  otp
                }
                onChangeText={value => {
                  setOtp(
                    value
                      .replace(
                        /\D/g,
                        '',
                      )
                      .slice(
                        0,
                        6,
                      ),
                  )
                }}
                keyboardType="number-pad"
                maxLength={6}
                placeholder="6-digit OTP"
                placeholderTextColor={
                  UI.colors.textMuted
                }
                editable={
                  !otpLoading
                }
                style={
                  styles.otpInput
                }
                textContentType="oneTimeCode"
                autoComplete="sms-otp"
              />

              <AppButtonLocal
                title={
                  otpLoading
                    ? 'Verifying...'
                    : startOtpRequired
                      ? 'Verify start OTP'
                      : 'Verify end OTP'
                }
                disabled={
                  otpLoading ||
                  otp.length !== 6
                }
                onPress={() => {
                  void verifyOtp()
                }}
              />
            </View>
          </View>
        ) : null}

        {canCancel ? (
          <Pressable
            onPress={
              confirmCancel
            }
            disabled={
              actionLoading ||
              otpLoading
            }
            accessibilityRole="button"
            accessibilityLabel="Cancel occurrence"
            style={({ pressed }) => [
              styles.cancelButton,
              pressed &&
                styles.cancelPressed,
            ]}
          >
            <Ionicons
              name="close-circle-outline"
              size={19}
              color={
                UI.colors.error
              }
            />

            <Text
              style={
                styles.cancelText
              }
            >
              Cancel occurrence
            </Text>
          </Pressable>
        ) : null}

        <View
          style={
            styles.section
          }
        >
          <Text
            style={
              styles.sectionEyebrow
            }
          >
            SCHEDULE
          </Text>

          <Text
            style={
              styles.sectionTitle
            }
          >
            Shift timing
          </Text>

          <View
            style={
              styles.infoCard
            }
          >
            <InfoRow
              icon="calendar-outline"
              label="Occurrence date"
              value={
                occurrence.occurrenceDate
              }
            />

            <InfoDivider />

            <InfoRow
              icon="play-circle-outline"
              label="Scheduled start"
              value={
                formatDateTime(
                  occurrence.scheduledStart,
                )
              }
            />

            <InfoDivider />

            <InfoRow
              icon="stopwatch-outline"
              label="Scheduled end"
              value={
                formatDateTime(
                  occurrence.scheduledEnd,
                )
              }
            />
          </View>
        </View>

        <View
          style={
            styles.section
          }
        >
          <Text
            style={
              styles.sectionEyebrow
            }
          >
            PAYMENT
          </Text>

          <Text
            style={
              styles.sectionTitle
            }
          >
            Earnings for this occurrence
          </Text>

          <View
            style={
              styles.paymentCard
            }
          >
            <View
              style={
                styles.paymentMain
              }
            >
              <View
                style={
                  styles.paymentIcon
                }
              >
                <Ionicons
                  name="cash-outline"
                  size={23}
                  color={
                    UI.colors.success
                  }
                />
              </View>

              <View
                style={
                  styles.paymentCopy
                }
              >
                <Text
                  style={
                    styles.paymentLabel
                  }
                >
                  Total
                </Text>

                <Text
                  style={
                    styles.paymentAmount
                  }
                >
                  {formatAmount(
                    occurrence.totalAmount,
                  )}
                </Text>
              </View>
            </View>

            <View
              style={
                styles.paymentGrid
              }
            >
              <PaymentItem
                label="Base"
                value={
                  occurrence.baseAmount
                }
              />

              <PaymentItem
                label="Discount"
                value={
                  occurrence.discountAmount
                }
                negative
              />

              <PaymentItem
                label="Platform fee"
                value={
                  occurrence.platformFee
                }
              />

              <PaymentItem
                label="Tax"
                value={
                  occurrence.taxAmount
                }
              />
            </View>
          </View>
        </View>

        <View
          style={
            styles.section
          }
        >
          <Text
            style={
              styles.sectionEyebrow
            }
          >
            SERVICE PROGRESS
          </Text>

          <Text
            style={
              styles.sectionTitle
            }
          >
            Job timeline
          </Text>

          <View
            style={
              styles.progressCard
            }
          >
            <ProgressRow
              icon="navigate-outline"
              label="Journey started"
              value={
                occurrence.journeyStartedAt
              }
            />

            <ProgressRow
              icon="location-outline"
              label="Arrived"
              value={
                occurrence.arrivedAt
              }
            />

            <ProgressRow
              icon="play-circle-outline"
              label="Started"
              value={
                occurrence.startedAt
              }
            />

            <ProgressRow
              icon="checkmark-circle-outline"
              label="Completed"
              value={
                occurrence.completedAt
              }
            />
          </View>
        </View>

        <Text
          style={
            styles.footerText
          }
        >
          TempStaff worker occurrence
        </Text>

        <View
          style={
            styles.bottomSpacing
          }
        />
      </ScrollView>
    </ScreenContainer>
  )
}

function AppButtonLocal({
  title,
  onPress,
  disabled,
}: {
  title: string
  onPress: () => void
  disabled: boolean
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [
        styles.verifyButton,
        pressed &&
          !disabled &&
          styles.verifyButtonPressed,
        disabled &&
          styles.verifyButtonDisabled,
      ]}
    >
      <Text
        style={
          styles.verifyButtonText
        }
      >
        {title}
      </Text>
    </Pressable>
  )
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap
  label: string
  value: string
}) {
  return (
    <View
      style={
        styles.infoRow
      }
    >
      <View
        style={
          styles.infoIcon
        }
      >
        <Ionicons
          name={icon}
          size={18}
          color={
            UI.colors.secondary
          }
        />
      </View>

      <View
        style={
          styles.infoCopy
        }
      >
        <Text
          style={
            styles.infoLabel
          }
        >
          {label}
        </Text>

        <Text
          style={
            styles.infoValue
          }
        >
          {value}
        </Text>
      </View>
    </View>
  )
}

function InfoDivider() {
  return (
    <View
      style={
        styles.infoDivider
      }
    />
  )
}

function PaymentItem({
  label,
  value,
  negative = false,
}: {
  label: string
  value: number
  negative?: boolean
}) {
  return (
    <View
      style={
        styles.paymentItem
      }
    >
      <Text
        style={
          styles.paymentItemLabel
        }
      >
        {label}
      </Text>

      <Text
        style={[
          styles.paymentItemValue,
          negative &&
            styles.paymentItemValueNegative,
        ]}
      >
        {formatAmount(
          negative
            ? -Math.abs(value)
            : value,
        )}
      </Text>
    </View>
  )
}

function ProgressRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap
  label: string
  value: string | null
}) {
  const completed =
    Boolean(value)

  return (
    <View
      style={
        styles.progressRow
      }
    >
      <View
        style={[
          styles.progressIcon,
          completed &&
            styles.progressIconCompleted,
        ]}
      >
        <Ionicons
          name={icon}
          size={18}
          color={
            completed
              ? UI.colors.success
              : UI.colors.textMuted
          }
        />
      </View>

      <View
        style={
          styles.progressCopy
        }
      >
        <Text
          style={
            styles.progressLabel
          }
        >
          {label}
        </Text>

        <Text
          style={[
            styles.progressValue,
            completed &&
              styles.progressValueCompleted,
          ]}
        >
          {value
            ? formatDateTime(value)
            : 'Pending'}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal:
      UI.spacing.lg,
    paddingTop:
      UI.spacing.md,
    paddingBottom:
      UI.spacing.xxxl,
  },

  topBar: {
    flexDirection:
      'row',
    alignItems:
      'center',
    justifyContent:
      'space-between',
    minHeight: 44,
  },

  headerButton: {
    width: 44,
    height: 44,
    borderRadius:
      UI.radius.pill,
    alignItems:
      'center',
    justifyContent:
      'center',
    backgroundColor:
      UI.colors.surface,
    borderWidth: 1,
    borderColor:
      UI.colors.border,
  },

  headerButtonPlaceholder: {
    width: 44,
    height: 44,
  },

  headerButtonPressed: {
    opacity: 0.7,
  },

  topBarCenter: {
    alignItems:
      'center',
  },

  topBarEyebrow: {
    fontSize: 9,
    fontWeight:
      '800',
    letterSpacing: 1,
    color:
      UI.colors.secondary,
  },

  topBarTitle: {
    marginTop: 2,
    fontSize:
      UI.typography.bodyLarge,
    fontWeight:
      '900',
    color:
      UI.colors.text,
  },

  heroCard: {
    marginTop:
      UI.spacing.lg,
    padding:
      UI.spacing.xl,
    borderRadius:
      UI.radius.xl,
    backgroundColor:
      UI.colors.primary,
  },

  heroTop: {
    flexDirection:
      'row',
    alignItems:
      'center',
    justifyContent:
      'space-between',
  },

  occurrenceIcon: {
    width: 56,
    height: 56,
    borderRadius:
      UI.radius.lg,
    alignItems:
      'center',
    justifyContent:
      'center',
    backgroundColor:
      UI.colors.surface,
  },

  heroEyebrow: {
    marginTop:
      UI.spacing.lg,
    fontSize: 10,
    fontWeight:
      '800',
    letterSpacing:
      1.1,
    color:
      UI.colors.surface,
    opacity: 0.72,
  },

  heroTitle: {
    marginTop:
      UI.spacing.sm,
    fontSize: 26,
    lineHeight: 32,
    fontWeight:
      '900',
    color:
      UI.colors.surface,
  },

  heroDate: {
    marginTop:
      UI.spacing.sm,
    fontSize:
      UI.typography.bodyLarge,
    fontWeight:
      '800',
    color:
      UI.colors.surface,
  },

  heroEnd: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.small,
    color:
      UI.colors.surface,
    opacity: 0.76,
  },

  heroIdRow: {
    flexDirection:
      'row',
    alignItems:
      'center',
    justifyContent:
      'space-between',
    marginTop:
      UI.spacing.xl,
    paddingTop:
      UI.spacing.md,
    borderTopWidth: 1,
    borderTopColor:
      'rgba(255,255,255,0.14)',
  },

  heroIdLabel: {
    fontSize: 9,
    fontWeight:
      '800',
    letterSpacing:
      0.9,
    color:
      UI.colors.surface,
    opacity: 0.64,
  },

  heroId: {
    maxWidth: 140,
    fontSize:
      UI.typography.small,
    fontWeight:
      '700',
    color:
      UI.colors.surface,
    opacity: 0.86,
  },

  warningBox: {
    flexDirection:
      'row',
    alignItems:
      'flex-start',
    marginTop:
      UI.spacing.lg,
    padding:
      UI.spacing.md,
    borderRadius:
      UI.radius.lg,
    backgroundColor:
      UI.colors.warningBackground,
    borderWidth: 1,
    borderColor:
      '#FDE68A',
  },

  warningIcon: {
    width: 32,
    height: 32,
    borderRadius:
      UI.radius.pill,
    alignItems:
      'center',
    justifyContent:
      'center',
    backgroundColor:
      UI.colors.surface,
  },

  warningCopy: {
    flex: 1,
    marginLeft:
      UI.spacing.sm,
  },

  warningTitle: {
    fontSize:
      UI.typography.small,
    fontWeight:
      '800',
    color:
      UI.colors.warning,
  },

  warningText: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.small,
    lineHeight:
      18,
    color:
      UI.colors.textSecondary,
  },

  nextStepSection: {
    marginTop:
      UI.spacing.xxl,
  },

  section: {
    marginTop:
      UI.spacing.xxl,
  },

  sectionEyebrow: {
    fontSize: 10,
    fontWeight:
      '800',
    letterSpacing:
      1.05,
    color:
      UI.colors.secondary,
  },

  sectionTitle: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.subtitle,
    lineHeight:
      23,
    fontWeight:
      '800',
    color:
      UI.colors.text,
  },

  actionCard: {
    flexDirection:
      'row',
    alignItems:
      'center',
    marginTop:
      UI.spacing.md,
    padding:
      UI.spacing.lg,
    borderRadius:
      UI.radius.xl,
    backgroundColor:
      UI.colors.secondary,
  },

  actionPressed: {
    opacity:
      0.8,
  },

  actionDisabled: {
    opacity:
      0.55,
  },

  actionIcon: {
    width: 46,
    height: 46,
    borderRadius:
      UI.radius.lg,
    alignItems:
      'center',
    justifyContent:
      'center',
    backgroundColor:
      'rgba(255,255,255,0.14)',
  },

  actionCopy: {
    flex: 1,
    marginLeft:
      UI.spacing.md,
    marginRight:
      UI.spacing.sm,
  },

  actionTitle: {
    fontSize:
      UI.typography.bodyLarge,
    fontWeight:
      '900',
    color:
      UI.colors.surface,
  },

  actionSubtitle: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.small,
    lineHeight:
      18,
    color:
      UI.colors.surface,
    opacity:
      0.78,
  },

  cancelButton: {
    flexDirection:
      'row',
    alignItems:
      'center',
    justifyContent:
      'center',
    marginTop:
      UI.spacing.md,
    paddingVertical:
      UI.spacing.md,
  },

  cancelPressed: {
    opacity:
      0.65,
  },

  cancelText: {
    marginLeft:
      UI.spacing.xs,
    fontSize:
      UI.typography.small,
    fontWeight:
      '800',
    color:
      UI.colors.error,
  },

  otpCard: {
    marginTop:
      UI.spacing.md,
    padding:
      UI.spacing.lg,
    borderRadius:
      UI.radius.xl,
    backgroundColor:
      UI.colors.warningBackground,
    borderWidth: 1,
    borderColor:
      '#FDE68A',
  },

  otpHeader: {
    flexDirection:
      'row',
    alignItems:
      'flex-start',
  },

  otpIcon: {
    width: 42,
    height: 42,
    borderRadius:
      UI.radius.lg,
    alignItems:
      'center',
    justifyContent:
      'center',
    backgroundColor:
      UI.colors.surface,
  },

  otpHeaderCopy: {
    flex: 1,
    marginLeft:
      UI.spacing.md,
  },

  otpTitle: {
    fontSize:
      UI.typography.bodyLarge,
    fontWeight:
      '900',
    color:
      UI.colors.text,
  },

  otpDescription: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.small,
    lineHeight:
      18,
    color:
      UI.colors.textSecondary,
  },

  otpInput: {
    height: 56,
    marginTop:
      UI.spacing.lg,
    marginBottom:
      UI.spacing.md,
    paddingHorizontal:
      UI.spacing.lg,
    borderRadius:
      UI.radius.md,
    borderWidth: 1,
    borderColor:
      UI.colors.border,
    backgroundColor:
      UI.colors.surface,
    color:
      UI.colors.text,
    fontSize: 22,
    fontWeight:
      '800',
    letterSpacing: 6,
    textAlign:
      'center',
  },

  verifyButton: {
    minHeight: 52,
    borderRadius:
      UI.radius.md,
    alignItems:
      'center',
    justifyContent:
      'center',
    backgroundColor:
      UI.colors.primary,
  },

  verifyButtonPressed: {
    opacity:
      0.8,
  },

  verifyButtonDisabled: {
    opacity:
      0.55,
  },

  verifyButtonText: {
    fontSize:
      UI.typography.body,
    fontWeight:
      '800',
    color:
      UI.colors.surface,
  },

  infoCard: {
    marginTop:
      UI.spacing.md,
    paddingHorizontal:
      UI.spacing.lg,
    paddingVertical:
      UI.spacing.sm,
    borderRadius:
      UI.radius.xl,
    backgroundColor:
      UI.colors.surface,
    borderWidth: 1,
    borderColor:
      UI.colors.border,
  },

  infoRow: {
    flexDirection:
      'row',
    alignItems:
      'center',
    paddingVertical:
      UI.spacing.md,
  },

  infoIcon: {
    width: 38,
    height: 38,
    borderRadius:
      UI.radius.md,
    alignItems:
      'center',
    justifyContent:
      'center',
    backgroundColor:
      UI.colors.infoBackground,
  },

  infoCopy: {
    flex: 1,
    marginLeft:
      UI.spacing.md,
  },

  infoLabel: {
    fontSize:
      UI.typography.caption,
    color:
      UI.colors.textMuted,
  },

  infoValue: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.small,
    fontWeight:
      '800',
    color:
      UI.colors.text,
  },

  infoDivider: {
    height: 1,
    backgroundColor:
      UI.colors.border,
  },

  paymentCard: {
    marginTop:
      UI.spacing.md,
    padding:
      UI.spacing.lg,
    borderRadius:
      UI.radius.xl,
    backgroundColor:
      UI.colors.surface,
    borderWidth: 1,
    borderColor:
      UI.colors.border,
  },

  paymentMain: {
    flexDirection:
      'row',
    alignItems:
      'center',
  },

  paymentIcon: {
    width: 48,
    height: 48,
    borderRadius:
      UI.radius.lg,
    alignItems:
      'center',
    justifyContent:
      'center',
    backgroundColor:
      UI.colors.successBackground,
  },

  paymentCopy: {
    marginLeft:
      UI.spacing.md,
  },

  paymentLabel: {
    fontSize:
      UI.typography.caption,
    color:
      UI.colors.textMuted,
  },

  paymentAmount: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.title,
    lineHeight:
      30,
    fontWeight:
      '900',
    color:
      UI.colors.text,
  },

  paymentGrid: {
    flexDirection:
      'row',
    flexWrap:
      'wrap',
    marginTop:
      UI.spacing.lg,
    paddingTop:
      UI.spacing.md,
    borderTopWidth: 1,
    borderTopColor:
      UI.colors.border,
  },

  paymentItem: {
    width: '50%',
    paddingVertical:
      UI.spacing.sm,
  },

  paymentItemLabel: {
    fontSize:
      UI.typography.caption,
    color:
      UI.colors.textMuted,
  },

  paymentItemValue: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.small,
    fontWeight:
      '800',
    color:
      UI.colors.text,
  },

  paymentItemValueNegative: {
    color:
      UI.colors.error,
  },

  progressCard: {
    marginTop:
      UI.spacing.md,
    paddingHorizontal:
      UI.spacing.lg,
    paddingVertical:
      UI.spacing.sm,
    borderRadius:
      UI.radius.xl,
    backgroundColor:
      UI.colors.surface,
    borderWidth: 1,
    borderColor:
      UI.colors.border,
  },

  progressRow: {
    flexDirection:
      'row',
    alignItems:
      'center',
    paddingVertical:
      UI.spacing.md,
  },

  progressIcon: {
    width: 40,
    height: 40,
    borderRadius:
      UI.radius.pill,
    alignItems:
      'center',
    justifyContent:
      'center',
    backgroundColor:
      UI.colors.background,
  },

  progressIconCompleted: {
    backgroundColor:
      UI.colors.successBackground,
  },

  progressCopy: {
    flex: 1,
    marginLeft:
      UI.spacing.md,
  },

  progressLabel: {
    fontSize:
      UI.typography.small,
    fontWeight:
      '700',
    color:
      UI.colors.text,
  },

  progressValue: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.caption,
    color:
      UI.colors.textMuted,
  },

  progressValueCompleted: {
    color:
      UI.colors.success,
  },

  footerText: {
    marginTop:
      UI.spacing.xl,
    fontSize:
      UI.typography.caption,
    color:
      UI.colors.textMuted,
    textAlign:
      'center',
  },

  bottomSpacing: {
    height:
      UI.spacing.xxl,
  },

  loadingContainer: {
    flex: 1,
    alignItems:
      'center',
    justifyContent:
      'center',
    paddingHorizontal:
      UI.spacing.xxl,
  },

  loadingTitle: {
    marginTop:
      UI.spacing.lg,
    fontSize:
      UI.typography.subtitle,
    fontWeight:
      '800',
    color:
      UI.colors.text,
    textAlign:
      'center',
  },

  loadingText: {
    marginTop:
      UI.spacing.sm,
    maxWidth: 300,
    fontSize:
      UI.typography.body,
    lineHeight:
      20,
    color:
      UI.colors.textSecondary,
    textAlign:
      'center',
  },
})
