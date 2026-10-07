import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import { AppButton } from '../../components/ui/AppButton'
import { ScreenContainer } from '../../components/layout/ScreenContainer'
import { UI } from '../../constants/ui'

import {
  getAvailableWorkerServices,
  getWorkerServiceIds,
  saveWorkerServices,
  type WorkerAvailableService,
} from '../../services/worker/workerServices.service'

import {
  saveWorkerOnboarding,
} from '../../services/onboarding/workerOnboarding.service'

type ServicesScreenProps = {
  onContinue: () => void
  onBack: () => void
}

function getServiceInitials(
  name: string,
): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  if (words.length === 1) {
    return words[0]
      .slice(0, 2)
      .toUpperCase()
  }

  return words
    .slice(0, 2)
    .map(word => word[0])
    .join('')
    .toUpperCase()
}

export default function ServicesScreen({
  onContinue,
  onBack,
}: ServicesScreenProps) {
  const [services, setServices] =
    useState<WorkerAvailableService[]>([])

  const [selectedIds, setSelectedIds] =
    useState<string[]>([])

  const [loading, setLoading] =
    useState(true)

  const [saving, setSaving] =
    useState(false)

  const [errorMessage, setErrorMessage] =
    useState('')

  useEffect(() => {
    let mounted = true

    async function loadServices() {
      setLoading(true)
      setErrorMessage('')

      try {
        const [
          availableServices,
          currentServiceIds,
        ] = await Promise.all([
          getAvailableWorkerServices(),
          getWorkerServiceIds(),
        ])

        if (!mounted) {
          return
        }

        const availableIds = new Set(
          availableServices.map(
            service => service.id,
          ),
        )

        setServices(
          availableServices,
        )

        setSelectedIds(
          currentServiceIds.filter(
            id => availableIds.has(id),
          ),
        )
      } catch (error) {
        console.error(
          'Unable to load worker services:',
          error,
        )

        if (!mounted) {
          return
        }

        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'Unable to load available services.',
        )
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    void loadServices()

    return () => {
      mounted = false
    }
  }, [])

  function toggleService(
    serviceId: string,
  ) {
    if (saving) {
      return
    }

    setErrorMessage('')

    setSelectedIds(current => {
      if (current.includes(serviceId)) {
        return current.filter(
          id => id !== serviceId,
        )
      }

      return [
        ...current,
        serviceId,
      ]
    })
  }

  async function handleContinue() {
    if (saving) {
      return
    }

    setErrorMessage('')

    if (selectedIds.length === 0) {
      setErrorMessage(
        'Select at least one service before continuing.',
      )
      return
    }

    setSaving(true)

    try {
      await saveWorkerServices(
        selectedIds,
      )

      await saveWorkerOnboarding({
        onboardingStep: 3,
      })

      onContinue()
    } catch (error) {
      console.error(
        'Unable to save worker services:',
        error,
      )

      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Unable to save your selected services.',
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
            color={UI.colors.secondary}
          />

          <Text style={styles.loadingTitle}>
            Loading services
          </Text>

          <Text style={styles.loadingText}>
            Fetching the services currently available
            to workers...
          </Text>
        </View>
      </ScreenContainer>
    )
  }

  return (
    <ScreenContainer>
      <View style={styles.container}>
        <ScrollView
          contentContainerStyle={
            styles.scrollContent
          }
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.intro}>
            <Text style={styles.stepLabel}>
              STEP 2
            </Text>

            <Text style={styles.title}>
              Choose your services
            </Text>

            <Text style={styles.subtitle}>
              Select every type of work you are
              qualified and willing to provide.
            </Text>
          </View>

          <View style={styles.summaryCard}>
            <View
              style={styles.summaryIcon}
            >
              <Text
                style={styles.summaryIconText}
              >
                {selectedIds.length}
              </Text>
            </View>

            <View
              style={styles.summaryCopy}
            >
              <Text style={styles.summaryTitle}>
                Services selected
              </Text>

              <Text style={styles.summaryText}>
                Choose at least one service to
                continue.
              </Text>
            </View>
          </View>

          {services.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>
                No services available
              </Text>

              <Text style={styles.emptyText}>
                There are currently no active worker
                services available for selection.
              </Text>
            </View>
          ) : (
            <View style={styles.serviceList}>
              {services.map(service => {
                const selected =
                  selectedIds.includes(
                    service.id,
                  )

                return (
                  <Pressable
                    key={service.id}
                    onPress={() =>
                      toggleService(
                        service.id,
                      )
                    }
                    disabled={saving}
                    style={[
                      styles.serviceCard,
                      selected &&
                        styles.serviceCardSelected,
                    ]}
                  >
                    <View
                      style={[
                        styles.serviceIcon,
                        selected &&
                          styles.serviceIconSelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.serviceIconText,
                          selected &&
                            styles.serviceIconTextSelected,
                        ]}
                      >
                        {getServiceInitials(
                          service.name,
                        )}
                      </Text>
                    </View>

                    <View
                      style={styles.serviceCopy}
                    >
                      <Text
                        style={[
                          styles.serviceName,
                          selected &&
                            styles.serviceNameSelected,
                        ]}
                      >
                        {service.name}
                      </Text>

                      {service.description ? (
                        <Text
                          style={
                            styles.serviceDescription
                          }
                        >
                          {
                            service.description
                          }
                        </Text>
                      ) : (
                        <Text
                          style={
                            styles.serviceDescription
                          }
                        >
                          KvikStaff worker service
                        </Text>
                      )}
                    </View>

                    <View
                      style={[
                        styles.checkbox,
                        selected &&
                          styles.checkboxSelected,
                      ]}
                    >
                      {selected ? (
                        <Text
                          style={
                            styles.checkboxText
                          }
                        >
                          ✓
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                )
              })}
            </View>
          )}

          {errorMessage ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorTitle}>
                Unable to continue
              </Text>

              <Text style={styles.errorText}>
                {errorMessage}
              </Text>
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.actions}>
          <View style={styles.backButton}>
            <AppButton
              title="Back"
              variant="secondary"
              onPress={onBack}
              disabled={saving}
            />
          </View>

          <View style={styles.continueButton}>
            <AppButton
              title={
                saving
                  ? 'Saving...'
                  : 'Save and continue'
              }
              onPress={() => {
                void handleContinue()
              }}
              disabled={
                saving ||
                services.length === 0
              }
            />
          </View>
        </View>
      </View>
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: UI.spacing.xl,
    paddingTop: UI.spacing.lg,
    paddingBottom: UI.spacing.lg,
  },

  scrollContent: {
    paddingBottom: UI.spacing.lg,
  },

  intro: {
    marginBottom: UI.spacing.lg,
  },

  stepLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
    color: UI.colors.secondary,
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

  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: UI.spacing.lg,
    padding: UI.spacing.md,
    borderRadius: UI.radius.lg,
    backgroundColor: UI.colors.infoBackground,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },

  summaryIcon: {
    width: 42,
    height: 42,
    borderRadius: UI.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: UI.colors.info,
  },

  summaryIconText: {
    fontSize: UI.typography.subtitle,
    fontWeight: '800',
    color: UI.colors.surface,
  },

  summaryCopy: {
    flex: 1,
    marginLeft: UI.spacing.md,
  },

  summaryTitle: {
    fontSize: UI.typography.small,
    fontWeight: '800',
    color: UI.colors.text,
  },

  summaryText: {
    marginTop: 2,
    fontSize: UI.typography.caption,
    lineHeight: 16,
    color: UI.colors.textSecondary,
  },

  serviceList: {
    gap: UI.spacing.md,
  },

  serviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: UI.spacing.md,
    borderRadius: UI.radius.lg,
    backgroundColor: UI.colors.surface,
    borderWidth: 1,
    borderColor: UI.colors.border,
  },

  serviceCardSelected: {
    borderColor: UI.colors.secondary,
    backgroundColor: UI.colors.successBackground,
  },

  serviceIcon: {
    width: 48,
    height: 48,
    borderRadius: UI.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: UI.colors.background,
  },

  serviceIconSelected: {
    backgroundColor: UI.colors.secondary,
  },

  serviceIconText: {
    fontSize: UI.typography.small,
    fontWeight: '800',
    color: UI.colors.textSecondary,
  },

  serviceIconTextSelected: {
    color: UI.colors.surface,
  },

  serviceCopy: {
    flex: 1,
    marginLeft: UI.spacing.md,
    marginRight: UI.spacing.sm,
  },

  serviceName: {
    fontSize: UI.typography.bodyLarge,
    fontWeight: '800',
    color: UI.colors.text,
  },

  serviceNameSelected: {
    color: UI.colors.text,
  },

  serviceDescription: {
    marginTop: 4,
    fontSize: UI.typography.small,
    lineHeight: 17,
    color: UI.colors.textSecondary,
  },

  checkbox: {
    width: 26,
    height: 26,
    borderRadius: UI.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: UI.colors.inputBorder,
    backgroundColor: UI.colors.surface,
  },

  checkboxSelected: {
    borderColor: UI.colors.secondary,
    backgroundColor: UI.colors.secondary,
  },

  checkboxText: {
    fontSize: 16,
    fontWeight: '800',
    color: UI.colors.surface,
  },

  emptyCard: {
    padding: UI.spacing.xl,
    borderRadius: UI.radius.lg,
    backgroundColor: UI.colors.surface,
    borderWidth: 1,
    borderColor: UI.colors.border,
  },

  emptyTitle: {
    fontSize: UI.typography.subtitle,
    fontWeight: '800',
    color: UI.colors.text,
  },

  emptyText: {
    marginTop: UI.spacing.sm,
    fontSize: UI.typography.body,
    lineHeight: 20,
    color: UI.colors.textSecondary,
  },

  errorBox: {
    marginTop: UI.spacing.lg,
    padding: UI.spacing.md,
    borderRadius: UI.radius.md,
    backgroundColor: UI.colors.errorBackground,
    borderWidth: 1,
    borderColor: '#FECACA',
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

  actions: {
    flexDirection: 'row',
    paddingTop: UI.spacing.md,
  },

  backButton: {
    flex: 1,
    marginRight: UI.spacing.sm,
  },

  continueButton: {
    flex: 2,
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
})