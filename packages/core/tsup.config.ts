import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    parser: 'src/parser/HoloScriptPlusParser.ts',
    runtime: 'src/HoloScriptRuntime.ts',
    'type-checker': 'src/HoloScriptTypeChecker.ts',
    debugger: 'src/HoloScriptDebugger.ts',
    'storage/index': 'src/storage/index.ts',
    'wot/index': 'src/wot/index.ts',
  },
  format: ['cjs', 'esm'],
  dts: false, // Temporarily disable for v3.0 - type mismatches to resolve in v3.1
  clean: true,
  sourcemap: true,
  splitting: true,
  treeshake: true,
  minify: false, // Keep readable for debugging, enable for production
  external: [], // No external deps for now
});
