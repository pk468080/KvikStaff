import { UI } from '../../constants/ui';
import {
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
} from 'react-native'

type AppButtonProps = PressableProps & {
  title: string
}

export function AppButton({
  title,
  disabled,
  ...props
}: AppButtonProps) {
  return (
    <Pressable
      {...props}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={styles.text}>{title}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    borderRadius: UI.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: UI.spacing.xl,
backgroundColor: UI.colors.primaryBlue,  },
  text: {
    color: UI.colors.surface,
    fontSize: UI.typography.bodyLarge,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.8,
  },
})