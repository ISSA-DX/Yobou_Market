/** @type {import('tailwindcss').Config} */
// Yobou Design System v2 — design tokens.
// IDENTICAL in APP_shopper_and_buyer, Partner_Web_Vendor and
// Internal_Web_Admin: change all three together so the whole system
// stays one product. Component classes live in src/styles/index.css
// (@layer components — also kept identical across the apps).
export default {
  // Scans the shopper app source too: this build renders those components.
  content: ['./index.html', './src/**/*.{js,jsx}', '../APP_shopper_and_buyer/index.html', '../APP_shopper_and_buyer/src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Neutral, slightly cool canvas — lets product imagery and the
        // brand blue carry the colour instead of a blue-tinted page.
        surface: '#f6f7fb',
        'surface-dim': '#dfe3ec',
        'surface-bright': '#ffffff',
        'surface-lowest': '#ffffff',
        'surface-low': '#f1f4f9',
        'surface-container': '#eaeef6',
        'surface-high': '#e6ebf5',
        'surface-highest': '#d9e1f0',
        // Ink text: near-black with a hint of navy (never pure #000).
        ink: '#0b1220',
        'on-surface': '#0b1220',
        'on-surface-variant': '#5b6478',
        outline: '#8a93a6',
        'outline-variant': '#d5dae5',
        // Brand
        primary: '#0034b9',
        'primary-container': '#0047f1',
        'on-primary': '#ffffff',
        'inverse-primary': '#b8c3ff',
        // Accents
        secondary: '#fdc003',
        'on-secondary': '#261a00',
        tertiary: '#047a3a',
        'tertiary-container': '#0a9150',
        'on-tertiary': '#ffffff',
        // Status
        success: '#10b981',
        warning: '#f59e0b',
        error: '#c81e1e',
        'error-container': '#ffe1de',
        sale: '#e11d48',
        // Midnight Ocean dark tokens (dark rules in styles/index.css use
        // the literal hex values; kept here for utilities).
        'dark-bg': '#0a1024',
        'dark-bg-2': '#0e1432',
        'dark-surface': '#142454',
        'dark-surface-high': '#1c2f5e',
        'dark-surface-highest': '#243d7a',
        'dark-modal': '#243d7a',
        'dark-brand': '#7c9eff',
        'dark-on': '#f4f7ff',
        'dark-on-variant': '#b4c0d8',
        'dark-on-tertiary': '#8b95b3',
        'dark-on-muted': '#c8d4ff',
      },
      fontFamily: {
        sans: ['"Be Vietnam Pro"', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        display: ['32px', { lineHeight: '40px', fontWeight: '800', letterSpacing: '-0.025em' }],
        'headline-lg': ['24px', { lineHeight: '32px', fontWeight: '700', letterSpacing: '-0.02em' }],
        'headline-md': ['18px', { lineHeight: '24px', fontWeight: '700', letterSpacing: '-0.01em' }],
        'body-lg': ['16px', { lineHeight: '24px' }],
        'body-md': ['14px', { lineHeight: '20px' }],
        'label-md': ['12px', { lineHeight: '16px', fontWeight: '500', letterSpacing: '0.01em' }],
        'label-sm': ['11px', { lineHeight: '14px', fontWeight: '600', letterSpacing: '0.02em' }],
      },
      borderRadius: {
        sm: '0.375rem',
        DEFAULT: '0.5rem',
        md: '0.75rem',
        lg: '1rem',
        xl: '1.25rem',
        '2xl': '1.5rem',
        full: '9999px',
      },
      spacing: {
        container: '20px',
        gutter: '16px',
      },
      boxShadow: {
        // Layered, neutral shadows: a crisp contact shadow + a soft ambient one.
        card: '0 1px 2px rgba(16, 24, 40, 0.04), 0 2px 8px -2px rgba(16, 24, 40, 0.06)',
        float: '0 4px 6px -2px rgba(16, 24, 40, 0.05), 0 16px 32px -8px rgba(16, 24, 40, 0.14)',
        pop: '0 2px 4px rgba(0, 52, 185, 0.18), 0 8px 20px -6px rgba(0, 52, 185, 0.45)',
        nav: '0 -1px 0 rgba(16, 24, 40, 0.06), 0 -8px 24px -12px rgba(16, 24, 40, 0.12)',
      },
      keyframes: {
        'fade-up': { '0%': { opacity: '0', transform: 'translateY(6px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
      },
      animation: {
        'fade-up': 'fade-up .35s ease-out both',
      },
    },
  },
  plugins: [],
};
