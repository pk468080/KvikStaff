import {
  useEffect,
  useState,
} from 'react'

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


import {
  AppButton,
} from '../../components/ui/AppButton'

import {
  ScreenContainer,
} from '../../components/layout/ScreenContainer'

import ErrorState from '../../components/ui/ErrorState'

import {
  UI,
} from '../../constants/ui'

import {
  useWorkerProfile,
} from '../../hooks/useWorkerProfile'

type EditProfileScreenProps = {
  onSaved?: () => void
  onBack?: () => void
}

const MAX_NAME_LENGTH = 100

export default function EditProfileScreen({
  onSaved,
  onBack,
}: EditProfileScreenProps) {
  const {
    worker,
    loading,
    saving,
    error,
    refresh,
    update,
    clearError,
  } = useWorkerProfile()

  const [fullName, setFullName] =
    useState('')

  const [phone, setPhone] =
    useState('')

  const [localError, setLocalError] =
    useState('')

  useEffect(() => {
    if (!worker) {
      return
    }

    setFullName(
      worker.fullName ?? '',
    )

    setPhone(
      worker.phone ?? '',
    )
  }, [worker])

  useEffect(() => {
    setLocalError('')
  }, [fullName, phone])

  function validateForm(): string | null {
    const name =
      fullName.trim()

    const normalizedPhone =
      phone.replace(/\D/g, '')

    if (!name) {
      return 'Full name is required.'
    }

    if (
      name.length >
      MAX_NAME_LENGTH
    ) {
      return `Name must be ${MAX_NAME_LENGTH} characters or fewer.`
    }

    if (
      normalizedPhone.length < 10 ||
      normalizedPhone.length > 15
    ) {
      return 'Please enter a valid mobile number.'
    }

    return null
  }

  async function handleSave() {
    if (saving) {
      return
    }

    clearError()
    setLocalError('')

    const validationError =
      validateForm()

    if (validationError) {
      setLocalError(
        validationError,
      )
      return
    }

    try {
      await update({
        fullName:
          fullName.trim(),

        phone:
          phone.replace(
            /\D/g,
            '',
          ),
      })

      onSaved?.()
    } catch {
      // The profile hook exposes the
      // server error through `error`.
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
            Loading profile
          </Text>

          <Text style={styles.loadingText}>
            Fetching your current worker account details...
          </Text>
        </View>
      </ScreenContainer>
    )
  }

  if (!worker) {
    return (
      <ScreenContainer>
        <ErrorState
          title="Profile unavailable"
          message={
            error ??
            'We could not load your worker profile.'
          }
          onAction={() => {
            void refresh()
          }}
        />
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
          contentContainerStyle={
            styles.content
          }
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.eyebrow}>
              WORKER PROFILE
            </Text>

            <Text style={styles.title}>
              Edit your profile
            </Text>

            <Text style={styles.subtitle}>
              Update the basic contact details used
              for your KvikStaff worker account.
            </Text>
          </View>

          {(localError || error) ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorTitle}>
                Please check your details
              </Text>

              <Text style={styles.errorText}>
                {localError || error}
              </Text>
            </View>
          ) : null}

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>
              Basic information
            </Text>

            <View style={styles.field}>
              <Text style={styles.label}>
                Full name
              </Text>

              <TextInput
                value={fullName}
                onChangeText={value => {
                  setFullName(value)
                  clearError()
                }}
                placeholder="Enter your full name"
                placeholderTextColor={
                  UI.colors.textMuted
                }
                autoCapitalize="words"
                autoCorrect={false}
                editable={!saving}
                maxLength={
                  MAX_NAME_LENGTH
                }
                style={styles.input}
              />

              <Text style={styles.helperText}>
                {fullName.length}/
                {MAX_NAME_LENGTH}
              </Text>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>
                Mobile number
              </Text>

              <TextInput
                value={phone}
                onChangeText={value => {
                  setPhone(
                    value.replace(
                      /\D/g,
                      '',
                    ),
                  )
                  clearError()
                }}
                placeholder="Enter your mobile number"
                placeholderTextColor={
                  UI.colors.textMuted
                }
                keyboardType="phone-pad"
                editable={!saving}
                maxLength={15}
                style={styles.input}
              />

              <Text style={styles.helperText}>
                Use a valid mobile number with 10 to
                15 digits.
              </Text>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>
                Email
              </Text>

              <View style={styles.readOnlyInput}>
                <Text style={styles.readOnlyText}>
                  {worker.email ||
                    'Email not available'}
                </Text>
              </View>

              <Text style={styles.helperText}>
                Email is managed by your authentication
                account and cannot be changed here.
              </Text>
            </View>
          </View>

          <View style={styles.accountCard}>
            <Text style={styles.accountTitle}>
              Current worker status
            </Text>

            <Text style={styles.accountText}>
              {worker.workerStatus === 'available'
                ? 'Available'
                : worker.workerStatus === 'busy'
                  ? 'Busy'
                  : worker.workerStatus === 'suspended'
                    ? 'Suspended'
                    : 'Offline'}
            </Text>

            <Text style={styles.accountHint}>
              Profile edits do not change your worker
              availability status.
            </Text>
          </View>

          <View style={styles.actions}>
            {onBack ? (
              <View style={styles.actionButton}>
                <AppButton
                  title="Back"
                  variant="secondary"
                  onPress={onBack}
                  disabled={saving}
                />
              </View>
            ) : null}

            <View
              style={[
                styles.actionButton,
                !onBack &&
                  styles.actionButtonFull,
              ]}
            >
              <AppButton
                title={
                  saving
                    ? 'Saving...'
                    : 'Save changes'
                }
                onPress={() => {
                  void handleSave()
                }}
                disabled={saving}
              />
            </View>
          </View>

          {saving ? (
            <View style={styles.savingRow}>
              <ActivityIndicator
                size="small"
                color={
                  UI.colors.primaryBlue
                }
              />

              <Text style={styles.savingText}>
                Saving your profile...
              </Text>
            </View>
          ) : null}

          <Text style={styles.footerText}>
            Your worker verification, earnings and
            booking history are not changed by these
            profile edits.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  keyboard: {
    flex: 1,
  },

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
    marginBottom: UI.spacing.lg,
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

  card: {
      backgroundColor: UI.colors.surface,
      borderRadius: UI.radius.lg,
      padding: UI.spacing.lg,
      marginBottom: UI.spacing.md,
      borderColor: UI.colors.border,
      borderWidth: 1,
      elevation: 2,
      shadowColor: UI.colors.primary,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
    },

  sectionTitle: {
    fontSize: UI.typography.subtitle,
    fontWeight: '800',
    color: UI.colors.text,
  },

  field: {
    marginTop: UI.spacing.lg,
  },

  label: {
    marginBottom: UI.spacing.sm,
    fontSize: UI.typography.small,
    fontWeight: '700',
    color: UI.colors.text,
  },

  input: {
    minHeight: UI.sizes.inputHeight,
    paddingHorizontal: UI.spacing.md,
    borderWidth: 1,
    borderColor: UI.colors.inputBorder,
    borderRadius: UI.radius.md,
    backgroundColor: UI.colors.surface,
    fontSize: UI.typography.bodyLarge,
    color: UI.colors.text,
  },

  helperText: {
    marginTop: UI.spacing.xs,
    fontSize: UI.typography.caption,
    lineHeight: 16,
    color: UI.colors.textMuted,
  },

  readOnlyInput: {
    minHeight: UI.sizes.inputHeight,
    justifyContent: 'center',
    paddingHorizontal: UI.spacing.md,
    borderWidth: 1,
    borderColor: UI.colors.border,
    borderRadius: UI.radius.md,
    backgroundColor: UI.colors.background,
  },

  readOnlyText: {
    fontSize: UI.typography.bodyLarge,
    color: UI.colors.textSecondary,
  },

  accountCard: {
    marginTop: UI.spacing.lg,
    padding: UI.spacing.lg,
    borderRadius: UI.radius.lg,
    backgroundColor:
      UI.colors.infoBackground,
    borderWidth: 1,
    borderColor: UI.colors.info,
  },

  accountTitle: {
    fontSize: UI.typography.small,
    fontWeight: '700',
    color: UI.colors.textSecondary,
  },

  accountText: {
    marginTop: UI.spacing.xs,
    fontSize: UI.typography.subtitle,
    fontWeight: '800',
    color: UI.colors.text,
  },

  accountHint: {
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

  actionButtonFull: {
    marginLeft: 0,
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

  footerText: {
    marginTop: UI.spacing.lg,
    fontSize: UI.typography.caption,
    lineHeight: 16,
    color: UI.colors.textMuted,
    textAlign: 'center',
  },
})