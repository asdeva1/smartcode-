/**
 * Design tokens - single source of truth for color/spacing/typography.
 * No component in this package (or in apps/web) hardcodes a hex value
 * or spacing number outside of this file. See brief Section 14 and
 * docs/05-FRONTEND-ARCHITECTURE.md.
 *
 * Palette is intentionally restrained - a professional enterprise
 * healthcare tool, not a marketing dashboard: muted neutrals, one
 * brand accent (from the SmartClues logo cyan), and desaturated
 * status colors rather than saturated "AI dashboard" gradients.
 */
export const colors = {
  brand: {
    50: '#e6fbfd',
    100: '#b3f2f8',
    400: '#12c4de',
    500: '#0ea5c4', // primary - close to the logo's cyan (#0dd0f0 family)
    600: '#0b84a0',
    700: '#096a80',
  },
  neutral: {
    0: '#ffffff',
    50: '#f7f8f9',
    100: '#eef0f2',
    200: '#dfe3e7',
    300: '#c3c9d0',
    500: '#6b7280',
    700: '#374151',
    800: '#1f2937',
    900: '#111827',
  },
  status: {
    pending: { bg: '#f3f4f6', fg: '#4b5563', border: '#d1d5db' },
    inProgress: { bg: '#eef2ff', fg: '#4338ca', border: '#c7d2fe' },
    completed: { bg: '#ecfdf5', fg: '#047857', border: '#a7f3d0' },
    rework: { bg: '#fffbeb', fg: '#b45309', border: '#fde68a' },
    cancelled: { bg: '#f3f4f6', fg: '#6b7280', border: '#d1d5db' },
    reviewRequired: { bg: '#fff7ed', fg: '#c2410c', border: '#fed7aa' },
    rejected: { bg: '#fef2f2', fg: '#b91c1c', border: '#fecaca' },
  },
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const typography = {
  fontFamily: '"Inter", "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif',
  sizes: {
    xs: '0.75rem',
    sm: '0.8125rem',
    base: '0.875rem', // enterprise density - default body text is 14px, not 16px
    lg: '1rem',
    xl: '1.25rem',
    xxl: '1.5rem',
  },
} as const;

export const radii = {
  sm: 4,
  md: 6,
  lg: 8,
} as const;
