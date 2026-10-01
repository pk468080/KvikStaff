import {
  useCallback,
  useEffect,
  useState,
} from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import { ScreenContainer } from '../../components/layout/ScreenContainer'
import CustomerIcon from '../../components/ui/CustomerIcon'
import {
  deleteCustomerAddress,
  getCustomerSavedAddresses,
  type CustomerSavedAddress,
} from '../../services/addresses/customerAddress.service'

export default function SavedAddressesScreen() {
  const [
    addresses,
    setAddresses,
  ] = useState<CustomerSavedAddress[]>(
    [],
  )
  const [loading, setLoading] =
    useState(true)
  const [error, setError] =
    useState<string | null>(null)
  const [
    deletingId,
    setDeletingId,
  ] = useState<string | null>(null)

  const load = useCallback(
    async () => {
      try {
        setLoading(true)
        setError(null)

        const next =
          await getCustomerSavedAddresses()

        setAddresses(next)
      } catch (nextError) {
        setError(
          nextError instanceof Error
            ? nextError.message
            : 'Unable to load saved addresses.',
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

  function confirmDelete(
    address: CustomerSavedAddress,
  ) {
    Alert.alert(
      'Remove address',
      `Remove "${address.addressLine}" from your saved addresses?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            void handleDelete(
              address.id,
            )
          },
        },
      ],
    )
  }

  async function handleDelete(
    addressId: string,
  ) {
    if (deletingId) {
      return
    }

    try {
      setDeletingId(addressId)
      setError(null)

      await deleteCustomerAddress(
        addressId,
      )

      setAddresses(current =>
        current.filter(
          address =>
            address.id !==
            addressId,
        ),
      )
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Unable to remove the address.',
      )
    } finally {
      setDeletingId(null)
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
        data={addresses}
        keyExtractor={item =>
          item.id
        }
        contentContainerStyle={
          addresses.length === 0
            ? styles.emptyContent
            : styles.content
        }
        refreshing={loading}
        onRefresh={() =>
          void load()
        }
        ListHeaderComponent={
          addresses.length > 0 ? (
            <>
              <Text
                style={styles.title}
              >
                Your locations
              </Text>
              <Text
                style={
                  styles.subtitle
                }
              >
                These locations can be
                reused when you book a
                service.
              </Text>
              {error ? (
                <Text
                  style={styles.error}
                >
                  {error}
                </Text>
              ) : null}
            </>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <View
              style={styles.emptyIcon}
            >
              <CustomerIcon
                name="location"
                size={24}
                color="#007E80"
              />
            </View>

            <Text
              style={styles.emptyTitle}
            >
              No saved addresses
            </Text>

            <Text
              style={styles.emptyText}
            >
              Select a service location
              on Home and TempStaff will
              save it for future bookings.
            </Text>

            {error ? (
              <Text
                style={styles.error}
              >
                {error}
              </Text>
            ) : null}
          </View>
        }
        renderItem={({
          item,
        }) => (
          <View
            style={styles.card}
          >
            <View
              style={styles.icon}
            >
              <CustomerIcon
                name="location"
                size={18}
                color="#007E80"
              />
            </View>

            <View
              style={styles.copy}
            >
              <Text
                style={styles.label}
              >
                {item.label ||
                  'Saved location'}
              </Text>

              <Text
                style={
                  styles.address
                }
              >
                {item.addressLine}
              </Text>
            </View>

            <Pressable
              onPress={() =>
                confirmDelete(
                  item,
                )
              }
              disabled={
                deletingId ===
                item.id
              }
              hitSlop={8}
              style={({ pressed }) => [
                styles.remove,
                pressed &&
                  styles.removePressed,
              ]}
            >
              <Text
                style={
                  styles.removeText
                }
              >
                {deletingId ===
                item.id
                  ? '...'
                  : 'Remove'}
              </Text>
            </Pressable>
          </View>
        )}
      />
    </ScreenContainer>
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

  title: {
    color: '#111827',
    fontSize: 26,
    fontWeight: '800',
  },

  subtitle: {
    color: '#707987',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
    marginBottom: 18,
  },

  error: {
    color: '#B42318',
    backgroundColor: '#FFF3F2',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8ECF2',
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
  },

  icon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF6FF',
  },

  iconText: {
    color: '#007AFF',
    fontSize: 18,
    fontWeight: '800',
  },

  copy: {
    flex: 1,
    marginLeft: 12,
    marginRight: 10,
  },

  label: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '800',
  },

  address: {
    color: '#707987',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },

  remove: {
    paddingVertical: 8,
    paddingHorizontal: 8,
  },

  removePressed: {
    opacity: 0.6,
  },

  removeText: {
    color: '#D92D20',
    fontSize: 12,
    fontWeight: '800',
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
    fontSize: 26,
    fontWeight: '700',
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
