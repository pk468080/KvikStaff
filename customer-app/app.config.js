const baseConfig = require('./app.json')

module.exports = () => {
  const expo = baseConfig.expo

  return {
    ...expo,

    plugins: [
      ...(expo.plugins ?? []),

      [
        'react-native-maps',
        {
          iosGoogleMapsApiKey:
            process.env.GOOGLE_MAPS_API_KEY,

          androidGoogleMapsApiKey:
            process.env.GOOGLE_MAPS_API_KEY,
        },
      ],
    ],
  }
}