#!/usr/bin/env node
/**
 * Brian step 1 runner: import report + turntable through HoloScript's OWN code paths.
 *
 * Loads `brian-import-turntable.impl.ts` through Vite's SSR module loader so the repo's
 * TypeScript sources (incl. the `?raw` WGSL import in character-render.ts) run unbuilt.
 * No workspace build is needed. The GPU device is Dawn via the `webgpu` npm package
 * (same device source as packages/engine/src/physics/__tests__/gpu-setup.ts).
 *
 * Usage:
 *   node scripts/brian/brian-import-turntable.mjs --out <dir> [--size 1024] [--skip-render] <a.glb> [b.glb ...]
 */
import { createServer } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');

const args = process.argv.slice(2);
const opts = { out: null, size: 1024, skipRender: false, files: [] };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--out') opts.out = args[++i];
  else if (a === '--size') opts.size = Number(args[++i]);
  else if (a === '--skip-render') opts.skipRender = true;
  else opts.files.push(a);
}
if (!opts.out || opts.files.length === 0) {
  console.error('usage: brian-import-turntable.mjs --out <dir> [--size N] [--skip-render] <glb...>');
  process.exit(2);
}

const server = await createServer({
  root,
  configFile: false,
  logLevel: 'error',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
  resolve: {
    alias: [
      { find: /^@holoscript\/engine$/, replacement: path.join(root, 'packages/engine/src/index.ts') },
      { find: /^@holoscript\/core$/, replacement: path.join(root, 'packages/core/src/index.ts') },
    ],
  },
});
let code = 0;
try {
  const mod = await server.ssrLoadModule(path.join(here, 'brian-import-turntable.impl.ts'));
  code = await mod.run({ ...opts, repoRoot: root });
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  await server.close();
}
process.exit(code);