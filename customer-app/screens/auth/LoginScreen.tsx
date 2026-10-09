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

type LoginScreenProps = {
  onContinue: (phone: string) => void | Promise<void>
}

export default function LoginScreen({
  onContinue,
}: LoginScreenProps) {
  const [phone, setPhone] = useState('')

  const normalizedPhone = phone.replace(/\D/g, '')

  const isValid =
    normalizedPhone.length >= 10 &&
    normalizedPhone.length <= 15
    const [sendingOtp, setSendingOtp] = useState(false)
const [requestError, setRequestError] = useState('')

async function handleContinue() {
  if (!isValid || sendingOtp) {
    return
  }

  setRequestError('')
  setSendingOtp(true)

  try {
    await onContinue(normalizedPhone)
  } catch {
    setRequestError(
      'Could not send a verification code. Please try again later.',
    )
  } finally {
    setSendingOtp(false)
  }
}

  return (
    <ScreenContainer>
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.container}>
          <View style={styles.content}>
            <View style={styles.brandRow}>
              <Image
                source={require('../../assets/branding/tempstuff-logo.png')}
                style={styles.logo}
                resizeMode="contain"
              />

              <View style={styles.brandCopy}>
                <Text style={styles.brandName}>KvikStaff</Text>
                <Text style={styles.brandTagline}>
                  On-demand workforce
                </Text>
              </View>
            </View>

            <View style={styles.hero}>
              <View style={styles.heroAccent} />

              <View style={styles.heroCopy}>
                <Text style={styles.eyebrow}>
                  STAFF WHEN YOU NEED THEM
                </Text>

                <Text style={styles.title}>
                  Welcome back
                </Text>

                <Text style={styles.subtitle}>
                  Find trusted staff for your everyday business and
                  support needs.
                </Text>
              </View>

              <Image
                source={require('../../assets/home/hero-worker.png')}
                style={styles.workerImage}
                resizeMode="contain"
              />
            </View>

            <View style={styles.formCard}>
              <Text style={styles.formTitle}>
                Sign in with your mobile number
              </Text>

              <Text style={styles.formSubtitle}>
                We'll send you a secure OTP to continue.
              </Text>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>
                  Mobile number
                </Text>

                <View
                  style={[
                    styles.inputShell,
                    isValid && styles.inputShellValid,
                  ]}
                >
                  <Text style={styles.countryCode}>
                    +91
                  </Text>

                  <View style={styles.inputDivider} />

                  <TextInput
                    value={phone}
                    onChangeText={setPhone}
                    placeholder="Enter mobile number"
                    placeholderTextColor="#8A9AAA"
                    keyboardType="phone-pad"
                    autoComplete="tel"
                    maxLength={10}
                    style={styles.input}
                  />
                </View>
              </View>

              <AppButton
  title={sendingOtp ? 'Sending OTP...' : 'Send OTP'}
  disabled={!isValid || sendingOtp}
  onPress={() => {
    void handleContinue()
  }}
/>

{requestError ? (
  <Text
    accessibilityRole="alert"
    style={styles.requestError}
  >
    {requestError}
  </Text>
) : null}

              <View style={styles.securityRow}>
                <View style={styles.securityIcon}>
                  <Text style={styles.securityCheck}>
                    ✓
                  </Text>
                </View>

                <View style={styles.securityCopy}>
                  <Text style={styles.securityTitle}>
                    Secure OTP verification
                  </Text>
                  <Text style={styles.securityText}>
                    Your mobile number is used only to securely sign you in.
                  </Text>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerTitle}>
              Trusted support, just a tap away
            </Text>

            <Text style={styles.footerText}>
              Flexible staffing for business and support needs
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
requestError: {
  marginTop: 10,
  color: '#D92D20',
  fontSize: 13,
  lineHeight: 18,
  fontWeight: '600',
},
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 18,
    backgroundColor: '#F7FBFD',
  },

  content: {
    flex: 1,
  },

  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  logo: {
    width: 46,
    height: 46,
  },

  brandCopy: {
    marginLeft: 10,
  },

  brandName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0A3972',
    letterSpacing: 0.1,
  },

  brandTagline: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '600',
    color: '#0784FB',
  },

  hero: {
    minHeight: 190,
    marginTop: 22,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#0A3972',
    position: 'relative',
    flexDirection: 'row',
  },

  heroAccent: {
    position: 'absolute',
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#0784FB',
    opacity: 0.18,
    right: 86,
    top: -28,
  },

  heroCopy: {
    flex: 1,
    paddingLeft: 20,
    paddingTop: 22,
    paddingRight: 4,
    zIndex: 2,
  },

  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: '#57E07D',
  },

  title: {
    marginTop: 8,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  subtitle: {
    marginTop: 8,
    maxWidth: 210,
    fontSize: 13,
    lineHeight: 19,
    color: '#D9EAF3',
  },

  workerImage: {
    width: 135,
    height: 175,
    alignSelf: 'flex-end',
    marginRight: -2,
    zIndex: 1,
  },

  formCard: {
    marginTop: 16,
    padding: 18,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2EDF2',
    shadowColor: '#0A3972',
    shadowOffset: {
      width: 0,
      height: 5,
    },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 3,
  },

  formTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0A3972',
  },

  formSubtitle: {
    marginTop: 5,
    fontSize: 13,
    lineHeight: 19,
    color: '#64788A',
  },

  inputGroup: {
    marginTop: 16,
  },

  label: {
    marginBottom: 7,
    fontSize: 13,
    fontWeight: '700',
    color: '#29465A',
  },

  inputShell: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.2,
    borderColor: '#C9D8E1',
    borderRadius: 14,
    backgroundColor: '#FBFDFE',
  },

  inputShellValid: {
    borderColor: '#0784FB',
  },

  countryCode: {
    paddingLeft: 14,
    fontSize: 16,
    fontWeight: '700',
    color: '#0A3972',
  },

  inputDivider: {
    width: 1,
    height: 24,
    marginHorizontal: 11,
    backgroundColor: '#D7E3EA',
  },

  input: {
    flex: 1,
    height: 52,
    paddingRight: 12,
    paddingVertical: 0,
    fontSize: 17,
    color: '#0A3972',
  },

  securityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#EDF2F5',
  },

  securityIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E2F7F5',
  },

  securityCheck: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0784FB',
  },

  securityCopy: {
    flex: 1,
    marginLeft: 9,
  },

  securityTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#29465A',
  },

  securityText: {
    marginTop: 2,
    fontSize: 10,
    lineHeight: 15,
    color: '#8193A1',
  },

  footer: {
    alignItems: 'center',
    paddingTop: 12,
  },

  footerTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0A3972',
  },

  footerText: {
    marginTop: 4,
    fontSize: 10,
    color: '#7A8D9B',
    textAlign: 'center',
  },
})
