import { StyleSheet, TouchableOpacity, Text, View } from 'react-native'
import { UI } from '../../constants/ui';

export type BookingMethodType = 'instant' | 'scheduled' | 'recurring'

interface BookingMethodCardProps {
  type: BookingMethodType
  selected: boolean
  disabled?: boolean
  onPress: () => void
}

const METHOD_INFO: Record<BookingMethodType, { label: string; description: string }> = {
  instant: {
    label: 'Instant',
    description: 'Book now with nearby worker',
  },
  scheduled: {
    label: 'Scheduled',
    description: 'Choose a future date',
  },
  recurring: {
    label: 'Recurring',
    description: 'Repeat on selected days',
  },
}

export default function BookingMethodCard({
  type,
  selected,
  disabled = false,
  onPress,
}: BookingMethodCardProps) {
  const info = METHOD_INFO[type]

  return (
    <TouchableOpacity
      style={[
        styles.card,
        selected && styles.cardSelected,
        disabled && styles.cardDisabled,
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
    >
      <View style={styles.content}>
        <Text
          style={[
            styles.label,
            selected && styles.labelSelected,
            disabled && styles.labelDisabled,
          ]}
        >
          {info.label}
        </Text>
        <Text
          style={[
            styles.description,
            selected && styles.descriptionSelected,
            disabled && styles.descriptionDisabled,
          ]}
        >
          {info.description}
        </Text>
      </View>

      <View style={[styles.radio, selected && styles.radioSelected]} />
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: UI.spacing.lg,
    marginBottom: UI.spacing.md,
    borderRadius: UI.radius.md,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: UI.spacing.md,
  },

  cardSelected: {
    backgroundColor: '#F0F4FF',
    borderColor: '#4F46E5',
    borderWidth: 2,
  },

  cardDisabled: {
    opacity: 0.6,
  },

  content: {
    flex: 1,
  },

  label: {
    fontSize: UI.typography.bodyLarge,
    fontWeight: '600',
    color: '#111827',
    marginBottom: UI.spacing.xs,
  },

  labelSelected: {
    color: '#4F46E5',
  },

  labelDisabled: {
    color: '#9CA3AF',
  },

  description: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
  },

  descriptionSelected: {
    color: '#4F46E5',
  },

  descriptionDisabled: {
    color: '#9CA3AF',
  },

  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    backgroundColor: UI.colors.surface,
  },

  radioSelected: {
    borderColor: '#4F46E5',
    backgroundColor: '#4F46E5',
  },
})
