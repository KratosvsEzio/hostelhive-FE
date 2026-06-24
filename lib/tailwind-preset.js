// HostelHive shared Tailwind preset — brand tokens extracted from Figma (file AD1mtT4jCYbJa4jB79qd2n).
// Single source of truth for both apps (web, console) and Storybook.
// Mirrors design-mockups/assets/hh-theme.js verbatim — keep them in sync.
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Poppins', 'Inter', 'sans-serif'],
      },
      colors: {
        // Brand orange — #F36E21
        brand: {
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
        },
        // Ink / near-black — #1F1F1F text, #A3A3A3 gray
        ink: {
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
        },
        surface: '#F5F5F5',
        tint: {
          mint: '#ECF8F7',
          blue: '#F1F9FE',
          green: '#F4F9F7',
          sky: '#F5F7FF',
          purple: '#F9F5FF',
          cream: '#FDF8EE',
        },
        ok: '#27AE60',
        warn: '#F39C12',
        danger: '#E74C3C',
        boys: '#2B6CB0',
        girls: '#BE3A75',
      },
      borderRadius: { xl: '12px', '2xl': '16px', '3xl': '22px' },
      boxShadow: {
        card: '0 2px 8px rgba(31,31,31,0.08)',
        cardhover: '0 12px 30px rgba(31,31,31,0.14)',
        pill: '0 4px 16px rgba(31,31,31,0.16)',
      },
    },
  },
  plugins: [],
};
