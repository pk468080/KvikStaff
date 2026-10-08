import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { AppCard } from '../ui/AppCard';
import { InfoRow } from '../ui/InfoRow';
import { Divider } from '../ui/Divider';
import { UI } from '../../constants/ui';
import type { WorkerBooking } from '../../types/booking';

type BookingScheduleCardProps = {
  booking: WorkerBooking;
  formatBookingDateTime: (iso: string) => string;
  formatDuration: (b: WorkerBooking) => string;
  formatDateOnly: (iso: string) => string;
};

export function BookingScheduleCard({
  booking,
  formatBookingDateTime,
  formatDuration,
  formatDateOnly,
}: BookingScheduleCardProps) {
  return (
    <AppCard style={styles.section}>
      <Text style={styles.sectionEyebrow}>SCHEDULE</Text>
      <Text style={styles.sectionTitle}>Recorded booking timing</Text>

      <View style={styles.infoCard}>
        <InfoRow
          icon="calendar-outline"
          label="Scheduled start"
          value={formatBookingDateTime(booking.scheduledStart)}
        />
        <Divider />
        <InfoRow icon="timer-outline" label="Duration" value={formatDuration(booking)} />
        <Divider />
        <InfoRow
          icon="stopwatch-outline"
          label="Scheduled end"
          value={formatBookingDateTime(booking.scheduledEnd)}
        />

        {booking.scheduleStartDate && booking.scheduleEndDate && booking.bookingType === 'recurring' ? (
          <>
            <Divider />
            <InfoRow
              icon="calendar"
              label="Recurrence window"
              value={`${formatDateOnly(booking.scheduleStartDate)} to ${formatDateOnly(
                booking.scheduleEndDate
              )}`}
            />
          </>
        ) : null}
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: UI.spacing.md,
  },
  sectionEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.05,
    color: UI.colors.primaryBlue,
  },
  sectionTitle: {
    marginTop: UI.spacing.xs,
    fontSize: UI.typography.subtitle,
    fontWeight: '800',
    color: UI.colors.text,
    marginBottom: UI.spacing.md,
  },
  infoCard: {
    backgroundColor: UI.colors.background,
    borderRadius: UI.radius.md,
    padding: UI.spacing.lg,
    borderWidth: 1,
    borderColor: UI.colors.border,
  },
});
