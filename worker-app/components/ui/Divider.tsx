import React from 'react';
import { StyleSheet, View } from 'react-native';
import { UI } from '../../constants/ui';

export function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  divider: {
    height: 1,
    backgroundColor: UI.colors.border,
    marginVertical: UI.spacing.md,
  },
});
