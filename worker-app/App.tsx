import {
  WorkerRuntimeProvider,
} from './context/WorkerRuntimeContext'

import RootNavigator from './navigation/RootNavigator'

export default Sentry.wrap(function App() {
  return (
    <WorkerRuntimeProvider>
      <RootNavigator />
    </WorkerRuntimeProvider>
  )
});