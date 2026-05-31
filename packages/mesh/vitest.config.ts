import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: [
      // Mesh tests historically imported runtime classes from @holoscript/core.
      // In this package context, route that specifier to mesh exports so
      // constructors like WebSocketTransport/SocialGraph resolve at runtime.
      // The cold-consume refactor moved those runtime classes onto the
      // `@holoscript/core/runtime` subpath — route it to the same mesh compat
      // bridge so mesh tests keep resolving mesh's own implementations.
      { find: /^@holoscript\/core\/runtime$/, replacement: resolve(__dirname, 'src/testing/core-compat.ts') },
      { find: /^@holoscript\/core$/, replacement: resolve(__dirname, 'src/testing/core-compat.ts') },
    ],
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    passWithNoTests: true,
  },
});
