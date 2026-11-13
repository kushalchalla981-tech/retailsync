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
          500: '#ff5e3a', // Aiven flame / warm coral
          600: '#ea4721',
          700: '#c53412',
          800: '#9e2d13',
          900: '#7e2916',
        },
        obsidian: {
          950: '#070A12',
          900: '#0B101D',
          850: '#101729',
          800: '#18223B',
          750: '#222F4F',
          700: '#2D3D64',
        }
      },
      fontFamily: {
        display: ['Plus Jakarta Sans', 'Inter', 'sans-serif'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      letterSpacing: {
        tighter: '-0.04em',
        tight: '-0.02em',
      }
    },
  },
  plugins: [],
}
