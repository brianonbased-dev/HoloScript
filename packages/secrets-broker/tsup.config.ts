import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/repository-identity.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
});
