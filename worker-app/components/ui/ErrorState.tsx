import {
  StyleSheet,
  Text,
  View,
} from 'react-native'

import { AppButton } from './AppButton'
import { UI } from '../../constants/ui'

type ErrorStateProps = {
  title?: string
  message: string
  actionLabel?: string
  onAction?: () => void
}

export default function ErrorState({
  title = 'Something went wrong',
  message,
  actionLabel = 'Try again',
  onAction,
}: ErrorStateProps) {
  return (
    <View style={styles.container}>
      <View style={styles.icon}>
        <Text style={styles.iconText}>
          !
        </Text>
      </View>

      <Text style={styles.title}>
        {title}
      </Text>

      <Text style={styles.message}>
        {message}
      </Text>

      {onAction ? (
        <View style={styles.action}>
          <AppButton
            title={actionLabel}
            onPress={onAction}
          />
        </View>
      ) : null}
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

  icon: {
    width: 48,
    height: 48,
    borderRadius: UI.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: UI.colors.errorBackground,
    borderWidth: 1,
    borderColor: UI.colors.errorBackground,
  },

  iconText: {
    fontSize: 24,
    fontWeight: '800',
    color: UI.colors.error,
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
    lineHeight: 21,
    color: UI.colors.textSecondary,
    textAlign: 'center',
  },

  action: {
    width: '100%',
    marginTop: UI.spacing.xl,
  },
})