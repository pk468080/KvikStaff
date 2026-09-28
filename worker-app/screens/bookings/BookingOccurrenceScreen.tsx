import {
  useCallback,
  useEffect,
  useState,
} from 'react'

import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

import {
  AppButton,
} from '../../components/ui/AppButton'

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
} from '../../services/bookings/workerBookingOccurrences.service'

import {
  getWorkerBooking,
} from '../../services/bookings/workerBookings.service'

import BookingChatPanel from '../../components/bookings/BookingChatPanel'

import {
  performWorkerOccurrenceAction,
} from '../../services/bookings/workerBookingOccurrences.service'

import {
  verifyWorkerOccurrenceEndOtp,
  verifyWorkerOccurrenceStartOtp,
} from '../../services/bookings/workerBookingOtp.service'

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
      return 'On the Way'

    case 'in_progress':
      return 'In Progress'

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

  const date = new Date(
    value,
  )

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return '—'
  }

  return date.toLocaleString(
    undefined,
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
  if (!Number.isFinite(value)) {
    return '—'
  }

  return value.toFixed(2)
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
        title: 'Start Journey',
        disabled:
          !hasStarted,
      }
    }

    case 'on_the_way':
      return {
        action: 'arrived',
        title: 'Mark Arrived',
      }

    default:
      return null
  }
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

          /*
           * Chat is optional here. A failure to load
           * the parent booking must not block normal
           * occurrence actions for the worker.
           */
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
            Loading occurrence
          </Text>

          <Text
            style={
              styles.loadingText
            }
          >
            Fetching the scheduled worker occurrence...
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
            refreshing={refreshing}
            onRefresh={() => {
              void loadOccurrence(
                true,
              )
            }}
          />
        }
        showsVerticalScrollIndicator={
          false
        }
      >
        <View
          style={styles.header}
        >
          <View
            style={
              styles.headerCopy
            }
          >
            <Text
              style={
                styles.eyebrow
              }
            >
              BOOKING OCCURRENCE
            </Text>

            <Text
              style={styles.title}
            >
              Occurrence{' '}
              {occurrence.occurrenceIndex}
            </Text>

            <Text
              style={
                styles.bookingId
              }
            >
              {occurrence.bookingId}
            </Text>
          </View>

          {onBack ? (
            <View
              style={
                styles.headerButton
              }
            >
              <AppButton
                title="Back"
                variant="secondary"
                onPress={
                  onBack
                }
              />
            </View>
          ) : null}
        </View>

        {error ? (
          <View
            style={
              styles.warningBox
            }
          >
            <Text
              style={
                styles.warningTitle
              }
            >
              Occurrence update notice
            </Text>

            <Text
              style={
                styles.warningText
              }
            >
              {error}
            </Text>
          </View>
        ) : null}

        <View
          style={
            styles.statusCard
          }
        >
          <View
            style={
              styles.statusHeader
            }
          >
            <Text
              style={
                styles.statusEyebrow
              }
            >
              CURRENT STATUS
            </Text>

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
              styles.scheduleText
            }
          >
            {formatDateTime(
              occurrence.scheduledStart,
            )}
          </Text>

          <Text
            style={
              styles.scheduleEndText
            }
          >
            Ends{' '}
            {formatDateTime(
              occurrence.scheduledEnd,
            )}
          </Text>
        </View>

        {occurrence.status ===
          'on_the_way' &&
        customerId ? (
          <BookingChatPanel
            bookingId={occurrence.bookingId}
            customerId={customerId}
            occurrenceId={occurrence.id}
          />
        ) : null}

        {primaryAction ? (
          <View
            style={
              styles.primaryActionCard
            }
          >
            <Text
              style={
                styles.actionTitle
              }
            >
              Next worker action
            </Text>

            <Text
  style={
    styles.actionDescription
  }
>
  {primaryAction.disabled
    ? `This shift starts at ${formatDateTime(
        occurrence.scheduledStart,
      )}. Start Journey will become available at the scheduled start time.`
    : primaryAction.action ===
        'on_the_way'
      ? 'Start your journey to the customer location.'
      : 'Mark that you have arrived at the customer location.'}
</Text>

            <AppButton
  title={
    primaryAction.title
  }
  disabled={
    actionLoading ||
    primaryAction.disabled === true
  }
  onPress={() => {
    void runAction(
      primaryAction.action,
    )
  }}
/>
          </View>
        ) : null}

        {startOtpRequired ||
        endOtpRequired ? (
          <View
            style={
              styles.otpCard
            }
          >
            <Text
              style={
                styles.sectionTitle
              }
            >
              {startOtpRequired
                ? 'Start service'
                : 'Complete service'}
            </Text>

            <Text
              style={
                styles.sectionSubtitle
              }
            >
              {startOtpRequired
                ? 'Enter the 6-digit OTP provided by the customer before starting the service.'
                : 'Enter the 6-digit OTP provided by the customer to complete the service.'}
            </Text>

            <TextInput
              value={otp}
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
              editable={!otpLoading}
              style={
                styles.otpInput
              }
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
            />

            <AppButton
              title={
                otpLoading
                  ? 'Verifying...'
                  : startOtpRequired
                    ? 'Verify Start OTP'
                    : 'Verify End OTP'
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
        ) : null}

        {canCancel ? (
          <View
            style={
              styles.cancelAction
            }
          >
            <AppButton
              title="Cancel Occurrence"
              variant="secondary"
              disabled={
                actionLoading ||
                otpLoading
              }
              onPress={
                confirmCancel
              }
            />
          </View>
        ) : null}

        <View
          style={styles.section}
        >
          <Text
            style={
              styles.sectionTitle
            }
          >
            Schedule
          </Text>

          <View
            style={
              styles.card
            }
          >
            <InfoRow
              label="Occurrence date"
              value={
                occurrence.occurrenceDate
              }
            />

            <InfoDivider />

            <InfoRow
              label="Scheduled start"
              value={
                formatDateTime(
                  occurrence.scheduledStart,
                )
              }
            />

            <InfoDivider />

            <InfoRow
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
          style={styles.section}
        >
          <Text
            style={
              styles.sectionTitle
            }
          >
            Payment
          </Text>

          <View
            style={
              styles.card
            }
          >
            <InfoRow
              label="Base amount"
              value={formatAmount(
                occurrence.baseAmount,
              )}
            />

            <InfoDivider />

            <InfoRow
              label="Discount"
              value={formatAmount(
                occurrence.discountAmount,
              )}
            />

            <InfoDivider />

            <InfoRow
              label="Platform fee"
              value={formatAmount(
                occurrence.platformFee,
              )}
            />

            <InfoDivider />

            <InfoRow
              label="Tax"
              value={formatAmount(
                occurrence.taxAmount,
              )}
            />

            <InfoDivider />

            <View
              style={
                styles.totalRow
              }
            >
              <Text
                style={
                  styles.totalLabel
                }
              >
                Total
              </Text>

              <Text
                style={
                  styles.totalValue
                }
              >
                {formatAmount(
                  occurrence.totalAmount,
                )}
              </Text>
            </View>
          </View>
        </View>

        <View
          style={styles.section}
        >
          <Text
            style={
              styles.sectionTitle
            }
          >
            Service progress
          </Text>

          <View
            style={
              styles.card
            }
          >
            <ProgressRow
              label="Journey started"
              value={
                occurrence.journeyStartedAt
              }
            />

            <ProgressRow
              label="Arrived"
              value={
                occurrence.arrivedAt
              }
            />

            <ProgressRow
              label="Started"
              value={
                occurrence.startedAt
              }
            />

            <ProgressRow
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
          Occurrence actions and OTP verification are processed through the authenticated worker account.
        </Text>
      </ScrollView>
    </ScreenContainer>
  )
}

function InfoRow({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <View
      style={
        styles.infoRow
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

function ProgressRow({
  label,
  value,
}: {
  label: string
  value: string | null
}) {
  return (
    <View
      style={
        styles.progressRow
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
        {value
          ? formatDateTime(
              value,
            )
          : 'Pending'}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal:
      UI.spacing.xl,
    paddingTop:
      UI.spacing.xl,
    paddingBottom:
      UI.spacing.xxxl,
  },

  header: {
    flexDirection:
      'row',
    alignItems:
      'flex-start',
    marginBottom:
      UI.spacing.lg,
  },

  headerCopy: {
    flex: 1,
    paddingRight:
      UI.spacing.md,
  },

  headerButton: {
    width: 76,
  },

  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
    color:
      UI.colors.secondary,
  },

  title: {
    marginTop:
      UI.spacing.sm,
    fontSize:
      UI.typography.title,
    lineHeight: 30,
    fontWeight: '800',
    color:
      UI.colors.text,
  },

  bookingId: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.caption,
    color:
      UI.colors.textMuted,
  },

  warningBox: {
    marginBottom:
      UI.spacing.lg,
    padding:
      UI.spacing.md,
    borderRadius:
      UI.radius.md,
    backgroundColor:
      UI.colors.warningBackground,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },

  warningTitle: {
    fontSize:
      UI.typography.small,
    fontWeight: '800',
    color:
      UI.colors.warning,
  },

  warningText: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.small,
    lineHeight: 18,
    color:
      UI.colors.textSecondary,
  },

  statusCard: {
    padding:
      UI.spacing.xl,
    borderRadius:
      UI.radius.xl,
    backgroundColor:
      UI.colors.primary,
  },

  statusHeader: {
    flexDirection:
      'row',
    alignItems:
      'center',
    justifyContent:
      'space-between',
  },

  statusEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    color:
      UI.colors.surface,
    opacity: 0.72,
  },

  scheduleText: {
    marginTop:
      UI.spacing.lg,
    fontSize:
      UI.typography.bodyLarge,
    lineHeight: 23,
    fontWeight: '800',
    color:
      UI.colors.surface,
  },

  scheduleEndText: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.small,
    color:
      UI.colors.surface,
    opacity: 0.72,
  },

  primaryActionCard: {
    marginTop:
      UI.spacing.lg,
    padding:
      UI.spacing.lg,
    borderRadius:
      UI.radius.lg,
    backgroundColor:
      UI.colors.infoBackground,
    borderWidth: 1,
    borderColor:
      UI.colors.info,
  },

  actionTitle: {
    fontSize:
      UI.typography.bodyLarge,
    fontWeight: '800',
    color:
      UI.colors.text,
  },

  actionDescription: {
    marginTop:
      UI.spacing.xs,
    marginBottom:
      UI.spacing.md,
    fontSize:
      UI.typography.small,
    lineHeight: 18,
    color:
      UI.colors.textSecondary,
  },

  otpCard: {
    marginTop:
      UI.spacing.lg,
    padding:
      UI.spacing.lg,
    borderRadius:
      UI.radius.lg,
    backgroundColor:
      UI.colors.warningBackground,
    borderWidth: 1,
    borderColor:
      UI.colors.warning,
  },

  sectionTitle: {
    fontSize:
      UI.typography.subtitle,
    lineHeight: 23,
    fontWeight: '800',
    color:
      UI.colors.text,
  },

  sectionSubtitle: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.small,
    lineHeight: 18,
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
    fontWeight: '800',
    letterSpacing: 6,
    textAlign: 'center',
  },

  cancelAction: {
    marginTop:
      UI.spacing.sm,
  },

  section: {
    marginTop:
      UI.spacing.xl,
  },

  card: {
    marginTop:
      UI.spacing.md,
    padding:
      UI.spacing.lg,
    borderRadius:
      UI.radius.lg,
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
      'flex-start',
    justifyContent:
      'space-between',
    gap: UI.spacing.md,
  },

  infoLabel: {
    flex: 1,
    fontSize:
      UI.typography.small,
    color:
      UI.colors.textSecondary,
  },

  infoValue: {
    flex: 1,
    fontSize:
      UI.typography.small,
    fontWeight: '700',
    color:
      UI.colors.text,
    textAlign: 'right',
  },

  infoDivider: {
    height: 1,
    marginVertical:
      UI.spacing.md,
    backgroundColor:
      UI.colors.border,
  },

  totalRow: {
    flexDirection:
      'row',
    alignItems:
      'center',
    justifyContent:
      'space-between',
  },

  totalLabel: {
    fontSize:
      UI.typography.bodyLarge,
    fontWeight: '800',
    color:
      UI.colors.text,
  },

  totalValue: {
    fontSize:
      UI.typography.bodyLarge,
    fontWeight: '900',
    color:
      UI.colors.text,
  },

  progressRow: {
    flexDirection:
      'row',
    alignItems:
      'flex-start',
    justifyContent:
      'space-between',
    paddingVertical:
      UI.spacing.sm,
    gap: UI.spacing.md,
  },

  footerText: {
    marginTop:
      UI.spacing.xl,
    fontSize:
      UI.typography.caption,
    lineHeight: 16,
    color:
      UI.colors.textMuted,
    textAlign: 'center',
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
    fontWeight: '800',
    color:
      UI.colors.text,
    textAlign: 'center',
  },

  loadingText: {
    marginTop:
      UI.spacing.sm,
    fontSize:
      UI.typography.body,
    lineHeight: 20,
    color:
      UI.colors.textSecondary,
    textAlign: 'center',
  },
})
