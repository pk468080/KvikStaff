import React from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { UI } from '../../constants/ui';

export function AppCard({ children, style, ...props }: ViewProps) {
  return (
    <View style={[styles.card, style]} {...props}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: UI.colors.surface,
    borderRadius: UI.radius.lg,
    padding: UI.spacing.lg,
    ...UI.shadows.sm,
    borderColor: UI.colors.border,
    borderWidth: 1,
  },
});
