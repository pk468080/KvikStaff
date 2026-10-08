import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { UI } from '../../constants/ui';

import { Ionicons } from '@expo/vector-icons';
type InfoRowProps = {
  label: string;
  value: string | React.ReactNode;
  icon?: keyof typeof Ionicons.glyphMap;
};

export function InfoRow({ label, value, icon }: InfoRowProps) {
  return (
    <View style={styles.container}>
      {icon && (
        <View style={styles.iconContainer}>
          <Ionicons name={icon} size={18} color={UI.colors.primaryBlue} />
        </View>
      )}
      <View style={styles.contentContainer}>
        <Text style={styles.label}>{label}</Text>
      {typeof value === 'string' ? (
        <Text style={styles.value}>{value}</Text>
      ) : (
        value
      )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: UI.spacing.sm,
  },
  iconContainer: {
    marginRight: UI.spacing.md,
    marginTop: 2,
    width: 24,
    alignItems: 'center',
  },
  contentContainer: {
    flex: 1,
  },
  label: {
    fontSize: UI.typography.body,
    color: UI.colors.textSecondary,
    marginBottom: 2,
  },
  value: {
    fontSize: UI.typography.bodyLarge,
    color: UI.colors.text,
    fontWeight: '500',
  },
});
