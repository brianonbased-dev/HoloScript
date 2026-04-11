import { defineConfig } from 'tsup';

const shared = {
  format: ['cjs', 'esm'] as import('tsup').Format[],
  shims: true,
  sourcemap: true,
  splitting: true,
  treeshake: false,
  minify: false,
  external: [
    '@holoscript/core',
    '@holoscript/core/runtime',
    '@holoscript/core/traits',
    '@holoscript/core/scripting',
    'tree-sitter',
    'tree-sitter-typescript',
    'tree-sitter-python',
    'tree-sitter-rust',
    'tree-sitter-go',
    'tree-sitter-javascript',
    'web-tree-sitter',
    '@modelcontextprotocol/sdk',
    '@modelcontextprotocol/sdk/types.js',
    'drizzle-orm',
    'drizzle-orm/pg-core',
    '@huggingface/transformers',
    'onnxruntime-node',
    'onnxruntime-common',
    'openai',
    'zod',
  ],
};

export default defineConfig([
  {
    ...shared,
    entry: {
      index: 'src/index.ts',
      'engine/index': 'src/engine/index.ts',
      'daemon/index': 'src/daemon/index.ts',
      'self-improvement/index': 'src/self-improvement/index.ts',
      'mcp/index': 'src/mcp/index.ts',
      bridge: 'src/bridge.ts',
      'credits/index': 'src/credits/index.ts',
      'pipeline/index': 'src/pipeline/index.ts',
      schema: 'src/schema.ts',
    },
    dts: true,
    clean: true,
  },
]);
