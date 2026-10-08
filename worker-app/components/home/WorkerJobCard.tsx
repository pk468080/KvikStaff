import React from 'react';
import { StyleSheet, View, Text, Pressable } from 'react-native';
import { AppCard } from '../ui/AppCard';
import StatusBadge from '../ui/StatusBadge';
import { UI } from '../../constants/ui';
import type { WorkerBooking, BookingStatus } from '../../types/booking';

type WorkerJobCardProps = {
  booking: WorkerBooking;
  active?: boolean;
  onPress?: () => void;
};

// Utils imported strictly for this component
const formatDate = (isoString: string) => {
  if (!isoString) return '';
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
};

const formatTimeRange = (startIso: string, endIso: string) => {
  if (!startIso || !endIso) return '';
  const start = new Date(startIso);
  const end = new Date(endIso);
  return `${start.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })} - ${end.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })}`;
};

const getFriendlyStatus = (status: BookingStatus) => {
  const map: Record<BookingStatus, string> = {
    pending_payment: 'Pending payment',
    paid: 'Paid',
    searching_worker: 'Searching',
    assigned: 'Assigned',
    on_the_way: 'On the way',
    arrived: 'Arrived',
    in_progress: 'In progress',
    completed: 'Completed',
    cancelled: 'Cancelled',
    expired: 'Expired',
    payment_failed: 'Payment failed',
  };
  return map[status] || status;
};

const getStatusVariant = (status: BookingStatus) => {
  switch (status) {
    case 'completed':
      return 'success';
    case 'assigned':
    case 'on_the_way':
    case 'arrived':
    case 'in_progress':
      return 'info';
    case 'cancelled':
    case 'expired':
    case 'payment_failed':
      return 'error';
    default:
      return 'default';
  }
};

export function WorkerJobCard({ booking, active = false, onPress }: WorkerJobCardProps) {
  const content = (
    <AppCard style={active ? styles.jobCardActive : undefined}>
      <View style={styles.jobTopRow}>
        <View style={styles.jobDateBlock}>
          <Text style={styles.jobDate}>{formatDate(booking.scheduledStart)}</Text>
          <Text style={styles.jobTime}>{formatTimeRange(booking.scheduledStart, booking.scheduledEnd)}</Text>
        </View>
        <StatusBadge label={getFriendlyStatus(booking.status)} variant={getStatusVariant(booking.status)} />
      </View>

      <View style={styles.jobMain}>
        <View style={styles.jobIcon}>
          <Text style={styles.jobIconText}>✓</Text>
        </View>

        <View style={styles.jobInfo}>
          <Text style={styles.jobServiceText} numberOfLines={1}>
            Service ID: {booking.serviceId.substring(0, 8)}...
          </Text>
          <Text style={styles.jobDurationText}>
            {formatTimeRange(booking.scheduledStart, booking.scheduledEnd)}
          </Text>
        </View>
      </View>

      <View style={styles.jobActionRow}>
        <Text style={styles.jobActionText}>View details</Text>
        <Text style={styles.jobActionArrow}>→</Text>
      </View>
    </AppCard>
  );

  if (!onPress) {
    return content;
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Open job details"
      style={({ pressed }) => [pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  jobCardActive: {
    borderColor: UI.colors.primaryBlue,
    borderWidth: 2,
  },
  jobTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: UI.spacing.md,
  },
  jobDateBlock: {
    flex: 1,
  },
  jobDate: {
    fontSize: UI.typography.bodyLarge,
    fontWeight: '700',
    color: UI.colors.text,
  },
  jobTime: {
    fontSize: UI.typography.small,
    color: UI.colors.textSecondary,
    marginTop: 2,
  },
  jobMain: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: UI.spacing.md,
  },
  jobIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: UI.colors.infoBackground,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: UI.spacing.md,
  },
  jobIconText: {
    color: UI.colors.primaryBlue,
    fontSize: 18,
    fontWeight: '700',
  },
  jobInfo: {
    flex: 1,
  },
  jobServiceText: {
    fontSize: UI.typography.bodyLarge,
    fontWeight: '600',
    color: UI.colors.text,
  },
  jobDurationText: {
    fontSize: UI.typography.small,
    color: UI.colors.textSecondary,
    marginTop: 2,
  },
  jobActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: UI.colors.border,
    paddingTop: UI.spacing.sm,
  },
  jobActionText: {
    fontSize: UI.typography.small,
    fontWeight: '800',
    color: UI.colors.primaryBlue,
  },
  jobActionArrow: {
    fontSize: 17,
    fontWeight: '800',
    color: UI.colors.primaryBlue,
  },
  pressed: {
    opacity: 0.8,
  },
});
