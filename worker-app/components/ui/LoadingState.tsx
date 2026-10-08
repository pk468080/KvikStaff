import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import { UI } from '../../constants/ui'

type LoadingStateProps = {
  title?: string
  message?: string
}

export default function LoadingState({
  title = 'Loading',
  message = 'Please wait...',
}: LoadingStateProps) {
  return (
    <View style={styles.container}>
      <ActivityIndicator
        size="large"
        color={UI.colors.primaryBlue}
      />

      <Text style={styles.title}>
        {title}
      </Text>

      <Text style={styles.message}>
        {message}
      </Text>
    </View>
  )
}

export function LoadingStateInline({
  message = 'Loading...',
}: Pick<LoadingStateProps, 'message'>) {
  return (
    <View style={styles.inlineContainer}>
      <ActivityIndicator
        size="small"
        color={UI.colors.primaryBlue}
      />

      <Text style={styles.inlineMessage}>
        {message}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: UI.spacing.xxl,
    backgroundColor: UI.colors.background,
  },

  title: {
    marginTop: UI.spacing.lg,
    fontSize: UI.typography.subtitle,
    lineHeight: 24,
    fontWeight: '800',
    color: UI.colors.text,
    textAlign: 'center',
  },

  message: {
    marginTop: UI.spacing.sm,
    fontSize: UI.typography.body,
    lineHeight: 20,
    color: UI.colors.textSecondary,
    textAlign: 'center',
  },

  inlineContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: UI.spacing.md,
  },

  inlineMessage: {
    marginLeft: UI.spacing.sm,
    fontSize: UI.typography.small,
    color: UI.colors.textSecondary,
  },
})