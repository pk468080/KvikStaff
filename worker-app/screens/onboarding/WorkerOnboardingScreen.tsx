import {
  useEffect,
  useState,
} from 'react'

import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from 'react-native'


import {
  ScreenContainer,
} from '../../components/layout/ScreenContainer'

import {
  UI,
} from '../../constants/ui'

import {
  getCurrentWorkerApplicationWithProfile,
  submitWorkerApplication,
} from '../../services/onboarding/workerApplication.service'

import {
  getWorkerConsentStatus,
} from '../../services/onboarding/workerConsent.service'

import PersonalInformationScreen from './PersonalInformationScreen'

import ServicesScreen from './ServicesScreen'

import DocumentsScreen from './DocumentsScreen'

import AvailabilityScreen from './AvailabilityScreen'

import ConsentScreen from './ConsentScreen'

type WorkerOnboardingScreenProps = {
  onCompleted: () => void
}

type OnboardingStep =
  | 1
  | 2
  | 3
  | 4
  | 5

const TOTAL_STEPS = 5

export default function WorkerOnboardingScreen({
  onCompleted,
}: WorkerOnboardingScreenProps) {
  const [
    step,
    setStep,
  ] = useState<OnboardingStep>(1)

  const [
    loading,
    setLoading,
  ] = useState(true)

  const [
    submitting,
    setSubmitting,
  ] = useState(false)

  const [
    errorMessage,
    setErrorMessage,
  ] = useState('')

  useEffect(() => {
    let mounted = true

    async function initialize() {
      setLoading(true)
      setErrorMessage('')

      try {
        const [
          application,
          consentStatus,
        ] = await Promise.all([
          getCurrentWorkerApplicationWithProfile(),
          getWorkerConsentStatus(),
        ])

        if (!mounted) {
          return
        }

        if (
          consentStatus.hasConsent
        ) {
          setStep(5)
          return
        }

        const savedStep =
          application
            ?.onboardingProfile
            ?.onboardingStep

        if (
          typeof savedStep ===
            'number' &&
          Number.isInteger(
            savedStep,
          ) &&
          savedStep >= 1 &&
          savedStep <=
            TOTAL_STEPS
        ) {
          setStep(
            savedStep as OnboardingStep,
          )
        }
      } catch (error) {
        console.error(
          'Unable to initialize worker onboarding:',
          error,
        )

        if (!mounted) {
          return
        }

        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'Unable to load worker onboarding.',
        )
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    void initialize()

    return () => {
      mounted = false
    }
  }, [])

  function handleStep(
    nextStep: OnboardingStep,
  ) {
    setErrorMessage('')
    setStep(nextStep)
  }

    async function handleSubmit() {
    if (submitting) {
      return
    }

    setErrorMessage('')
    setSubmitting(true)

    try {
      const application =
        await submitWorkerApplication()

      if (
        application.status !==
        'submitted'
      ) {
        throw new Error(
          'Your worker application is not ready for submission.',
        )
      }

      onCompleted()
    } catch (error) {
      console.error(
        'Unable to submit worker application:',
        error,
      )

      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Unable to submit your worker application.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <ScreenContainer>
        <View
          style={
            styles.loadingContainer
          }
        >
          <ActivityIndicator
            size="large"
            color={
              UI.colors.primaryBlue
            }
          />

          <Text
            style={
              styles.loadingTitle
            }
          >
            Preparing your onboarding
          </Text>

          <Text
            style={
              styles.loadingText
            }
          >
            Loading your saved worker details...
          </Text>
        </View>
      </ScreenContainer>
    )
  }

  if (
    step === 1
  ) {
    return (
      <PersonalInformationScreen
        onContinue={() => {
          handleStep(2)
        }}
      />
    )
  }

  if (
    step === 2
  ) {
    return (
      <ServicesScreen
        onBack={() => {
          handleStep(1)
        }}
        onContinue={() => {
          handleStep(3)
        }}
      />
    )
  }

  if (
    step === 3
  ) {
    return (
      <DocumentsScreen
        onBack={() => {
          handleStep(2)
        }}
        onContinue={() => {
          handleStep(4)
        }}
      />
    )
  }

  if (
    step === 4
  ) {
    return (
      <AvailabilityScreen
        onBack={() => {
          handleStep(3)
        }}
        onContinue={() => {
          handleStep(5)
        }}
      />
    )
  }

  return (
    <View style={styles.root}>
      <ConsentScreen
        onBack={() => {
          if (submitting) {
            return
          }

          handleStep(4)
        }}
        onContinue={() => {
          void handleSubmit()
        }}
      />

      {errorMessage ? (
        <View
          pointerEvents="none"
          style={
            styles.submitError
          }
        >
          <Text
            style={
              styles.submitErrorTitle
            }
          >
            Submission issue
          </Text>

          <Text
            style={
              styles.submitErrorText
            }
          >
            {errorMessage}
          </Text>
        </View>
      ) : null}

      {submitting ? (
        <View
          style={
            styles.submitOverlay
          }
        >
          <View
            style={
              styles.submitCard
            }
          >
            <ActivityIndicator
              size="small"
              color={
                UI.colors.primaryBlue
              }
            />

            <Text
              style={
                styles.submitTitle
              }
            >
              Submitting application
            </Text>

            <Text
              style={
                styles.submitText
              }
            >
              Sending your completed worker application for review...
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
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
    fontSize:
      UI.typography.body,
    lineHeight:
      20,
    color:
      UI.colors.textSecondary,
    textAlign:
      'center',
  },

  submitError: {
    position:
      'absolute',
    left:
      UI.spacing.xl,
    right:
      UI.spacing.xl,
    bottom:
      UI.spacing.xl,
    padding:
      UI.spacing.md,
    borderRadius:
      UI.radius.md,
    backgroundColor:
      UI.colors.errorBackground,
    borderWidth:
      1,
    borderColor:
      UI.colors.errorBackground,
  },

  submitErrorTitle: {
    fontSize:
      UI.typography.small,
    fontWeight:
      '800',
    color:
      UI.colors.error,
  },

  submitErrorText: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.small,
    lineHeight:
      18,
    color:
      UI.colors.error,
  },

  submitOverlay: {
    position:
      'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding:
      UI.spacing.lg,
    backgroundColor:
      'rgba(255,255,255,0.94)',
    borderTopWidth:
      1,
    borderTopColor:
      UI.colors.border,
  },

  submitCard: {
    alignItems:
      'center',
  },

  submitTitle: {
    marginTop:
      UI.spacing.sm,
    fontSize:
      UI.typography.bodyLarge,
    fontWeight:
      '800',
    color:
      UI.colors.text,
  },

  submitText: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.small,
    lineHeight:
      18,
    color:
      UI.colors.textSecondary,
    textAlign:
      'center',
  },
})