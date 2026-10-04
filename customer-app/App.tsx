import * as Sentry from '@sentry/react-native'

import {
  SafeAreaProvider,
} from 'react-native-safe-area-context'

import ErrorBoundary from './components/ErrorBoundary'
import RootNavigator from './navigation/RootNavigator'

const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim()

Sentry.init({
  dsn: sentryDsn,
  enabled: Boolean(sentryDsn),

  environment: __DEV__
    ? 'development'
    : 'production',

  debug: __DEV__,

  sendDefaultPii: false,

  tracesSampleRate: __DEV__
    ? 1.0
    : 0.1,

  enableLogs: true,

  replaysSessionSampleRate: __DEV__
    ? 1.0
    : 0.1,

  replaysOnErrorSampleRate: 1.0,

  integrations: [
    Sentry.mobileReplayIntegration(),
  ],
})

function App() {
  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <RootNavigator />
      </ErrorBoundary>
    </SafeAreaProvider>
  )
}

export default Sentry.wrap(App)