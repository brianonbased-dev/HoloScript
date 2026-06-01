import { defineConfig } from 'tsup';

export default defineConfig({
  // server.ts is the runnable entry (package.json `start` = node dist/server.js);
  // index.ts is the library barrel. Both must be emitted.
  entry: ['src/index.ts', 'src/server.ts'],
  format: ['esm'],
  dts: false,
  clean: true,
  sourcemap: true,
  // No code-splitting: the runnable entry must be self-contained so the
  // "run directly" guard sees import.meta.url === argv[1]. With splitting on,
  // the guard is hoisted into a shared chunk and `node dist/server.js` never
  // starts the listener (it just re-exports) — which is why the service never
  // actually booted in deploy.
  splitting: false,
});
