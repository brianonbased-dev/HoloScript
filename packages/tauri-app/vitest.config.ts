import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@holoscript/tauri-app',
    root: '.',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['**/dist/**', '**/node_modules/**', '**/src-tauri/**'],
    environment: 'node',
  },
});
