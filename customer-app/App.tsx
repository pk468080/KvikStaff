
import {
  SafeAreaProvider,
} from 'react-native-safe-area-context'

import ErrorBoundary from './components/ErrorBoundary'
import RootNavigator from './navigation/RootNavigator'

const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim()



function App() {
  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <RootNavigator />
      </ErrorBoundary>
    </SafeAreaProvider>
  )
}

export default App