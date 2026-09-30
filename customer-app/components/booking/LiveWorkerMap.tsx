import {
  useCallback,
  useEffect,
  useRef,
} from 'react'

import {
  StyleSheet,
  Text,
  View,
} from 'react-native'

import MapView, {
  Marker,
  Polyline,
} from 'react-native-maps'

export type LiveWorkerMapLocation = {
  latitude: number
  longitude: number
}

type Props = {
  workerLocation: LiveWorkerMapLocation
  customerLocation: LiveWorkerMapLocation
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

function calculateDistanceKm(
  from: LiveWorkerMapLocation,
  to: LiveWorkerMapLocation,
): number {
  const earthRadiusKm = 6371

  const latitude1 =
    (from.latitude * Math.PI) / 180

  const latitude2 =
    (to.latitude * Math.PI) / 180

  const deltaLatitude =
    ((to.latitude -
      from.latitude) *
      Math.PI) /
    180

  const deltaLongitude =
    ((to.longitude -
      from.longitude) *
      Math.PI) /
    180

  const a =
    Math.sin(
      deltaLatitude / 2,
    ) **
      2 +
    Math.cos(latitude1) *
      Math.cos(latitude2) *
      Math.sin(
        deltaLongitude / 2,
      ) **
        2

  const c =
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a),
    )

  return (
    earthRadiusKm *
    c
  )
}

export default function LiveWorkerMap({
  workerLocation,
  customerLocation,
}: Props) {
  const mapRef =
    useRef<MapView | null>(null)

  const workerMarkerRef =
    useRef<MarkerRef | null>(
      null,
    )

  const previousWorkerLocationRef =
    useRef<LiveWorkerMapLocation | null>(
      null,
    )

    const workerLatitude = workerLocation.latitude
  const workerLongitude = workerLocation.longitude

  const customerLatitude =
    customerLocation.latitude

  const customerLongitude =
    customerLocation.longitude

  const distanceKm =
    calculateDistanceKm(
      {
        latitude: workerLatitude,
        longitude: workerLongitude,
      },
      {
        latitude: customerLatitude,
        longitude: customerLongitude,
      },
    )

  const fitMapToBothLocations =
    useCallback(() => {
      requestAnimationFrame(() => {
        mapRef.current?.fitToCoordinates(
          [
            {
              latitude: customerLatitude,
              longitude: customerLongitude,
            },
            {
              latitude: workerLatitude,
              longitude: workerLongitude,
            },
          ],
          {
            edgePadding: {
              top: 60,
              right: 60,
              bottom: 90,
              left: 60,
            },
            animated: true,
          },
        )
      })
    }, [
      customerLatitude,
      customerLongitude,
      workerLatitude,
      workerLongitude,
    ])

  useEffect(() => {
    const previousLocation =
      previousWorkerLocationRef.current

    if (!previousLocation) {
      previousWorkerLocationRef.current = {
        latitude: workerLatitude,
        longitude: workerLongitude,
      }

      fitMapToBothLocations()

      return
    }

    workerMarkerRef.current?.animateMarkerToCoordinate(
      {
        latitude: workerLatitude,
        longitude: workerLongitude,
      },
      900,
    )

    fitMapToBothLocations()

    previousWorkerLocationRef.current = {
      latitude: workerLatitude,
      longitude: workerLongitude,
    }
  }, [
    fitMapToBothLocations,
    workerLatitude,
    workerLongitude,
  ])

  return (
    <View
      style={
        styles.container
      }
    >
      <MapView
  ref={mapRef}
        style={styles.map}
        initialRegion={{
          latitude:
            (
              workerLocation.latitude +
              customerLocation.latitude
            ) /
            2,

          longitude:
            (
              workerLocation.longitude +
              customerLocation.longitude
            ) /
            2,

          latitudeDelta:
            distanceKm < 0.5
              ? 0.01
              : Math.max(
                  0.02,
                  Math.min(
                    1.5,
                    distanceKm /
                      40,
                  ),
                ),

          longitudeDelta:
            distanceKm < 0.5
              ? 0.01
              : Math.max(
                  0.02,
                  Math.min(
                    1.5,
                    distanceKm /
                      40,
                  ),
                ),
        }}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass
        toolbarEnabled={false}
        zoomEnabled
        scrollEnabled
        rotateEnabled={false}
        pitchEnabled={false}
        onMapReady={
          fitMapToBothLocations
        }
      >
        <Marker
          ref={ref => {
            workerMarkerRef.current =
              ref
                ? (ref as unknown as MarkerRef)
                : null
          }}
          coordinate={{
            latitude:
              workerLocation.latitude,
            longitude:
              workerLocation.longitude,
          }}
          pinColor="red"
          title="Worker"
          description="Live worker location"
        />

        <Marker
          coordinate={{
            latitude:
              customerLocation.latitude,
            longitude:
              customerLocation.longitude,
          }}
          pinColor="blue"
          title="Service location"
          description="Customer booking location"
        />

        <Polyline
          coordinates={[
            {
              latitude:
                workerLocation.latitude,
              longitude:
                workerLocation.longitude,
            },
            {
              latitude:
                customerLocation.latitude,
              longitude:
                customerLocation.longitude,
            },
          ]}
          strokeWidth={4}
        />
      </MapView>

      <View
        style={
          styles.overlay
        }
      >
        <View
          style={
            styles.overlayItem
          }
        >
          <View
            style={[
              styles.dot,
              styles.workerDot,
            ]}
          />

          <Text
            style={
              styles.overlayText
            }
          >
            Worker
          </Text>
        </View>

        <View
          style={
            styles.overlayItem
          }
        >
          <View
            style={[
              styles.dot,
              styles.customerDot,
            ]}
          />

          <Text
            style={
              styles.overlayText
            }
          >
            Your location
          </Text>
        </View>

        <View
          style={
            styles.distanceBadge
          }
        >
          <Text
            style={
              styles.distanceText
            }
          >
            {distanceKm <
            1
              ? `${Math.round(
                  distanceKm *
                    1000,
                )} m away`
              : `${distanceKm.toFixed(
                  1,
                )} km away`}
          </Text>
        </View>
      </View>
    </View>
  )
}

const styles =
  StyleSheet.create({
    container: {
      width: '100%',
      height: 360,
      overflow: 'hidden',
      borderRadius: 16,
      backgroundColor:
        '#EEF5F8',
    },

    map: {
      width: '100%',
      height: '100%',
    },

    overlay: {
      position:
        'absolute',
      left: 12,
      right: 12,
      bottom: 12,
      flexDirection:
        'row',
      alignItems:
        'center',
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor:
        'rgba(255,255,255,0.95)',
      gap: 14,
    },

    overlayItem: {
      flexDirection:
        'row',
      alignItems:
        'center',
      gap: 6,
    },

    dot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },

    workerDot: {
      backgroundColor:
        '#D32F2F',
    },

    customerDot: {
      backgroundColor:
        '#1976D2',
    },

    overlayText: {
      color:
        '#062F52',
      fontSize: 11,
      fontWeight:
        '700',
    },

    distanceBadge: {
      marginLeft:
        'auto',
      paddingHorizontal: 9,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor:
        '#E8F7F7',
    },

    distanceText: {
      color:
        '#008A88',
      fontSize: 11,
      fontWeight:
        '800',
    },
  })