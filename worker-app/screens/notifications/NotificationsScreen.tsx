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
  Ionicons,
} from '@expo/vector-icons'

import {
  ScreenContainer,
} from '../../components/layout/ScreenContainer'

import EmptyState from '../../components/ui/EmptyState'

import ErrorState from '../../components/ui/ErrorState'

import StatusBadge from '../../components/ui/StatusBadge'

import {
  UI,
} from '../../constants/ui'

import {
  useWorkerNotifications,
} from '../../hooks/useWorkerNotifications'

import {
  getNotificationTypeLabel,
  getRelativeNotificationTime,
} from '../../lib/notificationUtils'

type NotificationsScreenProps = {
  onBack?: () => void
  onBookingPress?: (
    bookingId: string,
  ) => void
  onBookingOfferPress?: (
    bookingId: string,
  ) => void
}

function getNotificationIcon(
  notificationType: string,
): keyof typeof Ionicons.glyphMap {
  switch (notificationType) {
    case 'booking_offer':
      return 'briefcase-outline'

    case 'booking_assigned':
    case 'booking_confirmed':
      return 'checkmark-circle-outline'

    case 'booking_cancelled':
    case 'booking_expired':
      return 'close-circle-outline'

    case 'booking_reminder':
      return 'alarm-outline'

    case 'payment':
    case 'earning':
      return 'wallet-outline'

    case 'account':
    case 'profile':
      return 'person-outline'

    default:
      return 'notifications-outline'
  }
}

function getNotificationIconStyle(
  isRead: boolean,
): {
  backgroundColor: string
  color: string
} {
  if (!isRead) {
    return {
      backgroundColor:
        UI.colors.infoBackground,
      color:
        UI.colors.secondary,
    }
  }

  return {
    backgroundColor:
      UI.colors.background,
    color:
      UI.colors.textMuted,
  }
}

export default function NotificationsScreen({
  onBack,
  onBookingPress,
  onBookingOfferPress,
}: NotificationsScreenProps) {
  const {
    notifications,
    unreadCount,
    loading,
    updating,
    error,
    refresh,
  } = useWorkerNotifications()

  function handleRefresh() {
    void refresh()
  }

  if (
    loading &&
    notifications.length === 0
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
              name="notifications-outline"
              size={28}
              color={
                UI.colors.secondary
              }
            />
          </View>

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
            Loading notifications
          </Text>

          <Text
            style={
              styles.loadingText
            }
          >
            Fetching your latest TempStaff updates...
          </Text>
        </View>
      </ScreenContainer>
    )
  }

  if (
    error &&
    notifications.length === 0
  ) {
    return (
      <ScreenContainer>
        <ErrorState
          title="Notifications unavailable"
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
            refreshing={
              loading ||
              updating
            }
            onRefresh={
              handleRefresh
            }
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
                styles.headerButton,
                pressed &&
                  styles.headerButtonPressed,
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
              Notifications
            </Text>
          </View>

          <Pressable
            onPress={
              handleRefresh
            }
            disabled={
              loading ||
              updating
            }
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Refresh notifications"
            style={({ pressed }) => [
              styles.headerButton,
              pressed &&
                styles.headerButtonPressed,
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
              styles.heroTop
            }
          >
            <View
              style={
                styles.heroIcon
              }
            >
              <Ionicons
                name="notifications"
                size={25}
                color={
                  UI.colors.primary
                }
              />
            </View>

            <StatusBadge
              label={
                unreadCount > 0
                  ? `${unreadCount} unread`
                  : 'All caught up'
              }
              variant={
                unreadCount > 0
                  ? 'warning'
                  : 'success'
              }
            />
          </View>

          <Text
            style={
              styles.heroEyebrow
            }
          >
            NOTIFICATION CENTER
          </Text>

          <Text
            style={
              styles.heroTitle
            }
          >
            Stay up to date
          </Text>

          <Text
            style={
              styles.heroSubtitle
            }
          >
            New work opportunities, booking updates and account activity will appear here.
          </Text>

          <View
            style={
              styles.heroMeta
            }
          >
            <View
              style={
                styles.heroMetaItem
              }
            >
              <Ionicons
                name="notifications-outline"
                size={16}
                color={
                  UI.colors.surface
                }
              />

              <Text
                style={
                  styles.heroMetaText
                }
              >
                {notifications.length}{' '}
                total
              </Text>
            </View>

            <View
              style={
                styles.heroMetaDivider
              }
            />

            <View
              style={
                styles.heroMetaItem
              }
            >
              <Ionicons
                name="ellipse"
                size={10}
                color={
                  UI.colors.accent
                }
              />

              <Text
                style={
                  styles.heroMetaText
                }
              >
                {unreadCount}{' '}
                unread
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
                Notification update notice
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

        {notifications.length ===
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
                name="notifications-off-outline"
                size={30}
                color={
                  UI.colors.secondary
                }
              />
            </View>

            <EmptyState
              title="No notifications yet"
              message="New booking offers and worker account updates will appear here."
              actionLabel="Refresh"
              onAction={
                handleRefresh
              }
            />
          </View>
        ) : (
          <View
            style={
              styles.listSection
            }
          >
            <View
              style={
                styles.listHeader
              }
            >
              <View>
                <Text
                  style={
                    styles.sectionEyebrow
                  }
                >
                  RECENT ACTIVITY
                </Text>

                <Text
                  style={
                    styles.sectionTitle
                  }
                >
                  Your notifications
                </Text>
              </View>

              <View
                style={
                  styles.listCount
                }
              >
                <Text
                  style={
                    styles.listCountText
                  }
                >
                  {notifications.length}
                </Text>
              </View>
            </View>

            <View
              style={
                styles.list
              }
            >
              {notifications.map(
                notification => {
                  const typeLabel =
                    getNotificationTypeLabel(
                      notification.notificationType,
                    )

                  const isBookingOffer =
                    notification.notificationType ===
                    'booking_offer'

                  const canOpenBooking =
                    Boolean(
                      notification.bookingId &&
                        onBookingPress,
                    )

                  const canOpenOffer =
                    Boolean(
                      notification.bookingId &&
                        isBookingOffer &&
                        onBookingOfferPress,
                    )

                  const iconStyle =
                    getNotificationIconStyle(
                      notification.isRead,
                    )

                  return (
                    <Pressable
                      key={
                        notification.id
                      }
                      disabled={
                        !canOpenBooking &&
                        !canOpenOffer
                      }
                      onPress={() => {
                        if (
                          canOpenOffer &&
                          notification.bookingId
                        ) {
                          onBookingOfferPress?.(
                            notification.bookingId,
                          )
                          return
                        }

                        if (
                          canOpenBooking &&
                          notification.bookingId
                        ) {
                          onBookingPress?.(
                            notification.bookingId,
                          )
                        }
                      }}
                      accessibilityRole={
                        canOpenBooking ||
                        canOpenOffer
                          ? 'button'
                          : undefined
                      }
                      accessibilityLabel={
                        notification.title
                      }
                      style={({ pressed }) => [
                        styles.notificationCard,
                        !notification.isRead &&
                          styles.notificationCardUnread,
                        pressed &&
                          (canOpenBooking ||
                            canOpenOffer) &&
                          styles.notificationPressed,
                      ]}
                    >
                      <View
                        style={
                          styles.notificationTop
                        }
                      >
                        <View
                          style={[
                            styles.notificationIcon,
                            {
                              backgroundColor:
                                iconStyle.backgroundColor,
                            },
                          ]}
                        >
                          <Ionicons
                            name={getNotificationIcon(
                              notification.notificationType,
                            )}
                            size={21}
                            color={
                              iconStyle.color
                            }
                          />
                        </View>

                        <View
                          style={
                            styles.notificationMain
                          }
                        >
                          <View
                            style={
                              styles.notificationMeta
                            }
                          >
                            <Text
                              style={
                                notification.isRead
                                  ? styles.typeText
                                  : styles.typeTextUnread
                              }
                            >
                              {typeLabel}
                            </Text>

                            <Text
                              style={
                                styles.timeText
                              }
                            >
                              {getRelativeNotificationTime(
                                notification.createdAt,
                              )}
                            </Text>
                          </View>

                          <View
                            style={
                              styles.titleRow
                            }
                          >
                            <Text
                              style={
                                styles.notificationTitle
                              }
                            >
                              {notification.title}
                            </Text>

                            {!notification.isRead ? (
                              <View
                                style={
                                  styles.unreadDot
                                }
                              />
                            ) : null}
                          </View>
                        </View>
                      </View>

                      <Text
                        style={
                          styles.notificationMessage
                        }
                      >
                        {notification.message}
                      </Text>

                      {canOpenOffer ? (
                        <View
                          style={
                            styles.cardAction
                          }
                        >
                          <Text
                            style={
                              styles.cardActionText
                            }
                          >
                            Open job offer
                          </Text>

                          <Ionicons
                            name="chevron-forward"
                            size={18}
                            color={
                              UI.colors.secondary
                            }
                          />
                        </View>
                      ) : canOpenBooking ? (
                        <View
                          style={
                            styles.cardAction
                          }
                        >
                          <Text
                            style={
                              styles.cardActionText
                            }
                          >
                            Open booking
                          </Text>

                          <Ionicons
                            name="chevron-forward"
                            size={18}
                            color={
                              UI.colors.secondary
                            }
                          />
                        </View>
                      ) : null}
                    </Pressable>
                  )
                },
              )}
            </View>
          </View>
        )}

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

  headerButton: {
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

  headerButtonPlaceholder: {
    width: 44,
    height: 44,
  },

  headerButtonPressed: {
    opacity: 0.7,
  },

  topBarCenter: {
    alignItems:
      'center',
  },

  topBarEyebrow: {
    fontSize: 9,
    fontWeight:
      '800',
    letterSpacing:
      1,
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

  heroTop: {
    flexDirection:
      'row',
    alignItems:
      'center',
    justifyContent:
      'space-between',
  },

  heroIcon: {
    width: 56,
    height: 56,
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
    letterSpacing:
      1.1,
    color:
      UI.colors.surface,
    opacity:
      0.72,
  },

  heroTitle: {
    marginTop:
      UI.spacing.sm,
    fontSize: 26,
    lineHeight:
      32,
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
    lineHeight:
      18,
    color:
      UI.colors.surface,
    opacity:
      0.76,
  },

  heroMeta: {
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

  heroMetaItem: {
    flexDirection:
      'row',
    alignItems:
      'center',
  },

  heroMetaText: {
    marginLeft:
      UI.spacing.xs,
    fontSize:
      UI.typography.small,
    fontWeight:
      '700',
    color:
      UI.colors.surface,
    opacity:
      0.82,
  },

  heroMetaDivider: {
    width: 1,
    height: 18,
    marginHorizontal:
      UI.spacing.md,
    backgroundColor:
      'rgba(255,255,255,0.18)',
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
    lineHeight:
      18,
    color:
      UI.colors.textSecondary,
  },

  listSection: {
    marginTop:
      UI.spacing.xxl,
  },

  listHeader: {
    flexDirection:
      'row',
    alignItems:
      'center',
    justifyContent:
      'space-between',
    marginBottom:
      UI.spacing.md,
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
    lineHeight:
      23,
    fontWeight:
      '800',
    color:
      UI.colors.text,
  },

  listCount: {
    minWidth: 36,
    height: 36,
    paddingHorizontal:
      UI.spacing.sm,
    borderRadius:
      UI.radius.pill,
    alignItems:
      'center',
    justifyContent:
      'center',
    backgroundColor:
      UI.colors.infoBackground,
  },

  listCountText: {
    fontSize:
      UI.typography.small,
    fontWeight:
      '800',
    color:
      UI.colors.secondary,
  },

  list: {
    gap:
      UI.spacing.sm,
  },

  notificationCard: {
    padding:
      UI.spacing.lg,
    borderRadius:
      UI.radius.xl,
    backgroundColor:
      UI.colors.surface,
    borderWidth: 1,
    borderColor:
      UI.colors.border,
  },

  notificationCardUnread: {
    borderColor:
      UI.colors.secondary,
    backgroundColor:
      '#F8FFFE',
  },

  notificationPressed: {
    opacity:
      0.78,
  },

  notificationTop: {
    flexDirection:
      'row',
    alignItems:
      'flex-start',
  },

  notificationIcon: {
    width: 46,
    height: 46,
    borderRadius:
      UI.radius.lg,
    alignItems:
      'center',
    justifyContent:
      'center',
  },

  notificationMain: {
    flex: 1,
    marginLeft:
      UI.spacing.md,
  },

  notificationMeta: {
    flexDirection:
      'row',
    alignItems:
      'center',
    justifyContent:
      'space-between',
  },

  typeText: {
    fontSize:
      UI.typography.caption,
    fontWeight:
      '800',
    color:
      UI.colors.textMuted,
  },

  typeTextUnread: {
    fontSize:
      UI.typography.caption,
    fontWeight:
      '800',
    color:
      UI.colors.secondary,
  },

  timeText: {
    marginLeft:
      UI.spacing.sm,
    fontSize:
      UI.typography.caption,
    color:
      UI.colors.textMuted,
  },

  titleRow: {
    flexDirection:
      'row',
    alignItems:
      'flex-start',
    marginTop:
      UI.spacing.xs,
  },

  notificationTitle: {
    flex: 1,
    fontSize:
      UI.typography.bodyLarge,
    lineHeight:
      21,
    fontWeight:
      '800',
    color:
      UI.colors.text,
  },

  unreadDot: {
    width: 8,
    height: 8,
    marginTop: 6,
    marginLeft:
      UI.spacing.sm,
    borderRadius:
      UI.radius.pill,
    backgroundColor:
      UI.colors.accent,
  },

  notificationMessage: {
    marginTop:
      UI.spacing.md,
    fontSize:
      UI.typography.body,
    lineHeight:
      20,
    color:
      UI.colors.textSecondary,
  },

  cardAction: {
    flexDirection:
      'row',
    alignItems:
      'center',
    justifyContent:
      'flex-end',
    marginTop:
      UI.spacing.md,
    paddingTop:
      UI.spacing.md,
    borderTopWidth: 1,
    borderTopColor:
      UI.colors.border,
  },

  cardActionText: {
    marginRight:
      UI.spacing.xs,
    fontSize:
      UI.typography.small,
    fontWeight:
      '800',
    color:
      UI.colors.secondary,
  },

  emptyWrapper: {
    minHeight: 360,
    marginTop:
      UI.spacing.xxl,
    padding:
      UI.spacing.lg,
    borderRadius:
      UI.radius.xl,
    alignItems:
      'center',
    justifyContent:
      'center',
    backgroundColor:
      UI.colors.background,
    borderWidth: 1,
    borderColor:
      UI.colors.border,
  },

  emptyIcon: {
    width: 60,
    height: 60,
    marginBottom:
      UI.spacing.sm,
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

  loadingContainer: {
    flex: 1,
    alignItems:
      'center',
    justifyContent:
      'center',
    paddingHorizontal:
      UI.spacing.xxl,
  },

  loadingIcon: {
    width: 58,
    height: 58,
    marginBottom:
      UI.spacing.lg,
    borderRadius:
      UI.radius.pill,
    alignItems:
      'center',
    justifyContent:
      'center',
    backgroundColor:
      UI.colors.infoBackground,
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
    lineHeight:
      20,
    color:
      UI.colors.textSecondary,
    textAlign:
      'center',
  },

  bottomSpacing: {
    height:
      UI.spacing.xxl,
  },
})
