// Standalone vite demo for the 4 coordinator-panels.
// Spins up a small page that mounts all 4 panels with a real
// TraitContextFactory + a synthetic event-firer so the founder can
// see them rendering live without booting the full Next.js Studio app.
//
// W.343 + W.344: the surface is the conversation. This is the surface.
import { defineConfig } from 'vite';
import path from 'path';

// No @vitejs/plugin-react — vite/esbuild handles .tsx natively for a
// one-off demo. We lose React Fast Refresh, but full reload is fine
// for a manual click-through.
export default defineConfig({
  root: __dirname,
  esbuild: {
    jsx: 'automatic',
  },
  resolve: {
    alias: {
      '@holoscript/core/coordinators': path.resolve(
        __dirname,
        '../../../../../core/src/coordinators/index.ts'
      ),
      // Stub the heavy core barrel — the demo only needs a minimal
      // surface (VRTraitRegistry, type aliases). The real core barrel
      // pulls in transitive value-vs-type re-export errors across
      // spatial/composition/etc that vite's strict module-record
      // semantics reject. core-stub.ts provides exactly what
      // TraitRuntimeIntegration + TraitContextFactory consume.
      '@holoscript/core': path.resolve(__dirname, 'core-stub.ts'),
      '@holoscript/engine/runtime/TraitRuntimeIntegration': path.resolve(
        __dirname,
        '../../../../../engine/src/runtime/TraitRuntimeIntegration.ts'
      ),
      '@holoscript/engine/runtime/TraitContextFactory': path.resolve(
        __dirname,
        '../../../../../engine/src/runtime/TraitContextFactory.ts'
      ),
      '@holoscript/engine': path.resolve(__dirname, '../../../../../engine/src'),
      // Optional deps reached through the @holoscript/core barrel —
      // the panels never hit these code paths in the demo, but vite's
      // import-analyzer chokes on the unresolvable specifiers. Stub.
      '@aztec/bb.js': path.resolve(__dirname, 'empty-stub.ts'),
      '@holoscript/holo-vm': path.resolve(__dirname, 'empty-stub.ts'),
    },
  },
  server: {
    port: 3403,
    strictPort: true,
  },
});
