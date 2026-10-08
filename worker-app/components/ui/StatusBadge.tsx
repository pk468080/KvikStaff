import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { UI } from '../../constants/ui';

type StatusBadgeVariant =
  | 'default'
  | 'success'
  | 'warning'
  | 'error'
  | 'info';

type StatusBadgeProps = {
  label: string;
  variant?: StatusBadgeVariant;
};

const VARIANT_STYLES: Record<
  StatusBadgeVariant,
  {
    backgroundColor: string;
    borderColor: string;
    textColor: string;
  }
> = {
  default: {
    backgroundColor: UI.colors.background,
    borderColor: UI.colors.border,
    textColor: UI.colors.textSecondary,
  },
  success: {
    backgroundColor: UI.colors.successBackground,
    borderColor: UI.colors.success,
    textColor: UI.colors.success,
  },
  warning: {
    backgroundColor: UI.colors.warningBackground,
    borderColor: UI.colors.warning,
    textColor: UI.colors.warning,
  },
  error: {
    backgroundColor: UI.colors.errorBackground,
    borderColor: UI.colors.errorBackground,
    textColor: UI.colors.error,
  },
  info: {
    backgroundColor: UI.colors.infoBackground,
    borderColor: UI.colors.info,
    textColor: UI.colors.info,
  },
};

export default function StatusBadge({
  label,
  variant = 'default',
}: StatusBadgeProps) {
  const colors = VARIANT_STYLES[variant] || VARIANT_STYLES.default;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.backgroundColor,
          borderColor: colors.borderColor,
        },
      ]}
    >
      <Text
        style={[
          styles.label,
          {
            color: colors.textColor,
          },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'flex-start',
    minHeight: 28,
    paddingHorizontal: UI.spacing.md,
    paddingVertical: UI.spacing.xs,
    borderRadius: UI.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  label: {
    fontSize: UI.typography.small,
    fontWeight: '600',
  },
});
