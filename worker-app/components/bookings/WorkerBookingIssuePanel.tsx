import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useState } from 'react'

import { Ionicons } from '@expo/vector-icons'

import { AppButton } from '../ui/AppButton'
import { UI } from '../../constants/ui'
import {
  reportWorkerBookingIncident,
  WORKER_INCIDENT_TYPES,
  type WorkerIncidentType,
} from '../../services/bookings/workerBookingIncidents.service'
import {
  createWorkerBookingChangeRequest,
  type WorkerBookingChangeRequestType,
} from '../../services/bookings/workerBookingChangeRequests.service'

type WorkerBookingIssuePanelProps = {
  bookingId: string
  occurrenceId?: string | null
  scheduledStart: string
  scheduledEnd: string
  allowChangeRequests: boolean
}

type IssueMode =
  | 'incident'
  | 'change'
  | null

const incidentLabels: Record<
  WorkerIncidentType,
  string
> = {
  customer_unavailable: 'Customer unavailable',
  wrong_address: 'Wrong address',
  unsafe_location: 'Unsafe location',
  access_problem: 'Access problem',
  extra_work_requested: 'Extra work requested',
  customer_behaviour: 'Customer behaviour',
  worker_emergency: 'Worker emergency',
  other: 'Other',
}

function getInitialDateText(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : date.toISOString()
}

export default function WorkerBookingIssuePanel({
  bookingId,
  occurrenceId = null,
  scheduledStart,
  scheduledEnd,
  allowChangeRequests,
}: WorkerBookingIssuePanelProps) {
  const [mode, setMode] =
    useState<IssueMode>(null)
  const [incidentType, setIncidentType] =
    useState<WorkerIncidentType>('other')
  const [requestType, setRequestType] =
    useState<WorkerBookingChangeRequestType>('cancel')
  const [reason, setReason] =
    useState('')
  const [requestedStart, setRequestedStart] =
    useState(getInitialDateText(scheduledStart))
  const [submitting, setSubmitting] =
    useState(false)
  const [error, setError] =
    useState<string | null>(null)
  const [submitted, setSubmitted] =
    useState(false)

  function openIncident(): void {
    setMode('incident')
    setError(null)
    setSubmitted(false)
    setReason('')
  }

  function openChangeRequest(
    nextRequestType: WorkerBookingChangeRequestType,
  ): void {
    setMode('change')
    setRequestType(nextRequestType)
    setError(null)
    setSubmitted(false)
    setReason('')
    setRequestedStart(getInitialDateText(scheduledStart))
  }

  function closeModal(): void {
    if (!submitting) {
      setMode(null)
    }
  }

  async function submit(): Promise<void> {
    if (submitting || !mode) {
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      if (mode === 'incident') {
        await reportWorkerBookingIncident({
          bookingId,
          incidentType,
          description: reason,
          occurrenceId,
        })
      } else {
        let requestedStartValue: string | null = null
        let requestedEndValue: string | null = null

        if (requestType === 'reschedule') {
          const startTime = new Date(
            requestedStart,
          ).getTime()
          const originalStartTime = new Date(
            scheduledStart,
          ).getTime()
          const originalEndTime = new Date(
            scheduledEnd,
          ).getTime()
          const duration =
            originalEndTime - originalStartTime

          if (
            !Number.isFinite(startTime) ||
            !Number.isFinite(duration) ||
            duration <= 0
          ) {
            throw new Error(
              'Enter a valid requested start time.',
            )
          }

          requestedStartValue =
            new Date(startTime).toISOString()
          requestedEndValue =
            new Date(startTime + duration).toISOString()
        }

        await createWorkerBookingChangeRequest({
          bookingId,
          requestType,
          reason,
          requestedStart: requestedStartValue,
          requestedEnd: requestedEndValue,
          occurrenceId,
        })
      }

      setSubmitted(true)
      setReason('')
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Unable to submit the request.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionEyebrow}>
        NEED HELP?
      </Text>
      <Text style={styles.sectionTitle}>
        Report an issue or request a change
      </Text>
      <Text style={styles.sectionText}>
        Use these requests when the job cannot continue as planned. Existing booking actions remain unchanged.
      </Text>

      <View style={styles.actionRow}>
        <AppButton
          title="Report incident"
          variant="secondary"
          onPress={openIncident}
        />
        {allowChangeRequests ? (
          <AppButton
            title="Request cancellation"
            variant="secondary"
            onPress={() => openChangeRequest('cancel')}
          />
        ) : null}
      </View>

      {allowChangeRequests ? (
        <AppButton
          title="Request reschedule"
          variant="secondary"
          onPress={() => openChangeRequest('reschedule')}
        />
      ) : null}

      <Modal
        visible={mode !== null}
        animationType="slide"
        transparent
        onRequestClose={closeModal}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {mode === 'incident'
                  ? 'Report incident'
                  : requestType === 'cancel'
                    ? 'Request cancellation'
                    : 'Request reschedule'}
              </Text>
              <Pressable
                onPress={closeModal}
                disabled={submitting}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons
                  name="close"
                  size={24}
                  color={UI.colors.textMuted}
                />
              </Pressable>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.modalContent}
            >
              {mode === 'incident' ? (
                <View style={styles.choiceGrid}>
                  {WORKER_INCIDENT_TYPES.map(type => (
                    <Pressable
                      key={type}
                      onPress={() => setIncidentType(type)}
                      style={[
                        styles.choice,
                        incidentType === type &&
                          styles.choiceSelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.choiceText,
                          incidentType === type &&
                            styles.choiceTextSelected,
                        ]}
                      >
                        {incidentLabels[type]}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}

              {mode === 'change' && requestType === 'reschedule' ? (
                <>
                  <Text style={styles.fieldLabel}>
                    Requested start time
                  </Text>
                  <TextInput
                    value={requestedStart}
                    onChangeText={setRequestedStart}
                    editable={!submitting}
                    placeholder="2026-10-01T10:00:00.000Z"
                    placeholderTextColor={UI.colors.textMuted}
                    style={styles.input}
                    autoCapitalize="none"
                  />
                  <Text style={styles.helperText}>
                    The existing booking duration is preserved and the end time is calculated automatically.
                  </Text>
                </>
              ) : null}

              <Text style={styles.fieldLabel}>
                Reason
              </Text>
              <TextInput
                value={reason}
                onChangeText={setReason}
                editable={!submitting}
                placeholder="Describe what happened"
                placeholderTextColor={UI.colors.textMuted}
                style={[styles.input, styles.multilineInput]}
                multiline
                textAlignVertical="top"
              />

              {error ? (
                <Text style={styles.errorText}>{error}</Text>
              ) : null}

              {submitted ? (
                <View style={styles.successBox}>
                  <Ionicons
                    name="checkmark-circle-outline"
                    size={20}
                    color={UI.colors.success}
                  />
                  <Text style={styles.successText}>
                    Your request was submitted for review.
                  </Text>
                </View>
              ) : null}

              <AppButton
                title={submitting ? 'Submitting...' : 'Submit request'}
                disabled={submitting || submitted}
                onPress={() => {
                  void submit()
                }}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  section: {
    marginTop: UI.spacing.lg,
  },
  sectionEyebrow: {
    color: UI.colors.textMuted,
    fontSize: UI.typography.caption,
    fontWeight: '800',
    letterSpacing: 1,
  },
  sectionTitle: {
    marginTop: 5,
    color: UI.colors.text,
    fontSize: UI.typography.subtitle,
    fontWeight: '800',
  },
  sectionText: {
    marginTop: 6,
    color: UI.colors.textMuted,
    lineHeight: 19,
  },
  actionRow: {
    gap: UI.spacing.sm,
    marginTop: UI.spacing.md,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalCard: {
    maxHeight: '88%',
    borderTopLeftRadius: UI.radius.lg,
    borderTopRightRadius: UI.radius.lg,
    backgroundColor: UI.colors.surface,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: UI.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: UI.colors.border,
  },
  modalTitle: {
    color: UI.colors.text,
    fontSize: UI.typography.subtitle,
    fontWeight: '800',
  },
  modalContent: {
    gap: UI.spacing.md,
    padding: UI.spacing.lg,
  },
  choiceGrid: {
    gap: UI.spacing.sm,
  },
  choice: {
    padding: UI.spacing.md,
    borderRadius: UI.radius.md,
    borderWidth: 1,
    borderColor: UI.colors.border,
    backgroundColor: UI.colors.background,
  },
  choiceSelected: {
    borderColor: UI.colors.primary,
    backgroundColor: UI.colors.infoBackground,
  },
  choiceText: {
    color: UI.colors.text,
    fontWeight: '600',
  },
  choiceTextSelected: {
    color: UI.colors.primary,
    fontWeight: '800',
  },
  fieldLabel: {
    color: UI.colors.text,
    fontWeight: '800',
  },
  input: {
    minHeight: 48,
    paddingHorizontal: UI.spacing.md,
    borderWidth: 1,
    borderColor: UI.colors.border,
    borderRadius: UI.radius.md,
    color: UI.colors.text,
    backgroundColor: UI.colors.background,
  },
  multilineInput: {
    minHeight: 110,
    paddingTop: UI.spacing.md,
  },
  helperText: {
    marginTop: -UI.spacing.sm,
    color: UI.colors.textMuted,
    fontSize: UI.typography.caption,
    lineHeight: 17,
  },
  errorText: {
    color: UI.colors.error,
    lineHeight: 19,
  },
  successBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: UI.spacing.sm,
    padding: UI.spacing.md,
    borderRadius: UI.radius.md,
    backgroundColor: UI.colors.successBackground,
  },
  successText: {
    flex: 1,
    color: UI.colors.success,
    fontWeight: '700',
  },
})
