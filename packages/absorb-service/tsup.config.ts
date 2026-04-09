import { defineConfig } from 'tsup';

const shared = {
  format: ['cjs', 'esm'] as const,
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
  // Entries with DTS enabled (no implicit-any issues)
  {
    ...shared,
    entry: {
      bridge: 'src/bridge.ts',
      'credits/index': 'src/credits/index.ts',
      'pipeline/index': 'src/pipeline/index.ts',
      schema: 'src/schema.ts',
    },
    dts: true,
    clean: false,
  },
  // Entries without DTS — daemon-actions has implicit any types + engine/types.ts references missing analysis/ReferenceGraph
  {
    ...shared,
    onSuccess:
      "node -e \"const fs=require('fs');const path=require('path');function cp(s,d){if(!fs.existsSync(s))return;fs.mkdirSync(path.dirname(d),{recursive:true});if(fs.statSync(s).isDirectory()){for(const f of fs.readdirSync(s))cp(path.join(s,f),path.join(d,f))}else{fs.copyFileSync(s,d)}}cp('types','dist')\"",
    entry: {
      index: 'src/index.ts',
      'engine/index': 'src/engine/index.ts',
      'daemon/index': 'src/daemon/index.ts',
      'self-improvement/index': 'src/self-improvement/index.ts',
      'mcp/index': 'src/mcp/index.ts',
    },
    dts: false,
    clean: true,
  },
]);
