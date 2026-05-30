/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./electron/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: 'var(--color-bg)',
        panel: 'var(--color-bg-secondary)',
        elevated: 'var(--color-bg-tertiary)',
        text: 'var(--color-text)',
        'text-secondary': 'var(--color-text-secondary)',
        muted: 'var(--color-text-muted)',
        border: 'var(--color-border)',
        accent: 'var(--color-accent)',
        success: 'var(--color-success)',
        danger: 'var(--color-danger)',
        warning: 'var(--color-warning)',
      },
    },
  },
  plugins: [],
}