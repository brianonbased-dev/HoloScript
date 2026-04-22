import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vitest/config';

const packageRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // When invoked from the monorepo root (`vitest --config packages/connector-core/...`),
  // paths must resolve inside this package, not the repo cwd.
  root: packageRoot,
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['**/dist/**', '**/node_modules/**'],
  },
});
