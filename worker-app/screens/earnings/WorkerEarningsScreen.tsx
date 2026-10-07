import {
  useMemo,
} from 'react'

import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import {
  AppButton,
} from '../../components/ui/AppButton'
import WorkerPayoutPanel from '../../components/earnings/WorkerPayoutPanel'

import {
  ScreenContainer,
} from '../../components/layout/ScreenContainer'

import EmptyState from '../../components/ui/EmptyState'

import ErrorState from '../../components/ui/ErrorState'

import {
  UI,
} from '../../constants/ui'

import {
  useWorkerEarnings,
} from '../../hooks/useWorkerEarnings'

import {
  formatWorkerEarningAmount,
} from '../../services/earnings/workerEarnings.service'

import type {
  WorkerEarning,
} from '../../types/earnings'

type WorkerEarningsScreenProps = {
  onEarningPress?: (
    earningId: string,
  ) => void
  onBack?: () => void
}

function formatDate(
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

  return date.toLocaleDateString(
    undefined,
    {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    },
  )
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

function formatSummaryAmount(
  value: number,
): string {
  return formatWorkerEarningAmount(
    value,
  )
}

function sortEarnings(
  earnings: WorkerEarning[],
): WorkerEarning[] {
  return [
    ...earnings,
  ].sort(
    (a, b) =>
      new Date(
        b.createdAt,
      ).getTime() -
      new Date(
        a.createdAt,
      ).getTime(),
  )
}

export default function WorkerEarningsScreen({
  onEarningPress,
  onBack,
}: WorkerEarningsScreenProps) {
  const {
    earnings,
    summary,
    loading,
    error,
    refresh,
  } = useWorkerEarnings()

  const sortedEarnings =
    useMemo(
      () =>
        sortEarnings(
          earnings,
        ),
      [earnings],
    )

  const effectiveSummary =
    summary ?? {
      totalGrossAmount: 0,
      totalPlatformFee: 0,
      totalNetAmount: 0,
      earningCount:
        earnings.length,
    }

  function handleRefresh() {
    void refresh()
  }

  if (
    loading &&
    earnings.length === 0
  ) {
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
            Loading your earnings
          </Text>

          <Text
            style={
              styles.loadingText
            }
          >
            Fetching your recent worker earnings...
          </Text>
        </View>
      </ScreenContainer>
    )
  }

  if (
    error &&
    earnings.length === 0
  ) {
    return (
      <ScreenContainer>
        <ErrorState
          title="Earnings unavailable"
          message={error}
          onAction={
            handleRefresh
          }
        />
      </ScreenContainer>
    )
  }

  return (
    <ScreenContainer>
      <ScrollView
        contentContainerStyle={
          styles.content
        }
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={
              handleRefresh
            }
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
              WORKER PAYMENTS
            </Text>

            <Text
              style={styles.title}
            >
              Earnings
            </Text>

            <Text
              style={
                styles.subtitle
              }
            >
              Review gross earnings, platform fees and your net amount.
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
              Earnings update notice
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
            styles.summaryCard
          }
        >
          <Text
            style={
              styles.summaryEyebrow
            }
          >
            NET EARNINGS
          </Text>

          <Text
            style={
              styles.summaryNet
            }
          >
            {formatSummaryAmount(
              effectiveSummary.totalNetAmount,
            )}
          </Text>

          <Text
            style={
              styles.summaryCaption
            }
          >
            Based on {effectiveSummary.earningCount}{' '}
            {effectiveSummary.earningCount ===
            1
              ? 'earning'
              : 'earnings'}
          </Text>

          <View
            style={
              styles.summaryGrid
            }
          >
            <View
              style={
                styles.summaryItem
              }
            >
              <Text
                style={
                  styles.summaryLabel
                }
              >
                Gross
              </Text>

              <Text
                style={
                  styles.summaryValue
                }
              >
                {formatSummaryAmount(
                  effectiveSummary.totalGrossAmount,
                )}
              </Text>
            </View>

            <View
              style={
                styles.summaryDivider
              }
            />

            <View
              style={
                styles.summaryItem
              }
            >
              <Text
                style={
                  styles.summaryLabel
                }
              >
                Platform fee
              </Text>

              <Text
                style={
                  styles.summaryValue
                }
              >
                {formatSummaryAmount(
                  effectiveSummary.totalPlatformFee,
                )}
              </Text>
            </View>
          </View>
        </View>

        <WorkerPayoutPanel
          formatAmount={formatSummaryAmount}
        />

        <View
          style={styles.sectionHeader}
        >
          <View>
            <Text
              style={
                styles.sectionTitle
              }
            >
              Earning history
            </Text>

            <Text
              style={
                styles.sectionSubtitle
              }
            >
              Most recent earnings first
            </Text>
          </View>

          <Text
            style={
              styles.sectionCount
            }
          >
            {sortedEarnings.length}
          </Text>
        </View>

        {sortedEarnings.length ===
        0 ? (
          <View
            style={
              styles.emptyWrapper
            }
          >
            <EmptyState
              title="No earnings yet"
              message="Completed worker payments will appear here when earnings are recorded."
              actionLabel="Refresh"
              onAction={
                handleRefresh
              }
            />
          </View>
        ) : (
          <View
            style={styles.list}
          >
            {sortedEarnings.map(
              earning => {
                return (
                  <Pressable
                    key={
                      earning.id
                    }
                    disabled={
                      !onEarningPress
                    }
                    onPress={() => {
                      onEarningPress?.(
                        earning.id,
                      )
                    }}
                    style={({
                      pressed,
                    }) => [
                      styles.earningCard,
                      pressed &&
                        onEarningPress &&
                        styles.earningPressed,
                    ]}
                  >
                    <View
                      style={
                        styles.earningHeader
                      }
                    >
                      <View
                        style={
                          styles.earningCopy
                        }
                      >
                        <Text
                          style={
                            styles.earningDate
                          }
                        >
                          {formatDate(
                            earning.createdAt,
                          )}
                        </Text>

                        <Text
                          style={
                            styles.earningTime
                          }
                        >
                          {formatDateTime(
                            earning.createdAt,
                          )}
                        </Text>
                      </View>

                      <View
                        style={
                          styles.netCopy
                        }
                      >
                        <Text
                          style={
                            styles.netLabel
                          }
                        >
                          Net
                        </Text>

                        <Text
                          style={
                            styles.netAmount
                          }
                        >
                          {formatSummaryAmount(
                            earning.netAmount,
                          )}
                        </Text>
                      </View>
                    </View>

                    <View
                      style={
                        styles.detailsGrid
                      }
                    >
                      <View
                        style={
                          styles.detailItem
                        }
                      >
                        <Text
                          style={
                            styles.detailLabel
                          }
                        >
                          Booking
                        </Text>

                        <Text
                          numberOfLines={1}
                          style={
                            styles.detailValue
                          }
                        >
                          {earning.bookingId}
                        </Text>
                      </View>

                      <View
                        style={
                          styles.detailItem
                        }
                      >
                        <Text
                          style={
                            styles.detailLabel
                          }
                        >
                          Gross
                        </Text>

                        <Text
                          style={
                            styles.detailValue
                          }
                        >
                          {formatSummaryAmount(
                            earning.grossAmount,
                          )}
                        </Text>
                      </View>

                      <View
                        style={
                          styles.detailItem
                        }
                      >
                        <Text
                          style={
                            styles.detailLabel
                          }
                        >
                          Fee
                        </Text>

                        <Text
                          style={
                            styles.detailValue
                          }
                        >
                          {formatSummaryAmount(
                            earning.platformFee,
                          )}
                        </Text>
                      </View>
                    </View>

                    {onEarningPress ? (
                      <View
                        style={
                          styles.cardFooter
                        }
                      >
                        <Text
                          style={
                            styles.openText
                          }
                        >
                          View earning details
                        </Text>
                      </View>
                    ) : null}
                  </Pressable>
                )
              },
            )}
          </View>
        )}

        <Text
          style={
            styles.footerText
          }
        >
          Earnings are loaded from the authenticated KvikStaff worker account.
        </Text>
      </ScrollView>
    </ScreenContainer>
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

  subtitle: {
    marginTop:
      UI.spacing.sm,
    fontSize:
      UI.typography.body,
    lineHeight: 21,
    color:
      UI.colors.textSecondary,
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

  summaryCard: {
    padding:
      UI.spacing.xl,
    borderRadius:
      UI.radius.xl,
    backgroundColor:
      UI.colors.primary,
  },

  summaryEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
    color:
      UI.colors.surface,
    opacity: 0.72,
  },

  summaryNet: {
    marginTop:
      UI.spacing.sm,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '900',
    color:
      UI.colors.surface,
  },

  summaryCaption: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.small,
    color:
      UI.colors.surface,
    opacity: 0.76,
  },

  summaryGrid: {
    flexDirection:
      'row',
    alignItems:
      'center',
    marginTop:
      UI.spacing.xl,
    paddingTop:
      UI.spacing.lg,
    borderTopWidth: 1,
    borderTopColor:
      'rgba(255,255,255,0.16)',
  },

  summaryItem: {
    flex: 1,
  },

  summaryDivider: {
    width: 1,
    height: 38,
    backgroundColor:
      'rgba(255,255,255,0.16)',
    marginHorizontal:
      UI.spacing.md,
  },

  summaryLabel: {
    fontSize:
      UI.typography.caption,
    color:
      UI.colors.surface,
    opacity: 0.7,
  },

  summaryValue: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.bodyLarge,
    fontWeight: '800',
    color:
      UI.colors.surface,
  },

  sectionHeader: {
    flexDirection:
      'row',
    alignItems:
      'center',
    justifyContent:
      'space-between',
    marginTop:
      UI.spacing.xl,
    marginBottom:
      UI.spacing.md,
  },

  sectionTitle: {
    fontSize:
      UI.typography.subtitle,
    lineHeight: 23,
    fontWeight: '800',
    color:
      UI.colors.text,
  },

  sectionSubtitle: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.small,
    color:
      UI.colors.textSecondary,
  },

  sectionCount: {
    minWidth: 36,
    height: 36,
    paddingHorizontal:
      UI.spacing.sm,
    borderRadius:
      UI.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    textAlignVertical: 'center',
    fontSize:
      UI.typography.small,
    fontWeight: '800',
    color:
      UI.colors.secondary,
    backgroundColor:
      UI.colors.infoBackground,
    overflow: 'hidden',
  },

  list: {
    gap: UI.spacing.md,
  },

  earningCard: {
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

  earningPressed: {
    opacity: 0.82,
  },

  earningHeader: {
    flexDirection:
      'row',
    alignItems:
      'flex-start',
  },

  earningCopy: {
    flex: 1,
    paddingRight:
      UI.spacing.md,
  },

  earningDate: {
    fontSize:
      UI.typography.bodyLarge,
    fontWeight: '800',
    color:
      UI.colors.text,
  },

  earningTime: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.caption,
    color:
      UI.colors.textMuted,
  },

  netCopy: {
    alignItems:
      'flex-end',
  },

  netLabel: {
    fontSize:
      UI.typography.caption,
    color:
      UI.colors.textMuted,
  },

  netAmount: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.bodyLarge,
    fontWeight: '900',
    color:
      UI.colors.success,
  },

  detailsGrid: {
    flexDirection:
      'row',
    marginTop:
      UI.spacing.lg,
    paddingTop:
      UI.spacing.md,
    borderTopWidth: 1,
    borderTopColor:
      UI.colors.border,
  },

  detailItem: {
    flex: 1,
    paddingRight:
      UI.spacing.sm,
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
    fontWeight: '700',
    color:
      UI.colors.text,
  },

  cardFooter: {
    marginTop:
      UI.spacing.md,
    paddingTop:
      UI.spacing.md,
    borderTopWidth: 1,
    borderTopColor:
      UI.colors.border,
  },

  openText: {
    fontSize:
      UI.typography.small,
    fontWeight: '800',
    color:
      UI.colors.secondary,
  },

  emptyWrapper: {
    minHeight: 360,
    marginTop:
      UI.spacing.md,
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