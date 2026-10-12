
import {
  WorkerRuntimeProvider,
} from './context/WorkerRuntimeContext'

import RootNavigator from './navigation/RootNavigator'

function App() {
  return (
    <WorkerRuntimeProvider>
      <RootNavigator />
    </WorkerRuntimeProvider>
  )
}

export default App
