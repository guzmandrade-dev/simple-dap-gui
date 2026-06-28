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
        'border-subtle': 'var(--color-border-subtle)',
        hover: 'var(--color-bg-hover)',
        accent: 'var(--color-accent)',
        'accent-muted': 'var(--color-accent-muted)',
        'accent-text': 'var(--color-accent-text)',
        success: 'var(--color-success)',
        'success-text': 'var(--color-success-text)',
        danger: 'var(--color-danger)',
        'danger-text': 'var(--color-danger-text)',
        warning: 'var(--color-warning)',
        'warning-text': 'var(--color-warning-text)',
        'current-line': 'var(--color-current-line)',
      },
      fontFamily: {
        sans: ["-apple-system", "BlinkMacSystemFont", "'Segoe UI'", "Roboto", "Oxygen", "Ubuntu", "Cantarell", "'Open Sans'", "'Helvetica Neue'", "sans-serif"],
        mono: ["'SF Mono'", "Consolas", "Monaco", "'Courier New'", "monospace"],
      },
    },
  },
  plugins: [],
}