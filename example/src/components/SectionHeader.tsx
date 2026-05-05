import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '../styles/theme';

export interface SectionHeaderProps {
  readonly title: string;
  readonly subtitle?: string;
}

/**
 * Reusable two-line header used at the top of every demo section. Keeps the
 * example app's visual rhythm consistent without duplicating styles.
 */
export const SectionHeader = ({ title, subtitle }: SectionHeaderProps) => (
  <View style={styles.container}>
    <Text style={styles.title}>{title}</Text>
    {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
  </View>
);

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
  },
});
