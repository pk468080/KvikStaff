import { StyleSheet, Text, View } from 'react-native'
import { UI } from '../../constants/ui';

interface BookingSectionProps {
  title: string
  children: React.ReactNode
}

export default function BookingSection({ title, children }: BookingSectionProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.content}>{children}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    marginBottom: UI.spacing.xxl,
  },

  title: {
    fontSize: 15,
    fontWeight: '700',
    color: UI.colors.text,
    marginBottom: UI.spacing.md,
  },

  content: {
    gap: UI.spacing.md,
  },
})
