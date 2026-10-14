import React, {
  Component,
  PropsWithChildren,
} from 'react'
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import { logger } from '../lib/logger'
import { UI } from '../constants/ui';

type ErrorBoundaryState = {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<
  PropsWithChildren,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  }

  static getDerivedStateFromError(
    error: Error,
  ): ErrorBoundaryState {
    return {
      hasError: true,
      error,
    }
  }

  componentDidCatch(
    error: Error,
    errorInfo: React.ErrorInfo,
  ): void {
    logger.error('Unhandled React application error', {
      error,
      componentStack: errorInfo.componentStack,
    })
  }

  private handleRetry = (): void => {
    this.setState({
      hasError: false,
      error: null,
    })
  }

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children
    }

    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>
            Something went wrong
          </Text>

          <Text style={styles.message}>
            The app encountered an unexpected error.
            Please try again.
          </Text>

          {__DEV__ && this.state.error?.message ? (
            <Text
              style={styles.devMessage}
              numberOfLines={4}
            >
              {this.state.error.message}
            </Text>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Try again"
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
            ]}
            onPress={this.handleRetry}
          >
            <Text style={styles.buttonText}>
              Try Again
            </Text>
          </Pressable>
        </View>
      </View>
    )
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: UI.spacing.xxl,
    backgroundColor: UI.colors.surface,
  },

  content: {
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
  },

  title: {
    fontSize: UI.typography.title,
    fontWeight: '700',
    textAlign: 'center',
    color: '#111111',
  },

  message: {
    marginTop: UI.spacing.md,
    fontSize: UI.typography.bodyLarge,
    lineHeight: 24,
    textAlign: 'center',
    color: '#666666',
  },

  devMessage: {
    width: '100%',
    marginTop: UI.spacing.lg,
    padding: UI.spacing.md,
    borderRadius: UI.radius.sm,
    backgroundColor: '#F3F3F3',
    color: '#555555',
    fontSize: UI.typography.small,
    lineHeight: 18,
  },

  button: {
    marginTop: UI.spacing.xxl,
    minWidth: 140,
    paddingHorizontal: UI.spacing.xxl,
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111111',
  },

  buttonPressed: {
    opacity: 0.75,
  },

  buttonText: {
    color: UI.colors.surface,
    fontSize: 15,
    fontWeight: '600',
  },
})