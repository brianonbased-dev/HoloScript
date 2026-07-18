import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts', semantic: 'src/semantic.ts', gate: 'src/gate.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  // `src/verifier.ts` is an export-star compatibility bridge. Keeping meaning
  // external causes tsup/esbuild to erase those names from dist entirely.
  noExternal: ['@holoscript/meaning'],
  // Rollup treeshaking drops the external `export * from @holoscript/meaning`
  // bridge from the built package, leaving source tests green while production
  // consumers lose gradeByResolver and the resolver-family registry.
  treeshake: false,
});
