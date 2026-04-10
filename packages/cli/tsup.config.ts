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
    'tree-sitter',
    'tree-sitter-python',
    'tree-sitter-typescript',
    'tree-sitter-javascript',
    'tree-sitter-go',
    'tree-sitter-rust',
    'web-tree-sitter',
  ],
});
