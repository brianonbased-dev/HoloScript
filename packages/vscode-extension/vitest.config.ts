import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const vscodeMockPath = path.resolve(__dirname, 'src/__tests__/__mocks__/vscode.ts');

export default defineConfig({
  resolve: {
    alias: [{ find: 'vscode', replacement: vscodeMockPath }],
  },
  test: {
    name: 'vscode-extension',
    root: __dirname,
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['**/dist/**', '**/node_modules/**'],
    alias: [{ find: 'vscode', replacement: vscodeMockPath }],
    server: {
      deps: {
        inline: ['vscode'],
      },
    },
  },
});
