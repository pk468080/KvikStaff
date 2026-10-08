import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { AppCard } from '../ui/AppCard';
import { InfoRow } from '../ui/InfoRow';
import { Divider } from '../ui/Divider';
import { UI } from '../../constants/ui';
import type { WorkerBooking, BookingType } from '../../types/booking';

type BookingSummaryCardProps = {
  booking: WorkerBooking;
  serviceName: string;
  variantName: string | null | undefined;
  getBookingTypeLabel: (type: BookingType) => string;
};

export function BookingSummaryCard({
  booking,
  serviceName,
  variantName,
  getBookingTypeLabel,
}: BookingSummaryCardProps) {
  return (
    <AppCard style={styles.section}>
      <Text style={styles.sectionEyebrow}>SERVICE</Text>
      <Text style={styles.sectionTitle}>What was delivered</Text>

      <View style={styles.infoCard}>
        <InfoRow icon="briefcase-outline" label="Service" value={serviceName} />
        {variantName ? (
          <>
            <Divider />
            <InfoRow icon="layers-outline" label="Variant" value={variantName} />
          </>
        ) : null}
        <Divider />
        <InfoRow
          icon="calendar-outline"
          label="Booking type"
          value={getBookingTypeLabel(booking.bookingType)}
        />
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
