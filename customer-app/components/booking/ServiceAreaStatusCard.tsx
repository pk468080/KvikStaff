import { StyleSheet, Text, View } from 'react-native'
import { UI } from '../../constants/ui';

interface ServiceAreaStatusCardProps {
  address: string
  available: boolean
  loading?: boolean
  error?: string | null
}

export default function ServiceAreaStatusCard({
  address,
  available,
  loading = false,
  error,
}: ServiceAreaStatusCardProps) {
  return (
    <View style={[styles.card, !available && styles.cardUnavailable]}>
      <View style={styles.content}>
        <Text style={styles.label}>Service Location</Text>
        <Text style={styles.address} numberOfLines={2}>
          {address || 'No location selected'}
        </Text>

        {loading && <Text style={styles.status}>Checking availability...</Text>}

        {error && <Text style={styles.statusError}>{error}</Text>}

        {!loading && !error && (
          <Text style={[styles.status, available && styles.statusAvailable]}>
            {available ? '✓ Available in your area' : '✗ Not available at this location'}
          </Text>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    padding: UI.spacing.lg,
    marginBottom: UI.spacing.xl,
    borderRadius: UI.radius.md,
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },

  cardUnavailable: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },

  content: {
    gap: UI.spacing.sm,
  },

  label: {
    fontSize: UI.typography.small,
    fontWeight: '600',
    color: UI.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  address: {
    fontSize: 15,
    fontWeight: '500',
    color: UI.colors.text,
    lineHeight: 22,
  },

  status: {
    fontSize: 13,
    color: '#92400E',
    fontWeight: '500',
  },

  statusAvailable: {
    color: '#166534',
  },

  statusError: {
    fontSize: 13,
    color: '#991B1B',
    fontWeight: '500',
  },
})
