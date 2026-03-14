import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@holoscript/test',
    include: ['src/**/*.test.ts', 'examples/**/*.test.ts'],
    exclude: [
      '**/dist/**',
      '**/node_modules/**',
      'src/__tests__/scenes.test.ts',
      'src/__tests__/visual.test.ts',
      'src/__tests__/visual/**',
    ],
    environment: 'node',
    passWithNoTests: true,
  },
});
