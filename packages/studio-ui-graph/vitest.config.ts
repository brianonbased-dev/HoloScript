import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@holoscript/studio-ui-graph',
    root: '.',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['**/dist/**', '**/node_modules/**'],
    environment: 'node',
  },
});
