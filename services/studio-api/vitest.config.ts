import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@holoscript/studio-api',
    root: '.',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['**/.next/**', '**/dist/**', '**/node_modules/**'],
    environment: 'node',
  },
});
