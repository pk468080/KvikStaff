
import {
  SafeAreaProvider,
} from 'react-native-safe-area-context'

import ErrorBoundary from './components/ErrorBoundary'
import RootNavigator from './navigation/RootNavigator'




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