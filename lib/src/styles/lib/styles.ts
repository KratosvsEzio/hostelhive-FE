// HostelHive design tokens — TypeScript mirror of tailwind-preset.js / hh-theme.js.
// Use where Tailwind utility classes can't reach: chart series, map pins, inline SVG, canvas.
// Keep in sync with libs/styles/tailwind-preset.js.

export const brand = {
  50: '#FEF1E9',
  100: '#FCDCC8',
  200: '#F9BE9C',
  300: '#F69A6A',
  400: '#F47C3F',
  500: '#F36E21',
  600: '#D2560F',
  700: '#A8430C',
  800: '#7E3209',
  900: '#552105',
} as const;

export const ink = {
  50: '#F4F4F4',
  100: '#E6E6E6',
  200: '#CFCFCF',
  300: '#A3A3A3',
  400: '#7A7A7A',
  500: '#525252',
  600: '#3B3B3B',
  700: '#2B2B2B',
  800: '#1F1F1F',
  900: '#141414',
} as const;

export const tint = {
  mint: '#ECF8F7',
  blue: '#F1F9FE',
  green: '#F4F9F7',
  sky: '#F5F7FF',
  purple: '#F9F5FF',
  cream: '#FDF8EE',
} as const;

export const semantic = {
  ok: '#27AE60',
  warn: '#F39C12',
  danger: '#E74C3C',
} as const;
export const gender = { boys: '#2B6CB0', girls: '#BE3A75' } as const;
export const surface = '#F5F5F5';

export const tokens = { brand, ink, tint, semantic, gender, surface } as const;
