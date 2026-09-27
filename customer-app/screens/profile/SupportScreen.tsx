import {
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
  createCustomerSupportTicket,
  type CustomerSupportCategory,
} from '../../services/support/customerSupport.service'

const categories: Array<{
  value: CustomerSupportCategory
  label: string
}> = [
  {
    value: 'booking',
    label: 'Booking',
  },
  {
    value: 'payment',
    label: 'Payment',
  },
  {
    value: 'worker',
    label: 'Worker',
  },
  {
    value: 'refund',
    label: 'Refund',
  },
  {
    value: 'technical',
    label: 'Technical',
  },
]

export default function SupportScreen({
  onViewRequests,
}: {
  onViewRequests: () => void
}) {
  const [category, setCategory] =
    useState<CustomerSupportCategory>(
      'booking',
    )
  const [subject, setSubject] =
    useState('')
  const [description, setDescription] =
    useState('')
  const [submitting, setSubmitting] =
    useState(false)
  const [error, setError] =
    useState<string | null>(null)

  async function handleSubmit() {
    if (submitting) {
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      await createCustomerSupportTicket(
        {
          category,
          subject,
          description,
        },
      )

      setSubject('')
      setDescription('')

      Alert.alert(
        'Request submitted',
        'Your support request has been created. You can track it from My Support Requests.',
      )
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Unable to create your support request.',
      )
    } finally {
      setSubmitting(false)
    }
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
            How can we help?
          </Text>

          <Text
            style={styles.subtitle}
          >
            Tell us what happened and our
            support team can review it.
          </Text>

          <Pressable
            onPress={
              onViewRequests
            }
            style={({ pressed }) => [
              styles.requestsButton,
              pressed &&
                styles.requestsPressed,
            ]}
          >
            <Text
              style={
                styles.requestsText
              }
            >
              View My Support Requests
            </Text>

            <Text
              style={styles.requestsArrow}
            >
              ›
            </Text>
          </Pressable>

          {error ? (
            <Text
              style={styles.error}
            >
              {error}
            </Text>
          ) : null}

          <Text
            style={styles.label}
          >
            Issue category
          </Text>

          <View
            style={styles.categoryGrid}
          >
            {categories.map(
              item => (
                <Pressable
                  key={item.value}
                  onPress={() =>
                    setCategory(
                      item.value,
                    )
                  }
                  style={[
                    styles.category,
                    category ===
                      item.value &&
                      styles.categorySelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.categoryText,
                      category ===
                        item.value &&
                        styles.categorySelectedText,
                    ]}
                  >
                    {
                      item.label
                    }
                  </Text>
                </Pressable>
              ),
            )}
          </View>

          <Field
            label="Subject"
            value={subject}
            onChangeText={setSubject}
            placeholder="e.g. Worker did not arrive"
            maxLength={150}
          />

          <View
            style={styles.field}
          >
            <Text
              style={styles.label}
            >
              Description
            </Text>

            <TextInput
              value={description}
              onChangeText={
                setDescription
              }
              placeholder="Describe the issue in detail"
              placeholderTextColor="#A6ADB8"
              multiline
              textAlignVertical="top"
              maxLength={4000}
              style={[
                styles.input,
                styles.textarea,
              ]}
            />

            <Text
              style={styles.counter}
            >
              {description.length}/4000
            </Text>
          </View>

          <Pressable
            onPress={() =>
              void handleSubmit()
            }
            disabled={submitting}
            style={({ pressed }) => [
              styles.submit,
              pressed &&
                !submitting &&
                styles.submitPressed,
              submitting &&
                styles.submitDisabled,
            ]}
          >
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text
                style={
                  styles.submitText
                }
              >
                Submit Request
              </Text>
            )}
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
  onChangeText: (
    value: string,
  ) => void
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

  subtitle: {
    color: '#707987',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
    marginBottom: 18,
  },

  requestsButton: {
    minHeight: 54,
    paddingHorizontal: 15,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E3E8EF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },

  requestsPressed: {
    opacity: 0.82,
  },

  requestsText: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '800',
  },

  requestsArrow: {
    color: '#9AA1AD',
    fontSize: 26,
  },

  label: {
    color: '#374151',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },

  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 18,
  },

  category: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E5EC',
    marginRight: 8,
    marginBottom: 8,
  },

  categorySelected: {
    backgroundColor: '#EAF3FF',
    borderColor: '#B8D9FF',
  },

  categoryText: {
    color: '#697281',
    fontSize: 12,
    fontWeight: '700',
  },

  categorySelectedText: {
    color: '#007AFF',
  },

  field: {
    marginBottom: 18,
  },

  input: {
    minHeight: 52,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DDE3EB',
    backgroundColor: '#FFFFFF',
    color: '#111827',
    fontSize: 14,
  },

  textarea: {
    minHeight: 150,
    paddingTop: 14,
    paddingBottom: 14,
  },

  counter: {
    alignSelf: 'flex-end',
    color: '#9CA3AF',
    fontSize: 10,
    marginTop: 5,
  },

  error: {
    color: '#B42318',
    backgroundColor: '#FFF3F2',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },

  submit: {
    minHeight: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
  },

  submitPressed: {
    opacity: 0.82,
  },

  submitDisabled: {
    opacity: 0.6,
  },

  submitText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
})
