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
import { verifyOtp } from '../../services/auth/auth.service'
import { UI } from '../../constants/ui';

type OtpScreenProps = {
  phone: string
  onVerified: (
    phone: string,
    needsRegistration: boolean,
  ) => void
}

const KvikStaffLogo = require('../../assets/branding/tempstuff-logo.png')
const otpHero = require('../../assets/home/hero-worker.png')

export default function OtpScreen({
  phone,
  onVerified,
}: OtpScreenProps) {
  const [otp, setOtp] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const isValid = otp.length === 6

  async function handleVerify() {
    if (!isValid || loading) {
      return
    }

    setError('')
    setLoading(true)

    const result = await verifyOtp(phone, otp)

    setLoading(false)

    if (!result.success) {
      setError(
        result.error ?? 'Unable to verify the OTP.',
      )
      return
    }

    onVerified(
      phone,
      result.needsRegistration,
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
                SECURE LOGIN
              </Text>
            </View>

            <View style={styles.heroCard}>
              <View style={styles.heroCopy}>
                <View style={styles.stepBadge}>
                  <Text style={styles.stepBadgeText}>
                    02
                  </Text>
                </View>

                <Text style={styles.title}>
                  Verify your mobile
                </Text>

                <Text style={styles.subtitle}>
                  Enter the 6-digit verification code
                  to continue securely.
                </Text>

                <View style={styles.phonePill}>
                  <View style={styles.phoneDot} />
                  <Text style={styles.phone}>
                    {phone}
                  </Text>
                </View>
              </View>

              <Image
                source={otpHero}
                style={styles.heroImage}
                resizeMode="contain"
              />
            </View>
          </View>

          <View style={styles.formCard}>
            <View style={styles.formHeader}>
              <View style={styles.securityIcon}>
                <Text style={styles.securityIconText}>
                  ✓
                </Text>
              </View>

              <View style={styles.formHeaderCopy}>
                <Text style={styles.formTitle}>
                  Enter verification code
                </Text>
                <Text style={styles.formSubtitle}>
                  Use the 6-digit OTP sent to your mobile.
                </Text>
              </View>
            </View>

            <TextInput
              value={otp}
              onChangeText={value => {
                setError('')
                setOtp(
                  value.replace(/\D/g, ''),
                )
              }}
              placeholder="------"
              placeholderTextColor="#B8C6D1"
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
              textContentType="oneTimeCode"
              style={styles.input}
            />

            <View style={styles.codeHint}>
              <View style={styles.infoDot}>
                <Text style={styles.infoDotText}>
                  i
                </Text>
              </View>
              <Text style={styles.codeHintText}>
                Check your SMS for the six-digit verification code.
              </Text>
            </View>

            {error ? (
              <Text style={styles.error}>
                {error}
              </Text>
            ) : null}

            <AppButton
              title={
                loading
                  ? 'Verifying...'
                  : 'Verify & Continue'
              }
              disabled={!isValid || loading}
              onPress={handleVerify}
            />

            <Text style={styles.footerText}>
              Your mobile number is used to secure
              your KvikStaff account.
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
    paddingHorizontal: UI.spacing.xl,
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
    minHeight: 235,
    marginTop: 18,
    paddingLeft: 20,
    paddingTop: 22,
    paddingBottom: 14,
    borderRadius: 26,
    overflow: 'hidden',
    backgroundColor: UI.colors.primary,
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
    backgroundColor: UI.colors.primaryBlue,
    marginBottom: 14,
  },

  stepBadgeText: {
    fontSize: UI.typography.small,
    fontWeight: '800',
    color: UI.colors.surface,
    letterSpacing: 0.8,
  },

  title: {
    fontSize: 29,
    lineHeight: 34,
    fontWeight: '800',
    color: UI.colors.surface,
    maxWidth: 205,
  },

  subtitle: {
    marginTop: 10,
    fontSize: UI.typography.body,
    lineHeight: 21,
    color: '#D9EAF3',
    maxWidth: 215,
  },

  phonePill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 15,
    paddingHorizontal: 11,
    paddingVertical: UI.spacing.sm,
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

  phone: {
    fontSize: UI.typography.body,
    fontWeight: '700',
    color: UI.colors.surface,
  },

  heroImage: {
    width: 142,
    height: 190,
    marginRight: -13,
    marginBottom: -2,
  },

  formCard: {
    padding: 18,
    borderRadius: 22,
    backgroundColor: UI.colors.surface,
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
    marginBottom: UI.spacing.lg,
  },

  securityIcon: {
    width: 40,
    height: 40,
    borderRadius: UI.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E5F7F7',
    marginRight: 11,
  },

  securityIconText: {
    fontSize: 19,
    fontWeight: '900',
    color: '#008C8C',
  },

  formHeaderCopy: {
    flex: 1,
  },

  formTitle: {
    fontSize: UI.typography.bodyLarge,
    fontWeight: '800',
    color: '#17354A',
  },

  formSubtitle: {
    marginTop: 3,
    fontSize: UI.typography.small,
    lineHeight: 17,
    color: '#718491',
  },

  input: {
    height: 58,
    borderWidth: 1.5,
    borderColor: '#BFD2DC',
    borderRadius: 15,
    paddingHorizontal: 18,
    backgroundColor: '#F9FCFD',
    fontSize: 25,
    fontWeight: '800',
    letterSpacing: 7,
    color: UI.colors.primary,
    textAlign: 'center',
  },

  codeHint: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 11,
  },

  infoDot: {
    width: 17,
    height: 17,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 7,
    backgroundColor: '#E8F4F8',
  },

  infoDotText: {
    fontSize: UI.typography.caption,
    fontWeight: '800',
    color: '#4B7285',
  },

  codeHintText: {
    flex: 1,
    fontSize: UI.typography.small,
    color: '#6D8290',
  },

  error: {
    marginBottom: 10,
    fontSize: 13,
    lineHeight: 18,
    color: '#D92D20',
    fontWeight: '600',
  },

  footerText: {
    marginTop: 10,
    fontSize: UI.typography.caption,
    lineHeight: 16,
    color: '#8A9AA4',
    textAlign: 'center',
  },
})
