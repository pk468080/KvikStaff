import {
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  Image,
  ScrollView,
  Text,
  View,
} from 'react-native'

import { ScreenContainer } from '../../components/layout/ScreenContainer'
import CustomerIcon from '../../components/ui/CustomerIcon'

import ServiceAreaStatusCard from '../../components/booking/ServiceAreaStatusCard'
import BookingSection from '../../components/booking/BookingSection'
import BookingMethodSelector from '../../components/booking/BookingMethodSelector'
import BookingFlowModal, {
  type BookingFlowStep,
} from '../../components/booking/BookingFlowModal'

import {
  styles,
} from '../../components/booking/bookingStyles'

import {
  useAvailability,
} from '../../hooks/useAvailability'

import {
  getOrCreateCustomerAddress,
} from '../../services/addresses/customerAddress.service'

import {
  getInstantAvailabilitySlots,
  type InstantAvailabilitySlot,
} from '../../services/availability/instantSlotAvailability.service'

import {
  calculateInstantBookingPrice,
  calculateMultiOccurrenceBookingPrice,
  type BookingPriceResult,
} from '../../services/booking/bookingPricing.service'

import {
  toDateString,
  toTimeString,
  startOfToday,
  startOfDay,
  getDurationHours,
  isValidTimeRange,
  getWeekdayIndex,
  generateRecurringOccurrences,
  generateScheduledOccurrences,
} from '../../lib/bookingUtils'

import type { HomeService } from '../../types/service'

import type {
  BookingDraft,
  BookingType,
} from '../../types/booking'

type BookingScreenProps = {
  service: HomeService

  location: {
    latitude: number
    longitude: number
    address: string
  } | null

  onContinue?: (
    draft: BookingDraft,
  ) => void
}

const KvikStaffLogo =
  require('../../assets/branding/tempstuff-logo.png')

function getNextInstantStartTime(
  now = new Date(),
) {
  const result =
    new Date(now)

  result.setSeconds(0, 0)

  const minutes =
    result.getMinutes()

  const remainder =
    minutes % 15

  if (remainder !== 0) {
    result.setMinutes(
      minutes +
        (15 - remainder),
    )
  } else {
    result.setMinutes(
      minutes + 15,
    )
  }

  return result
}

function getFutureDefaultStartTime() {
  const result =
    new Date()

  result.setHours(
    9,
    0,
    0,
    0,
  )

  return result
}

function getEndTimeFromDuration(
  start: Date,
  hours: number,
) {
  const result =
    new Date(start)

  result.setTime(
    result.getTime() +
      hours * 60 * 60 * 1000,
  )

  return result
}

export default function BookingScreen({
  service,
  location,
  onContinue,
}: BookingScreenProps) {
  const today = useMemo(
    () => startOfToday(),
    [],
  )

  const tomorrow = useMemo(() => {
    const date =
      new Date(today)

    date.setDate(
      date.getDate() + 1,
    )

    return date
  }, [today])

  const [
    bookingType,
    setBookingType,
  ] = useState<BookingType>(
    'instant',
  )

  const [
    bookingFlowVisible,
    setBookingFlowVisible,
  ] = useState(false)

  const [
    flowStep,
    setFlowStep,
  ] = useState<BookingFlowStep>(
    'instant-slot',
  )

  const [
    startTime,
    setStartTime,
  ] = useState(() =>
    getNextInstantStartTime(),
  )

  const [
    endTime,
    setEndTime,
  ] = useState(() =>
    getEndTimeFromDuration(
      getNextInstantStartTime(),
      1,
    ),
  )

  const [
    startDate,
    setStartDate,
  ] = useState<Date | null>(
    null,
  )

  const [
    endDate,
    setEndDate,
  ] = useState<Date | null>(
    null,
  )

  const [
    excludedDates,
    setExcludedDates,
  ] = useState<string[]>([])

  const [
    selectedWeekdays,
    setSelectedWeekdays,
  ] = useState<string[]>([])

  const {
    status: availabilityStatus,
    result: availabilityResult,
    error: availabilityError,
    checkInstant,
  } = useAvailability()

  const [
    instantSlots,
    setInstantSlots,
  ] = useState<
    InstantAvailabilitySlot[]
  >([])

  const [
    instantAvailabilityLoading,
    setInstantAvailabilityLoading,
  ] = useState(false)

  const [
    instantAvailabilityError,
    setInstantAvailabilityError,
  ] = useState<
    string | null
  >(null)

  const [
    selectedInstantSlotKey,
    setSelectedInstantSlotKey,
  ] = useState<
    string | null
  >(null)

  const [
    currentTime,
    setCurrentTime,
  ] = useState(
    () => new Date(),
  )

  const [
    pricing,
    setPricing,
  ] = useState<
    BookingPriceResult | null
  >(null)

  const [
    pricingLoading,
    setPricingLoading,
  ] = useState(false)

  const [
    pricingError,
    setPricingError,
  ] = useState<
    string | null
  >(null)

  const [
    instantPricing,
    setInstantPricing,
  ] = useState<
    BookingPriceResult | null
  >(null)

  const [
    instantPricingLoading,
    setInstantPricingLoading,
  ] = useState(false)

  const [
    instantPricingError,
    setInstantPricingError,
  ] = useState<
    string | null
  >(null)

  const durationHours =
    getDurationHours(
      startTime,
      endTime,
    )

  const timeRangeValid =
    isValidTimeRange(
      startTime,
      endTime,
    )

  const selectedInstantSlotIsAvailable =
    instantSlots.some(
      slot =>
        slot.start ===
          selectedInstantSlotKey &&
        slot.available_worker_count >
          0,
    )

  const recurringOccurrences =
    useMemo(() => {
      if (
        bookingType !==
          'recurring' ||
        !startDate ||
        !endDate
      ) {
        return []
      }

      const weekdayIndexes =
        selectedWeekdays
          .map(
            getWeekdayIndex,
          )
          .filter(
            index => index >= 0,
          )

      return generateRecurringOccurrences(
        startDate,
        endDate,
        weekdayIndexes,
        excludedDates,
      )
    }, [
      bookingType,
      startDate,
      endDate,
      selectedWeekdays,
      excludedDates,
    ])

  const scheduledOccurrences =
    startDate && endDate
      ? generateScheduledOccurrences(
          startDate,
          endDate,
          excludedDates,
        )
      : []

  const areaCheckPassed =
    availabilityResult
      ?.serviceAreaAvailable ===
      true &&
    (availabilityStatus ===
      'available' ||
      availabilityStatus ===
        'fallback')

  const hasInstantAvailability =
    areaCheckPassed &&
    availabilityResult
      ?.instantAvailable ===
      true

  const instantStartTimeValid =
    bookingType !==
      'instant' ||
    (startOfDay(
      startTime,
    ).getTime() ===
      today.getTime() &&
      startTime.getTime() >=
        new Date(
          currentTime.getTime() +
            15 * 60 * 1000,
        ).getTime())

  const hasRequiredDates =
    Boolean(
      startDate &&
        endDate &&
        (bookingType ===
        'recurring'
          ? recurringOccurrences.length >
            0
          : scheduledOccurrences.length >
            0),
    )

  const finalCanContinue =
    Boolean(
      location &&
        areaCheckPassed &&
        timeRangeValid &&
        instantStartTimeValid &&
        (bookingType ===
        'instant'
          ? hasInstantAvailability &&
            selectedInstantSlotIsAvailable
          : hasRequiredDates &&
            (bookingType ===
            'scheduled'
              ? true
              : selectedWeekdays.length >
                0)),
    )

  useEffect(() => {
    if (!location) {
      return
    }

    void checkInstant(
      service.id,
      location.latitude,
      location.longitude,
    )
  }, [
    checkInstant,
    location,
    service.id,
  ])

  useEffect(() => {
    let cancelled = false

    async function loadInstantSlots() {
      setInstantSlots([])

      setInstantAvailabilityError(
        null,
      )

      if (
        bookingType !==
          'instant' ||
        !bookingFlowVisible ||
        !location ||
        !timeRangeValid
      ) {
        setInstantAvailabilityLoading(
          false,
        )

        return
      }

      setInstantAvailabilityLoading(
        true,
      )

      try {
        const addressId =
          await getOrCreateCustomerAddress(
            location,
          )

        const result =
          await getInstantAvailabilitySlots(
            service.serviceVariantId,
            addressId,
            durationHours,
          )

        if (cancelled) {
          return
        }

        setInstantSlots(
          result.slots,
        )
      } catch (error) {
        if (cancelled) {
          return
        }

        setInstantAvailabilityError(
          error instanceof Error
            ? error.message
            : 'Unable to load instant availability.',
        )
      } finally {
        if (!cancelled) {
          setInstantAvailabilityLoading(
            false,
          )
        }
      }
    }

    void loadInstantSlots()

    return () => {
      cancelled = true
    }
  }, [
    bookingType,
    bookingFlowVisible,
    location,
    service.serviceVariantId,
    durationHours,
    timeRangeValid,
    currentTime,
  ])

  useEffect(() => {
    if (
      !bookingFlowVisible ||
      bookingType !==
        'instant'
    ) {
      return
    }

    const interval =
      setInterval(() => {
        setCurrentTime(
          new Date(),
        )
      }, 30_000)

    return () =>
      clearInterval(
        interval,
      )
  }, [
    bookingFlowVisible,
    bookingType,
  ])

  useEffect(() => {
    if (
      selectedInstantSlotKey &&
      !selectedInstantSlotIsAvailable
    ) {
      setSelectedInstantSlotKey(
        null,
      )
    }
  }, [
    selectedInstantSlotKey,
    selectedInstantSlotIsAvailable,
  ])

  useEffect(() => {
    let cancelled = false

    async function loadInstantPricing() {
      setInstantPricing(null)

      setInstantPricingError(
        null,
      )

      if (
        bookingType !==
          'instant' ||
        !bookingFlowVisible ||
        durationHours < 1
      ) {
        setInstantPricingLoading(
          false,
        )

        return
      }

      setInstantPricingLoading(
        true,
      )

      try {
        const result =
          await calculateInstantBookingPrice(
            service.serviceVariantId,
            durationHours,
          )

        if (cancelled) {
          return
        }

        setInstantPricing(
          result,
        )
      } catch (error) {
        if (cancelled) {
          return
        }

        setInstantPricingError(
          error instanceof Error
            ? error.message
            : 'Unable to calculate instant booking price.',
        )
      } finally {
        if (!cancelled) {
          setInstantPricingLoading(
            false,
          )
        }
      }
    }

    void loadInstantPricing()

    return () => {
      cancelled = true
    }
  }, [
    bookingType,
    bookingFlowVisible,
    service.serviceVariantId,
    durationHours,
  ])

  useEffect(() => {
    let cancelled = false

    async function loadFuturePricing() {
      setPricing(null)
      setPricingError(null)

      if (
        !bookingFlowVisible ||
        (bookingType !==
          'scheduled' &&
          bookingType !==
            'recurring')
      ) {
        setPricingLoading(
          false,
        )

        return
      }

      if (!startDate) {
        return
      }

      if (
        bookingType ===
          'scheduled' &&
        !endDate
      ) {
        return
      }

      if (
        bookingType ===
          'recurring' &&
        (!endDate ||
          selectedWeekdays.length ===
            0)
      ) {
        return
      }

      setPricingLoading(
        true,
      )

      try {
        const weekdayIndexes =
          bookingType ===
          'scheduled'
            ? [
                0,
                1,
                2,
                3,
                4,
                5,
                6,
              ]
            : selectedWeekdays
                .map(
                  getWeekdayIndex,
                )
                .filter(
                  index =>
                    index >= 0,
                )

        const result =
          await calculateMultiOccurrenceBookingPrice(
            {
              serviceVariantId:
                service.serviceVariantId,

              startDate:
                toDateString(
                  startDate,
                ),

              endDate:
                toDateString(
                  endDate!,
                ),

              startTime:
                toTimeString(
                  startTime,
                ),

              endTime:
                toTimeString(
                  endTime,
                ),

              selectedWeekdays:
                weekdayIndexes,

              excludedDates,

              bookingType,
            },
          )

        if (cancelled) {
          return
        }

        setPricing(result)
      } catch (error) {
        if (cancelled) {
          return
        }

        setPricingError(
          error instanceof Error
            ? error.message
            : 'Unable to calculate price.',
        )
      } finally {
        if (!cancelled) {
          setPricingLoading(
            false,
          )
        }
      }
    }

    void loadFuturePricing()

    return () => {
      cancelled = true
    }
  }, [
    bookingType,
    bookingFlowVisible,
    startDate,
    endDate,
    startTime,
    endTime,
    selectedWeekdays,
    excludedDates,
    service.serviceVariantId,
  ])

  function resetFlowState() {
    const nextInstantStart =
      getNextInstantStartTime()

    setStartTime(
      nextInstantStart,
    )

    setEndTime(
      getEndTimeFromDuration(
        nextInstantStart,
        1,
      ),
    )

    setStartDate(null)
    setEndDate(null)

    setExcludedDates([])

    setSelectedWeekdays([])

    setSelectedInstantSlotKey(
      null,
    )

    setPricing(null)
    setPricingError(null)

    setInstantPricing(null)
    setInstantPricingError(
      null,
    )

    setInstantAvailabilityError(
      null,
    )

    setInstantSlots([])
  }

  function openBookingFlow(
    type: BookingType,
  ) {
    if (
      type === 'instant' &&
      !hasInstantAvailability
    ) {
      return
    }

    resetFlowState()

    setBookingType(type)

    if (type === 'instant') {
      const instantStart =
        getNextInstantStartTime()

      setStartTime(
        instantStart,
      )

      setEndTime(
        getEndTimeFromDuration(
          instantStart,
          1,
        ),
      )

      setFlowStep(
        'instant-slot',
      )
    }

    if (type === 'scheduled') {
      const futureStart =
        getFutureDefaultStartTime()

      setStartDate(
        new Date(tomorrow),
      )

      setEndDate(
        new Date(tomorrow),
      )

      setStartTime(
        futureStart,
      )

      setEndTime(
        getEndTimeFromDuration(
          futureStart,
          1,
        ),
      )

      setFlowStep(
        'scheduled-date',
      )
    }

    if (type === 'recurring') {
      const futureStart =
        getFutureDefaultStartTime()

      const recurringEnd =
        new Date(tomorrow)

      recurringEnd.setDate(
        recurringEnd.getDate() +
          6,
      )

      setStartDate(
        new Date(tomorrow),
      )

      setEndDate(
        recurringEnd,
      )

      setStartTime(
        futureStart,
      )

      setEndTime(
        getEndTimeFromDuration(
          futureStart,
          1,
        ),
      )

      setFlowStep(
        'recurring-date',
      )
    }

    setBookingFlowVisible(
      true,
    )
  }

  function closeBookingFlow() {
    setBookingFlowVisible(
      false,
    )

    setFlowStep(
      'instant-slot',
    )
  }

  function handleSelectInstantSlot(
    slot: InstantAvailabilitySlot,
  ) {
    if (
      slot.available_worker_count <=
      0
    ) {
      return
    }

    const selectedStart =
      new Date(slot.start)

    const selectedEnd =
      new Date(slot.end)

    setSelectedInstantSlotKey(
      slot.start,
    )

    setStartTime(
      selectedStart,
    )

    setEndTime(
      selectedEnd,
    )
  }

  function setDuration(
    hours: number,
  ) {
    setEndTime(
      getEndTimeFromDuration(
        startTime,
        hours,
      ),
    )
  }

  function handleStartTimeChange(
    time: Date,
  ) {
    setSelectedInstantSlotKey(
      null,
    )

    setStartTime(time)

    setEndTime(
      getEndTimeFromDuration(
        time,
        Math.max(
          1,
          durationHours,
        ),
      ),
    )
  }

  function handleEndTimeChange(
    time: Date,
  ) {
    const minimumEndTime =
      getEndTimeFromDuration(
        startTime,
        1,
      )

    const selectedMinutes =
      time.getHours() * 60 +
      time.getMinutes()

    const minimumMinutes =
      minimumEndTime.getHours() *
        60 +
      minimumEndTime.getMinutes()

    if (
      selectedMinutes <
      minimumMinutes
    ) {
      return
    }

    setEndTime(time)

    if (
      bookingType ===
      'instant'
    ) {
      setSelectedInstantSlotKey(
        null,
      )
    }
  }

  function handleScheduledDateChange(
    date: Date,
  ) {
    const normalized =
      startOfDay(date)

    setStartDate(normalized)
    setEndDate(normalized)
  }

  function handleRecurringDateChange(
    date: Date,
  ) {
    const normalized =
      startOfDay(date)

    setStartDate(normalized)

    if (
      endDate &&
      normalized > endDate
    ) {
      setEndDate(normalized)
    }
  }

  function handleRecurringEndDateChange(
    date: Date,
  ) {
    setEndDate(
      startOfDay(date),
    )
  }

  function handleToggleExcludedDate(
    dateKey: string,
  ) {
    setExcludedDates(
      current =>
        current.includes(dateKey)
          ? current.filter(
              value =>
                value !== dateKey,
            )
          : [
              ...current,
              dateKey,
            ].sort(),
    )
  }

  function handleToggleWeekday(
    weekday: string,
  ) {
    setSelectedWeekdays(
      current =>
        current.includes(weekday)
          ? current.filter(
              value =>
                value !== weekday,
            )
          : [
              ...current,
              weekday,
            ],
    )
  }

  function getCanContinueStep() {
    if (
      flowStep ===
      'instant-slot'
    ) {
      return Boolean(
        location &&
          areaCheckPassed &&
          hasInstantAvailability &&
          selectedInstantSlotIsAvailable,
      )
    }

    if (
      flowStep ===
      'scheduled-date'
    ) {
      return Boolean(
        startDate &&
          startOfDay(
            startDate,
          ).getTime() >=
            tomorrow.getTime(),
      )
    }

    if (
      flowStep ===
        'scheduled-time' ||
      flowStep ===
        'recurring-time'
    ) {
      return timeRangeValid
    }

    if (
      flowStep ===
      'recurring-date'
    ) {
      return Boolean(
        startDate &&
          endDate &&
          startOfDay(
            startDate,
          ).getTime() >=
            tomorrow.getTime() &&
          startOfDay(
            endDate,
          ).getTime() >=
            startOfDay(
              startDate,
            ).getTime(),
      )
    }

    if (
      flowStep ===
      'recurring-weekdays'
    ) {
      return (
        selectedWeekdays.length >
        0
      )
    }

    if (
      flowStep ===
      'duration'
    ) {
      return Boolean(
        timeRangeValid &&
          durationHours >=
            1 &&
          (bookingType !==
            'instant' ||
            selectedInstantSlotIsAvailable),
      )
    }

    return finalCanContinue
  }

  function goNext() {
    if (
      !getCanContinueStep()
    ) {
      return
    }

    switch (flowStep) {
      case 'instant-slot':
        setFlowStep(
          'duration',
        )
        return

      case 'scheduled-date':
        setFlowStep(
          'scheduled-time',
        )
        return

      case 'scheduled-time':
        setFlowStep(
          'duration',
        )
        return

      case 'recurring-date':
        setFlowStep(
          'recurring-weekdays',
        )
        return

      case 'recurring-weekdays':
        setFlowStep(
          'recurring-time',
        )
        return

      case 'recurring-time':
        setFlowStep(
          'duration',
        )
        return

      case 'duration':
        setFlowStep(
          'summary',
        )
        return

      case 'summary':
        handleContinue()
        return
    }
  }

  function goBack() {
    switch (flowStep) {
      case 'instant-slot':
        closeBookingFlow()
        return

      case 'scheduled-date':
        closeBookingFlow()
        return

      case 'scheduled-time':
        setFlowStep(
          'scheduled-date',
        )
        return

      case 'recurring-date':
        closeBookingFlow()
        return

      case 'recurring-weekdays':
        setFlowStep(
          'recurring-date',
        )
        return

      case 'recurring-time':
        setFlowStep(
          'recurring-weekdays',
        )
        return

      case 'duration':
        if (
          bookingType ===
          'instant'
        ) {
          setFlowStep(
            'instant-slot',
          )
        } else if (
          bookingType ===
          'scheduled'
        ) {
          setFlowStep(
            'scheduled-time',
          )
        } else {
          setFlowStep(
            'recurring-time',
          )
        }

        return

      case 'summary':
        setFlowStep(
          'duration',
        )
        return
    }
  }

  function handleContinue() {
    if (
      !onContinue ||
      !location ||
      !finalCanContinue
    ) {
      return
    }

    const normalizedSelectedWeekdays =
      bookingType ===
      'recurring'
        ? Array.from(
            new Set(
              selectedWeekdays.filter(
                weekday =>
                  [
                    'Sunday',
                    'Monday',
                    'Tuesday',
                    'Wednesday',
                    'Thursday',
                    'Friday',
                    'Saturday',
                  ].includes(
                    weekday,
                  ),
              ),
            ),
          )
        : []

    const normalizedExcludedDates =
      bookingType ===
      'recurring'
        ? Array.from(
            new Set(
              excludedDates,
            ),
          ).sort()
        : []

    const draft: BookingDraft = {
      bookingType,
      location,

      startDate:
        startDate
          ? startDate.toISOString()
          : null,

      endDate:
        endDate
          ? endDate.toISOString()
          : null,

      startTime:
        startTime.toISOString(),

      endTime:
        endTime.toISOString(),

      selectedWeekdays:
        normalizedSelectedWeekdays,

      excludedDates:
        normalizedExcludedDates,
    }

    setBookingFlowVisible(
      false,
    )

    onContinue(draft)
  }

  return (
    <ScreenContainer>
      <ScrollView
        contentContainerStyle={
          styles.pageContent
        }
        showsVerticalScrollIndicator={
          false
        }
      >
        <View
          style={styles.header}
        >
          <View
            style={styles.brandRow}
          >
            <Image
              source={
                KvikStaffLogo
              }
              style={
                styles.brandLogo
              }
              resizeMode="contain"
            />

            <View
              style={
                styles.brandDivider
              }
            />

            <Text
              style={
                styles.brandCaption
              }
            >
              BOOKING
            </Text>
          </View>

          <Text
            style={styles.title}
          >
            {service.name}
          </Text>

          <Text
            style={styles.subtitle}
          >
            Choose how you want
            to book this service.
          </Text>
        </View>

        <View
          style={
            styles.serviceHero
          }
        >
          <View
            style={
              styles.serviceHeroImageWrap
            }
          >
            {service.imageUrl ? (
              <Image
                source={{
                  uri: service.imageUrl,
                }}
                style={
                  styles.serviceHeroImage
                }
                resizeMode="cover"
              />
            ) : (
              <View
                style={
                  styles.serviceHeroFallback
                }
              >
                <Text
                  style={
                    styles.serviceHeroFallbackText
                  }
                >
                  {service.name
                    .trim()
                    .charAt(
                      0,
                    )
                    .toUpperCase()}
                </Text>
              </View>
            )}
          </View>

          <View
            style={
              styles.serviceHeroContent
            }
          >
            <Text
              style={
                styles.serviceHeroName
              }
            >
              {service.name}
            </Text>

            {service.hourlyPrice !=
              null && (
              <Text
                style={
                  styles.serviceHeroPrice
                }
              >
                {service.currency ??
                  ''}
                {
                  service.hourlyPrice
                }{' '}
                <Text
                  style={
                    styles.serviceHeroPriceSuffix
                  }
                >
                  / hour
                </Text>
              </Text>
            )}
          </View>
        </View>

        <View
          style={
            styles.locationCard
          }
        >
          <View
            style={
              styles.locationIcon
            }
          >
            <CustomerIcon
              name="location"
              size={18}
              color="#0A3972"
            />
          </View>

          <View
            style={
              styles.locationContent
            }
          >
            <Text
              style={
                styles.locationLabel
              }
            >
              SERVICE LOCATION
            </Text>

            <Text
              style={
                styles.locationAddress
              }
              numberOfLines={2}
            >
              {location?.address ??
                'No location selected'}
            </Text>
          </View>
        </View>

        <View
          style={
            styles.availabilityShell
          }
        >
          <ServiceAreaStatusCard
            address={
              location?.address ??
              'No location selected'
            }
            available={
              availabilityResult
                ?.serviceAreaAvailable ===
              true
            }
            loading={
              availabilityStatus ===
              'checking'
            }
            error={
              availabilityStatus ===
              'error'
                ? availabilityError
                : null
            }
          />

          {availabilityStatus ===
            'available' &&
            areaCheckPassed && (
              <View
                style={
                  styles.availabilityDetails
                }
              >
                <View
                  style={
                    styles.availabilityStatusDot
                  }
                />

                <Text
                  style={
                    styles.availabilityDetailsText
                  }
                >
                  Service area confirmed
                </Text>
              </View>
            )}
        </View>

        <BookingSection
          title="How do you want to book?"
        >
          <Text
            style={
              styles.sectionDescription
            }
          >
            Select a booking type.
            The next steps are
            tailored to your choice.
          </Text>

          <BookingMethodSelector
            bookingType={
              bookingType
            }
            hasInstantAvailability={
              hasInstantAvailability
            }
            onSelect={
              openBookingFlow
            }
          />
        </BookingSection>

        <View
          style={
            styles.bottomTrustCard
          }
        >
          <View
            style={styles.trustItem}
          >
            <View
              style={
                styles.trustDot
              }
            />

            <Text
              style={
                styles.trustText
              }
            >
              Secure booking
            </Text>
          </View>

          <View
            style={styles.trustItem}
          >
            <View
              style={
                styles.trustDot
              }
            />

            <Text
              style={
                styles.trustText
              }
            >
              Verified workers
            </Text>
          </View>

          <View
            style={styles.trustItem}
          >
            <View
              style={
                styles.trustDot
              }
            />

            <Text
              style={
                styles.trustText
              }
            >
              Live availability
              for Instant
            </Text>
          </View>
        </View>
      </ScrollView>

      <BookingFlowModal
        visible={
          bookingFlowVisible
        }
        bookingType={
          bookingType
        }
        flowStep={flowStep}
        service={service}
        tomorrow={tomorrow}
        startTime={startTime}
        endTime={endTime}
        startDate={startDate}
        endDate={endDate}
        excludedDates={
          excludedDates
        }
        selectedWeekdays={
          selectedWeekdays
        }
        recurringOccurrences={
          recurringOccurrences
        }
        instantSlots={
          instantSlots
        }
        instantAvailabilityLoading={
          instantAvailabilityLoading
        }
        instantAvailabilityError={
          instantAvailabilityError
        }
        selectedInstantSlotKey={
          selectedInstantSlotKey
        }
        selectedInstantSlotIsAvailable={
          selectedInstantSlotIsAvailable
        }
        instantPricing={
          instantPricing
        }
        instantPricingLoading={
          instantPricingLoading
        }
        instantPricingError={
          instantPricingError
        }
        pricing={pricing}
        pricingLoading={
          pricingLoading
        }
        pricingError={
          pricingError
        }
        durationHours={
          durationHours
        }
        canContinueStep={
          getCanContinueStep()
        }
        onClose={
          closeBookingFlow
        }
        onBack={goBack}
        onNext={goNext}
        onSelectInstantSlot={
          handleSelectInstantSlot
        }
        onDuration={
          setDuration
        }
        onStartTimeChange={
          handleStartTimeChange
        }
        onEndTimeChange={
          handleEndTimeChange
        }
        onScheduledDateChange={
          handleScheduledDateChange
        }
        onRecurringDateChange={
          handleRecurringDateChange
        }
        onRecurringEndDateChange={
          handleRecurringEndDateChange
        }
        onToggleExcludedDate={
          handleToggleExcludedDate
        }
        onToggleWeekday={
          handleToggleWeekday
        }
      />
    </ScreenContainer>
  )
}