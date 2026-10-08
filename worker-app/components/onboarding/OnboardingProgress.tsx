import {
  StyleSheet,
  Text,
  View,
} from 'react-native'

import { UI } from '../../constants/ui'

type OnboardingProgressProps = {
  currentStep: number
  totalSteps?: number
  labels?: string[]
}

export default function OnboardingProgress({
  currentStep,
  totalSteps = 8,
  labels = [],
}: OnboardingProgressProps) {
  const safeCurrentStep = Math.min(
    Math.max(
      Math.floor(currentStep),
      1,
    ),
    totalSteps,
  )

  const progress =
    safeCurrentStep / totalSteps

  const visibleLabels =
    labels.slice(0, totalSteps)

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.stepText}>
          Step {safeCurrentStep} of {totalSteps}
        </Text>

        <Text style={styles.percentText}>
          {Math.round(progress * 100)}%
        </Text>
      </View>

      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            {
              width: `${progress * 100}%`,
            },
          ]}
        />
      </View>

      {visibleLabels.length > 0 ? (
        <View style={styles.labels}>
          {visibleLabels.map(
            (label, index) => {
              const step =
                index + 1

              const isCompleted =
                step < safeCurrentStep

              const isCurrent =
                step === safeCurrentStep

              return (
                <View
                  key={`${step}-${label}`}
                  style={styles.labelRow}
                >
                  <View
                    style={[
                      styles.dot,
                      isCompleted &&
                        styles.dotCompleted,
                      isCurrent &&
                        styles.dotCurrent,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dotText,
                        isCompleted &&
                          styles.dotTextCompleted,
                        isCurrent &&
                          styles.dotTextCurrent,
                      ]}
                    >
                      {isCompleted
                        ? '✓'
                        : step}
                    </Text>
                  </View>

                  <Text
                    numberOfLines={1}
                    style={[
                      styles.label,
                      isCurrent &&
                        styles.labelCurrent,
                      isCompleted &&
                        styles.labelCompleted,
                    ]}
                  >
                    {label}
                  </Text>
                </View>
              )
            },
          )}
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    padding: UI.spacing.md,
    borderRadius: UI.radius.md,
    backgroundColor: UI.colors.surface,
    borderWidth: 1,
    borderColor: UI.colors.border,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  stepText: {
    fontSize: UI.typography.small,
    fontWeight: '700',
    color: UI.colors.text,
  },

  percentText: {
    fontSize: UI.typography.small,
    fontWeight: '700',
    color: UI.colors.primaryBlue,
  },

  track: {
    height: 6,
    marginTop: UI.spacing.sm,
    overflow: 'hidden',
    borderRadius: UI.radius.pill,
    backgroundColor: UI.colors.border,
  },

  fill: {
    height: '100%',
    borderRadius: UI.radius.pill,
    backgroundColor: UI.colors.primaryBlue,
  },

  labels: {
    marginTop: UI.spacing.md,
  },

  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 34,
    marginTop: UI.spacing.xs,
  },

  dot: {
    width: 26,
    height: 26,
    borderRadius: UI.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: UI.colors.background,
    borderWidth: 1,
    borderColor: UI.colors.border,
  },

  dotCompleted: {
    backgroundColor:
      UI.colors.successBackground,
    borderColor: UI.colors.success,
  },

  dotCurrent: {
    backgroundColor: UI.colors.infoBackground,
    borderColor: UI.colors.info,
  },

  dotText: {
    fontSize: 11,
    fontWeight: '700',
    color: UI.colors.textMuted,
  },

  dotTextCompleted: {
    color: UI.colors.success,
  },

  dotTextCurrent: {
    color: UI.colors.info,
  },

  label: {
    flex: 1,
    marginLeft: UI.spacing.sm,
    fontSize: UI.typography.small,
    color: UI.colors.textMuted,
  },

  labelCurrent: {
    fontWeight: '700',
    color: UI.colors.text,
  },

  labelCompleted: {
    color: UI.colors.success,
  },
})