import {
  Text,
  TouchableOpacity,
  View,
} from 'react-native'

import type {
  BookingStatus,
  CustomerBooking,
} from '../../services/booking/bookingTracking.service'

type Props = {
  booking: CustomerBooking
  activeBookingCount: number
  onPress: () => void
}

const ACTIVE_STATUSES = new Set<BookingStatus>([
  'searching_worker',
  'assigned',
  'on_the_way',
  'arrived',
  'in_progress',
])

function getStatusTitle(
  status: BookingStatus,
) {
  switch (status) {
    case 'searching_worker':
      return 'Finding your worker'

    case 'assigned':
      return 'Worker assigned'

    case 'on_the_way':
      return 'Worker is on the way'

    case 'arrived':
      return 'Worker has arrived'

    case 'in_progress':
      return 'Service in progress'

    default:
      return 'Booking active'
  }
}

function getStatusDescription(
  status: BookingStatus,
) {
  switch (status) {
    case 'searching_worker':
      return 'We are finding an eligible worker for your booking.'

    case 'assigned':
      return 'Your booking is confirmed and your worker is assigned.'

    case 'on_the_way':
      return 'Your assigned worker is travelling to your location.'

    case 'arrived':
      return 'Your worker has arrived at the booking location.'

    case 'in_progress':
      return 'Your service is currently in progress.'

    default:
      return 'Your booking is currently active.'
  }
}

function getStatusStep(
  status: BookingStatus,
) {
  switch (status) {
    case 'searching_worker':
      return 1

    case 'assigned':
      return 2

    case 'on_the_way':
      return 3

    case 'arrived':
      return 4

    case 'in_progress':
      return 4

    default:
      return 1
  }
}

function formatDateTimeRange(
  start: string | null,
  end: string | null,
) {
  if (!start) {
    return 'Schedule pending'
  }

  const startDate = new Date(start)

  if (
    Number.isNaN(
      startDate.getTime(),
    )
  ) {
    return 'Schedule pending'
  }

  const startText =
    startDate.toLocaleString([], {
      day: '2-digit',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
    })

  if (!end) {
    return startText
  }

  const endDate = new Date(end)

  if (
    Number.isNaN(
      endDate.getTime(),
    )
  ) {
    return startText
  }

  const endText =
    endDate.toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    })

  return `${startText} – ${endText}`
}

function isActiveBooking(
  booking: CustomerBooking,
) {
  return ACTIVE_STATUSES.has(
    booking.status,
  )
}

export default function ActiveBookingHomeCard({
  booking,
  activeBookingCount,
  onPress,
}: Props) {
  if (!isActiveBooking(booking)) {
    return null
  }

  const currentStep =
    getStatusStep(
      booking.status,
    )

  return (
    <TouchableOpacity
      activeOpacity={0.92}
      onPress={onPress}
      style={styles.card}
    >
      <View style={styles.topRow}>
        <View style={styles.liveRow}>
          <View style={styles.liveDot} />

          <Text style={styles.liveText}>
            LIVE BOOKING
          </Text>
        </View>

        {activeBookingCount > 1 && (
          <View
            style={styles.countBadge}
          >
            <Text
              style={
                styles.countBadgeText
              }
            >
              {activeBookingCount}{' '}
              active
            </Text>
          </View>
        )}
      </View>

      <View
        style={styles.serviceRow}
      >
        <View
          style={styles.serviceIcon}
        >
          <Text
            style={
              styles.serviceIconText
            }
          >
            {(
              booking.service_name ??
              'S'
            )
              .trim()
              .charAt(0)
              .toUpperCase()}
          </Text>
        </View>

        <View
          style={styles.serviceCopy}
        >
          <Text
            style={styles.serviceName}
            numberOfLines={1}
          >
            {booking.service_name ??
              'Your service'}
          </Text>

          <Text
            style={styles.statusTitle}
          >
            {getStatusTitle(
              booking.status,
            )}
          </Text>

          <Text
            style={
              styles.statusDescription
            }
            numberOfLines={2}
          >
            {getStatusDescription(
              booking.status,
            )}
          </Text>
        </View>

        <Text
          style={styles.chevron}
        >
          ›
        </Text>
      </View>

      <View
        style={styles.timeline}
      >
        <TimelineStep
          label="Booked"
          active={
            currentStep >= 1
          }
          completed={
            currentStep > 1
          }
        />

        <TimelineLine
          active={
            currentStep >= 2
          }
        />

        <TimelineStep
          label="Assigned"
          active={
            currentStep >= 2
          }
          completed={
            currentStep > 2
          }
        />

        <TimelineLine
          active={
            currentStep >= 3
          }
        />

        <TimelineStep
          label="On the way"
          active={
            currentStep >= 3
          }
          completed={
            currentStep > 3
          }
        />

        <TimelineLine
          active={
            currentStep >= 4
          }
        />

        <TimelineStep
          label="Service"
          active={
            currentStep >= 4
          }
          completed={
            booking.status ===
            'in_progress'
          }
        />
      </View>

      <View
        style={styles.bottomRow}
      >
        <Text
          style={styles.scheduleText}
        >
          {formatDateTimeRange(
            booking.scheduled_start,
            booking.scheduled_end,
          )}
        </Text>

        <View
          style={styles.trackButton}
        >
          <Text
            style={
              styles.trackButtonText
            }
          >
            Track booking →
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  )
}

function TimelineStep({
  label,
  active,
  completed,
}: {
  label: string
  active: boolean
  completed: boolean
}) {
  return (
    <View
      style={styles.step}
    >
      <View
        style={[
          styles.stepCircle,
          active &&
            styles.stepCircleActive,
          completed &&
            styles.stepCircleCompleted,
        ]}
      >
        <Text
          style={[
            styles.stepCircleText,
            active &&
              styles.stepCircleTextActive,
          ]}
        >
          {completed
            ? '✓'
            : ''}
        </Text>
      </View>

      <Text
        style={[
          styles.stepLabel,
          active &&
            styles.stepLabelActive,
        ]}
      >
        {label}
      </Text>
    </View>
  )
}

function TimelineLine({
  active,
}: {
  active: boolean
}) {
  return (
    <View
      style={[
        styles.timelineLine,
        active &&
          styles.timelineLineActive,
      ]}
    />
  )
}

const styles = {
  card: {
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 16,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DCEDEF',
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.07,
    shadowRadius: 12,
    elevation: 3,
  },

  topRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent:
      'space-between' as const,
  },

  liveRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },

  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 7,
    backgroundColor: '#16A34A',
  },

  liveText: {
    fontSize: 9,
    fontWeight: '900' as const,
    letterSpacing: 1,
    color: '#087F72',
  },

  countBadge: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#EAF7F7',
  },

  countBadgeText: {
    fontSize: 9,
    fontWeight: '800' as const,
    color: '#37657A',
  },

  serviceRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginTop: 14,
  },

  serviceIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: '#EAF7F7',
    marginRight: 12,
  },

  serviceIconText: {
    fontSize: 17,
    fontWeight: '900' as const,
    color: '#062F52',
  },

  serviceCopy: {
    flex: 1,
    minWidth: 0,
  },

  serviceName: {
    fontSize: 14,
    fontWeight: '800' as const,
    color: '#062F52',
  },

  statusTitle: {
    marginTop: 2,
    fontSize: 15,
    fontWeight: '900' as const,
    color: '#087F72',
  },

  statusDescription: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 16,
    color: '#5E7C8B',
  },

  chevron: {
    marginLeft: 8,
    fontSize: 27,
    lineHeight: 28,
    color: '#8AA1AC',
  },

  timeline: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    marginTop: 18,
  },

  step: {
    alignItems: 'center' as const,
    width: 52,
  },

  stepCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 2,
    borderColor: '#D5E1E5',
    backgroundColor: '#FFFFFF',
  },

  stepCircleActive: {
    borderColor: '#00A7A7',
    backgroundColor: '#EAF7F7',
  },

  stepCircleCompleted: {
    borderColor: '#00A7A7',
    backgroundColor: '#00A7A7',
  },

  stepCircleText: {
    fontSize: 10,
    fontWeight: '900' as const,
    color: '#FFFFFF',
  },

  stepCircleTextActive: {
    color: '#00A7A7',
  },

  stepLabel: {
    marginTop: 5,
    fontSize: 8,
    lineHeight: 11,
    fontWeight: '600' as const,
    color: '#9AAAB2',
    textAlign: 'center' as const,
  },

  stepLabelActive: {
    color: '#37657A',
    fontWeight: '800' as const,
  },

  timelineLine: {
    flex: 1,
    height: 2,
    marginTop: 10,
    backgroundColor: '#E1E9EC',
  },

  timelineLineActive: {
    backgroundColor: '#00A7A7',
  },

  bottomRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent:
      'space-between' as const,
    marginTop: 15,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#EDF2F4',
  },

  scheduleText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700' as const,
    color: '#5E7C8B',
  },

  trackButton: {
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#062F52',
  },

  trackButtonText: {
    fontSize: 10,
    fontWeight: '800' as const,
    color: '#FFFFFF',
  },
}