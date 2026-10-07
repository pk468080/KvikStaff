import {
  useCallback,
  useEffect,
  useState,
} from 'react'

import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'

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
  getWorkerEarning,
  formatWorkerEarningAmount,
  getWorkerEarningNetPercentage,
} from '../../services/earnings/workerEarnings.service'

import type {
  WorkerEarning,
} from '../../types/earnings'

type EarningDetailsScreenProps = {
  earningId: string
  onBack?: () => void
}

function formatDateTime(
  value: string | null,
): string {
  if (!value) {
    return '—'
  }

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
    undefined,
    {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    },
  )
}

function formatAmount(
  value: number,
): string {
  return formatWorkerEarningAmount(
    value,
  )
}

function calculateFeePercentage(
  earning: WorkerEarning,
): string {
  if (
    earning.grossAmount <= 0
  ) {
    return '0%'
  }

  const percentage =
    (earning.platformFee /
      earning.grossAmount) *
    100

  if (
    !Number.isFinite(
      percentage,
    )
  ) {
    return '0%'
  }

  return `${percentage.toFixed(1)}%`
}

export default function EarningDetailsScreen({
  earningId,
  onBack,
}: EarningDetailsScreenProps) {
  const [
    earning,
    setEarning,
  ] = useState<WorkerEarning | null>(
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
    error,
    setError,
  ] = useState<string | null>(
    null,
  )

  const loadEarning =
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
          const nextEarning =
            await getWorkerEarning(
              earningId,
            )

          if (!nextEarning) {
            throw new Error(
              'Earning not found or not assigned to this worker.',
            )
          }

          setEarning(
            nextEarning,
          )
        } catch (cause) {
          setError(
            cause instanceof Error
              ? cause.message
              : 'Unable to load earning details.',
          )
        } finally {
          setLoading(false)
          setRefreshing(false)
        }
      },
      [earningId],
    )

  useEffect(() => {
    void loadEarning()
  }, [
    loadEarning,
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
            Loading earning
          </Text>

          <Text
            style={
              styles.loadingText
            }
          >
            Fetching the selected worker payment...
          </Text>
        </View>
      </ScreenContainer>
    )
  }

  if (
    error &&
    !earning
  ) {
    return (
      <ScreenContainer>
        <ErrorState
          title="Earning unavailable"
          message={error}
          onAction={() => {
            void loadEarning()
          }}
        />
      </ScreenContainer>
    )
  }

  if (!earning) {
    return (
      <ScreenContainer>
        <ErrorState
          title="Earning unavailable"
          message="The requested earning could not be loaded."
          onAction={() => {
            void loadEarning()
          }}
        />
      </ScreenContainer>
    )
  }

  const netPercentage =
    getWorkerEarningNetPercentage(
      earning,
    )

  const feePercentage =
    calculateFeePercentage(
      earning,
    )

  return (
    <ScreenContainer>
      <ScrollView
        contentContainerStyle={
          styles.content
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void loadEarning(
                true,
              )
            }}
          />
        }
        showsVerticalScrollIndicator={
          false
        }
      >
        <View
          style={styles.header}
        >
          <View
            style={
              styles.headerCopy
            }
          >
            <Text
              style={
                styles.eyebrow
              }
            >
              EARNING DETAILS
            </Text>

            <Text
              style={styles.title}
            >
              Worker payment
            </Text>

            <Text
              style={
                styles.earningId
              }
            >
              {earning.id}
            </Text>
          </View>

          {onBack ? (
            <View
              style={
                styles.headerButton
              }
            >
              <AppButton
                title="Back"
                variant="secondary"
                onPress={
                  onBack
                }
              />
            </View>
          ) : null}
        </View>

        {error ? (
          <View
            style={
              styles.warningBox
            }
          >
            <Text
              style={
                styles.warningTitle
              }
            >
              Earning update notice
            </Text>

            <Text
              style={
                styles.warningText
              }
            >
              {error}
            </Text>
          </View>
        ) : null}

        <View
          style={
            styles.netCard
          }
        >
          <Text
            style={
              styles.netEyebrow
            }
          >
            NET AMOUNT
          </Text>

          <Text
            style={
              styles.netAmount
            }
          >
            {formatAmount(
              earning.netAmount,
            )}
          </Text>

          <Text
            style={
              styles.netCaption
            }
          >
            {netPercentage.toFixed(
              1,
            )}
            % of gross earning retained after platform fee
          </Text>
        </View>

        <View
          style={styles.section}
        >
          <Text
            style={
              styles.sectionTitle
            }
          >
            Payment breakdown
          </Text>

          <View
            style={
              styles.card
            }
          >
            <InfoRow
              label="Gross amount"
              value={formatAmount(
                earning.grossAmount,
              )}
            />

            <InfoDivider />

            <InfoRow
              label="Platform fee"
              value={formatAmount(
                earning.platformFee,
              )}
            />

            <Text
              style={
                styles.subtleText
              }
            >
              Platform fee represents{' '}
              {feePercentage}{' '}
              of the recorded gross amount.
            </Text>

            <InfoDivider />

            <View
              style={
                styles.totalRow
              }
            >
              <Text
                style={
                  styles.totalLabel
                }
              >
                Net amount
              </Text>

              <Text
                style={
                  styles.totalValue
                }
              >
                {formatAmount(
                  earning.netAmount,
                )}
              </Text>
            </View>
          </View>
        </View>

        <View
          style={styles.section}
        >
          <Text
            style={
              styles.sectionTitle
            }
          >
            Reference
          </Text>

          <View
            style={
              styles.card
            }
          >
            <InfoRow
              label="Booking"
              value={
                earning.bookingId
              }
            />

            <InfoDivider />

            <InfoRow
              label="Worker"
              value={
                earning.workerId
              }
            />

            <InfoDivider />

            <InfoRow
              label="Recorded at"
              value={formatDateTime(
                earning.createdAt,
              )}
            />
          </View>
        </View>

        <View
          style={
            styles.infoCard
          }
        >
          <Text
            style={
              styles.infoTitle
            }
          >
            Payment record
          </Text>

          <Text
            style={
              styles.infoText
            }
          >
            This screen shows the worker earning record stored against your authenticated KvikStaff account.
          </Text>
        </View>

        <Text
          style={
            styles.footerText
          }
        >
          Earning information is loaded for the authenticated worker only.
        </Text>
      </ScrollView>
    </ScreenContainer>
  )
}

function InfoRow({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <View
      style={
        styles.infoRow
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
        numberOfLines={2}
        style={
          styles.infoValue
        }
      >
        {value}
      </Text>
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

const styles = StyleSheet.create({
  content: {
    paddingHorizontal:
      UI.spacing.xl,
    paddingTop:
      UI.spacing.xl,
    paddingBottom:
      UI.spacing.xxxl,
  },

  header: {
    flexDirection:
      'row',
    alignItems:
      'flex-start',
    marginBottom:
      UI.spacing.lg,
  },

  headerCopy: {
    flex: 1,
    paddingRight:
      UI.spacing.md,
  },

  headerButton: {
    width: 76,
  },

  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
    color:
      UI.colors.secondary,
  },

  title: {
    marginTop:
      UI.spacing.sm,
    fontSize:
      UI.typography.title,
    lineHeight: 30,
    fontWeight: '800',
    color:
      UI.colors.text,
  },

  earningId: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.caption,
    color:
      UI.colors.textMuted,
  },

  warningBox: {
    marginBottom:
      UI.spacing.lg,
    padding:
      UI.spacing.md,
    borderRadius:
      UI.radius.md,
    backgroundColor:
      UI.colors.warningBackground,
    borderWidth: 1,
    borderColor: '#FDE68A',
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

  netCard: {
    padding:
      UI.spacing.xl,
    borderRadius:
      UI.radius.xl,
    backgroundColor:
      UI.colors.primary,
  },

  netEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
    color:
      UI.colors.surface,
    opacity: 0.72,
  },

  netAmount: {
    marginTop:
      UI.spacing.sm,
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '900',
    color:
      UI.colors.surface,
  },

  netCaption: {
    marginTop:
      UI.spacing.sm,
    fontSize:
      UI.typography.small,
    lineHeight: 18,
    color:
      UI.colors.surface,
    opacity: 0.76,
  },

  section: {
    marginTop:
      UI.spacing.xl,
  },

  sectionTitle: {
    fontSize:
      UI.typography.subtitle,
    lineHeight: 23,
    fontWeight: '800',
    color:
      UI.colors.text,
  },

  card: {
    marginTop:
      UI.spacing.md,
    padding:
      UI.spacing.lg,
    borderRadius:
      UI.radius.lg,
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
      'flex-start',
    justifyContent:
      'space-between',
    gap: UI.spacing.md,
  },

  infoLabel: {
    flex: 1,
    fontSize:
      UI.typography.small,
    color:
      UI.colors.textSecondary,
  },

  infoValue: {
    flex: 1,
    fontSize:
      UI.typography.small,
    fontWeight: '700',
    color:
      UI.colors.text,
    textAlign: 'right',
  },

  infoDivider: {
    height: 1,
    marginVertical:
      UI.spacing.md,
    backgroundColor:
      UI.colors.border,
  },

  subtleText: {
    marginTop:
      UI.spacing.sm,
    fontSize:
      UI.typography.caption,
    lineHeight: 17,
    color:
      UI.colors.textMuted,
  },

  totalRow: {
    flexDirection:
      'row',
    alignItems:
      'center',
    justifyContent:
      'space-between',
  },

  totalLabel: {
    fontSize:
      UI.typography.bodyLarge,
    fontWeight: '800',
    color:
      UI.colors.text,
  },

  totalValue: {
    fontSize:
      UI.typography.bodyLarge,
    fontWeight: '900',
    color:
      UI.colors.success,
  },

  infoCard: {
    marginTop:
      UI.spacing.xl,
    padding:
      UI.spacing.lg,
    borderRadius:
      UI.radius.lg,
    backgroundColor:
      UI.colors.infoBackground,
    borderWidth: 1,
    borderColor:
      UI.colors.info,
  },

  infoTitle: {
    fontSize:
      UI.typography.bodyLarge,
    fontWeight: '800',
    color:
      UI.colors.text,
  },

  infoText: {
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
      UI.spacing.xl,
    fontSize:
      UI.typography.caption,
    lineHeight: 16,
    color:
      UI.colors.textMuted,
    textAlign: 'center',
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
    fontWeight: '800',
    color:
      UI.colors.text,
    textAlign: 'center',
  },

  loadingText: {
    marginTop:
      UI.spacing.sm,
    fontSize:
      UI.typography.body,
    lineHeight: 20,
    color:
      UI.colors.textSecondary,
    textAlign: 'center',
  },
})