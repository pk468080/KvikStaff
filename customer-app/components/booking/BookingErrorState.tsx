import { StyleSheet, Text, View } from 'react-native'
import { UI } from '../../constants/ui';

interface BookingErrorStateProps {
  message: string
}

export default function BookingErrorState({ message }: BookingErrorStateProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>⚠</Text>
      <Text style={styles.title}>Error</Text>
      <Text style={styles.message}>{message}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    padding: UI.spacing.lg,
    marginVertical: 12,
    borderRadius: UI.radius.md,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    alignItems: 'center',
    gap: UI.spacing.sm,
  },

  icon: {
    fontSize: UI.typography.title,
  },

  title: {
    fontSize: UI.typography.body,
    fontWeight: '700',
    color: '#991B1B',
  },

  message: {
    fontSize: 13,
    color: '#7F1D1D',
    textAlign: 'center',
    lineHeight: 18,
  },
})
