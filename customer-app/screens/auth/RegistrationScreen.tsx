import { useState } from 'react'
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

import { AppButton } from '../../components/ui/AppButton'
import { ScreenContainer } from '../../components/layout/ScreenContainer'

type RegistrationScreenProps = {
  phone: string
  onContinue: (
    name: string,
    companyName: string,
  ) => Promise<void>
}

const MAX_NAME_LENGTH = 100
const MAX_COMPANY_NAME_LENGTH = 150

const KvikStaffLogo = require('../../assets/branding/tempstuff-logo.png')
const registrationHero = require('../../assets/home/hero-worker.png')

export default function RegistrationScreen({
  phone,
  onContinue,
}: RegistrationScreenProps) {
  const [name, setName] = useState('')
  const [companyName, setCompanyName] =
    useState('')

  const [loading, setLoading] =
    useState(false)

  const [error, setError] =
    useState('')

  const normalizedName = name.trim()
  const normalizedCompanyName =
    companyName.trim()

  const isValid =
    normalizedName.length > 0 &&
    normalizedName.length <=
      MAX_NAME_LENGTH &&
    normalizedCompanyName.length > 0 &&
    normalizedCompanyName.length <=
      MAX_COMPANY_NAME_LENGTH

  async function handleContinue() {
    if (!isValid || loading) {
      return
    }

    setError('')
    setLoading(true)

    try {
      await onContinue(
        normalizedName,
        normalizedCompanyName,
      )
    } catch (error) {
      console.error(
        'Registration screen error:',
        error,
      )

      setError(
        error instanceof Error
          ? error.message
          : 'Unable to create the customer account.',
      )
    } finally {
      setLoading(false)
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
        <View style={styles.container}>
          <View>
            <View style={styles.brandRow}>
              <Image
                source={KvikStaffLogo}
                style={styles.logo}
                resizeMode="contain"
              />
              <View style={styles.brandDivider} />
              <Text style={styles.brandLabel}>
                NEW CUSTOMER
              </Text>
            </View>

            <View style={styles.heroCard}>
              <View style={styles.heroCopy}>
                <View style={styles.stepBadge}>
                  <Text style={styles.stepBadgeText}>
                    03
                  </Text>
                </View>

                <Text style={styles.title}>
                  Let’s get your account ready
                </Text>

                <Text style={styles.subtitle}>
                  Add a few details so KvikStaff can
                  personalize your booking experience.
                </Text>

                <View style={styles.phonePill}>
                  <View style={styles.phoneDot} />
                  <Text style={styles.phoneText}>
                    {phone || 'Mobile verified'}
                  </Text>
                </View>
              </View>

              <Image
                source={registrationHero}
                style={styles.heroImage}
                resizeMode="contain"
              />
            </View>
          </View>

          <View style={styles.formCard}>
            <View style={styles.formHeader}>
              <View style={styles.profileIcon}>
                <Text style={styles.profileIconText}>
                  +
                </Text>
              </View>

              <View style={styles.formHeaderCopy}>
                <Text style={styles.formTitle}>
                  Your details
                </Text>
                <Text style={styles.formSubtitle}>
                  This information will be linked to your customer account.
                </Text>
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>
                Full name
              </Text>

              <TextInput
                value={name}
                onChangeText={value => {
                  setName(value)
                  setError('')
                }}
                placeholder="Enter your full name"
                placeholderTextColor="#9AAEBB"
                autoCapitalize="words"
                autoCorrect={false}
                editable={!loading}
                maxLength={
                  MAX_NAME_LENGTH
                }
                style={styles.input}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>
                Company name
              </Text>

              <TextInput
                value={companyName}
                onChangeText={value => {
                  setCompanyName(value)
                  setError('')
                }}
                placeholder="Enter your company name"
                placeholderTextColor="#9AAEBB"
                autoCapitalize="words"
                autoCorrect={false}
                editable={!loading}
                maxLength={
                  MAX_COMPANY_NAME_LENGTH
                }
                style={styles.input}
              />
            </View>

            {error.length > 0 && (
              <View style={styles.errorBox}>
                <Text style={styles.errorIcon}>
                  !
                </Text>
                <Text style={styles.error}>
                  {error}
                </Text>
              </View>
            )}

            <AppButton
              title={
                loading
                  ? 'Creating account...'
                  : 'Continue'
              }
              disabled={!isValid || loading}
              onPress={handleContinue}
            />

            <Text style={styles.helperText}>
              You can update your account details later.
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  keyboard: {
    flex: 1,
  },

  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 18,
    justifyContent: 'space-between',
    backgroundColor: '#F7FBFD',
  },

  brandRow: {
    height: 38,
    flexDirection: 'row',
    alignItems: 'center',
  },

  logo: {
    width: 118,
    height: 34,
  },

  brandDivider: {
    width: 1,
    height: 18,
    marginHorizontal: 12,
    backgroundColor: '#D8E6ED',
  },

  brandLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
    color: '#6C8190',
  },

  heroCard: {
    minHeight: 220,
    marginTop: 18,
    paddingLeft: 20,
    paddingTop: 21,
    paddingBottom: 10,
    borderRadius: 26,
    overflow: 'hidden',
    backgroundColor: '#0A3972',
    flexDirection: 'row',
    alignItems: 'center',
  },

  heroCopy: {
    flex: 1,
    zIndex: 2,
  },

  stepBadge: {
    width: 38,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0784FB',
    marginBottom: 13,
  },

  stepBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.8,
  },

  title: {
    fontSize: 27,
    lineHeight: 33,
    fontWeight: '800',
    color: '#FFFFFF',
    maxWidth: 215,
  },

  subtitle: {
    marginTop: 9,
    fontSize: 13,
    lineHeight: 20,
    color: '#D9EAF3',
    maxWidth: 220,
  },

  phonePill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 13,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.11)',
  },

  phoneDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 8,
    backgroundColor: '#00D0C5',
  },

  phoneText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  heroImage: {
    width: 136,
    height: 178,
    marginRight: -11,
    marginBottom: -1,
  },

  formCard: {
    padding: 18,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2EDF2',
    shadowColor: '#0A3972',
    shadowOpacity: 0.07,
    shadowRadius: 18,
    shadowOffset: {
      width: 0,
      height: 7,
    },
    elevation: 3,
  },

  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },

  profileIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E5F7F7',
    marginRight: 11,
  },

  profileIconText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#008C8C',
  },

  formHeaderCopy: {
    flex: 1,
  },

  formTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#17354A',
  },

  formSubtitle: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
    color: '#718491',
  },

  field: {
    marginBottom: 13,
  },

  label: {
    marginBottom: 7,
    fontSize: 13,
    fontWeight: '700',
    color: '#29465A',
  },

  input: {
    height: 51,
    borderWidth: 1.2,
    borderColor: '#C5D6DF',
    borderRadius: 14,
    paddingHorizontal: 15,
    backgroundColor: '#F9FCFD',
    fontSize: 15,
    color: '#0A3972',
  },

  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 11,
    paddingVertical: 9,
    marginBottom: 11,
    borderRadius: 12,
    backgroundColor: '#FFF2F0',
  },

  errorIcon: {
    width: 18,
    height: 18,
    marginRight: 7,
    borderRadius: 9,
    textAlign: 'center',
    lineHeight: 18,
    fontSize: 11,
    fontWeight: '900',
    color: '#FFFFFF',
    backgroundColor: '#D92D20',
  },

  error: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: '#B42318',
    fontWeight: '600',
  },

  helperText: {
    marginTop: 10,
    fontSize: 11,
    lineHeight: 16,
    color: '#8A9AA4',
    textAlign: 'center',
  },
})
