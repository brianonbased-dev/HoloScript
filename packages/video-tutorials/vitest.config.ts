import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Force Vite to resolve .tsx source files, not the pre-compiled .js files
    // which contain JSX without the .jsx extension.
    extensions: ['.tsx', '.ts', '.mts', '.mjs'],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['test/**/*.test.{ts,tsx}'],
    setupFiles: [],
  },
});
