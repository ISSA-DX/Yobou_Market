/** @type {import('tailwindcss').Config} */
// Tokens lifted from premium_commerce_collective/DESIGN.md
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Surface tier
        surface: '#f8f9ff',
        'surface-dim': '#cbdbf5',
        'surface-bright': '#f8f9ff',
        'surface-lowest': '#ffffff',
        'surface-low': '#eff4ff',
        'surface-container': '#e5eeff',
        'surface-high': '#dce9ff',
        'surface-highest': '#d3e4fe',
        'on-surface': '#0b1c30',
        'on-surface-variant': '#434656',
        outline: '#747688',
        'outline-variant': '#c4c5d9',
        // Brand
        primary: '#0034b9',
        'primary-container': '#0047f1',
        'on-primary': '#ffffff',
        'inverse-primary': '#b8c3ff',
        // Accent
        secondary: '#fdc003',
        'on-secondary': '#261a00',
        tertiary: '#005121',
        'tertiary-container': '#006c2e',
        'on-tertiary': '#ffffff',
        // Status
        success: '#10b981',
        error: '#ba1a1a',
        'error-container': '#ffdad6',
        // Dark
        'dark-bg': '#0b1c30',
        'dark-surface': '#15243f',
        'dark-surface-high': '#1f3052',
        'dark-on': '#eaf1ff',
        'dark-on-variant': '#a3b1c9',
      },
      fontFamily: {
        sans: ['"Be Vietnam Pro"', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        display: ['32px', { lineHeight: '40px', fontWeight: '700', letterSpacing: '-0.02em' }],
        'headline-lg': ['24px', { lineHeight: '32px', fontWeight: '700', letterSpacing: '-0.01em' }],
        'headline-md': ['18px', { lineHeight: '24px', fontWeight: '600' }],
        'body-lg': ['16px', { lineHeight: '24px' }],
        'body-md': ['14px', { lineHeight: '20px' }],
        'label-md': ['12px', { lineHeight: '16px', fontWeight: '500', letterSpacing: '0.02em' }],
        'label-sm': ['10px', { lineHeight: '14px', fontWeight: '600' }],
      },
      borderRadius: {
        sm: '0.25rem',
        DEFAULT: '0.5rem',
        md: '0.75rem',
        lg: '1rem',
        xl: '1.5rem',
        full: '9999px',
      },
      spacing: {
        container: '20px',
        gutter: '16px',
      },
      boxShadow: {
        card: '0 4px 20px rgba(0, 71, 241, 0.05)',
        float: '0 8px 24px rgba(0, 71, 241, 0.12)',
      },
    },
  },
  plugins: [],
};