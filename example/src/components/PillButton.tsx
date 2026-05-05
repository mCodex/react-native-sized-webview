import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, radius, spacing } from '../styles/theme';

export interface PillButtonProps {
  readonly label: string;
  readonly active?: boolean;
  readonly onPress: () => void;
}

/**
 * Pill-shaped toggle button used by section pickers (e.g. the remote-site
 * selector). Visual styling is pulled from the shared theme so every demo
 * stays in sync.
 */
export const PillButton = ({
  label,
  active = false,
  onPress,
}: PillButtonProps) => (
  <Pressable
    onPress={onPress}
    style={[styles.button, active && styles.buttonActive]}
  >
    <Text style={[styles.text, active && styles.textActive]}>{label}</Text>
  </Pressable>
);

const styles = StyleSheet.create({
  button: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  buttonActive: {
    borderColor: colors.borderActive,
    backgroundColor: colors.bgActive,
  },
  text: {
    fontSize: 14,
    color: colors.textBody,
  },
  textActive: {
    color: colors.textActive,
    fontWeight: '600',
  },
});
