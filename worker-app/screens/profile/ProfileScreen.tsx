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

import StatusBadge from '../../components/ui/StatusBadge';


import ErrorState from '../../components/ui/ErrorState'

import {
  ScreenContainer,
} from '../../components/layout/ScreenContainer'

import {
  UI,
} from '../../constants/ui'

import {
  useWorkerProfile,
} from '../../hooks/useWorkerProfile'

import {
  signOutWorker,
} from '../../services/auth/workerAuth.service'

type ProfileScreenProps = {
  onEditProfile?: () => void
  onSettings?: () => void
  onSignedOut?: () => void
}

function formatWorkerStatus(
  status: string,
): string {
  switch (status) {
    case 'available':
      return 'Available'
    case 'busy':
      return 'Busy'
    case 'suspended':
      return 'Suspended'
    case 'offline':
    default:
      return 'Offline'
  }
}

function getWorkerStatusVariant(
  status: string,
):
  | 'default'
  | 'success'
  | 'warning'
  | 'error'
  | 'info' {
  switch (status) {
    case 'available':
      return 'success'

    case 'busy':
      return 'warning'

    case 'suspended':
      return 'error'

    case 'offline':
    default:
      return 'default'
  }
}

function formatDate(
  value: string,
): string {
  const date = new Date(
    value,
  )

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return '—'
  }

  return date.toLocaleDateString(
    'en-IN',
    {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    },
  )
}

function getInitials(
  fullName: string,
): string {
  const parts =
    fullName
      .trim()
      .split(/\s+/)
      .filter(Boolean)

  if (parts.length === 0) {
    return 'T'
  }

  if (parts.length === 1) {
    return parts[0]
      .slice(0, 1)
      .toUpperCase()
  }

  return (
    parts[0].slice(0, 1) +
    parts[
      parts.length - 1
    ].slice(0, 1)
  ).toUpperCase()
}

function AccountRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap
  label: string
  value: string
}) {
  return (
    <View style={styles.accountRow}>
      <View style={styles.accountIcon}>
        <Ionicons
          name={icon}
          size={18}
          color={UI.colors.primaryBlue}
        />
      </View>

      <View style={styles.accountCopy}>
        <Text style={styles.accountLabel}>
          {label}
        </Text>

        <Text
          style={styles.accountValue}
          numberOfLines={2}
        >
          {value}
        </Text>
      </View>
    </View>
  )
}

function ActionRow({
  icon,
  title,
  subtitle,
  onPress,
  destructive = false,
  disabled = false,
}: {
  icon: keyof typeof Ionicons.glyphMap
  title: string
  subtitle?: string
  onPress?: () => void
  destructive?: boolean
  disabled?: boolean
}) {
  if (!onPress) {
    return null
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [
        styles.actionRow,
        pressed &&
          !disabled &&
          styles.actionPressed,
      ]}
    >
      <View
        style={[
          styles.actionIcon,
          destructive &&
            styles.actionIconDestructive,
        ]}
      >
        <Ionicons
          name={icon}
          size={20}
          color={
            destructive
              ? UI.colors.error
              : UI.colors.primaryBlue
          }
        />
      </View>

      <View style={styles.actionCopy}>
        <Text
          style={[
            styles.actionTitle,
            destructive &&
              styles.actionTitleDestructive,
          ]}
        >
          {title}
        </Text>

        {subtitle ? (
          <Text style={styles.actionSubtitle}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      <Ionicons
        name="chevron-forward"
        size={19}
        color={
          UI.colors.textMuted
        }
      />
    </Pressable>
  )
}

export default function ProfileScreen({
  onEditProfile,
  onSettings,
  onSignedOut,
}: ProfileScreenProps) {
  const {
    worker,
    loading,
    error,
    refresh,
  } = useWorkerProfile()

  const [
    signingOut,
    setSigningOut,
  ] = useState(false)

  async function handleSignOut() {
    if (signingOut) {
      return
    }

    Alert.alert(
      'Sign out',
      'Are you sure you want to sign out of the worker app?',
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
            Loading your profile
          </Text>

          <Text
            style={
              styles.loadingText
            }
          >
            Fetching your latest worker profile details...
          </Text>
        </View>
      </ScreenContainer>
    )
  }

  if (error && !worker) {
    return (
      <ScreenContainer>
        <ErrorState
          title="Profile unavailable"
          message={error}
          onAction={() => {
            void refresh()
          }}
        />
      </ScreenContainer>
    )
  }

  if (!worker) {
    return (
      <ScreenContainer>
        <ErrorState
          title="Worker profile not found"
          message="We could not find a worker profile for the signed-in account."
          onAction={() => {
            void refresh()
          }}
        />
      </ScreenContainer>
    )
  }

  const displayName =
    worker.fullName?.trim() ||
    'KvikStaff Worker'

  const initials =
    getInitials(
      displayName,
    )

  const statusLabel =
    formatWorkerStatus(
      worker.workerStatus,
    )

  const statusVariant =
    getWorkerStatusVariant(
      worker.workerStatus,
    )

  const locationText =
    worker.currentLocation
      ? 'Location available'
      : 'Location unavailable'

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
          <View style={styles.topBarCopy}>
            <Text style={styles.eyebrow}>
              WORKER ACCOUNT
            </Text>

            <Text
              style={styles.title}
            >
              Profile
            </Text>
          </View>

          {onSettings ? (
            <Pressable
              onPress={
                onSettings
              }
              accessibilityRole="button"
              accessibilityLabel="Open settings"
              hitSlop={8}
              style={({ pressed }) => [
                styles.settingsButton,
                pressed &&
                  styles.settingsPressed,
              ]}
            >
              <Ionicons
                name="settings-outline"
                size={22}
                color={
                  UI.colors.primary
                }
              />
            </Pressable>
          ) : null}
        </View>

        {error ? (
          <View
            style={
              styles.warningBox
            }
          >
            <View
              style={
                styles.warningIcon
              }
            >
              <Ionicons
                name="alert-circle-outline"
                size={17}
                color={
                  UI.colors.warning
                }
              />
            </View>

            <View
              style={
                styles.warningCopy
              }
            >
              <Text
                style={
                  styles.warningTitle
                }
              >
                Profile update notice
              </Text>

              <Text
                style={
                  styles.warningText
                }
              >
                {error}
              </Text>
            </View>
          </View>
        ) : null}

        <View
          style={
            styles.identityCard
          }
        >
          <View style={styles.identityTop}>
            <View style={styles.avatar}>
              <Text
                style={styles.avatarText}
              >
                {initials}
              </Text>
            </View>

            <View
              style={
                styles.identityCopy
              }
            >
              <Text style={styles.name}>
                {displayName}
              </Text>

              <Text
                style={styles.email}
                numberOfLines={1}
              >
                {worker.email ||
                  'Email not available'}
              </Text>
            </View>

            {worker.isVerified ? (
              <View
                style={
                  styles.verifiedIcon
                }
              >
                <Ionicons
                  name="checkmark-circle"
                  size={24}
                  color={
                    UI.colors.success
                  }
                />
              </View>
            ) : null}
          </View>

          <View
            style={
              styles.identityFooter
            }
          >
            <StatusBadge
              label={statusLabel}
              variant={
                statusVariant
              }
            />

            <View
              style={
                styles.identityDivider
              }
            />

            <View
              style={
                styles.verificationTextRow
              }
            >
              <Ionicons
                name={
                  worker.isVerified
                    ? 'shield-checkmark-outline'
                    : 'time-outline'
                }
                size={15}
                color={
                  worker.isVerified
                    ? UI.colors.success
                    : UI.colors.warning
                }
              />

              <Text
                style={
                  worker.isVerified
                    ? styles.verifiedText
                    : styles.pendingText
                }
              >
                {worker.isVerified
                  ? 'Verified worker'
                  : 'Verification pending'}
              </Text>
            </View>
          </View>
        </View>

        <View
          style={
            styles.statsCard
          }
        >
          <View style={styles.statItem}>
            <View
              style={
                styles.statIcon
              }
            >
              <Ionicons
                name="star"
                size={17}
                color={
                  UI.colors.accent
                }
              />
            </View>

            <Text
              style={
                styles.statValue
              }
            >
              {worker.rating.toFixed(
                1,
              )}
            </Text>

            <Text
              style={
                styles.statLabel
              }
            >
              Rating
            </Text>
          </View>

          <View
            style={
              styles.statDivider
            }
          />

          <View style={styles.statItem}>
            <View
              style={
                styles.statIcon
              }
            >
              <Ionicons
                name="checkmark-done"
                size={17}
                color={
                  UI.colors.primaryBlue
                }
              />
            </View>

            <Text
              style={
                styles.statValue
              }
            >
              {worker.totalCompletedJobs}
            </Text>

            <Text
              style={
                styles.statLabel
              }
            >
              Completed
            </Text>
          </View>

          <View
            style={
              styles.statDivider
            }
          />

          <View style={styles.statItem}>
            <View
              style={
                styles.statIcon
              }
            >
              <Ionicons
                name="location-outline"
                size={17}
                color={
                  UI.colors.primaryBlue
                }
              />
            </View>

            <Text
              style={
                styles.statValue
              }
            >
              {worker.serviceRadiusKm.toFixed(
                0,
              )}km
            </Text>

            <Text
              style={
                styles.statLabel
              }
            >
              Service area
            </Text>
          </View>
        </View>

        <View
          style={
            styles.section
          }
        >
          <Text
            style={
              styles.sectionEyebrow
            }
          >
            ACCOUNT
          </Text>

          <Text
            style={
              styles.sectionTitle
            }
          >
            Personal information
          </Text>

          <View
            style={
              styles.accountCard
            }
          >
            <AccountRow
              icon="person-outline"
              label="Full name"
              value={
                displayName
              }
            />

            <View
              style={
                styles.rowDivider
              }
            />

            <AccountRow
              icon="mail-outline"
              label="Email"
              value={
                worker.email ||
                'Not available'
              }
            />

            <View
              style={
                styles.rowDivider
              }
            />

            <AccountRow
              icon="call-outline"
              label="Mobile number"
              value={
                worker.phone ||
                'Not available'
              }
            />

            <View
              style={
                styles.rowDivider
              }
            />

            <AccountRow
              icon="calendar-outline"
              label="Account created"
              value={
                formatDate(
                  worker.createdAt,
                )
              }
            />
          </View>
        </View>

        <View
          style={
            styles.section
          }
        >
          <Text
            style={
              styles.sectionEyebrow
            }
          >
            WORK STATUS
          </Text>

          <Text
            style={
              styles.sectionTitle
            }
          >
            Current operating details
          </Text>

          <View
            style={
              styles.detailsCard
            }
          >
            <View
              style={
                styles.detailRow
              }
            >
              <View
                style={
                  styles.detailIcon
                }
              >
                <Ionicons
                  name="radio-outline"
                  size={19}
                  color={
                    UI.colors.primaryBlue
                  }
                />
              </View>

              <View
                style={
                  styles.detailCopy
                }
              >
                <Text
                  style={
                    styles.detailLabel
                  }
                >
                  Worker status
                </Text>

                <Text
                  style={
                    styles.detailValue
                  }
                >
                  {statusLabel}
                </Text>
              </View>

              <StatusBadge
                label={
                  statusLabel
                }
                variant={
                  statusVariant
                }
              />
            </View>

            <View
              style={
                styles.rowDivider
              }
            />

            <View
              style={
                styles.detailRow
              }
            >
              <View
                style={
                  styles.detailIcon
                }
              >
                <Ionicons
                  name="navigate-outline"
                  size={19}
                  color={
                    worker.currentLocation
                      ? UI.colors.success
                      : UI.colors.textMuted
                  }
                />
              </View>

              <View
                style={
                  styles.detailCopy
                }
              >
                <Text
                  style={
                    styles.detailLabel
                  }
                >
                  Current location
                </Text>

                <Text
                  style={
                    styles.detailValue
                  }
                >
                  {locationText}
                </Text>
              </View>

              <View
                style={
                  worker.currentLocation
                    ? styles.locationActive
                    : styles.locationInactive
                }
              >
                <View
                  style={
                    styles.locationDot
                  }
                />

                <Text
                  style={
                    worker.currentLocation
                      ? styles.locationActiveText
                      : styles.locationInactiveText
                  }
                >
                  {worker.currentLocation
                    ? 'Active'
                    : 'Unavailable'}
                </Text>
              </View>
            </View>

            {worker.currentLocation ? (
              <Text
                style={
                  styles.locationRecorded
                }
              >
                Last recorded:{' '}
                {formatDate(
                  worker
                    .currentLocation
                    .recordedAt,
                )}
              </Text>
            ) : null}
          </View>
        </View>

        <View
          style={
            styles.section
          }
        >
          <Text
            style={
              styles.sectionEyebrow
            }
          >
            ACCOUNT ACTIONS
          </Text>

          <View
            style={
              styles.actionsCard
            }
          >
            <ActionRow
              icon="create-outline"
              title="Edit profile"
              subtitle="Update your personal details"
              onPress={
                onEditProfile
              }
              disabled={
                signingOut
              }
            />

            <View
              style={
                styles.rowDivider
              }
            />

            <ActionRow
              icon="settings-outline"
              title="Settings"
              subtitle="Manage app preferences and account options"
              onPress={
                onSettings
              }
              disabled={
                signingOut
              }
            />

            <View
              style={
                styles.rowDivider
              }
            />

            <ActionRow
              icon="log-out-outline"
              title={
                signingOut
                  ? 'Signing out...'
                  : 'Sign out'
              }
              subtitle="End your current worker session"
              onPress={() => {
                void handleSignOut()
              }}
              destructive
              disabled={
                signingOut
              }
            />
          </View>
        </View>

        <Text
          style={
            styles.footerText
          }
        >
          KvikStaff worker account
        </Text>

        <View
          style={
            styles.bottomSpacing
          }
        />
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
    flexDirection:
      'row',
    alignItems:
      'center',
    justifyContent:
      'space-between',
  },

  topBarCopy: {
    flex: 1,
  },

  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
    color:
      UI.colors.primaryBlue,
  },

  title: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.largeTitle,
    lineHeight: 34,
    fontWeight: '900',
    color:
      UI.colors.text,
  },

  settingsButton: {
    width: 44,
    height: 44,
    borderRadius:
      UI.radius.pill,
    alignItems:
      'center',
    justifyContent:
      'center',
    backgroundColor:
      UI.colors.surface,
    borderWidth: 1,
    borderColor:
      UI.colors.border,
  },

  settingsPressed: {
    opacity: 0.7,
  },

  warningBox: {
    flexDirection:
      'row',
    alignItems:
      'flex-start',
    marginTop:
      UI.spacing.lg,
    padding:
      UI.spacing.md,
    borderRadius:
      UI.radius.lg,
    backgroundColor:
      UI.colors.warningBackground,
    borderWidth: 1,
    borderColor:
      UI.colors.warningBackground,
  },

  warningIcon: {
    width: 32,
    height: 32,
    borderRadius:
      UI.radius.pill,
    alignItems:
      'center',
    justifyContent:
      'center',
    backgroundColor:
      UI.colors.surface,
  },

  warningCopy: {
    flex: 1,
    marginLeft:
      UI.spacing.sm,
  },

  warningTitle: {
    fontSize:
      UI.typography.small,
    fontWeight: '800',
    color:
      UI.colors.warning,
  },

  warningText: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.small,
    lineHeight: 18,
    color:
      UI.colors.textSecondary,
  },

  identityCard: {
    marginTop:
      UI.spacing.lg,
    padding:
      UI.spacing.lg,
    borderRadius:
      UI.radius.xl,
    backgroundColor:
      UI.colors.primary,
  },

  identityTop: {
    flexDirection:
      'row',
    alignItems:
      'center',
  },

  avatar: {
    width: 64,
    height: 64,
    borderRadius:
      UI.radius.pill,
    alignItems:
      'center',
    justifyContent:
      'center',
    backgroundColor:
      UI.colors.surface,
  },

  avatarText: {
    fontSize:
      UI.typography.title,
    fontWeight:
      '900',
    color:
      UI.colors.primary,
  },

  identityCopy: {
    flex: 1,
    marginLeft:
      UI.spacing.md,
  },

  name: {
    fontSize:
      UI.typography.subtitle,
    lineHeight: 24,
    fontWeight:
      '900',
    color:
      UI.colors.surface,
  },

  email: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.small,
    color:
      '#D7E4EF',
  },

  verifiedIcon: {
    marginLeft:
      UI.spacing.sm,
  },

  identityFooter: {
    flexDirection:
      'row',
    alignItems:
      'center',
    marginTop:
      UI.spacing.lg,
    paddingTop:
      UI.spacing.md,
    borderTopWidth: 1,
    borderTopColor:
      'rgba(255,255,255,0.12)',
  },

  identityDivider: {
    width: 1,
    height: 22,
    marginHorizontal:
      UI.spacing.md,
    backgroundColor:
      'rgba(255,255,255,0.18)',
  },

  verificationTextRow: {
    flexDirection:
      'row',
    alignItems:
      'center',
    flex: 1,
  },

  verifiedText: {
    marginLeft:
      UI.spacing.xs,
    fontSize:
      UI.typography.caption,
    fontWeight:
      '700',
    color:
      '#A7F3D0',
  },

  pendingText: {
    marginLeft:
      UI.spacing.xs,
    fontSize:
      UI.typography.caption,
    fontWeight:
      '700',
    color:
      UI.colors.warningBackground,
  },

  statsCard: {
    flexDirection:
      'row',
    alignItems:
      'stretch',
    marginTop:
      UI.spacing.md,
    paddingVertical:
      UI.spacing.md,
    borderRadius:
      UI.radius.lg,
    backgroundColor:
      UI.colors.surface,
    borderWidth: 1,
    borderColor:
      UI.colors.border,
  },

  statItem: {
    flex: 1,
    alignItems:
      'center',
  },

  statIcon: {
    width: 30,
    height: 30,
    borderRadius:
      UI.radius.pill,
    alignItems:
      'center',
    justifyContent:
      'center',
    backgroundColor:
      UI.colors.background,
  },

  statValue: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.bodyLarge,
    fontWeight:
      '900',
    color:
      UI.colors.text,
  },

  statLabel: {
    marginTop: 2,
    fontSize:
      UI.typography.caption,
    textAlign:
      'center',
    color:
      UI.colors.textSecondary,
  },

  statDivider: {
    width: 1,
    marginVertical:
      UI.spacing.xs,
    backgroundColor:
      UI.colors.border,
  },

  section: {
    marginTop:
      UI.spacing.xxl,
  },

  sectionEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.05,
    color:
      UI.colors.primaryBlue,
  },

  sectionTitle: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.subtitle,
    lineHeight: 23,
    fontWeight:
      '800',
    color:
      UI.colors.text,
  },

  accountCard: {
    marginTop:
      UI.spacing.md,
    paddingHorizontal:
      UI.spacing.lg,
    borderRadius:
      UI.radius.xl,
    backgroundColor:
      UI.colors.surface,
    borderWidth: 1,
    borderColor:
      UI.colors.border,
  },

  accountRow: {
    flexDirection:
      'row',
    alignItems:
      'center',
    paddingVertical:
      UI.spacing.md,
  },

  accountIcon: {
    width: 38,
    height: 38,
    borderRadius:
      UI.radius.md,
    alignItems:
      'center',
    justifyContent:
      'center',
    backgroundColor:
      UI.colors.infoBackground,
  },

  accountCopy: {
    flex: 1,
    marginLeft:
      UI.spacing.md,
  },

  accountLabel: {
    fontSize:
      UI.typography.caption,
    color:
      UI.colors.textMuted,
  },

  accountValue: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.bodyLarge,
    fontWeight:
      '700',
    color:
      UI.colors.text,
  },

  rowDivider: {
    height: 1,
    backgroundColor:
      UI.colors.border,
  },

  detailsCard: {
    marginTop:
      UI.spacing.md,
    paddingHorizontal:
      UI.spacing.lg,
    paddingVertical:
      UI.spacing.sm,
    borderRadius:
      UI.radius.xl,
    backgroundColor:
      UI.colors.surface,
    borderWidth: 1,
    borderColor:
      UI.colors.border,
  },

  detailRow: {
    flexDirection:
      'row',
    alignItems:
      'center',
    paddingVertical:
      UI.spacing.md,
  },

  detailIcon: {
    width: 38,
    height: 38,
    borderRadius:
      UI.radius.md,
    alignItems:
      'center',
    justifyContent:
      'center',
    backgroundColor:
      UI.colors.background,
  },

  detailCopy: {
    flex: 1,
    marginLeft:
      UI.spacing.md,
    marginRight:
      UI.spacing.sm,
  },

  detailLabel: {
    fontSize:
      UI.typography.caption,
    color:
      UI.colors.textMuted,
  },

  detailValue: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.small,
    fontWeight:
      '800',
    color:
      UI.colors.text,
  },

  locationActive: {
    flexDirection:
      'row',
    alignItems:
      'center',
    paddingHorizontal:
      UI.spacing.sm,
    paddingVertical:
      UI.spacing.xs,
    borderRadius:
      UI.radius.pill,
    backgroundColor:
      UI.colors.successBackground,
  },

  locationInactive: {
    flexDirection:
      'row',
    alignItems:
      'center',
    paddingHorizontal:
      UI.spacing.sm,
    paddingVertical:
      UI.spacing.xs,
    borderRadius:
      UI.radius.pill,
    backgroundColor:
      UI.colors.background,
  },

  locationDot: {
    width: 7,
    height: 7,
    borderRadius:
      UI.radius.pill,
    marginRight:
      UI.spacing.xs,
    backgroundColor:
      UI.colors.success,
  },

  locationActiveText: {
    fontSize:
      UI.typography.caption,
    fontWeight:
      '800',
    color:
      UI.colors.success,
  },

  locationInactiveText: {
    fontSize:
      UI.typography.caption,
    fontWeight:
      '700',
    color:
      UI.colors.textMuted,
  },

  locationRecorded: {
    marginLeft:
      50,
    marginBottom:
      UI.spacing.sm,
    fontSize:
      UI.typography.caption,
    color:
      UI.colors.textMuted,
  },

  actionsCard: {
    marginTop:
      UI.spacing.md,
    borderRadius:
      UI.radius.xl,
    backgroundColor:
      UI.colors.surface,
    borderWidth: 1,
    borderColor:
      UI.colors.border,
    overflow:
      'hidden',
  },

  actionRow: {
    flexDirection:
      'row',
    alignItems:
      'center',
    paddingHorizontal:
      UI.spacing.lg,
    paddingVertical:
      UI.spacing.lg,
  },

  actionPressed: {
    opacity: 0.75,
  },

  actionIcon: {
    width: 42,
    height: 42,
    borderRadius:
      UI.radius.md,
    alignItems:
      'center',
    justifyContent:
      'center',
    backgroundColor:
      UI.colors.infoBackground,
  },

  actionIconDestructive: {
    backgroundColor:
      UI.colors.errorBackground,
  },

  actionCopy: {
    flex: 1,
    marginLeft:
      UI.spacing.md,
    marginRight:
      UI.spacing.md,
  },

  actionTitle: {
    fontSize:
      UI.typography.bodyLarge,
    fontWeight:
      '800',
    color:
      UI.colors.text,
  },

  actionTitleDestructive: {
    color:
      UI.colors.error,
  },

  actionSubtitle: {
    marginTop:
      UI.spacing.xs,
    fontSize:
      UI.typography.caption,
    lineHeight: 16,
    color:
      UI.colors.textSecondary,
  },

  footerText: {
    marginTop:
      UI.spacing.xl,
    fontSize:
      UI.typography.caption,
    color:
      UI.colors.textMuted,
    textAlign:
      'center',
  },

  bottomSpacing: {
    height:
      UI.spacing.xxl,
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
    maxWidth: 300,
    fontSize:
      UI.typography.body,
    lineHeight: 20,
    color:
      UI.colors.textSecondary,
    textAlign:
      'center',
  },
})
