import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@holoscript/wasm',
    include: ['src/**/*.test.ts'],
    exclude: ['**/dist/**', '**/node_modules/**', '**/target/**', '**/pkg/**'],
    environment: 'node',
    testTimeout: 10000,
    clearMocks: true,
    restoreMocks: true,
  },
});
