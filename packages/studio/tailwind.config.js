/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
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
          surface: '#2d2d3d',
          border: '#3d3d4d',
          text: '#e4e4e7',
          muted: '#71717a',
          accent: '#3b82f6',
          success: '#22c55e',
          warning: '#eab308',
          error: '#ef4444',
        },
      },
    },
  },
  plugins: [],
};
