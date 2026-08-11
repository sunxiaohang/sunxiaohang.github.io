import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // NetEase red as primary
        primary: {
          50: '#FFF0F1',
          100: '#FFD6D8',
          200: '#FFB3B7',
          300: '#FF8087',
          400: '#FF4D57',
          500: '#E82030',  // NetEase red
          600: '#C8102E',  // deeper NetEase red
          700: '#A0001E',
          800: '#780014',
          900: '#50000D',
        },
        // Material surface colors
        surface: {
          DEFAULT: '#FAFAFA',
          50: '#FFFFFF',
          100: '#F5F5F5',
          200: '#EEEEEE',
          300: '#E0E0E0',
        },
        // Richer text colors
        ink: {
          DEFAULT: '#212121',
          secondary: '#424242',
          muted: '#757575',
          hint: '#9E9E9E',
        },
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
        'body': ['0.875rem', { lineHeight: '1.5rem' }],
        'body-sm': ['0.8125rem', { lineHeight: '1.25rem' }],
      },
      boxShadow: {
        'md-elevation': '0 1px 3px 0 rgba(0,0,0,0.08), 0 1px 2px -1px rgba(0,0,0,0.08)',
        'card': '0 1px 2px 0 rgba(0,0,0,0.05), 0 1px 3px 0 rgba(0,0,0,0.04)',
        'card-hover': '0 4px 6px -1px rgba(0,0,0,0.07), 0 2px 4px -2px rgba(0,0,0,0.05)',
        'elevated': '0 4px 6px -2px rgba(0,0,0,0.08), 0 10px 15px -3px rgba(0,0,0,0.04)',
      },
      borderRadius: {
        'md': '0.5rem',
        'xl': '0.75rem',
        '2xl': '1rem',
        '3xl': '1.25rem',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-in': 'slideIn 0.3s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideIn: { '0%': { opacity: '0', transform: 'translateX(-12px)' }, '100%': { opacity: '1', transform: 'translateX(0)' } },
        scaleIn: { '0%': { opacity: '0', transform: 'scale(0.95)' }, '100%': { opacity: '1', transform: 'scale(1)' } },
      },
    },
  },
  plugins: [],
} satisfies Config;
