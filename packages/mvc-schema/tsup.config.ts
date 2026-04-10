import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'types/index': 'src/types/index.ts',
    'schemas/index': 'src/schemas/index.ts',
    'compression/index': 'src/compression/index.ts',
    'validation/index': 'src/validation/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  treeshake: true,
  minify: true, // Enable minification for size optimization
});
