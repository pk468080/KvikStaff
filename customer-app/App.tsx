import ErrorBoundary from './components/ErrorBoundary'
import RootNavigator from './navigation/RootNavigator'

export default function App() {
  return (
    <ErrorBoundary>
      <RootNavigator />
    </ErrorBoundary>
  )
}