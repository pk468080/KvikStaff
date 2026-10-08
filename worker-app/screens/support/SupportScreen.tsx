import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

import {
  Ionicons,
} from '@expo/vector-icons'

import {
  ScreenContainer,
} from '../../components/layout/ScreenContainer'

import EmptyState from '../../components/ui/EmptyState'

import ErrorState from '../../components/ui/ErrorState'

import StatusBadge from '../../components/ui/StatusBadge';


import {
  UI,
} from '../../constants/ui'

import {
  createWorkerSupportTicket,
  getWorkerSupportCategoryLabel,
  getWorkerSupportTickets,
  isOpenWorkerSupportTicket,
  type WorkerSupportCategory,
  type WorkerSupportTicket,
} from '../../services/support/workerSupport.service'

type SupportScreenProps = {
  onBack?: () => void
  initialBookingId?: string
}

const CATEGORIES: WorkerSupportCategory[] = [
  'booking',
  'payment',
  'worker',
  'refund',
  'technical',
]

const MAX_SUBJECT_LENGTH = 120
const MAX_DESCRIPTION_LENGTH = 1000

function getStatusLabel(
  status: string,
): string {
  switch (status) {
    case 'open':
      return 'Open'

    case 'in_progress':
      return 'In progress'

    case 'resolved':
      return 'Resolved'

    case 'closed':
      return 'Closed'

    default:
      return status
        .replace(/_/g, ' ')
        .replace(
          /^./,
          value =>
            value.toUpperCase(),
        )
  }
}

function getStatusVariant(
  status: string,
):
  | 'default'
  | 'success'
  | 'warning'
  | 'error'
  | 'info' {
  switch (status) {
    case 'open':
      return 'info'

    case 'in_progress':
      return 'warning'

    case 'resolved':
      return 'success'

    case 'closed':
      return 'default'

    default:
      return 'default'
  }
}

function getCategoryIcon(
  category: WorkerSupportCategory,
): keyof typeof Ionicons.glyphMap {
  switch (category) {
    case 'booking':
      return 'briefcase-outline'

    case 'payment':
      return 'card-outline'

    case 'worker':
      return 'person-outline'

    case 'refund':
      return 'cash-outline'

    case 'technical':
      return 'construct-outline'

    default:
      return 'help-circle-outline'
  }
}

function getCategoryIconColors(
  category: WorkerSupportCategory,
): {
  backgroundColor: string
  color: string
} {
  switch (category) {
    case 'booking':
      return {
        backgroundColor:
          UI.colors.infoBackground,
        color:
          UI.colors.primaryBlue,
      }

    case 'payment':
      return {
        backgroundColor:
          UI.colors.successBackground,
        color:
          UI.colors.success,
      }

    case 'worker':
      return {
        backgroundColor:
          UI.colors.background,
        color:
          UI.colors.primary,
      }

    case 'refund':
      return {
        backgroundColor:
          UI.colors.warningBackground,
        color:
          UI.colors.warning,
      }

    case 'technical':
      return {
        backgroundColor:
          UI.colors.errorBackground,
        color:
          UI.colors.error,
      }

    default:
      return {
        backgroundColor:
          UI.colors.background,
        color:
          UI.colors.textSecondary,
      }
  }
}

function formatDateTime(
  value: string,
): string {
  const date = new Date(value)

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return value
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

function SupportCategoryButton({
  category,
  selected,
  disabled,
  onPress,
}: {
  category: WorkerSupportCategory
  selected: boolean
  disabled: boolean
  onPress: () => void
}) {
  const icon = getCategoryIcon(
    category,
  )

  const iconStyle =
    getCategoryIconColors(
      category,
    )

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={
        getWorkerSupportCategoryLabel(
          category,
        )
      }
      style={({ pressed }) => [
        styles.categoryCard,
        selected &&
          styles.categoryCardSelected,
        pressed &&
          !disabled &&
          styles.categoryCardPressed,
        disabled &&
          styles.categoryCardDisabled,
      ]}
    >
      <View
        style={[
          styles.categoryIcon,
          {
            backgroundColor:
              selected
                ? UI.colors.primaryBlue
                : iconStyle.backgroundColor,
          },
        ]}
      >
        <Ionicons
          name={icon}
          size={19}
          color={
            selected
              ? UI.colors.surface
              : iconStyle.color
          }
        />
      </View>

      <Text
        style={[
          styles.categoryTitle,
          selected &&
            styles.categoryTitleSelected,
        ]}
      >
        {getWorkerSupportCategoryLabel(
          category,
        )}
      </Text>

      {selected ? (
        <View
          style={styles.selectedMark}
        >
          <Ionicons
            name="checkmark"
            size={12}
            color={UI.colors.primaryBlue}
          />
        </View>
      ) : null}
    </Pressable>
  )
}

export default function SupportScreen({
  onBack,
  initialBookingId,
}: SupportScreenProps) {
  const [
    tickets,
    setTickets,
  ] = useState<
    WorkerSupportTicket[]
  >([])

  const [
    loading,
    setLoading,
  ] = useState(true)

  const [
    refreshing,
    setRefreshing,
  ] = useState(false)

  const [
    submitting,
    setSubmitting,
  ] = useState(false)

  const [
    error,
    setError,
  ] = useState('')

  const [
    category,
    setCategory,
  ] = useState<WorkerSupportCategory>(
    'booking',
  )

  const [
    subject,
    setSubject,
  ] = useState('')

  const [
    description,
    setDescription,
  ] = useState('')

  const [
    bookingId,
    setBookingId,
  ] = useState(
    initialBookingId ?? '',
  )

  const [
    localError,
    setLocalError,
  ] = useState('')

  const loadTickets =
    useCallback(
      async (
        mode:
          | 'initial'
          | 'refresh' = 'initial',
      ) => {
        setError('')

        if (
          mode ===
          'initial'
        ) {
          setLoading(true)
        } else {
          setRefreshing(true)
        }

        try {
          const nextTickets =
            await getWorkerSupportTickets(
              50,
            )

          setTickets(
            nextTickets,
          )
        } catch (cause) {
          setError(
            cause instanceof Error
              ? cause.message
              : 'Unable to load your support tickets.',
          )
        } finally {
          if (
            mode ===
            'initial'
          ) {
            setLoading(false)
          } else {
            setRefreshing(false)
          }
        }
      },
      [],
    )

  useEffect(() => {
    void loadTickets()
  }, [loadTickets])

  useEffect(() => {
    if (
      initialBookingId
    ) {
      setBookingId(
        initialBookingId,
      )
      setCategory(
        'booking',
      )
    }
  }, [initialBookingId])

  const openTicketCount =
    useMemo(
      () =>
        tickets.filter(
          ticket =>
            isOpenWorkerSupportTicket(
              ticket,
            ),
        ).length,
      [tickets],
    )

  function validateForm(): string | null {
    const normalizedSubject =
      subject.trim()

    const normalizedDescription =
      description.trim()

    const normalizedBookingId =
      bookingId.trim()

    if (
      !normalizedSubject
    ) {
      return 'Ticket subject is required.'
    }

    if (
      normalizedSubject.length >
      MAX_SUBJECT_LENGTH
    ) {
      return `Ticket subject must be ${MAX_SUBJECT_LENGTH} characters or fewer.`
    }

    if (
      !normalizedDescription
    ) {
      return 'Ticket description is required.'
    }

    if (
      normalizedDescription.length >
      MAX_DESCRIPTION_LENGTH
    ) {
      return `Ticket description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer.`
    }

    if (
      category ===
        'booking' &&
      !normalizedBookingId
    ) {
      return 'Booking reference is required for a booking ticket.'
    }

    return null
  }

  async function handleSubmit() {
    if (submitting) {
      return
    }

    setError('')
    setLocalError('')

    const validationError =
      validateForm()

    if (validationError) {
      setLocalError(
        validationError,
      )
      return
    }

    setSubmitting(true)

    try {
      const created =
        await createWorkerSupportTicket(
          {
            category,

            subject:
              subject.trim(),

            description:
              description.trim(),

            bookingId:
              bookingId.trim()
                ? bookingId.trim()
                : null,
          },
        )

      setTickets(
        current => [
          created,
          ...current,
        ],
      )

      setSubject('')
      setDescription('')

      if (
        !initialBookingId
      ) {
        setBookingId('')
      }

      Alert.alert(
        'Support ticket created',
        `Ticket ${created.id} has been created. Our support team can now review it.`,
      )
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Unable to create your support ticket.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  function showUnavailable(
    title: string,
  ) {
    Alert.alert(
      title,
      'This setting is not configured in the current worker app build.',
    )
  }

  if (
    loading &&
    tickets.length === 0
  ) {
    return (
      <ScreenContainer>
        <View
          style={
            styles.loadingContainer
          }
        >
          <View
            style={
              styles.loadingIcon
            }
          >
            <Ionicons
              name="headset-outline"
              size={27}
              color={
                UI.colors.primaryBlue
              }
            />
          </View>

          <ActivityIndicator
            size="small"
            color={
              UI.colors.primaryBlue
            }
          />

          <Text
            style={
              styles.loadingTitle
            }
          >
            Loading support
          </Text>

          <Text
            style={
              styles.loadingText
            }
          >
            Fetching your worker support tickets...
          </Text>
        </View>
      </ScreenContainer>
    )
  }

  if (
    error &&
    tickets.length === 0
  ) {
    return (
      <ScreenContainer>
        <ErrorState
          title="Support unavailable"
          message={error}
          onAction={() => {
            void loadTickets()
          }}
        />
      </ScreenContainer>
    )
  }

  return (
    <ScreenContainer>
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={
          Platform.OS ===
          'ios'
            ? 'padding'
            : undefined
        }
      >
        <ScrollView
          contentContainerStyle={
            styles.content
          }
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={
                refreshing
              }
              onRefresh={() => {
                void loadTickets(
                  'refresh',
                )
              }}
              tintColor={
                UI.colors.primaryBlue
              }
            />
          }
          showsVerticalScrollIndicator={
            false
          }
        >
          <View
            style={styles.topBar}
          >
            {onBack ? (
              <Pressable
                onPress={onBack}
                disabled={submitting}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Go back"
                style={({ pressed }) => [
                  styles.headerButton,
                  pressed &&
                    styles.headerButtonPressed,
                  submitting &&
                    styles.headerButtonDisabled,
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
                  styles.headerButtonPlaceholder
                }
              />
            )}

            <View
              style={
                styles.headerCenter
              }
            >
              <Text
                style={
                  styles.headerEyebrow
                }
              >
                KvikStaff
              </Text>

              <Text
                style={
                  styles.headerTitle
                }
              >
                Support
              </Text>
            </View>

            <Pressable
              onPress={() => {
                void loadTickets(
                  'refresh',
                )
              }}
              disabled={
                refreshing ||
                submitting
              }
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Refresh support tickets"
              style={({ pressed }) => [
                styles.headerButton,
                pressed &&
                  styles.headerButtonPressed,
                (refreshing ||
                  submitting) &&
                  styles.headerButtonDisabled,
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
                name="headset-outline"
                size={27}
                color={
                  UI.colors.surface
                }
              />
            </View>

            <Text
              style={
                styles.heroEyebrow
              }
            >
              WORKER SUPPORT
            </Text>

            <Text
              style={
                styles.heroTitle
              }
            >
              Need help with a job?
            </Text>

            <Text
              style={
                styles.heroText
              }
            >
              Create a support ticket for booking,
              payment, account, refund or technical issues.
            </Text>

            <View
              style={
                styles.heroMetrics
              }
            >
              <View
                style={
                  styles.heroMetric
                }
              >
                <Text
                  style={
                    styles.heroMetricValue
                  }
                >
                  {openTicketCount}
                </Text>

                <Text
                  style={
                    styles.heroMetricLabel
                  }
                >
                  Open
                </Text>
              </View>

              <View
                style={
                  styles.heroMetricDivider
                }
              />

              <View
                style={
                  styles.heroMetric
                }
              >
                <Text
                  style={
                    styles.heroMetricValue
                  }
                >
                  {tickets.length}
                </Text>

                <Text
                  style={
                    styles.heroMetricLabel
                  }
                >
                  Total
                </Text>
              </View>
            </View>
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
                  Support update notice
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
            style={styles.card}
          >
            <View
              style={
                styles.sectionHeader
              }
            >
              <View
                style={
                  styles.sectionHeaderCopy
                }
              >
                <Text
                  style={
                    styles.sectionEyebrow
                  }
                >
                  NEW REQUEST
                </Text>

                <Text
                  style={
                    styles.sectionTitle
                  }
                >
                  Create a support ticket
                </Text>

                <Text
                  style={
                    styles.sectionDescription
                  }
                >
                  Select the issue type and give the
                  support team the details they need.
                </Text>
              </View>

              <View
                style={
                  styles.sectionHeaderIcon
                }
              >
                <Ionicons
                  name="create-outline"
                  size={19}
                  color={
                    UI.colors.primaryBlue
                  }
                />
              </View>
            </View>

            <View
              style={styles.field}
            >
              <Text
                style={styles.label}
              >
                Issue category
              </Text>

              <View
                style={
                  styles.categoryGrid
                }
              >
                {CATEGORIES.map(
                  item => (
                    <SupportCategoryButton
                      key={item}
                      category={item}
                      selected={
                        category ===
                        item
                      }
                      disabled={
                        submitting
                      }
                      onPress={() => {
                        setCategory(
                          item,
                        )
                        setLocalError(
                          '',
                        )
                      }}
                    />
                  ),
                )}
              </View>
            </View>

            <View
              style={styles.field}
            >
              <View
                style={
                  styles.labelRow
                }
              >
                <Text
                  style={styles.label}
                >
                  Subject
                </Text>

                <Text
                  style={
                    styles.counterText
                  }
                >
                  {subject.length}/
                  {
                    MAX_SUBJECT_LENGTH
                  }
                </Text>
              </View>

              <TextInput
                value={subject}
                onChangeText={value => {
                  setSubject(
                    value,
                  )
                  setLocalError('')
                  setError('')
                }}
                placeholder="Describe the issue briefly"
                placeholderTextColor={
                  UI.colors.textMuted
                }
                editable={
                  !submitting
                }
                maxLength={
                  MAX_SUBJECT_LENGTH
                }
                style={
                  styles.input
                }
              />
            </View>

            <View
              style={styles.field}
            >
              <Text
                style={styles.label}
              >
                Booking reference
              </Text>

              <View
                style={
                  styles.inputWithIcon
                }
              >
                <Ionicons
                  name="pricetag-outline"
                  size={18}
                  color={
                    UI.colors.textMuted
                  }
                />

                <TextInput
                  value={
                    bookingId
                  }
                  onChangeText={value => {
                    setBookingId(
                      value,
                    )
                    setLocalError('')
                    setError('')
                  }}
                  placeholder={
                    category ===
                    'booking'
                      ? 'Required for booking issues'
                      : 'Optional booking ID'
                  }
                  placeholderTextColor={
                    UI.colors.textMuted
                  }
                  autoCapitalize="none"
                  autoCorrect={
                    false
                  }
                  editable={
                    !submitting
                  }
                  style={
                    styles.inputIconText
                  }
                />
              </View>

              <Text
                style={
                  styles.helperText
                }
              >
                Add the booking ID when this issue is
                connected to a specific job.
              </Text>
            </View>

            <View
              style={styles.field}
            >
              <View
                style={
                  styles.labelRow
                }
              >
                <Text
                  style={styles.label}
                >
                  Description
                </Text>

                <Text
                  style={
                    styles.counterText
                  }
                >
                  {description.length}/
                  {
                    MAX_DESCRIPTION_LENGTH
                  }
                </Text>
              </View>

              <TextInput
                value={
                  description
                }
                onChangeText={value => {
                  setDescription(
                    value,
                  )
                  setLocalError('')
                  setError('')
                }}
                placeholder="Explain what happened and what you need help with"
                placeholderTextColor={
                  UI.colors.textMuted
                }
                multiline
                textAlignVertical="top"
                editable={
                  !submitting
                }
                maxLength={
                  MAX_DESCRIPTION_LENGTH
                }
                style={[
                  styles.input,
                  styles.multiline,
                ]}
              />
            </View>

            {localError ? (
              <View
                style={
                  styles.formError
                }
              >
                <Ionicons
                  name="alert-circle-outline"
                  size={18}
                  color={
                    UI.colors.error
                  }
                />

                <Text
                  style={
                    styles.formErrorText
                  }
                >
                  {localError}
                </Text>
              </View>
            ) : null}

            <Pressable
              onPress={() => {
                void handleSubmit()
              }}
              disabled={
                submitting
              }
              accessibilityRole="button"
              accessibilityLabel="Create support ticket"
              style={({ pressed }) => [
                styles.submitButton,
                pressed &&
                  !submitting &&
                  styles.submitButtonPressed,
                submitting &&
                  styles.submitButtonDisabled,
              ]}
            >
              <View
                style={
                  styles.submitIcon
                }
              >
                <Ionicons
                  name={
                    submitting
                      ? 'hourglass-outline'
                      : 'paper-plane-outline'
                  }
                  size={20}
                  color={
                    UI.colors.surface
                  }
                />
              </View>

              <View
                style={
                  styles.submitCopy
                }
              >
                <Text
                  style={
                    styles.submitTitle
                  }
                >
                  {submitting
                    ? 'Creating ticket...'
                    : 'Create support ticket'}
                </Text>

                <Text
                  style={
                    styles.submitSubtitle
                  }
                >
                  Send this request to KvikStaff support
                </Text>
              </View>

              {!submitting ? (
                <Ionicons
                  name="arrow-forward"
                  size={20}
                  color={
                    UI.colors.surface
                  }
                />
              ) : (
                <ActivityIndicator
                  size="small"
                  color={
                    UI.colors.surface
                  }
                />
              )}
            </Pressable>
          </View>

          <View
            style={styles.card}
          >
            <View
              style={
                styles.sectionHeader
              }
            >
              <View
                style={
                  styles.sectionHeaderCopy
                }
              >
                <Text
                  style={
                    styles.sectionEyebrow
                  }
                >
                  REQUEST HISTORY
                </Text>

                <Text
                  style={
                    styles.sectionTitle
                  }
                >
                  Your support tickets
                </Text>
              </View>

              <View
                style={
                  styles.countBadge
                }
              >
                <Text
                  style={
                    styles.countBadgeText
                  }
                >
                  {tickets.length}
                </Text>
              </View>
            </View>

            {tickets.length ===
            0 ? (
              <View
                style={
                  styles.emptyWrapper
                }
              >
                <View
                  style={
                    styles.emptyIcon
                  }
                >
                  <Ionicons
                    name="chatbubbles-outline"
                    size={28}
                    color={
                      UI.colors.primaryBlue
                    }
                  />
                </View>

                <EmptyState
                  title="No support tickets"
                  message="Your support requests will appear here after you create the first ticket."
                />
              </View>
            ) : (
              <View
                style={
                  styles.ticketList
                }
              >
                {tickets.map(
                  ticket => {
                    const categoryStyle =
                      getCategoryIconColors(
                        ticket.category,
                      )

                    return (
                      <View
                        key={
                          ticket.id
                        }
                        style={
                          styles.ticket
                        }
                      >
                        <View
                          style={
                            styles.ticketTop
                          }
                        >
                          <View
                            style={[
                              styles.ticketIcon,
                              {
                                backgroundColor:
                                  categoryStyle.backgroundColor,
                              },
                            ]}
                          >
                            <Ionicons
                              name={getCategoryIcon(
                                ticket.category,
                              )}
                              size={19}
                              color={
                                categoryStyle.color
                              }
                            />
                          </View>

                          <View
                            style={
                              styles.ticketCopy
                            }
                          >
                            <Text
                              style={
                                styles.ticketSubject
                              }
                              numberOfLines={
                                2
                              }
                            >
                              {
                                ticket.subject
                              }
                            </Text>

                            <Text
                              style={
                                styles.ticketMeta
                              }
                            >
                              {
                                getWorkerSupportCategoryLabel(
                                  ticket.category,
                                )
                              }{' '}
                              ·{' '}
                              {
                                formatDateTime(
                                  ticket.createdAt,
                                )
                              }
                            </Text>
                          </View>

                          <StatusBadge
                            label={getStatusLabel(
                              ticket.status,
                            )}
                            variant={getStatusVariant(
                              ticket.status,
                            )}
                          />
                        </View>

                        <Text
                          style={
                            styles.ticketDescription
                          }
                          numberOfLines={
                            4
                          }
                        >
                          {
                            ticket.description
                          }
                        </Text>

                        {ticket.bookingId ? (
                          <View
                            style={
                              styles.ticketBooking
                            }
                          >
                            <Ionicons
                              name="briefcase-outline"
                              size={15}
                              color={
                                UI.colors.primaryBlue
                              }
                            />

                            <Text
                              style={
                                styles.ticketBookingText
                              }
                              numberOfLines={
                                1
                              }
                            >
                              Booking{' '}
                              {
                                ticket.bookingId
                              }
                            </Text>
                          </View>
                        ) : null}

                        {ticket.adminNotes ? (
                          <View
                            style={
                              styles.adminNotes
                            }
                          >
                            <View
                              style={
                                styles.adminNotesHeader
                              }
                            >
                              <Ionicons
                                name="chatbox-ellipses-outline"
                                size={16}
                                color={
                                  UI.colors.info
                                }
                              />

                              <Text
                                style={
                                  styles.adminNotesTitle
                                }
                              >
                                Support response
                              </Text>
                            </View>

                            <Text
                              style={
                                styles.adminNotesText
                              }
                            >
                              {
                                ticket.adminNotes
                              }
                            </Text>
                          </View>
                        ) : null}

                        <View
                          style={
                            styles.ticketFooter
                          }
                        >
                          <Text
                            style={
                              styles.ticketDate
                            }
                          >
                            Created{' '}
                            {formatDateTime(
                              ticket.createdAt,
                            )}
                          </Text>

                          {ticket.resolvedAt ? (
                            <Text
                              style={
                                styles.ticketDate
                              }
                            >
                              Resolved{' '}
                              {formatDateTime(
                                ticket.resolvedAt,
                              )}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                    )
                  },
                )}
              </View>
            )}
          </View>

          <View
            style={
              styles.quickHelpCard
            }
          >
            <View
              style={
                styles.quickHelpIcon
              }
            >
              <Ionicons
                name="information-circle-outline"
                size={21}
                color={
                  UI.colors.primaryBlue
                }
              />
            </View>

            <View
              style={
                styles.quickHelpCopy
              }
            >
              <Text
                style={
                  styles.quickHelpTitle
                }
              >
                Before creating a ticket
              </Text>

              <Text
                style={
                  styles.quickHelpText
                }
              >
                Include the booking reference and explain
                exactly what happened. This helps the team
                review the request faster.
              </Text>
            </View>
          </View>

          <Text
            style={
              styles.footerText
            }
          >
            Support tickets are associated with your authenticated
            KvikStaff worker account.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  keyboard: {
    flex: 1,
  },

  content: {
    paddingHorizontal:
      UI.spacing.lg,
    paddingTop:
      UI.spacing.md,
    paddingBottom:
      UI.spacing.xxxl,
  },

  topBar: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent:
      'space-between',
  },

  headerCenter: {
    alignItems: 'center',
  },

  headerEyebrow: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
    color:
      UI.colors.primaryBlue,
  },

  headerTitle: {
    marginTop: 2,
    fontSize:
      UI.typography.bodyLarge,
    fontWeight: '900',
    color:
      UI.colors.text,
  },

  headerButton: {
    width: 44,
    height: 44,
    borderRadius:
      UI.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor:
      UI.colors.surface,
    borderWidth: 1,
    borderColor:
      UI.colors.border,
  },

  headerButtonPlaceholder: {
    width: 44,
    height: 44,
  },

  headerButtonPressed: {
    opacity: 0.7,
  },

  headerButtonDisabled: {
    opacity: 0.5,
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
    width: 52,
    height: 52,
    borderRadius:
      UI.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor:
      UI.colors.primaryBlue,
  },

  heroEyebrow: {
    marginTop:
      UI.spacing.lg,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.05,
    color:
      UI.colors.surface,
    opacity: 0.72,
  },

  heroTitle: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.title,
    lineHeight: 30,
    fontWeight: '900',
    color:
      UI.colors.surface,
  },

  heroText: {
    marginTop:
      UI.spacing.sm,
    fontSize:
      UI.typography.small,
    lineHeight: 18,
    color:
      UI.colors.surface,
    opacity: 0.76,
  },

  heroMetrics: {
    marginTop:
      UI.spacing.lg,
    paddingTop:
      UI.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor:
      'rgba(255,255,255,0.14)',
  },

  heroMetric: {
    flex: 1,
  },

  heroMetricValue: {
    fontSize:
      UI.typography.subtitle,
    fontWeight: '900',
    color:
      UI.colors.surface,
  },

  heroMetricLabel: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.caption,
    color:
      UI.colors.surface,
    opacity: 0.68,
  },

  heroMetricDivider: {
    width: 1,
    height: 30,
    backgroundColor:
      'rgba(255,255,255,0.14)',
  },

  warningBox: {
    marginTop:
      UI.spacing.lg,
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding:
      UI.spacing.md,
    borderRadius:
      UI.radius.lg,
    backgroundColor:
      UI.colors.warningBackground,
    borderWidth: 1,
    borderColor: UI.colors.warningBackground,
  },

  warningIcon: {
    width: 32,
    height: 32,
    borderRadius:
      UI.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
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
    fontWeight: '800',
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

  card: {
      backgroundColor: UI.colors.surface,
      borderRadius: UI.radius.lg,
      padding: UI.spacing.lg,
      marginBottom: UI.spacing.md,
      borderColor: UI.colors.border,
      borderWidth: 1,
      elevation: 2,
      shadowColor: UI.colors.primary,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
    },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent:
      'space-between',
  },

  sectionHeaderCopy: {
    flex: 1,
    paddingRight:
      UI.spacing.md,
  },

  sectionEyebrow: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
    color:
      UI.colors.primaryBlue,
  },

  sectionTitle: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.subtitle,
    lineHeight: 23,
    fontWeight: '800',
    color:
      UI.colors.text,
  },

  sectionDescription: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.small,
    lineHeight: 18,
    color:
      UI.colors.textSecondary,
  },

  sectionHeaderIcon: {
    width: 38,
    height: 38,
    borderRadius:
      UI.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor:
      UI.colors.infoBackground,
  },

  countBadge: {
    minWidth: 38,
    height: 38,
    paddingHorizontal:
      UI.spacing.sm,
    borderRadius:
      UI.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor:
      UI.colors.infoBackground,
  },

  countBadgeText: {
    fontSize:
      UI.typography.small,
    fontWeight: '800',
    color:
      UI.colors.primaryBlue,
  },

  field: {
    marginTop:
      UI.spacing.lg,
  },

  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent:
      'space-between',
  },

  label: {
    marginBottom:
      UI.spacing.sm,
    fontSize:
      UI.typography.small,
    fontWeight: '800',
    color:
      UI.colors.text,
  },

  counterText: {
    marginBottom:
      UI.spacing.sm,
    fontSize:
      UI.typography.caption,
    color:
      UI.colors.textMuted,
  },

  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginLeft:
      -UI.spacing.sm,
    marginTop:
      -UI.spacing.sm,
  },

  categoryCard: {
    width: '50%',
    minHeight: 86,
    marginTop:
      UI.spacing.sm,
    padding:
      UI.spacing.md,
    marginLeft:
      UI.spacing.sm,
    borderRadius:
      UI.radius.lg,
    backgroundColor:
      UI.colors.background,
    borderWidth: 1,
    borderColor:
      UI.colors.border,
  },

  categoryCardSelected: {
    backgroundColor:
      '#F4FFFD',
    borderColor:
      UI.colors.primaryBlue,
  },

  categoryCardPressed: {
    opacity: 0.72,
  },

  categoryCardDisabled: {
    opacity: 0.5,
  },

  categoryIcon: {
    width: 36,
    height: 36,
    borderRadius:
      UI.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },

  categoryTitle: {
    marginTop:
      UI.spacing.sm,
    paddingRight:
      UI.spacing.lg,
    fontSize:
      UI.typography.small,
    lineHeight: 17,
    fontWeight: '800',
    color:
      UI.colors.text,
  },

  categoryTitleSelected: {
    color:
      UI.colors.primaryBlue,
  },

  selectedMark: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 20,
    height: 20,
    borderRadius:
      UI.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor:
      UI.colors.surface,
  },

  input: {
    minHeight:
      UI.sizes.inputHeight,
    paddingHorizontal:
      UI.spacing.md,
    paddingVertical:
      UI.spacing.sm,
    borderWidth: 1,
    borderColor:
      UI.colors.inputBorder,
    borderRadius:
      UI.radius.md,
    backgroundColor:
      UI.colors.surface,
    fontSize:
      UI.typography.bodyLarge,
    color:
      UI.colors.text,
  },

  inputWithIcon: {
    minHeight:
      UI.sizes.inputHeight,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal:
      UI.spacing.md,
    borderWidth: 1,
    borderColor:
      UI.colors.inputBorder,
    borderRadius:
      UI.radius.md,
    backgroundColor:
      UI.colors.surface,
  },

  inputIconText: {
    flex: 1,
    minHeight:
      UI.sizes.inputHeight,
    marginLeft:
      UI.spacing.sm,
    fontSize:
      UI.typography.bodyLarge,
    color:
      UI.colors.text,
  },

  multiline: {
    minHeight: 132,
    paddingTop:
      UI.spacing.md,
  },

  helperText: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.caption,
    lineHeight: 16,
    color:
      UI.colors.textMuted,
  },

  formError: {
    marginTop:
      UI.spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding:
      UI.spacing.md,
    borderRadius:
      UI.radius.md,
    backgroundColor:
      UI.colors.errorBackground,
    borderWidth: 1,
    borderColor: UI.colors.errorBackground,
  },

  formErrorText: {
    flex: 1,
    marginLeft:
      UI.spacing.sm,
    fontSize:
      UI.typography.small,
    lineHeight: 18,
    color:
      UI.colors.error,
  },

  submitButton: {
    minHeight: 68,
    marginTop:
      UI.spacing.lg,
    paddingHorizontal:
      UI.spacing.md,
    paddingVertical:
      UI.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius:
      UI.radius.xl,
    backgroundColor:
      UI.colors.primaryBlue,
  },

  submitButtonPressed: {
    opacity: 0.78,
  },

  submitButtonDisabled: {
    opacity: 0.55,
  },

  submitIcon: {
    width: 42,
    height: 42,
    borderRadius:
      UI.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor:
      'rgba(255,255,255,0.14)',
  },

  submitCopy: {
    flex: 1,
    marginLeft:
      UI.spacing.md,
    paddingRight:
      UI.spacing.sm,
  },

  submitTitle: {
    fontSize:
      UI.typography.body,
    fontWeight: '900',
    color:
      UI.colors.surface,
  },

  submitSubtitle: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.caption,
    color:
      UI.colors.surface,
    opacity: 0.72,
  },

  ticketList: {
    marginTop:
      UI.spacing.sm,
  },

  ticket: {
    paddingTop:
      UI.spacing.lg,
    paddingBottom:
      UI.spacing.lg,
    borderTopWidth: 1,
    borderTopColor:
      UI.colors.border,
  },

  ticketTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },

  ticketIcon: {
    width: 44,
    height: 44,
    borderRadius:
      UI.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },

  ticketCopy: {
    flex: 1,
    marginLeft:
      UI.spacing.md,
    paddingRight:
      UI.spacing.sm,
  },

  ticketSubject: {
    fontSize:
      UI.typography.bodyLarge,
    lineHeight: 21,
    fontWeight: '800',
    color:
      UI.colors.text,
  },

  ticketMeta: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.caption,
    lineHeight: 16,
    color:
      UI.colors.textMuted,
  },

  ticketDescription: {
    marginTop:
      UI.spacing.md,
    fontSize:
      UI.typography.body,
    lineHeight: 20,
    color:
      UI.colors.textSecondary,
  },

  ticketBooking: {
    marginTop:
      UI.spacing.md,
    minHeight: 34,
    paddingHorizontal:
      UI.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius:
      UI.radius.pill,
    backgroundColor:
      UI.colors.infoBackground,
  },

  ticketBookingText: {
    maxWidth: 240,
    marginLeft:
      UI.spacing.xs,
    fontSize:
      UI.typography.caption,
    fontWeight: '700',
    color:
      UI.colors.primaryBlue,
  },

  adminNotes: {
    marginTop:
      UI.spacing.md,
    padding:
      UI.spacing.md,
    borderRadius:
      UI.radius.lg,
    backgroundColor:
      UI.colors.infoBackground,
  },

  adminNotesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  adminNotesTitle: {
    marginLeft:
      UI.spacing.xs,
    fontSize:
      UI.typography.small,
    fontWeight: '800',
    color:
      UI.colors.info,
  },

  adminNotesText: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.small,
    lineHeight: 18,
    color:
      UI.colors.textSecondary,
  },

  ticketFooter: {
    marginTop:
      UI.spacing.md,
  },

  ticketDate: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.caption,
    lineHeight: 16,
    color:
      UI.colors.textMuted,
  },

  emptyWrapper: {
    minHeight: 240,
    marginTop:
      UI.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },

  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius:
      UI.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor:
      UI.colors.infoBackground,
    marginBottom:
      UI.spacing.xs,
  },

  quickHelpCard: {
    marginTop:
      UI.spacing.lg,
    padding:
      UI.spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius:
      UI.radius.xl,
    backgroundColor:
      UI.colors.surface,
    borderWidth: 1,
    borderColor:
      UI.colors.border,
  },

  quickHelpIcon: {
    width: 42,
    height: 42,
    borderRadius:
      UI.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor:
      UI.colors.infoBackground,
  },

  quickHelpCopy: {
    flex: 1,
    marginLeft:
      UI.spacing.md,
  },

  quickHelpTitle: {
    fontSize:
      UI.typography.small,
    fontWeight: '800',
    color:
      UI.colors.text,
  },

  quickHelpText: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.small,
    lineHeight: 18,
    color:
      UI.colors.textSecondary,
  },

  footerText: {
    marginTop:
      UI.spacing.lg,
    paddingHorizontal:
      UI.spacing.sm,
    fontSize:
      UI.typography.caption,
    lineHeight: 17,
    textAlign: 'center',
    color:
      UI.colors.textMuted,
  },

  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal:
      UI.spacing.xxl,
  },

  loadingIcon: {
    width: 58,
    height: 58,
    marginBottom:
      UI.spacing.md,
    borderRadius:
      UI.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor:
      UI.colors.infoBackground,
  },

  loadingTitle: {
    marginTop:
      UI.spacing.md,
    fontSize:
      UI.typography.subtitle,
    fontWeight: '800',
    color:
      UI.colors.text,
    textAlign: 'center',
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
    textAlign: 'center',
  },
})
