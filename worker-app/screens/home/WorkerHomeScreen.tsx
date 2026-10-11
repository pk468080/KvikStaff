
import { AppCard } from '../../components/ui/AppCard'
import { WorkerJobCard } from '../../components/home/WorkerJobCard'
import { useCallback } from 'react'
import { Ionicons } from '@expo/vector-icons'
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import { AppButton } from '../../components/ui/AppButton'
import { ScreenContainer } from '../../components/layout/ScreenContainer'
import ErrorState from '../../components/ui/ErrorState'
import StatusBadge from '../../components/ui/StatusBadge'
import { UI } from '../../constants/ui'
import { useWorkerBookings } from '../../hooks/useWorkerBookings'
import { useWorkerEarnings } from '../../hooks/useWorkerEarnings'
import { useWorkerPresence } from '../../hooks/useWorkerPresence'
import { useWorkerProfile } from '../../hooks/useWorkerProfile'

type WorkerHomeScreenProps = {
  onBookings?: () => void
  onSchedule?: () => void
  onNotifications?: () => void
  onProfile?: () => void
}

function formatAmount(
  amount: number | null | undefined,
  currency: string | null | undefined,
): string {
  const numericAmount = Number(amount)

  if (!Number.isFinite(numericAmount)) {
    return '—'
  }

  if (!currency) {
    return numericAmount.toFixed(2)
  }

  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(numericAmount)
  } catch {
    return `${currency} ${numericAmount.toFixed(2)}`
  }
}

function getInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)

  if (parts.length === 0) {
    return 'T'
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 1).toUpperCase()
  }

  return (
    parts[0].slice(0, 1) +
    parts[parts.length - 1].slice(0, 1)
  ).toUpperCase()
}

export default function WorkerHomeScreen({
  onBookings,
  onNotifications,
  onProfile,
}: WorkerHomeScreenProps) {
  const {
    worker,
    loading: profileLoading,
    error: profileError,
    refresh: refreshProfile,
  } = useWorkerProfile()

  const {
    activeBookings,
    upcomingBookings,
    loading: bookingsLoading,
    error: bookingsError,
    refresh: refreshBookings,
  } = useWorkerBookings()

  const {
    summary,
    loading: earningsLoading,
    error: earningsError,
    refresh: refreshEarnings,
  } = useWorkerEarnings()

  const {
    presence,
    loading: presenceLoading,
    updating: presenceUpdating,
    error: presenceError,
    isOnline,
    goOnline,
    goOffline,
    refresh: refreshPresence,
  } = useWorkerPresence()

  const loading =
    profileLoading ||
    bookingsLoading ||
    earningsLoading ||
    presenceLoading

  const error =
    profileError ||
    bookingsError ||
    earningsError ||
    presenceError

  const pageError =
    profileError ||
    bookingsError ||
    earningsError

  const refreshAll = useCallback(async () => {
    await Promise.all([
      refreshProfile(),
      refreshBookings(),
      refreshEarnings(),
      refreshPresence(),
    ])
  }, [
    refreshProfile,
    refreshBookings,
    refreshEarnings,
    refreshPresence,
  ])

  async function handleTogglePresence(): Promise<void> {
    try {
      if (isOnline) {
        await goOffline()
      } else {
        await goOnline()
      }
    } catch {
      // The presence hook stores the error for display.
    }
  }

  if (
    loading &&
    !worker &&
    !presence &&
    activeBookings.length === 0 &&
    upcomingBookings.length === 0
  ) {
    return (
      <ScreenContainer>
        <View style={styles.loadingContainer}>
          <ActivityIndicator
            size="large"
            color={UI.colors.primaryBlue}
          />

          <Text style={styles.loadingTitle}>
            Getting everything ready
          </Text>

          <Text style={styles.loadingText}>
            Loading your work status, jobs and earnings.
          </Text>
        </View>
      </ScreenContainer>
    )
  }

  if (
    error &&
    !worker &&
    !presence &&
    activeBookings.length === 0
  ) {
    return (
      <ScreenContainer>
        <ErrorState
          title="Home unavailable"
          message={error}
          onAction={() => {
            void refreshAll()
          }}
        />
      </ScreenContainer>
    )
  }

  const displayName =
    worker?.fullName?.trim() || 'Worker'

  const initials = getInitials(displayName)

  const workerStatus =
    presence?.status ??
    worker?.workerStatus ??
    'offline'

  const activeBooking =
    activeBookings.length > 0
      ? activeBookings[0]
      : null

  const nextBooking =
    upcomingBookings.find(
      booking => booking.id !== activeBooking?.id,
    ) ?? null

  const presenceStatusText = isOnline
    ? 'Ready to receive new jobs'
    : workerStatus === 'suspended'
      ? 'Your worker account is currently unavailable'
      : 'You are not receiving new jobs'

  const presenceTitle = isOnline
    ? "You're online"
    : workerStatus === 'suspended'
      ? 'Account unavailable'
      : "You're offline"

  const presenceDescription = isOnline
    ? 'Your availability is active and your location can be used for new assignments.'
    : workerStatus === 'suspended'
      ? 'Please contact KvikStaff support for assistance.'
      : 'Go online when you are ready to receive work opportunities.'

  return (
    <ScreenContainer>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={loading && Boolean(worker)}
            onRefresh={() => {
              void refreshAll()
            }}
            tintColor={UI.colors.primaryBlue}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {initials}
              </Text>
            </View>

            <View style={styles.greetingBlock}>
              <Text style={styles.greetingEyebrow}>
                KvikStaff
              </Text>

              <Text
                style={styles.greeting}
                numberOfLines={1}
              >
                Hello, {displayName}
              </Text>
            </View>
          </View>

          <View style={styles.headerActions}>
            {onNotifications ? (
              <Pressable
                onPress={onNotifications}
                accessibilityRole="button"
                accessibilityLabel="Open notifications"
                style={({ pressed }) => [
                  styles.iconButton,
                  pressed && styles.iconButtonPressed,
                ]}
              >
                <Ionicons
                  name="notifications-outline"
                  size={24}
                  color={UI.colors.text}
                />
              </Pressable>
            ) : null}

            {onProfile ? (
              <Pressable
                onPress={onProfile}
                accessibilityRole="button"
                accessibilityLabel="Open profile"
                style={({ pressed }) => [
                  styles.profileButton,
                  pressed && styles.iconButtonPressed,
                ]}
              >
                <Text style={styles.profileButtonText}>
                  →
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* Greeting */}
        <View style={styles.intro}>
          <Text style={styles.introTitle}>
            Ready when you are.
          </Text>

          <Text style={styles.introSubtitle}>
            Keep your availability on and stay close to your next job.
          </Text>
        </View>

        {/* Availability */}
        <View style={styles.availabilityCard}>
          <View style={styles.availabilityTop}>
            <View>
              <View style={styles.statusEyebrowRow}>
                <View
                  style={[
                    styles.statusDot,
                    isOnline && styles.statusDotOnline,
                  ]}
                />

                <Text style={styles.statusEyebrow}>
                  AVAILABILITY
                </Text>
              </View>

              <Text style={styles.availabilityTitle}>
                {presenceTitle}
              </Text>
            </View>

            {isOnline ? (
              <StatusBadge
                label="Active"
                variant="success"
              />
            ) : null}
          </View>

          <Text style={styles.availabilityText}>
            {presenceDescription}
          </Text>

          {/* Show the real Go Online error here. */}
          {presenceError ? (
            <Text
              accessibilityRole="alert"
              style={styles.presenceError}
            >
              {presenceError}
            </Text>
          ) : null}

          <View style={styles.availabilityMeta}>
            <Text style={styles.availabilityMetaText}>
              {presenceStatusText}
            </Text>
          </View>

          <View style={styles.availabilityAction}>
            <AppButton
              title={
                presenceUpdating
                  ? 'Updating...'
                  : isOnline
                    ? 'Go offline'
                    : workerStatus === 'suspended'
                      ? 'Unavailable'
                      : 'Go online'
              }
              variant={isOnline ? 'secondary' : 'primary'}
              onPress={() => {
                void handleTogglePresence()
              }}
              disabled={
                presenceUpdating ||
                workerStatus === 'suspended'
              }
            />
          </View>
        </View>

        {/* Current job */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionEyebrow}>
                {activeBooking ? 'CURRENT JOB' : 'NEXT JOB'}
              </Text>

              <Text style={styles.sectionTitle}>
                {activeBooking
                  ? 'You have work in progress'
                  : nextBooking
                    ? 'Your next assignment'
                    : 'Nothing scheduled yet'}
              </Text>
            </View>

            {onBookings && (activeBooking || nextBooking) ? (
              <Pressable
                onPress={onBookings}
                accessibilityRole="button"
                accessibilityLabel="Open all jobs"
              >
                <Text style={styles.sectionLink}>
                  View all
                </Text>
              </Pressable>
            ) : null}
          </View>

          {activeBooking ? (
            <WorkerJobCard
              booking={activeBooking}
              active
              onPress={onBookings}
            />
          ) : nextBooking ? (
            <WorkerJobCard
              booking={nextBooking}
              onPress={onBookings}
            />
          ) : (
            <AppCard style={styles.emptyJobCard}>
              <View style={styles.emptyJobIcon}>
                <Text style={styles.emptyJobIconText}>
                  +
                </Text>
              </View>

              <Text style={styles.emptyJobTitle}>
                No upcoming jobs
              </Text>

              <Text style={styles.emptyJobText}>
                Stay available and we'll notify you when a new assignment is ready.
              </Text>

              {onBookings ? (
                <View style={styles.emptyJobAction}>
                  <AppButton
                    title="View jobs"
                    variant="secondary"
                    onPress={onBookings}
                  />
                </View>
              ) : null}
            </AppCard>
          )}
        </View>

        {/* Earnings */}
        <View style={styles.earningsCard}>
          <View style={styles.earningsHeader}>
            <View>
              <Text style={styles.sectionEyebrow}>
                EARNINGS
              </Text>

              <Text style={styles.earningsTitle}>
                Your earnings
              </Text>
            </View>

            {onBookings ? (
              <Text style={styles.earningsArrow}>
                →
              </Text>
            ) : null}
          </View>

          {earningsLoading && !summary ? (
            <View style={styles.earningsLoading}>
              <ActivityIndicator
                size="small"
                color={UI.colors.primaryBlue}
              />

              <Text style={styles.earningsLoadingText}>
                Updating earnings...
              </Text>
            </View>
          ) : (
            <>
              <Text style={styles.earningsAmount}>
                {formatAmount(
                  summary?.totalNetAmount ?? 0,
                  'INR',
                )}
              </Text>

              <Text style={styles.earningsCaption}>
                Net earnings from your available earning records
              </Text>

              <View style={styles.earningsFooter}>
                <View>
                  <Text style={styles.earningsCount}>
                    {summary?.earningCount ?? 0}
                  </Text>

                  <Text style={styles.earningsCountLabel}>
                    earning records
                  </Text>
                </View>

                <View style={styles.earningsFooterAction}>
                  <Text style={styles.earningsFooterActionText}>
                    View earnings →
                  </Text>
                </View>
              </View>
            </>
          )}
        </View>

        {/* Additional upcoming job */}
        {activeBooking && nextBooking ? (
          <View style={styles.upNextSection}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionEyebrow}>
                  UP NEXT
                </Text>

                <Text style={styles.sectionTitle}>
                  After your current job
                </Text>
              </View>
            </View>

            <WorkerJobCard
              booking={nextBooking}
              onPress={onBookings}
            />
          </View>
        ) : null}

        {/* Other screen errors; presence errors are shown above. */}
        {pageError &&
        (worker || presence || activeBookings.length > 0) ? (
          <View style={styles.inlineError}>
            <Text style={styles.inlineErrorTitle}>
              Some information could not be updated
            </Text>

            <Text style={styles.inlineErrorText}>
              {pageError}
            </Text>
          </View>
        ) : null}

        <View style={styles.bottomSpacing} />
      </ScrollView>
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: UI.spacing.lg,
    paddingTop: UI.spacing.md,
    paddingBottom: UI.spacing.xxxl,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },

  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  avatar: {
    width: 42,
    height: 42,
    borderRadius: UI.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: UI.colors.primary,
  },

  avatarText: {
    color: UI.colors.surface,
    fontSize: 14,
    fontWeight: '800',
  },

  greetingBlock: {
    marginLeft: UI.spacing.md,
    flex: 1,
  },

  greetingEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    color: UI.colors.primaryBlue,
  },

  greeting: {
    marginTop: 2,
    fontSize: 17,
    fontWeight: '800',
    color: UI.colors.text,
  },

  iconButton: {
    width: 42,
    height: 42,
    marginLeft: UI.spacing.sm,
    borderRadius: UI.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: UI.colors.background,
    borderWidth: 1,
    borderColor: UI.colors.border,
  },

  profileButton: {
    width: 42,
    height: 42,
    marginLeft: UI.spacing.sm,
    borderRadius: UI.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: UI.colors.primary,
  },

  profileButtonText: {
    fontSize: 20,
    fontWeight: '700',
    color: UI.colors.surface,
  },

  iconButtonPressed: {
    opacity: 0.7,
  },

  intro: {
    marginTop: UI.spacing.xl,
    marginBottom: UI.spacing.lg,
  },

  introTitle: {
    fontSize: UI.typography.largeTitle,
    lineHeight: 34,
    fontWeight: '800',
    color: UI.colors.text,
  },

  introSubtitle: {
    marginTop: UI.spacing.sm,
    maxWidth: 330,
    fontSize: UI.typography.body,
    lineHeight: 20,
    color: UI.colors.textSecondary,
  },

  availabilityCard: {
    padding: UI.spacing.lg,
    borderRadius: UI.radius.xl,
    backgroundColor: UI.colors.primary,
  },

  availabilityTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },

  statusEyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  statusDot: {
    width: 8,
    height: 8,
    borderRadius: UI.radius.pill,
    backgroundColor: '#94A3B8',
  },

  statusDotOnline: {
    backgroundColor: '#4ADE80',
  },

  statusEyebrow: {
    marginLeft: UI.spacing.xs,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#D7E4EF',
  },

  availabilityTitle: {
    marginTop: UI.spacing.xs,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '800',
    color: UI.colors.surface,
  },

  availabilityText: {
    marginTop: UI.spacing.md,
    fontSize: UI.typography.body,
    lineHeight: 20,
    color: '#D7E4EF',
  },

  presenceError: {
    marginTop: UI.spacing.md,
    color: '#FECACA',
    fontSize: UI.typography.small,
    lineHeight: 18,
  },

  availabilityMeta: {
    marginTop: UI.spacing.md,
    paddingVertical: UI.spacing.sm,
    paddingHorizontal: UI.spacing.md,
    borderRadius: UI.radius.md,
    backgroundColor: '#173B55',
  },

  availabilityMetaText: {
    fontSize: UI.typography.small,
    fontWeight: '600',
    color: UI.colors.surface,
  },

  availabilityAction: {
    marginTop: UI.spacing.lg,
  },

  section: {
    marginTop: UI.spacing.xxl,
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: UI.spacing.md,
  },

  sectionEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.05,
    color: UI.colors.primaryBlue,
  },

  sectionTitle: {
    marginTop: UI.spacing.xs,
    fontSize: UI.typography.subtitle,
    lineHeight: 24,
    fontWeight: '800',
    color: UI.colors.text,
  },

  sectionLink: {
    marginLeft: UI.spacing.md,
    fontSize: UI.typography.small,
    fontWeight: '700',
    color: UI.colors.primaryBlue,
  },

  emptyJobCard: {
    alignItems: 'center',
    padding: UI.spacing.xxl,
    borderRadius: UI.radius.xl,
    backgroundColor: UI.colors.background,
    borderWidth: 1,
    borderColor: UI.colors.border,
  },

  emptyJobIcon: {
    width: 54,
    height: 54,
    borderRadius: UI.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: UI.colors.surface,
    borderWidth: 1,
    borderColor: UI.colors.border,
  },

  emptyJobIconText: {
    fontSize: 28,
    fontWeight: '400',
    color: UI.colors.primaryBlue,
  },

  emptyJobTitle: {
    marginTop: UI.spacing.md,
    fontSize: UI.typography.bodyLarge,
    fontWeight: '800',
    color: UI.colors.text,
  },

  emptyJobText: {
    marginTop: UI.spacing.xs,
    maxWidth: 300,
    fontSize: UI.typography.small,
    lineHeight: 18,
    textAlign: 'center',
    color: UI.colors.textSecondary,
  },

  emptyJobAction: {
    marginTop: UI.spacing.lg,
    width: '100%',
  },

  earningsCard: {
    marginTop: UI.spacing.xxl,
    padding: UI.spacing.lg,
    borderRadius: UI.radius.xl,
    backgroundColor: UI.colors.surface,
    borderWidth: 1,
    borderColor: UI.colors.border,
  },

  earningsHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },

  earningsTitle: {
    marginTop: UI.spacing.xs,
    fontSize: UI.typography.subtitle,
    fontWeight: '800',
    color: UI.colors.text,
  },

  earningsArrow: {
    fontSize: 20,
    fontWeight: '700',
    color: UI.colors.primaryBlue,
  },

  earningsAmount: {
    marginTop: UI.spacing.xl,
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '800',
    color: UI.colors.text,
  },

  earningsCaption: {
    marginTop: UI.spacing.xs,
    fontSize: UI.typography.small,
    lineHeight: 18,
    color: UI.colors.textSecondary,
  },

  earningsFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: UI.spacing.lg,
    paddingTop: UI.spacing.md,
    borderTopWidth: 1,
    borderTopColor: UI.colors.border,
  },

  earningsCount: {
    fontSize: UI.typography.bodyLarge,
    fontWeight: '800',
    color: UI.colors.text,
  },

  earningsCountLabel: {
    marginTop: 2,
    fontSize: UI.typography.caption,
    color: UI.colors.textSecondary,
  },

  earningsFooterAction: {
    paddingVertical: UI.spacing.sm,
  },

  earningsFooterActionText: {
    fontSize: UI.typography.small,
    fontWeight: '800',
    color: UI.colors.primaryBlue,
  },

  earningsLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: UI.spacing.xl,
  },

  earningsLoadingText: {
    marginLeft: UI.spacing.sm,
    fontSize: UI.typography.small,
    color: UI.colors.textSecondary,
  },

  upNextSection: {
    marginTop: UI.spacing.xxl,
  },

  inlineError: {
    marginTop: UI.spacing.xl,
    padding: UI.spacing.md,
    borderRadius: UI.radius.lg,
    backgroundColor: UI.colors.warningBackground,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },

  inlineErrorTitle: {
    fontSize: UI.typography.small,
    fontWeight: '800',
    color: UI.colors.warning,
  },

  inlineErrorText: {
    marginTop: UI.spacing.xs,
    fontSize: UI.typography.small,
    lineHeight: 18,
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
    maxWidth: 300,
    fontSize: UI.typography.body,
    lineHeight: 20,
    color: UI.colors.textSecondary,
    textAlign: 'center',
  },

  bottomSpacing: {
    height: UI.spacing.xxl,
  },
})
