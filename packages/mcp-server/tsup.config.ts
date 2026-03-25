import { defineConfig } from 'tsup';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts', 'src/http-server.ts'],
  format: ['cjs', 'esm'],
  dts: false, // Disable for now - types need work
  splitting: false,
  sourcemap: true,
  clean: true,
  shims: true,
  external: ['@holoscript/core', 'pg'],
  define: {
    __SERVICE_VERSION__: JSON.stringify(pkg.version),
  },
});
