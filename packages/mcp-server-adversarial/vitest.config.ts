import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@holoscript/mcp-server-adversarial',
    root: __dirname,
    include: ['__tests__/**/*.test.ts', 'src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    environment: 'node',
    globals: false,
  },
});
