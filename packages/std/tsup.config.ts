import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/math.ts',
    'src/collections.ts',
    'src/string.ts',
    'src/time.ts',
    'src/traits/EconomicPrimitives.ts',
    'src/traits/EconomicTraits.ts',
  ],
  format: ['esm', 'cjs'],
  dts: false,
  clean: true,
  sourcemap: true,
});
