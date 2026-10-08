import {
  useCallback,
  useEffect,
  useMemo,
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
  TextInput,
  View,
} from 'react-native'

import {
  Ionicons,
} from '@expo/vector-icons'

import WorkerLiveBookingMap, {
  type WorkerBookingMapLocation,
} from '../../components/bookings/WorkerLiveBookingMap'

import BookingChatPanel from '../../components/bookings/BookingChatPanel'
import WorkerBookingIssuePanel from '../../components/bookings/WorkerBookingIssuePanel'

import {
  ScreenContainer,
} from '../../components/layout/ScreenContainer'

import ErrorState from '../../components/ui/ErrorState'

import StatusBadge from '../../components/ui/StatusBadge';


import {
  AppButton,
} from '../../components/ui/AppButton'

import {
  UI,
} from '../../constants/ui'

import {
  getWorkerBooking,
} from '../../services/bookings/workerBookings.service'

import {
  getWorkerBookingContext,
  type WorkerBookingContext,
} from '../../services/bookings/workerBookingContext.service'

import {
  getWorkerBookingOccurrence,
  performWorkerOccurrenceAction,
} from '../../services/bookings/workerBookingOccurrences.service'

import {
  verifyWorkerOccurrenceEndOtp,
  verifyWorkerOccurrenceStartOtp,
} from '../../services/bookings/workerBookingOtp.service'

import {
  getLatestWorkerBookingLocation,
  hasRecentBookingLocation,
} from '../../services/bookings/workerBookingTracking.service'

import {
  getCurrentWorkerLocation,
} from '../../services/location/workerLocation.service'

import {
  formatBookingAmount,
  getBookingTypeLabel,
  getBookingDurationHours,
} from '../../lib/workerBookingUtils'

import {
  supabase,
} from '../../lib/supabase'

import type {
  BookingStatus,
  WorkerBooking,
  WorkerBookingActionResponse,
  WorkerBookingOccurrence,
  WorkerOccurrenceAction,
} from '../../types/booking'

type BookingOccurrenceScreenProps = {
  occurrenceId: string
  onBack?: () => void
}

type RealtimeLocationRow = {
  booking_id?: unknown
  latitude?: unknown
  longitude?: unknown
  recorded_at?: unknown
}

const LIVE_STATUSES = [
  'on_the_way',
  'arrived',
  'in_progress',
] as const

function isLiveOccurrenceStatus(
  status: WorkerBookingOccurrence['status'],
): boolean {
  return LIVE_STATUSES.includes(
    status as (typeof LIVE_STATUSES)[number],
  )
}

function isTerminalOccurrenceStatus(
  status: WorkerBookingOccurrence['status'],
): boolean {
  return (
    status === 'completed' ||
    status === 'cancelled'
  )
}

function getStatusVariant(
  status: WorkerBookingOccurrence['status'],
): 'default' | 'success' | 'warning' | 'error' | 'info' {
  switch (status) {
    case 'scheduled':
      return 'default'
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
    case 'scheduled':
      return 'Scheduled'
    default:
      return status
        .charAt(0)
        .toUpperCase() +
        status
          .slice(1)
          .replace(/_/g, ' ')
  }
}

function formatDateTime(
  value: string | null | undefined,
): string {
  if (!value) {
    return '—'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
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

function formatOccurrenceDate(
  value: string | null | undefined,
): string {
  if (!value) {
    return '—'
  }

  const date = new Date(`${value}T00:00:00`)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleDateString(
    'en-IN',
    {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    },
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
      const scheduledStart = new Date(
        occurrence.scheduledStart,
      ).getTime()

      const hasStarted =
        Number.isFinite(scheduledStart) &&
        Date.now() >= scheduledStart

      return {
        action: 'on_the_way',
        title: 'Start journey',
        subtitle: hasStarted
          ? 'Head to the customer service location when you are ready.'
          : `Available from ${formatDateTime(occurrence.scheduledStart)}.`,
        icon: 'navigate-outline',
        disabled: !hasStarted,
      }
    }

    case 'on_the_way':
      return {
        action: 'arrived',
        title: 'Mark arrived',
        subtitle:
          'Confirm when you reach the customer service location.',
        icon: 'location-outline',
      }

    default:
      return null
  }
}

function isStartOtpRequired(
  occurrence: WorkerBookingOccurrence,
): boolean {
  return (
    occurrence.status === 'arrived' &&
    occurrence.startedAt === null &&
    occurrence.startOtpVerifiedAt === null
  )
}

function isEndOtpRequired(
  occurrence: WorkerBookingOccurrence,
): boolean {
  return (
    occurrence.status === 'in_progress' &&
    occurrence.completedAt === null &&
    occurrence.endOtpVerifiedAt === null
  )
}

function isValidMapLocation(
  location: WorkerBookingMapLocation | null,
): boolean {
  return Boolean(
    location &&
      Number.isFinite(location.latitude) &&
      Number.isFinite(location.longitude) &&
      location.latitude >= -90 &&
      location.latitude <= 90 &&
      location.longitude >= -180 &&
      location.longitude <= 180,
  )
}

function toMapLocation(
  latitude: unknown,
  longitude: unknown,
): WorkerBookingMapLocation | null {
  const nextLatitude =
    typeof latitude === 'number'
      ? latitude
      : Number(latitude)

  const nextLongitude =
    typeof longitude === 'number'
      ? longitude
      : Number(longitude)

  const nextLocation = {
    latitude: nextLatitude,
    longitude: nextLongitude,
  }

  return isValidMapLocation(
    nextLocation,
  )
    ? nextLocation
    : null
}

function buildNavigationUrl(
  location: WorkerBookingMapLocation,
): string {
  return (
    'https://www.google.com/maps/dir/?api=1&destination=' +
    `${location.latitude},${location.longitude}`
  )
}

function getInitials(
  value: string | null | undefined,
): string {
  const normalized = value?.trim() ?? ''

  if (!normalized) {
    return 'CU'
  }

  const words = normalized
    .split(/\s+/)
    .filter(Boolean)

  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase()
  }

  return normalized.slice(0, 2).toUpperCase()
}

function formatDuration(
  booking: WorkerBooking | null,
  occurrence: WorkerBookingOccurrence,
): string {
  if (!booking) {
    return `${occurrence.scheduledStart} → ${occurrence.scheduledEnd}`
  }

  const hours = getBookingDurationHours(
    booking,
  )

  if (hours === null) {
    return `${booking.durationValue} ${booking.durationUnit}`
  }

  return `${booking.durationValue} ${booking.durationUnit} · ${hours}h`
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
          color={
            completed
              ? UI.colors.success
              : UI.colors.textMuted
          }
        />
      </View>

      <View style={styles.progressCopy}>
        <Text style={styles.progressLabel}>
          {label}
        </Text>

        <Text
          style={[
            styles.progressValue,
            completed && styles.progressValueCompleted,
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
          color={UI.colors.primaryBlue}
        />
      </View>

      <View style={styles.infoCopy}>
        <Text style={styles.infoLabel}>
          {label}
        </Text>
        <Text style={styles.infoValue}>
          {value}
        </Text>
      </View>
    </View>
  )
}

function InfoDivider() {
  return <View style={styles.infoDivider} />
}

export default function BookingOccurrenceScreen({
  occurrenceId,
  onBack,
}: BookingOccurrenceScreenProps) {
  const [occurrence, setOccurrence] =
    useState<WorkerBookingOccurrence | null>(null)

  const [booking, setBooking] =
    useState<WorkerBooking | null>(null)

  const [context, setContext] =
    useState<WorkerBookingContext | null>(null)

  const [workerLocation, setWorkerLocation] =
    useState<WorkerBookingMapLocation | null>(null)

  const [loading, setLoading] =
    useState(true)

  const [refreshing, setRefreshing] =
    useState(false)

  const [actionLoading, setActionLoading] =
    useState(false)

  const [otpLoading, setOtpLoading] =
    useState(false)

  const [otp, setOtp] = useState('')

  const [locationLoading, setLocationLoading] =
    useState(false)

  const [error, setError] =
    useState<string | null>(null)

  const [contextError, setContextError] =
    useState<string | null>(null)

  const [locationError, setLocationError] =
    useState<string | null>(null)

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

          if (!nextOccurrence) {
            throw new Error(
              'Booking occurrence not found or not assigned to this worker.',
            )
          }

          setOccurrence(
            nextOccurrence,
          )

          const parentBooking =
            await getWorkerBooking(
              nextOccurrence.bookingId,
            )

          setBooking(
            parentBooking,
          )

          try {
            const nextContext =
              await getWorkerBookingContext(
                nextOccurrence.bookingId,
              )

            setContext(
              nextContext,
            )
            setContextError(null)
          } catch (cause) {
            setContext(null)
            setContextError(
              cause instanceof Error
                ? cause.message
                : 'Customer and service location details are unavailable.',
            )
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
  }, [loadOccurrence])

  useEffect(() => {
    if (
      !occurrence ||
      occurrence.status !== 'assigned'
    ) {
      return
    }

    const timer = setInterval(() => {
      setOccurrence(current =>
        current
          ? { ...current }
          : current,
      )
    }, 30000)

    return () => {
      clearInterval(timer)
    }
  }, [occurrence?.status])

  const customerLocation = useMemo<WorkerBookingMapLocation | null>(() => {
    if (
      !context ||
      context.latitude === null ||
      context.longitude === null
    ) {
      return null
    }

    return toMapLocation(
      context.latitude,
      context.longitude,
    )
  }, [context])

  const operational = Boolean(
    occurrence &&
      !isTerminalOccurrenceStatus(
        occurrence.status,
      ),
  )

  const liveTracking = Boolean(
    occurrence &&
      isLiveOccurrenceStatus(
        occurrence.status,
      ),
  )

  const syncWorkerLocation =
    useCallback(
      async (
        targetOccurrence: WorkerBookingOccurrence,
      ): Promise<void> => {
        setLocationLoading(true)
        setLocationError(null)

        try {
          const latest =
            await getLatestWorkerBookingLocation(
              targetOccurrence.bookingId,
            )

          if (
            latest &&
            hasRecentBookingLocation(
              latest,
              120,
            )
          ) {
            setWorkerLocation({
              latitude:
                latest.latitude,
              longitude:
                latest.longitude,
            })

            return
          }

          if (
            targetOccurrence.status === 'assigned'
          ) {
            const current =
              await getCurrentWorkerLocation({
                maximumAge: 15000,
                timeout: 15000,
              })

            const currentLocation =
              toMapLocation(
                current.latitude,
                current.longitude,
              )

            if (currentLocation) {
              setWorkerLocation(
                currentLocation,
              )
              return
            }
          }

          if (
            isLiveOccurrenceStatus(
              targetOccurrence.status,
            ) ||
            targetOccurrence.status ===
              'assigned'
          ) {
            setLocationError(
              'Your latest worker location is not available yet. Make sure location access is enabled and pull to refresh.',
            )
          }
        } catch (cause) {
          setLocationError(
            cause instanceof Error
              ? cause.message
              : 'Live worker location is unavailable.',
          )
        } finally {
          setLocationLoading(false)
        }
      },
      [],
    )

  useEffect(() => {
    if (!occurrence) {
      return
    }

    if (
      isTerminalOccurrenceStatus(
        occurrence.status,
      )
    ) {
      setWorkerLocation(null)
      setLocationError(null)
      return
    }

    void syncWorkerLocation(
      occurrence,
    )
  }, [
    occurrence?.id,
    occurrence?.status,
    occurrence?.bookingId,
    syncWorkerLocation,
  ])

  useEffect(() => {
    if (!occurrence) {
      return
    }

    if (
      !operational
    ) {
      return
    }

    let active = true

    const channel =
      supabase
        .channel(
          `worker-occurrence-${occurrence.id}-${Date.now()}`,
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table:
              'booking_schedule_occurrences',
            filter:
              `id=eq.${occurrence.id}`,
          },
          () => {
            void loadOccurrence(true)
          },
        )
        .subscribe()

    const locationChannel =
      supabase
        .channel(
          `worker-occurrence-location-${occurrence.id}-${Date.now()}`,
        )
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'worker_locations',
            filter:
              `booking_id=eq.${occurrence.bookingId}`,
          },
          payload => {
            if (!active) {
              return
            }

            const row =
              payload.new as RealtimeLocationRow

            const nextLocation =
              toMapLocation(
                row.latitude,
                row.longitude,
              )

            if (nextLocation) {
              setWorkerLocation(
                nextLocation,
              )
              setLocationError(null)
            }
          },
        )
        .subscribe()

    const refreshInterval = setInterval(() => {
      if (active) {
        void loadOccurrence(true)
        void syncWorkerLocation(
          occurrence,
        )
      }
    }, 15000)

    return () => {
      active = false
      clearInterval(refreshInterval)
      void supabase.removeChannel(channel)
      void supabase.removeChannel(locationChannel)
    }
  }, [
    occurrence?.id,
    occurrence?.bookingId,
    operational,
    loadOccurrence,
    syncWorkerLocation,
  ])

  const runAction =
    useCallback(
      async (
        action: WorkerOccurrenceAction,
      ): Promise<void> => {
        if (!occurrence) {
          return
        }

        setActionLoading(true)
        setError(null)

        try {
          const response: WorkerBookingActionResponse =
            await performWorkerOccurrenceAction(
              occurrence.id,
              action,
            )

          if (response.success !== true) {
            throw new Error(
              response.error ||
                'Unable to update the occurrence.',
            )
          }

          await loadOccurrence(true)
        } catch (cause) {
          setError(
            cause instanceof Error
              ? cause.message
              : 'Unable to update the occurrence.',
          )
        } finally {
          setActionLoading(false)
        }
      },
      [occurrence, loadOccurrence],
    )

  const verifyOtp =
    useCallback(
      async (): Promise<void> => {
        if (!occurrence) {
          return
        }

        const normalizedOtp =
          otp.replace(/\D/g, '').slice(0, 6)

        if (!/^\d{6}$/.test(normalizedOtp)) {
          setError('OTP must be a 6-digit number.')
          return
        }

        const startRequired =
          isStartOtpRequired(occurrence)

        const endRequired =
          isEndOtpRequired(occurrence)

        if (!startRequired && !endRequired) {
          return
        }

        setOtpLoading(true)
        setError(null)

        try {
          if (startRequired) {
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
          await loadOccurrence(true)
        } catch (cause) {
          setError(
            cause instanceof Error
              ? cause.message
              : 'Unable to verify the OTP.',
          )
        } finally {
          setOtpLoading(false)
        }
      },
      [occurrence, otp, loadOccurrence],
    )

  const handleNavigation = useCallback(
    async (): Promise<void> => {
      if (!customerLocation) {
        Alert.alert(
          'Location unavailable',
          'The customer service location is not available for this occurrence.',
        )
        return
      }

      try {
        await Linking.openURL(
          buildNavigationUrl(
            customerLocation,
          ),
        )
      } catch {
        Alert.alert(
          'Unable to open navigation',
          'Your device could not open maps.',
        )
      }
    },
    [customerLocation],
  )


  if (loading) {
    return (
      <ScreenContainer>
        <View style={styles.loadingContainer}>
          <ActivityIndicator
            size="large"
            color={UI.colors.primaryBlue}
          />
          <Text style={styles.loadingTitle}>
            Loading occurrence
          </Text>
          <Text style={styles.loadingText}>
            Preparing the customer location and job status.
          </Text>
        </View>
      </ScreenContainer>
    )
  }

  if (error && !occurrence) {
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
    getPrimaryAction(occurrence)

  const startOtpRequired =
    isStartOtpRequired(occurrence)

  const endOtpRequired =
    isEndOtpRequired(occurrence)


  const customerName =
    context?.customerName ??
    'Customer'

  const serviceName =
    context?.serviceName ??
    'Service details unavailable'

  const variantName =
    context?.variantName ??
    null

  const addressLabel =
    context?.addressLabel ??
    'Service location'

  const addressLine =
    context?.addressLine ??
    'Service location unavailable'

  const showMap = Boolean(
    operational &&
      workerLocation &&
      customerLocation &&
      isValidMapLocation(
        workerLocation,
      ) &&
      isValidMapLocation(
        customerLocation,
      ),
  )

  return (
    <ScreenContainer>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void loadOccurrence(true)
            }}
            tintColor={UI.colors.primaryBlue}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topBar}>
          {onBack ? (
            <Pressable
              onPress={onBack}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              hitSlop={8}
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
            <View style={styles.headerPlaceholder} />
          )}

          <View style={styles.topBarCenter}>
            <Text style={styles.topBarEyebrow}>
              KvikStaff
            </Text>
            <Text style={styles.topBarTitle}>
              {operational
                ? 'Active occurrence'
                : 'Occurrence history'}
            </Text>
          </View>

          <Pressable
            onPress={() => {
              void loadOccurrence(true)
            }}
            disabled={refreshing || actionLoading || otpLoading}
            accessibilityRole="button"
            accessibilityLabel="Refresh occurrence"
            hitSlop={8}
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
            <View style={styles.customerAvatar}>
              <Text style={styles.customerAvatarText}>
                {getInitials(customerName)}
              </Text>
            </View>

            <StatusBadge
              label={getStatusLabel(occurrence.status)}
              variant={getStatusVariant(occurrence.status)}
            />
          </View>

          <Text style={styles.heroEyebrow}>
            {operational ? 'CURRENT JOB' : 'RECORDED OCCURRENCE'}
          </Text>

          <Text style={styles.heroTitle}>
            {serviceName}
          </Text>

          <Text style={styles.heroMeta}>
            {variantName ? `${variantName} · ` : ''}
            Occurrence {occurrence.occurrenceIndex}
          </Text>

          <Text style={styles.heroDate}>
            {formatDateTime(occurrence.scheduledStart)}
          </Text>

          <View style={styles.heroFooter}>
            <View>
              <Text style={styles.heroLabel}>
                OCCURRENCE VALUE
              </Text>
              <Text style={styles.heroAmount}>
                {formatBookingAmount(
                  occurrence.totalAmount,
                  booking?.currency ?? 'INR',
                )}
              </Text>
            </View>

            <View style={styles.heroStatusCopy}>
              <Text style={styles.heroLabel}>
                DATE
              </Text>
              <Text style={styles.heroStatusValue}>
                {formatOccurrenceDate(
                  occurrence.occurrenceDate,
                )}
              </Text>
            </View>
          </View>
        </View>

        {error ? (
          <View style={styles.warningBox}>
            <Ionicons
              name="alert-circle-outline"
              size={19}
              color={UI.colors.warning}
            />
            <Text style={styles.warningText}>
              {error}
            </Text>
          </View>
        ) : null}

        {contextError ? (
          <View style={styles.infoBox}>
            <Ionicons
              name="information-circle-outline"
              size={19}
              color={UI.colors.info}
            />
            <Text style={styles.infoText}>
              Customer and service location details could not be loaded. Pull to refresh and try again.
            </Text>
          </View>
        ) : null}

        {operational ? (
          <View style={styles.section}>
            <Text style={styles.sectionEyebrow}>
              SERVICE LOCATION
            </Text>

            <Text style={styles.sectionTitle}>
              {liveTracking
                ? 'Live route to customer'
                : 'Route preview'}
            </Text>

            <View style={styles.locationCard}>
              <View style={styles.locationHeader}>
                <View style={styles.locationIcon}>
                  <Ionicons
                    name="location-outline"
                    size={22}
                    color={UI.colors.primaryBlue}
                  />
                </View>

                <View style={styles.locationCopy}>
                  <Text style={styles.locationLabel}>
                    {addressLabel}
                  </Text>
                  <Text style={styles.locationAddress}>
                    {addressLine}
                  </Text>
                </View>
              </View>

              {showMap ? (
                <View style={styles.mapWrapper}>
                  <WorkerLiveBookingMap
                    workerLocation={workerLocation!}
                    customerLocation={customerLocation!}
                    workerLabel="You"
                    customerLabel="Customer"
                  />
                </View>
              ) : (
                <View style={styles.mapUnavailable}>
                  <Ionicons
                    name="map-outline"
                    size={30}
                    color={UI.colors.primaryBlue}
                  />

                  <Text style={styles.mapUnavailableTitle}>
                    {locationLoading
                      ? 'Getting live location...'
                      : 'Live map is not ready'}
                  </Text>

                  <Text style={styles.mapUnavailableText}>
                    {locationError ??
                      (customerLocation
                        ? 'Waiting for a recent worker location update.'
                        : 'Customer service coordinates are unavailable for this occurrence.')}
                  </Text>
                </View>
              )}

              <View style={styles.navigationAction}>
                <AppButton
                  title="Open navigation"
                  onPress={() => {
                    void handleNavigation()
                  }}
                  disabled={!customerLocation}
                />
              </View>

              <Text style={styles.navigationHint}>
                {liveTracking
                  ? 'Your location is shared with this active booking while the occurrence is on the way, arrived, or in progress.'
                  : 'The route preview shows the service destination. Live booking-scoped location starts when the journey begins.'}
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.section}>
            <View style={styles.historyNotice}>
              <Ionicons
                name={
                  occurrence.status === 'completed'
                    ? 'checkmark-circle-outline'
                    : 'time-outline'
                }
                size={22}
                color={
                  occurrence.status === 'completed'
                    ? UI.colors.success
                    : UI.colors.textMuted
                }
              />

              <View style={styles.historyNoticeCopy}>
                <Text style={styles.historyNoticeTitle}>
                  {occurrence.status === 'completed'
                    ? 'Occurrence completed'
                    : 'Occurrence is no longer active'}
                </Text>
                <Text style={styles.historyNoticeText}>
                  Live location, navigation controls, chat, and OTP verification are unavailable for historical occurrences.
                </Text>
              </View>
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>
            CUSTOMER
          </Text>

          <Text style={styles.sectionTitle}>
            Who you're serving
          </Text>

          <View style={styles.customerCard}>
            <View style={styles.customerIcon}>
              <Ionicons
                name="person-outline"
                size={21}
                color={UI.colors.primaryBlue}
              />
            </View>

            <View style={styles.customerCopy}>
              <Text style={styles.customerName}>
                {customerName}
              </Text>

              <Text style={styles.customerSubtitle}>
                Only information required to complete or review this KvikStaff occurrence is shown.
              </Text>
            </View>
          </View>
        </View>

        {operational &&
        occurrence.status === 'on_the_way' ? (
          <View style={styles.section}>
            <BookingChatPanel
              bookingId={occurrence.bookingId}
              customerId={context?.customerId ?? ''}
              occurrenceId={occurrence.id}
            />
          </View>
        ) : null}

        {primaryAction ? (
          <View style={styles.section}>
            <Text style={styles.sectionEyebrow}>
              NEXT STEP
            </Text>

            <Text style={styles.sectionTitle}>
              Keep the occurrence moving
            </Text>

            <Pressable
              onPress={() => {
                if (primaryAction.disabled) {
                  return
                }

                void runAction(
                  primaryAction.action,
                )
              }}
              disabled={
                actionLoading ||
                primaryAction.disabled === true
              }
              accessibilityRole="button"
              accessibilityLabel={primaryAction.title}
              style={({ pressed }) => [
                styles.primaryAction,
                pressed && styles.primaryActionPressed,
                (actionLoading ||
                  primaryAction.disabled === true) &&
                  styles.primaryActionDisabled,
              ]}
            >
              <View style={styles.primaryActionIcon}>
                <Ionicons
                  name={primaryAction.icon}
                  size={21}
                  color={UI.colors.surface}
                />
              </View>

              <View style={styles.primaryActionCopy}>
                <Text style={styles.primaryActionTitle}>
                  {primaryAction.title}
                </Text>

                <Text style={styles.primaryActionSubtitle}>
                  {primaryAction.subtitle}
                </Text>
              </View>

              <Ionicons
                name="chevron-forward"
                size={20}
                color={UI.colors.surface}
              />
            </Pressable>
          </View>
        ) : null}

        {occurrence.workerId &&
        occurrence.status !== 'completed' &&
        occurrence.status !== 'cancelled' ? (
          <WorkerBookingIssuePanel
            bookingId={occurrence.bookingId}
            occurrenceId={occurrence.id}
            scheduledStart={occurrence.scheduledStart}
            scheduledEnd={occurrence.scheduledEnd}
            allowChangeRequests={
              occurrence.status === 'scheduled' ||
              occurrence.status === 'assigned'
            }
          />
        ) : null}

        {startOtpRequired || endOtpRequired ? (
          <View style={styles.section}>
            <Text style={styles.sectionEyebrow}>
              VERIFICATION
            </Text>

            <Text style={styles.sectionTitle}>
              {startOtpRequired
                ? 'Start service'
                : 'Complete service'}
            </Text>

            <View style={styles.otpCard}>
              <View style={styles.otpHeader}>
                <View style={styles.otpIcon}>
                  <Ionicons
                    name="shield-checkmark-outline"
                    size={21}
                    color={UI.colors.warning}
                  />
                </View>

                <View style={styles.otpHeaderCopy}>
                  <Text style={styles.otpTitle}>
                    Customer verification
                  </Text>

                  <Text style={styles.otpDescription}>
                    {startOtpRequired
                      ? 'Enter the 6-digit OTP provided by the customer before starting the service.'
                      : 'Enter the 6-digit OTP provided by the customer to complete the service.'}
                  </Text>
                </View>
              </View>

              <TextInput
                value={otp}
                onChangeText={value => {
                  setOtp(
                    value
                      .replace(/\D/g, '')
                      .slice(0, 6),
                  )
                  setError(null)
                }}
                keyboardType="number-pad"
                maxLength={6}
                placeholder="6-digit OTP"
                placeholderTextColor={UI.colors.textMuted}
                editable={!otpLoading}
                style={styles.otpInput}
                textContentType="oneTimeCode"
                autoComplete="sms-otp"
              />

              <AppButton
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

        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>
            SCHEDULE
          </Text>

          <Text style={styles.sectionTitle}>
            Occurrence timing
          </Text>

          <View style={styles.infoCard}>
            <InfoRow
              icon="calendar-outline"
              label="Occurrence date"
              value={formatOccurrenceDate(
                occurrence.occurrenceDate,
              )}
            />

            <InfoDivider />

            <InfoRow
              icon="play-circle-outline"
              label="Scheduled start"
              value={formatDateTime(
                occurrence.scheduledStart,
              )}
            />

            <InfoDivider />

            <InfoRow
              icon="stopwatch-outline"
              label="Scheduled end"
              value={formatDateTime(
                occurrence.scheduledEnd,
              )}
            />

            {booking ? (
              <>
                <InfoDivider />
                <InfoRow
                  icon="repeat-outline"
                  label="Booking type"
                  value={getBookingTypeLabel(
                    booking.bookingType,
                  )}
                />
                <InfoDivider />
                <InfoRow
                  icon="time-outline"
                  label="Booking duration"
                  value={formatDuration(
                    booking,
                    occurrence,
                  )}
                />
              </>
            ) : null}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>
            PAYMENT
          </Text>

          <Text style={styles.sectionTitle}>
            Earnings for this occurrence
          </Text>

          <View style={styles.paymentCard}>
            <View style={styles.paymentMain}>
              <View style={styles.paymentIcon}>
                <Ionicons
                  name="cash-outline"
                  size={23}
                  color={UI.colors.success}
                />
              </View>

              <View style={styles.paymentCopy}>
                <Text style={styles.paymentLabel}>
                  Total
                </Text>

                <Text style={styles.paymentAmount}>
                  {formatBookingAmount(
                    occurrence.totalAmount,
                    booking?.currency ?? 'INR',
                  )}
                </Text>
              </View>
            </View>

            <View style={styles.paymentGrid}>
              <PaymentItem
                label="Base"
                value={occurrence.baseAmount}
                currency={booking?.currency ?? 'INR'}
              />

              <PaymentItem
                label="Discount"
                value={occurrence.discountAmount}
                negative
                currency={booking?.currency ?? 'INR'}
              />

              <PaymentItem
                label="Platform fee"
                value={occurrence.platformFee}
                currency={booking?.currency ?? 'INR'}
              />

              <PaymentItem
                label="Tax"
                value={occurrence.taxAmount}
                currency={booking?.currency ?? 'INR'}
              />
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>
            SERVICE PROGRESS
          </Text>

          <Text style={styles.sectionTitle}>
            Occurrence timeline
          </Text>

          <View style={styles.progressCard}>
            <ProgressRow
              icon="navigate-outline"
              label="Journey started"
              value={occurrence.journeyStartedAt}
            />

            <ProgressRow
              icon="location-outline"
              label="Arrived"
              value={occurrence.arrivedAt}
            />

            <ProgressRow
              icon="play-circle-outline"
              label="Started"
              value={occurrence.startedAt}
            />

            <ProgressRow
              icon="checkmark-circle-outline"
              label="Completed"
              value={occurrence.completedAt}
            />
          </View>
        </View>

      

        <Text style={styles.footerText}>
          KvikStaff worker occurrence
        </Text>

        <View style={styles.bottomSpacing} />
      </ScrollView>
    </ScreenContainer>
  )
}

function PaymentItem({
  label,
  value,
  currency,
  negative = false,
}: {
  label: string
  value: number
  currency: string
  negative?: boolean
}) {
  return (
    <View style={styles.paymentItem}>
      <Text style={styles.paymentItemLabel}>
        {label}
      </Text>

      <Text
        style={[
          styles.paymentItemValue,
          negative && styles.paymentItemValueNegative,
        ]}
      >
        {formatBookingAmount(
          negative
            ? -Math.abs(value)
            : value,
          currency,
        )}
      </Text>
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

  headerPlaceholder: {
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
    color: UI.colors.primaryBlue,
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

  customerAvatar: {
    width: 56,
    height: 56,
    borderRadius: UI.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: UI.colors.surface,
  },

  customerAvatarText: {
    fontSize: 18,
    fontWeight: '900',
    color: UI.colors.primary,
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
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '900',
    color: UI.colors.surface,
  },

  heroMeta: {
    marginTop: UI.spacing.sm,
    fontSize: UI.typography.body,
    lineHeight: 20,
    color: UI.colors.surface,
    opacity: 0.8,
  },

  heroDate: {
    marginTop: UI.spacing.xs,
    fontSize: UI.typography.small,
    lineHeight: 20,
    color: UI.colors.surface,
    opacity: 0.76,
  },

  heroFooter: {
    marginTop: UI.spacing.xl,
    paddingTop: UI.spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.14)',
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },

  heroLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: UI.colors.surface,
    opacity: 0.64,
  },

  heroAmount: {
    marginTop: 3,
    fontSize: 20,
    fontWeight: '900',
    color: UI.colors.surface,
  },

  heroStatusCopy: {
    alignItems: 'flex-end',
    maxWidth: '48%',
  },

  heroStatusValue: {
    marginTop: 3,
    fontSize: UI.typography.small,
    fontWeight: '800',
    color: UI.colors.surface,
    textAlign: 'right',
  },

  warningBox: {
    marginTop: UI.spacing.lg,
    padding: UI.spacing.md,
    borderRadius: UI.radius.lg,
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: UI.colors.warningBackground,
    borderWidth: 1,
    borderColor: UI.colors.warningBackground,
  },

  warningText: {
    flex: 1,
    marginLeft: UI.spacing.sm,
    fontSize: UI.typography.small,
    lineHeight: 18,
    color: UI.colors.textSecondary,
  },

  infoBox: {
    marginTop: UI.spacing.lg,
    padding: UI.spacing.md,
    borderRadius: UI.radius.lg,
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: UI.colors.infoBackground,
    borderWidth: 1,
    borderColor: UI.colors.border,
  },

  infoText: {
    flex: 1,
    marginLeft: UI.spacing.sm,
    fontSize: UI.typography.small,
    lineHeight: 18,
    color: UI.colors.textSecondary,
  },

  section: {
    marginTop: UI.spacing.xxl,
  },

  sectionEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.05,
    color: UI.colors.primaryBlue,
  },

  sectionTitle: {
    marginTop: UI.spacing.xs,
    fontSize: UI.typography.subtitle,
    lineHeight: 23,
    fontWeight: '800',
    color: UI.colors.text,
  },

  locationCard: {
    marginTop: UI.spacing.md,
    padding: UI.spacing.lg,
    borderRadius: UI.radius.xl,
    backgroundColor: UI.colors.surface,
    borderWidth: 1,
    borderColor: UI.colors.border,
  },

  locationHeader: {
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
    fontSize: UI.typography.small,
    fontWeight: '800',
    color: UI.colors.primaryBlue,
  },

  locationAddress: {
    marginTop: UI.spacing.xs,
    fontSize: UI.typography.body,
    lineHeight: 21,
    color: UI.colors.text,
  },

  mapWrapper: {
    marginTop: UI.spacing.lg,
  },

  mapUnavailable: {
    minHeight: 220,
    marginTop: UI.spacing.lg,
    padding: UI.spacing.xl,
    borderRadius: UI.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: UI.colors.background,
    borderWidth: 1,
    borderColor: UI.colors.border,
  },

  mapUnavailableTitle: {
    marginTop: UI.spacing.sm,
    fontSize: UI.typography.bodyLarge,
    fontWeight: '800',
    color: UI.colors.text,
    textAlign: 'center',
  },

  mapUnavailableText: {
    marginTop: UI.spacing.xs,
    fontSize: UI.typography.small,
    lineHeight: 18,
    color: UI.colors.textSecondary,
    textAlign: 'center',
  },

  navigationAction: {
    marginTop: UI.spacing.md,
  },

  navigationHint: {
    marginTop: UI.spacing.sm,
    fontSize: UI.typography.caption,
    lineHeight: 17,
    color: UI.colors.textMuted,
  },

  historyNotice: {
    padding: UI.spacing.lg,
    borderRadius: UI.radius.xl,
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: UI.colors.background,
    borderWidth: 1,
    borderColor: UI.colors.border,
  },

  historyNoticeCopy: {
    flex: 1,
    marginLeft: UI.spacing.md,
  },

  historyNoticeTitle: {
    fontSize: UI.typography.bodyLarge,
    fontWeight: '800',
    color: UI.colors.text,
  },

  historyNoticeText: {
    marginTop: UI.spacing.xs,
    fontSize: UI.typography.small,
    lineHeight: 18,
    color: UI.colors.textSecondary,
  },

  customerCard: {
    marginTop: UI.spacing.md,
    padding: UI.spacing.lg,
    borderRadius: UI.radius.xl,
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: UI.colors.surface,
    borderWidth: 1,
    borderColor: UI.colors.border,
  },

  customerIcon: {
    width: 44,
    height: 44,
    borderRadius: UI.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: UI.colors.infoBackground,
  },

  customerCopy: {
    flex: 1,
    marginLeft: UI.spacing.md,
  },

  customerName: {
    fontSize: UI.typography.bodyLarge,
    fontWeight: '800',
    color: UI.colors.text,
  },

  customerSubtitle: {
    marginTop: UI.spacing.xs,
    fontSize: UI.typography.small,
    lineHeight: 18,
    color: UI.colors.textSecondary,
  },

  primaryAction: {
    marginTop: UI.spacing.md,
    minHeight: 68,
    padding: UI.spacing.lg,
    borderRadius: UI.radius.xl,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: UI.colors.primaryBlue,
  },

  primaryActionPressed: {
    opacity: 0.78,
  },

  primaryActionDisabled: {
    opacity: 0.55,
  },

  primaryActionIcon: {
    width: 46,
    height: 46,
    borderRadius: UI.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },

  primaryActionCopy: {
    flex: 1,
    marginLeft: UI.spacing.md,
    marginRight: UI.spacing.sm,
  },

  primaryActionTitle: {
    fontSize: UI.typography.bodyLarge,
    fontWeight: '900',
    color: UI.colors.surface,
  },

  primaryActionSubtitle: {
    marginTop: UI.spacing.xs,
    fontSize: UI.typography.small,
    lineHeight: 18,
    color: UI.colors.surface,
    opacity: 0.78,
  },

  otpCard: {
    marginTop: UI.spacing.md,
    padding: UI.spacing.lg,
    borderRadius: UI.radius.xl,
    backgroundColor: UI.colors.warningBackground,
    borderWidth: 1,
    borderColor: UI.colors.warningBackground,
  },

  otpHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },

  otpIcon: {
    width: 42,
    height: 42,
    borderRadius: UI.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: UI.colors.surface,
  },

  otpHeaderCopy: {
    flex: 1,
    marginLeft: UI.spacing.md,
  },

  otpTitle: {
    fontSize: UI.typography.bodyLarge,
    fontWeight: '900',
    color: UI.colors.text,
  },

  otpDescription: {
    marginTop: UI.spacing.xs,
    fontSize: UI.typography.small,
    lineHeight: 18,
    color: UI.colors.textSecondary,
  },

  otpInput: {
    height: 56,
    marginTop: UI.spacing.lg,
    marginBottom: UI.spacing.md,
    paddingHorizontal: UI.spacing.lg,
    borderRadius: UI.radius.md,
    borderWidth: 1,
    borderColor: UI.colors.border,
    backgroundColor: UI.colors.surface,
    color: UI.colors.text,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 6,
    textAlign: 'center',
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
    width: 48,
    height: 48,
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

  paymentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: UI.spacing.lg,
    paddingTop: UI.spacing.md,
    borderTopWidth: 1,
    borderTopColor: UI.colors.border,
  },

  paymentItem: {
    width: '50%',
    paddingVertical: UI.spacing.sm,
  },

  paymentItemLabel: {
    fontSize: UI.typography.caption,
    color: UI.colors.textMuted,
  },

  paymentItemValue: {
    marginTop: UI.spacing.xs,
    fontSize: UI.typography.small,
    fontWeight: '800',
    color: UI.colors.text,
  },

  paymentItemValueNegative: {
    color: UI.colors.error,
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
    width: 40,
    height: 40,
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

 

  footerText: {
    marginTop: UI.spacing.xl,
    fontSize: UI.typography.caption,
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
