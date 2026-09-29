import {
  useEffect,
  useMemo,
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
  PROVIDER_GOOGLE,
} from 'react-native-maps'

export type WorkerBookingMapLocation = {
  latitude: number
  longitude: number
}

type WorkerLiveBookingMapProps = {
  workerLocation: WorkerBookingMapLocation
  customerLocation: WorkerBookingMapLocation
  workerLabel?: string
  customerLabel?: string
}

type MarkerRef = {
  animateMarkerToCoordinate: (
    coordinate: WorkerBookingMapLocation,
    duration: number,
  ) => void
}

function calculateDistanceKm(
  from: WorkerBookingMapLocation,
  to: WorkerBookingMapLocation,
): number {
  const earthRadiusKm =
    6371

  const latitude1 =
    (from.latitude *
      Math.PI) /
    180

  const latitude2 =
    (to.latitude *
      Math.PI) /
    180

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
    ) ** 2 +
    Math.cos(latitude1) *
      Math.cos(latitude2) *
      Math.sin(
        deltaLongitude / 2,
      ) ** 2

  const c =
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a),
    )

  return (
    earthRadiusKm * c
  )
}

export default function WorkerLiveBookingMap({
  workerLocation,
  customerLocation,
  workerLabel = 'You',
  customerLabel = 'Service location',
}: WorkerLiveBookingMapProps) {
  const mapRef =
    useRef<MapView | null>(
      null,
    )

  const workerMarkerRef =
    useRef<MarkerRef | null>(
      null,
    )

  const previousWorkerLocationRef =
    useRef<WorkerBookingMapLocation | null>(
      null,
    )

  const distanceKm =
    useMemo(
      () =>
        calculateDistanceKm(
          workerLocation,
          customerLocation,
        ),
      [
        workerLocation.latitude,
        workerLocation.longitude,
        customerLocation.latitude,
        customerLocation.longitude,
      ],
    )

  const fitMapToLocations =
    () => {
      requestAnimationFrame(
        () => {
          mapRef.current?.fitToCoordinates(
            [
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
            ],
            {
              edgePadding: {
                top: 70,
                right: 55,
                bottom: 100,
                left: 55,
              },

              animated: true,
            },
          )
        },
      )
    }

  useEffect(() => {
    const previousLocation =
      previousWorkerLocationRef.current

    if (!previousLocation) {
      previousWorkerLocationRef.current =
        workerLocation

      fitMapToLocations()

      return
    }

    const changed =
      previousLocation.latitude !==
        workerLocation.latitude ||
      previousLocation.longitude !==
        workerLocation.longitude

    if (changed) {
      workerMarkerRef.current?.animateMarkerToCoordinate(
        workerLocation,
        900,
      )

      previousWorkerLocationRef.current =
        workerLocation
    }

    fitMapToLocations()
  }, [
    workerLocation.latitude,
    workerLocation.longitude,
    customerLocation.latitude,
    customerLocation.longitude,
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
        provider={PROVIDER_GOOGLE}
        initialRegion={{
          latitude:
            (workerLocation.latitude +
              customerLocation.latitude) /
            2,

          longitude:
            (workerLocation.longitude +
              customerLocation.longitude) /
            2,

          latitudeDelta:
            distanceKm < 0.5
              ? 0.01
              : Math.max(
                  0.02,
                  Math.min(
                    1.5,
                    distanceKm / 40,
                  ),
                ),

          longitudeDelta:
            distanceKm < 0.5
              ? 0.01
              : Math.max(
                  0.02,
                  Math.min(
                    1.5,
                    distanceKm / 40,
                  ),
                ),
        }}
        showsUserLocation={
          false
        }
        showsMyLocationButton={
          false
        }
        showsCompass
        toolbarEnabled={false}
        zoomEnabled
        scrollEnabled
        rotateEnabled={false}
        pitchEnabled={false}
        onMapReady={
          fitMapToLocations
        }
      >
        <Marker
          ref={ref => {
            workerMarkerRef.current =
              ref
                ? (ref as unknown as MarkerRef)
                : null
          }}
          coordinate={
            workerLocation
          }
          pinColor="red"
          title={
            workerLabel
          }
          description="Your current location"
        />

        <Marker
          coordinate={
            customerLocation
          }
          pinColor="blue"
          title={
            customerLabel
          }
          description="Booking service location"
        />

        <Polyline
          coordinates={[
            workerLocation,
            customerLocation,
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
            {workerLabel}
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
            {customerLabel}
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
            {distanceKm < 1
              ? `${Math.round(
                  distanceKm *
                    1000,
                )} m`
              : `${distanceKm.toFixed(
                  1,
                )} km`}
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
      height: 340,
      overflow: 'hidden',
      borderRadius: 20,
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
      borderRadius: 14,
      backgroundColor:
        'rgba(255,255,255,0.95)',
    },

    overlayItem: {
      flexDirection:
        'row',
      alignItems:
        'center',
      marginRight: 14,
    },

    dot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      marginRight: 6,
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
      borderRadius: 9,
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