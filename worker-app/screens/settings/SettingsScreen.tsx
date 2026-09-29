import {
  useState,
} from 'react'

import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import {
  Ionicons,
} from '@expo/vector-icons'

import {
  ScreenContainer,
} from '../../components/layout/ScreenContainer'

import {
  UI,
} from '../../constants/ui'

import {
  signOutWorker,
} from '../../services/auth/workerAuth.service'

type SettingsScreenProps = {
  onBack?: () => void
  onEditProfile?: () => void
  onSchedule?: () => void
  onNotifications?: () => void
  onSupport?: () => void
  onSignedOut?: () => void
}

const APP_VERSION = '1.0.0'

type SettingsRowProps = {
  icon: keyof typeof Ionicons.glyphMap
  iconBackground: string
  iconColor: string
  title: string
  subtitle: string
  onPress?: () => void
  disabled?: boolean
  destructive?: boolean
}

function SettingsRow({
  icon,
  iconBackground,
  iconColor,
  title,
  subtitle,
  onPress,
  disabled = false,
  destructive = false,
}: SettingsRowProps) {
  const contentColor = destructive
    ? UI.colors.error
    : UI.colors.text

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress || disabled}
      accessibilityRole={
        onPress ? 'button' : undefined
      }
      accessibilityLabel={title}
      style={({ pressed }) => [
        styles.settingsRow,
        pressed &&
          onPress &&
          !disabled &&
          styles.settingsRowPressed,
        disabled &&
          styles.settingsRowDisabled,
      ]}
    >
      <View
        style={[
          styles.rowIcon,
          {
            backgroundColor:
              iconBackground,
          },
        ]}
      >
        <Ionicons
          name={icon}
          size={20}
          color={iconColor}
        />
      </View>

      <View
        style={styles.rowCopy}
      >
        <Text
          style={[
            styles.rowTitle,
            {
              color: contentColor,
            },
          ]}
        >
          {title}
        </Text>

        <Text
          style={styles.rowSubtitle}
          numberOfLines={2}
        >
          {subtitle}
        </Text>
      </View>

      {onPress ? (
        <Ionicons
          name="chevron-forward"
          size={19}
          color={UI.colors.textMuted}
        />
      ) : null}
    </Pressable>
  )
}

export default function SettingsScreen({
  onBack,
  onEditProfile,
  onSchedule,
  onNotifications,
  onSupport,
  onSignedOut,
}: SettingsScreenProps) {
  const [
    signingOut,
    setSigningOut,
  ] = useState(false)

  function handleSignOut() {
    if (signingOut) {
      return
    }

    Alert.alert(
      'Sign out',
      'Are you sure you want to sign out of the TempStaff worker app?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: () => {
            void performSignOut()
          },
        },
      ],
    )
  }

  async function performSignOut() {
    if (signingOut) {
      return
    }

    setSigningOut(true)

    try {
      await signOutWorker()
      onSignedOut?.()
    } catch (cause) {
      Alert.alert(
        'Unable to sign out',
        cause instanceof Error
          ? cause.message
          : 'Please try again.',
      )
    } finally {
      setSigningOut(false)
    }
  }

  function showUnavailable(
    title: string,
  ) {
    Alert.alert(
      title,
      'This setting is not configured in the current worker app build.',
    )
  }

  return (
    <ScreenContainer>
      <ScrollView
        contentContainerStyle={
          styles.content
        }
        showsVerticalScrollIndicator={
          false
        }
      >
        <View
          style={styles.topBar}
        >
          {onBack ? (
            <Pressable
              onPress={onBack}
              disabled={signingOut}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              style={({ pressed }) => [
                styles.headerButton,
                pressed &&
                  styles.headerButtonPressed,
                signingOut &&
                  styles.headerButtonDisabled,
              ]}
            >
              <Ionicons
                name="arrow-back"
                size={21}
                color={UI.colors.primary}
              />
            </Pressable>
          ) : (
            <View
              style={
                styles.headerButtonPlaceholder
              }
            />
          )}

          <View
            style={styles.headerCenter}
          >
            <Text
              style={styles.headerEyebrow}
            >
              TEMPSTAFF
            </Text>

            <Text
              style={styles.headerTitle}
            >
              Settings
            </Text>
          </View>

          <View
            style={
              styles.headerButtonPlaceholder
            }
          />
        </View>

        <View
          style={styles.heroCard}
        >
          <View
            style={styles.heroIcon}
          >
            <Ionicons
              name="settings-outline"
              size={25}
              color={UI.colors.surface}
            />
          </View>

          <View
            style={styles.heroCopy}
          >
            <Text
              style={styles.heroEyebrow}
            >
              WORKER ACCOUNT
            </Text>

            <Text
              style={styles.heroTitle}
            >
              Account & app settings
            </Text>

            <Text
              style={styles.heroText}
            >
              Manage profile access, work availability,
              notifications and help from one place.
            </Text>
          </View>
        </View>

        <View
          style={styles.section}
        >
          <View
            style={styles.sectionHeader}
          >
            <View>
              <Text
                style={styles.sectionEyebrow}
              >
                ACCOUNT
              </Text>

              <Text
                style={styles.sectionTitle}
              >
                Your worker account
              </Text>
            </View>

            <View
              style={styles.sectionIcon}
            >
              <Ionicons
                name="person-outline"
                size={18}
                color={UI.colors.secondary}
              />
            </View>
          </View>

          {onEditProfile ? (
            <SettingsRow
              icon="person-outline"
              iconBackground={
                UI.colors.infoBackground
              }
              iconColor={
                UI.colors.secondary
              }
              title="Edit profile"
              subtitle="Update your worker information and personal details."
              onPress={onEditProfile}
              disabled={signingOut}
            />
          ) : null}

          <View
            style={styles.rowDivider}
          />

          <SettingsRow
            icon="log-out-outline"
            iconBackground={
              UI.colors.errorBackground
            }
            iconColor={UI.colors.error}
            title="Sign out"
            subtitle="Sign out of this worker account on this device."
            onPress={handleSignOut}
            disabled={signingOut}
            destructive
          />
        </View>

        <View
          style={styles.section}
        >
          <View
            style={styles.sectionHeader}
          >
            <View>
              <Text
                style={styles.sectionEyebrow}
              >
                WORK
              </Text>

              <Text
                style={styles.sectionTitle}
              >
                Worker operations
              </Text>
            </View>

            <View
              style={styles.sectionIcon}
            >
              <Ionicons
                name="briefcase-outline"
                size={18}
                color={UI.colors.secondary}
              />
            </View>
          </View>

          {onSchedule ? (
            <SettingsRow
              icon="calendar-outline"
              iconBackground={
                UI.colors.infoBackground
              }
              iconColor={
                UI.colors.secondary
              }
              title="Availability & schedule"
              subtitle="Set weekly working hours and date-specific exceptions."
              onPress={onSchedule}
              disabled={signingOut}
            />
          ) : null}

          {onSchedule &&
          (onNotifications ||
            onSupport) ? (
            <View
              style={styles.rowDivider}
            />
          ) : null}

          {onNotifications ? (
            <>
              <SettingsRow
                icon="notifications-outline"
                iconBackground={
                  UI.colors.warningBackground
                }
                iconColor={
                  UI.colors.warning
                }
                title="Notifications"
                subtitle="Review booking offers and worker account activity."
                onPress={onNotifications}
                disabled={signingOut}
              />

              {onSupport ? (
                <View
                  style={
                    styles.rowDivider
                  }
                />
              ) : null}
            </>
          ) : null}

          {onSupport ? (
            <SettingsRow
              icon="help-circle-outline"
              iconBackground={
                UI.colors.successBackground
              }
              iconColor={
                UI.colors.success
              }
              title="Support"
              subtitle="Get help with bookings, account issues or worker operations."
              onPress={onSupport}
              disabled={signingOut}
            />
          ) : null}
        </View>

        <View
          style={styles.section}
        >
          <View
            style={styles.sectionHeader}
          >
            <View>
              <Text
                style={styles.sectionEyebrow}
              >
                APP
              </Text>

              <Text
                style={styles.sectionTitle}
              >
                Notification preferences
              </Text>
            </View>

            <View
              style={styles.sectionIcon}
            >
              <Ionicons
                name="options-outline"
                size={18}
                color={UI.colors.secondary}
              />
            </View>
          </View>

          <Text
            style={styles.sectionDescription}
          >
            Notification delivery is handled by the worker
            notification service. Detailed preference controls
            are not configured in this build.
          </Text>

          <SettingsRow
            icon="options-outline"
            iconBackground={
              UI.colors.background
            }
            iconColor={
              UI.colors.textSecondary
            }
            title="Notification preferences"
            subtitle="Preference controls are currently unavailable."
            onPress={() => {
              showUnavailable(
                'Notification preferences',
              )
            }}
            disabled={signingOut}
          />
        </View>

        <View
          style={styles.appCard}
        >
          <View
            style={styles.appCardTop}
          >
            <View
              style={styles.appIcon}
            >
              <Ionicons
                name="briefcase-outline"
                size={21}
                color={UI.colors.surface}
              />
            </View>

            <View
              style={styles.appCopy}
            >
              <Text
                style={styles.appName}
              >
                TempStaff Worker
              </Text>

              <Text
                style={styles.appCaption}
              >
                Workforce app
              </Text>
            </View>

            <View
              style={styles.versionBadge}
            >
              <Text
                style={styles.versionText}
              >
                v{APP_VERSION}
              </Text>
            </View>
          </View>

          <View
            style={styles.appDivider}
          />

          <View
            style={styles.appMetaRow}
          >
            <View
              style={styles.appMetaItem}
            >
              <Ionicons
                name="shield-checkmark-outline"
                size={17}
                color={UI.colors.success}
              />

              <Text
                style={styles.appMetaText}
              >
                Authenticated worker account
              </Text>
            </View>
          </View>
        </View>

        {signingOut ? (
          <View
            style={styles.progressCard}
          >
            <ActivityIndicator
              size="small"
              color={UI.colors.secondary}
            />

            <Text
              style={styles.progressText}
            >
              Signing out securely...
            </Text>
          </View>
        ) : null}

        <Text
          style={styles.footerText}
        >
          Keep your account and availability information
          up to date so TempStaff can match you with work.
        </Text>
      </ScrollView>
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal:
      UI.spacing.lg,
    paddingTop:
      UI.spacing.md,
    paddingBottom:
      UI.spacing.xxxl,
  },

  topBar: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent:
      'space-between',
  },

  headerCenter: {
    alignItems: 'center',
  },

  headerEyebrow: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
    color: UI.colors.secondary,
  },

  headerTitle: {
    marginTop: 2,
    fontSize:
      UI.typography.bodyLarge,
    fontWeight: '900',
    color: UI.colors.text,
  },

  headerButton: {
    width: 44,
    height: 44,
    borderRadius:
      UI.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor:
      UI.colors.surface,
    borderWidth: 1,
    borderColor:
      UI.colors.border,
  },

  headerButtonPlaceholder: {
    width: 44,
    height: 44,
  },

  headerButtonPressed: {
    opacity: 0.72,
  },

  headerButtonDisabled: {
    opacity: 0.5,
  },

  heroCard: {
    marginTop:
      UI.spacing.lg,
    padding:
      UI.spacing.xl,
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius:
      UI.radius.xl,
    backgroundColor:
      UI.colors.primary,
  },

  heroIcon: {
    width: 50,
    height: 50,
    borderRadius:
      UI.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor:
      UI.colors.secondary,
  },

  heroCopy: {
    flex: 1,
    marginLeft:
      UI.spacing.md,
  },

  heroEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.05,
    color: UI.colors.surface,
    opacity: 0.7,
  },

  heroTitle: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.subtitle,
    lineHeight: 23,
    fontWeight: '900',
    color: UI.colors.surface,
  },

  heroText: {
    marginTop:
      UI.spacing.sm,
    fontSize:
      UI.typography.small,
    lineHeight: 18,
    color: UI.colors.surface,
    opacity: 0.74,
  },

  section: {
    marginTop:
      UI.spacing.lg,
    padding:
      UI.spacing.lg,
    borderRadius:
      UI.radius.xl,
    backgroundColor:
      UI.colors.surface,
    borderWidth: 1,
    borderColor:
      UI.colors.border,
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent:
      'space-between',
    marginBottom:
      UI.spacing.sm,
  },

  sectionEyebrow: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
    color:
      UI.colors.secondary,
  },

  sectionTitle: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.bodyLarge,
    lineHeight: 21,
    fontWeight: '800',
    color:
      UI.colors.text,
  },

  sectionIcon: {
    width: 36,
    height: 36,
    borderRadius:
      UI.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor:
      UI.colors.infoBackground,
  },

  sectionDescription: {
    marginBottom:
      UI.spacing.sm,
    fontSize:
      UI.typography.small,
    lineHeight: 18,
    color:
      UI.colors.textSecondary,
  },

  settingsRow: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical:
      UI.spacing.sm,
  },

  settingsRowPressed: {
    opacity: 0.7,
  },

  settingsRowDisabled: {
    opacity: 0.5,
  },

  rowIcon: {
    width: 44,
    height: 44,
    borderRadius:
      UI.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },

  rowCopy: {
    flex: 1,
    marginLeft:
      UI.spacing.md,
    paddingRight:
      UI.spacing.md,
  },

  rowTitle: {
    fontSize:
      UI.typography.bodyLarge,
    lineHeight: 21,
    fontWeight: '800',
  },

  rowSubtitle: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.small,
    lineHeight: 17,
    color:
      UI.colors.textSecondary,
  },

  rowDivider: {
    height: 1,
    backgroundColor:
      UI.colors.border,
    marginLeft: 60,
  },

  appCard: {
    marginTop:
      UI.spacing.lg,
    padding:
      UI.spacing.lg,
    borderRadius:
      UI.radius.xl,
    backgroundColor:
      UI.colors.background,
    borderWidth: 1,
    borderColor:
      UI.colors.border,
  },

  appCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  appIcon: {
    width: 46,
    height: 46,
    borderRadius:
      UI.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor:
      UI.colors.primary,
  },

  appCopy: {
    flex: 1,
    marginLeft:
      UI.spacing.md,
  },

  appName: {
    fontSize:
      UI.typography.bodyLarge,
    fontWeight: '800',
    color:
      UI.colors.text,
  },

  appCaption: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.small,
    color:
      UI.colors.textSecondary,
  },

  versionBadge: {
    paddingHorizontal:
      UI.spacing.sm,
    paddingVertical:
      UI.spacing.xs,
    borderRadius:
      UI.radius.pill,
    backgroundColor:
      UI.colors.surface,
    borderWidth: 1,
    borderColor:
      UI.colors.border,
  },

  versionText: {
    fontSize:
      UI.typography.caption,
    fontWeight: '800',
    color:
      UI.colors.textSecondary,
  },

  appDivider: {
    height: 1,
    marginVertical:
      UI.spacing.md,
    backgroundColor:
      UI.colors.border,
  },

  appMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  appMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  appMetaText: {
    marginLeft:
      UI.spacing.sm,
    fontSize:
      UI.typography.small,
    color:
      UI.colors.textSecondary,
  },

  progressCard: {
    marginTop:
      UI.spacing.lg,
    minHeight: 48,
    paddingHorizontal:
      UI.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius:
      UI.radius.md,
    backgroundColor:
      UI.colors.infoBackground,
    borderWidth: 1,
    borderColor:
      UI.colors.border,
  },

  progressText: {
    marginLeft:
      UI.spacing.sm,
    fontSize:
      UI.typography.small,
    fontWeight: '700',
    color:
      UI.colors.info,
  },

  footerText: {
    marginTop:
      UI.spacing.lg,
    paddingHorizontal:
      UI.spacing.sm,
    fontSize:
      UI.typography.caption,
    lineHeight: 17,
    textAlign: 'center',
    color:
      UI.colors.textMuted,
  },
})
