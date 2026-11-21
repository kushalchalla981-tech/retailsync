/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cream: {
          50: '#fcfaf8',
          100: '#f5ebe0',
          200: '#edd8c5',
          300: '#e1c2a4',
          900: '#252422',
        },
        brand: {
          black: '#1a1918',
          orange: '#ff5c35',
          purple: '#7b4eff',
          lime: '#a7f432',
          pink: '#ff4382',
          yellow: '#ffd600',
          cyan: '#00e5ff',
        }
      },
      fontFamily: {
        display: ['Modak', 'Syne', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'pop': '4px 4px 0px 0px rgba(26,25,24,1)',
        'pop-lg': '8px 8px 0px 0px rgba(26,25,24,1)',
      }
    },
  },
  plugins: [],
}
