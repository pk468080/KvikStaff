import { useState } from 'react'

import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

import { AppButton } from '../../components/ui/AppButton'
import { ScreenContainer } from '../../components/layout/ScreenContainer'
import { UI } from '../../constants/ui'

import {
  getWorkerAuthState,
  signInWorker,
} from '../../services/auth/workerAuth.service'

type LoginScreenProps = {
  onAuthenticated: () => void
  onOnboardingRequired: () => void
  onRegister: () => void
}

export default function LoginScreen({
  onAuthenticated,
  onOnboardingRequired,
  onRegister,
}: LoginScreenProps) {
  const [email, setEmail] =
    useState('')

  const [password, setPassword] =
    useState('')

  const [errorMessage, setErrorMessage] =
    useState('')

  const [isSubmitting, setIsSubmitting] =
    useState(false)

  const normalizedEmail =
    email
      .trim()
      .toLowerCase()

  const isValidEmail =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      normalizedEmail,
    )

  const isValid =
    isValidEmail &&
    password.length > 0

  async function handleSubmit() {
    if (
      !isValid ||
      isSubmitting
    ) {
      return
    }

    setErrorMessage('')
    setIsSubmitting(true)

    try {
      const result =
        await signInWorker(
          normalizedEmail,
          password,
        )

      if (!result.success) {
        setErrorMessage(
          result.error,
        )

        return
      }

      const authState =
        await getWorkerAuthState()

      if (
        authState.needsRegistration
      ) {
        setErrorMessage('')
        onOnboardingRequired()
        return
      }

      setErrorMessage('')
      onAuthenticated()
    } catch (error) {
      console.error(
        'Unable to sign in worker:',
        error,
      )

      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Unable to sign in. Please try again.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ScreenContainer>
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={
          Platform.OS === 'ios'
            ? 'padding'
            : undefined
        }
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={
            styles.scrollContent
          }
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={
            Platform.OS === 'ios'
              ? 'interactive'
              : 'on-drag'
          }
          showsVerticalScrollIndicator={
            false
          }
        >
          <View style={styles.container}>
            <View style={styles.header}>
              <View style={styles.logoMark}>
                <Text style={styles.logoText}>
                  TS
                </Text>
              </View>

              <View style={styles.headerCopy}>
                <Text style={styles.brandName}>
                  KvikStaff
                </Text>

                <Text style={styles.brandTagline}>
                  Worker app
                </Text>
              </View>
            </View>

            <View style={styles.hero}>
              <Text style={styles.eyebrow}>
                WORKER SIGN IN
              </Text>

              <Text style={styles.title}>
                Welcome back
              </Text>

              <Text style={styles.subtitle}>
                Sign in to manage your bookings,
                schedule, earnings and availability.
              </Text>
            </View>

            <View style={styles.formCard}>
              <Text style={styles.formTitle}>
                Sign in to your account
              </Text>

              <Text style={styles.formSubtitle}>
                Use the email and password linked to
                your worker account.
              </Text>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>
                  Email address
                </Text>

                <TextInput
                  value={email}
                  onChangeText={value => {
                    setEmail(value)
                    setErrorMessage('')
                  }}
                  placeholder="Enter your email"
                  placeholderTextColor={
                    UI.colors.textMuted
                  }
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  editable={!isSubmitting}
                  style={[
                    styles.input,
                    isValidEmail &&
                      styles.inputValid,
                  ]}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>
                  Password
                </Text>

                <TextInput
                  value={password}
                  onChangeText={value => {
                    setPassword(value)
                    setErrorMessage('')
                  }}
                  placeholder="Enter your password"
                  placeholderTextColor={
                    UI.colors.textMuted
                  }
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="password"
                  editable={!isSubmitting}
                  style={[
                    styles.input,
                    password.length > 0 &&
                      styles.inputValid,
                  ]}
                />
              </View>

              {errorMessage ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorTitle}>
                    Sign in failed
                  </Text>

                  <Text style={styles.errorText}>
                    {errorMessage}
                  </Text>
                </View>
              ) : null}

              <View style={styles.submitButton}>
                <AppButton
                  title={
                    isSubmitting
                      ? 'Signing in...'
                      : 'Sign in'
                  }
                  disabled={
                    !isValid ||
                    isSubmitting
                  }
                  onPress={() => {
                    void handleSubmit()
                  }}
                />
              </View>

              {isSubmitting ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator
                    size="small"
                    color={
                      UI.colors.secondary
                    }
                  />

                  <Text style={styles.loadingText}>
                    Checking your worker account...
                  </Text>
                </View>
              ) : null}

              <View style={styles.securityRow}>
                <View style={styles.securityIcon}>
                  <Text style={styles.securityCheck}>
                    ✓
                  </Text>
                </View>

                <View style={styles.securityCopy}>
                  <Text style={styles.securityTitle}>
                    Secure account access
                  </Text>

                  <Text style={styles.securityText}>
                    Your credentials are handled through
                    KvikStaff authentication.
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.footer}>
              <Text style={styles.footerPrompt}>
                New to KvikStaff?
              </Text>

              <AppButton
                title="Create worker account"
                variant="secondary"
                onPress={onRegister}
                disabled={isSubmitting}
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  keyboard: {
    flex: 1,
  },

  scroll: {
    flex: 1,
  },

  scrollContent: {
    flexGrow: 1,
    paddingBottom:
      UI.spacing.xxxl,
  },

  container: {
    flexGrow: 1,
    paddingHorizontal:
      UI.spacing.xl,
    paddingTop:
      UI.spacing.xl,
    paddingBottom:
      UI.spacing.xl,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  logoMark: {
    width: 46,
    height: 46,
    borderRadius:
      UI.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor:
      UI.colors.primary,
  },

  logoText: {
    fontSize: 15,
    fontWeight: '800',
    color:
      UI.colors.surface,
    letterSpacing: 0.5,
  },

  headerCopy: {
    marginLeft:
      UI.spacing.md,
  },

  brandName: {
    fontSize: 20,
    fontWeight: '800',
    color:
      UI.colors.text,
  },

  brandTagline: {
    marginTop: 2,
    fontSize:
      UI.typography.small,
    fontWeight: '600',
    color:
      UI.colors.secondary,
  },

  hero: {
    marginTop:
      UI.spacing.xxl,
  },

  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    color:
      UI.colors.secondary,
  },

  title: {
    marginTop:
      UI.spacing.sm,
    fontSize:
      UI.typography.largeTitle,
    lineHeight: 34,
    fontWeight: '800',
    color:
      UI.colors.text,
  },

  subtitle: {
    marginTop:
      UI.spacing.sm,
    fontSize:
      UI.typography.body,
    lineHeight: 20,
    color:
      UI.colors.textSecondary,
  },

  formCard: {
    marginTop:
      UI.spacing.xxl,
    padding:
      UI.spacing.xl,
    borderRadius:
      UI.radius.xl,
    backgroundColor:
      UI.colors.surface,
    borderWidth: 1,
    borderColor:
      UI.colors.border,
  },

  formTitle: {
    fontSize:
      UI.typography.subtitle,
    fontWeight: '800',
    color:
      UI.colors.text,
  },

  formSubtitle: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.small,
    lineHeight: 18,
    color:
      UI.colors.textSecondary,
  },

  inputGroup: {
    marginTop:
      UI.spacing.lg,
  },

  label: {
    marginBottom:
      UI.spacing.sm,
    fontSize:
      UI.typography.small,
    fontWeight: '700',
    color:
      UI.colors.text,
  },

  input: {
    height:
      UI.sizes.inputHeight,
    paddingHorizontal:
      UI.spacing.md,
    borderWidth: 1,
    borderColor:
      UI.colors.inputBorder,
    borderRadius:
      UI.radius.md,
    backgroundColor:
      UI.colors.surface,
    fontSize:
      UI.typography.bodyLarge,
    color:
      UI.colors.text,
  },

  inputValid: {
    borderColor:
      UI.colors.secondary,
  },

  errorBox: {
    marginTop:
      UI.spacing.lg,
    padding:
      UI.spacing.md,
    borderRadius:
      UI.radius.md,
    backgroundColor:
      UI.colors.errorBackground,
    borderWidth: 1,
    borderColor:
      '#FECACA',
  },

  errorTitle: {
    fontSize:
      UI.typography.small,
    fontWeight: '800',
    color:
      UI.colors.error,
  },

  errorText: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.small,
    lineHeight: 18,
    color:
      UI.colors.error,
  },

  submitButton: {
    marginTop:
      UI.spacing.lg,
  },

  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent:
      'center',
    marginTop:
      UI.spacing.md,
  },

  loadingText: {
    marginLeft:
      UI.spacing.sm,
    fontSize:
      UI.typography.small,
    color:
      UI.colors.textSecondary,
  },

  securityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop:
      UI.spacing.lg,
    paddingTop:
      UI.spacing.md,
    borderTopWidth: 1,
    borderTopColor:
      UI.colors.border,
  },

  securityIcon: {
    width: 28,
    height: 28,
    borderRadius:
      UI.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor:
      UI.colors.successBackground,
  },

  securityCheck: {
    fontSize: 15,
    fontWeight: '800',
    color:
      UI.colors.success,
  },

  securityCopy: {
    flex: 1,
    marginLeft:
      UI.spacing.sm,
  },

  securityTitle: {
    fontSize:
      UI.typography.small,
    fontWeight: '700',
    color:
      UI.colors.text,
  },

  securityText: {
    marginTop: 2,
    fontSize: 10,
    lineHeight: 15,
    color:
      UI.colors.textMuted,
  },

  footer: {
    marginTop:
      UI.spacing.xl,
  },

  footerPrompt: {
    marginBottom:
      UI.spacing.sm,
    textAlign: 'center',
    fontSize:
      UI.typography.small,
    color:
      UI.colors.textSecondary,
  },
})