import {
  useCallback,
  useEffect,
  useState,
} from 'react'

import {
  ActivityIndicator,
  Alert,
  Pressable,
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
  getWorkerBookingOffers,
  getWorkerBookingOfferRemainingSeconds,
  isWorkerBookingOfferPending,
  respondToWorkerBookingOffer,
  type WorkerBookingOffer,
} from '../../services/bookings/workerBookingOffers.service'

type BookingOfferScreenProps = {
  bookingId: string
  onBack?: () => void
  onAccepted?: (bookingId: string) => void
}

function formatDateTime(
  value: string,
): string {
  const date = new Date(
    value,
  )

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return '—'
  }

  return date.toLocaleString(
    'en-IN',
    {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    },
  )
}

function formatRemainingTime(
  totalSeconds: number,
): string {
  const safeSeconds = Math.max(
    0,
    totalSeconds,
  )

  const minutes = Math.floor(
    safeSeconds / 60,
  )

  const seconds =
    safeSeconds % 60

  return `${minutes}:${seconds
    .toString()
    .padStart(2, '0')}`
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

function getStatusIcon(
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
    remainingSeconds,
    setRemainingSeconds,
  ] = useState(0)

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
    error,
    setError,
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

        try {
          const offers =
            await getWorkerBookingOffers()

          const matchingOffer =
            offers.find(
              item =>
                item.bookingId ===
                bookingId,
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
      [bookingId],
    )

  useEffect(() => {
    void loadOffer()
  }, [
    loadOffer,
  ])

  useEffect(() => {
    if (
      offerRevision === 0
    ) {
      return
    }

    if (responding) {
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
      setRemainingSeconds(0)
      return
    }

    const interval =
      setInterval(() => {
        setRemainingSeconds(
          getWorkerBookingOfferRemainingSeconds(
            offer,
          ),
        )
      }, 1000)

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

          const nextStatus =
            response ===
            'accept'
              ? 'accepted'
              : 'declined'

          const respondedAt =
            new Date().toISOString()

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

          setRemainingSeconds(0)

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
        'Accepting this offer assigns the booking to you.',
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
            Checking the latest assignment offer for your account.
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
          {onBack ? (
            <Pressable
              onPress={
                onBack
              }
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              style={({ pressed }) => [
                styles.backButton,
                pressed &&
                  styles.buttonPressed,
              ]}
            >
              <Ionicons
                name="arrow-back"
                size={21}
                color={
                  UI.colors.primary
                }
              />
            </Pressable>
          ) : (
            <View
              style={
                styles.backButtonPlaceholder
              }
            />
          )}

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
              TEMPSTAFF
            </Text>

            <Text
              style={
                styles.topBarTitle
              }
            >
              New job
            </Text>
          </View>

          <Pressable
            onPress={() => {
              void loadOffer(true)
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Refresh offer"
            disabled={
              refreshing ||
              responding
            }
            style={({ pressed }) => [
              styles.refreshButton,
              pressed &&
                styles.buttonPressed,
            ]}
          >
            <Ionicons
              name="refresh"
              size={20}
              color={
                UI.colors.primary
              }
            />
          </Pressable>
        </View>

        {error ? (
          <View
            style={
              styles.warningBox
            }
          >
            <View
              style={
                styles.warningIcon
              }
            >
              <Ionicons
                name="alert-circle-outline"
                size={18}
                color={
                  UI.colors.warning
                }
              />
            </View>

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
                Offer update notice
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
            style={
              styles.heroIcon
            }
          >
            <Ionicons
              name={
                getStatusIcon(
                  offer.status,
                )
              }
              size={28}
              color={
                UI.colors.primary
              }
            />
          </View>

          <Text
            style={
              styles.heroEyebrow
            }
          >
            WORK OPPORTUNITY
          </Text>

          <Text
            style={
              styles.heroTitle
            }
          >
            {isPending
              ? 'A new assignment is waiting'
              : getOfferStatusLabel(
                  offer.status,
                )}
          </Text>

          <Text
            style={
              styles.heroSubtitle
            }
          >
            Booking ID • {bookingId}
          </Text>

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
                  size={19}
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
          ) : (
            <View
              style={
                styles.finalStatus
              }
            >
              <Ionicons
                name={
                  getStatusIcon(
                    offer.status,
                  )
                }
                size={20}
                color={
                  offer.status ===
                  'accepted'
                    ? UI.colors.success
                    : offer.status ===
                        'declined' ||
                      offer.status ===
                        'expired' ||
                      offer.status ===
                        'cancelled'
                      ? UI.colors.error
                      : UI.colors.secondary
                }
              />

              <Text
                style={
                  styles.finalStatusText
                }
              >
                {getOfferStatusLabel(
                  offer.status,
                )}
              </Text>
            </View>
          )}
        </View>

        <View
          style={
            styles.section
          }
        >
          <Text
            style={
              styles.sectionEyebrow
            }
          >
            OFFER INFORMATION
          </Text>

          <Text
            style={
              styles.sectionTitle
            }
          >
            Assignment details
          </Text>

          <View
            style={
              styles.infoCard
            }
          >
            <InfoRow
              icon="briefcase-outline"
              label="Booking"
              value={
                bookingId
              }
            />

            <InfoDivider />

            <InfoRow
              icon="paper-plane-outline"
              label="Offered"
              value={formatDateTime(
                offer.offeredAt,
              )}
            />

            <InfoDivider />

            <InfoRow
              icon="time-outline"
              label="Offer expires"
              value={formatDateTime(
                offer.expiresAt,
              )}
            />

            {offer.respondedAt ? (
              <>
                <InfoDivider />

                <InfoRow
                  icon="checkmark-done-outline"
                  label="Responded"
                  value={formatDateTime(
                    offer.respondedAt,
                  )}
                />
              </>
            ) : null}
          </View>
        </View>

        {isPending && !isExpired ? (
          <View
            style={
              styles.decisionSection
            }
          >
            <Text
              style={
                styles.sectionEyebrow
              }
            >
              YOUR RESPONSE
            </Text>

            <Text
              style={
                styles.sectionTitle
              }
            >
              Do you want this job?
            </Text>

            <Text
              style={
                styles.decisionDescription
              }
            >
              Accepting assigns this booking to your worker account. Declining releases the offer.
            </Text>

            <View
              style={
                styles.acceptButton
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
                styles.declineButton
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

        {offer.status ===
        'accepted' ? (
          <View
            style={
              styles.resultCardSuccess
            }
          >
            <View
              style={
                styles.resultIconSuccess
              }
            >
              <Ionicons
                name="checkmark"
                size={22}
                color={
                  UI.colors.success
                }
              />
            </View>

            <View
              style={
                styles.resultCopy
              }
            >
              <Text
                style={
                  styles.resultTitleSuccess
                }
              >
                Booking accepted
              </Text>

              <Text
                style={
                  styles.resultText
                }
              >
                This job is now assigned to your worker account.
              </Text>
            </View>

            <Pressable
              onPress={() => {
                onAccepted?.(
                  offer.bookingId,
                )
              }}
              accessibilityRole="button"
              accessibilityLabel="Open accepted booking"
              style={({ pressed }) => [
                styles.resultArrowButton,
                pressed &&
                  styles.buttonPressed,
              ]}
            >
              <Ionicons
                name="chevron-forward"
                size={20}
                color={
                  UI.colors.secondary
                }
              />
            </Pressable>
          </View>
        ) : null}

        {offer.status ===
        'declined' ? (
          <ResultCard
            icon="close-circle-outline"
            title="Offer declined"
            message="You declined this booking offer. It cannot be accepted again."
          />
        ) : null}

        {offer.status ===
        'cancelled' ? (
          <ResultCard
            icon="ban-outline"
            title="Offer cancelled"
            message="This booking offer was cancelled before you responded."
          />
        ) : null}

        {offer.status ===
        'expired' ||
        isExpired ? (
          <ResultCard
            icon="time-outline"
            title="Offer expired"
            message="The response window for this offer has closed."
          />
        ) : null}

        <Text
          style={
            styles.footerText
          }
        >
          Offer information is loaded for the authenticated TempStaff worker account.
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

function InfoRow({
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
        styles.infoRow
      }
    >
      <View
        style={
          styles.infoIcon
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
          styles.infoCopy
        }
      >
        <Text
          style={
            styles.infoLabel
          }
        >
          {label}
        </Text>

        <Text
          numberOfLines={3}
          style={
            styles.infoValue
          }
        >
          {value}
        </Text>
      </View>
    </View>
  )
}

function InfoDivider() {
  return (
    <View
      style={
        styles.infoDivider
      }
    />
  )
}

function ResultCard({
  icon,
  title,
  message,
}: {
  icon: keyof typeof Ionicons.glyphMap
  title: string
  message: string
}) {
  return (
    <View
      style={
        styles.resultCard
      }
    >
      <View
        style={
          styles.resultIcon
        }
      >
        <Ionicons
          name={icon}
          size={22}
          color={
            UI.colors.secondary
          }
        />
      </View>

      <View
        style={
          styles.resultCopy
        }
      >
        <Text
          style={
            styles.resultTitle
          }
        >
          {title}
        </Text>

        <Text
          style={
            styles.resultText
          }
        >
          {message}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal:
      UI.spacing.lg,
    paddingTop:
      UI.spacing.md,
    paddingBottom:
      UI.spacing.xxxl,
  },

  topBar: {
    flexDirection:
      'row',
    alignItems:
      'center',
    justifyContent:
      'space-between',
    minHeight: 44,
  },

  backButton: {
    width: 44,
    height: 44,
    borderRadius:
      UI.radius.pill,
    alignItems:
      'center',
    justifyContent:
      'center',
    backgroundColor:
      UI.colors.surface,
    borderWidth: 1,
    borderColor:
      UI.colors.border,
  },

  backButtonPlaceholder: {
    width: 44,
    height: 44,
  },

  topBarCenter: {
    alignItems:
      'center',
  },

  topBarEyebrow: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
    color:
      UI.colors.secondary,
  },

  topBarTitle: {
    marginTop: 2,
    fontSize:
      UI.typography.bodyLarge,
    fontWeight:
      '900',
    color:
      UI.colors.text,
  },

  refreshButton: {
    width: 44,
    height: 44,
    borderRadius:
      UI.radius.pill,
    alignItems:
      'center',
    justifyContent:
      'center',
    backgroundColor:
      UI.colors.surface,
    borderWidth: 1,
    borderColor:
      UI.colors.border,
  },

  buttonPressed: {
    opacity: 0.7,
  },

  warningBox: {
    flexDirection:
      'row',
    alignItems:
      'flex-start',
    marginTop:
      UI.spacing.lg,
    padding:
      UI.spacing.md,
    borderRadius:
      UI.radius.lg,
    backgroundColor:
      UI.colors.warningBackground,
    borderWidth: 1,
    borderColor:
      '#FDE68A',
  },

  warningIcon: {
    width: 32,
    height: 32,
    borderRadius:
      UI.radius.pill,
    alignItems:
      'center',
    justifyContent:
      'center',
    backgroundColor:
      UI.colors.surface,
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
      '800',
    color:
      UI.colors.warning,
  },

  warningText: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.small,
    lineHeight: 18,
    color:
      UI.colors.textSecondary,
  },

  heroCard: {
    marginTop:
      UI.spacing.lg,
    padding:
      UI.spacing.xl,
    borderRadius:
      UI.radius.xl,
    backgroundColor:
      UI.colors.primary,
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
    backgroundColor:
      UI.colors.surface,
  },

  heroEyebrow: {
    marginTop:
      UI.spacing.lg,
    fontSize: 10,
    fontWeight:
      '800',
    letterSpacing: 1.1,
    color:
      UI.colors.surface,
    opacity: 0.72,
  },

  heroTitle: {
    marginTop:
      UI.spacing.sm,
    fontSize: 26,
    lineHeight: 32,
    fontWeight:
      '900',
    color:
      UI.colors.surface,
  },

  heroSubtitle: {
    marginTop:
      UI.spacing.sm,
    fontSize:
      UI.typography.small,
    color:
      UI.colors.surface,
    opacity: 0.76,
  },

  timerCard: {
    flexDirection:
      'row',
    alignItems:
      'center',
    marginTop:
      UI.spacing.xl,
    padding:
      UI.spacing.md,
    borderRadius:
      UI.radius.lg,
    backgroundColor:
      UI.colors.surface,
  },

  timerIcon: {
    width: 38,
    height: 38,
    borderRadius:
      UI.radius.md,
    alignItems:
      'center',
    justifyContent:
      'center',
    backgroundColor:
      UI.colors.infoBackground,
  },

  timerCopy: {
    flex: 1,
    marginLeft:
      UI.spacing.md,
  },

  timerLabel: {
    fontSize: 9,
    fontWeight:
      '800',
    letterSpacing: 0.9,
    color:
      UI.colors.textMuted,
  },

  timerValue: {
    marginTop:
      UI.spacing.xs,
    fontSize: 24,
    lineHeight: 28,
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

  finalStatus: {
    flexDirection:
      'row',
    alignItems:
      'center',
    marginTop:
      UI.spacing.xl,
    paddingTop:
      UI.spacing.md,
    borderTopWidth: 1,
    borderTopColor:
      'rgba(255,255,255,0.14)',
  },

  finalStatusText: {
    marginLeft:
      UI.spacing.sm,
    fontSize:
      UI.typography.body,
    fontWeight:
      '800',
    color:
      UI.colors.surface,
  },

  section: {
    marginTop:
      UI.spacing.xxl,
  },

  sectionEyebrow: {
    fontSize: 10,
    fontWeight:
      '800',
    letterSpacing:
      1.05,
    color:
      UI.colors.secondary,
  },

  sectionTitle: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.subtitle,
    lineHeight: 23,
    fontWeight:
      '800',
    color:
      UI.colors.text,
  },

  infoCard: {
    marginTop:
      UI.spacing.md,
    paddingHorizontal:
      UI.spacing.lg,
    paddingVertical:
      UI.spacing.sm,
    borderRadius:
      UI.radius.xl,
    backgroundColor:
      UI.colors.surface,
    borderWidth: 1,
    borderColor:
      UI.colors.border,
  },

  infoRow: {
    flexDirection:
      'row',
    alignItems:
      'center',
    paddingVertical:
      UI.spacing.md,
  },

  infoIcon: {
    width: 38,
    height: 38,
    borderRadius:
      UI.radius.md,
    alignItems:
      'center',
    justifyContent:
      'center',
    backgroundColor:
      UI.colors.infoBackground,
  },

  infoCopy: {
    flex: 1,
    marginLeft:
      UI.spacing.md,
  },

  infoLabel: {
    fontSize:
      UI.typography.caption,
    color:
      UI.colors.textMuted,
  },

  infoValue: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.small,
    fontWeight:
      '800',
    color:
      UI.colors.text,
  },

  infoDivider: {
    height: 1,
    backgroundColor:
      UI.colors.border,
  },

  decisionSection: {
    marginTop:
      UI.spacing.xxl,
  },

  decisionDescription: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.small,
    lineHeight: 18,
    color:
      UI.colors.textSecondary,
  },

  acceptButton: {
    marginTop:
      UI.spacing.lg,
  },

  declineButton: {
    marginTop:
      UI.spacing.sm,
  },

  resultCardSuccess: {
    flexDirection:
      'row',
    alignItems:
      'center',
    marginTop:
      UI.spacing.xxl,
    padding:
      UI.spacing.lg,
    borderRadius:
      UI.radius.xl,
    backgroundColor:
      UI.colors.successBackground,
    borderWidth: 1,
    borderColor:
      UI.colors.success,
  },

  resultCard: {
    flexDirection:
      'row',
    alignItems:
      'center',
    marginTop:
      UI.spacing.xxl,
    padding:
      UI.spacing.lg,
    borderRadius:
      UI.radius.xl,
    backgroundColor:
      UI.colors.infoBackground,
    borderWidth: 1,
    borderColor:
      UI.colors.border,
  },

  resultIconSuccess: {
    width: 44,
    height: 44,
    borderRadius:
      UI.radius.pill,
    alignItems:
      'center',
    justifyContent:
      'center',
    backgroundColor:
      UI.colors.surface,
  },

  resultIcon: {
    width: 44,
    height: 44,
    borderRadius:
      UI.radius.pill,
    alignItems:
      'center',
    justifyContent:
      'center',
    backgroundColor:
      UI.colors.surface,
  },

  resultCopy: {
    flex: 1,
    marginLeft:
      UI.spacing.md,
    marginRight:
      UI.spacing.sm,
  },

  resultTitleSuccess: {
    fontSize:
      UI.typography.bodyLarge,
    fontWeight:
      '900',
    color:
      UI.colors.success,
  },

  resultTitle: {
    fontSize:
      UI.typography.bodyLarge,
    fontWeight:
      '900',
    color:
      UI.colors.text,
  },

  resultText: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.small,
    lineHeight: 18,
    color:
      UI.colors.textSecondary,
  },

  resultArrowButton: {
    width: 38,
    height: 38,
    borderRadius:
      UI.radius.pill,
    alignItems:
      'center',
    justifyContent:
      'center',
    backgroundColor:
      UI.colors.surface,
  },

  footerText: {
    marginTop:
      UI.spacing.xl,
    fontSize:
      UI.typography.caption,
    lineHeight: 16,
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
    maxWidth: 300,
    fontSize:
      UI.typography.body,
    lineHeight: 20,
    color:
      UI.colors.textSecondary,
    textAlign:
      'center',
  },
})
