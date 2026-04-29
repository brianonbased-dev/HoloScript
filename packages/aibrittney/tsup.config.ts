import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts', 'src/repl.ts', 'src/session.ts', 'src/ollama-stream.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  target: 'node18',
  banner: {
    js: '#!/usr/bin/env node',
  },
});
