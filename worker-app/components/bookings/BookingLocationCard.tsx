import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppCard } from '../ui/AppCard';
import { UI } from '../../constants/ui';

type BookingLocationCardProps = {
  addressLabel: string;
  addressLine: string;
};

export function BookingLocationCard({ addressLabel, addressLine }: BookingLocationCardProps) {
  if (!addressLabel && !addressLine) return null;

  return (
    <AppCard style={styles.section}>
      <Text style={styles.sectionEyebrow}>SERVICE LOCATION</Text>
      <Text style={styles.sectionTitle}>Recorded service location</Text>

      <View style={styles.locationCard}>
        <View style={styles.locationIcon}>
          <Ionicons name="location-outline" size={22} color={UI.colors.primaryBlue} />
        </View>

        <View style={styles.locationCopy}>
          <Text style={styles.locationLabel}>{addressLabel}</Text>
          <Text style={styles.locationAddress}>{addressLine}</Text>
        </View>
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
  locationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: UI.colors.background,
    borderRadius: UI.radius.md,
    padding: UI.spacing.lg,
    borderWidth: 1,
    borderColor: UI.colors.border,
  },
  locationIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: UI.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: UI.spacing.md,
    ...UI.shadows.sm,
  },
  locationCopy: {
    flex: 1,
  },
  locationLabel: {
    fontSize: UI.typography.bodyLarge,
    fontWeight: '700',
    color: UI.colors.text,
  },
  locationAddress: {
    fontSize: UI.typography.small,
    color: UI.colors.textSecondary,
    marginTop: UI.spacing.xs,
    lineHeight: 16,
  },
});
