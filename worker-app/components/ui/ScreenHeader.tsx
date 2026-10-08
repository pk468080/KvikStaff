import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { UI } from '../../constants/ui';

type ScreenHeaderProps = {
  title: string;
  subtitle?: string;
  rightElement?: React.ReactNode;
};

export function ScreenHeader({ title, subtitle, rightElement }: ScreenHeaderProps) {
  return (
    <View style={styles.container}>
      <View style={styles.textContainer}>
        <Text style={styles.title}>{title}</Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
      {rightElement && <View style={styles.rightContainer}>{rightElement}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: UI.spacing.lg,
    paddingVertical: UI.spacing.lg,
    backgroundColor: UI.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: UI.colors.border,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: UI.typography.title,
    fontWeight: '700',
    color: UI.colors.text,
  },
  subtitle: {
    fontSize: UI.typography.body,
    color: UI.colors.textSecondary,
    marginTop: UI.spacing.xs,
  },
  rightContainer: {
    marginLeft: UI.spacing.md,
  },
});
