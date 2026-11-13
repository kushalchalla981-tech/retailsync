/** @type {import('tailwindcss').Config} */
// Every name maps onto a Broadside token (src/tokens.css); no literal colour lives here.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: 'var(--color-paper)',
        sheet: 'var(--color-paper-2)',
        well: 'var(--color-paper-3)',
        ink: 'var(--color-ink)',
        'ink-2': 'var(--color-muted)',
        rule: 'var(--color-rule)',
        accent: 'var(--color-accent)',
        band: 'var(--color-band)',
        'band-ink': 'var(--color-band-ink)',
        'band-muted': 'var(--color-band-muted)',
        'band-rule': 'var(--color-band-rule)',
        scrim: 'var(--color-scrim)',
        /* One accent only: failures take vermilion, everything else prints in ink. */
        fail: 'var(--color-accent)',
        ok: 'var(--color-ink)',
        wait: 'var(--color-ink-2)',
        pg: 'var(--color-ink)',
        kafka: 'var(--color-ink)',
        os: 'var(--color-ink)',
      },
      fontFamily: {
        sans: ['var(--font-body)'],
        display: ['var(--font-display)'],
        slab: ['var(--font-display-2)'],
      },
    },
  },
  plugins: [],
};
