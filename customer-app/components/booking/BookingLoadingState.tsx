import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { UI } from '../../constants/ui';

export default function BookingLoadingState() {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#4F46E5" />
      <Text style={styles.text}>Checking availability...</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: UI.spacing.xxxl,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: UI.radius.md,
    gap: UI.spacing.md,
  },

  text: {
    fontSize: UI.typography.body,
    color: '#6B7280',
    fontWeight: '500',
  },
})
