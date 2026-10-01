import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import * as Location from 'expo-location'
import { useFocusEffect } from '@react-navigation/native'
import ActiveBookingHomeCard from '../../components/home/ActiveBookingHomeCard'
import CustomerIcon from '../../components/ui/CustomerIcon'

import {
  getCustomerBookings,
  type CustomerBooking,
} from '../../services/booking/bookingTracking.service'
import { ScreenContainer } from '../../components/layout/ScreenContainer'
import {
  getCustomerFavouriteServiceIds,
  getCustomerRebookHistory,
  getHomePromotions,
  setCustomerFavouriteService,
} from '../../services/home/home-content.service'
import type { HomePromotion, HomeRebook } from '../../services/home/home-content.service'
import {
  getHomeServicesForLocation,
} from '../../services/services/services.service'
import type { HomeService } from '../../types/service'
import {
  formatUnreadNotificationCount,
  getUnreadCustomerNotificationCount,
} from '../../services/notifications/customerNotifications.service'

const tempStaffLogo = require('../../assets/branding/tempstuff-logo.png')
const heroBannerImage = require('../../assets/home/hero-banner.png')
const heroWorkerImage = require('../../assets/home/hero-worker.png')


type HomeLocation = {
  latitude: number
  longitude: number
  address: string
}

type HomeScreenProps = {
  location: HomeLocation | null
  onLocationChange: (
    latitude: number,
    longitude: number,
    address: string,
  ) => void
  onServicePress?: (
    service: HomeService,
  ) => void
  onBookingPress?: (
  bookingId: string,
) => void
  onOpenNotifications: () => void
}

export default function HomeScreen({
  location,
  onLocationChange,
  onServicePress,
  onBookingPress,
  onOpenNotifications,
}: HomeScreenProps) {
  const [services, setServices] = useState<HomeService[]>([])
  const [address, setAddress] = useState('Current location')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [locationLoading, setLocationLoading] = useState(false)
  const [error, setError] = useState('')
  const [locationError, setLocationError] = useState('')
  const [locationPickerVisible, setLocationPickerVisible] = useState(false)
  const [locationQuery, setLocationQuery] = useState('')
  const [locationSearching, setLocationSearching] = useState(false)
  const [serviceQuery, setServiceQuery] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [featuredOnly, setFeaturedOnly] = useState(false)
  const [favouriteServiceIds, setFavouriteServiceIds] = useState<Set<string>>(
    new Set(),
  )
  const [rebookHistory, setRebookHistory] = useState<HomeRebook[]>([])
  const [promotions, setPromotions] = useState<HomePromotion[]>([])
  const [contentLoading, setContentLoading] = useState(true)
  const [contentError, setContentError] = useState('')
  const [unreadNotificationCount, setUnreadNotificationCount] =
    useState(0)
  const automaticLocationRequestStarted = useRef(false)
const [
  activeBookings,
  setActiveBookings,
] = useState<CustomerBooking[]>([])

const [
  activeBookingsLoading,
  setActiveBookingsLoading,
] = useState(true)

  const loadUnreadNotificationCount = useCallback(
    async () => {
      try {
        const count =
          await getUnreadCustomerNotificationCount()

        setUnreadNotificationCount(count)
      } catch (error) {
        console.error(
          'Unread notification count error:',
          error,
        )
      }
    },
    [],
  )

  useFocusEffect(
    useCallback(() => {
      void loadUnreadNotificationCount()
    }, [loadUnreadNotificationCount]),
  )
  const serviceCategories = Array.from(
    new Map(
      services
        .filter(
          service =>
            Boolean(service.categoryId) &&
            Boolean(service.categoryName),
        )
        .map(service => [
          service.categoryId as string,
          service.categoryName as string,
        ]),
    ),
  )
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const normalizedServiceQuery =
    serviceQuery.trim().toLowerCase()

  const filteredServices = services.filter(service => {
    const categoryMatches =
      selectedCategoryId === null ||
      service.categoryId === selectedCategoryId

    const featuredMatches =
      !featuredOnly || service.isFeatured

    const searchMatches =
      normalizedServiceQuery.length === 0 ||
      service.name
        .toLowerCase()
        .includes(normalizedServiceQuery) ||
      (service.description ?? '')
        .toLowerCase()
        .includes(normalizedServiceQuery) ||
      (service.categoryName ?? '')
        .toLowerCase()
        .includes(normalizedServiceQuery)

    return (
      categoryMatches &&
      featuredMatches &&
      searchMatches
    )
  })

  const featuredServices = services.filter(
    service => service.isFeatured,
  )

  const hasServiceFilters =
    normalizedServiceQuery.length > 0 ||
    selectedCategoryId !== null ||
    featuredOnly

  const favouriteServices = services.filter(service =>
    favouriteServiceIds.has(service.id),
  )

  const rebookServices = rebookHistory
    .map(item => {
      const service = services.find(
        candidate => candidate.id === item.serviceId,
      )

      return service ? { service, booking: item } : null
    })
    .filter(
      (item): item is { service: HomeService; booking: HomeRebook } =>
        Boolean(item),
    )
    .slice(0, 4)

  async function loadServices(
    currentLocation: HomeLocation | null,
  ) {
    setError('')

    if (!currentLocation) {
      setServices([])
      return []
    }

    const nextServices =
      await getHomeServicesForLocation(
        currentLocation.latitude,
        currentLocation.longitude,
      )

    setServices(nextServices)
    return nextServices
  }
  async function loadActiveBookings() {
  try {
    setActiveBookingsLoading(
      true,
    )

    const bookings =
      await getCustomerBookings()

    const active = bookings.filter(
      booking =>
        booking.status ===
          'searching_worker' ||
        booking.status ===
          'assigned' ||
        booking.status ===
          'on_the_way' ||
        booking.status ===
          'arrived' ||
        booking.status ===
          'in_progress',
    )

    active.sort((a, b) => {
      const aTime = a.scheduled_start
        ? Date.parse(
            a.scheduled_start,
          )
        : Number.MAX_SAFE_INTEGER

      const bTime = b.scheduled_start
        ? Date.parse(
            b.scheduled_start,
          )
        : Number.MAX_SAFE_INTEGER

      return aTime - bTime
    })

    setActiveBookings(active)
  } catch (error) {
    console.error(
      'Active booking home card error:',
      error,
    )
  } finally {
    setActiveBookingsLoading(
      false,
    )
  }
}

  async function loadHomeContent(availableServices: HomeService[]) {
    setContentLoading(true)
    setContentError('')

    try {
      const availableIds = new Set(
        availableServices.map(service => service.id),
      )

      const [nextFavouriteIds, nextRebookHistory, nextPromotions] =
        await Promise.all([
          getCustomerFavouriteServiceIds(),
          getCustomerRebookHistory(),
          getHomePromotions(availableIds),
        ])

      setFavouriteServiceIds(nextFavouriteIds)
      setRebookHistory(nextRebookHistory)
      setPromotions(nextPromotions)
    } catch (err) {
      console.error('Home personalized content error:', err)
      setContentError(
        'Some personalized home content could not be loaded.',
      )
    } finally {
      setContentLoading(false)
    }
  }

  async function toggleFavourite(serviceId: string) {
    const wasFavourite = favouriteServiceIds.has(serviceId)
    const next = new Set(favouriteServiceIds)

    if (wasFavourite) {
      next.delete(serviceId)
    } else {
      next.add(serviceId)
    }

    setFavouriteServiceIds(next)

    try {
      await setCustomerFavouriteService(
        serviceId,
        !wasFavourite,
      )
    } catch (err) {
      console.error('Favourite service error:', err)
      setFavouriteServiceIds(favouriteServiceIds)
      setContentError(
        'Please sign in to save favourite services.',
      )
    }
  }

  async function handleServicePress(service: HomeService) {
    if (!location) {
      setLocationError(
        'Select a service location before booking.',
      )
      return
    }

    onServicePress?.(service)
  }

  async function loadAddress(
    currentLocation: HomeLocation | null,
  ) {
    if (!currentLocation) {
      setAddress('Current location')
      return
    }

    if (currentLocation.address.trim()) {
      setAddress(currentLocation.address)
      return
    }

    try {
      const results = await Location.reverseGeocodeAsync({
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
      })

      const first = results[0]

      if (!first) {
        return
      }

      const formatted = formatAddress(first)

      if (formatted) {
        setAddress(formatted)
      }
    } catch (err) {
      console.error('Reverse geocoding error:', err)
    }
  }

  async function loadHome(
    currentLocation: HomeLocation | null,
  ) {
    setLoading(true)
    setError('')

    try {
      /*
       * The customer's selected location is used to
       * determine which active services are published
       * for that geographic service area.
       *
       * Booking/backend validation remains authoritative
       * later in the booking flow.
       */
      const nextServices = await loadServices(currentLocation)
      await Promise.all([
        loadAddress(currentLocation),
        loadHomeContent(nextServices),
      ])
    } catch (err) {
      console.error('Home loading error:', err)
      setServices([])
      setError('Unable to load services. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function refreshHome() {
    setRefreshing(true)
    setError('')

    try {
      const nextServices = await loadServices(location)
      await Promise.all([
        loadAddress(location),
        loadHomeContent(nextServices),
      ])
    } catch (err) {
      console.error('Home refresh error:', err)
      setError('Unable to refresh services. Please try again.')
    } finally {
      setRefreshing(false)
    }
  }

  function getFriendlyLocationError(
    error: unknown,
  ): string {
    const message =
      error instanceof Error
        ? error.message.toLowerCase()
        : String(error).toLowerCase()

    if (
      message.includes('locationunavailable') ||
      message.includes('cannot obtain current location') ||
      message.includes('kclerrordomain')
    ) {
      return 'We could not detect your current location right now. You can search for your service area instead.'
    }

    if (
      message.includes('permission') ||
      message.includes('denied')
    ) {
      return 'Location access is unavailable. Search for your service area or enable location access in Settings.'
    }

    return 'Unable to detect your location right now. Search for your service area or try again.'
  }

  async function fetchCurrentLocation(
    automatic = false,
  ) {
    if (
      locationLoading ||
      locationSearching
    ) {
      return
    }

    setLocationError('')

    if (automatic) {
      setLocationLoading(true)
    } else {
      setLocationSearching(true)
    }

    try {
      const permission =
        await Location.requestForegroundPermissionsAsync()

      if (
        permission.status !== 'granted'
      ) {
        throw new Error(
          'Location permission is required to use services in your area.',
        )
      }

      const currentLocation =
        await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        })

      const {
        latitude,
        longitude,
      } = currentLocation.coords

      let selectedAddress = 'Current location'

      try {
        const formatted = await reverseGeocode(
          latitude,
          longitude,
        )

        if (formatted) {
          selectedAddress = formatted
        }
      } catch (reverseError) {
        console.error(
          'Current location reverse geocoding error:',
          reverseError,
        )
      }

      setAddress(selectedAddress)

      onLocationChange(
        latitude,
        longitude,
        selectedAddress,
      )

      setLocationQuery('')
      setLocationError('')

      if (!automatic) {
        setLocationPickerVisible(false)
      }
    } catch (err) {
      console.error(
        automatic
          ? 'Automatic location error:'
          : 'Current location error:',
        err,
      )

      const message =
        err instanceof Error
          ? err.message
          : 'Unable to fetch your current location. Please try again.'

      setLocationError(message)
    } finally {
      if (automatic) {
        setLocationLoading(false)
      } else {
        setLocationSearching(false)
      }
    }
  }

  async function handleSearchLocation() {
    const query = locationQuery.trim()

    if (query.length < 3) {
      setLocationError('Enter a more specific location.')
      return
    }

    setLocationError('')
    setLocationSearching(true)

    try {
      const results =
        await Location.geocodeAsync(query)

      const first = results[0]

      if (!first) {
        setLocationError(
          'Location not found. Try a more specific address or area.',
        )
        return
      }

      const formatted = await reverseGeocode(
        first.latitude,
        first.longitude,
      )

      const selectedAddress = formatted || query

      setAddress(selectedAddress)

      onLocationChange(
        first.latitude,
        first.longitude,
        selectedAddress,
      )

      setLocationQuery('')
      setLocationError('')
      setLocationPickerVisible(false)
    } catch (err) {
      console.error(
        'Manual location search error:',
        err,
      )

      setLocationError(
        'Unable to find that location. Please try again.',
      )
    } finally {
      setLocationSearching(false)
    }
  }

  useEffect(() => {
    if (
      location ||
      automaticLocationRequestStarted.current
    ) {
      return
    }

    automaticLocationRequestStarted.current = true
    void fetchCurrentLocation(true)
  }, [location])

  useEffect(() => {
    void loadHome(location)
  }, [
    location?.latitude,
    location?.longitude,
    location?.address,
  ])
  useEffect(() => {
  void loadActiveBookings()

  const interval =
    setInterval(() => {
      void loadActiveBookings()
    }, 15000)

  return () =>
    clearInterval(interval)
}, [])

  if (
    loading ||
    locationLoading
  ) {
    return (
      <ScreenContainer>
        <View style={styles.loading}>
          <View style={styles.loadingOrb}>
            <View style={styles.loadingOrbInner}>
              <ActivityIndicator
                size="small"
                color={COLORS.primary}
              />
            </View>
          </View>

          <Text style={styles.loadingTitle}>
            {locationLoading
              ? 'Finding your location'
              : 'Preparing TempStaff'}
          </Text>

          <Text style={styles.loadingText}>
            {locationLoading
              ? 'We are checking your service area.'
              : 'Loading available staffing services.'}
          </Text>

          {locationError ? (
            <View style={styles.loadingErrorContainer}>
              <Text style={styles.loadingError}>
                {locationError}
              </Text>

              <TouchableOpacity
                style={styles.retryLocationButton}
                onPress={() => {
                  automaticLocationRequestStarted.current = false
                  void fetchCurrentLocation(true)
                }}
              >
                <Text style={styles.retryLocationButtonText}>
                  Try again
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      </ScreenContainer>
    )
  }

  return (
    <ScreenContainer>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refreshHome}
            tintColor={COLORS.primary}
            progressBackgroundColor="#FFFFFF"
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topHeader}>
          <Image
            source={tempStaffLogo}
            style={styles.logo}
            resizeMode="contain"
          />

          <TouchableOpacity
            style={styles.locationPill}
            activeOpacity={0.86}
            onPress={() =>
              setLocationPickerVisible(true)
            }
          >
            <View style={styles.locationIcon}>
              <CustomerIcon
                name="location"
                size={18}
                color={COLORS.primaryDark}
              />
            </View>

            <View style={styles.locationTextWrap}>
              <Text style={styles.locationLabel}>
                SERVICE LOCATION
              </Text>

              <Text
                style={styles.location}
                numberOfLines={1}
              >
                {address}
              </Text>
            </View>

            <View style={styles.locationChevronWrap}>
              <CustomerIcon
                name="chevron-right"
                size={15}
                color={COLORS.primaryDark}
              />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.notificationButton}
            activeOpacity={0.82}
            onPress={onOpenNotifications}
            accessibilityRole="button"
            accessibilityLabel="Notifications"
            accessibilityHint="View your notifications"
          >
            <View
              style={styles.notificationBell}
              accessible={false}
              importantForAccessibility="no"
            >
              <View style={styles.notificationBellBody} />
              <View style={styles.notificationBellBase} />
              <View style={styles.notificationBellClapper} />
            </View>

            {unreadNotificationCount > 0 ? (
              <View
                style={styles.notificationBadge}
                accessible={false}
                importantForAccessibility="no"
              >
                <Text style={styles.notificationBadgeText}>
                  {formatUnreadNotificationCount(
                    unreadNotificationCount,
                  )}
                </Text>
              </View>
            ) : null}
          </TouchableOpacity>
        </View>

        <View style={styles.welcomeRow}>
          <View style={styles.welcomeCopy}>
            <View style={styles.liveDotRow}>
              <View style={styles.liveDot} />
              <Text style={styles.liveLabel}>
                STAFFING, ON DEMAND
              </Text>
            </View>

            <Text style={styles.welcomeTitle}>
              Find the right staff
              <Text style={styles.welcomeTitleAccent}>
                {' '}when you need them.
              </Text>
            </Text>

            <Text style={styles.welcomeSubtitle}>
              Reliable hourly support for
              offices, businesses, and daily
              operations.
            </Text>
          </View>

          <View style={styles.welcomeBadge}>
            <Text style={styles.welcomeBadgeValue}>
              {services.length}
            </Text>
            <Text style={styles.welcomeBadgeLabel}>
              SERVICES
            </Text>
          </View>
        </View>

        <View style={styles.heroCard}>
          <Image
            source={heroBannerImage}
            style={styles.heroBackground}
            resizeMode="contain"
          />

          <View style={styles.heroTint} />
          <View style={styles.heroGlow} />

          <View style={styles.heroCopy}>
            <View style={styles.heroTag}>
              <View style={styles.heroTagDot} />
              <Text style={styles.heroTagText}>
                HOURLY STAFFING
              </Text>
            </View>

            <Text style={styles.heroTitle}>
              Your workday,
              {'\n'}fully supported.
            </Text>

            <Text style={styles.heroSubtitle}>
              Choose a service and continue
              through your existing booking
              flow.
            </Text>
          </View>

          <Image
            source={heroWorkerImage}
            style={styles.heroWorker}
            resizeMode="contain"
          />

          <View style={styles.heroFooter}>
            <View style={styles.heroFooterDot} />

            <Text style={styles.heroFooterText}>
              Professional support • Flexible hours
            </Text>
          </View>
        </View>

        {locationError ? (
          <View style={styles.locationWarning}>
            <View style={styles.warningIcon}>
              <Text style={styles.warningIconText}>
                !
              </Text>
            </View>

            <View style={styles.warningCopy}>
              <Text style={styles.locationWarningText}>
                {locationError}
              </Text>

              <TouchableOpacity
                onPress={() => {
                  automaticLocationRequestStarted.current = false
                  void fetchCurrentLocation(true)
                }}
              >
                <Text style={styles.locationRetryText}>
                  Retry
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
        {!activeBookingsLoading &&
  activeBookings.length > 0 && (
    <ActiveBookingHomeCard
      booking={
        activeBookings[0]
      }
      activeBookingCount={
        activeBookings.length
      }
      onPress={() => {
        const booking =
          activeBookings[0]

        if (!booking) {
          return
        }

        onBookingPress?.(
          booking.id,
        )
      }}
    />
  )}

        {featuredServices.length > 0 &&
        normalizedServiceQuery.length === 0 &&
        selectedCategoryId === null &&
        !featuredOnly ? (
          <View style={styles.featuredSection}>
            <View style={styles.featuredHeader}>
              <View style={styles.sectionHeadingWrap}>
                <View style={styles.sectionEyebrowRow}>
                  <View style={styles.sectionEyebrowLine} />
                  <Text style={styles.sectionEyebrow}>
                    RECOMMENDED
                  </Text>
                </View>

                <Text style={styles.sectionTitle}>
                  Featured services
                </Text>

                <Text style={styles.sectionSubtitle}>
                  Popular staffing options available at your location.
                </Text>
              </View>

              <View style={styles.sectionCount}>
                <Text style={styles.sectionCountValue}>
                  {featuredServices.length}
                </Text>
                <Text style={styles.sectionCountLabel}>
                  FEATURED
                </Text>
              </View>
            </View>

            <FlatList
              data={featuredServices}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.featuredList}
              keyExtractor={item => `featured-${item.id}`}
              renderItem={({ item }) => (
                <View style={styles.featuredCardWrap}>
                  <ServiceCard
                    service={item}
                    variant="featured"
                    isFavourite={favouriteServiceIds.has(item.id)}
                    onToggleFavourite={() => void toggleFavourite(item.id)}
                    onPress={() => void handleServicePress(item)}
                  />
                </View>
              )}
            />
          </View>
        ) : null}

        {contentError ? (
          <View style={styles.contentNotice}>
            <Text style={styles.contentNoticeText}>
              {contentError}
            </Text>
          </View>
        ) : null}

        {rebookServices.length > 0 &&
        normalizedServiceQuery.length === 0 &&
        selectedCategoryId === null &&
        !featuredOnly ? (
          <View style={styles.homeSection}>
            <View style={styles.personalHeader}>
              <View style={styles.sectionHeadingWrap}>
                <View style={styles.sectionEyebrowRow}>
                  <View style={styles.sectionEyebrowLine} />
                  <Text style={styles.sectionEyebrow}>
                    QUICK REBOOK
                  </Text>
                </View>
                <Text style={styles.sectionTitle}>
                  Book again
                </Text>
                <Text style={styles.sectionSubtitle}>
                  Your most recent completed services.
                </Text>
              </View>
            </View>

            <FlatList
              data={rebookServices}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.rebookList}
              keyExtractor={item => `rebook-${item.service.id}`}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.rebookCard}
                  activeOpacity={0.88}
                  onPress={() => void handleServicePress(item.service)}
                >
                  <View style={styles.rebookImageWrap}>
                    {item.service.imageUrl ? (
                      <Image
                        source={{ uri: item.service.imageUrl }}
                        style={styles.rebookImage}
                        resizeMode="contain"
                      />
                    ) : (
                      <Text style={styles.rebookInitials}>
                        {getServiceInitials(item.service.name)}
                      </Text>
                    )}
                  </View>

                  <View style={styles.rebookCopy}>
                    <Text style={styles.rebookName} numberOfLines={1}>
                      {item.service.name}
                    </Text>
                    <Text style={styles.rebookMeta} numberOfLines={1}>
                      {item.booking.durationValue
                        ? `${item.booking.durationValue} ${item.booking.durationUnit ?? 'hr'} booked`
                        : 'Previously booked'}
                    </Text>
                  </View>

                </TouchableOpacity>
              )}
            />
          </View>
        ) : null}

        {favouriteServices.length > 0 &&
        normalizedServiceQuery.length === 0 &&
        selectedCategoryId === null &&
        !featuredOnly ? (
          <View style={styles.homeSection}>
            <View style={styles.personalHeader}>
              <View style={styles.sectionHeadingWrap}>
                <View style={styles.sectionEyebrowRow}>
                  <View style={styles.sectionEyebrowLine} />
                  <Text style={styles.sectionEyebrow}>
                    SAVED BY YOU
                  </Text>
                </View>
                <Text style={styles.sectionTitle}>
                  Your favourites
                </Text>
              </View>
              <View style={styles.sectionCount}>
                <Text style={styles.sectionCountValue}>
                  {favouriteServices.length}
                </Text>
                <Text style={styles.sectionCountLabel}>
                  SAVED
                </Text>
              </View>
            </View>

            <FlatList
              data={favouriteServices.slice(0, 4)}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.favouriteList}
              keyExtractor={item => `favourite-${item.id}`}
              renderItem={({ item }) => (
                <View style={styles.favouriteCardWrap}>
                  <ServiceCard
                    service={item}
                    variant="featured"
                    isFavourite
                    onToggleFavourite={() =>
                      void toggleFavourite(item.id)
                    }
                    onPress={() => void handleServicePress(item)}
                  />
                </View>
              )}
            />
          </View>
        ) : null}

        {promotions.length > 0 &&
        normalizedServiceQuery.length === 0 &&
        selectedCategoryId === null &&
        !featuredOnly ? (
          <View style={styles.homeSection}>
            <View style={styles.personalHeader}>
              <View style={styles.sectionHeadingWrap}>
                <View style={styles.sectionEyebrowRow}>
                  <View style={styles.sectionEyebrowLine} />
                  <Text style={styles.sectionEyebrow}>
                    TEMPSTAFF UPDATES
                  </Text>
                </View>
                <Text style={styles.sectionTitle}>
                  Offers & updates
                </Text>
              </View>
            </View>

            <FlatList
              data={promotions}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.promotionList}
              keyExtractor={item => `promotion-${item.id}`}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.promotionCard}
                  activeOpacity={0.9}
                  onPress={() => {
                    if (!item.serviceId) {
                      setServiceQuery('')
                      setSelectedCategoryId(null)
                      setFeaturedOnly(false)
                      return
                    }

                    const service = services.find(
                      candidate => candidate.id === item.serviceId,
                    )

                    if (service) {
                      void handleServicePress(service)
                    }
                  }}
                >
                  {item.imageUrl ? (
                    <Image
                      source={{ uri: item.imageUrl }}
                      style={styles.promotionImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.promotionImageFallback}>
                      <Text style={styles.promotionImageFallbackText}>
                        TS
                      </Text>
                    </View>
                  )}

                  <View style={styles.promotionOverlay} />
                  <View style={styles.promotionCopy}>
                    <Text style={styles.promotionTitle} numberOfLines={2}>
                      {item.title}
                    </Text>
                    {item.subtitle ? (
                      <Text style={styles.promotionSubtitle} numberOfLines={2}>
                        {item.subtitle}
                      </Text>
                    ) : null}
                    {item.ctaText ? (
                      <View style={styles.promotionCta}>
                        <Text style={styles.promotionCtaText}>
                          {item.ctaText}
                        </Text>
                        <CustomerIcon
                          name="arrow-right"
                          size={14}
                          color="#FFFFFF"
                        />
                      </View>
                    ) : null}
                  </View>
                </TouchableOpacity>
              )}
            />
          </View>
        ) : null}

        <View style={styles.servicesToolbar}>
          <View style={styles.serviceSearchField}>
            <CustomerIcon
              name="search"
              size={17}
              color="#78909C"
            />

            <TextInput
              value={serviceQuery}
              onChangeText={setServiceQuery}
              placeholder="Search services"
              placeholderTextColor="#94A3B8"
              style={styles.serviceSearchInput}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
            />

            {serviceQuery.length > 0 ? (
              <TouchableOpacity
                style={styles.serviceSearchClear}
                onPress={() => setServiceQuery('')}
                activeOpacity={0.8}
              >
                <CustomerIcon
                  name="close"
                  size={16}
                  color={COLORS.inkSoft}
                />
              </TouchableOpacity>
            ) : null}
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterList}
          >
            <TouchableOpacity
              style={[
                styles.filterChip,
                selectedCategoryId === null &&
                  !featuredOnly &&
                  styles.filterChipActive,
              ]}
              onPress={() => {
                setSelectedCategoryId(null)
                setFeaturedOnly(false)
              }}
              activeOpacity={0.82}
            >
              <Text
                style={[
                  styles.filterChipText,
                  selectedCategoryId === null &&
                    !featuredOnly &&
                    styles.filterChipTextActive,
                ]}
              >
                All
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.filterChip,
                featuredOnly && styles.filterChipActive,
              ]}
              onPress={() => setFeaturedOnly(value => !value)}
              activeOpacity={0.82}
            >
              <Text
                style={[
                  styles.filterChipText,
                  featuredOnly && styles.filterChipTextActive,
                ]}
              >
                Featured
              </Text>
            </TouchableOpacity>

            {serviceCategories.map(category => {
              const active =
                selectedCategoryId === category.id

              return (
                <TouchableOpacity
                  key={category.id}
                  style={[
                    styles.filterChip,
                    active && styles.filterChipActive,
                  ]}
                  onPress={() =>
                    setSelectedCategoryId(
                      active ? null : category.id,
                    )
                  }
                  activeOpacity={0.82}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      active && styles.filterChipTextActive,
                    ]}
                  >
                    {category.name}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </ScrollView>
        </View>

        <View style={styles.sectionHeader}>
          <View style={styles.sectionHeadingWrap}>
            <View style={styles.sectionEyebrowRow}>
              <View style={styles.sectionEyebrowLine} />
              <Text style={styles.sectionEyebrow}>
                {hasServiceFilters
                  ? 'SEARCH RESULTS'
                  : 'WHAT YOU NEED'}
              </Text>
            </View>

            <Text style={styles.sectionTitle}>
              {hasServiceFilters
                ? 'Matching services'
                : 'Services available here'}
            </Text>

            <Text style={styles.sectionSubtitle}>
              {hasServiceFilters
                ? 'Search or filters are applied to services covering your selected location.'
                : 'Showing only services that cover your selected location.'}
            </Text>
          </View>

          <View style={styles.sectionCount}>
            <Text style={styles.sectionCountValue}>
              {filteredServices.length}
            </Text>
            <Text style={styles.sectionCountLabel}>
              {hasServiceFilters ? 'MATCH' : 'LIVE'}
            </Text>
          </View>
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <View style={styles.errorIcon}>
              <Text style={styles.errorIconText}>
                !
              </Text>
            </View>

            <View style={styles.errorCopy}>
              <Text style={styles.errorTitle}>
                Something went wrong
              </Text>

              <Text style={styles.errorText}>
                {error}
              </Text>

              <TouchableOpacity
                style={styles.errorRetryButton}
                onPress={() => void refreshHome()}
              >
                <Text style={styles.errorRetryText}>
                  Try again
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : services.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Text style={styles.emptyIconText}>
                —
              </Text>
            </View>

            <Text style={styles.emptyTitle}>
              No services available here
            </Text>

            <Text style={styles.emptyText}>
              We do not currently have an
              active hourly service covering
              this location. Try another
              service location.
            </Text>
          </View>
        ) : filteredServices.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <CustomerIcon
                name="search"
                size={24}
                color="#78909C"
              />
            </View>

            <Text style={styles.emptyTitle}>
              No matching services
            </Text>

            <Text style={styles.emptyText}>
              Try a different search term or clear the selected filters.
            </Text>

            <TouchableOpacity
              style={styles.clearFiltersButton}
              onPress={() => {
                setServiceQuery('')
                setSelectedCategoryId(null)
                setFeaturedOnly(false)
              }}
              activeOpacity={0.86}
            >
              <Text style={styles.clearFiltersButtonText}>
                Clear search & filters
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={filteredServices}
            scrollEnabled={false}
            numColumns={2}
            columnWrapperStyle={styles.serviceRow}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <ServiceCard
                service={item}
                isFavourite={favouriteServiceIds.has(item.id)}
                onToggleFavourite={() => void toggleFavourite(item.id)}
                onPress={() => void handleServicePress(item)}
              />
            )}
          />
        )}

        <View style={styles.bottomBanner}>
          <View style={styles.bottomBannerTopRow}>
            <View style={styles.bottomBannerIcon}>
              <Text style={styles.bottomBannerIconText}>
                TS
              </Text>
            </View>

            <Text style={styles.bottomBannerTag}>
              TEMPSTAFF
            </Text>
          </View>

          <Text style={styles.bottomBannerTitle}>
            Flexible staffing for
            {'\n'}everyday business needs.
          </Text>

          <Text style={styles.bottomBannerText}>
            Choose your service, select
            your schedule, and continue
            through the existing booking
            flow.
          </Text>

          <View style={styles.bottomBannerRule}>
            <View style={styles.bottomBannerRuleActive} />
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={locationPickerVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() =>
          setLocationPickerVisible(false)
        }
      >
        <ScreenContainer>
          <View style={styles.modalContainer}>
            <View style={styles.modalHandle} />

            <View style={styles.modalHeader}>
              <View style={styles.modalHeadingWrap}>
                <View style={styles.modalKickerRow}>
                  <View style={styles.modalKickerDot} />
                  <Text style={styles.modalKicker}>
                    TEMPSTAFF
                  </Text>
                </View>

                <Text style={styles.modalTitle}>
                  Where do you need staff?
                </Text>
              </View>

              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() =>
                  setLocationPickerVisible(false)
                }
              >
                <Text style={styles.closeButton}>
                  Close
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.modalDescription}>
              Search for the address or
              area where you want the
              service.
            </Text>

            <View style={styles.searchField}>
              <CustomerIcon
                name="search"
                size={18}
                color="#78909C"
              />

              <TextInput
                value={locationQuery}
                onChangeText={value => {
                  setLocationQuery(value)
                  setLocationError('')
                }}
                placeholder="Enter address or area"
                placeholderTextColor="#94A3B8"
                style={styles.locationInput}
                autoCorrect={false}
                returnKeyType="search"
                onSubmitEditing={() =>
                  void handleSearchLocation()
                }
              />
            </View>

            {locationError ? (
              <View style={styles.modalError}>
                <View style={styles.modalErrorIcon}>
                  <Text style={styles.modalErrorIconText}>
                    !
                  </Text>
                </View>

                <Text style={styles.locationError}>
                  {locationError}
                </Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[
                styles.primaryButton,
                locationSearching && styles.disabledButton,
              ]}
              disabled={locationSearching}
              onPress={() =>
                void handleSearchLocation()
              }
              activeOpacity={0.9}
            >
              {locationSearching ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Text style={styles.primaryButtonText}>
                    Search location
                  </Text>
                  <CustomerIcon
                    name="arrow-right"
                    size={16}
                    color="#FFFFFF"
                  />
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.currentLocationButton}
              disabled={locationSearching}
              onPress={() =>
                void fetchCurrentLocation(false)
              }
              activeOpacity={0.88}
            >
              <View style={styles.currentLocationIcon}>
                <CustomerIcon
                  name="location"
                  size={18}
                  color={COLORS.primaryDark}
                />
              </View>

              <Text style={styles.currentLocationButtonText}>
                Use current location
              </Text>
            </TouchableOpacity>

            <View style={styles.modalTip}>
              <View style={styles.modalTipIcon}>
                <Text style={styles.modalTipIconText}>
                  i
                </Text>
              </View>

              <Text style={styles.modalTipText}>
                Your selected location is used when
                checking service availability during
                booking.
              </Text>
            </View>
          </View>
        </ScreenContainer>
      </Modal>
    </ScreenContainer>
  )
}

function ServiceCard({
  service,
  onPress,
  onToggleFavourite,
  isFavourite = false,
  variant = 'grid',
}: {
  service: HomeService
  onPress: () => void
  onToggleFavourite?: () => void
  isFavourite?: boolean
  variant?: 'grid' | 'featured'
}) {
  const initials = getServiceInitials(
    service.name,
  )

  const isGrid =
    variant === 'grid'

  return (
    <TouchableOpacity
      style={[
        styles.card,
        isGrid &&
          styles.gridCard,
        variant ===
          'featured' &&
          styles.featuredCard,
      ]}
      activeOpacity={0.88}
      onPress={onPress}
    >
      <View
        style={[
          styles.cardImageWrap,
          isGrid &&
            styles.gridCardImageWrap,
          variant ===
            'featured' &&
            styles.featuredCardImageWrap,
        ]}
      >
        {service.imageUrl ? (
          <Image
            source={{
              uri: service.imageUrl,
            }}
            style={[
              styles.cardImage,
              isGrid &&
                styles.gridCardImage,
              variant ===
                'featured' &&
                styles.featuredCardImage,
            ]}
            resizeMode={
              isGrid
                ? 'cover'
                : 'contain'
            }
          />
        ) : (
          <View
            style={[
              styles.cardImageFallback,
              isGrid &&
                styles.gridCardImageFallback,
              variant ===
                'featured' &&
                styles.featuredCardImageFallback,
            ]}
          >
            <Text
              style={
                styles.cardImageFallbackText
              }
            >
              {initials}
            </Text>
          </View>
        )}

        <View
          style={styles.cardImageShade}
        />

        <View
          style={styles.cardPricePill}
        >
          <Text
            style={
              styles.cardPricePillText
            }
          >
            {service.hourlyPrice ===
            null
              ? 'Price unavailable'
              : `${service.currency ?? ''} ${service.hourlyPrice}/hr`}
          </Text>
        </View>

        <View
          style={styles.cardImageBadge}
        >
          <View
            style={
              styles.cardImageBadgeDot
            }
          />

          <Text
            style={
              styles.cardImageBadgeText
            }
          >
            {service.isFeatured
              ? 'FEATURED'
              : 'HOURLY'}
          </Text>
        </View>

        {onToggleFavourite ? (
          <TouchableOpacity
            style={
              styles.favoriteButton
            }
            onPress={event => {
              event.stopPropagation?.()
              onToggleFavourite()
            }}
            activeOpacity={0.82}
          >
            <CustomerIcon
              name="heart"
              size={18}
              color={COLORS.primaryDark}
            />
          </TouchableOpacity>
        ) : null}
      </View>

      <View
        style={[
          styles.cardContent,
          isGrid &&
            styles.gridCardContent,
        ]}
      >
        <Text
          style={styles.serviceName}
          numberOfLines={1}
        >
          {service.name}
        </Text>

        {service.description ? (
          <Text
            style={styles.description}
            numberOfLines={2}
          >
            {service.description}
          </Text>
        ) : (
          <Text
            style={
              styles.descriptionFallback
            }
            numberOfLines={1}
          >
            Flexible staffing support
          </Text>
        )}

        <View
          style={styles.bookRow}
        >
          <Text
            style={styles.hourlyLabel}
          >
            STARTING FROM
          </Text>

          <View
            style={styles.bookAction}
          >
            <Text
              style={styles.book}
            >
              Book Now
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  )
}

function getServiceInitials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  if (words.length === 0) {
    return 'TS'
  }

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase()
  }

  return `${words[0][0]}${words[1][0]}`.toUpperCase()
}

async function reverseGeocode(
  latitude: number,
  longitude: number,
): Promise<string> {
  const results =
    await Location.reverseGeocodeAsync({
      latitude,
      longitude,
    })

  const first = results[0]

  if (!first) {
    return ''
  }

  return formatAddress(first)
}

function formatAddress(
  address: Location.LocationGeocodedAddress,
): string {
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

const COLORS = {
  ink: '#0A2338',
  inkSoft: '#456174',
  primary: '#00A7A7',
  primaryDark: '#007E80',
  primarySoft: '#E8F8F8',
  accent: '#FF9B32',
  canvas: '#F5F8FA',
  white: '#FFFFFF',
  border: '#E3EBEF',
  muted: '#71818C',
  warning: '#B45309',
  warningBg: '#FFF7ED',
  danger: '#B91C1C',
  dangerBg: '#FEF2F2',
} as const

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 120,
    backgroundColor: COLORS.canvas,
  },

  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },

  logo: {
    width: 118,
    height: 40,
  },

  notificationButton: {
    width: 44,
    height: 44,
    marginLeft: 8,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },

  notificationBell: {
    width: 26,
    height: 28,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },

  notificationBellBody: {
    position: 'absolute',
    top: 2,
    width: 18,
    height: 19,
    borderWidth: 2,
    borderColor: COLORS.primaryDark,
    borderRadius: 9,
    borderBottomLeftRadius: 5,
    borderBottomRightRadius: 5,
  },

  notificationBellBase: {
    width: 22,
    height: 2,
    marginBottom: 3,
    borderRadius: 1,
    backgroundColor: COLORS.primaryDark,
  },

  notificationBellClapper: {
    position: 'absolute',
    bottom: 0,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.primaryDark,
  },

  notificationBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.danger,
  },

  notificationBadgeText: {
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '900',
    color: COLORS.white,
  },

  locationPill: {
    flex: 1,
    minHeight: 54,
    marginLeft: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
  },

  locationIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },

  locationIconText: {
    fontSize: 18,
    lineHeight: 20,
    color: COLORS.primaryDark,
  },

  locationTextWrap: {
    flex: 1,
    marginLeft: 9,
  },

  locationLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.85,
    color: '#8898A2',
  },

  location: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800',
    color: COLORS.ink,
  },

  locationChevronWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F3F7F8',
    alignItems: 'center',
    justifyContent: 'center',
  },

  locationChevron: {
    marginTop: -2,
    marginLeft: 1,
    fontSize: 22,
    lineHeight: 22,
    fontWeight: '500',
    color: COLORS.primaryDark,
  },

  welcomeRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: 13,
  },

  welcomeCopy: {
    flex: 1,
    paddingRight: 14,
  },

  liveDotRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },

  liveLabel: {
    marginLeft: 7,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.1,
    color: COLORS.primaryDark,
  },

  welcomeTitle: {
    marginTop: 7,
    fontSize: 26,
    lineHeight: 31,
    fontWeight: '900',
    letterSpacing: -0.7,
    color: COLORS.ink,
  },

  welcomeTitleAccent: {
    color: COLORS.primaryDark,
  },

  welcomeSubtitle: {
    marginTop: 7,
    maxWidth: 320,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500',
    color: COLORS.inkSoft,
  },

  welcomeBadge: {
    width: 64,
    paddingVertical: 9,
    borderRadius: 18,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },

  welcomeBadgeValue: {
    fontSize: 18,
    lineHeight: 21,
    fontWeight: '900',
    color: COLORS.ink,
  },

  welcomeBadgeLabel: {
    marginTop: 2,
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.8,
    color: COLORS.muted,
  },

  heroCard: {
    height: 244,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: '#DFF4F5',
    position: 'relative',
    marginBottom: 28,
  },

  heroBackground: {
    ...StyleSheet.absoluteFill,
    width: undefined,
    height: undefined,
  },

  heroTint: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(235, 248, 249, 0.74)',
  },

  heroGlow: {
    position: 'absolute',
    right: -42,
    top: -42,
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: 'rgba(0, 167, 167, 0.11)',
  },

  heroCopy: {
    position: 'absolute',
    left: 20,
    top: 20,
    width: '55%',
    zIndex: 2,
  },

  heroTag: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 99,
    backgroundColor: 'rgba(255,255,255,0.84)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.86)',
  },

  heroTagDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
    backgroundColor: COLORS.primary,
  },

  heroTagText: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.75,
    color: COLORS.ink,
  },

  heroTitle: {
    marginTop: 12,
    fontSize: 27,
    lineHeight: 31,
    fontWeight: '900',
    letterSpacing: -0.7,
    color: COLORS.ink,
  },

  heroSubtitle: {
    marginTop: 9,
    maxWidth: 190,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
    color: '#526A7B',
  },

  heroWorker: {
    position: 'absolute',
    right: -18,
    bottom: -18,
    width: '58%',
    height: '106%',
    zIndex: 1,
  },

  heroFooter: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 15,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 3,
  },

  heroFooterDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
    backgroundColor: COLORS.accent,
  },

  heroFooterText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#4D687A',
  },

  locationWarning: {
    marginTop: -10,
    marginBottom: 22,
    padding: 13,
    borderRadius: 17,
    backgroundColor: COLORS.warningBg,
    borderWidth: 1,
    borderColor: '#F7C68B',
    flexDirection: 'row',
    alignItems: 'flex-start',
  },

  warningIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFE7C2',
    alignItems: 'center',
    justifyContent: 'center',
  },

  warningIconText: {
    fontSize: 14,
    fontWeight: '900',
    color: COLORS.warning,
  },

  warningCopy: {
    flex: 1,
    marginLeft: 10,
  },

  locationWarningText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
    color: '#8A4A10',
  },

  locationRetryText: {
    marginTop: 7,
    fontSize: 12,
    fontWeight: '900',
    color: COLORS.primaryDark,
  },

  sectionHeader: {
    marginBottom: 15,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },

  sectionHeadingWrap: {
    flex: 1,
  },

  sectionEyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },

  sectionEyebrowLine: {
    width: 22,
    height: 3,
    marginRight: 6,
    borderRadius: 3,
    backgroundColor: COLORS.accent,
  },

  sectionEyebrow: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.05,
    color: COLORS.muted,
  },

  sectionTitle: {
    fontSize: 22,
    lineHeight: 27,
    fontWeight: '900',
    letterSpacing: -0.3,
    color: COLORS.ink,
  },

  sectionSubtitle: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
    color: COLORS.inkSoft,
  },

  sectionCount: {
    minWidth: 48,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 15,
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center',
  },

  sectionCountValue: {
    fontSize: 14,
    lineHeight: 16,
    fontWeight: '900',
    color: COLORS.primaryDark,
  },

  sectionCountLabel: {
    marginTop: 1,
    fontSize: 6.5,
    fontWeight: '900',
    letterSpacing: 0.7,
    color: COLORS.primaryDark,
  },

  serviceRow: {
    justifyContent: 'space-between',
  },

  card: {
  width: '47.6%',
  marginBottom: 14,
  borderRadius: 18,
  backgroundColor: COLORS.white,
  borderWidth: 1,
  borderColor: COLORS.border,
  overflow: 'hidden',
  shadowColor: COLORS.ink,
  shadowOpacity: 0.055,
  shadowRadius: 15,
  shadowOffset: {
    width: 0,
    height: 7,
  },
  elevation: 2,
},

gridCard: {
  alignSelf: 'flex-start',
},

  cardImageWrap: {
    backgroundColor: '#F3F8F9',
    position: 'relative',
    overflow: 'hidden',
  },
  gridCardImageWrap: {
  aspectRatio: 1.15,
  width: '100%',
  backgroundColor: '#F3F8F9',
  position: 'relative',
  overflow: 'hidden',
},

gridCardImage: {
  width: '100%',
  height: '100%',
  backgroundColor: '#F3F8F9',
},

gridCardImageFallback: {
  flex: 1,
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: COLORS.primarySoft,
},

  featuredCardImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#F3F8F9',
  },

  featuredCardImageFallback: {
    width: '100%',
    height: '100%',
  },

  cardImage: {
    width: '100%',
    height: undefined,
    backgroundColor: '#F3F8F9',
  },

  cardImageShade: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(4, 31, 49, 0.04)',
  },

  cardImageFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primarySoft,
  },

  cardImageFallbackText: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.8,
    color: COLORS.primaryDark,
  },

  cardPricePill: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(10, 35, 56, 0.9)',
  },

  cardPricePillText: {
    fontSize: 8,
    fontWeight: '800',
    color: COLORS.white,
  },

  cardImageBadge: {
    position: 'absolute',
    right: 8,
    top: 8,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.88)',
  },

  cardImageBadgeDot: {
    width: 5,
    height: 5,
    marginRight: 5,
    borderRadius: 3,
    backgroundColor: COLORS.primary,
  },

  cardImageBadgeText: {
    fontSize: 6.5,
    fontWeight: '900',
    letterSpacing: 0.7,
    color: COLORS.ink,
  },

  cardContent: {
  padding: 10,
  paddingBottom: 11,
},

gridCardContent: {
  minHeight: 103,
  justifyContent: 'space-between',
},

  serviceName: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900',
    letterSpacing: -0.15,
    color: COLORS.ink,
  },

  description: {
    minHeight: 32,
    marginTop: 4,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '500',
    color: COLORS.muted,
  },

  descriptionFallback: {
    minHeight: 32,
    marginTop: 4,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '500',
    color: COLORS.muted,
  },

  bookRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#EEF3F5',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  hourlyLabel: {
    fontSize: 6.5,
    fontWeight: '900',
    letterSpacing: 0.7,
    color: '#84939C',
  },

  bookAction: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  book: {
    fontSize: 11,
    fontWeight: '900',
    color: COLORS.primaryDark,
  },

  homeSection: {
    marginBottom: 23,
  },

  personalHeader: {
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },

  contentNotice: {
    marginBottom: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#F7C68B',
  },

  contentNoticeText: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
    color: '#8A4A10',
  },

  rebookList: {
    paddingRight: 4,
  },

  rebookCard: {
    width: 236,
    minHeight: 74,
    marginRight: 10,
    padding: 9,
    borderRadius: 17,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
  },

  rebookImageWrap: {
    width: 56,
    height: 56,
    borderRadius: 13,
    backgroundColor: '#F3F8F9',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },

  rebookImage: {
    width: '100%',
    height: '100%',
  },

  rebookInitials: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.primaryDark,
  },

  rebookCopy: {
    flex: 1,
    marginLeft: 9,
  },

  rebookName: {
    fontSize: 13,
    fontWeight: '900',
    color: COLORS.ink,
  },

  rebookMeta: {
    marginTop: 3,
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.muted,
  },

  favouriteList: {
    paddingRight: 4,
  },

  favouriteCardWrap: {
    width: 210,
    marginRight: 10,
  },

  promotionList: {
    paddingRight: 4,
  },

  promotionCard: {
    width: 286,
    height: 170,
    marginRight: 12,
    borderRadius: 21,
    overflow: 'hidden',
    backgroundColor: COLORS.ink,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  promotionImage: {
    width: '100%',
    height: '100%',
  },

  promotionImageFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primarySoft,
  },

  promotionImageFallbackText: {
    fontSize: 28,
    fontWeight: '900',
    color: COLORS.primaryDark,
  },

  promotionOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(5, 25, 37, 0.52)',
  },

  promotionCopy: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 15,
  },

  promotionTitle: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '900',
    color: COLORS.white,
  },

  promotionSubtitle: {
    marginTop: 4,
    fontSize: 10.5,
    lineHeight: 15,
    fontWeight: '600',
    color: '#D8E6EC',
  },

  promotionCta: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.92)',
    flexDirection: 'row',
    alignItems: 'center',
  },

  promotionCtaText: {
    fontSize: 9,
    fontWeight: '900',
    color: COLORS.ink,
  },

  promotionCtaArrow: {
    marginLeft: 5,
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.primaryDark,
  },

  favoriteButton: {
    position: 'absolute',
    left: 8,
    top: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  favoriteButtonText: {
    marginTop: -1,
    fontSize: 17,
    lineHeight: 19,
    color: COLORS.primaryDark,
  },

  featuredSection: {
    marginBottom: 24,
  },

  featuredHeader: {
    marginBottom: 13,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },

  featuredList: {
    paddingRight: 4,
  },

  featuredCardWrap: {
    width: 210,
    marginRight: 10,
  },

  featuredCard: {
    width: '100%',
  },

  featuredCardImageWrap: {
    width: '100%',
    aspectRatio: 1.35,
    backgroundColor: '#F3F8F9',
    position: 'relative',
    overflow: 'hidden',
  },

  servicesToolbar: {
    marginBottom: 19,
  },

  serviceSearchField: {
    minHeight: 54,
    paddingHorizontal: 13,
    borderRadius: 17,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
  },

  serviceSearchIcon: {
    width: 24,
    fontSize: 20,
    lineHeight: 22,
    color: COLORS.primaryDark,
    textAlign: 'center',
  },

  serviceSearchInput: {
    flex: 1,
    minHeight: 50,
    marginLeft: 7,
    paddingHorizontal: 6,
    paddingVertical: 0,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.ink,
  },

  serviceSearchClear: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F1F6F7',
    alignItems: 'center',
    justifyContent: 'center',
  },

  serviceSearchClearText: {
    marginTop: -1,
    fontSize: 20,
    lineHeight: 20,
    fontWeight: '500',
    color: COLORS.inkSoft,
  },

  filterList: {
    paddingTop: 10,
    paddingRight: 4,
  },

  filterChip: {
    minHeight: 36,
    marginRight: 8,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },

  filterChipActive: {
    backgroundColor: COLORS.ink,
    borderColor: COLORS.ink,
  },

  filterChipText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.inkSoft,
  },

  filterChipTextActive: {
    color: COLORS.white,
  },

  clearFiltersButton: {
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 11,
    backgroundColor: COLORS.ink,
  },

  clearFiltersButtonText: {
    fontSize: 11,
    fontWeight: '900',
    color: COLORS.white,
  },

  bottomBanner: {
    marginTop: 6,
    marginBottom: 14,
    padding: 19,
    borderRadius: 23,
    backgroundColor: COLORS.ink,
    overflow: 'hidden',
  },

  bottomBannerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  bottomBannerIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  bottomBannerIconText: {
    fontSize: 8,
    fontWeight: '900',
    color: COLORS.white,
  },

  bottomBannerTag: {
    marginLeft: 8,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1,
    color: '#A9E1E2',
  },

  bottomBannerTitle: {
    maxWidth: '88%',
    marginTop: 12,
    fontSize: 19,
    lineHeight: 24,
    fontWeight: '900',
    letterSpacing: -0.25,
    color: COLORS.white,
  },

  bottomBannerText: {
    maxWidth: '92%',
    marginTop: 8,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
    color: '#C2D4DC',
  },

  bottomBannerRule: {
    height: 4,
    marginTop: 17,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },

  bottomBannerRuleActive: {
    width: '35%',
    height: '100%',
    borderRadius: 4,
    backgroundColor: COLORS.accent,
  },

  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    backgroundColor: COLORS.canvas,
  },

  loadingOrb: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },

  loadingOrbInner: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.ink,
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    elevation: 2,
  },

  loadingTitle: {
    marginTop: 18,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '900',
    textAlign: 'center',
    color: COLORS.ink,
  },

  loadingText: {
    marginTop: 6,
    maxWidth: 260,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
    textAlign: 'center',
    color: COLORS.muted,
  },

  loadingErrorContainer: {
    alignItems: 'center',
    marginTop: 20,
    maxWidth: 320,
  },

  loadingError: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
    color: COLORS.danger,
    textAlign: 'center',
  },

  retryLocationButton: {
    marginTop: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: COLORS.ink,
  },

  retryLocationButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.white,
  },

  errorBox: {
    padding: 15,
    borderRadius: 18,
    backgroundColor: COLORS.dangerBg,
    borderWidth: 1,
    borderColor: '#F4CACA',
    flexDirection: 'row',
    alignItems: 'flex-start',
  },

  errorIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FDDADA',
    alignItems: 'center',
    justifyContent: 'center',
  },

  errorIconText: {
    fontSize: 14,
    fontWeight: '900',
    color: COLORS.danger,
  },

  errorCopy: {
    flex: 1,
    marginLeft: 10,
  },

  errorTitle: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900',
    color: '#7F1D1D',
  },

  errorText: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
    color: COLORS.danger,
  },

  errorRetryButton: {
    marginTop: 11,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: COLORS.ink,
  },

  errorRetryText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.white,
  },

  empty: {
    paddingVertical: 42,
    paddingHorizontal: 20,
    borderRadius: 20,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },

  emptyIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: '#F3F7F8',
    alignItems: 'center',
    justifyContent: 'center',
  },

  emptyIconText: {
    fontSize: 25,
    lineHeight: 25,
    fontWeight: '600',
    color: '#9AACB5',
  },

  emptyTitle: {
    marginTop: 13,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '900',
    color: COLORS.ink,
    textAlign: 'center',
  },

  emptyText: {
    maxWidth: 290,
    marginTop: 6,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
    color: COLORS.muted,
    textAlign: 'center',
  },

  modalContainer: {
    flex: 1,
    paddingHorizontal: 22,
    paddingTop: 10,
    backgroundColor: COLORS.canvas,
  },

  modalHandle: {
    alignSelf: 'center',
    width: 42,
    height: 5,
    marginBottom: 18,
    borderRadius: 4,
    backgroundColor: '#D8E1E5',
  },

  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },

  modalHeadingWrap: {
    flex: 1,
    paddingRight: 16,
  },

  modalKickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  modalKickerDot: {
    width: 6,
    height: 6,
    marginRight: 6,
    borderRadius: 3,
    backgroundColor: COLORS.primary,
  },

  modalKicker: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.1,
    color: COLORS.primaryDark,
  },

  modalTitle: {
    marginTop: 5,
    fontSize: 25,
    lineHeight: 30,
    fontWeight: '900',
    letterSpacing: -0.4,
    color: COLORS.ink,
  },

  modalCloseButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 11,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  closeButton: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.ink,
  },

  modalDescription: {
    marginTop: 11,
    maxWidth: 320,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500',
    color: COLORS.muted,
  },

  searchField: {
    marginTop: 22,
    minHeight: 58,
    paddingHorizontal: 14,
    borderRadius: 17,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
  },

  searchFieldIcon: {
    width: 24,
    fontSize: 20,
    lineHeight: 22,
    color: COLORS.primaryDark,
    textAlign: 'center',
  },

  locationInput: {
    flex: 1,
    minHeight: 54,
    marginLeft: 7,
    paddingHorizontal: 6,
    paddingVertical: 0,
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.ink,
  },

  modalError: {
    marginTop: 11,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: COLORS.dangerBg,
    borderWidth: 1,
    borderColor: '#F4CACA',
    flexDirection: 'row',
    alignItems: 'flex-start',
  },

  modalErrorIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FDDADA',
    alignItems: 'center',
    justifyContent: 'center',
  },

  modalErrorIconText: {
    fontSize: 12,
    fontWeight: '900',
    color: COLORS.danger,
  },

  locationError: {
    flex: 1,
    marginLeft: 8,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
    color: COLORS.danger,
  },

  primaryButton: {
    marginTop: 14,
    minHeight: 56,
    paddingHorizontal: 18,
    borderRadius: 17,
    backgroundColor: COLORS.ink,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },

  disabledButton: {
    opacity: 0.62,
  },

  primaryButtonText: {
    fontSize: 14,
    fontWeight: '900',
    color: COLORS.white,
  },

  primaryButtonArrow: {
    marginLeft: 9,
    fontSize: 18,
    lineHeight: 18,
    fontWeight: '500',
    color: '#A9E1E2',
  },

  currentLocationButton: {
    marginTop: 10,
    minHeight: 56,
    paddingHorizontal: 18,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#CFE0E5',
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },

  currentLocationIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },

  currentLocationIconText: {
    fontSize: 16,
    lineHeight: 18,
    color: COLORS.primaryDark,
  },

  currentLocationButtonText: {
    marginLeft: 8,
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.ink,
  },

  modalTip: {
    marginTop: 18,
    padding: 13,
    borderRadius: 16,
    backgroundColor: '#EEF6F7',
    flexDirection: 'row',
    alignItems: 'flex-start',
  },

  modalTipIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },

  modalTipIconText: {
    fontSize: 12,
    fontWeight: '900',
    color: COLORS.primaryDark,
  },

  modalTipText: {
    flex: 1,
    marginLeft: 8,
    fontSize: 10.5,
    lineHeight: 16,
    fontWeight: '600',
    color: '#4B6877',
  },
})
