import {
  useEffect,
  useState,
} from 'react'

import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'


import {
  AppButton,
} from '../../components/ui/AppButton'

import OnboardingProgress from '../../components/onboarding/OnboardingProgress'

import {
  ScreenContainer,
} from '../../components/layout/ScreenContainer'

import {
  UI,
} from '../../constants/ui'

import {
  getWorkerConsentStatus,
  setWorkerConsent,
} from '../../services/onboarding/workerConsent.service'

type ConsentScreenProps = {
  onContinue: () => void
  onBack: () => void
}

const ONBOARDING_LABELS = [
  'Personal information',
  'Services',
  'Documents',
  'Availability',
  'Consent',
]

const CONSENT_ITEMS = [
  'I confirm that the information provided in my worker application is accurate.',
  'I confirm that the documents I submitted belong to me and are valid.',
  'I understand that job assignments depend on my availability, location, service coverage and worker status.',
  'I agree to follow KvikStaff job requirements and provide services professionally.',
]

export default function ConsentScreen({
  onContinue,
  onBack,
}: ConsentScreenProps) {
  const [accepted, setAccepted] =
    useState(false)

  const [loading, setLoading] =
    useState(true)

  const [saving, setSaving] =
    useState(false)

  const [errorMessage, setErrorMessage] =
    useState('')

  useEffect(() => {
    let mounted = true

    async function loadConsent() {
      setLoading(true)
      setErrorMessage('')

      try {
        const status =
          await getWorkerConsentStatus()

        if (!mounted) {
          return
        }

        setAccepted(
          status.hasConsent,
        )
      } catch (error) {
        console.error(
          'Unable to load worker consent:',
          error,
        )

        if (!mounted) {
          return
        }

        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'Unable to load your consent status.',
        )
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    void loadConsent()

    return () => {
      mounted = false
    }
  }, [])

  async function handleContinue() {
    if (saving) {
      return
    }

    setErrorMessage('')

    if (!accepted) {
      setErrorMessage(
        'Please confirm all consent statements before continuing.',
      )
      return
    }

    setSaving(true)

    try {
      const status =
        await getWorkerConsentStatus()

      if (!status.hasConsent) {
        await setWorkerConsent()
      }

      onContinue()
    } catch (error) {
      console.error(
        'Unable to save worker consent:',
        error,
      )

      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Unable to save your consent.',
      )
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <ScreenContainer>
        <View style={styles.loadingContainer}>
          <ActivityIndicator
            size="large"
            color={UI.colors.primaryBlue}
          />

          <Text style={styles.loadingTitle}>
            Loading consent status
          </Text>

          <Text style={styles.loadingText}>
            Checking whether your worker consent has
            already been recorded...
          </Text>
        </View>
      </ScreenContainer>
    )
  }

  return (
    <ScreenContainer>
      <ScrollView
        contentContainerStyle={
          styles.content
        }
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>
            STEP 5 · CONSENT
          </Text>

          <Text style={styles.title}>
            Review and confirm
          </Text>

          <Text style={styles.subtitle}>
            Confirm the statements below before your
            worker application is submitted.
          </Text>
        </View>

        <OnboardingProgress
          currentStep={5}
          totalSteps={5}
          labels={ONBOARDING_LABELS}
        />

        {errorMessage ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>
              Consent issue
            </Text>

            <Text style={styles.errorText}>
              {errorMessage}
            </Text>
          </View>
        ) : null}

        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>
            Before you submit
          </Text>

          <Text style={styles.summaryText}>
            Review each statement carefully. Your
            consent is recorded against your worker
            onboarding profile.
          </Text>
        </View>

        <View style={styles.consentCard}>
          {CONSENT_ITEMS.map(
            (item, index) => (
              <View
                key={item}
                style={[
                  styles.item,
                  index > 0 &&
                    styles.itemBorder,
                ]}
              >
                <View style={styles.itemNumber}>
                  <Text
                    style={
                      styles.itemNumberText
                    }
                  >
                    {index + 1}
                  </Text>
                </View>

                <Text style={styles.itemText}>
                  {item}
                </Text>
              </View>
            ),
          )}
        </View>

        <View
          style={[
            styles.confirmCard,
            accepted &&
              styles.confirmCardAccepted,
          ]}
        >
          <AppButton
  title={
    accepted
      ? 'Consent confirmed'
      : 'I confirm these statements'
  }
  variant={
    accepted
      ? 'secondary'
      : 'primary'
  }
  onPress={() => {
    setAccepted(true)
    setErrorMessage('')
  }}
  disabled={
    saving ||
    accepted
  }
/>

          <Text style={styles.confirmText}>
            {accepted
              ? 'Your confirmation is ready to be saved.'
              : 'You must confirm the statements before continuing.'}
          </Text>
        </View>

        <View style={styles.noteCard}>
          <Text style={styles.noteTitle}>
            Application submission
          </Text>

          <Text style={styles.noteText}>
            Continuing will save your consent. The
            next onboarding action can then submit
            your worker application for review.
          </Text>
        </View>

        <View style={styles.actions}>
          <View style={styles.actionButton}>
            <AppButton
              title="Back"
              variant="secondary"
              onPress={onBack}
              disabled={saving}
            />
          </View>

          <View style={styles.actionButton}>
            <AppButton
              title={
                saving
                  ? 'Saving...'
                  : 'Continue'
              }
              onPress={() => {
                void handleContinue()
              }}
              disabled={
                saving || !accepted
              }
            />
          </View>
        </View>

        {saving ? (
          <View style={styles.savingRow}>
            <ActivityIndicator
              size="small"
              color={UI.colors.primaryBlue}
            />

            <Text style={styles.savingText}>
              Saving your worker consent...
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: UI.spacing.xl,
    paddingTop: UI.spacing.xl,
    paddingBottom: UI.spacing.xxxl,
  },

  header: {
    marginBottom: UI.spacing.lg,
  },

  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
    color: UI.colors.primaryBlue,
  },

  title: {
    marginTop: UI.spacing.sm,
    fontSize: UI.typography.title,
    lineHeight: 30,
    fontWeight: '800',
    color: UI.colors.text,
  },

  subtitle: {
    marginTop: UI.spacing.sm,
    fontSize: UI.typography.body,
    lineHeight: 21,
    color: UI.colors.textSecondary,
  },

  errorBox: {
    marginTop: UI.spacing.md,
    padding: UI.spacing.md,
    borderRadius: UI.radius.md,
    backgroundColor:
      UI.colors.errorBackground,
    borderWidth: 1,
    borderColor: UI.colors.errorBackground,
  },

  errorTitle: {
    fontSize: UI.typography.small,
    fontWeight: '800',
    color: UI.colors.error,
  },

  errorText: {
    marginTop: UI.spacing.xs,
    fontSize: UI.typography.small,
    lineHeight: 18,
    color: UI.colors.error,
  },

  summaryCard: {
    marginTop: UI.spacing.lg,
    padding: UI.spacing.lg,
    borderRadius: UI.radius.lg,
    backgroundColor:
      UI.colors.infoBackground,
    borderWidth: 1,
    borderColor: UI.colors.info,
  },

  summaryTitle: {
    fontSize: UI.typography.bodyLarge,
    fontWeight: '800',
    color: UI.colors.text,
  },

  summaryText: {
    marginTop: UI.spacing.sm,
    fontSize: UI.typography.body,
    lineHeight: 21,
    color: UI.colors.textSecondary,
  },

  consentCard: {
    marginTop: UI.spacing.lg,
    borderRadius: UI.radius.lg,
    backgroundColor: UI.colors.surface,
    borderWidth: 1,
    borderColor: UI.colors.border,
  },

  item: {
    flexDirection: 'row',
    padding: UI.spacing.lg,
  },

  itemBorder: {
    borderTopWidth: 1,
    borderTopColor: UI.colors.border,
  },

  itemNumber: {
    width: 30,
    height: 30,
    borderRadius: UI.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor:
      UI.colors.background,
    borderWidth: 1,
    borderColor: UI.colors.border,
  },

  itemNumberText: {
    fontSize: UI.typography.small,
    fontWeight: '800',
    color: UI.colors.primary,
  },

  itemText: {
    flex: 1,
    marginLeft: UI.spacing.md,
    fontSize: UI.typography.body,
    lineHeight: 21,
    color: UI.colors.text,
  },

  confirmCard: {
    marginTop: UI.spacing.lg,
    padding: UI.spacing.lg,
    borderRadius: UI.radius.lg,
    backgroundColor: UI.colors.surface,
    borderWidth: 1,
    borderColor: UI.colors.border,
  },

  confirmCardAccepted: {
    backgroundColor:
      UI.colors.successBackground,
    borderColor: UI.colors.success,
  },

  confirmText: {
    marginTop: UI.spacing.sm,
    fontSize: UI.typography.small,
    lineHeight: 18,
    color: UI.colors.textSecondary,
    textAlign: 'center',
  },

  noteCard: {
    marginTop: UI.spacing.lg,
    padding: UI.spacing.lg,
    borderRadius: UI.radius.lg,
    backgroundColor: UI.colors.background,
    borderWidth: 1,
    borderColor: UI.colors.border,
  },

  noteTitle: {
    fontSize: UI.typography.small,
    fontWeight: '800',
    color: UI.colors.text,
  },

  noteText: {
    marginTop: UI.spacing.xs,
    fontSize: UI.typography.small,
    lineHeight: 18,
    color: UI.colors.textSecondary,
  },

  actions: {
    flexDirection: 'row',
    marginTop: UI.spacing.xxl,
  },

  actionButton: {
    flex: 1,
    marginLeft: UI.spacing.sm,
  },

  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: UI.spacing.xxl,
  },

  loadingTitle: {
    marginTop: UI.spacing.lg,
    fontSize: UI.typography.subtitle,
    fontWeight: '800',
    color: UI.colors.text,
    textAlign: 'center',
  },

  loadingText: {
    marginTop: UI.spacing.sm,
    fontSize: UI.typography.body,
    lineHeight: 20,
    color: UI.colors.textSecondary,
    textAlign: 'center',
  },

  savingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: UI.spacing.md,
  },

  savingText: {
    marginLeft: UI.spacing.sm,
    fontSize: UI.typography.small,
    color: UI.colors.textSecondary,
  },
})