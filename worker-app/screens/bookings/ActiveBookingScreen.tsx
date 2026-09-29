import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
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

import WorkerLiveBookingMap, {
  type WorkerBookingMapLocation,
} from '../../components/bookings/WorkerLiveBookingMap'

import WorkerBookingOtpPanel from '../../components/bookings/WorkerBookingOtpPanel'

import BookingChatPanel from '../../components/bookings/BookingChatPanel'

import { ScreenContainer } from '../../components/layout/ScreenContainer'

import ErrorState from '../../components/ui/ErrorState'
import StatusBadge from '../../components/ui/StatusBadge'
import { AppButton } from '../../components/ui/AppButton'

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
  getLatestWorkerBookingLocation,
  hasRecentBookingLocation,
  recordWorkerBookingLocation,
} from '../../services/bookings/workerBookingTracking.service'

import {
  getCurrentWorkerLocation,
} from '../../services/location/workerLocation.service'

import {
  formatBookingAmount,
  formatBookingDateTime,
  getBookingDurationHours,
  getBookingStatusLabel,
  getBookingTypeLabel,
  isActiveBookingStatus,
  isTerminalBookingStatus,
} from '../../lib/workerBookingUtils'

import {
  supabase,
} from '../../lib/supabase'

import type {
  BookingStatus,
  WorkerBooking,
  WorkerBookingAction,
} from '../../types/booking'

type ActiveBookingScreenProps = {
  bookingId: string
  onBack?: () => void
  onFinished?: (bookingId: string) => void
}

type RealtimeLocationRow = {
  booking_id?: unknown
  latitude?: unknown
  longitude?: unknown
  recorded_at?: unknown
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
  booking: WorkerBooking,
): string {
  const hours = getBookingDurationHours(booking)

  if (hours === null) {
    return `${booking.durationValue} ${booking.durationUnit}`
  }

  return `${booking.durationValue} ${booking.durationUnit} · ${hours}h`
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

function buildNavigationUrl(
  location: WorkerBookingMapLocation,
): string {
  return (
    'https://www.google.com/maps/dir/?api=1&destination=' +
    `${location.latitude},${location.longitude}`
  )
}

function toMapLocation(
  latitude: unknown,
  longitude: unknown,
): WorkerBookingMapLocation | null {
  const parsedLatitude =
    typeof latitude === 'number'
      ? latitude
      : Number(latitude)

  const parsedLongitude =
    typeof longitude === 'number'
      ? longitude
      : Number(longitude)

  const location = {
    latitude: parsedLatitude,
    longitude: parsedLongitude,
  }

  return isValidMapLocation(location)
    ? location
    : null
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
  const complete = Boolean(value)

  return (
    <View style={styles.progressRow}>
      <View
        style={[
          styles.progressIcon,
          complete && styles.progressIconComplete,
        ]}
      >
        <Ionicons
          name={icon}
          size={18}
          color={
            complete
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
            complete && styles.progressValueComplete,
          ]}
        >
          {value
            ? formatBookingDateTime(value)
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
          color={UI.colors.secondary}
        />
      </View>

      <View style={styles.infoCopy}>
        <Text style={styles.infoLabel}>
          {label}
        </Text>

        <Text
          style={styles.infoValue}
          numberOfLines={3}
        >
          {value}
        </Text>
      </View>
    </View>
  )
}

function InfoDivider() {
  return <View style={styles.infoDivider} />
}

export default function ActiveBookingScreen({
  bookingId,
  onBack,
  onFinished,
}: ActiveBookingScreenProps) {
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

  const [locationLoading, setLocationLoading] =
    useState(false)

  const [error, setError] =
    useState<string | null>(null)

  const [contextError, setContextError] =
    useState<string | null>(null)

  const [locationError, setLocationError] =
    useState<string | null>(null)

  const finishedRef =
    useRef(false)

  const initialSyncKeyRef =
    useRef<string | null>(null)

  const loadBooking =
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
          const nextBooking =
            await getWorkerBooking(
              bookingId,
            )

          if (!nextBooking) {
            throw new Error(
              'This booking is no longer assigned to your worker account.',
            )
          }

          /*
           * ActiveBookingScreen is only for the live
           * operational lifecycle. Once a booking leaves
           * that lifecycle, hand control back to the
           * historical details screen.
           */
          if (
            !isActiveBookingStatus(
              nextBooking.status,
            )
          ) {
            if (
              !finishedRef.current &&
              (
                isTerminalBookingStatus(
                  nextBooking.status,
                ) ||
                nextBooking.status !==
                  'assigned'
              )
            ) {
              finishedRef.current = true
              onFinished?.(
                nextBooking.id,
              )
            }

            setBooking(
              nextBooking,
            )

            return
          }

          setBooking(
            nextBooking,
          )

          try {
            const nextContext =
              await getWorkerBookingContext(
                bookingId,
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
              : 'Unable to load the active booking.',
          )
        } finally {
          setLoading(false)
          setRefreshing(false)
        }
      },
      [
        bookingId,
        onFinished,
      ],
    )

  useEffect(() => {
    void loadBooking()

    const channel =
      supabase
        .channel(
          `worker-active-booking-${bookingId}-${Date.now()}`,
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'bookings',
            filter:
              `id=eq.${bookingId}`,
          },
          () => {
            void loadBooking(true)
          },
        )
        .subscribe()

    const refreshInterval =
      setInterval(() => {
        void loadBooking(true)
      }, 15000)

    return () => {
      clearInterval(
        refreshInterval,
      )

      void supabase.removeChannel(
        channel,
      )
    }
  }, [
    bookingId,
    loadBooking,
  ])

  const syncCurrentWorkerLocation =
    useCallback(
      async (
        currentBooking: WorkerBooking,
      ): Promise<void> => {
        setLocationLoading(true)
        setLocationError(null)

        try {
          const current =
            await getCurrentWorkerLocation(
              {
                maximumAge: 15000,
                timeout: 15000,
              },
            )

          setWorkerLocation({
            latitude:
              current.latitude,
            longitude:
              current.longitude,
          })

          /*
           * Only publish a booking-scoped location once
           * the operational lifecycle has started.
           * The app-level WorkerPresenceRuntime remains
           * the continuous tracking owner.
           */
          if (
            currentBooking.status ===
              'on_the_way' ||
            currentBooking.status ===
              'arrived' ||
            currentBooking.status ===
              'in_progress'
          ) {
            const latest =
              await getLatestWorkerBookingLocation(
                currentBooking.id,
              )

            if (
              !hasRecentBookingLocation(
                latest,
                90,
              )
            ) {
              const recorded =
                await recordWorkerBookingLocation(
                  currentBooking.id,
                  current.latitude,
                  current.longitude,
                )

              setWorkerLocation({
                latitude:
                  recorded.latitude,
                longitude:
                  recorded.longitude,
              })
            } else if (
              latest
            ) {
              setWorkerLocation({
                latitude:
                  latest.latitude,
                longitude:
                  latest.longitude,
              })
            }
          }
        } catch (cause) {
          setLocationError(
            cause instanceof Error
              ? cause.message
              : 'Your current location is unavailable.',
          )
        } finally {
          setLocationLoading(false)
        }
      },
      [],
    )

  useEffect(() => {
    if (!booking) {
      return
    }

    const syncKey =
      `${booking.id}:${booking.status}`

    if (
      initialSyncKeyRef.current ===
      syncKey
    ) {
      return
    }

    initialSyncKeyRef.current =
      syncKey

    void syncCurrentWorkerLocation(
      booking,
    )
  }, [
    booking,
    syncCurrentWorkerLocation,
  ])

  useEffect(() => {
    const liveStatus =
      booking?.status ===
        'on_the_way' ||
      booking?.status ===
        'arrived' ||
      booking?.status ===
        'in_progress'

    if (
      !booking ||
      !liveStatus
    ) {
      return
    }

    let active = true

    const channel =
      supabase
        .channel(
          `worker-booking-location-${booking.id}-${Date.now()}`,
        )
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table:
              'worker_locations',
            filter:
              `booking_id=eq.${booking.id}`,
          },
          payload => {
            if (!active) {
              return
            }

            const record =
              payload.new as RealtimeLocationRow

            const nextLocation =
              toMapLocation(
                record.latitude,
                record.longitude,
              )

            if (nextLocation) {
              setWorkerLocation(
                nextLocation,
              )
              setLocationError(
                null,
              )
            }
          },
        )
        .subscribe()

    const fallbackInterval =
      setInterval(
        async () => {
          try {
            const latest =
              await getLatestWorkerBookingLocation(
                booking.id,
              )

            if (
              !active ||
              !latest ||
              !hasRecentBookingLocation(
                latest,
                120,
              )
            ) {
              return
            }

            setWorkerLocation({
              latitude:
                latest.latitude,
              longitude:
                latest.longitude,
            })

            setLocationError(
              null,
            )
          } catch (cause) {
            if (!active) {
              return
            }

            setLocationError(
              cause instanceof Error
                ? cause.message
                : 'Live location could not be refreshed.',
            )
          }
        },
        15000,
      )

    return () => {
      active = false
      clearInterval(
        fallbackInterval,
      )

      void supabase.removeChannel(
        channel,
      )
    }
  }, [
    booking?.id,
    booking?.status,
  ])

  const runAction =
    useCallback(
      async (
        action: WorkerBookingAction,
      ): Promise<void> => {
        if (!booking) {
          return
        }

        setActionLoading(true)
        setError(null)

        try {
          await performWorkerBookingAction(
            booking.id,
            action,
          )

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
      [
        booking,
        loadBooking,
      ],
    )

  const customerLocation =
    useMemo<WorkerBookingMapLocation | null>(
      () => {
        if (
          !context ||
          context.latitude ===
            null ||
          context.longitude ===
            null
        ) {
          return null
        }

        const location = {
          latitude:
            context.latitude,
          longitude:
            context.longitude,
        }

        return isValidMapLocation(
          location,
        )
          ? location
          : null
      },
      [context],
    )

  const liveTracking =
    booking?.status ===
      'on_the_way' ||
    booking?.status ===
      'arrived' ||
    booking?.status ===
      'in_progress'

  async function handleNavigation(): Promise<void> {
    if (!customerLocation) {
      Alert.alert(
        'Location unavailable',
        'The customer service location is not available.',
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
  }

  function confirmAction(
    action: WorkerBookingAction,
    title: string,
    message: string,
  ): void {
    Alert.alert(
      title,
      message,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: title,
          style:
            action === 'cancel'
              ? 'destructive'
              : 'default',
          onPress: () => {
            void runAction(
              action,
            )
          },
        },
      ],
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

          <Text style={styles.loadingTitle}>
            Loading job
          </Text>

          <Text style={styles.loadingText}>
            Preparing your customer location and live job status.
          </Text>
        </View>
      </ScreenContainer>
    )
  }

  if (!booking) {
    return (
      <ScreenContainer>
        <ErrorState
          title="Job unavailable"
          message={
            error ??
            'This job could not be loaded.'
          }
          onAction={() => {
            void loadBooking()
          }}
        />
      </ScreenContainer>
    )
  }

  if (
    !isActiveBookingStatus(
      booking.status,
    )
  ) {
    return (
      <ScreenContainer>
        <View style={styles.loadingContainer}>
          <Ionicons
            name="checkmark-circle-outline"
            size={48}
            color={UI.colors.success}
          />

          <Text style={styles.loadingTitle}>
            Opening booking history
          </Text>
        </View>
      </ScreenContainer>
    )
  }

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
    'Service address unavailable'

  const showMap =
    Boolean(
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
        contentContainerStyle={
          styles.content
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void loadBooking(
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
        <View style={styles.topBar}>
          {onBack ? (
            <Pressable
              onPress={onBack}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              hitSlop={8}
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
                styles.headerPlaceholder
              }
            />
          )}

          <View style={styles.topBarCenter}>
            <Text style={styles.topBarEyebrow}>
              TEMPSTAFF
            </Text>

            <Text style={styles.topBarTitle}>
              Job details
            </Text>
          </View>

          <Pressable
            onPress={() => {
              void loadBooking(
                true,
              )
            }}
            disabled={
              refreshing ||
              actionLoading
            }
            accessibilityRole="button"
            accessibilityLabel="Refresh job"
            hitSlop={8}
            style={({ pressed }) => [
              styles.headerButton,
              pressed &&
                styles.headerButtonPressed,
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
            <View
              style={styles.customerAvatar}
            >
              <Text
                style={
                  styles.customerAvatarText
                }
              >
                {getInitials(
                  customerName,
                )}
              </Text>
            </View>

            <StatusBadge
              label={getBookingStatusLabel(
                booking.status,
              )}
              variant={getStatusVariant(
                booking.status,
              )}
            />
          </View>

          <Text style={styles.heroEyebrow}>
            CURRENT ASSIGNMENT
          </Text>

          <Text style={styles.heroTitle}>
            {serviceName}
          </Text>

          <Text style={styles.heroMeta}>
            {variantName
              ? `${variantName} · `
              : ''}
            {formatBookingDateTime(
              booking.scheduledStart,
            )}
          </Text>

          <View style={styles.heroFooter}>
            <View>
              <Text style={styles.heroLabel}>
                JOB VALUE
              </Text>

              <Text style={styles.heroAmount}>
                {formatBookingAmount(
                  booking.totalAmount,
                  booking.currency,
                )}
              </Text>
            </View>

            <View
              style={
                styles.heroStatusCopy
              }
            >
              <Text style={styles.heroLabel}>
                BOOKING TYPE
              </Text>

              <Text
                style={
                  styles.heroStatusValue
                }
              >
                {getBookingTypeLabel(
                  booking.bookingType,
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
              Customer or service location details could not be loaded. Pull to refresh.
            </Text>
          </View>
        ) : null}

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
                  color={
                    UI.colors.secondary
                  }
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
                  workerLocation={
                    workerLocation!
                  }
                  customerLocation={
                    customerLocation!
                  }
                  workerLabel="You"
                  customerLabel="Customer"
                />
              </View>
            ) : (
              <View
                style={
                  styles.mapUnavailable
                }
              >
                <Ionicons
                  name="map-outline"
                  size={30}
                  color={
                    UI.colors.secondary
                  }
                />

                <Text
                  style={
                    styles.mapUnavailableTitle
                  }
                >
                  {locationLoading
                    ? 'Getting your current location...'
                    : 'Map is not ready'}
                </Text>

                <Text
                  style={
                    styles.mapUnavailableText
                  }
                >
                  {locationError ??
                    (customerLocation
                      ? 'Your current location is required to show the route.'
                      : 'The customer service coordinates are unavailable.')}
                </Text>
              </View>
            )}

            <View
              style={
                styles.navigationAction
              }
            >
              <AppButton
                title="Open navigation"
                onPress={() => {
                  void handleNavigation()
                }}
                disabled={
                  !customerLocation
                }
              />
            </View>

            <Text
              style={
                styles.navigationHint
              }
            >
              {liveTracking
                ? 'Your position is updated while this job is on the way, arrived, or in progress.'
                : 'This preview uses your current device position. Live customer-facing tracking begins when you start the journey.'}
            </Text>
          </View>
        </View>

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
                color={
                  UI.colors.secondary
                }
              />
            </View>

            <View style={styles.customerCopy}>
              <Text style={styles.customerName}>
                {customerName}
              </Text>

              <Text style={styles.customerSubtitle}>
                Only booking information needed to complete the service is shown here.
              </Text>
            </View>
          </View>
        </View>

        {booking.bookingType !==
          'recurring' &&
        booking.status ===
          'on_the_way' ? (
          <View style={styles.section}>
            <BookingChatPanel
              bookingId={
                booking.id
              }
              customerId={
                booking.customerId
              }
            />
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>
            JOB PROGRESS
          </Text>

          <Text style={styles.sectionTitle}>
            Current workflow
          </Text>

          <View style={styles.progressCard}>
            <ProgressRow
              icon="navigate-outline"
              label="Journey started"
              value={
                booking.journeyStartedAt
              }
            />

            <ProgressRow
              icon="location-outline"
              label="Arrived"
              value={
                booking.arrivedAt
              }
            />

            <ProgressRow
              icon="play-circle-outline"
              label="Service started"
              value={
                booking.startedAt
              }
            />

            <ProgressRow
              icon="checkmark-circle-outline"
              label="Completed"
              value={
                booking.completedAt
              }
            />
          </View>
        </View>

        {booking.bookingType !==
          'recurring' ? (
          <View style={styles.section}>
            <WorkerBookingOtpPanel
              booking={booking}
              onVerified={() => {
                void loadBooking(true)
              }}
            />
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>
            SCHEDULE
          </Text>

          <Text style={styles.sectionTitle}>
            Today's service
          </Text>

          <View style={styles.infoCard}>
            <InfoRow
              icon="calendar-outline"
              label="Start"
              value={formatBookingDateTime(
                booking.scheduledStart,
              )}
            />

            <InfoDivider />

            <InfoRow
              icon="time-outline"
              label="Duration"
              value={formatDuration(
                booking,
              )}
            />

            <InfoDivider />

            <InfoRow
              icon="stopwatch-outline"
              label="Scheduled end"
              value={formatBookingDateTime(
                booking.scheduledEnd,
              )}
            />
          </View>
        </View>

        {booking.notes ? (
          <View style={styles.section}>
            <Text style={styles.sectionEyebrow}>
              CUSTOMER NOTES
            </Text>

            <Text style={styles.sectionTitle}>
              Important instructions
            </Text>

            <View style={styles.notesCard}>
              <Ionicons
                name="document-text-outline"
                size={20}
                color={
                  UI.colors.secondary
                }
              />

              <Text style={styles.notesText}>
                {booking.notes}
              </Text>
            </View>
          </View>
        ) : null}

        <View style={styles.bottomActions}>
          {booking.status ===
          'assigned' ? (
            <Pressable
              onPress={() => {
                confirmAction(
                  'on_the_way',
                  'Start journey',
                  'Start the journey to the customer service location?',
                )
              }}
              disabled={
                actionLoading
              }
              accessibilityRole="button"
              accessibilityLabel="Start journey"
              style={({ pressed }) => [
                styles.primaryAction,
                pressed &&
                  styles.primaryActionPressed,
                actionLoading &&
                  styles.primaryActionDisabled,
              ]}
            >
              <Ionicons
                name="navigate-outline"
                size={21}
                color={
                  UI.colors.surface
                }
              />

              <View
                style={
                  styles.primaryActionCopy
                }
              >
                <Text
                  style={
                    styles.primaryActionTitle
                  }
                >
                  Start journey
                </Text>

                <Text
                  style={
                    styles.primaryActionSubtitle
                  }
                >
                  Begin travelling to the customer
                </Text>
              </View>

              <Ionicons
                name="chevron-forward"
                size={20}
                color={
                  UI.colors.surface
                }
              />
            </Pressable>
          ) : null}

          {booking.status ===
          'on_the_way' ? (
            <Pressable
              onPress={() => {
                confirmAction(
                  'arrived',
                  'Mark arrived',
                  'Confirm that you have reached the customer service location.',
                )
              }}
              disabled={
                actionLoading
              }
              accessibilityRole="button"
              accessibilityLabel="Mark arrived"
              style={({ pressed }) => [
                styles.primaryAction,
                pressed &&
                  styles.primaryActionPressed,
                actionLoading &&
                  styles.primaryActionDisabled,
              ]}
            >
              <Ionicons
                name="location-outline"
                size={21}
                color={
                  UI.colors.surface
                }
              />

              <View
                style={
                  styles.primaryActionCopy
                }
              >
                <Text
                  style={
                    styles.primaryActionTitle
                  }
                >
                  Mark arrived
                </Text>

                <Text
                  style={
                    styles.primaryActionSubtitle
                  }
                >
                  Confirm arrival at the service location
                </Text>
              </View>

              <Ionicons
                name="chevron-forward"
                size={20}
                color={
                  UI.colors.surface
                }
              />
            </Pressable>
          ) : null}

          {(
            booking.status ===
              'assigned' ||
            booking.status ===
              'on_the_way' ||
            booking.status ===
              'arrived' ||
            booking.status ===
              'in_progress'
          ) ? (
            <Pressable
              onPress={() => {
                confirmAction(
                  'cancel',
                  'Cancel booking',
                  'Are you sure you want to cancel this booking?',
                )
              }}
              disabled={
                actionLoading
              }
              accessibilityRole="button"
              accessibilityLabel="Cancel booking"
              style={({ pressed }) => [
                styles.cancelAction,
                pressed &&
                  styles.cancelActionPressed,
                actionLoading &&
                  styles.cancelActionDisabled,
              ]}
            >
              <Ionicons
                name="close-circle-outline"
                size={19}
                color={
                  UI.colors.error
                }
              />

              <Text style={styles.cancelText}>
                Cancel booking
              </Text>
            </Pressable>
          ) : null}
        </View>

        {locationError &&
        liveTracking ? (
          <Text
            style={
              styles.locationFooterError
            }
          >
            Live location notice:{' '}
            {locationError}
          </Text>
        ) : null}

        <Text style={styles.footerText}>
          TempStaff active job
        </Text>

        <View style={styles.bottomSpacing} />
      </ScrollView>
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
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
    opacity: 0.78,
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
    maxWidth: '52%',
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
    borderColor: '#FDE68A',
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
    color: UI.colors.secondary,
  },

  sectionTitle: {
    marginTop: UI.spacing.xs,
    fontSize: UI.typography.subtitle,
    lineHeight: 24,
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
    color: UI.colors.secondary,
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

  progressIconComplete: {
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

  progressValueComplete: {
    color: UI.colors.success,
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

  notesCard: {
    marginTop: UI.spacing.md,
    padding: UI.spacing.lg,
    borderRadius: UI.radius.xl,
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: UI.colors.background,
    borderWidth: 1,
    borderColor: UI.colors.border,
  },

  notesText: {
    flex: 1,
    marginLeft: UI.spacing.sm,
    fontSize: UI.typography.body,
    lineHeight: 21,
    color: UI.colors.text,
  },

  bottomActions: {
    marginTop: UI.spacing.xxl,
  },

  primaryAction: {
    minHeight: 68,
    padding: UI.spacing.lg,
    borderRadius: UI.radius.xl,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: UI.colors.secondary,
  },

  primaryActionPressed: {
    opacity: 0.8,
  },

  primaryActionDisabled: {
    opacity: 0.5,
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

  cancelAction: {
    minHeight: 50,
    marginTop: UI.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },

  cancelActionPressed: {
    opacity: 0.65,
  },

  cancelActionDisabled: {
    opacity: 0.45,
  },

  cancelText: {
    marginLeft: UI.spacing.xs,
    fontSize: UI.typography.small,
    fontWeight: '800',
    color: UI.colors.error,
  },

  locationFooterError: {
    marginTop: UI.spacing.md,
    fontSize: UI.typography.caption,
    lineHeight: 17,
    color: UI.colors.warning,
    textAlign: 'center',
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
