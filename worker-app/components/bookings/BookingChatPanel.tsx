import { UI } from '../../constants/ui';
import {
  useEffect,
  useState,
} from 'react'

import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

import {
  supabase,
} from '../../lib/supabase'

import {
  getOrCreateWorkerBookingChat,
  getWorkerBookingChatMessages,
  sendWorkerBookingChatMessage,
  type WorkerBookingChatMessage,
} from '../../services/bookings/workerBookingChat.service'

type BookingChatPanelProps = {
  bookingId: string
  customerId: string
  occurrenceId?: string | null
}

function formatMessageTime(
  value: string,
): string {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return date.toLocaleTimeString(
    [],
    {
      hour: 'numeric',
      minute: '2-digit',
    },
  )
}

function addMessage(
  current: WorkerBookingChatMessage[],
  next: WorkerBookingChatMessage,
): WorkerBookingChatMessage[] {
  if (
    current.some(
      item => item.id === next.id,
    )
  ) {
    return current
  }

  return [
    ...current,
    next,
  ].sort(
    (left, right) =>
      Date.parse(left.createdAt) -
      Date.parse(right.createdAt),
  )
}

export default function BookingChatPanel({
  bookingId,
  customerId,
  occurrenceId = null,
}: BookingChatPanelProps) {
  const [
    conversationId,
    setConversationId,
  ] = useState<string | null>(
    null,
  )

  const [
    currentUserId,
    setCurrentUserId,
  ] = useState<string | null>(
    null,
  )

  const [
    messages,
    setMessages,
  ] = useState<WorkerBookingChatMessage[]>(
    [],
  )

  const [
    draft,
    setDraft,
  ] = useState('')

  const [
    loading,
    setLoading,
  ] = useState(true)

  const [
    sending,
    setSending,
  ] = useState(false)

  const [
    error,
    setError,
  ] = useState<string | null>(
    null,
  )

  useEffect(() => {
  let active = true
  let channel:
    | ReturnType<typeof supabase.channel>
    | null = null

  queueMicrotask(() => {
    if (!active) {
      return
    }

    setConversationId(null)
    setCurrentUserId(null)
    setMessages([])
    setError(null)
    setLoading(true)
  })

  void (async () => {
      try {
        const session =
          await getOrCreateWorkerBookingChat(
            bookingId,
            customerId,
            occurrenceId,
          )

        const initialMessages =
          await getWorkerBookingChatMessages(
            session.conversationId,
          )

        if (!active) {
          return
        }

        setConversationId(
          session.conversationId,
        )
        setCurrentUserId(
          session.currentUserId,
        )
        setMessages(initialMessages)

        channel = supabase
          .channel(
            `worker-booking-chat-${session.conversationId}-${Date.now()}`,
          )
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'messages',
              filter:
                `conversation_id=eq.${session.conversationId}`,
            },
            payload => {
              const row =
                payload.new as {
                  id: string
                  sender_id: string
                  sender_role:
                    | 'customer'
                    | 'worker'
                  body: string
                  created_at: string
                }

              setMessages(current =>
                addMessage(
                  current,
                  {
                    id: row.id,
                    senderId:
                      row.sender_id,
                    senderRole:
                      row.sender_role,
                    body: row.body,
                    createdAt:
                      row.created_at,
                  },
                ),
              )
            },
          )
          .subscribe()
      } catch (cause) {
        if (!active) {
          return
        }

        setError(
          cause instanceof Error
            ? cause.message
            : 'Unable to open chat.',
        )
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    })()

    return () => {
      active = false

      if (channel) {
        void supabase.removeChannel(
          channel,
        )
      }
    }
  }, [
    bookingId,
    customerId,
    occurrenceId,
  ])

  async function sendMessage() {
    if (
      !conversationId ||
      sending
    ) {
      return
    }

    try {
      setSending(true)
      setError(null)

      const message =
        await sendWorkerBookingChatMessage(
          conversationId,
          draft,
        )

      setMessages(current =>
        addMessage(
          current,
          message,
        ),
      )
      setDraft('')
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Unable to send message.',
      )
    } finally {
      setSending(false)
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>
            Chat with customer
          </Text>

          <Text style={styles.subtitle}>
            Available while you are on the way.
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator
            color="#008A88"
          />
        ) : null}
      </View>

      <ScrollView
        style={styles.messages}
        contentContainerStyle={
          styles.messagesContent
        }
        nestedScrollEnabled
      >
        {loading ? null : error && !conversationId ? (
          <Text style={styles.error}>
            {error}
          </Text>
        ) : messages.length === 0 ? (
          <Text style={styles.empty}>
            Send a message to the customer.
          </Text>
        ) : (
          messages.map(message => {
            const ownMessage =
              message.senderId ===
              currentUserId

            return (
              <View
                key={message.id}
                style={[
                  styles.messageRow,
                  ownMessage &&
                    styles.ownMessageRow,
                ]}
              >
                <View
                  style={[
                    styles.bubble,
                    ownMessage
                      ? styles.ownBubble
                      : styles.otherBubble,
                  ]}
                >
                  <Text
                    style={[
                      styles.messageBody,
                      ownMessage &&
                        styles.ownMessageBody,
                    ]}
                  >
                    {message.body}
                  </Text>

                  <Text
                    style={[
                      styles.messageTime,
                      ownMessage &&
                        styles.ownMessageTime,
                    ]}
                  >
                    {formatMessageTime(
                      message.createdAt,
                    )}
                  </Text>
                </View>
              </View>
            )
          })
        )}
      </ScrollView>

      {error && conversationId ? (
        <Text style={styles.error}>
          {error}
        </Text>
      ) : null}

      <View style={styles.composer}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Write a message"
          placeholderTextColor="#78909C"
          multiline
          maxLength={4000}
          editable={
            Boolean(conversationId) &&
            !sending
          }
          style={styles.input}
        />

        <Pressable
          onPress={() => {
            void sendMessage()
          }}
          disabled={
            !conversationId ||
            !draft.trim() ||
            sending
          }
          style={({ pressed }) => [
            styles.sendButton,
            (
              !conversationId ||
              !draft.trim() ||
              sending
            ) && styles.sendButtonDisabled,
            pressed &&
              styles.sendButtonPressed,
          ]}
        >
          <Text style={styles.sendButtonText}>
            {sending ? 'Sending' : 'Send'}
          </Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    marginTop: 16,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D9E6EA',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    color: '#0A3972',
    fontSize: 16,
    fontWeight: '800',
  },
  subtitle: {
    marginTop: 3,
    color: '#607789',
    fontSize: 12,
  },
  messages: {
    maxHeight: 220,
    borderRadius: 12,
    backgroundColor: '#F5FAFB',
  },
  messagesContent: {
    padding: 10,
    gap: 8,
  },
  messageRow: {
    alignItems: 'flex-start',
  },
  ownMessageRow: {
    alignItems: 'flex-end',
  },
  bubble: {
    maxWidth: '84%',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
  },
  ownBubble: {
    backgroundColor: UI.colors.primaryBlue,
    borderBottomRightRadius: 3,
  },
  otherBubble: {
    backgroundColor: '#E4EEF2',
    borderBottomLeftRadius: 3,
  },
  messageBody: {
    color: '#0A3972',
    fontSize: 13,
    lineHeight: 18,
  },
  ownMessageBody: {
    color: '#FFFFFF',
  },
  messageTime: {
    marginTop: 3,
    color: '#607789',
    fontSize: 10,
    textAlign: 'right',
  },
  ownMessageTime: {
    color: '#D7F5F4',
  },
  empty: {
    paddingVertical: 16,
    color: '#607789',
    fontSize: 13,
    textAlign: 'center',
  },
  error: {
    marginTop: 8,
    color: '#B42318',
    fontSize: 12,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: 10,
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 96,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#C7D9DF',
    color: '#0A3972',
    fontSize: 14,
    textAlignVertical: 'top',
  },
  sendButton: {
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: UI.colors.primaryBlue,
  },
  sendButtonDisabled: {
    backgroundColor: '#9ABABD',
  },
  sendButtonPressed: {
    opacity: 0.84,
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
})
