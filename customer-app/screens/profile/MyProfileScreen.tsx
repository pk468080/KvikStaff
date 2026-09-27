import {
  useCallback,
  useState,
} from 'react'
import { useFocusEffect } from '@react-navigation/native'
import type { ReactNode } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import { ScreenContainer } from '../../components/layout/ScreenContainer'
import {
  getLatestCustomerAddress,
} from '../../services/addresses/customerAddress.service'
import {
  getCurrentCustomerProfile,
  signOut,
  type CustomerProfile,
} from '../../services/auth/auth.service'

type MyProfileScreenProps = {
  onSignOut: () => void
  onEditProfile: () => void
  onSavedAddresses: () => void
  onNotifications: () => void
  onSupport: () => void
  onDeleteAccount: () => void
  onTerms: () => void
  onPrivacy: () => void
}

export default function MyProfileScreen({
  onSignOut,
  onEditProfile,
  onSavedAddresses,
  onNotifications,
  onSupport,
  onDeleteAccount,
  onTerms,
  onPrivacy,
}: MyProfileScreenProps) {
  const [profile, setProfile] =
    useState<CustomerProfile | null>(null)
  const [address, setAddress] =
    useState<string | null>(null)
  const [loading, setLoading] =
    useState(true)
  const [error, setError] =
    useState<string | null>(null)
  const [signingOut, setSigningOut] =
    useState(false)

  const loadProfile = useCallback(
    async () => {
      try {
        setLoading(true)

        const [
          nextProfile,
          nextAddress,
        ] = await Promise.all([
          getCurrentCustomerProfile(),
          getLatestCustomerAddress(),
        ])

        setProfile(nextProfile)
        setAddress(
          nextAddress?.addressLine ??
            null,
        )
        setError(null)
      } catch (nextError) {
        setError(
          nextError instanceof Error
            ? nextError.message
            : 'Unable to load your profile.',
        )
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  useFocusEffect(
  useCallback(() => {
    void loadProfile()
  }, [loadProfile]),
)

  async function handleSignOut() {
    if (signingOut) {
      return
    }

    setSigningOut(true)
    setError(null)

    try {
      await signOut()
      onSignOut()
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Unable to log out.',
      )
      setSigningOut(false)
    }
  }

  function confirmSignOut() {
    Alert.alert(
      'Log out',
      'Are you sure you want to log out of TempStaff?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Log out',
          style: 'destructive',
          onPress: () => {
            void handleSignOut()
          },
        },
      ],
    )
  }

  const initials =
    getInitials(
      profile?.full_name,
    )

  if (loading) {
    return (
      <ScreenContainer>
        <View style={styles.center}>
          <ActivityIndicator
            size="large"
          />
        </View>
      </ScreenContainer>
    )
  }

  return (
    <ScreenContainer
      style={styles.screen}
    >
      <ScrollView
        contentContainerStyle={
          styles.content
        }
        showsVerticalScrollIndicator={
          false
        }
      >
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text
              style={styles.avatarText}
            >
              {initials}
            </Text>
          </View>

          <View style={styles.headerCopy}>
            <Text
              style={styles.eyebrow}
            >
              ACCOUNT
            </Text>

            <Text
              style={styles.title}
            >
              {profile?.full_name ||
                'My Profile'}
            </Text>

            <Text
              style={styles.company}
            >
              {profile?.company_name ||
                'Company not set'}
            </Text>

            <Text
              style={styles.phone}
            >
              {profile?.phone ||
                'Mobile number not set'}
            </Text>
          </View>
        </View>

        {error ? (
          <View
            style={styles.errorCard}
          >
            <Text
              style={styles.error}
            >
              {error}
            </Text>
          </View>
        ) : null}

        <ProfileSection title="Account">
          <ProfileAction
            icon="P"
            title="Edit Profile"
            subtitle="Name, company and account details"
            onPress={onEditProfile}
          />

          <ProfileAction
            icon="⌖"
            title="Saved Addresses"
            subtitle={
              address ??
              'Add and manage service locations'
            }
            onPress={onSavedAddresses}
            isLast
          />
        </ProfileSection>

        <ProfileSection title="Activity & Support">
          <ProfileAction
            icon="N"
            title="Notifications"
            subtitle="Booking and service updates"
            onPress={onNotifications}
          />

          <ProfileAction
            icon="?"
            title="Help & Support"
            subtitle="Get help or report a problem"
            onPress={onSupport}
            isLast
          />
        </ProfileSection>

        <ProfileSection title="Legal">
          <ProfileAction
            icon="T"
            title="Terms & Conditions"
            subtitle="Service terms and customer responsibilities"
            onPress={onTerms}
          />

          <ProfileAction
            icon="P"
            title="Privacy Policy"
            subtitle="How TempStaff handles your data"
            onPress={onPrivacy}
            isLast
          />
        </ProfileSection>

        <ProfileSection title="Account">
          <ProfileAction
            icon="!"
            title="Delete Account"
            subtitle="Request permanent account deletion"
            destructive
            onPress={onDeleteAccount}
            isLast
          />
        </ProfileSection>

        <Pressable
          style={({ pressed }) => [
            styles.logoutButton,
            pressed &&
              styles.logoutPressed,
          ]}
          disabled={signingOut}
          onPress={
            confirmSignOut
          }
        >
          <Text
            style={styles.logoutText}
          >
            {signingOut
              ? 'Logging out...'
              : 'Log Out'}
          </Text>
        </Pressable>

        <Text
          style={styles.version}
        >
          TempStaff Customer
        </Text>
      </ScrollView>
    </ScreenContainer>
  )
}

function ProfileSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <View style={styles.section}>
      <Text
        style={styles.sectionTitle}
      >
        {title.toUpperCase()}
      </Text>

      <View
        style={styles.sectionCard}
      >
        {children}
      </View>
    </View>
  )
}

function ProfileAction({
  icon,
  title,
  subtitle,
  onPress,
  isLast = false,
  destructive = false,
}: {
  icon: string
  title: string
  subtitle: string
  onPress: () => void
  isLast?: boolean
  destructive?: boolean
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        !isLast &&
          styles.actionBorder,
        pressed &&
          styles.actionPressed,
      ]}
    >
      <View
        style={[
          styles.actionIcon,
          destructive &&
            styles.actionIconDanger,
        ]}
      >
        <Text
          style={[
            styles.actionIconText,
            destructive &&
              styles.actionIconTextDanger,
          ]}
        >
          {icon}
        </Text>
      </View>

      <View
        style={styles.actionCopy}
      >
        <Text
          style={[
            styles.actionTitle,
            destructive &&
              styles.actionTitleDanger,
          ]}
        >
          {title}
        </Text>

        <Text
          style={styles.actionSubtitle}
          numberOfLines={2}
        >
          {subtitle}
        </Text>
      </View>

      <Text
        style={styles.chevron}
      >
        ›
      </Text>
    </Pressable>
  )
}

function getInitials(
  name?: string | null,
) {
  const trimmed =
    name?.trim() ?? ''

  if (!trimmed) {
    return 'T'
  }

  const parts =
    trimmed.split(/\s+/)

  if (parts.length === 1) {
    return parts[0]
      .slice(0, 1)
      .toUpperCase()
  }

  return `${parts[0][0]}${parts[parts.length - 1][0]}`
    .toUpperCase()
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#F7F9FC',
  },

  content: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 32,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 22,
  },

  avatar: {
    width: 68,
    height: 68,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF3FF',
    borderWidth: 1,
    borderColor: '#D4E7FF',
  },

  avatarText: {
    color: '#007AFF',
    fontSize: 24,
    fontWeight: '800',
  },

  headerCopy: {
    flex: 1,
    marginLeft: 14,
  },

  eyebrow: {
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 2,
  },

  title: {
    color: '#111827',
    fontSize: 24,
    fontWeight: '800',
  },

  company: {
    color: '#4B5563',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
  },

  phone: {
    color: '#9CA3AF',
    fontSize: 13,
    marginTop: 3,
  },

  errorCard: {
    marginBottom: 16,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#FFF3F2',
    borderWidth: 1,
    borderColor: '#FFD7D2',
  },

  error: {
    color: '#B42318',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },

  section: {
    marginBottom: 18,
  },

  sectionTitle: {
    marginBottom: 8,
    marginLeft: 4,
    color: '#7A8290',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },

  sectionCard: {
    overflow: 'hidden',
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8ECF2',
  },

  action: {
    minHeight: 76,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },

  actionBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#EEF1F5',
  },

  actionPressed: {
    backgroundColor: '#F7F9FC',
  },

  actionIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF6FF',
  },

  actionIconDanger: {
    backgroundColor: '#FFF1F0',
  },

  actionIconText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '800',
  },

  actionIconTextDanger: {
    color: '#D92D20',
  },

  actionCopy: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },

  actionTitle: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '700',
  },

  actionTitleDanger: {
    color: '#D92D20',
  },

  actionSubtitle: {
    marginTop: 3,
    color: '#8B93A0',
    fontSize: 12,
    lineHeight: 17,
  },

  chevron: {
    color: '#AAB1BC',
    fontSize: 28,
    fontWeight: '300',
  },

  logoutButton: {
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    backgroundColor: '#111827',
  },

  logoutPressed: {
    opacity: 0.82,
  },

  logoutText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },

  version: {
    textAlign: 'center',
    marginTop: 14,
    color: '#A3AAB5',
    fontSize: 11,
  },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
