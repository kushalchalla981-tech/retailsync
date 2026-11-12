/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fff5f2',
          100: '#ffe8e1',
          200: '#ffd4c7',
          300: '#ffb5a0',
          400: '#ff8867',
          500: '#ff5e3a', // Aiven flame / primary
          600: '#f0431d',
          700: '#c93110',
          800: '#a52b11',
          900: '#872713',
        },
        slate: {
          850: '#162032',
          950: '#0b1120',
        }
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      boxShadow: {
        'glow-brand': '0 0 25px -5px rgba(255, 94, 58, 0.3)',
        'glow-emerald': '0 0 25px -5px rgba(16, 185, 129, 0.3)',
        'glow-indigo': '0 0 25px -5px rgba(99, 102, 241, 0.3)',
      }
    },
  },
  plugins: [],
}
