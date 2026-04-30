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
    // Merged from @holoscript/fs (2026-04-29) — exposed via the ./fs subpath.
    'src/fs/index.ts',
  ],
  format: ['esm', 'cjs'],
  dts: false,
  clean: true,
  sourcemap: true,
});
