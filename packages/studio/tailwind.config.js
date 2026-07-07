/** @type {import('tailwindcss').Config} */
module.exports = {
  // Scan UI source only. Test/benchmark/story files contain non-UI string
  // literals (e.g. a regex char-class `/[-:.]/g`) that Tailwind's scanner would
  // otherwise extract as arbitrary-property classes and emit as INVALID CSS
  // (`.\[-\:\.\] { -: .; }`), breaking the whole stylesheet on a fresh build.
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    '!./src/**/__tests__/**',
    '!./src/**/__benchmarks__/**',
    '!./src/**/*.{test,spec,bench,stories}.{js,ts,jsx,tsx}',
    // @holoscript/ui is a studio-only-consumed shared library with NO tailwind config of
    // its own — studio compiles its classes. Scan it so re-pointed studio-* tokens in
    // StatCard/Button/Badge actually generate (else they emit uncompiled = silently broken).
    // Same test/story exclusions as above (non-UI string literals break the scanner).
    '../ui/src/**/*.{js,ts,jsx,tsx}',
    '!../ui/src/**/__tests__/**',
    '!../ui/src/**/*.{test,spec,bench,stories}.{js,ts,jsx,tsx}',
  ],
  safelist: [
    // Dynamic color classes used in StudioHeader overflow menu
    { pattern: /bg-(blue|purple|green|cyan|orange|amber|violet|sky)-500\/20/ },
    { pattern: /text-(blue|purple|green|cyan|orange|amber|violet|sky)-300/ },
  ],
  theme: {
    extend: {
      colors: {
        studio: {
          bg: '#0d0d14',
          panel: '#1e1e2e',
          'panel-hover': '#22223a',
          surface: '#2d2d3d',
          border: '#3d3d4d',
          text: '#e4e4e7',
          'text-secondary': '#a1a1aa',
          muted: '#71717a',
          accent: '#3b82f6',
          'accent-hover': '#2563eb',
          'accent-subtle': 'rgba(59, 130, 246, 0.2)',
          'error-subtle': 'rgba(239, 68, 68, 0.2)',
          success: '#22c55e',
          warning: '#eab308',
          error: '#ef4444',
        },
      },
    },
  },
  plugins: [],
};
