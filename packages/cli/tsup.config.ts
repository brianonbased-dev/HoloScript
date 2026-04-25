import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    cli: 'src/cli.ts',
    'lsp/server': 'src/lsp/runner.ts',
  },
  format: ['cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  external: [
    // Tree-sitter native bindings — never bundle, never DTS-walk.
    'tree-sitter',
    'tree-sitter-python',
    'tree-sitter-typescript',
    'tree-sitter-javascript',
    'tree-sitter-go',
    'tree-sitter-rust',
    'web-tree-sitter',
    // Workspace deps — externalize so tsup's rollup-dts pass doesn't follow
    // pnpm symlinks into engine/framework/core source. Engine has a mid-flight
    // Vec3 migration whose source-level type errors are tolerated by engine's
    // own build.mjs but would otherwise crash any consumer's whole-program
    // dts walk. See task_1777143308566_wewf and packages/mesh/tsup.config.ts
    // for the canonical externalize pattern.
    '@holoscript/engine',
    /^@holoscript\/engine\//,
    '@holoscript/framework',
    /^@holoscript\/framework\//,
    '@holoscript/core',
    /^@holoscript\/core\//,
  ],
});
