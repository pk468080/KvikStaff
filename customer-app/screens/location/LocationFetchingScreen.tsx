import { useState } from 'react'
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
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

  const [addressLoading, setAddressLoading] =
    useState(false)

  const [addressInput, setAddressInput] =
    useState('')

  const [error, setError] =
    useState('')

  async function handleFetchLocation() {
    if (loading || addressLoading) {
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
          'Location permission was not granted. Enter your service address below to continue.',
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
          address = formatAddress(first)
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
          : 'Unable to fetch your location. Enter your service address below or try again.',
      )
    } finally {
      setLoading(false)
    }
  }

  async function handleUseAddress() {
    if (loading || addressLoading) {
      return
    }

    const query = addressInput.trim()

    if (query.length < 3) {
      setError(
        'Enter a more specific service address, area, or PIN code.',
      )
      return
    }

    setError('')
    setAddressLoading(true)

    try {
      const results =
        await Location.geocodeAsync(query)

      const first = results[0]

      if (!first) {
        setError(
          'Address not found. Try a full address, nearby landmark, area, or PIN code.',
        )
        return
      }

      let address = query

      try {
        const reverseResults =
          await Location.reverseGeocodeAsync({
            latitude: first.latitude,
            longitude: first.longitude,
          })

        const firstAddress =
          reverseResults[0]

        if (firstAddress) {
          const formatted =
            formatAddress(firstAddress)

          if (formatted) {
            address = formatted
          }
        }
      } catch (reverseGeocodeError) {
        /*
         * Keep the address entered by the customer
         * if reverse geocoding is unavailable.
         */
        console.error(
          'Manual reverse geocoding error:',
          reverseGeocodeError,
        )
      }

      await onLocationFetched(
        first.latitude,
        first.longitude,
        address,
      )
    } catch (err) {
      console.error(
        'Manual onboarding location error:',
        err,
      )

      setError(
        'Unable to select that address right now. Check your connection and try again.',
      )
    } finally {
      setAddressLoading(false)
    }
  }

  const busy = loading || addressLoading

  return (
    <ScreenContainer>
      <View style={styles.container}>
        <View style={styles.content}>
          <View style={styles.icon}>
            <CustomerIcon
              name="location"
              size={28}
              color="#0A3972"
            />
          </View>

          <Text style={styles.title}>
            Choose your service location
          </Text>

          <Text style={styles.subtitle}>
            Enter the address where you need service, or use your current location. GPS permission is optional, but a service location is needed to find available services and workers.
          </Text>

          {busy ? (
            <ActivityIndicator
              size="large"
              style={styles.loader}
            />
          ) : null}

          {error ? (
            <Text
              accessibilityRole="alert"
              style={styles.error}
            >
              {error}
            </Text>
          ) : null}
        </View>

        <View style={styles.actions}>
          <Text style={styles.inputLabel}>
            Service address or area
          </Text>

          <TextInput
            accessibilityLabel="Service address or area"
            style={styles.addressInput}
            value={addressInput}
            onChangeText={setAddressInput}
            editable={!busy}
            placeholder="e.g. Sector 12, Dwarka, New Delhi"
            placeholderTextColor="#9AA1AD"
            returnKeyType="go"
            onSubmitEditing={() => {
              void handleUseAddress()
            }}
            autoCapitalize="words"
          />

          <View style={styles.buttonSpacing}>
            <AppButton
              title={
                addressLoading
                  ? 'Finding address...'
                  : 'Continue with address'
              }
              disabled={busy}
              onPress={() => {
                void handleUseAddress()
              }}
            />
          </View>

          <Text style={styles.orText}>
            OR
          </Text>

          <AppButton
            title={
              loading
                ? 'Fetching location...'
                : 'Use current location'
            }
            disabled={busy}
            onPress={() => {
              void handleFetchLocation()
            }}
          />
        </View>
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
    paddingTop: 44,
    paddingBottom: 28,
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
    marginBottom: 22,
  },

  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
  },

  subtitle: {
    marginTop: 12,
    fontSize: 15,
    lineHeight: 22,
    color: '#6B7280',
    textAlign: 'center',
  },

  loader: {
    marginTop: 20,
  },

  error: {
    marginTop: 16,
    fontSize: 13,
    lineHeight: 19,
    color: '#DC2626',
    textAlign: 'center',
  },

  actions: {
    width: '100%',
  },

  inputLabel: {
    marginBottom: 8,
    color: '#374151',
    fontSize: 13,
    fontWeight: '700',
  },

  addressInput: {
    minHeight: 52,
    width: '100%',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#111827',
  },

  buttonSpacing: {
    marginTop: 12,
  },

  orText: {
    marginVertical: 10,
    color: '#9AA1AD',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
})
