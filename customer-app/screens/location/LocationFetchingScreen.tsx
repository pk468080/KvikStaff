import { useState } from 'react'
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import * as Location from 'expo-location'

import { AppButton } from '../../components/ui/AppButton'
import CustomerIcon from '../../components/ui/CustomerIcon'
import { ScreenContainer } from '../../components/layout/ScreenContainer'

type LocationFetchingScreenProps = {
  onLocationFetched: (
    latitude: number,
    longitude: number,
    address: string,
  ) => Promise<void> | void
}

export default function LocationFetchingScreen({
  onLocationFetched,
}: LocationFetchingScreenProps) {
  const [loading, setLoading] =
    useState(false)

  const [error, setError] =
    useState('')

  async function handleFetchLocation() {
    if (loading) {
      return
    }

    setError('')
    setLoading(true)

    try {
      const permission =
        await Location.requestForegroundPermissionsAsync()

      if (
        permission.status !==
        'granted'
      ) {
        throw new Error(
          'Location permission is required to continue.',
        )
      }

      const location =
        await Location.getCurrentPositionAsync(
          {
            accuracy:
              Location.Accuracy.Balanced,
          },
        )

      const {
        latitude,
        longitude,
      } = location.coords

      let address = ''

      try {
        const results =
          await Location.reverseGeocodeAsync(
            {
              latitude,
              longitude,
            },
          )

        const first = results[0]

        if (first) {
          address =
            formatAddress(first)
        }
      } catch (reverseGeocodeError) {
        /*
         * GPS coordinates are still valid even
         * when reverse geocoding temporarily fails.
         */
        console.error(
          'Initial reverse geocoding error:',
          reverseGeocodeError,
        )
      }

      await onLocationFetched(
        latitude,
        longitude,
        address,
      )
    } catch (err) {
      console.error(
        'Location error:',
        err,
      )

      setError(
        err instanceof Error
          ? err.message
          : 'Unable to fetch your location. Please try again.',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <ScreenContainer>
      <View style={styles.container}>
        <View style={styles.content}>
          <View style={styles.icon}>
            <CustomerIcon
              name="location"
              size={28}
              color="#007E80"
            />
          </View>

          <Text style={styles.title}>
            Get your location
          </Text>

          <Text style={styles.subtitle}>
            We use your current location to show
            services and workers available in your area.
          </Text>

          {loading ? (
            <ActivityIndicator
              size="large"
              style={styles.loader}
            />
          ) : null}

          {error ? (
            <Text style={styles.error}>
              {error}
            </Text>
          ) : null}
        </View>

        <AppButton
          title={
            loading
              ? 'Fetching location...'
              : 'Allow location'
          }
          disabled={loading}
          onPress={() =>
            void handleFetchLocation()
          }
        />
      </View>
    </ScreenContainer>
  )
}

function formatAddress(
  address: Location.LocationGeocodedAddress,
) {
  const parts = [
    address.name,
    address.street,
    address.district,
    address.city,
    address.region,
    address.postalCode,
  ].filter(Boolean)

  return parts.join(', ')
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    paddingTop: 60,
    paddingBottom: 32,
    justifyContent: 'space-between',
  },

  content: {
    alignItems: 'center',
  },

  icon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },

  iconText: {
    fontSize: 42,
    color: '#111827',
  },

  title: {
    fontSize: 30,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
  },

  subtitle: {
    marginTop: 12,
    fontSize: 16,
    lineHeight: 24,
    color: '#6B7280',
    textAlign: 'center',
  },

  loader: {
    marginTop: 28,
  },

  error: {
    marginTop: 20,
    fontSize: 14,
    color: '#DC2626',
    textAlign: 'center',
  },
})