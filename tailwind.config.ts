import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        // Playful accent colors
        coral: { 50: '#FFF5F3', 100: '#FFE8E3', 200: '#FFD1C9', 400: '#FF8A7A', 500: '#FF6B5B', 600: '#E55A4B' },
        mint: { 50: '#F0FDF7', 100: '#DCFCE8', 200: '#BBF7D1', 400: '#4ADE80', 500: '#22C55E', 600: '#16A34A' },
        sky: { 50: '#F0F9FF', 100: '#E0F2FE', 200: '#BAE6FD', 400: '#38BDF8', 500: '#0EA5E9', 600: '#0284C7' },
        lavender: { 50: '#F8F6FF', 100: '#EFECFF', 200: '#DED8FF', 400: '#A78BFA', 500: '#8B5CF6', 600: '#7C3AED' },
        sunny: { 50: '#FFFEF5', 100: '#FFFBEB', 200: '#FEF3C7', 400: '#FBBF24', 500: '#F59E0B', 600: '#D97706' },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        '2xl': '1rem',
        '3xl': '1.25rem',
        '4xl': '1.5rem',
      },
      keyframes: {
        'fade-in': { '0%': { opacity: '0', transform: 'translateY(4px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        'slide-up': { '0%': { opacity: '0', transform: 'translateY(20px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        'bounce-in': { '0%': { opacity: '0', transform: 'scale(0.9)' }, '50%': { transform: 'scale(1.02)' }, '100%': { opacity: '1', transform: 'scale(1)' } },
        float: { '0%, 100%': { transform: 'translateY(0px)' }, '50%': { transform: 'translateY(-6px)' } },
      },
      animation: {
        'fade-in': 'fade-in 0.3s ease-out',
        'slide-up': 'slide-up 0.4s ease-out',
        'bounce-in': 'bounce-in 0.4s ease-out',
        float: 'float 3s ease-in-out infinite',
      },
    },
  },
  plugins: [animate],
} satisfies Config;
