import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      // Mesh tests historically imported runtime classes from @holoscript/core.
      // In this package context, route that specifier to mesh exports so
      // constructors like WebSocketTransport/SocialGraph resolve at runtime.
      '@holoscript/core': resolve(__dirname, 'src/testing/core-compat.ts'),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    passWithNoTests: true,
  },
});
