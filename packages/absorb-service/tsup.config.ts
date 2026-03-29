import { defineConfig } from 'tsup';

export default defineConfig({
  onSuccess: 'node -e "const fs=require(\'fs\');const path=require(\'path\');function cp(s,d){if(!fs.existsSync(s))return;fs.mkdirSync(path.dirname(d),{recursive:true});if(fs.statSync(s).isDirectory()){for(const f of fs.readdirSync(s))cp(path.join(s,f),path.join(d,f))}else{fs.copyFileSync(s,d)}}cp(\'types\',\'dist\')"',
  entry: {
    index: 'src/index.ts',
    'engine/index': 'src/engine/index.ts',
    'pipeline/index': 'src/pipeline/index.ts',
    'daemon/index': 'src/daemon/index.ts',
    'self-improvement/index': 'src/self-improvement/index.ts',
    'mcp/index': 'src/mcp/index.ts',
    'credits/index': 'src/credits/index.ts',
    schema: 'src/schema.ts',
    bridge: 'src/bridge.ts',
  },
  format: ['cjs', 'esm'],
  dts: false, // Disabled — daemon-actions has implicit any types + engine/types.ts references missing analysis/ReferenceGraph
  shims: true, // Required: replaces import.meta.url with CJS equivalent in CJS output
  clean: true,
  sourcemap: true,
  splitting: true,
  treeshake: false,
  minify: false,
  external: [
    // Externalize @holoscript/core (peer dependency for daemon-actions runtime types)
    '@holoscript/core',
    '@holoscript/core/runtime',
    '@holoscript/core/traits',
    '@holoscript/core/scripting',
    // Externalize tree-sitter (native bindings, loaded at runtime)
    'tree-sitter',
    'tree-sitter-typescript',
    'tree-sitter-python',
    'tree-sitter-rust',
    'tree-sitter-go',
    'tree-sitter-javascript',
    'web-tree-sitter',
    // Externalize MCP SDK (peer dependency)
    '@modelcontextprotocol/sdk',
    '@modelcontextprotocol/sdk/types.js',
    // Externalize drizzle (used at runtime by consumer)
    'drizzle-orm',
    'drizzle-orm/pg-core',
    // Externalize @huggingface/transformers + onnxruntime (optional dep, native bindings)
    '@huggingface/transformers',
    'onnxruntime-node',
    'onnxruntime-common',
    // Externalize openai (regular dependency, installed by consumer)
    'openai',
    // Externalize zod (regular dependency)
    'zod',
  ],
});
