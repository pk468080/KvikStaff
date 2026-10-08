import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
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
  getWorkerOnboardingProfile,
  saveWorkerOnboarding,
} from '../../services/onboarding/workerOnboarding.service'

import type {
  WorkerOnboardingProfile,
} from '../../types/application'

import {
  getCurrentWorkerLocation,
} from '../../services/location/workerLocation.service'

type PersonalInformationScreenProps = {
  onContinue: () => void
}

type GenderOption = {
  value:
    | 'male'
    | 'female'
    | 'other'
    | 'prefer_not_to_say'
  label: string
}

const GENDER_OPTIONS: GenderOption[] = [
  {
    value: 'male',
    label: 'Male',
  },
  {
    value: 'female',
    label: 'Female',
  },
  {
    value: 'other',
    label: 'Other',
  },
  {
    value: 'prefer_not_to_say',
    label: 'Prefer not to say',
  },
]

const MAX_ADDRESS_LENGTH = 200
const MAX_SUMMARY_LENGTH = 500
function isValidDateOfBirth(
  value: string,
): boolean {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      value,
    )
  ) {
    return false
  }

  const [
    year,
    month,
    day,
  ] = value
    .split('-')
    .map(Number)

  const timestamp =
    Date.UTC(
      year,
      month - 1,
      day,
    )

  const date =
    new Date(
      timestamp,
    )

  return (
    date.getUTCFullYear() ===
      year &&
    date.getUTCMonth() ===
      month - 1 &&
    date.getUTCDate() ===
      day
  )
}

export default function PersonalInformationScreen({
  onContinue,
}: PersonalInformationScreenProps) {
  const [dateOfBirth, setDateOfBirth] =
    useState('')
  const [gender, setGender] =
    useState<string | null>(null)

  const [currentAddress, setCurrentAddress] =
    useState('')
  const [permanentAddress, setPermanentAddress] =
    useState('')

  const [city, setCity] =
    useState('')
  const [state, setState] =
    useState('')
  const [pincode, setPincode] =
    useState('')

  const [experienceYears, setExperienceYears] =
    useState('')
  const [experienceSummary, setExperienceSummary] =
    useState('')

  const [serviceLatitude, setServiceLatitude] =
    useState<number | null>(null)

  const [serviceLongitude, setServiceLongitude] =
    useState<number | null>(null)

  const [loading, setLoading] =
    useState(true)

  const [saving, setSaving] =
    useState(false)

  const [locationLoading, setLocationLoading] =
    useState(false)

  const [errorMessage, setErrorMessage] =
    useState('')

  const [locationMessage, setLocationMessage] =
    useState('')

  useEffect(() => {
    let mounted = true

    async function loadProfile() {
      setLoading(true)
      setErrorMessage('')

      try {
        const profile =
          await getWorkerOnboardingProfile()

        if (!mounted || !profile) {
          return
        }

        populateForm(profile)
      } catch (error) {
        console.error(
          'Unable to load worker onboarding profile:',
          error,
        )

        if (!mounted) {
          return
        }

        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'Unable to load your saved details.',
        )
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    void loadProfile()

    return () => {
      mounted = false
    }
  }, [])

  function populateForm(
    profile: WorkerOnboardingProfile,
  ) {
    setDateOfBirth(
      profile.dateOfBirth ?? '',
    )

    setGender(
      profile.gender,
    )

    setCurrentAddress(
      profile.currentAddress ?? '',
    )

    setPermanentAddress(
      profile.permanentAddress ?? '',
    )

    setCity(
      profile.city ?? '',
    )

    setState(
      profile.state ?? '',
    )

    setPincode(
      profile.pincode ?? '',
    )

    setExperienceYears(
      profile.experienceYears === null ||
      profile.experienceYears === undefined
        ? ''
        : String(
            profile.experienceYears,
          ),
    )

    setExperienceSummary(
      profile.experienceSummary ?? '',
    )

    setServiceLatitude(
      profile.serviceLatitude,
    )

    setServiceLongitude(
      profile.serviceLongitude,
    )
  }

  async function handleGetLocation() {
    if (locationLoading || saving) {
      return
    }

    setLocationMessage('')
    setErrorMessage('')
    setLocationLoading(true)

    try {
      const location =
        await getCurrentWorkerLocation({
          accuracy:
            undefined,
        })

      setServiceLatitude(
        location.latitude,
      )

      setServiceLongitude(
        location.longitude,
      )

      setLocationMessage(
        'Service location captured successfully.',
      )
    } catch (error) {
      console.error(
        'Unable to capture worker service location:',
        error,
      )

      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Unable to access your current location.',
      )
    } finally {
      setLocationLoading(false)
    }
  }

  function validateForm(): string | null {
    const normalizedDob =
      dateOfBirth.trim()

    const normalizedAddress =
      currentAddress.trim()

    const normalizedCity =
      city.trim()

    const normalizedState =
      state.trim()

    const normalizedPincode =
      pincode.replace(/\D/g, '')

    const normalizedExperience =
      experienceYears.trim()

    if (
  !isValidDateOfBirth(
    normalizedDob,
  )
) {
  return 'Enter a valid date of birth in YYYY-MM-DD format.'
}

    if (!gender) {
      return 'Please select your gender.'
    }

    if (!normalizedAddress) {
      return 'Current address is required.'
    }

    if (
      normalizedAddress.length >
      MAX_ADDRESS_LENGTH
    ) {
      return 'Current address is too long.'
    }

    if (!normalizedCity) {
      return 'City is required.'
    }

    if (!normalizedState) {
      return 'State is required.'
    }

    if (
      !/^\d{6}$/.test(
        normalizedPincode,
      )
    ) {
      return 'Pincode must contain 6 digits.'
    }

    const parsedExperience =
      Number(
        normalizedExperience,
      )

    if (
      normalizedExperience.length === 0 ||
      !Number.isFinite(
        parsedExperience,
      ) ||
      parsedExperience < 0
    ) {
      return 'Enter a valid number of experience years.'
    }

    if (
      experienceSummary.trim()
        .length >
      MAX_SUMMARY_LENGTH
    ) {
      return 'Experience summary is too long.'
    }

    if (
      serviceLatitude === null ||
      serviceLongitude === null
    ) {
      return 'Your current service location is required.'
    }

    return null
  }

  async function handleContinue() {
    if (saving || locationLoading) {
      return
    }

    setErrorMessage('')

    const validationError =
      validateForm()

    if (validationError) {
      setErrorMessage(
        validationError,
      )
      return
    }

    const parsedExperience =
      Number(
        experienceYears.trim(),
      )

    setSaving(true)

    try {
      await saveWorkerOnboarding({
        dateOfBirth:
          dateOfBirth.trim(),

        gender:
          gender,

        currentAddress:
          currentAddress.trim(),

        permanentAddress:
          permanentAddress.trim() ||
          null,

        city:
          city.trim(),

        state:
          state.trim(),

        pincode:
          pincode.replace(
            /\D/g,
            '',
          ),

        experienceYears:
          parsedExperience,

        experienceSummary:
          experienceSummary.trim() ||
          null,

        serviceLatitude:
          serviceLatitude,

        serviceLongitude:
          serviceLongitude,

        onboardingStep: 2,
      })

      onContinue()
    } catch (error) {
      console.error(
        'Unable to save worker personal information:',
        error,
      )

      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Unable to save your personal information.',
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
            Loading your details
          </Text>

          <Text style={styles.loadingText}>
            Restoring any information you have
            already entered...
          </Text>
        </View>
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
            styles.scrollContent
          }
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={
            false
          }
        >
          <View style={styles.intro}>
            <Text style={styles.stepLabel}>
              STEP 1
            </Text>

            <Text style={styles.title}>
              Personal information
            </Text>

            <Text style={styles.subtitle}>
              Tell us about yourself so we can
              complete your worker profile.
            </Text>
          </View>

          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                Basic details
              </Text>

              <Text style={styles.requiredText}>
                Required fields
              </Text>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>
                Date of birth
              </Text>

              <TextInput
                value={dateOfBirth}
                onChangeText={value => {
                  setDateOfBirth(value)
                  setErrorMessage('')
                }}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={
                  UI.colors.textMuted
                }
                keyboardType="numbers-and-punctuation"
                maxLength={10}
                editable={!saving}
                style={styles.input}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>
                Gender
              </Text>

              <View style={styles.genderGrid}>
                {GENDER_OPTIONS.map(
                  option => {
                    const selected =
                      gender ===
                      option.value

                    return (
                      <Pressable
                        key={
                          option.value
                        }
                        onPress={() => {
                          setGender(
                            option.value,
                          )
                          setErrorMessage('')
                        }}
                        disabled={
                          saving
                        }
                        style={[
                          styles.genderOption,
                          selected &&
                            styles.genderOptionSelected,
                        ]}
                      >
                        <View
                          style={[
                            styles.radio,
                            selected &&
                              styles.radioSelected,
                          ]}
                        >
                          {selected ? (
                            <View
                              style={
                                styles.radioDot
                              }
                            />
                          ) : null}
                        </View>

                        <Text
                          style={[
                            styles.genderLabel,
                            selected &&
                              styles.genderLabelSelected,
                          ]}
                        >
                          {option.label}
                        </Text>
                      </Pressable>
                    )
                  },
                )}
              </View>
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                Address
              </Text>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>
                Current address
              </Text>

              <TextInput
                value={currentAddress}
                onChangeText={value => {
                  setCurrentAddress(
                    value,
                  )
                  setErrorMessage('')
                }}
                placeholder="Enter your current address"
                placeholderTextColor={
                  UI.colors.textMuted
                }
                multiline
                maxLength={
                  MAX_ADDRESS_LENGTH
                }
                editable={!saving}
                style={[
                  styles.input,
                  styles.multilineInput,
                ]}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>
                Permanent address
              </Text>

              <TextInput
                value={permanentAddress}
                onChangeText={value => {
                  setPermanentAddress(
                    value,
                  )
                  setErrorMessage('')
                }}
                placeholder="Enter permanent address (optional)"
                placeholderTextColor={
                  UI.colors.textMuted
                }
                multiline
                maxLength={
                  MAX_ADDRESS_LENGTH
                }
                editable={!saving}
                style={[
                  styles.input,
                  styles.multilineInput,
                ]}
              />
            </View>

            <View style={styles.row}>
              <View
                style={[
                  styles.halfField,
                  styles.fieldRightSpacing,
                ]}
              >
                <Text style={styles.label}>
                  City
                </Text>

                <TextInput
                  value={city}
                  onChangeText={value => {
                    setCity(value)
                    setErrorMessage('')
                  }}
                  placeholder="City"
                  placeholderTextColor={
                    UI.colors.textMuted
                  }
                  autoCapitalize="words"
                  editable={!saving}
                  style={styles.input}
                />
              </View>

              <View style={styles.halfField}>
                <Text style={styles.label}>
                  State
                </Text>

                <TextInput
                  value={state}
                  onChangeText={value => {
                    setState(value)
                    setErrorMessage('')
                  }}
                  placeholder="State"
                  placeholderTextColor={
                    UI.colors.textMuted
                  }
                  autoCapitalize="words"
                  editable={!saving}
                  style={styles.input}
                />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>
                Pincode
              </Text>

              <TextInput
                value={pincode}
                onChangeText={value => {
                  setPincode(
                    value.replace(
                      /\D/g,
                      '',
                    ),
                  )
                  setErrorMessage('')
                }}
                placeholder="6-digit pincode"
                placeholderTextColor={
                  UI.colors.textMuted
                }
                keyboardType="number-pad"
                maxLength={6}
                editable={!saving}
                style={styles.input}
              />
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                Experience
              </Text>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>
                Experience in years
              </Text>

              <TextInput
                value={experienceYears}
                onChangeText={value => {
                  setExperienceYears(
                    value.replace(
                      /[^\d.]/g,
                      '',
                    ),
                  )
                  setErrorMessage('')
                }}
                placeholder="For example, 3"
                placeholderTextColor={
                  UI.colors.textMuted
                }
                keyboardType="decimal-pad"
                editable={!saving}
                style={styles.input}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>
                Experience summary
              </Text>

              <TextInput
                value={
                  experienceSummary
                }
                onChangeText={value => {
                  setExperienceSummary(
                    value,
                  )
                  setErrorMessage('')
                }}
                placeholder="Briefly describe your previous work experience"
                placeholderTextColor={
                  UI.colors.textMuted
                }
                multiline
                maxLength={
                  MAX_SUMMARY_LENGTH
                }
                editable={!saving}
                style={[
                  styles.input,
                  styles.multilineInput,
                ]}
              />
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                Service location
              </Text>
            </View>

            <Text style={styles.locationText}>
              Your service location helps
              KvikStaff determine where you can
              accept work.
            </Text>

            {serviceLatitude !==
              null &&
            serviceLongitude !==
              null ? (
              <View style={styles.locationSuccess}>
                <View
                  style={
                    styles.locationDot
                  }
                />

                <View
                  style={
                    styles.locationCopy
                  }
                >
                  <Text
                    style={
                      styles.locationTitle
                    }
                  >
                    Location captured
                  </Text>

                  <Text
                    style={
                      styles.locationCoordinates
                    }
                  >
                    {serviceLatitude.toFixed(
                      6,
                    )}
                    {' , '}
                    {serviceLongitude.toFixed(
                      6,
                    )}
                  </Text>
                </View>
              </View>
            ) : null}

            {locationMessage ? (
              <Text
                style={
                  styles.locationMessage
                }
              >
                {locationMessage}
              </Text>
            ) : null}

            <View style={styles.locationButton}>
              <AppButton
                title={
                  locationLoading
                    ? 'Getting location...'
                    : serviceLatitude !==
                        null
                      ? 'Refresh location'
                      : 'Use current location'
                }
                variant="secondary"
                onPress={() => {
                  void handleGetLocation()
                }}
                disabled={
                  locationLoading ||
                  saving
                }
              />
            </View>
          </View>

          {errorMessage ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorTitle}>
                Please check your details
              </Text>

              <Text style={styles.errorText}>
                {errorMessage}
              </Text>
            </View>
          ) : null}

          <View style={styles.action}>
            <AppButton
              title={
                saving
                  ? 'Saving...'
                  : 'Save and continue'
              }
              disabled={
                saving ||
                locationLoading
              }
              onPress={() => {
                void handleContinue()
              }}
            />
          </View>

          <Text style={styles.footerText}>
            Your information can be updated later
            from your worker profile where
            supported.
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

  scrollContent: {
    paddingHorizontal: UI.spacing.xl,
    paddingTop: UI.spacing.lg,
    paddingBottom: UI.spacing.xxxl,
  },

  intro: {
    marginBottom: UI.spacing.lg,
  },

  stepLabel: {
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
    lineHeight: 20,
    color: UI.colors.textSecondary,
  },

  card: {
    marginBottom: UI.spacing.lg,
    padding: UI.spacing.lg,
    borderRadius: UI.radius.lg,
    backgroundColor: UI.colors.surface,
    borderWidth: 1,
    borderColor: UI.colors.border,
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: UI.spacing.md,
  },

  sectionTitle: {
    fontSize: UI.typography.subtitle,
    fontWeight: '800',
    color: UI.colors.text,
  },

  requiredText: {
    fontSize: UI.typography.caption,
    color: UI.colors.textMuted,
  },

  field: {
    marginTop: UI.spacing.md,
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
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: UI.colors.inputBorder,
    borderRadius: UI.radius.md,
    backgroundColor: UI.colors.surface,
    fontSize: UI.typography.bodyLarge,
    color: UI.colors.text,
  },

  multilineInput: {
    minHeight: 88,
    textAlignVertical: 'top',
  },

  genderGrid: {
    marginTop: UI.spacing.xs,
  },

  genderOption: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 46,
    marginBottom: UI.spacing.sm,
    paddingHorizontal: UI.spacing.md,
    borderWidth: 1,
    borderColor: UI.colors.inputBorder,
    borderRadius: UI.radius.md,
    backgroundColor: UI.colors.surface,
  },

  genderOptionSelected: {
    borderColor: UI.colors.primaryBlue,
    backgroundColor: UI.colors.successBackground,
  },

  radio: {
    width: 20,
    height: 20,
    borderRadius: UI.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: UI.colors.border,
  },

  radioSelected: {
    borderColor: UI.colors.primaryBlue,
  },

  radioDot: {
    width: 10,
    height: 10,
    borderRadius: UI.radius.pill,
    backgroundColor: UI.colors.primaryBlue,
  },

  genderLabel: {
    marginLeft: UI.spacing.md,
    fontSize: UI.typography.body,
    color: UI.colors.textSecondary,
  },

  genderLabelSelected: {
    fontWeight: '700',
    color: UI.colors.text,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },

  halfField: {
    flex: 1,
    marginTop: UI.spacing.md,
  },

  fieldRightSpacing: {
    marginRight: UI.spacing.sm,
  },

  locationText: {
    fontSize: UI.typography.body,
    lineHeight: 20,
    color: UI.colors.textSecondary,
  },

  locationSuccess: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: UI.spacing.md,
    padding: UI.spacing.md,
    borderRadius: UI.radius.md,
    backgroundColor: UI.colors.successBackground,
  },

  locationDot: {
    width: 12,
    height: 12,
    borderRadius: UI.radius.pill,
    backgroundColor: UI.colors.success,
  },

  locationCopy: {
    flex: 1,
    marginLeft: UI.spacing.md,
  },

  locationTitle: {
    fontSize: UI.typography.small,
    fontWeight: '800',
    color: UI.colors.success,
  },

  locationCoordinates: {
    marginTop: 2,
    fontSize: UI.typography.caption,
    color: UI.colors.textSecondary,
  },

  locationMessage: {
    marginTop: UI.spacing.sm,
    fontSize: UI.typography.small,
    color: UI.colors.success,
  },

  locationButton: {
    marginTop: UI.spacing.md,
  },

  errorBox: {
    marginBottom: UI.spacing.lg,
    padding: UI.spacing.md,
    borderRadius: UI.radius.md,
    backgroundColor: UI.colors.errorBackground,
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

  action: {
    marginTop: UI.spacing.xs,
  },

  footerText: {
    marginTop: UI.spacing.md,
    fontSize: UI.typography.caption,
    lineHeight: 16,
    color: UI.colors.textMuted,
    textAlign: 'center',
  },
})