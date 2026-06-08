import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

// resolve.alias is REQUIRED: without it, `@holoscript/core/runtime` resolves to
// the STALE built dist and registerPluginTraits is missing ("not a function").
// Point the subpath imports at core/engine source so the runtime barrel
// (core/src/runtime.ts) and shared registrar resolve from source. Mirrors
// energy-grid-plugin/vitest.config.ts.
export default defineConfig({
  resolve: {
    alias: {
      '@holoscript/engine': resolve(__dirname, '../../engine/src'),
      '@holoscript/core': resolve(__dirname, '../../core/src'),
    },
  },
  test: { globals: true },
});
