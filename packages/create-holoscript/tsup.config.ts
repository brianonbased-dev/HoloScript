import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    // Merged from @holoscript/agent-setup (2026-04-29) — second CLI bin
    // for upgrading agent infra in an existing repo (vs the project-
    // scaffolder bin that emits the index.ts entry).
    'src/agent-setup/cli.ts',
  ],
  format: ['esm'],
  target: 'node18',
  outDir: 'dist',
  clean: true,
  dts: false,
  splitting: false,
  banner: {
    js: '#!/usr/bin/env node',
  },
});
