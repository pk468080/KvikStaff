import {
  useCallback,
  useEffect,
  useState,
} from 'react'

import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import {
  Ionicons,
} from '@expo/vector-icons'

import {
  AppButton,
} from '../../components/ui/AppButton'

import {
  ScreenContainer,
} from '../../components/layout/ScreenContainer'

import ErrorState from '../../components/ui/ErrorState'

import {
  UI,
} from '../../constants/ui'

import {
  useWorkerRuntime,
} from '../../context/WorkerRuntimeContext'

import {
  getWorkerBooking,
} from '../../services/bookings/workerBookings.service'

import {
  getWorkerBookingContext,
  type WorkerBookingContext,
} from '../../services/bookings/workerBookingContext.service'

import {
  getWorkerBookingOffers,
  getWorkerBookingOfferRemainingSeconds,
  isWorkerBookingOfferPending,
  respondToWorkerBookingOffer,
  type WorkerBookingOffer,
} from '../../services/bookings/workerBookingOffers.service'

import {
  formatBookingAmount,
  formatBookingDateTime,
  getBookingDurationHours,
  getBookingStatusLabel,
  getBookingTypeLabel,
} from '../../lib/workerBookingUtils'

import type {
  BookingStatus,
  WorkerBooking,
} from '../../types/booking'

type BookingOfferScreenProps = {
  bookingId: string
  onBack?: () => void
  onAccepted?: (bookingId: string) => void
}

function formatRemainingTime(
  totalSeconds: number,
): string {
  const safeSeconds =
    Math.max(
      0,
      totalSeconds,
    )

  const minutes =
    Math.floor(
      safeSeconds / 60,
    )

  const seconds =
    safeSeconds % 60

  return `${minutes}:${seconds
    .toString()
    .padStart(2, '0')}`
}

function formatDuration(
  booking: WorkerBooking,
): string {
  const hours =
    getBookingDurationHours(
      booking,
    )

  if (
    hours === null
  ) {
    return `${booking.durationValue} ${booking.durationUnit}`
  }

  return `${booking.durationValue} ${booking.durationUnit} · ${hours}h`
}

function getOfferStatusLabel(
  status: WorkerBookingOffer['status'],
): string {
  switch (status) {
    case 'pending':
      return 'Awaiting your response'

    case 'accepted':
      return 'Booking accepted'

    case 'declined':
      return 'Offer declined'

    case 'expired':
      return 'Offer expired'

    case 'cancelled':
      return 'Offer cancelled'

    default:
      return status
  }
}

function getOfferStatusIcon(
  status: WorkerBookingOffer['status'],
): keyof typeof Ionicons.glyphMap {
  switch (status) {
    case 'accepted':
      return 'checkmark-circle'

    case 'declined':
      return 'close-circle'

    case 'expired':
      return 'time-outline'

    case 'cancelled':
      return 'ban-outline'

    case 'pending':
    default:
      return 'briefcase-outline'
  }
}

function getOfferStatusColor(
  status: WorkerBookingOffer['status'],
): string {
  switch (status) {
    case 'accepted':
      return UI.colors.success

    case 'declined':
    case 'expired':
    case 'cancelled':
      return UI.colors.error

    case 'pending':
    default:
      return UI.colors.secondary
  }
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap
  label: string
  value: string
}) {
  return (
    <View
      style={
        styles.detailRow
      }
    >
      <View
        style={
          styles.detailIcon
        }
      >
        <Ionicons
          name={icon}
          size={18}
          color={
            UI.colors.secondary
          }
        />
      </View>

      <View
        style={
          styles.detailCopy
        }
      >
        <Text
          style={
            styles.detailLabel
          }
        >
          {label}
        </Text>

        <Text
          style={
            styles.detailValue
          }
        >
          {value}
        </Text>
      </View>
    </View>
  )
}

function SectionHeader({
  eyebrow,
  title,
}: {
  eyebrow: string
  title: string
}) {
  return (
    <View
      style={
        styles.sectionHeader
      }
    >
      <Text
        style={
          styles.sectionEyebrow
        }
      >
        {eyebrow}
      </Text>

      <Text
        style={
          styles.sectionTitle
        }
      >
        {title}
      </Text>
    </View>
  )
}

export default function BookingOfferScreen({
  bookingId,
  onBack,
  onAccepted,
}: BookingOfferScreenProps) {
  const {
    offerRevision,
  } = useWorkerRuntime()

  const [
    offer,
    setOffer,
  ] = useState<WorkerBookingOffer | null>(
    null,
  )

  const [
    booking,
    setBooking,
  ] = useState<WorkerBooking | null>(
    null,
  )

  const [
    context,
    setContext,
  ] = useState<WorkerBookingContext | null>(
    null,
  )

  const [
    loading,
    setLoading,
  ] = useState(true)

  const [
    refreshing,
    setRefreshing,
  ] = useState(false)

  const [
    responding,
    setResponding,
  ] = useState(false)

  const [
    remainingSeconds,
    setRemainingSeconds,
  ] = useState(0)

  const [
    error,
    setError,
  ] = useState<string | null>(
    null,
  )

  const [
    detailsError,
    setDetailsError,
  ] = useState<string | null>(
    null,
  )

  const loadOffer =
    useCallback(
      async (
        isRefresh = false,
      ): Promise<void> => {
        if (isRefresh) {
          setRefreshing(true)
        } else {
          setLoading(true)
        }

        setError(null)
        setDetailsError(null)

        try {
          const offers =
            await getWorkerBookingOffers()

          const matchingOffer =
            offers.find(
              item =>
                item.bookingId ===
                  bookingId &&
                (
                  item.status ===
                    'pending' ||
                  item.status ===
                    'accepted' ||
                  item.status ===
                    'declined' ||
                  item.status ===
                    'expired' ||
                  item.status ===
                    'cancelled'
                ),
            )

          if (!matchingOffer) {
            throw new Error(
              'Booking offer not found for this worker account.',
            )
          }

          setOffer(
            matchingOffer,
          )

          setRemainingSeconds(
            getWorkerBookingOfferRemainingSeconds(
              matchingOffer,
            ),
          )

          /*
           * Booking details and privacy-safe customer/location
           * context are loaded separately from the offer itself.
           *
           * No customer phone or internal worker information is
           * requested.
           */
          try {
            const nextBooking =
              await getWorkerBooking(
                bookingId,
              )

            setBooking(
              nextBooking,
            )

            if (
              nextBooking
            ) {
              try {
                const nextContext =
                  await getWorkerBookingContext(
                    bookingId,
                  )

                setContext(
                  nextContext,
                )
              } catch (cause) {
                setContext(
                  null,
                )

                setDetailsError(
                  cause instanceof Error
                    ? cause.message
                    : 'Some job details are temporarily unavailable.',
                )
              }
            }
          } catch (cause) {
            setBooking(
              null,
            )

            setContext(
              null,
            )

            setDetailsError(
              cause instanceof Error
                ? cause.message
                : 'Job details are temporarily unavailable.',
            )
          }
        } catch (cause) {
          setError(
            cause instanceof Error
              ? cause.message
              : 'Unable to load the booking offer.',
          )
        } finally {
          setLoading(false)
          setRefreshing(false)
        }
      },
      [
        bookingId,
      ],
    )

  useEffect(() => {
    void loadOffer()
  }, [
    loadOffer,
  ])

  useEffect(() => {
    if (
      offerRevision === 0 ||
      responding
    ) {
      return
    }

    void loadOffer(true)
  }, [
    offerRevision,
    responding,
    loadOffer,
  ])

  useEffect(() => {
    if (!offer) {
      return
    }

    if (
      !isWorkerBookingOfferPending(
        offer,
      )
    ) {
      setRemainingSeconds(
        0,
      )

      return
    }

    const interval =
      setInterval(
        () => {
          setRemainingSeconds(
            getWorkerBookingOfferRemainingSeconds(
              offer,
            ),
          )
        },
        1000,
      )

    return () => {
      clearInterval(
        interval,
      )
    }
  }, [
    offer,
  ])

  const handleResponse =
    useCallback(
      async (
        response:
          | 'accept'
          | 'decline',
      ): Promise<void> => {
        if (!offer) {
          return
        }

        if (
          !isWorkerBookingOfferPending(
            offer,
          )
        ) {
          setError(
            'This booking offer is no longer available.',
          )

          return
        }

        setResponding(true)
        setError(null)

        try {
          const result =
            await respondToWorkerBookingOffer(
              offer.id,
              response,
            )

          if (
            !result.success
          ) {
            throw new Error(
              result.error ||
                'Booking offer response could not be processed.',
            )
          }

          const respondedAt =
            new Date().toISOString()

          const nextStatus =
            response ===
            'accept'
              ? 'accepted'
              : 'declined'

          setOffer(
            current =>
              current
                ? {
                    ...current,
                    status:
                      nextStatus,
                    respondedAt,
                    updatedAt:
                      respondedAt,
                  }
                : current,
          )

          setRemainingSeconds(
            0,
          )

          if (
            response ===
            'accept'
          ) {
            onAccepted?.(
              result.bookingId ||
                bookingId,
            )
          }
        } catch (cause) {
          setError(
            cause instanceof Error
              ? cause.message
              : 'Unable to respond to the booking offer.',
          )
        } finally {
          setResponding(false)
        }
      },
      [
        bookingId,
        offer,
        onAccepted,
      ],
    )

  const confirmAccept =
    useCallback(() => {
      Alert.alert(
        'Accept booking?',
        'Accepting this offer assigns the booking to you and opens the active job workflow.',
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Accept',
            onPress: () => {
              void handleResponse(
                'accept',
              )
            },
          },
        ],
      )
    }, [
      handleResponse,
    ])

  const confirmDecline =
    useCallback(() => {
      Alert.alert(
        'Decline booking?',
        'This offer will no longer be available to you.',
        [
          {
            text: 'Keep offer',
            style: 'cancel',
          },
          {
            text: 'Decline',
            style: 'destructive',
            onPress: () => {
              void handleResponse(
                'decline',
              )
            },
          },
        ],
      )
    }, [
      handleResponse,
    ])

  if (loading) {
    return (
      <ScreenContainer>
        <View
          style={
            styles.loadingContainer
          }
        >
          <ActivityIndicator
            size="large"
            color={
              UI.colors.secondary
            }
          />

          <Text
            style={
              styles.loadingTitle
            }
          >
            Loading new job
          </Text>

          <Text
            style={
              styles.loadingText
            }
          >
            Getting the latest assignment details.
          </Text>
        </View>
      </ScreenContainer>
    )
  }

  if (
    error &&
    !offer
  ) {
    return (
      <ScreenContainer>
        <ErrorState
          title="Offer unavailable"
          message={
            error
          }
          onAction={() => {
            void loadOffer()
          }}
        />
      </ScreenContainer>
    )
  }

  if (!offer) {
    return (
      <ScreenContainer>
        <ErrorState
          title="Offer unavailable"
          message="The requested booking offer could not be loaded."
          onAction={() => {
            void loadOffer()
          }}
        />
      </ScreenContainer>
    )
  }

  const isPending =
    isWorkerBookingOfferPending(
      offer,
    )

  const displayedSeconds =
    isPending
      ? remainingSeconds
      : 0

  const isExpired =
    isPending &&
    displayedSeconds <= 0

  const statusColor =
    getOfferStatusColor(
      offer.status,
    )

  return (
    <ScreenContainer>
      <ScrollView
        contentContainerStyle={
          styles.content
        }
        refreshControl={
          <RefreshControl
            refreshing={
              refreshing
            }
            onRefresh={() => {
              void loadOffer(
                true,
              )
            }}
            tintColor={
              UI.colors.secondary
            }
          />
        }
        showsVerticalScrollIndicator={
          false
        }
      >
        <View
          style={
            styles.topBar
          }
        >
          <View
            style={
              styles.topBarLeft
            }
          >
            {onBack ? (
              <AppButton
                title="Back"
                variant="secondary"
                onPress={
                  onBack
                }
              />
            ) : null}
          </View>

          <View
            style={
              styles.topBarCenter
            }
          >
            <Text
              style={
                styles.topBarEyebrow
              }
            >
              KvikStaff
            </Text>

            <Text
              style={
                styles.topBarTitle
              }
            >
              New job
            </Text>
          </View>

          <View
            style={
              styles.topBarRight
            }
          />
        </View>

        {error ? (
          <View
            style={
              styles.warningBox
            }
          >
            <Ionicons
              name="alert-circle-outline"
              size={20}
              color={
                UI.colors.warning
              }
            />

            <View
              style={
                styles.warningCopy
              }
            >
              <Text
                style={
                  styles.warningTitle
                }
              >
                Offer update
              </Text>

              <Text
                style={
                  styles.warningText
                }
              >
                {error}
              </Text>
            </View>
          </View>
        ) : null}

        <View
          style={
            styles.heroCard
          }
        >
          <View
            style={[
              styles.heroIcon,
              {
                backgroundColor:
                  UI.colors.infoBackground,
              },
            ]}
          >
            <Ionicons
              name={
                getOfferStatusIcon(
                  offer.status,
                )
              }
              size={28}
              color={
                statusColor
              }
            />
          </View>

          <Text
            style={
              styles.heroEyebrow
            }
          >
            JOB OFFER
          </Text>

          <Text
            style={
              styles.heroTitle
            }
          >
            {isPending
              ? 'A new job is waiting'
              : getOfferStatusLabel(
                  offer.status,
                )}
          </Text>

          {booking ? (
            <Text
              style={
                styles.heroService
              }
            >
              {context?.serviceName ||
                'Service booking'}
            </Text>
          ) : (
            <Text
              style={
                styles.heroService
              }
            >
              Service booking
            </Text>
          )}

          {isPending ? (
            <View
              style={
                styles.timerCard
              }
            >
              <View
                style={
                  styles.timerIcon
                }
              >
                <Ionicons
                  name="time-outline"
                  size={20}
                  color={
                    UI.colors.secondary
                  }
                />
              </View>

              <View
                style={
                  styles.timerCopy
                }
              >
                <Text
                  style={
                    styles.timerLabel
                  }
                >
                  RESPONSE TIME
                </Text>

                <Text
                  style={
                    styles.timerValue
                  }
                >
                  {isExpired
                    ? '0:00'
                    : formatRemainingTime(
                        displayedSeconds,
                      )}
                </Text>
              </View>

              <View
                style={
                  isExpired
                    ? styles.timerStatusExpired
                    : styles.timerStatus
                }
              >
                <Text
                  style={
                    isExpired
                      ? styles.timerStatusTextExpired
                      : styles.timerStatusText
                  }
                >
                  {isExpired
                    ? 'Expired'
                    : 'Respond soon'}
                </Text>
              </View>
            </View>
          ) : null}
        </View>

        {detailsError ? (
          <View
            style={
              styles.warningBox
            }
          >
            <Ionicons
              name="information-circle-outline"
              size={20}
              color={
                UI.colors.secondary
              }
            />

            <View
              style={
                styles.warningCopy
              }
            >
              <Text
                style={
                  styles.warningTitle
                }
              >
                Some details unavailable
              </Text>

              <Text
                style={
                  styles.warningText
                }
              >
                {detailsError}
              </Text>
            </View>
          </View>
        ) : null}

        {booking ? (
          <>
            <View
              style={
                styles.section
              }
            >
              <SectionHeader
                eyebrow="JOB DETAILS"
                title="What you are accepting"
              />

              <View
                style={
                  styles.card
                }
              >
                {context?.customerName ? (
                  <>
                    <DetailRow
                      icon="person-outline"
                      label="Customer"
                      value={
                        context.customerName
                      }
                    />

                    <View
                      style={
                        styles.divider
                      }
                    />
                  </>
                ) : null}

                <DetailRow
                  icon="briefcase-outline"
                  label="Service"
                  value={
                    context?.serviceName ||
                    'Service'
                  }
                />

                {context?.variantName ? (
                  <>
                    <View
                      style={
                        styles.divider
                      }
                    />

                    <DetailRow
                      icon="layers-outline"
                      label="Package"
                      value={
                        context.variantName
                      }
                    />
                  </>
                ) : null}

                <View
                  style={
                    styles.divider
                  }
                />

                <DetailRow
                  icon="calendar-outline"
                  label="Scheduled"
                  value={
                    formatBookingDateTime(
                      booking.scheduledStart,
                    )
                  }
                />

                <View
                  style={
                    styles.divider
                  }
                />

                <DetailRow
                  icon="time-outline"
                  label="Duration"
                  value={
                    formatDuration(
                      booking,
                    )
                  }
                />

                <View
                  style={
                    styles.divider
                  }
                />

                <DetailRow
                  icon="repeat-outline"
                  label="Booking type"
                  value={
                    getBookingTypeLabel(
                      booking.bookingType,
                    )
                  }
                />
              </View>
            </View>

            <View
              style={
                styles.section
              }
            >
              <SectionHeader
                eyebrow="SERVICE LOCATION"
                title="Where the job is"
              />

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
                  <Ionicons
                    name="location-outline"
                    size={22}
                    color={
                      UI.colors.secondary
                    }
                  />
                </View>

                <View
                  style={
                    styles.locationCopy
                  }
                >
                  {context?.addressLabel ? (
                    <Text
                      style={
                        styles.locationLabel
                      }
                    >
                      {context.addressLabel}
                    </Text>
                  ) : null}

                  <Text
                    style={
                      styles.locationAddress
                    }
                  >
                    {context?.addressLine ||
                      'Service address unavailable'}
                  </Text>
                </View>
              </View>
            </View>

            {booking.notes ? (
              <View
                style={
                  styles.section
                }
              >
                <SectionHeader
                  eyebrow="CUSTOMER NOTES"
                  title="Job instructions"
                />

                <View
                  style={
                    styles.notesCard
                  }
                >
                  <Ionicons
                    name="document-text-outline"
                    size={21}
                    color={
                      UI.colors.secondary
                    }
                  />

                  <Text
                    style={
                      styles.notesText
                    }
                  >
                    {booking.notes}
                  </Text>
                </View>
              </View>
            ) : null}

            <View
              style={
                styles.section
              }
            >
              <SectionHeader
                eyebrow="OFFER"
                title="Offer timing"
              />

              <View
                style={
                  styles.card
                }
              >
                <DetailRow
                  icon="paper-plane-outline"
                  label="Offered"
                  value={
                    formatBookingDateTime(
                      offer.offeredAt,
                    )
                  }
                />

                <View
                  style={
                    styles.divider
                  }
                />

                <DetailRow
                  icon="hourglass-outline"
                  label="Offer expires"
                  value={
                    formatBookingDateTime(
                      offer.expiresAt,
                    )
                  }
                />

                {offer.respondedAt ? (
                  <>
                    <View
                      style={
                        styles.divider
                      }
                    />

                    <DetailRow
                      icon="checkmark-done-outline"
                      label="Responded"
                      value={
                        formatBookingDateTime(
                          offer.respondedAt,
                        )
                      }
                    />
                  </>
                ) : null}

                <View
                  style={
                    styles.divider
                  }
                />

                <DetailRow
                  icon="information-circle-outline"
                  label="Status"
                  value={
                    getOfferStatusLabel(
                      offer.status,
                    )
                  }
                />
              </View>
            </View>

            {isPending &&
            !isExpired ? (
              <View
                style={
                  styles.decisionSection
                }
              >
                <Text
                  style={
                    styles.decisionTitle
                  }
                >
                  Do you want this job?
                </Text>

                <Text
                  style={
                    styles.decisionText
                  }
                >
                  Accepting assigns this booking to your worker account and opens the active job workflow.
                </Text>

                <View
                  style={
                    styles.primaryButton
                  }
                >
                  <AppButton
                    title={
                      responding
                        ? 'Accepting...'
                        : 'Accept job'
                    }
                    disabled={
                      responding
                    }
                    onPress={
                      confirmAccept
                    }
                  />
                </View>

                <View
                  style={
                    styles.secondaryButton
                  }
                >
                  <AppButton
                    title={
                      responding
                        ? 'Please wait...'
                        : 'Decline'
                    }
                    variant="secondary"
                    disabled={
                      responding
                    }
                    onPress={
                      confirmDecline
                    }
                  />
                </View>
              </View>
            ) : null}

            {!isPending ? (
              <View
                style={
                  styles.finalStatusCard
                }
              >
                <View
                  style={
                    styles.finalStatusIcon
                  }
                >
                  <Ionicons
                    name={
                      getOfferStatusIcon(
                        offer.status,
                      )
                    }
                    size={22}
                    color={
                      statusColor
                    }
                  />
                </View>

                <View
                  style={
                    styles.finalStatusCopy
                  }
                >
                  <Text
                    style={[
                      styles.finalStatusTitle,
                      {
                        color:
                          statusColor,
                      },
                    ]}
                  >
                    {getOfferStatusLabel(
                      offer.status,
                    )}
                  </Text>

                  <Text
                    style={
                      styles.finalStatusText
                    }
                  >
                    This offer is no longer awaiting a worker response.
                  </Text>
                </View>
              </View>
            ) : null}
          </>
        ) : (
          <View
            style={
              styles.noDetailsCard
            }
          >
            <Ionicons
              name="information-circle-outline"
              size={24}
              color={
                UI.colors.secondary
              }
            />

            <Text
              style={
                styles.noDetailsTitle
              }
            >
              Job details unavailable
            </Text>

            <Text
              style={
                styles.noDetailsText
              }
            >
              The offer exists, but the booking details could not be loaded right now.
            </Text>
          </View>
        )}

        <Text
          style={
            styles.footerText
          }
        >
          Customer phone numbers and internal account identifiers are not shown on this screen.
        </Text>

        <View
          style={
            styles.bottomSpacing
          }
        />
      </ScrollView>
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal:
      UI.spacing.lg,
    paddingTop:
      UI.spacing.lg,
  },

  topBar: {
    minHeight: 48,
    flexDirection:
      'row',
    alignItems:
      'center',
    justifyContent:
      'space-between',
    marginBottom:
      UI.spacing.lg,
  },

  topBarLeft: {
    width: 70,
  },

  topBarCenter: {
    flex: 1,
    alignItems:
      'center',
  },

  topBarRight: {
    width: 70,
  },

  topBarEyebrow: {
    fontSize:
      UI.typography.caption,
    fontWeight:
      '900',
    letterSpacing:
      1.2,
    color:
      UI.colors.textMuted,
  },

  topBarTitle: {
    marginTop:
      2,
    fontSize:
      UI.typography.subtitle,
    fontWeight:
      '900',
    color:
      UI.colors.text,
  },

  heroCard: {
    padding:
      UI.spacing.xl,
    borderRadius:
      UI.radius.xl,
    backgroundColor:
      UI.colors.surface,
    borderWidth:
      1,
    borderColor:
      UI.colors.border,
    alignItems:
      'center',
  },

  heroIcon: {
    width: 58,
    height: 58,
    borderRadius:
      UI.radius.lg,
    alignItems:
      'center',
    justifyContent:
      'center',
  },

  heroEyebrow: {
    marginTop:
      UI.spacing.lg,
    fontSize:
      UI.typography.caption,
    fontWeight:
      '900',
    letterSpacing:
      1.1,
    color:
      UI.colors.textMuted,
  },

  heroTitle: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.title,
    lineHeight:
      30,
    fontWeight:
      '900',
    color:
      UI.colors.text,
    textAlign:
      'center',
  },

  heroService: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.body,
    fontWeight:
      '700',
    color:
      UI.colors.secondary,
    textAlign:
      'center',
  },

  timerCard: {
    width:
      '100%',
    marginTop:
      UI.spacing.lg,
    flexDirection:
      'row',
    alignItems:
      'center',
    padding:
      UI.spacing.md,
    borderRadius:
      UI.radius.lg,
    backgroundColor:
      UI.colors.infoBackground,
  },

  timerIcon: {
    width: 40,
    height: 40,
    borderRadius:
      UI.radius.pill,
    alignItems:
      'center',
    justifyContent:
      'center',
    backgroundColor:
      UI.colors.surface,
  },

  timerCopy: {
    flex: 1,
    marginLeft:
      UI.spacing.md,
  },

  timerLabel: {
    fontSize:
      UI.typography.caption,
    fontWeight:
      '800',
    color:
      UI.colors.textMuted,
  },

  timerValue: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.title,
    fontWeight:
      '900',
    color:
      UI.colors.text,
  },

  timerStatus: {
    paddingHorizontal:
      UI.spacing.sm,
    paddingVertical:
      UI.spacing.xs,
    borderRadius:
      UI.radius.pill,
    backgroundColor:
      UI.colors.successBackground,
  },

  timerStatusExpired: {
    paddingHorizontal:
      UI.spacing.sm,
    paddingVertical:
      UI.spacing.xs,
    borderRadius:
      UI.radius.pill,
    backgroundColor:
      UI.colors.errorBackground,
  },

  timerStatusText: {
    fontSize:
      UI.typography.caption,
    fontWeight:
      '800',
    color:
      UI.colors.success,
  },

  timerStatusTextExpired: {
    fontSize:
      UI.typography.caption,
    fontWeight:
      '800',
    color:
      UI.colors.error,
  },

  warningBox: {
    marginTop:
      UI.spacing.md,
    padding:
      UI.spacing.md,
    borderRadius:
      UI.radius.lg,
    flexDirection:
      'row',
    alignItems:
      'flex-start',
    backgroundColor:
      UI.colors.warningBackground,
    borderWidth:
      1,
    borderColor:
      UI.colors.border,
  },

  warningCopy: {
    flex: 1,
    marginLeft:
      UI.spacing.sm,
  },

  warningTitle: {
    fontSize:
      UI.typography.small,
    fontWeight:
      '900',
    color:
      UI.colors.text,
  },

  warningText: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.caption,
    lineHeight:
      17,
    color:
      UI.colors.textSecondary,
  },

  section: {
    marginTop:
      UI.spacing.xxl,
  },

  sectionHeader: {
    marginBottom:
      UI.spacing.md,
  },

  sectionEyebrow: {
    fontSize:
      UI.typography.caption,
    fontWeight:
      '900',
    letterSpacing:
      1,
    color:
      UI.colors.textMuted,
  },

  sectionTitle: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.subtitle,
    fontWeight:
      '900',
    color:
      UI.colors.text,
  },

  card: {
    paddingHorizontal:
      UI.spacing.lg,
    paddingVertical:
      UI.spacing.sm,
    borderRadius:
      UI.radius.xl,
    backgroundColor:
      UI.colors.surface,
    borderWidth:
      1,
    borderColor:
      UI.colors.border,
  },

  detailRow: {
    flexDirection:
      'row',
    alignItems:
      'center',
    paddingVertical:
      UI.spacing.md,
  },

  detailIcon: {
    width: 40,
    height: 40,
    borderRadius:
      UI.radius.md,
    alignItems:
      'center',
    justifyContent:
      'center',
    backgroundColor:
      UI.colors.infoBackground,
  },

  detailCopy: {
    flex: 1,
    marginLeft:
      UI.spacing.md,
  },

  detailLabel: {
    fontSize:
      UI.typography.caption,
    color:
      UI.colors.textMuted,
  },

  detailValue: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.small,
    lineHeight:
      19,
    fontWeight:
      '800',
    color:
      UI.colors.text,
  },

  divider: {
    height:
      1,
    backgroundColor:
      UI.colors.border,
  },

  locationCard: {
    flexDirection:
      'row',
    alignItems:
      'flex-start',
    padding:
      UI.spacing.lg,
    borderRadius:
      UI.radius.xl,
    backgroundColor:
      UI.colors.surface,
    borderWidth:
      1,
    borderColor:
      UI.colors.border,
  },

  locationIcon: {
    width: 44,
    height: 44,
    borderRadius:
      UI.radius.md,
    alignItems:
      'center',
    justifyContent:
      'center',
    backgroundColor:
      UI.colors.infoBackground,
  },

  locationCopy: {
    flex: 1,
    marginLeft:
      UI.spacing.md,
  },

  locationLabel: {
    fontSize:
      UI.typography.small,
    fontWeight:
      '900',
    color:
      UI.colors.text,
  },

  locationAddress: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.small,
    lineHeight:
      20,
    color:
      UI.colors.textSecondary,
  },

  notesCard: {
    flexDirection:
      'row',
    alignItems:
      'flex-start',
    padding:
      UI.spacing.lg,
    borderRadius:
      UI.radius.xl,
    backgroundColor:
      UI.colors.surface,
    borderWidth:
      1,
    borderColor:
      UI.colors.border,
  },

  notesText: {
    flex: 1,
    marginLeft:
      UI.spacing.md,
    fontSize:
      UI.typography.small,
    lineHeight:
      20,
    color:
      UI.colors.textSecondary,
  },

  decisionSection: {
    marginTop:
      UI.spacing.xxl,
    padding:
      UI.spacing.lg,
    borderRadius:
      UI.radius.xl,
    backgroundColor:
      UI.colors.surface,
    borderWidth:
      1,
    borderColor:
      UI.colors.border,
  },

  decisionTitle: {
    fontSize:
      UI.typography.subtitle,
    fontWeight:
      '900',
    color:
      UI.colors.text,
  },

  decisionText: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.small,
    lineHeight:
      19,
    color:
      UI.colors.textSecondary,
  },

  primaryButton: {
    marginTop:
      UI.spacing.lg,
  },

  secondaryButton: {
    marginTop:
      UI.spacing.sm,
  },

  finalStatusCard: {
    marginTop:
      UI.spacing.xxl,
    padding:
      UI.spacing.lg,
    borderRadius:
      UI.radius.xl,
    flexDirection:
      'row',
    alignItems:
      'center',
    backgroundColor:
      UI.colors.surface,
    borderWidth:
      1,
    borderColor:
      UI.colors.border,
  },

  finalStatusIcon: {
    width: 46,
    height: 46,
    borderRadius:
      UI.radius.pill,
    alignItems:
      'center',
    justifyContent:
      'center',
    backgroundColor:
      UI.colors.infoBackground,
  },

  finalStatusCopy: {
    flex: 1,
    marginLeft:
      UI.spacing.md,
  },

  finalStatusTitle: {
    fontSize:
      UI.typography.bodyLarge,
    fontWeight:
      '900',
  },

  finalStatusText: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.small,
    lineHeight:
      18,
    color:
      UI.colors.textSecondary,
  },

  noDetailsCard: {
    marginTop:
      UI.spacing.xxl,
    padding:
      UI.spacing.xl,
    borderRadius:
      UI.radius.xl,
    alignItems:
      'center',
    backgroundColor:
      UI.colors.surface,
    borderWidth:
      1,
    borderColor:
      UI.colors.border,
  },

  noDetailsTitle: {
    marginTop:
      UI.spacing.md,
    fontSize:
      UI.typography.subtitle,
    fontWeight:
      '900',
    color:
      UI.colors.text,
  },

  noDetailsText: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.small,
    lineHeight:
      19,
    color:
      UI.colors.textSecondary,
    textAlign:
      'center',
  },

  footerText: {
    marginTop:
      UI.spacing.xl,
    fontSize:
      UI.typography.caption,
    lineHeight:
      17,
    color:
      UI.colors.textMuted,
    textAlign:
      'center',
  },

  bottomSpacing: {
    height:
      UI.spacing.xxl,
  },

  loadingContainer: {
    flex: 1,
    alignItems:
      'center',
    justifyContent:
      'center',
    paddingHorizontal:
      UI.spacing.xxl,
  },

  loadingTitle: {
    marginTop:
      UI.spacing.lg,
    fontSize:
      UI.typography.subtitle,
    fontWeight:
      '800',
    color:
      UI.colors.text,
    textAlign:
      'center',
  },

  loadingText: {
    marginTop:
      UI.spacing.sm,
    maxWidth:
      300,
    fontSize:
      UI.typography.body,
    lineHeight:
      20,
    color:
      UI.colors.textSecondary,
    textAlign:
      'center',
  },
})