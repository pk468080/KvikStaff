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
    padding: 24,
    backgroundColor: '#FFFFFF',
  },

  content: {
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
  },

  title: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    color: '#111111',
  },

  message: {
    marginTop: 12,
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    color: '#666666',
  },

  devMessage: {
    width: '100%',
    marginTop: 16,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#F3F3F3',
    color: '#555555',
    fontSize: 12,
    lineHeight: 18,
  },

  button: {
    marginTop: 24,
    minWidth: 140,
    paddingHorizontal: 24,
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
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
})