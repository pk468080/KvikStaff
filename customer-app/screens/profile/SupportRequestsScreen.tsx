import {
  useCallback,
  useEffect,
  useState,
} from 'react'
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import { ScreenContainer } from '../../components/layout/ScreenContainer'
import {
  getCustomerSupportTickets,
  type CustomerSupportTicket,
} from '../../services/support/customerSupport.service'

export default function SupportRequestsScreen() {
  const [
    tickets,
    setTickets,
  ] = useState<CustomerSupportTicket[]>(
    [],
  )
  const [loading, setLoading] =
    useState(true)
  const [error, setError] =
    useState<string | null>(null)

  const load = useCallback(
    async () => {
      try {
        setLoading(true)
        setError(null)

        setTickets(
          await getCustomerSupportTickets(),
        )
      } catch (nextError) {
        setError(
          nextError instanceof Error
            ? nextError.message
            : 'Unable to load your support requests.',
        )
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  useEffect(() => {
    void load()
  }, [load])

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
        data={tickets}
        keyExtractor={item =>
          item.id
        }
        contentContainerStyle={
          tickets.length === 0
            ? styles.emptyContent
            : styles.content
        }
        refreshing={loading}
        onRefresh={() =>
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
                style={
                  styles.emptyIconText
                }
              >
                ?
              </Text>
            </View>

            <Text
              style={styles.emptyTitle}
            >
              No support requests
            </Text>

            <Text
              style={styles.emptyText}
            >
              Requests you send to TempStaff
              will appear here with their
              current status.
            </Text>
          </View>
        }
        renderItem={({
          item,
        }) => (
          <View
            style={styles.card}
          >
            <View
              style={styles.topRow}
            >
              <Text
                style={styles.category}
              >
                {formatCategory(
                  item.category,
                )}
              </Text>

              <StatusPill
                status={
                  item.status
                }
              />
            </View>

            <Text
              style={styles.subject}
            >
              {item.subject}
            </Text>

            <Text
              style={styles.description}
              numberOfLines={4}
            >
              {item.description}
            </Text>

            <Text
              style={styles.date}
            >
              Submitted{' '}
              {formatDate(
                item.createdAt,
              )}
            </Text>
          </View>
        )}
      />
    </ScreenContainer>
  )
}

function StatusPill({
  status,
}: {
  status: CustomerSupportTicket['status']
}) {
  const config =
    status === 'resolved'
      ? {
          background: '#EAF8EF',
          text: '#16803C',
          label: 'Resolved',
        }
      : status === 'closed'
        ? {
            background: '#F0F2F5',
            text: '#59616E',
            label: 'Closed',
          }
        : status === 'in_progress'
          ? {
              background: '#FFF6D9',
              text: '#946B00',
              label: 'In progress',
            }
          : {
              background: '#EEF6FF',
              text: '#007AFF',
              label: 'Open',
            }

  return (
    <View
      style={[
        styles.status,
        {
          backgroundColor:
            config.background,
        },
      ]}
    >
      <Text
        style={[
          styles.statusText,
          {
            color: config.text,
          },
        ]}
      >
        {config.label}
      </Text>
    </View>
  )
}

function formatCategory(
  category: string,
) {
  return (
    category.slice(0, 1).toUpperCase() +
    category.slice(1)
  )
}

function formatDate(
  value: string,
) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return date.toLocaleString(
    undefined,
    {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
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
    padding: 24,
  },

  card: {
    padding: 15,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8ECF2',
    marginBottom: 10,
  },

  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  category: {
    color: '#7B8492',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },

  status: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 10,
  },

  statusText: {
    fontSize: 10,
    fontWeight: '800',
  },

  subject: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '800',
    marginTop: 10,
  },

  description: {
    color: '#697281',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },

  date: {
    color: '#A0A7B2',
    fontSize: 10,
    marginTop: 10,
  },

  error: {
    color: '#B42318',
    backgroundColor: '#FFF3F2',
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
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
    marginBottom: 16,
  },

  emptyIconText: {
    color: '#007AFF',
    fontSize: 22,
    fontWeight: '800',
  },

  emptyTitle: {
    color: '#111827',
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },

  emptyText: {
    color: '#7B8492',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 8,
    maxWidth: 320,
  },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
