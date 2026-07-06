import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@holoscript/holo-runtime',
    include: ['src/**/*.test.ts'],
    environment: 'node',
    passWithNoTests: false,
  },
});
