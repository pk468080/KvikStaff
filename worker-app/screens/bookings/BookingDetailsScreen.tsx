import {
  useCallback,
  useEffect,
  useState,
} from 'react'

import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import { Ionicons } from '@expo/vector-icons'

import WorkerBookingOtpPanel from '../../components/bookings/WorkerBookingOtpPanel'
import BookingChatPanel from '../../components/bookings/BookingChatPanel'
import { ScreenContainer } from '../../components/layout/ScreenContainer'
import ErrorState from '../../components/ui/ErrorState'
import StatusBadge from '../../components/ui/StatusBadge'
import { UI } from '../../constants/ui'
import {
  getWorkerBooking,
} from '../../services/bookings/workerBookings.service'
import {
  getWorkerBookingContext,
  type WorkerBookingContext,
} from '../../services/bookings/workerBookingContext.service'
import {
  performWorkerBookingAction,
} from '../../services/bookings/workerBookingActions.service'
import {
  getWorkerBookingOccurrencesForBooking,
} from '../../services/bookings/workerBookingOccurrences.service'
import {
  formatBookingAmount,
  formatBookingDateTime,
  getBookingDurationHours,
  getBookingStatusLabel,
  getBookingTypeLabel,
  getNextPendingOccurrence,
  isActiveBookingStatus,
} from '../../lib/workerBookingUtils'
import type {
  BookingStatus,
  WorkerBooking,
  WorkerBookingAction,
  WorkerBookingOccurrence,
} from '../../types/booking'

type BookingDetailsScreenProps = {
  bookingId: string
  onBack?: () => void
  onOccurrencePress?: (occurrenceId: string) => void
}

function getStatusVariant(
  status: BookingStatus,
): 'default' | 'success' | 'warning' | 'error' | 'info' {
  switch (status) {
    case 'assigned':
    case 'paid':
      return 'info'
    case 'on_the_way':
    case 'arrived':
    case 'in_progress':
      return 'warning'
    case 'completed':
      return 'success'
    case 'cancelled':
    case 'expired':
    case 'payment_failed':
      return 'error'
    default:
      return 'default'
  }
}

function getOccurrenceVariant(
  status: WorkerBookingOccurrence['status'],
): 'default' | 'success' | 'warning' | 'error' | 'info' {
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

function getPrimaryAction(
  booking: WorkerBooking,
): {
  action: WorkerBookingAction
  title: string
  subtitle: string
  icon: keyof typeof Ionicons.glyphMap
} | null {
  if (booking.bookingType === 'recurring') {
    return null
  }

  switch (booking.status) {
    case 'assigned':
      return {
        action: 'on_the_way',
        title: 'Start journey',
        subtitle:
          'Head to the customer location when you are ready.',
        icon: 'navigate-outline',
      }
    case 'on_the_way':
      return {
        action: 'arrived',
        title: 'Mark arrived',
        subtitle: 'Confirm when you reach the customer location.',
        icon: 'location-outline',
      }
    default:
      return null
  }
}

function formatDuration(booking: WorkerBooking): string {
  const hours = getBookingDurationHours(booking)

  if (hours === null) {
    return `${booking.durationValue} ${booking.durationUnit}`
  }

  return `${booking.durationValue} ${booking.durationUnit} · ${hours}h`
}

function getInitials(
  value: string | null | undefined,
): string {
  const normalized = value?.trim() ?? ''

  if (!normalized) {
    return 'CU'
  }

  const words = normalized.split(/\s+/).filter(Boolean)

  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase()
  }

  return normalized.slice(0, 2).toUpperCase()
}

function buildDirectionsUrl(
  context: WorkerBookingContext,
): string | null {
  const hasCoordinates =
    context.latitude !== null &&
    context.longitude !== null &&
    Number.isFinite(context.latitude) &&
    Number.isFinite(context.longitude)

  if (hasCoordinates) {
    return (
      'https://www.google.com/maps/dir/?api=1&destination=' +
      `${context.latitude},${context.longitude}`
    )
  }

  const address = context.addressLine?.trim()

  if (!address) {
    return null
  }

  return (
    'https://www.google.com/maps/dir/?api=1&destination=' +
    encodeURIComponent(address)
  )
}

async function openExternalUrl(
  url: string,
  failureMessage: string,
): Promise<void> {
  try {
    await Linking.openURL(url)
  } catch {
    Alert.alert('Unable to open', failureMessage)
  }
}

function ActionButton({
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
        pressed && !disabled && styles.actionCardPressed,
        disabled && styles.actionCardDisabled,
      ]}
    >
      <View style={styles.actionIcon}>
        <Ionicons
          name={icon}
          size={21}
          color={UI.colors.surface}
        />
      </View>

      <View style={styles.actionCopy}>
        <Text style={styles.actionTitle}>{title}</Text>
        <Text style={styles.actionSubtitle}>{subtitle}</Text>
      </View>

      <Ionicons
        name="chevron-forward"
        size={19}
        color={UI.colors.surface}
      />
    </Pressable>
  )
}

function CompactContactButton({
  icon,
  label,
  onPress,
  disabled = false,
}: {
  icon: keyof typeof Ionicons.glyphMap
  label: string
  onPress: () => void
  disabled?: boolean
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.compactButton,
        disabled && styles.compactButtonDisabled,
        pressed && !disabled && styles.compactButtonPressed,
      ]}
    >
      <Ionicons
        name={icon}
        size={17}
        color={UI.colors.secondary}
      />
      <Text style={styles.compactButtonText}>{label}</Text>
    </Pressable>
  )
}

export default function BookingDetailsScreen({
  bookingId,
  onBack,
  onOccurrencePress,
}: BookingDetailsScreenProps) {
  const [booking, setBooking] =
    useState<WorkerBooking | null>(null)
  const [context, setContext] =
    useState<WorkerBookingContext | null>(null)
  const [occurrences, setOccurrences] =
    useState<WorkerBookingOccurrence[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [contextError, setContextError] = useState<string | null>(null)

  const loadBooking = useCallback(
    async (isRefresh = false): Promise<void> => {
      if (isRefresh) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }

      setError(null)

      try {
        const nextBooking = await getWorkerBooking(bookingId)

        if (!nextBooking) {
          throw new Error(
            'Booking not found or not assigned to this worker.',
          )
        }

        const nextOccurrences =
          nextBooking.bookingType === 'recurring'
            ? await getWorkerBookingOccurrencesForBooking(bookingId)
            : []

        setBooking(nextBooking)
        setOccurrences(nextOccurrences)

        try {
          const nextContext =
            await getWorkerBookingContext(bookingId)

          setContext(nextContext)
          setContextError(null)
        } catch (cause) {
          setContext(null)
          setContextError(
            cause instanceof Error
              ? cause.message
              : 'Customer and location details are unavailable.',
          )
        }
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : 'Unable to load booking details.',
        )
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [bookingId],
  )

  useEffect(() => {
    void loadBooking()
  }, [loadBooking])

  const runAction = useCallback(
    async (action: WorkerBookingAction): Promise<void> => {
      if (!booking) {
        return
      }

      setActionLoading(true)
      setError(null)

      try {
        await performWorkerBookingAction(booking.id, action)
        await loadBooking(true)
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : 'Unable to update this booking.',
        )
      } finally {
        setActionLoading(false)
      }
    },
    [booking, loadBooking],
  )

  function confirmAction(
    action: WorkerBookingAction,
    title: string,
    message: string,
  ) {
    Alert.alert(title, message, [
      {
        text: 'Cancel',
        style: 'cancel',
      },
      {
        text: title,
        style: action === 'cancel' ? 'destructive' : 'default',
        onPress: () => {
          void runAction(action)
        },
      },
    ])
  }

  async function handleDirections(): Promise<void> {
    if (!context) {
      Alert.alert(
        'Location unavailable',
        'The customer location is not available for this booking.',
      )
      return
    }

    const url = buildDirectionsUrl(context)

    if (!url) {
      Alert.alert(
        'Location unavailable',
        'This booking does not contain a usable destination.',
      )
      return
    }

    await openExternalUrl(
      url,
      'Your device could not open maps.',
    )
  }

  if (loading) {
    return (
      <ScreenContainer>
        <View style={styles.loadingContainer}>
          <ActivityIndicator
            size="large"
            color={UI.colors.secondary}
          />
          <Text style={styles.loadingTitle}>Loading booking</Text>
          <Text style={styles.loadingText}>
            Fetching your job details...
          </Text>
        </View>
      </ScreenContainer>
    )
  }

  if (error && !booking) {
    return (
      <ScreenContainer>
        <ErrorState
          title="Booking unavailable"
          message={error}
          onAction={() => {
            void loadBooking()
          }}
        />
      </ScreenContainer>
    )
  }

  if (!booking) {
    return (
      <ScreenContainer>
        <ErrorState
          title="Booking unavailable"
          message="The requested booking could not be loaded."
          onAction={() => {
            void loadBooking()
          }}
        />
      </ScreenContainer>
    )
  }

  const primaryAction = getPrimaryAction(booking)
  const nextOccurrence = getNextPendingOccurrence(occurrences)
  const canCancel = [
    'assigned',
    'on_the_way',
    'arrived',
    'in_progress',
  ].includes(booking.status)
  const directionsAvailable = Boolean(
    context && buildDirectionsUrl(context),
  )
  const customerName = context?.customerName ?? 'Customer'
  const serviceName =
    context?.serviceName ?? 'Service details unavailable'
  const serviceVariant = context?.variantName ?? null
  const addressText = context?.addressLine ?? null
  const addressLabel = context?.addressLabel ?? 'Service location'

  return (
    <ScreenContainer>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void loadBooking(true)
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
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              style={({ pressed }) => [
                styles.headerButton,
                pressed && styles.headerButtonPressed,
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
            <Text style={styles.topBarEyebrow}>TEMPSTAFF</Text>
            <Text style={styles.topBarTitle}>Job details</Text>
          </View>

          <Pressable
            onPress={() => {
              void loadBooking(true)
            }}
            disabled={refreshing || actionLoading}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Refresh booking"
            style={({ pressed }) => [
              styles.headerButton,
              pressed && styles.headerButtonPressed,
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
          <View style={styles.heroTop}>
            <View style={styles.heroIcon}>
              <Text style={styles.heroIconText}>
                {getInitials(customerName)}
              </Text>
            </View>

            <StatusBadge
              label={getBookingStatusLabel(booking.status)}
              variant={getStatusVariant(booking.status)}
            />
          </View>

          <Text style={styles.heroEyebrow}>ASSIGNED JOB</Text>
          <Text style={styles.heroTitle}>
            {serviceName}
          </Text>
          <Text style={styles.heroMeta}>
            {serviceVariant
              ? `${serviceVariant} · `
              : ''}
            {formatBookingDateTime(booking.scheduledStart)}
          </Text>

          <View style={styles.heroAmountRow}>
            <View>
              <Text style={styles.heroAmountLabel}>BOOKING VALUE</Text>
              <Text style={styles.heroAmount}>
                {formatBookingAmount(
                  booking.totalAmount,
                  booking.currency,
                )}
              </Text>
            </View>

            <View style={styles.heroBookingId}>
              <Text style={styles.heroBookingIdLabel}>JOB ID</Text>
              <Text
                style={styles.heroBookingIdValue}
                numberOfLines={1}
              >
                #{booking.id.slice(0, 8)}
              </Text>
            </View>
          </View>
        </View>

        {error ? (
          <View style={styles.warningBox}>
            <View style={styles.warningIcon}>
              <Ionicons
                name="alert-circle-outline"
                size={18}
                color={UI.colors.warning}
              />
            </View>
            <View style={styles.warningCopy}>
              <Text style={styles.warningTitle}>Job update notice</Text>
              <Text style={styles.warningText}>{error}</Text>
            </View>
          </View>
        ) : null}

        {contextError ? (
          <View style={styles.infoNotice}>
            <Ionicons
              name="information-circle-outline"
              size={18}
              color={UI.colors.info}
            />
            <Text style={styles.infoNoticeText}>
              Customer and location details could not be loaded. Pull to refresh and try again.
            </Text>
          </View>
        ) : null}

        {primaryAction ? (
          <View style={styles.nextActionSection}>
            <Text style={styles.sectionEyebrow}>NEXT STEP</Text>
            <Text style={styles.sectionTitle}>Keep the job moving</Text>
            <ActionButton
              title={primaryAction.title}
              subtitle={primaryAction.subtitle}
              icon={primaryAction.icon}
              disabled={actionLoading}
              onPress={() => {
                void runAction(primaryAction.action)
              }}
            />
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>CUSTOMER</Text>
          <Text style={styles.sectionTitle}>Who you're serving</Text>

          <View style={styles.contextCard}>
            <View style={styles.contextHeader}>
              <View style={styles.contextIcon}>
                <Ionicons
                  name="person-outline"
                  size={20}
                  color={UI.colors.secondary}
                />
              </View>

              <View style={styles.contextCopy}>
                <Text style={styles.contextTitle}>{customerName}</Text>
                <Text style={styles.contextSubtitle}>
                  Customer details are limited to information needed to complete this booking.
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>SERVICE</Text>
          <Text style={styles.sectionTitle}>What you're delivering</Text>

          <View style={styles.infoCard}>
            <InfoRow
              icon="briefcase-outline"
              label="Service"
              value={serviceName}
            />

            {serviceVariant ? (
              <>
                <InfoDivider />
                <InfoRow
                  icon="layers-outline"
                  label="Variant"
                  value={serviceVariant}
                />
              </>
            ) : null}

            <InfoDivider />
            <InfoRow
              icon="calendar-outline"
              label="Booking type"
              value={getBookingTypeLabel(booking.bookingType)}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>LOCATION</Text>
          <Text style={styles.sectionTitle}>Where you're working</Text>

          <View style={styles.locationCard}>
            <View style={styles.locationTop}>
              <View style={styles.locationIcon}>
                <Ionicons
                  name="location-outline"
                  size={21}
                  color={UI.colors.secondary}
                />
              </View>

              <View style={styles.locationCopy}>
                <Text style={styles.locationLabel}>{addressLabel}</Text>
                <Text style={styles.locationAddress}>
                  {addressText ?? 'Address unavailable'}
                </Text>
              </View>
            </View>

            <CompactContactButton
              icon="navigate-outline"
              label="Get directions"
              disabled={!directionsAvailable}
              onPress={() => {
                void handleDirections()
              }}
            />
          </View>
        </View>

        {booking.bookingType !== 'recurring' &&
        booking.status === 'on_the_way' ? (
          <View style={styles.section}>
            <BookingChatPanel
              bookingId={booking.id}
              customerId={booking.customerId}
            />
          </View>
        ) : null}

        {canCancel ? (
          <Pressable
            onPress={() => {
              confirmAction(
                'cancel',
                'Cancel booking',
                'Are you sure you want to cancel this booking?',
              )
            }}
            disabled={actionLoading}
            accessibilityRole="button"
            accessibilityLabel="Cancel booking"
            style={({ pressed }) => [
              styles.cancelButton,
              pressed && styles.cancelPressed,
            ]}
          >
            <Ionicons
              name="close-circle-outline"
              size={19}
              color={UI.colors.error}
            />
            <Text style={styles.cancelText}>Cancel booking</Text>
          </Pressable>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>SCHEDULE</Text>
          <Text style={styles.sectionTitle}>When you're working</Text>

          <View style={styles.infoCard}>
            <InfoRow
              icon="time-outline"
              label="Start"
              value={formatBookingDateTime(booking.scheduledStart)}
            />

            <InfoDivider />

            <InfoRow
              icon="timer-outline"
              label="Duration"
              value={formatDuration(booking)}
            />

            <InfoDivider />

            <InfoRow
              icon="stopwatch-outline"
              label="End"
              value={formatBookingDateTime(booking.scheduledEnd)}
            />

            {booking.bookingType === 'recurring' &&
            booking.scheduleStartDate &&
            booking.scheduleEndDate ? (
              <>
                <InfoDivider />
                <InfoRow
                  icon="repeat-outline"
                  label="Recurring period"
                  value={`${booking.scheduleStartDate} → ${booking.scheduleEndDate}`}
                />
              </>
            ) : null}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>PAYMENT</Text>
          <Text style={styles.sectionTitle}>Booking earnings</Text>

          <View style={styles.paymentCard}>
            <View style={styles.paymentMain}>
              <View style={styles.paymentIcon}>
                <Ionicons
                  name="cash-outline"
                  size={22}
                  color={UI.colors.success}
                />
              </View>

              <View style={styles.paymentCopy}>
                <Text style={styles.paymentLabel}>Booking amount</Text>
                <Text style={styles.paymentAmount}>
                  {formatBookingAmount(
                    booking.totalAmount,
                    booking.currency,
                  )}
                </Text>
              </View>
            </View>

            <View style={styles.paymentDivider} />

            <View style={styles.paymentHours}>
              <Ionicons
                name="time-outline"
                size={18}
                color={UI.colors.secondary}
              />

              <View style={styles.paymentHoursCopy}>
                <Text style={styles.paymentHoursValue}>
                  {booking.totalWorkingHours !== null
                    ? `${booking.totalWorkingHours}h`
                    : '—'}
                </Text>
                <Text style={styles.paymentHoursLabel}>
                  Working hours
                </Text>
              </View>
            </View>
          </View>
        </View>

        {booking.notes ? (
          <View style={styles.section}>
            <Text style={styles.sectionEyebrow}>CUSTOMER NOTES</Text>
            <Text style={styles.sectionTitle}>Important instructions</Text>

            <View style={styles.notesCard}>
              <Ionicons
                name="document-text-outline"
                size={20}
                color={UI.colors.secondary}
              />
              <Text style={styles.notesText}>{booking.notes}</Text>
            </View>
          </View>
        ) : null}

        {isActiveBookingStatus(booking.status) ? (
          <View style={styles.section}>
            <Text style={styles.sectionEyebrow}>SERVICE PROGRESS</Text>
            <Text style={styles.sectionTitle}>Job timeline</Text>

            <View style={styles.progressCard}>
              <ProgressRow
                icon="navigate-outline"
                label="Journey started"
                value={booking.journeyStartedAt}
              />
              <ProgressRow
                icon="location-outline"
                label="Arrived"
                value={booking.arrivedAt}
              />
              <ProgressRow
                icon="play-circle-outline"
                label="Started"
                value={booking.startedAt}
              />
              <ProgressRow
                icon="checkmark-circle-outline"
                label="Completed"
                value={booking.completedAt}
              />
            </View>

            {booking.bookingType !== 'recurring' ? (
              <WorkerBookingOtpPanel
                booking={booking}
                onVerified={() => {
                  void loadBooking(true)
                }}
              />
            ) : null}
          </View>
        ) : null}

        {occurrences.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionEyebrow}>RECURRING SCHEDULE</Text>
            <Text style={styles.sectionTitle}>Scheduled occurrences</Text>
            <Text style={styles.sectionSubtitle}>
              {occurrences.length}{' '}
              {occurrences.length === 1
                ? 'occurrence'
                : 'occurrences'}
            </Text>

            {nextOccurrence ? (
              <View style={styles.nextOccurrenceCard}>
                <View style={styles.nextOccurrenceIcon}>
                  <Ionicons
                    name="arrow-forward-circle-outline"
                    size={20}
                    color={UI.colors.secondary}
                  />
                </View>
                <View style={styles.nextOccurrenceCopy}>
                  <Text style={styles.nextOccurrenceLabel}>
                    NEXT OCCURRENCE
                  </Text>
                  <Text style={styles.nextOccurrenceDate}>
                    {formatBookingDateTime(
                      nextOccurrence.scheduledStart,
                    )}
                  </Text>
                  <Text style={styles.nextOccurrenceStatus}>
                    {getBookingStatusLabel(nextOccurrence.status)}
                  </Text>
                </View>
              </View>
            ) : null}

            <View style={styles.occurrenceList}>
              {occurrences.map(occurrence => (
                <View
                  key={occurrence.id}
                  style={styles.occurrenceCard}
                >
                  <View style={styles.occurrenceTop}>
                    <View style={styles.occurrenceIcon}>
                      <Ionicons
                        name="calendar-outline"
                        size={19}
                        color={UI.colors.secondary}
                      />
                    </View>

                    <View style={styles.occurrenceCopy}>
                      <Text style={styles.occurrenceIndex}>
                        Occurrence {occurrence.occurrenceIndex}
                      </Text>
                      <Text style={styles.occurrenceDate}>
                        {formatBookingDateTime(
                          occurrence.scheduledStart,
                        )}
                      </Text>
                      <Text style={styles.occurrenceEnd}>
                        Ends {formatBookingDateTime(occurrence.scheduledEnd)}
                      </Text>
                    </View>

                    <StatusBadge
                      label={getBookingStatusLabel(occurrence.status)}
                      variant={getOccurrenceVariant(occurrence.status)}
                    />
                  </View>

                  {onOccurrencePress ? (
                    <Pressable
                      onPress={() => {
                        onOccurrencePress(occurrence.id)
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Open occurrence"
                      style={({ pressed }) => [
                        styles.occurrenceAction,
                        pressed && styles.occurrenceActionPressed,
                      ]}
                    >
                      <Text style={styles.occurrenceActionText}>
                        Open occurrence
                      </Text>
                      <Ionicons
                        name="chevron-forward"
                        size={17}
                        color={UI.colors.secondary}
                      />
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <Text style={styles.footerText}>TempStaff worker job details</Text>
        <View style={styles.bottomSpacing} />
      </ScrollView>
    </ScreenContainer>
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
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}>
        <Ionicons
          name={icon}
          size={18}
          color={UI.colors.secondary}
        />
      </View>

      <View style={styles.infoCopy}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text numberOfLines={3} style={styles.infoValue}>
          {value}
        </Text>
      </View>
    </View>
  )
}

function InfoDivider() {
  return <View style={styles.infoDivider} />
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
  const completed = Boolean(value)

  return (
    <View style={styles.progressRow}>
      <View
        style={[
          styles.progressIcon,
          completed && styles.progressIconCompleted,
        ]}
      >
        <Ionicons
          name={icon}
          size={18}
          color={completed ? UI.colors.success : UI.colors.textMuted}
        />
      </View>

      <View style={styles.progressCopy}>
        <Text style={styles.progressLabel}>{label}</Text>
        <Text
          style={[
            styles.progressValue,
            completed && styles.progressValueCompleted,
          ]}
        >
          {value ? formatBookingDateTime(value) : 'Pending'}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: UI.spacing.lg,
    paddingTop: UI.spacing.md,
    paddingBottom: UI.spacing.xxxl,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
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
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroIcon: {
    width: 54,
    height: 54,
    borderRadius: UI.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: UI.colors.surface,
  },
  heroIconText: {
    fontSize: UI.typography.bodyLarge,
    fontWeight: '900',
    color: UI.colors.primary,
  },
  heroEyebrow: {
    marginTop: UI.spacing.lg,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
    color: UI.colors.surface,
    opacity: 0.72,
  },
  heroTitle: {
    marginTop: UI.spacing.sm,
    fontSize: 25,
    lineHeight: 31,
    fontWeight: '900',
    color: UI.colors.surface,
  },
  heroMeta: {
    marginTop: UI.spacing.xs,
    fontSize: UI.typography.small,
    fontWeight: '600',
    color: UI.colors.surface,
    opacity: 0.76,
  },
  heroAmountRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: UI.spacing.xl,
    paddingTop: UI.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.14)',
  },
  heroAmountLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.9,
    color: UI.colors.surface,
    opacity: 0.64,
  },
  heroAmount: {
    marginTop: UI.spacing.xs,
    fontSize: UI.typography.subtitle,
    fontWeight: '900',
    color: UI.colors.surface,
  },
  heroBookingId: {
    alignItems: 'flex-end',
    maxWidth: 110,
  },
  heroBookingIdLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.9,
    color: UI.colors.surface,
    opacity: 0.64,
  },
  heroBookingIdValue: {
    marginTop: UI.spacing.xs,
    fontSize: UI.typography.small,
    fontWeight: '700',
    color: UI.colors.surface,
    opacity: 0.86,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: UI.spacing.lg,
    padding: UI.spacing.md,
    borderRadius: UI.radius.lg,
    backgroundColor: UI.colors.warningBackground,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  warningIcon: {
    width: 32,
    height: 32,
    borderRadius: UI.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: UI.colors.surface,
  },
  warningCopy: {
    flex: 1,
    marginLeft: UI.spacing.sm,
  },
  warningTitle: {
    fontSize: UI.typography.small,
    fontWeight: '800',
    color: UI.colors.warning,
  },
  warningText: {
    marginTop: UI.spacing.xs,
    fontSize: UI.typography.small,
    lineHeight: 18,
    color: UI.colors.textSecondary,
  },
  infoNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: UI.spacing.sm,
    marginTop: UI.spacing.lg,
    padding: UI.spacing.md,
    borderRadius: UI.radius.lg,
    backgroundColor: UI.colors.infoBackground,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  infoNoticeText: {
    flex: 1,
    fontSize: UI.typography.small,
    lineHeight: 18,
    color: UI.colors.textSecondary,
  },
  nextActionSection: {
    marginTop: UI.spacing.xxl,
  },
  section: {
    marginTop: UI.spacing.xxl,
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
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: UI.spacing.md,
    padding: UI.spacing.lg,
    borderRadius: UI.radius.xl,
    backgroundColor: UI.colors.secondary,
  },
  actionCardPressed: {
    opacity: 0.78,
  },
  actionCardDisabled: {
    opacity: 0.55,
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: UI.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  actionCopy: {
    flex: 1,
    marginLeft: UI.spacing.md,
    marginRight: UI.spacing.sm,
  },
  actionTitle: {
    fontSize: UI.typography.bodyLarge,
    fontWeight: '900',
    color: UI.colors.surface,
  },
  actionSubtitle: {
    marginTop: UI.spacing.xs,
    fontSize: UI.typography.small,
    lineHeight: 18,
    color: UI.colors.surface,
    opacity: 0.76,
  },
  contextCard: {
    marginTop: UI.spacing.md,
    padding: UI.spacing.lg,
    borderRadius: UI.radius.xl,
    backgroundColor: UI.colors.surface,
    borderWidth: 1,
    borderColor: UI.colors.border,
  },
  contextHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  contextIcon: {
    width: 44,
    height: 44,
    borderRadius: UI.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: UI.colors.infoBackground,
  },
  contextCopy: {
    flex: 1,
    marginLeft: UI.spacing.md,
  },
  contextTitle: {
    fontSize: UI.typography.bodyLarge,
    fontWeight: '900',
    color: UI.colors.text,
  },
  contextSubtitle: {
    marginTop: UI.spacing.xs,
    fontSize: UI.typography.small,
    color: UI.colors.textSecondary,
  },
  contextActions: {
    marginTop: UI.spacing.md,
  },
  compactButton: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: UI.spacing.sm,
    paddingHorizontal: UI.spacing.md,
    borderRadius: UI.radius.md,
    backgroundColor: UI.colors.infoBackground,
    borderWidth: 1,
    borderColor: UI.colors.border,
  },
  compactButtonDisabled: {
    opacity: 0.5,
  },
  compactButtonPressed: {
    opacity: 0.7,
  },
  compactButtonText: {
    fontSize: UI.typography.small,
    fontWeight: '800',
    color: UI.colors.secondary,
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: UI.spacing.md,
    paddingVertical: UI.spacing.md,
  },
  cancelPressed: {
    opacity: 0.65,
  },
  cancelText: {
    marginLeft: UI.spacing.xs,
    fontSize: UI.typography.small,
    fontWeight: '800',
    color: UI.colors.error,
  },
  infoCard: {
    marginTop: UI.spacing.md,
    paddingHorizontal: UI.spacing.lg,
    paddingVertical: UI.spacing.sm,
    borderRadius: UI.radius.xl,
    backgroundColor: UI.colors.surface,
    borderWidth: 1,
    borderColor: UI.colors.border,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: UI.spacing.md,
  },
  infoIcon: {
    width: 38,
    height: 38,
    borderRadius: UI.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: UI.colors.infoBackground,
  },
  infoCopy: {
    flex: 1,
    marginLeft: UI.spacing.md,
  },
  infoLabel: {
    fontSize: UI.typography.caption,
    color: UI.colors.textMuted,
  },
  infoValue: {
    marginTop: UI.spacing.xs,
    fontSize: UI.typography.small,
    fontWeight: '800',
    color: UI.colors.text,
  },
  infoDivider: {
    height: 1,
    backgroundColor: UI.colors.border,
  },
  locationCard: {
    marginTop: UI.spacing.md,
    padding: UI.spacing.lg,
    borderRadius: UI.radius.xl,
    backgroundColor: UI.colors.surface,
    borderWidth: 1,
    borderColor: UI.colors.border,
  },
  locationTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  locationIcon: {
    width: 44,
    height: 44,
    borderRadius: UI.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: UI.colors.infoBackground,
  },
  locationCopy: {
    flex: 1,
    marginLeft: UI.spacing.md,
  },
  locationLabel: {
    fontSize: UI.typography.caption,
    fontWeight: '700',
    color: UI.colors.textMuted,
  },
  locationAddress: {
    marginTop: UI.spacing.xs,
    fontSize: UI.typography.body,
    lineHeight: 21,
    fontWeight: '700',
    color: UI.colors.text,
  },
  paymentCard: {
    marginTop: UI.spacing.md,
    padding: UI.spacing.lg,
    borderRadius: UI.radius.xl,
    backgroundColor: UI.colors.surface,
    borderWidth: 1,
    borderColor: UI.colors.border,
  },
  paymentMain: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  paymentIcon: {
    width: 46,
    height: 46,
    borderRadius: UI.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: UI.colors.successBackground,
  },
  paymentCopy: {
    marginLeft: UI.spacing.md,
  },
  paymentLabel: {
    fontSize: UI.typography.caption,
    color: UI.colors.textMuted,
  },
  paymentAmount: {
    marginTop: UI.spacing.xs,
    fontSize: UI.typography.title,
    lineHeight: 30,
    fontWeight: '900',
    color: UI.colors.text,
  },
  paymentDivider: {
    height: 1,
    marginVertical: UI.spacing.lg,
    backgroundColor: UI.colors.border,
  },
  paymentHours: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  paymentHoursCopy: {
    marginLeft: UI.spacing.sm,
  },
  paymentHoursValue: {
    fontSize: UI.typography.bodyLarge,
    fontWeight: '900',
    color: UI.colors.text,
  },
  paymentHoursLabel: {
    marginTop: 2,
    fontSize: UI.typography.caption,
    color: UI.colors.textSecondary,
  },
  notesCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: UI.spacing.md,
    padding: UI.spacing.lg,
    borderRadius: UI.radius.xl,
    backgroundColor: UI.colors.background,
    borderWidth: 1,
    borderColor: UI.colors.border,
  },
  notesText: {
    flex: 1,
    marginLeft: UI.spacing.sm,
    fontSize: UI.typography.body,
    lineHeight: 21,
    color: UI.colors.textSecondary,
  },
  progressCard: {
    marginTop: UI.spacing.md,
    paddingHorizontal: UI.spacing.lg,
    paddingVertical: UI.spacing.sm,
    borderRadius: UI.radius.xl,
    backgroundColor: UI.colors.surface,
    borderWidth: 1,
    borderColor: UI.colors.border,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: UI.spacing.md,
  },
  progressIcon: {
    width: 38,
    height: 38,
    borderRadius: UI.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: UI.colors.background,
  },
  progressIconCompleted: {
    backgroundColor: UI.colors.successBackground,
  },
  progressCopy: {
    flex: 1,
    marginLeft: UI.spacing.md,
  },
  progressLabel: {
    fontSize: UI.typography.small,
    fontWeight: '700',
    color: UI.colors.text,
  },
  progressValue: {
    marginTop: UI.spacing.xs,
    fontSize: UI.typography.caption,
    color: UI.colors.textMuted,
  },
  progressValueCompleted: {
    color: UI.colors.success,
  },
  nextOccurrenceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: UI.spacing.md,
    padding: UI.spacing.lg,
    borderRadius: UI.radius.xl,
    backgroundColor: UI.colors.infoBackground,
    borderWidth: 1,
    borderColor: UI.colors.info,
  },
  nextOccurrenceIcon: {
    width: 42,
    height: 42,
    borderRadius: UI.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: UI.colors.surface,
  },
  nextOccurrenceCopy: {
    flex: 1,
    marginLeft: UI.spacing.md,
  },
  nextOccurrenceLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
    color: UI.colors.info,
  },
  nextOccurrenceDate: {
    marginTop: UI.spacing.xs,
    fontSize: UI.typography.bodyLarge,
    fontWeight: '800',
    color: UI.colors.text,
  },
  nextOccurrenceStatus: {
    marginTop: UI.spacing.xs,
    fontSize: UI.typography.small,
    color: UI.colors.textSecondary,
  },
  occurrenceList: {
    marginTop: UI.spacing.md,
    gap: UI.spacing.md,
  },
  occurrenceCard: {
    padding: UI.spacing.lg,
    borderRadius: UI.radius.xl,
    backgroundColor: UI.colors.surface,
    borderWidth: 1,
    borderColor: UI.colors.border,
  },
  occurrenceTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  occurrenceIcon: {
    width: 40,
    height: 40,
    borderRadius: UI.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: UI.colors.infoBackground,
  },
  occurrenceCopy: {
    flex: 1,
    marginLeft: UI.spacing.md,
    paddingRight: UI.spacing.sm,
  },
  occurrenceIndex: {
    fontSize: UI.typography.caption,
    fontWeight: '700',
    color: UI.colors.textMuted,
  },
  occurrenceDate: {
    marginTop: UI.spacing.xs,
    fontSize: UI.typography.bodyLarge,
    fontWeight: '800',
    color: UI.colors.text,
  },
  occurrenceEnd: {
    marginTop: UI.spacing.xs,
    fontSize: UI.typography.small,
    color: UI.colors.textSecondary,
  },
  occurrenceAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: UI.spacing.md,
    paddingTop: UI.spacing.md,
    borderTopWidth: 1,
    borderTopColor: UI.colors.border,
  },
  occurrenceActionPressed: {
    opacity: 0.7,
  },
  occurrenceActionText: {
    marginRight: UI.spacing.xs,
    fontSize: UI.typography.small,
    fontWeight: '800',
    color: UI.colors.secondary,
  },
  footerText: {
    marginTop: UI.spacing.xl,
    fontSize: UI.typography.caption,
    lineHeight: 16,
    color: UI.colors.textMuted,
    textAlign: 'center',
  },
  bottomSpacing: {
    height: UI.spacing.xxl,
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
    maxWidth: 300,
    fontSize: UI.typography.body,
    lineHeight: 20,
    color: UI.colors.textSecondary,
    textAlign: 'center',
  },
})
