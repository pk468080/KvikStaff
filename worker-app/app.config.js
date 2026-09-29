const baseConfig = require('./app.json')

const expoConfig =
  baseConfig.expo ?? baseConfig

const androidMapsApiKey =
  typeof process.env.GOOGLE_MAPS_ANDROID_API_KEY ===
    'string'
    ? process.env.GOOGLE_MAPS_ANDROID_API_KEY.trim()
    : ''

const isEasAndroidBuild =
  process.env.EAS_BUILD === 'true' &&
  process.env.EAS_BUILD_PLATFORM === 'android'

if (
  isEasAndroidBuild &&
  !androidMapsApiKey
) {
  throw new Error(
    'GOOGLE_MAPS_ANDROID_API_KEY is required for an EAS Android build.',
  )
}

const existingPlugins =
  Array.isArray(expoConfig.plugins)
    ? expoConfig.plugins
    : []

const filteredPlugins =
  existingPlugins.filter(plugin => {
    if (typeof plugin === 'string') {
      return plugin !== 'react-native-maps'
    }

    if (
      Array.isArray(plugin) &&
      typeof plugin[0] === 'string'
    ) {
      return plugin[0] !== 'react-native-maps'
    }

    return true
  })

const plugins = [
  ...filteredPlugins,

  ...(androidMapsApiKey
    ? [
        [
          'react-native-maps',
          {
            androidGoogleMapsApiKey:
              androidMapsApiKey,
          },
        ],
      ]
    : []),
]

module.exports = {
  ...expoConfig,

  plugins,

  android: {
    ...(expoConfig.android ?? {}),
  },

  ios: {
    ...(expoConfig.ios ?? {}),
  },
}