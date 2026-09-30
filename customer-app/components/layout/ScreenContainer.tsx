import {
  StyleSheet,
  type ViewProps,
} from 'react-native'

import {
  SafeAreaView,
} from 'react-native-safe-area-context'

export function ScreenContainer({
  style,
  ...props
}: ViewProps) {
  return (
    <SafeAreaView
      edges={['top', 'bottom']}
      {...props}
      style={[
        styles.container,
        style,
      ]}
    />
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
})