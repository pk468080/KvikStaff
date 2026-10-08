import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { UI } from '../../constants/ui';

type SectionHeaderProps = {
  title: string;
  rightElement?: React.ReactNode;
};

export function SectionHeader({ title, rightElement }: SectionHeaderProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {rightElement && <View>{rightElement}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: UI.spacing.md,
  },
  title: {
    fontSize: UI.typography.subtitle,
    fontWeight: '700',
    color: UI.colors.text,
  },
});
