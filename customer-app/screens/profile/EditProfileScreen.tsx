import {
  useCallback,
  useEffect,
  useState,
} from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

import { ScreenContainer } from '../../components/layout/ScreenContainer'
import {
  createCustomerProfile,
  getCurrentCustomerProfile,
} from '../../services/auth/auth.service'

const MAX_NAME_LENGTH = 100
const MAX_COMPANY_NAME_LENGTH = 150

export default function EditProfileScreen({
  navigation,
}: any) {
  const [name, setName] = useState('')
  const [companyName, setCompanyName] =
    useState('')
  const [phone, setPhone] =
    useState('')

  const [loading, setLoading] =
    useState(true)
  const [saving, setSaving] =
    useState(false)
  const [error, setError] =
    useState<string | null>(null)

  const load = useCallback(
    async () => {
      try {
        setLoading(true)

        const profile =
          await getCurrentCustomerProfile()

        if (!profile) {
          throw new Error(
            'Your customer profile could not be found.',
          )
        }

        setName(
          profile.full_name ?? '',
        )
        setCompanyName(
          profile.company_name ??
            '',
        )
        setPhone(
          profile.phone ?? '',
        )
        setError(null)
      } catch (nextError) {
        setError(
          nextError instanceof Error
            ? nextError.message
            : 'Unable to load your profile.',
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

  async function handleSave() {
    if (saving) {
      return
    }

    setSaving(true)
    setError(null)

    try {
      const result =
        await createCustomerProfile(
          phone,
          name,
          companyName,
        )

      if (!result.success) {
        throw new Error(
          result.error,
        )
      }

      Alert.alert(
        'Profile updated',
        'Your profile has been updated successfully.',
        [
          {
            text: 'Done',
            onPress: () =>
              navigation.goBack(),
          },
        ],
      )
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Unable to save your profile.',
      )
    } finally {
      setSaving(false)
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
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={
          Platform.OS === 'ios'
            ? 'padding'
            : undefined
        }
      >
        <ScrollView
          contentContainerStyle={
            styles.content
          }
          keyboardShouldPersistTaps="handled"
        >
          <Text
            style={styles.title}
          >
            Your account
          </Text>

          <Text
            style={styles.description}
          >
            Keep your contact details
            current so booking and support
            communication stays accurate.
          </Text>

          {error ? (
            <Text
              style={styles.error}
            >
              {error}
            </Text>
          ) : null}

          <Field
            label="Full name"
            value={name}
            onChangeText={setName}
            placeholder="Enter your full name"
            maxLength={MAX_NAME_LENGTH}
          />

          <Field
            label="Company name"
            value={companyName}
            onChangeText={
              setCompanyName
            }
            placeholder="Enter your company name"
            maxLength={
              MAX_COMPANY_NAME_LENGTH
            }
          />

          <View
            style={styles.field}
          >
            <Text
              style={styles.label}
            >
              Mobile number
            </Text>

            <View
              style={
                styles.readOnlyInput
              }
            >
              <Text
                style={
                  styles.readOnlyText
                }
              >
                {phone ||
                  'Not available'}
              </Text>
            </View>

            <Text
              style={
                styles.helper
              }
            >
              Your mobile number is
              managed by authentication.
            </Text>
          </View>

          <Pressable
            onPress={() =>
              void handleSave()
            }
            disabled={saving}
            style={({ pressed }) => [
              styles.saveButton,
              pressed &&
                !saving &&
                styles.savePressed,
              saving &&
                styles.saveDisabled,
            ]}
          >
            <Text
              style={
                styles.saveText
              }
            >
              {saving
                ? 'Saving...'
                : 'Save Changes'}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  )
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  maxLength,
}: {
  label: string
  value: string
  onChangeText: (value: string) => void
  placeholder: string
  maxLength: number
}) {
  return (
    <View
      style={styles.field}
    >
      <Text
        style={styles.label}
      >
        {label}
      </Text>

      <TextInput
        value={value}
        onChangeText={
          onChangeText
        }
        placeholder={placeholder}
        placeholderTextColor="#A6ADB8"
        maxLength={maxLength}
        autoCapitalize="words"
        style={
          styles.input
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },

  screen: {
    backgroundColor: '#F7F9FC',
  },

  content: {
    padding: 18,
    paddingBottom: 36,
  },

  title: {
    color: '#111827',
    fontSize: 26,
    fontWeight: '800',
  },

  description: {
    color: '#6B7280',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 7,
    marginBottom: 22,
  },

  field: {
    marginBottom: 18,
  },

  label: {
    color: '#374151',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 7,
  },

  input: {
    minHeight: 52,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DDE3EB',
    backgroundColor: '#FFFFFF',
    color: '#111827',
    fontSize: 15,
  },

  readOnlyInput: {
    minHeight: 52,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E7EBF0',
    backgroundColor: '#F1F4F7',
    justifyContent: 'center',
  },

  readOnlyText: {
    color: '#7A8390',
    fontSize: 15,
    fontWeight: '600',
  },

  helper: {
    color: '#9299A5',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 6,
  },

  error: {
    color: '#B42318',
    backgroundColor: '#FFF3F2',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },

  saveButton: {
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },

  savePressed: {
    opacity: 0.82,
  },

  saveDisabled: {
    opacity: 0.55,
  },

  saveText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
