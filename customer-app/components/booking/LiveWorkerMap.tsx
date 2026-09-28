import {
  useEffect,
  useRef,
} from 'react'

import {
  StyleSheet,
  View,
} from 'react-native'

import MapView, {
  Marker,
  PROVIDER_GOOGLE,
} from 'react-native-maps'

export type LiveWorkerMapLocation = {
  latitude: number
  longitude: number
}

type Props = {
  location: LiveWorkerMapLocation
}

type MarkerRef = {
  animateMarkerToCoordinate: (
    coordinate: {
      latitude: number
      longitude: number
    },
    duration: number,
  ) => void
}

export default function LiveWorkerMap({
  location,
}: Props) {
  const mapRef =
    useRef<MapView | null>(null)

  const markerRef =
    useRef<MarkerRef | null>(null)

  const previousLocationRef =
    useRef<LiveWorkerMapLocation | null>(
      null,
    )

  useEffect(() => {
    const previousLocation =
      previousLocationRef.current

    if (!previousLocation) {
      previousLocationRef.current =
        location

      return
    }

    markerRef.current?.animateMarkerToCoordinate(
      {
        latitude:
          location.latitude,

        longitude:
          location.longitude,
      },
      900,
    )

    mapRef.current?.animateCamera(
      {
        center: {
          latitude:
            location.latitude,

          longitude:
            location.longitude,
        },
      },
      {
        duration: 700,
      },
    )

    previousLocationRef.current =
      location
  }, [
    location.latitude,
    location.longitude,
  ])

  return (
    <View
      style={
        styles.container
      }
    >
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={{
          latitude:
            location.latitude,

          longitude:
            location.longitude,

          latitudeDelta: 0.01,

          longitudeDelta: 0.01,
        }}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass
        toolbarEnabled={false}
        zoomEnabled
        scrollEnabled
        rotateEnabled={false}
        pitchEnabled={false}
      >
        <Marker
          ref={
            ref => {
              markerRef.current =
                ref
                  ? (ref as unknown as MarkerRef)
                  : null
            }
          }
          coordinate={{
            latitude:
              location.latitude,

            longitude:
              location.longitude,
          }}
          title="Worker"
          description="Live worker location"
        />
      </MapView>
    </View>
  )
}

const styles =
  StyleSheet.create({
    container: {
      width: '100%',
      height: 280,
      overflow: 'hidden',
      borderRadius: 16,
    },

    map: {
      width: '100%',
      height: '100%',
    },
  })