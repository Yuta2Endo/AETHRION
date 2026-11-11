/**
 * AETHRION design tokens (JavaScript mirror of CSS custom properties).
 * Centralized brand identity — single source of truth for colors, typography,
 * spacing, radius, and motion. Import from here when JS-side token values are
 * needed (e.g. Three.js materials, charts). Never hardcode brand colors.
 */

export const brand = {
  name: 'AETHRION',
  slogan: 'BUILD YOUR EMPIRE. SHAPE THE FUTURE.',
} as const;

export const colors = {
  deepSpace: '#080B18',
  empireBlue: '#111A31',
  neonCyan: '#00D9FF',
  imperialPurple: '#A855F7',
  royalViolet: '#7C3AED',
  stellarWhite: '#DCE8FF',
  // Semantic
  background: '#080B18',
  card: '#111A31',
  cardHover: '#16223D',
  input: '#0E1426',
  border: 'rgba(0, 217, 255, 0.18)',
  borderHover: 'rgba(0, 217, 255, 0.45)',
  textPrimary: '#DCE8FF',
  textSecondary: '#9FB3D8',
  textMuted: '#5B6A8C',
  textAccent: '#00D9FF',
  textOnAccent: '#080B18',
  success: '#22C55E',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#00D9FF',
} as const;

export const typography = {
  heading: "'Orbitron', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  interface: "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  mono: "'Roboto Mono', 'Consolas', 'Monaco', monospace",
} as const;

export const fontSize = {
  xs: '0.75rem',
  sm: '0.875rem',
  base: '1rem',
  lg: '1.125rem',
  xl: '1.25rem',
  '2xl': '1.5rem',
  '3xl': '1.875rem',
  '4xl': '2.25rem',
  '5xl': '3rem',
} as const;

export const space = {
  1: '0.25rem',
  2: '0.5rem',
  3: '0.75rem',
  4: '1rem',
  5: '1.25rem',
  6: '1.5rem',
  8: '2rem',
  10: '2.5rem',
  12: '3rem',
} as const;

export const radius = {
  sm: '0.375rem',
  md: '0.5rem',
  lg: '0.75rem',
  full: '9999px',
} as const;

export const shadows = {
  card: '0 4px 20px rgba(0, 0, 0, 0.45)',
  glowCyan: '0 0 16px rgba(0, 217, 255, 0.35)',
  glowPurple: '0 0 16px rgba(168, 85, 247, 0.35)',
} as const;

export const zIndex = {
  dropdown: 100,
  modal: 200,
  toast: 300,
  tooltip: 400,
} as const;

export const themeTokens = {
  brand,
  colors,
  typography,
  fontSize,
  space,
  radius,
  shadows,
  zIndex,
} as const;

export type ThemeTokens = typeof themeTokens;
