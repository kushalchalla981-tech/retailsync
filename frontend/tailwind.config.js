/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: 'var(--paper)',
        sheet: 'var(--sheet)',
        desk: 'var(--desk)',
        'desk-2': 'var(--desk-2)',
        ink: 'var(--ink)',
        'ink-2': 'var(--ink-2)',
        rule: 'var(--rule)',
        pg: 'var(--pg)',
        kafka: 'var(--kafka)',
        os: 'var(--os)',
        ok: 'var(--ok)',
        wait: 'var(--wait)',
        fail: 'var(--fail)',
        'desk-ink': 'var(--desk-ink)',
        'desk-ink-2': 'var(--desk-ink-2)',
      },
      fontFamily: {
        sans: ['"Schibsted Grotesk"', 'system-ui', 'sans-serif'],
        mono: ['"Martian Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
