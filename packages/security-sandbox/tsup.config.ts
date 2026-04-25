import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: false,
  external: [
    '@holoscript/core',
    /^@holoscript\/core\//,
    // Externalize engine + framework so tsup's rollup-dts pass doesn't follow
    // pnpm symlinks into their source. Engine has a mid-flight Vec3 migration
    // whose source-level type errors are tolerated by engine's own build.mjs
    // but would otherwise crash any consumer's whole-program dts walk.
    // See task_1777143308566_wewf and packages/mesh/tsup.config.ts.
    '@holoscript/engine',
    /^@holoscript\/engine\//,
    '@holoscript/framework',
    /^@holoscript\/framework\//,
  ],
});
