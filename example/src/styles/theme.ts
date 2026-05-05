/**
 * Shared visual tokens (colors, spacing, radius) used across the example app.
 *
 * Centralising these values keeps the demo screens DRY and ensures every
 * section renders with a consistent visual language.
 */

export const colors = {
  bg: '#f8fafc',
  bgDark: '#0f172a',
  surface: '#ffffff',
  border: '#cbd5f5',
  borderActive: '#2563eb',
  bgActive: '#dbeafe',
  textActive: '#1d4ed8',
  textPrimary: '#0f172a',
  textSecondary: '#475569',
  textMuted: '#64748b',
  textBody: '#1e293b',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

export const radius = {
  card: 12,
  pill: 999,
} as const;
