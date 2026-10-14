import {
  useCallback,
  useEffect,
  useState,
} from 'react'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import { ScreenContainer } from '../../components/layout/ScreenContainer'
import CustomerIcon from '../../components/ui/CustomerIcon'
import { UI } from '../../constants/ui';

import {
  getCustomerNotifications,
  markCustomerNotificationRead,
  type CustomerNotification,
} from '../../services/notifications/customerNotifications.service'

export default function NotificationsScreen({
  onOpenBooking,
}: {
  onOpenBooking: (
    bookingId: string,
  ) => void
}) {
  const [
    notifications,
    setNotifications,
  ] = useState<
    CustomerNotification[]
  >([])

  const [loading, setLoading] =
    useState(true)

  const [error, setError] =
    useState<string | null>(null)

  const load = useCallback(
    async () => {
      try {
        setLoading(true)
        setError(null)

        const data =
          await getCustomerNotifications()

        setNotifications(data)
      } catch (nextError) {
        setError(
          nextError instanceof Error
            ? nextError.message
            : 'Unable to load notifications.',
        )
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  async function openNotification(
    notification: CustomerNotification,
  ) {
    if (!notification.isRead) {
      try {
        await markCustomerNotificationRead(
          notification.id,
        )

        setNotifications(
          current =>
            current.map(
              item =>
                item.id ===
                notification.id
                  ? {
                      ...item,
                      isRead: true,
                    }
                  : item,
            ),
        )
      } catch {
        // The notification can still be opened
        // when marking it read fails.
      }
    }

    if (notification.bookingId) {
      onOpenBooking(
        notification.bookingId,
      )
    }
  }

  if (loading) {
    return (
      <ScreenContainer
        style={styles.screen}
      >
        <View style={styles.center}>
          <ActivityIndicator
            size="large"
          />
        </View>
      </ScreenContainer>
    )
  }

  return (
    <ScreenContainer
      style={styles.screen}
    >
      <FlatList
        data={notifications}
        keyExtractor={item =>
          item.id
        }
        contentContainerStyle={
          notifications.length ===
          0
            ? styles.emptyContent
            : styles.content
        }
        refreshing={loading}
        onRefresh={() =>
          // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
        }
        ListHeaderComponent={
          error ? (
            <Text
              style={styles.error}
            >
              {error}
            </Text>
          ) : null
        }
        ListEmptyComponent={
          <View
            style={styles.empty}
          >
            <View
              style={styles.emptyIcon}
            >
              <Text
                style={styles.emptyIconText}
              >
                N
              </Text>
            </View>

            <Text
              style={styles.emptyTitle}
            >
              No notifications
            </Text>

            <Text
              style={styles.emptyText}
            >
              Booking, payment and service
              updates will appear here.
            </Text>
          </View>
        }
        renderItem={({
          item,
        }) => (
          <Pressable
            onPress={() =>
              void openNotification(
                item,
              )
            }
            style={({ pressed }) => [
              styles.card,
              !item.isRead &&
                styles.unreadCard,
              pressed &&
                styles.pressed,
            ]}
          >
            <View
              style={[
                styles.icon,
                !item.isRead &&
                  styles.unreadIcon,
              ]}
            >
              <Text
                style={styles.iconText}
              >
                {getTypeIcon(
                  item.notificationType,
                )}
              </Text>
            </View>

            <View
              style={styles.copy}
            >
              <View
                style={styles.titleRow}
              >
                <Text
                  style={styles.title}
                  numberOfLines={1}
                >
                  {item.title}
                </Text>

                {!item.isRead ? (
                  <View
                    style={styles.dot}
                  />
                ) : null}
              </View>

              <Text
                style={styles.message}
                numberOfLines={3}
              >
                {item.message}
              </Text>

              <Text
                style={styles.date}
              >
                {formatNotificationDate(
                  item.createdAt,
                )}
              </Text>
            </View>

            {item.bookingId ? (
              <CustomerIcon
                name="chevron-right"
                size={15}
                color="#9AA9B1"
              />
            ) : null}
          </Pressable>
        )}
      />
    </ScreenContainer>
  )
}

function getTypeIcon(
  type: string,
) {
  if (
    type.includes('payment')
  ) {
    return '₹'
  }

  if (
    type.includes('worker') ||
    type.includes('assigned')
  ) {
    return 'W'
  }

  if (
    type.includes('cancel')
  ) {
    return '!'
  }

  if (
    type.includes('completed') ||
    type.includes('started')
  ) {
    return '✓'
  }

  return 'N'
}

function formatNotificationDate(
  value: string,
) {
  const date =
    new Date(value)

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return ''
  }

  return date.toLocaleString(
    undefined,
    {
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
    },
  )
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#F7F9FC',
  },

  content: {
    padding: 18,
    paddingBottom: 32,
  },

  emptyContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: UI.spacing.xxl,
  },

  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    marginBottom: 10,
    borderRadius: 18,
    backgroundColor: UI.colors.surface,
    borderWidth: 1,
    borderColor: '#E8ECF2',
  },

  unreadCard: {
    borderColor: '#DCEBFF',
    backgroundColor: '#FAFCFF',
  },

  pressed: {
    opacity: 0.86,
  },

  icon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0F2F5',
  },

  unreadIcon: {
    backgroundColor: '#EAF3FF',
  },

  iconText: {
    color: '#007AFF',
    fontSize: UI.typography.bodyLarge,
    fontWeight: '800',
  },

  copy: {
    flex: 1,
    marginLeft: 12,
    marginRight: 6,
  },

  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  title: {
    flex: 1,
    color: UI.colors.text,
    fontSize: UI.typography.body,
    fontWeight: '800',
  },

  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 8,
    backgroundColor: '#007AFF',
  },

  message: {
    color: '#697281',
    fontSize: UI.typography.small,
    lineHeight: 18,
    marginTop: UI.spacing.xs,
  },

  date: {
    color: '#A0A7B2',
    fontSize: 10,
    marginTop: 7,
  },

  error: {
    color: '#B42318',
    backgroundColor: '#FFF3F2',
    padding: UI.spacing.md,
    borderRadius: UI.radius.md,
    marginBottom: UI.spacing.md,
  },

  empty: {
    alignItems: 'center',
  },

  emptyIcon: {
    width: 70,
    height: 70,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF6FF',
    marginBottom: UI.spacing.lg,
  },

  emptyIconText: {
    color: '#007AFF',
    fontSize: 22,
    fontWeight: '800',
  },

  emptyTitle: {
    color: UI.colors.text,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },

  emptyText: {
    color: '#7B8492',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: UI.spacing.sm,
    maxWidth: 320,
  },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
})