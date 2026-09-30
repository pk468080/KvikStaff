import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useEffect, useState } from 'react'
import type {
  BookingType,
} from '../../types/booking'
import { ScreenContainer } from '../../components/layout/ScreenContainer'
import BookingPriceSummary from '../../components/booking/BookingPriceSummary'
import BookingSection from '../../components/booking/BookingSection'
import RecurringOccurrencePreview from '../../components/booking/RecurringOccurrencePreview'

import {
  calculateInstantBookingPrice,
  calculateMultiOccurrenceBookingPrice,
  type BookingPriceResult,
} from '../../services/booking/bookingPricing.service'

import {
  getWeekdayIndex,
  generateRecurringOccurrences,
  formatDateDisplay,
  formatTimeDisplay,
  toDateString,
  toTimeString,
} from '../../lib/bookingUtils'

import type { HomeService } from '../../types/service'

const tempStaffLogo = require('../../assets/branding/tempstuff-logo.png')

type BookingDetailsScreenProps = {
  service: HomeService
 bookingType: BookingType
  location: {
    latitude: number
    longitude: number
    address: string
  } | null
  startDate: Date | null
  endDate: Date | null
  startTime: Date
  endTime: Date
  selectedWeekdays: string[]
  excludedDates: string[]
  onContinue?: () => Promise<void> | void
}

export default function BookingDetailsScreen({
  service,
  bookingType,
  location,
  startDate,
  endDate,
  startTime,
  endTime,
  selectedWeekdays,
  excludedDates,
  onContinue,
}: BookingDetailsScreenProps) {
  const [pricing, setPricing] =
    useState<BookingPriceResult | null>(null)

  const [pricingError, setPricingError] =
    useState<string | null>(null)

  const [pricingLoading, setPricingLoading] =
    useState(false)

  const [submitting, setSubmitting] =
    useState(false)

  const [submitError, setSubmitError] =
    useState<string | null>(null)

  const recurringOccurrences =
    selectedWeekdays.length > 0 &&
    startDate &&
    endDate
      ? generateRecurringOccurrences(
          startDate,
          endDate,
          selectedWeekdays
            .map(w => getWeekdayIndex(w))
            .filter(i => i >= 0),
          excludedDates,
        )
      : []

  const durationHours =
    Math.round(
      ((endTime.getTime() -
        startTime.getTime()) /
        (60 * 60 * 1000)) *
        10,
    ) / 10

  async function handleContinue() {
    if (!onContinue || submitting) {
      return
    }

    if (
      !pricing ||
      pricing.final_amount == null
    ) {
      setSubmitError(
        'A valid booking price is required before continuing.',
      )
      return
    }

    setSubmitError(null)
    setSubmitting(true)

    try {
      await onContinue()
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : 'Unable to create the booking.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    async function loadPrice() {
      setPricing(null)
      setPricingError(null)

      if (durationHours < 1) {
        setPricingError(
          'Booking duration must be at least 1 hour.',
        )
        return
      }

      setPricingLoading(true)

      try {
        if (bookingType === 'instant') {
          const result =
            await calculateInstantBookingPrice(
              service.serviceVariantId,
              durationHours,
            )

          if (cancelled) {
            return
          }

          setPricing(result)
          return
        }

        if (!startDate || !endDate) {
          return
        }

        if (
          bookingType === 'recurring' &&
          selectedWeekdays.length === 0
        ) {
          return
        }

        const toDateString = (d: Date) => {
          const year = d.getFullYear()

          const month = String(
            d.getMonth() + 1,
          ).padStart(2, '0')

          const day = String(
            d.getDate(),
          ).padStart(2, '0')

          return `${year}-${month}-${day}`
        }

        const toTimeString = (d: Date) => {
          const hours = String(
            d.getHours(),
          ).padStart(2, '0')

          const minutes = String(
            d.getMinutes(),
          ).padStart(2, '0')

          const seconds = String(
            d.getSeconds(),
          ).padStart(2, '0')

          return `${hours}:${minutes}:${seconds}`
        }

        const weekdayIndexes =
          bookingType === 'scheduled'
            ? [0, 1, 2, 3, 4, 5, 6]
            : selectedWeekdays
                .map(w => getWeekdayIndex(w))
                .filter(i => i >= 0)

        const result =
          await calculateMultiOccurrenceBookingPrice(
            {
              serviceVariantId:
                service.serviceVariantId,

              startDate:
                toDateString(startDate),

              endDate:
                toDateString(endDate),

              startTime:
                toTimeString(startTime),

              endTime:
                toTimeString(endTime),

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
            : 'Unable to calculate booking price.',
        )
      } finally {
        if (!cancelled) {
          setPricingLoading(false)
        }
      }
    }

    void loadPrice()

    return () => {
      cancelled = true
    }
  }, [
    bookingType,
    service.serviceVariantId,
    startDate,
    endDate,
    startTime,
    endTime,
    selectedWeekdays,
    excludedDates,
    durationHours,
  ])

  return (
    <ScreenContainer>
      <ScrollView
        contentContainerStyle={
          styles.content
        }
        showsVerticalScrollIndicator={
          false
        }
      >
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <Image
              source={tempStaffLogo}
              style={styles.brandLogo}
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
              REVIEW
            </Text>
          </View>

          <View style={styles.headerTop}>
            <View
              style={
                styles.stepBadge
              }
            >
              <Text
                style={
                  styles.stepBadgeText
                }
              >
                2
              </Text>
            </View>

            <View
              style={
                styles.headerText
              }
            >
              <Text
                style={
                  styles.eyebrow
                }
              >
                FINAL CHECK
              </Text>

              <Text
                style={
                  styles.title
                }
              >
                Review booking
              </Text>
            </View>
          </View>

          <View
            style={
              styles.progressTrack
            }
          >
            <View
              style={[
                styles.progressFill,
                { width: '50%' },
              ]}
            />
          </View>

          <View
            style={
              styles.progressLabels
            }
          >
            <Text
              style={
                styles.progressLabel
              }
            >
              Booking
            </Text>

            <Text
              style={
                styles.progressActive
              }
            >
              Review
            </Text>

            <Text
              style={
                styles.progressLabel
              }
            >
              Payment
            </Text>

            <Text
              style={
                styles.progressLabel
              }
            >
              Confirmation
            </Text>
          </View>
        </View>

        <View
          style={
            styles.serviceHero
          }
        >
          <View
            style={
              styles.serviceImageWrap
            }
          >
            {service.imageUrl ? (
              <Image
                source={{
                  uri: service.imageUrl,
                }}
                style={
                  styles.serviceImage
                }
                resizeMode="cover"
              />
            ) : (
              <View
                style={
                  styles.serviceImageFallback
                }
              >
                <Text
                  style={
                    styles.serviceImageFallbackText
                  }
                >
                  {service.name
                    .trim()
                    .charAt(0)
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
                styles.serviceEyebrow
              }
            >
              SELECTED SERVICE
            </Text>

            <Text
              style={
                styles.serviceHeroName
              }
            >
              {service.name}
            </Text>

            <Text
              style={
                styles.serviceHeroRate
              }
            >
              {service.hourlyPrice ==
              null
                ? 'Rate unavailable'
                : `${service.currency ?? ''} ${service.hourlyPrice}/hour`}
            </Text>
          </View>
        </View>

        <BookingSection title="Service">
          <DetailRow
            label="Service name"
            value={
              service.name
            }
          />

          <DetailRow
            label="Booking type"
            value={
              bookingType
                .charAt(0)
                .toUpperCase() +
              bookingType.slice(1)
            }
          />

          <DetailRow
            label="Hourly rate"
            value={
              service.hourlyPrice ===
              null
                ? 'Unavailable'
                : `${service.currency ?? ''} ${service.hourlyPrice}/hour`
            }
          />
        </BookingSection>

        <BookingSection title="Location">
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
              <Text
                style={
                  styles.locationIconText
                }
              >
                ⌖
              </Text>
            </View>

            <View
              style={
                styles.locationContent
              }
            >
              <Text
                style={
                  styles.locationEyebrow
                }
              >
                SERVICE LOCATION
              </Text>

              <Text
                style={
                  styles.address
                }
              >
                {location?.address ??
                  'No location selected'}
              </Text>
            </View>
          </View>
        </BookingSection>

        <BookingSection title="Schedule">
          <DetailRow
            label="Start time"
            value={formatTimeDisplay(
              startTime,
            )}
          />

          <DetailRow
            label="End time"
            value={formatTimeDisplay(
              endTime,
            )}
          />

          <DetailRow
            label="Duration"
            value={`${durationHours} hour${
              durationHours === 1
                ? ''
                : 's'
            }`}
          />

          {bookingType !==
            'instant' && (
            <>
              <DetailRow
                label="Start date"
                value={formatDateDisplay(
                  startDate,
                )}
              />

              <DetailRow
                label="End date"
                value={formatDateDisplay(
                  endDate,
                )}
              />
            </>
          )}

          {bookingType ===
            'recurring' && (
            <>
              <DetailRow
                label="Weekdays"
                value={
                  selectedWeekdays.join(
                    ', ',
                  ) ||
                  'None'
                }
              />

              {excludedDates.length >
                0 && (
                <DetailRow
                  label="Excluded dates"
                  value={excludedDates.join(
                    ', ',
                  )}
                />
              )}
            </>
          )}
        </BookingSection>

        {bookingType ===
          'recurring' &&
          recurringOccurrences.length >
            0 && (
            <BookingSection
              title="Service occurrences"
            >
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
            </BookingSection>
          )}

        <View
          style={
            styles.priceIntro
          }
        >
          <View>
            <Text
              style={
                styles.priceIntroEyebrow
              }
            >
              BOOKING TOTAL
            </Text>

            <Text
              style={
                styles.priceIntroTitle
              }
            >
              Transparent pricing
            </Text>
          </View>

          <View
            style={
              styles.priceIntroBadge
            }
          >
            <Text
              style={
                styles.priceIntroBadgeText
              }
            >
              SECURE
            </Text>
          </View>
        </View>

        <BookingSection title="Pricing">
          <BookingPriceSummary
            baseAmount={
              pricing?.gross_amount
            }

            discountAmount={
              pricing?.discount_amount
            }

            serviceDiscountPercent={
              pricing?.service_discount_percent
            }

            serviceDiscountAmount={
              pricing?.service_discount_amount
            }

            discountTierName={
              pricing?.discount_tier_name
            }

            promotionTitle={
              pricing?.promotion_title
            }

            promotionDiscountAmount={
              pricing?.promotion_discount_amount
            }

            recurringDiscountPercent={
              pricing?.recurring_discount_percent
            }

            recurringDiscountAmount={
              pricing?.recurring_discount_amount
            }

            recurringDiscountTierName={
              pricing?.recurring_discount_tier_name
            }

            platformFee={
              pricing?.platform_fee
            }

            taxAmount={
              pricing?.tax_amount ??
              pricing?.tax
            }

            finalAmount={
              pricing?.final_amount
            }

            currency={
              pricing?.currency
            }

            occurrenceCount={
              pricing?.occurrence_count
            }

            loading={
              pricingLoading
            }

            error={
              pricingError
            }
          />
        </BookingSection>

        {submitError && (
          <View
            style={
              styles.errorContainer
            }
          >
            <Text
              style={
                styles.errorTitle
              }
            >
              Unable to continue
            </Text>

            <Text
              style={
                styles.errorText
              }
            >
              {submitError}
            </Text>
          </View>
        )}

        <View
          style={
            styles.spacer
          }
        />
      </ScrollView>

      <View
        style={
          styles.footer
        }
      >
        <TouchableOpacity
          style={[
            styles.continueButton,
            (
              pricingLoading ||
              Boolean(
                pricingError,
              ) ||
              !pricing ||
              pricing.final_amount ==
                null ||
              submitting
            ) &&
              styles.continueButtonDisabled,
          ]}
          disabled={
            pricingLoading ||
            Boolean(
              pricingError,
            ) ||
            !pricing ||
            pricing.final_amount ==
              null ||
            submitting
          }
          onPress={
            handleContinue
          }
        >
          {submitting ? (
            <ActivityIndicator
              color="#FFFFFF"
            />
          ) : (
            <Text
              style={
                styles.continueButtonText
              }
            >
              Continue to Payment
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </ScreenContainer>
  )
}

function DetailRow({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <View
      style={
        styles.row
      }
    >
      <Text
        style={
          styles.rowLabel
        }
      >
        {label}
      </Text>

      <Text
        style={
          styles.rowValue
        }
      >
        {value}
      </Text>
    </View>
  )
}

const styles =
  StyleSheet.create({
    content: {
  paddingHorizontal: 20,
  paddingBottom: 120,
},

    header: {
  paddingTop: 10,
  paddingBottom: 14,
  backgroundColor:
    '#FFFFFF',
},

    brandRow: {
      flexDirection:
        'row',
      alignItems:
        'center',
      marginBottom: 12,
    },

    brandLogo: {
      width: 92,
      height: 28,
    },

    brandDivider: {
      width: 1,
      height: 18,
      marginHorizontal: 10,
      backgroundColor:
        '#D8E8ED',
    },

    brandCaption: {
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 1.2,
      color: '#5E7C8B',
    },

    headerTop: {
      flexDirection:
        'row',
      alignItems:
        'center',
      gap: 12,
    },

    stepBadge: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems:
        'center',
      justifyContent:
        'center',
      backgroundColor:
        '#062F52',
    },

    stepBadgeText: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '800',
    },

    headerText: {
      flex: 1,
    },

    eyebrow: {
      fontSize: 10,
      lineHeight: 14,
      fontWeight: '800',
      letterSpacing: 1.1,
      color: '#6B8795',
    },

    title: {
  marginTop: 2,
  fontSize: 22,
  lineHeight: 28,
  fontWeight: '800',
  color: '#062F52',
},
    progressTrack: {
      height: 4,
      marginTop: 16,
      borderRadius: 2,
      backgroundColor:
        '#E5E7EB',
      overflow: 'hidden',
    },

    progressFill: {
      height: '100%',
      borderRadius: 2,
      backgroundColor:
        '#00A7A7',
    },

    progressLabels: {
      flexDirection:
        'row',
      justifyContent:
        'space-between',
      marginTop: 7,
    },

    progressActive: {
      fontSize: 10,
      fontWeight: '800',
      color: '#062F52',
    },

    progressLabel: {
      fontSize: 10,
      fontWeight: '600',
      color: '#9CA3AF',
    },

    serviceHero: {
  flexDirection:
    'row',
  alignItems:
    'center',
  marginTop: 2,
  marginBottom: 18,
  padding: 15,
  borderRadius: 18,
  backgroundColor:
    '#062F52',
},

    serviceImageWrap: {
      width: 64,
      height: 64,
      marginRight: 14,
      borderRadius: 18,
      overflow: 'hidden',
      backgroundColor:
        '#FFFFFF',
    },

    serviceImage: {
      width: '100%',
      height: '100%',
    },

    serviceImageFallback: {
      flex: 1,
      alignItems:
        'center',
      justifyContent:
        'center',
      backgroundColor:
        '#EAF7F7',
    },

    serviceImageFallbackText: {
      fontSize: 22,
      fontWeight: '800',
      color: '#062F52',
    },

    serviceHeroContent: {
      flex: 1,
    },

    serviceEyebrow: {
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 0.9,
      color: '#8FB6C8',
    },

    serviceHeroName: {
      marginTop: 2,
      fontSize: 18,
      lineHeight: 23,
      fontWeight: '800',
      color: '#FFFFFF',
    },

    serviceHeroRate: {
      marginTop: 4,
      fontSize: 13,
      fontWeight: '700',
      color: '#FFFFFF',
    },

    row: {
  flexDirection:
    'row',
  alignItems:
    'flex-start',
  paddingVertical: 11,
  borderBottomWidth: 1,
  borderBottomColor:
    '#EAF1F4',
  columnGap: 16,
},

    rowLabel: {
  width: '40%',
  fontSize: 12.5,
  lineHeight: 18,
  color: '#6B8795',
  fontWeight: '600',
},

    rowValue: {
  flex: 1,
  textAlign:
    'right',
  fontSize: 13.5,
  lineHeight: 19,
  fontWeight: '700',
  color: '#062F52',
},

    locationCard: {
      flexDirection:
        'row',
      alignItems:
        'center',
      padding: 13,
      borderRadius: 15,
      backgroundColor:
        '#F5FBFC',
      borderWidth: 1,
      borderColor:
        '#DDECEF',
    },

    locationIcon: {
      width: 38,
      height: 38,
      borderRadius: 12,
      alignItems:
        'center',
      justifyContent:
        'center',
      backgroundColor:
        '#E3F5F5',
      marginRight: 11,
    },

    locationIconText: {
      fontSize: 23,
      lineHeight: 25,
      fontWeight: '800',
      color: '#174C68',
    },

    locationContent: {
      flex: 1,
    },

    locationEyebrow: {
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 0.8,
      color: '#5E7C8B',
    },

    address: {
      marginTop: 3,
      fontSize: 14,
      lineHeight: 20,
      color: '#062F52',
      fontWeight: '600',
    },

   priceIntro: {
  flexDirection:
    'row',
  alignItems:
    'center',
  justifyContent:
    'space-between',
  marginBottom: 10,
  padding: 14,
  borderRadius: 15,
  backgroundColor:
    '#EAF7F7',
},

    priceIntroEyebrow: {
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 0.8,
      color: '#087F72',
    },

    priceIntroTitle: {
      marginTop: 2,
      fontSize: 14,
      fontWeight: '800',
      color: '#062F52',
    },

    priceIntroBadge: {
      paddingHorizontal: 9,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor:
        '#DDF7F0',
    },

    priceIntroBadgeText: {
      fontSize: 9,
      fontWeight: '800',
      color: '#087F72',
    },
errorContainer: {
  marginVertical: 16,
  padding: 14,
  borderRadius: 14,
  backgroundColor:
    '#FFF4F4',
  borderWidth: 1,
  borderColor:
    '#F4C7C7',
},

    errorTitle: {
      fontSize: 14,
      fontWeight: '800',
      color: '#991B1B',
    },

    errorText: {
      marginTop: 6,
      fontSize: 13,
      lineHeight: 18,
      color: '#B91C1C',
    },

    spacer: {
      height: 20,
    },

    footer: {
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 14,
      backgroundColor:
        '#FFFFFF',
      borderTopWidth: 1,
      borderTopColor:
        '#DDECEF',
    },

    continueButton: {
      minHeight: 52,
      paddingHorizontal: 18,
      borderRadius: 16,
      backgroundColor:
        '#00A7A7',
      alignItems:
        'center',
      justifyContent:
        'center',
    },

    continueButtonDisabled: {
      backgroundColor:
        '#CBD5E1',
    },

    continueButtonText: {
      fontSize: 15,
      fontWeight: '800',
      color: '#FFFFFF',
    },
  })