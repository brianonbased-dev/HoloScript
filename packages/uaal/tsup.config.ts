import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts', semantic: 'src/semantic.ts', gate: 'src/gate.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
});
