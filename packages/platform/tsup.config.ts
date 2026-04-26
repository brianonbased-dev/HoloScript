import { defineConfig } from 'tsup';
export default defineConfig({
  entry: { 'index': 'src/index.ts' },
  format: ['cjs', 'esm'],
  // dts disabled while platform shares the mid-flight Vec3 migration
  // with engine — same source-level TS errors crash tsup's dts pass.
  // Engine tolerates via build.mjs+tolerateFailure; platform uses bare
  // tsup so we drop dts here until migration completes. Studio + other
  // downstream consumers don't import platform's d.ts directly (it's
  // aliased to false in studio next.config.js). Restore once
  // task_1777164512763_x545 (engine Vec3 migration) lands.
  dts: false,
  splitting: false,
  sourcemap: true,
  clean: true,
  external: [
    '@holoscript/core',
    /^@holoscript\/core\//,
    '@holoscript/mesh',
    /^@holoscript\/mesh\//,
    '@holoscript/platform',
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
