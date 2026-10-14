import { StyleSheet, Text, View } from 'react-native'
import { LoadingState } from '../ui/LoadingState'
import { UI } from '../../constants/ui';

export default function BookingLoadingState() {
  return (
    <View style={styles.container}>
      <LoadingState />
      <Text style={styles.text}>Checking availability...</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: UI.spacing.xxxl,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: UI.colors.background,
    borderRadius: UI.radius.md,
    gap: UI.spacing.md,
  },

  text: {
    fontSize: UI.typography.body,
    color: UI.colors.textMuted,
    fontWeight: '500',
  },
})
