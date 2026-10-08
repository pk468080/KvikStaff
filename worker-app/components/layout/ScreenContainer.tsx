import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StyleSheet,
  View,
  type ViewProps,
} from 'react-native';
import { UI } from '../../constants/ui';

type ScreenContainerProps = ViewProps & {
  withPadding?: boolean;
  edges?: readonly ('top' | 'right' | 'bottom' | 'left')[];
};

export function ScreenContainer({
  style,
  withPadding = false,
  children,
  ...props
}: ScreenContainerProps) {
  return (
    <SafeAreaView style={[styles.container, style]} {...props}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoiding}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.content, withPadding && styles.withPadding]}>
          {children}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: UI.colors.background,
  },
  keyboardAvoiding: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  withPadding: {
    paddingHorizontal: UI.spacing.lg,
  },
});
