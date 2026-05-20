/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    `${__dirname}/src/**/*.{js,ts,jsx,tsx}`,
  ],
  safelist: [
    { pattern: /^bg-mesh-.+/ },
    { pattern: /^text-mesh-.+/ },
    { pattern: /^border-mesh-.+/ },
    { pattern: /^ring-mesh-.+/ },
  ],
  theme: {
    extend: {
      colors: {
        mesh: {
          bg: '#0d0d1a',
          surface: '#13131f',
          card: '#1a1a2e',
          border: '#2a2a4a',
          purple: '#7c3aed',
          'purple-bright': '#a855f7',
          cyan: '#06b6d4',
          'cyan-bright': '#22d3ee',
          green: '#22c55e',
          yellow: '#eab308',
          red: '#ef4444',
          text: '#e2e8f0',
          muted: '#94a3b8',
          dim: '#475569',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
      animation: {
        blink: 'blink 1.2s step-start infinite',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
      },
      keyframes: {
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
      },
    },
  },
  plugins: [],
}
