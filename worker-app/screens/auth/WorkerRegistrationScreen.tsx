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
  registerWorkerAuth,
} from '../../services/auth/workerAuth.service'

type WorkerRegistrationScreenProps = {
  onRegistered: () => void
  onBackToLogin: () => void
}

const MAX_NAME_LENGTH = 100

export default function WorkerRegistrationScreen({
  onRegistered,
  onBackToLogin,
}: WorkerRegistrationScreenProps) {
  const [fullName, setFullName] =
    useState('')

  const [phone, setPhone] =
    useState('')

  const [email, setEmail] =
    useState('')

  const [password, setPassword] =
    useState('')

  const [confirmPassword, setConfirmPassword] =
    useState('')

  const [errorMessage, setErrorMessage] =
    useState('')

  const [isSubmitting, setIsSubmitting] =
    useState(false)

  const [
    emailConfirmationRequired,
    setEmailConfirmationRequired,
  ] = useState(false)

  const normalizedName =
    fullName.trim()

  const normalizedPhone =
    phone.replace(
      /\D/g,
      '',
    )

  const normalizedEmail =
    email
      .trim()
      .toLowerCase()

  const isValidEmail =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      normalizedEmail,
    )

  const isValidPhone =
    normalizedPhone.length >= 10 &&
    normalizedPhone.length <= 15

  const isValidPassword =
    password.length >= 8

  const passwordsMatch =
    password.length > 0 &&
    password === confirmPassword

  const isValid =
    normalizedName.length > 0 &&
    normalizedName.length <=
      MAX_NAME_LENGTH &&
    isValidPhone &&
    isValidEmail &&
    isValidPassword &&
    passwordsMatch

  async function handleSubmit() {
    if (
      !isValid ||
      isSubmitting
    ) {
      return
    }

    setErrorMessage('')
    setIsSubmitting(true)
    setEmailConfirmationRequired(false)

    try {
      const result =
        await registerWorkerAuth(
          normalizedEmail,
          password,
          normalizedName,
          normalizedPhone,
        )

      if (!result.success) {
        if (
          result.needsEmailConfirmation
        ) {
          setEmailConfirmationRequired(
            true,
          )
          return
        }

        setErrorMessage(
          result.error,
        )

        return
      }

      onRegistered()
    } catch (error) {
      console.error(
        'Unable to register worker:',
        error,
      )

      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Unable to create your worker account. Please try again.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  if (
    emailConfirmationRequired
  ) {
    return (
      <ScreenContainer>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={
            styles.confirmationContent
          }
          showsVerticalScrollIndicator={
            false
        }
        >
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

          <View
            style={
              styles.confirmationCard
            }
          >
            <View
              style={
                styles.confirmationIcon
              }
            >
              <Text
                style={
                  styles.confirmationIconText
                }
              >
                ✓
              </Text>
            </View>

            <Text
              style={
                styles.confirmationTitle
              }
            >
              Account created
            </Text>

            <Text
              style={
                styles.confirmationText
              }
            >
              Your KvikStaff worker account has
              been created successfully.
            </Text>

            <Text
              style={
                styles.confirmationText
              }
            >
              We sent a verification email to:
            </Text>

            <Text
              style={
                styles.confirmationEmail
              }
            >
              {normalizedEmail}
            </Text>

            <Text
              style={
                styles.confirmationText
              }
            >
              Verify your email, then return here
              and sign in to continue worker
              onboarding.
            </Text>

            <View
              style={
                styles.confirmationAction
              }
            >
              <AppButton
                title="Back to sign in"
                onPress={
                  onBackToLogin
                }
              />
            </View>
          </View>
        </ScrollView>
      </ScreenContainer>
    )
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
              JOIN KvikStaff
            </Text>

            <Text style={styles.title}>
              Create your worker account
            </Text>

            <Text style={styles.subtitle}>
              Register once, then complete your
              worker onboarding to start accepting
              eligible jobs.
            </Text>
          </View>

          <View style={styles.formCard}>
            <Text style={styles.formTitle}>
              Account details
            </Text>

            <Text style={styles.formSubtitle}>
              Use information you can access and
              keep your password private.
            </Text>

            <View style={styles.field}>
              <Text style={styles.label}>
                Full name
              </Text>

              <TextInput
                value={fullName}
                onChangeText={value => {
                  setFullName(value)
                  setErrorMessage('')
                }}
                placeholder="Enter your full name"
                placeholderTextColor={
                  UI.colors.textMuted
                }
                autoCapitalize="words"
                autoCorrect={false}
                autoComplete="name"
                maxLength={
                  MAX_NAME_LENGTH
                }
                editable={!isSubmitting}
                style={styles.input}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>
                Mobile number
              </Text>

              <TextInput
                value={phone}
                onChangeText={value => {
                  setPhone(value)
                  setErrorMessage('')
                }}
                placeholder="Enter mobile number"
                placeholderTextColor={
                  UI.colors.textMuted
                }
                keyboardType="phone-pad"
                autoComplete="tel"
                maxLength={15}
                editable={!isSubmitting}
                style={[
                  styles.input,
                  isValidPhone &&
                    styles.inputValid,
                ]}
              />
            </View>

            <View style={styles.field}>
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

            <View style={styles.field}>
              <Text style={styles.label}>
                Password
              </Text>

              <TextInput
                value={password}
                onChangeText={value => {
                  setPassword(value)
                  setErrorMessage('')
                }}
                placeholder="At least 8 characters"
                placeholderTextColor={
                  UI.colors.textMuted
                }
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="new-password"
                editable={!isSubmitting}
                style={[
                  styles.input,
                  isValidPassword &&
                    styles.inputValid,
                ]}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>
                Confirm password
              </Text>

              <TextInput
                value={confirmPassword}
                onChangeText={value => {
                  setConfirmPassword(value)
                  setErrorMessage('')
                }}
                placeholder="Re-enter your password"
                placeholderTextColor={
                  UI.colors.textMuted
                }
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="new-password"
                editable={!isSubmitting}
                style={[
                  styles.input,
                  passwordsMatch &&
                    styles.inputValid,
                ]}
              />
            </View>

            {password.length > 0 &&
            !isValidPassword ? (
              <Text style={styles.validationText}>
                Password must contain at least
                8 characters.
              </Text>
            ) : null}

            {confirmPassword.length > 0 &&
            !passwordsMatch ? (
              <Text style={styles.validationText}>
                Passwords do not match.
              </Text>
            ) : null}

            {errorMessage ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorTitle}>
                  Registration failed
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
                    ? 'Creating account...'
                    : 'Create account'
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
              <View
                style={
                  styles.loadingRow
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
                    styles.loadingText
                  }
                >
                  Creating your worker account...
                </Text>
              </View>
            ) : null}

            <View
              style={
                styles.securityRow
              }
            >
              <View
                style={
                  styles.securityIcon
                }
              >
                <Text
                  style={
                    styles.securityCheck
                  }
                >
                  ✓
                </Text>
              </View>

              <View
                style={
                  styles.securityCopy
                }
              >
                <Text
                  style={
                    styles.securityTitle
                  }
                >
                  Secure registration
                </Text>

                <Text
                  style={
                    styles.securityText
                  }
                >
                  Your account is created through
                  KvikStaff authentication.
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerPrompt}>
              Already have a worker account?
            </Text>

            <AppButton
              title="Back to sign in"
              variant="secondary"
              onPress={
                onBackToLogin
              }
              disabled={isSubmitting}
            />
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
    paddingHorizontal:
      UI.spacing.xl,
    paddingTop:
      UI.spacing.xl,
    paddingBottom:
      UI.spacing.xxxl,
  },

  confirmationContent: {
    flexGrow: 1,
    paddingHorizontal:
      UI.spacing.xl,
    paddingTop:
      UI.spacing.xl,
    paddingBottom:
      UI.spacing.xxxl,
    justifyContent:
      'center',
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
      UI.colors.primaryBlue,
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
      UI.colors.primaryBlue,
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
      UI.spacing.xl,
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

  field: {
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
      UI.colors.primaryBlue,
  },

  validationText: {
    marginTop:
      UI.spacing.sm,
    fontSize:
      UI.typography.small,
    lineHeight: 17,
    color:
      UI.colors.warning,
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
      UI.colors.errorBackground,
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

  confirmationCard: {
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

  confirmationIcon: {
    width: 58,
    height: 58,
    borderRadius:
      UI.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor:
      UI.colors.successBackground,
  },

  confirmationIconText: {
    fontSize: 28,
    fontWeight: '800',
    color:
      UI.colors.success,
  },

  confirmationTitle: {
    marginTop:
      UI.spacing.lg,
    fontSize:
      UI.typography.title,
    lineHeight: 30,
    fontWeight: '800',
    color:
      UI.colors.text,
  },

  confirmationText: {
    marginTop:
      UI.spacing.md,
    fontSize:
      UI.typography.body,
    lineHeight: 21,
    color:
      UI.colors.textSecondary,
  },

  confirmationEmail: {
    marginTop:
      UI.spacing.sm,
    fontSize:
      UI.typography.bodyLarge,
    lineHeight: 22,
    fontWeight: '800',
    color:
      UI.colors.text,
  },

  confirmationAction: {
    marginTop:
      UI.spacing.xl,
  },
})