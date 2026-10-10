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
  getLatestAccountDeletionRequest,
  requestAccountDeletion,
  type AccountDeletionRequest,
} from '../../services/account/customerAccountDeletion.service'

export default function DeleteAccountScreen() {
  const [request, setRequest] = useState<AccountDeletionRequest | null>(null)
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const next = await getLatestAccountDeletionRequest()
      setRequest(next)
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Unable to load account deletion status.',
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleRequest() {
    if (submitting) return

    setSubmitting(true)
    setError(null)

    try {
      const next = await requestAccountDeletion(reason)
      setRequest(next)
      setReason('')

      Alert.alert(
        'Request received',
        'Your account deletion request has been submitted for review.',
      )
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Unable to submit the deletion request.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <ScreenContainer style={styles.screen}>
        <View style={styles.center}>
          <ActivityIndicator size="large" />
        </View>
      </ScreenContainer>
    )
  }

  const hasPending = request?.status === 'pending'
  const isProcessing = request?.status === 'processing'
  const isCompleted = request?.status === 'approved'

  return (
    <ScreenContainer style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.warningCard}>
            <View style={styles.warningIcon}>
              <Text style={styles.warningIconText}>!</Text>
            </View>

            <Text style={styles.warningTitle}>Deleting your account</Text>

            <Text style={styles.warningText}>
              KvikStaff will review the request before permanent deletion. Existing
              booking, payment, tax, refund or dispute records may be retained where
              required by law or to complete an active service. Direct identifiers and
              saved address details will be removed from retained records where possible.
            </Text>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {request ? (
            <View style={styles.statusCard}>
              <Text style={styles.statusLabel}>Latest request</Text>

              <View style={styles.statusRow}>
                <Text style={styles.statusTitle}>
                  {formatStatus(request.status)}
                </Text>

                <View style={[styles.statusPill, getStatusStyle(request.status)]}>
                  <Text
                    style={[
                      styles.statusPillText,
                      getStatusTextStyle(request.status),
                    ]}
                  >
                    {request.status.toUpperCase()}
                  </Text>
                </View>
              </View>

              <Text style={styles.statusDate}>
                Requested {formatDate(request.requestedAt)}
              </Text>
            </View>
          ) : null}

          {hasPending || isProcessing ? (
            <View style={styles.pendingCard}>
              <Text style={styles.pendingTitle}>
                {isProcessing
                  ? 'Deletion is in progress'
                  : 'Your request is pending'}
              </Text>

              <Text style={styles.pendingText}>
                {isProcessing
                  ? 'KvikStaff has started removing account data. If processing was interrupted, the team can safely resume the existing request.'
                  : 'You do not need to submit another request. KvikStaff will review and process the existing request.'}
              </Text>
            </View>
          ) : isCompleted ? (
            <View style={styles.completedCard}>
              <Text style={styles.completedTitle}>Account deletion completed</Text>
              <Text style={styles.completedText}>
                The login identity has been removed. Certain booking and financial
                records may remain in de-identified form where retention is required.
              </Text>
            </View>
          ) : (
            <>
              <Text style={styles.title}>Submit a deletion request</Text>
              <Text style={styles.subtitle}>
                You can optionally tell us why you want to delete your account.
              </Text>

              <Text style={styles.label}>Reason (optional)</Text>

              <TextInput
                value={reason}
                onChangeText={setReason}
                placeholder="Optional reason"
                placeholderTextColor="#A6ADB8"
                multiline
                textAlignVertical="top"
                maxLength={1000}
                style={styles.reasonInput}
              />

              <Pressable
                disabled={submitting}
                onPress={() => {
                  Alert.alert(
                    'Delete account',
                    'Submit a request to permanently delete your KvikStaff account?',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Submit Request',
                        style: 'destructive',
                        onPress: () => {
                          void handleRequest()
                        },
                      },
                    ],
                  )
                }}
                style={({ pressed }) => [
                  styles.deleteButton,
                  pressed && !submitting && styles.deletePressed,
                  submitting && styles.deleteDisabled,
                ]}
              >
                <Text style={styles.deleteText}>
                  {submitting ? 'Submitting...' : 'Request Account Deletion'}
                </Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  )
}

function formatStatus(status: AccountDeletionRequest['status']) {
  if (status === 'pending') return 'Request under review'
  if (status === 'processing') return 'Deletion in progress'
  if (status === 'approved') return 'Deletion completed'
  if (status === 'cancelled') return 'Request cancelled'
  return 'Request rejected'
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  return date.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function getStatusStyle(status: AccountDeletionRequest['status']) {
  if (status === 'pending' || status === 'processing') {
    return { backgroundColor: '#FFF6D9' }
  }
  if (status === 'approved') return { backgroundColor: '#EAF8EF' }
  return { backgroundColor: '#FFF1F0' }
}

function getStatusTextStyle(status: AccountDeletionRequest['status']) {
  if (status === 'pending' || status === 'processing') {
    return { color: '#946B00' }
  }
  if (status === 'approved') return { color: '#16803C' }
  return { color: '#B42318' }
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { backgroundColor: '#F7F9FC' },
  content: { padding: 18, paddingBottom: 36 },
  warningCard: {
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#FFF8F7',
    borderWidth: 1,
    borderColor: '#FFD7D2',
  },
  warningIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFE4E0',
    marginBottom: 10,
  },
  warningIconText: { color: '#D92D20', fontSize: 16, fontWeight: '900' },
  warningTitle: { color: '#7A271A', fontSize: 16, fontWeight: '800' },
  warningText: { color: '#8C4A40', fontSize: 12, lineHeight: 19, marginTop: 7 },
  error: {
    color: '#B42318',
    backgroundColor: '#FFF3F2',
    padding: 12,
    borderRadius: 12,
    marginTop: 16,
  },
  statusCard: {
    padding: 15,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8ECF2',
    marginTop: 16,
  },
  statusLabel: {
    color: '#7B8492',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  statusRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusTitle: { color: '#111827', fontSize: 15, fontWeight: '800' },
  statusPill: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 10 },
  statusPillText: { fontSize: 10, fontWeight: '800' },
  statusDate: { color: '#A0A7B2', fontSize: 10, marginTop: 9 },
  pendingCard: {
    padding: 15,
    borderRadius: 18,
    backgroundColor: '#F3F8FF',
    borderWidth: 1,
    borderColor: '#D6E8FF',
    marginTop: 16,
  },
  pendingTitle: { color: '#1858A8', fontSize: 15, fontWeight: '800' },
  pendingText: { color: '#5D7290', fontSize: 12, lineHeight: 18, marginTop: 5 },
  completedCard: {
    padding: 15,
    borderRadius: 18,
    backgroundColor: '#EAF8EF',
    borderWidth: 1,
    borderColor: '#BCE6C8',
    marginTop: 16,
  },
  completedTitle: { color: '#166534', fontSize: 15, fontWeight: '800' },
  completedText: { color: '#326345', fontSize: 12, lineHeight: 18, marginTop: 5 },
  title: { color: '#111827', fontSize: 24, fontWeight: '800', marginTop: 22 },
  subtitle: {
    color: '#707987',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
    marginBottom: 18,
  },
  label: { color: '#374151', fontSize: 13, fontWeight: '700', marginBottom: 8 },
  reasonInput: {
    minHeight: 130,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DDE3EB',
    backgroundColor: '#FFFFFF',
    color: '#111827',
    fontSize: 14,
  },
  deleteButton: {
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: '#D92D20',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },
  deletePressed: { opacity: 0.82 },
  deleteDisabled: { opacity: 0.55 },
  deleteText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
})