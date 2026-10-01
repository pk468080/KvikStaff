import {
  Modal,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'

import {
  SafeAreaView,
} from 'react-native-safe-area-context'
import CustomerIcon from '../ui/CustomerIcon'

import DateRangePicker from './DateRangePicker'
import WeekdaySelector from './WeekdaySelector'
import RecurringOccurrencePreview from './RecurringOccurrencePreview'
import BookingPriceSummary from './BookingPriceSummary'
import BookingLoadingState from './BookingLoadingState'
import BookingErrorState from './BookingErrorState'
import TimeRangePicker from './TimeRangePicker'
import SingleDatePicker from './SingleDatePicker'

import {
  formatDateDisplay,
} from '../../lib/bookingUtils'

import type { HomeService } from '../../types/service'
import type { BookingType } from '../../types/booking'

import type {
  InstantAvailabilitySlot,
} from '../../services/availability/instantSlotAvailability.service'

import type {
  BookingPriceResult,
} from '../../services/booking/bookingPricing.service'

import { styles } from './bookingStyles'

export type BookingFlowStep =
  | 'instant-slot'
  | 'scheduled-date'
  | 'scheduled-time'
  | 'recurring-date'
  | 'recurring-weekdays'
  | 'recurring-time'
  | 'duration'
  | 'summary'

const DURATION_OPTIONS = [
  1,
  2,
  3,
  4,
  5,
  6,
]

const METHOD_COPY: Record<
  BookingType,
  {
    eyebrow: string
    title: string
  }
> = {
  instant: {
    eyebrow: 'FASTEST',
    title: 'Instant',
  },

  scheduled: {
    eyebrow: 'FLEXIBLE',
    title: 'Scheduled',
  },

  recurring: {
    eyebrow: 'REPEAT',
    title: 'Recurring',
  },
}

type Props = {
  visible: boolean

  bookingType: BookingType

  flowStep: BookingFlowStep

  service: HomeService

  tomorrow: Date

  startTime: Date
  endTime: Date

  startDate: Date | null
  endDate: Date | null

  excludedDates: string[]

  selectedWeekdays: string[]

  recurringOccurrences: Date[]

  instantSlots: InstantAvailabilitySlot[]

  instantAvailabilityLoading: boolean

  instantAvailabilityError: string | null

  selectedInstantSlotKey: string | null

  selectedInstantSlotIsAvailable: boolean

  instantPricing:
    | BookingPriceResult
    | null

  instantPricingLoading: boolean

  instantPricingError: string | null

  pricing:
    | BookingPriceResult
    | null

  pricingLoading: boolean

  pricingError: string | null

  durationHours: number

  canContinueStep: boolean

  onClose: () => void

  onBack: () => void

  onNext: () => void

  onSelectInstantSlot: (
    slot: InstantAvailabilitySlot,
  ) => void

  onDuration: (
    hours: number,
  ) => void

  onStartTimeChange: (
    time: Date,
  ) => void

  onEndTimeChange: (
    time: Date,
  ) => void

  onScheduledDateChange: (
    date: Date,
  ) => void

  onRecurringDateChange: (
    date: Date,
  ) => void

  onRecurringEndDateChange: (
    date: Date,
  ) => void

  onToggleExcludedDate: (
    dateKey: string,
  ) => void

  onToggleWeekday: (
    weekday: string,
  ) => void
}

function getStepCount(
  type: BookingType,
) {
  if (type === 'instant') {
    return 3
  }

  if (type === 'scheduled') {
    return 4
  }

  return 5
}

function getStepNumber(
  type: BookingType,
  step: BookingFlowStep,
) {
  if (type === 'instant') {
    if (step === 'instant-slot') {
      return 1
    }

    if (step === 'duration') {
      return 2
    }

    return 3
  }

  if (type === 'scheduled') {
    if (step === 'scheduled-date') {
      return 1
    }

    if (step === 'scheduled-time') {
      return 2
    }

    if (step === 'duration') {
      return 3
    }

    return 4
  }

  if (step === 'recurring-date') {
    return 1
  }

  if (
    step === 'recurring-weekdays'
  ) {
    return 2
  }

  if (step === 'recurring-time') {
    return 3
  }

  if (step === 'duration') {
    return 4
  }

  return 5
}

function getStepTitle(
  step: BookingFlowStep,
) {
  switch (step) {
    case 'instant-slot':
      return 'Select a start time'

    case 'scheduled-date':
      return 'Select a date'

    case 'scheduled-time':
      return 'Select a start time'

    case 'recurring-date':
      return 'Select date range'

    case 'recurring-weekdays':
      return 'Select weekdays'

    case 'recurring-time':
      return 'Select a start time'

    case 'duration':
      return 'How long do you need?'

    case 'summary':
      return 'Review your booking'
  }
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

export default function BookingFlowModal({
  visible,
  bookingType,
  flowStep,
  service,
  tomorrow,
  startTime,
  endTime,
  startDate,
  endDate,
  excludedDates,
  selectedWeekdays,
  recurringOccurrences,
  instantSlots,
  instantAvailabilityLoading,
  instantAvailabilityError,
  selectedInstantSlotKey,
  selectedInstantSlotIsAvailable,
  instantPricing,
  instantPricingLoading,
  instantPricingError,
  pricing,
  pricingLoading,
  pricingError,
  durationHours,
  canContinueStep,
  onClose,
  onBack,
  onNext,
  onSelectInstantSlot,
  onDuration,
  onStartTimeChange,
  onEndTimeChange,
  onScheduledDateChange,
  onRecurringDateChange,
  onRecurringEndDateChange,
  onToggleExcludedDate,
  onToggleWeekday,
}: Props) {
  const stepNumber =
    getStepNumber(
      bookingType,
      flowStep,
    )

  const stepCount =
    getStepCount(
      bookingType,
    )

  const stepProgress =
    `${Math.round(
      (stepNumber / stepCount) *
        100,
    )}%` as `${number}%`

  function renderDurationStep() {
    return (
      <View>
        <View
          style={
            styles.contextCard
          }
        >
          <View
            style={
              styles.contextIcon
            }
          >
            <Text
              style={
                styles.contextIconText
              }
            >
              T
            </Text>
          </View>

          <View
            style={
              styles.contextContent
            }
          >
            <Text
              style={
                styles.contextLabel
              }
            >
              Start time
            </Text>

            <Text
              style={
                styles.contextValue
              }
            >
              {startTime.toLocaleTimeString(
                [],
                {
                  hour: 'numeric',
                  minute: '2-digit',
                },
              )}
            </Text>

            <Text
              style={
                styles.contextHint
              }
            >
              {bookingType ===
              'instant'
                ? 'Today'
                : startDate
                  ? formatDateDisplay(
                      startDate,
                    )
                  : 'Future booking'}
            </Text>
          </View>
        </View>

        <Text
          style={styles.subheading}
        >
          How long do you need?
        </Text>

        <Text
          style={
            styles.stepDescription
          }
        >
          Choose a quick duration
          or set an exact end
          time. Duration updates
          automatically.
        </Text>

        <View
          style={
            styles.durationGrid
          }
        >
          {DURATION_OPTIONS.map(
            hours => {
              const selected =
                durationHours ===
                hours

              return (
                <TouchableOpacity
                  key={hours}
                  activeOpacity={0.86}
                  onPress={() =>
                    onDuration(hours)
                  }
                  style={[
                    styles.durationOption,
                    selected &&
                      styles.durationOptionSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.durationOptionText,
                      selected &&
                        styles.durationOptionTextSelected,
                    ]}
                  >
                    {hours}{' '}
                    hour
                    {hours === 1
                      ? ''
                      : 's'}
                  </Text>

                  {selected && (
                    <View
                      style={
                        styles.checkCircle
                      }
                    >
                      <Text
                        style={
                          styles.checkCircleText
                        }
                      >
                        ✓
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              )
            },
          )}
        </View>

        <TimeRangePicker
          startTime={startTime}
          endTime={endTime}
          onStartTimeChange={
            onStartTimeChange
          }
          onEndTimeChange={
            onEndTimeChange
          }
          mode="end"
          minimumTime={getEndTimeFromDuration(
            startTime,
            1,
          )}
          endHint="At least 1 hour after the start time"
        />

        {bookingType ===
          'instant' &&
          !selectedInstantSlotIsAvailable && (
            <View
              style={
                styles.warningCard
              }
            >
              <Text
                style={
                  styles.warningTitle
                }
              >
                This duration is no longer available
              </Text>

              <Text
                style={
                  styles.warningText
                }
              >
                Choose another duration
                or go back and select
                another start time.
              </Text>
            </View>
          )}
      </View>
    )
  }

  function renderInstantStep() {
    return (
      <View>
        <View
          style={
            styles.infoBanner
          }
        >
          <View
            style={
              styles.infoBannerIcon
            }
          >
            <Text
              style={
                styles.infoBannerIconText
              }
            >
              i
            </Text>
          </View>

          <Text
            style={
              styles.infoBannerText
            }
          >
            Available start times
            are shown in
            15-minute intervals.
            Worker count is not
            displayed.
          </Text>
        </View>

        {instantAvailabilityLoading && (
          <BookingLoadingState />
        )}

        {instantAvailabilityError && (
          <BookingErrorState
            message={
              instantAvailabilityError
            }
          />
        )}

        {!instantAvailabilityLoading &&
          !instantAvailabilityError &&
          instantSlots.length ===
            0 && (
            <View
              style={
                styles.emptySlotsCard
              }
            >
              <Text
                style={
                  styles.emptySlotsTitle
                }
              >
                No instant start times available
              </Text>

              <Text
                style={
                  styles.emptySlotsText
                }
              >
                No instant slot can
                currently be
                fulfilled for this
                service and
                location.
              </Text>
            </View>
          )}

        {!instantAvailabilityLoading &&
          !instantAvailabilityError &&
          instantSlots.map(
            (slot, index) => {
              const selected =
                selectedInstantSlotKey ===
                slot.start

              const slotStart =
                new Date(
                  slot.start,
                )

              return (
                <TouchableOpacity
                  key={`${slot.start}-${slot.end}-${index}`}
                  activeOpacity={0.86}
                  onPress={() =>
                    onSelectInstantSlot(
                      slot,
                    )
                  }
                  style={[
                    styles.slotCard,
                    selected &&
                      styles.slotCardSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.slotTime,
                      selected &&
                        styles.slotTimeSelected,
                    ]}
                  >
                    {slotStart.toLocaleTimeString(
                      [],
                      {
                        hour: 'numeric',
                        minute: '2-digit',
                      },
                    )}
                  </Text>

                  <View
                    style={[
                      styles.slotCheck,
                      selected &&
                        styles.slotCheckSelected,
                    ]}
                  >
                    {selected && (
                      <Text
                        style={
                          styles.slotCheckText
                        }
                      >
                        ✓
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
              )
            },
          )}

        <Text
          style={
            styles.slotDisclaimer
          }
        >
          The selected start time
          is checked again before
          the booking is confirmed.
        </Text>
      </View>
    )
  }

  function renderScheduledDateStep() {
    return (
      <View>
        <Text
          style={
            styles.stepDescription
          }
        >
          Scheduled bookings can
          only be created for
          tomorrow or a later date.
        </Text>

        <SingleDatePicker
          date={
            startDate ??
            new Date(tomorrow)
          }
          minDate={
            new Date(tomorrow)
          }
          onChange={
            onScheduledDateChange
          }
        />
      </View>
    )
  }

  function renderScheduledTimeStep() {
    return (
      <View>
        <Text
          style={
            styles.stepDescription
          }
        >
          Choose the time when the
          service should begin on
          the selected future date.
        </Text>

        <TimeRangePicker
          startTime={startTime}
          endTime={endTime}
          onStartTimeChange={
            onStartTimeChange
          }
          onEndTimeChange={
            onEndTimeChange
          }
          mode="start"
          startHint="Choose the service start time"
        />

        <View
          style={
            styles.contextCard
          }
        >
          <View
            style={
              styles.contextIcon
            }
          >
            <Text
              style={
                styles.contextIconText
              }
            >
              D
            </Text>
          </View>

          <View
            style={
              styles.contextContent
            }
          >
            <Text
              style={
                styles.contextLabel
              }
            >
              Date
            </Text>

            <Text
              style={
                styles.contextValue
              }
            >
              {startDate
                ? formatDateDisplay(
                    startDate,
                  )
                : '—'}
            </Text>

            <Text
              style={
                styles.contextHint
              }
            >
              Tomorrow or later
            </Text>
          </View>
        </View>
      </View>
    )
  }

  function renderRecurringDateStep() {
    return (
      <View>
        <Text
          style={
            styles.stepDescription
          }
        >
          Choose a date range
          beginning tomorrow or
          later.
        </Text>

        <DateRangePicker
          startDate={startDate}
          endDate={endDate}
          excludedDates={
            excludedDates
          }
          minDate={
            new Date(tomorrow)
          }
          onStartDateChange={
            onRecurringDateChange
          }
          onEndDateChange={
            onRecurringEndDateChange
          }
          onExcludedDateToggle={
            onToggleExcludedDate
          }
        />
      </View>
    )
  }

  function renderRecurringWeekdayStep() {
    return (
      <View>
        <Text
          style={
            styles.stepDescription
          }
        >
          Select the days of the
          week on which the service
          should repeat.
        </Text>

        <WeekdaySelector
          selectedWeekdays={
            selectedWeekdays
          }
          onToggleWeekday={
            onToggleWeekday
          }
        />

        {startDate &&
          endDate &&
          recurringOccurrences.length >
            0 && (
            <View
              style={
                styles.previewCard
              }
            >
              <Text
                style={
                  styles.previewTitle
                }
              >
                {
                  recurringOccurrences.length
                }{' '}
                service dates
              </Text>

              <RecurringOccurrencePreview
                occurrences={
                  recurringOccurrences
                }
                startTime={
                  startTime
                }
                endTime={
                  endTime
                }
              />
            </View>
          )}
      </View>
    )
  }

  function renderRecurringTimeStep() {
    return (
      <View>
        <Text
          style={
            styles.stepDescription
          }
        >
          Choose one daily start
          time. The same time
          window is used on each
          selected weekday.
        </Text>

        <TimeRangePicker
          startTime={startTime}
          endTime={endTime}
          onStartTimeChange={
            onStartTimeChange
          }
          onEndTimeChange={
            onEndTimeChange
          }
          mode="start"
          startHint="Choose the service start time"
        />

        <View
          style={
            styles.contextCard
          }
        >
          <View
            style={
              styles.contextIcon
            }
          >
            <Text
              style={
                styles.contextIconText
              }
            >
              W
            </Text>
          </View>

          <View
            style={
              styles.contextContent
            }
          >
            <Text
              style={
                styles.contextLabel
              }
            >
              Selected days
            </Text>

            <Text
              style={
                styles.contextValue
              }
            >
              {selectedWeekdays.length >
              0
                ? selectedWeekdays.join(
                    ', ',
                  )
                : 'Select weekdays first'}
            </Text>
          </View>
        </View>
      </View>
    )
  }

  function renderSummaryStep() {
    const price =
      bookingType === 'instant'
        ? instantPricing
        : pricing

    const priceLoading =
      bookingType === 'instant'
        ? instantPricingLoading
        : pricingLoading

    const priceError =
      bookingType === 'instant'
        ? instantPricingError
        : pricingError

    return (
      <View>
        <View
          style={
            styles.summaryCard
          }
        >
          <View
            style={styles.summaryRow}
          >
            <View
              style={
                styles.summaryIcon
              }
            >
              <Text
                style={
                  styles.summaryIconText
                }
              >
                S
              </Text>
            </View>

            <View
              style={
                styles.summaryMain
              }
            >
              <Text
                style={
                  styles.summaryLabel
                }
              >
                Service
              </Text>

              <Text
                style={
                  styles.summaryValue
                }
              >
                {service.name}
              </Text>
            </View>
          </View>

          <View
            style={
              styles.summaryDivider
            }
          />

          <View
            style={styles.summaryRow}
          >
            <View
              style={
                styles.summaryIcon
              }
            >
              <Text
                style={
                  styles.summaryIconText
                }
              >
                B
              </Text>
            </View>

            <View
              style={
                styles.summaryMain
              }
            >
              <Text
                style={
                  styles.summaryLabel
                }
              >
                Booking type
              </Text>

              <Text
                style={
                  styles.summaryValue
                }
              >
                {
                  METHOD_COPY[
                    bookingType
                  ].title
                }
              </Text>
            </View>
          </View>

          <View
            style={
              styles.summaryDivider
            }
          />

          <View
            style={styles.summaryRow}
          >
            <View
              style={
                styles.summaryIcon
              }
            >
              <Text
                style={
                  styles.summaryIconText
                }
              >
                D
              </Text>
            </View>

            <View
              style={
                styles.summaryMain
              }
            >
              <Text
                style={
                  styles.summaryLabel
                }
              >
                {bookingType ===
                'recurring'
                  ? 'Date range'
                  : 'Date'}
              </Text>

              <Text
                style={
                  styles.summaryValue
                }
              >
                {bookingType ===
                'recurring'
                  ? startDate &&
                    endDate
                    ? `${formatDateDisplay(
                        startDate,
                      )} – ${formatDateDisplay(
                        endDate,
                      )}`
                    : '—'
                  : bookingType ===
                      'instant'
                    ? 'Today'
                    : startDate
                      ? formatDateDisplay(
                          startDate,
                        )
                      : '—'}
              </Text>
            </View>
          </View>

          <View
            style={
              styles.summaryDivider
            }
          />

          <View
            style={styles.summaryRow}
          >
            <View
              style={
                styles.summaryIcon
              }
            >
              <Text
                style={
                  styles.summaryIconText
                }
              >
                T
              </Text>
            </View>

            <View
              style={
                styles.summaryMain
              }
            >
              <Text
                style={
                  styles.summaryLabel
                }
              >
                Time
              </Text>

              <Text
                style={
                  styles.summaryValue
                }
              >
                {startTime.toLocaleTimeString(
                  [],
                  {
                    hour: 'numeric',
                    minute: '2-digit',
                  },
                )}{' '}
                –{' '}
                {endTime.toLocaleTimeString(
                  [],
                  {
                    hour: 'numeric',
                    minute: '2-digit',
                  },
                )}
              </Text>
            </View>
          </View>

          <View
            style={
              styles.summaryDivider
            }
          />

          <View
            style={styles.summaryRow}
          >
            <View
              style={
                styles.summaryIcon
              }
            >
              <Text
                style={
                  styles.summaryIconText
                }
              >
                H
              </Text>
            </View>

            <View
              style={
                styles.summaryMain
              }
            >
              <Text
                style={
                  styles.summaryLabel
                }
              >
                Duration
              </Text>

              <Text
                style={
                  styles.summaryValue
                }
              >
                {durationHours}{' '}
                hour
                {durationHours === 1
                  ? ''
                  : 's'}
              </Text>
            </View>
          </View>

          {bookingType ===
            'recurring' &&
            selectedWeekdays.length >
              0 && (
              <>
                <View
                  style={
                    styles.summaryDivider
                  }
                />

                <View
                  style={styles.summaryRow}
                >
                  <View
                    style={
                      styles.summaryIcon
                    }
                  >
                    <Text
                      style={
                        styles.summaryIconText
                      }
                    >
                      W
                    </Text>
                  </View>

                  <View
                    style={
                      styles.summaryMain
                    }
                  >
                    <Text
                      style={
                        styles.summaryLabel
                      }
                    >
                      Weekdays
                    </Text>

                    <Text
                      style={
                        styles.summaryValue
                      }
                    >
                      {selectedWeekdays.join(
                        ', ',
                      )}
                    </Text>
                  </View>
                </View>
              </>
            )}
        </View>

        <View
          style={
            styles.liveCheckBanner
          }
        >
          <View
            style={
              styles.liveCheckIcon
            }
          >
            <Text
              style={
                styles.liveCheckIconText
              }
            >
              ✓
            </Text>
          </View>

          <View
            style={
              styles.liveCheckContent
            }
          >
            <Text
              style={
                styles.liveCheckTitle
              }
            >
              {bookingType ===
              'instant'
                ? 'Instant availability check'
                : 'Booking ready'}
            </Text>

            <Text
              style={
                styles.liveCheckText
              }
            >
              {bookingType ===
              'instant'
                ? 'Availability will be checked again when the booking is created.'
                : 'Your future booking will be assigned according to the selected schedule.'}
            </Text>
          </View>
        </View>

        {priceLoading && (
          <BookingLoadingState />
        )}

        {priceError && (
          <BookingErrorState
            message={priceError}
          />
        )}

        {!priceLoading &&
          !priceError &&
          price && (
            <BookingPriceSummary
              baseAmount={
                price.gross_amount
              }
              discountAmount={
                price.discount_amount
              }
              serviceDiscountPercent={
                price.service_discount_percent
              }
              serviceDiscountAmount={
                price.service_discount_amount
              }
              discountTierName={
                price.discount_tier_name
              }
              promotionTitle={
                price.promotion_title
              }
              promotionDiscountAmount={
                price.promotion_discount_amount
              }
              recurringDiscountPercent={
                price.recurring_discount_percent
              }
              recurringDiscountAmount={
                price.recurring_discount_amount
              }
              recurringDiscountTierName={
                price.recurring_discount_tier_name
              }
              platformFee={
                price.platform_fee
              }
              taxAmount={
                price.tax_amount
              }
              finalAmount={
                price.final_amount
              }
              currency={
                price.currency
              }
              occurrenceCount={
                price.occurrence_count
              }
              loading={false}
              error={null}
            />
          )}

        {!priceLoading &&
          !priceError &&
          !price && (
            <View
              style={
                styles.waitingPriceCard
              }
            >
              <Text
                style={
                  styles.waitingPriceTitle
                }
              >
                Price unavailable
              </Text>

              <Text
                style={
                  styles.waitingPriceText
                }
              >
                Please check the selected
                booking details again.
              </Text>
            </View>
          )}
      </View>
    )
  }

  function renderFlowContent() {
    switch (flowStep) {
      case 'instant-slot':
        return renderInstantStep()

      case 'scheduled-date':
        return renderScheduledDateStep()

      case 'scheduled-time':
        return renderScheduledTimeStep()

      case 'recurring-date':
        return renderRecurringDateStep()

      case 'recurring-weekdays':
        return renderRecurringWeekdayStep()

      case 'recurring-time':
        return renderRecurringTimeStep()

      case 'duration':
        return renderDurationStep()

      case 'summary':
        return renderSummaryStep()
    }
  }

  const priceForFooter =
    bookingType === 'instant'
      ? instantPricing
      : pricing

  const summaryButtonDisabled =
    flowStep === 'summary' &&
    !priceForFooter

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView
  edges={['top', 'bottom']}
  style={styles.flowModal}
>
        <View
          style={styles.flowHeader}
        >
          <TouchableOpacity
            style={
              styles.headerAction
            }
            onPress={onBack}
          >
            <CustomerIcon
              name="chevron-left"
              size={22}
              color="#17354A"
            />
          </TouchableOpacity>

          <View
            style={
              styles.flowHeaderCenter
            }
          >
            <Text
              style={styles.flowTitle}
            >
              {
                METHOD_COPY[
                  bookingType
                ].title
              }{' '}
              Booking
            </Text>

            <Text
              style={
                styles.flowStepLabel
              }
            >
              Step {stepNumber} of{' '}
              {stepCount}
            </Text>
          </View>

          <TouchableOpacity
            style={
              styles.headerAction
            }
            onPress={onClose}
          >
            <CustomerIcon
              name="close"
              size={18}
              color="#17354A"
            />
          </TouchableOpacity>
        </View>

        <View
          style={
            styles.progressTrack
          }
        >
          <View
            style={[
              styles.progressFill,
              {
                width:
                  stepProgress,
              },
            ]}
          />
        </View>

        <ScrollView
          contentContainerStyle={
            styles.flowContent
          }
          showsVerticalScrollIndicator={
            false
          }
        >
          <Text
            style={styles.flowEyebrow}
          >
            {
              METHOD_COPY[
                bookingType
              ].eyebrow
            }
          </Text>

          <Text
            style={
              styles.flowStepTitle
            }
          >
            {getStepTitle(flowStep)}
          </Text>

          <Text
            style={
              styles.flowServiceName
            }
          >
            {service.name}
          </Text>

          {renderFlowContent()}

          <View
            style={styles.flowSpacer}
          />
        </ScrollView>

        <View
          style={styles.flowFooter}
        >
          {flowStep ===
            'summary' && (
            <View
              style={
                styles.footerMiniSummary
              }
            >
              <View>
                <Text
                  style={
                    styles.footerMiniLabel
                  }
                >
                  {bookingType ===
                  'instant'
                    ? 'Instant booking'
                    : 'Booking'}
                </Text>

                <Text
                  style={
                    styles.footerMiniValue
                  }
                >
                  {durationHours}{' '}
                  hour
                  {durationHours === 1
                    ? ''
                    : 's'}
                </Text>
              </View>

              <Text
                style={
                  styles.footerPrice
                }
              >
                {priceForFooter?.currency ??
                  ''}
                {priceForFooter
                  ?.final_amount !=
                null
                  ? priceForFooter.final_amount.toFixed(
                      2,
                    )
                  : '—'}
              </Text>
            </View>
          )}

          <TouchableOpacity
            activeOpacity={0.88}
            disabled={
              !canContinueStep ||
              summaryButtonDisabled
            }
            onPress={onNext}
            style={[
              styles.primaryButton,
              (!canContinueStep ||
                summaryButtonDisabled) &&
                styles.primaryButtonDisabled,
            ]}
          >
            <Text
              style={
                styles.primaryButtonText
              }
            >
              {flowStep ===
              'summary'
                ? 'Continue to Review'
                : 'Continue'}
            </Text>

            <CustomerIcon
              name="arrow-right"
              size={16}
              color="#FFFFFF"
            />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
</Modal>
  )
}