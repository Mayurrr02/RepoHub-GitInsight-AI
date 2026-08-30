/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        brand: {
          bg: '#05070B',
          'bg-subtle': '#080B12',
          'bg-elevated': '#0B0F17',
          card: '#0D111A',
          'card-hover': '#111724',
          border: 'rgba(255, 255, 255, 0.08)',
          'border-hover': 'rgba(255, 255, 255, 0.15)',
          purple: '#8B5CF6',
          'purple-glow': '#A78BFA',
          blue: '#3B82F6',
          cyan: '#06B6D4',
          emerald: '#10B981',
          amber: '#F59E0B',
          rose: '#F43F5E',
        },
      },
      boxShadow: {
        'glow-purple': '0 0 25px -4px rgba(139, 92, 246, 0.3)',
        'glow-blue': '0 0 25px -4px rgba(59, 130, 246, 0.3)',
        'glow-emerald': '0 0 25px -4px rgba(16, 185, 129, 0.3)',
        'card-dark': '0 4px 20px -2px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.06)',
        'card-light': '0 4px 20px -2px rgba(0, 0, 0, 0.05), 0 0 0 1px rgba(0, 0, 0, 0.06)',
      },
      animation: {
        'shimmer': 'shimmer 2s linear infinite',
        'fade-in': 'fadeIn 0.15s ease-out',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(3px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
