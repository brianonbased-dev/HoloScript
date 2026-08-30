import { defineConfig } from 'tsup';

const shared = {
  format: ['cjs', 'esm'] as import('tsup').Format[],
  shims: true,
  sourcemap: true,
  // HoloAbsorb is loaded by long-lived MCP hosts. Hashed lazy/shared chunks are
  // unsafe here: a clean rebuild can delete a chunk that an already-running
  // process has not required yet, leaving health green but its next tool call
  // broken with MODULE_NOT_FOUND. Self-contained entry bundles keep the loaded
  // generation resident while new processes pick up the next build atomically.
  splitting: false,
  treeshake: false,
  minify: false,
  external: [
    '@holoscript/core',
    '@holoscript/core/parser',
    '@holoscript/core/runtime',
    '@holoscript/core/traits',
    '@holoscript/core/scripting',
    '@holoscript/holoembed',
    'tree-sitter',
    'tree-sitter-typescript',
    'tree-sitter-python',
    'tree-sitter-rust',
    'tree-sitter-go',
    'tree-sitter-javascript',
    'tree-sitter-java',
    'tree-sitter-cpp',
    'tree-sitter-c-sharp',
    'tree-sitter-php',
    'tree-sitter-swift',
    'tree-sitter-kotlin',
    'web-tree-sitter',
    '@modelcontextprotocol/sdk',
    '@modelcontextprotocol/sdk/types.js',
    '@holoscript/holollama',
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
      'ingest/index': 'src/ingest/index.ts',
      'gev/index': 'src/gev/index.ts',
      'holoabsorb/index': 'src/holoabsorb/index.ts',
      'daemon/index': 'src/daemon/index.ts',
      'self-improvement/index': 'src/self-improvement/index.ts',
      'mcp/index': 'src/mcp/index.ts',
      'mcp/codebase-tools': 'src/mcp/codebase-tools.ts',
      bridge: 'src/bridge.ts',
      'credits/index': 'src/credits/index.ts',
      'pipeline/index': 'src/pipeline/index.ts',
      schema: 'src/schema.ts',
      'workers/parse-worker': 'src/engine/workers/parse-worker.ts',
      'workers/embedding-worker': 'src/engine/workers/embedding-worker.ts',
      'workers/WorkerPool': 'src/engine/workers/WorkerPool.ts',
    },
    dts: true,
    clean: true,
  },
]);
