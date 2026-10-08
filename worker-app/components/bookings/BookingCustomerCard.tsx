import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppCard } from '../ui/AppCard';
import { UI } from '../../constants/ui';
import type { WorkerBooking } from '../../types/booking';

type BookingCustomerCardProps = {
  booking: WorkerBooking;
  customerName: string;
};

export function BookingCustomerCard({ booking, customerName }: BookingCustomerCardProps) {
  return (
    <>
      <AppCard style={styles.section}>
        <Text style={styles.sectionEyebrow}>CUSTOMER</Text>
        <Text style={styles.sectionTitle}>Booking contact</Text>

        <View style={styles.customerCard}>
          <View style={styles.customerIcon}>
            <Ionicons name="person-outline" size={21} color={UI.colors.primaryBlue} />
          </View>
          <View style={styles.customerCopy}>
            <Text style={styles.customerName}>{customerName}</Text>
            <Text style={styles.customerSubtitle}>
              Historical booking information only. No customer phone number is displayed here.
            </Text>
          </View>
        </View>
      </AppCard>

      {booking.notes ? (
        <AppCard style={styles.section}>
          <Text style={styles.sectionEyebrow}>CUSTOMER NOTES</Text>
          <Text style={styles.sectionTitle}>Saved instructions</Text>

          <View style={styles.notesCard}>
            <Ionicons name="document-text-outline" size={20} color={UI.colors.primaryBlue} />
            <Text style={styles.notesText}>{booking.notes}</Text>
          </View>
        </AppCard>
      ) : null}
    </>
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
  customerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: UI.colors.background,
    borderRadius: UI.radius.md,
    padding: UI.spacing.lg,
    borderWidth: 1,
    borderColor: UI.colors.border,
  },
  customerIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: UI.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: UI.spacing.md,
    ...UI.shadows.sm,
  },
  customerCopy: {
    flex: 1,
  },
  customerName: {
    fontSize: UI.typography.bodyLarge,
    fontWeight: '700',
    color: UI.colors.text,
  },
  customerSubtitle: {
    fontSize: UI.typography.small,
    color: UI.colors.textSecondary,
    marginTop: UI.spacing.xs,
    lineHeight: 16,
  },
  notesCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: UI.colors.infoBackground,
    borderRadius: UI.radius.md,
    padding: UI.spacing.md,
    borderWidth: 1,
    borderColor: UI.colors.info,
  },
  notesText: {
    flex: 1,
    marginLeft: UI.spacing.md,
    fontSize: UI.typography.body,
    lineHeight: 20,
    color: UI.colors.text,
  },
});
