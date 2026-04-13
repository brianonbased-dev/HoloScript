import { defineConfig } from 'tsup';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';

// Capture version metadata at build time
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
let gitSha = 'unknown';
try {
  gitSha = execSync('git rev-parse --short HEAD').toString().trim();
} catch {
  // Not in a git repo or git not available — keep 'unknown'
}

export default defineConfig({
  entry: { 'index': 'src/index.ts' },
  define: {
    __HOLOSCRIPT_VERSION__: JSON.stringify(pkg.version),
    __GIT_COMMIT_SHA__: JSON.stringify(gitSha),
    __BUILD_TIMESTAMP__: JSON.stringify(new Date().toISOString()),
  },
  format: ['cjs', 'esm'],
  dts: true, // Re-enable DTS generation
  clean: true,
  sourcemap: true,
  splitting: true, // Enable code splitting for shared chunks
  treeshake: true, // Remove unused code
  minify: false, // Keep readable for debugging, enable for production
  external: [
    // Externalize Node.js CJS packages that break in ESM bundles
    'dotenv',
    'jsonwebtoken',
    'jws',
    'safe-buffer',
    'ws',
    // Externalize React (peer dependency for UI components like DegradedModeBanner)
    'react',
    'react-dom',
    // Externalize Three.js (peer dependency to prevent multiple instance crashes)
    'three',
    '@react-three/fiber',
    '@react-three/drei',
    // Externalize workspace dependencies
    '@holoscript/absorb-service',
    '@holoscript/absorb-service/engine',
    '@holoscript/absorb-service/self-improvement',
    '@holoscript/absorb-service/daemon',
    '@holoscript/core',
    '@holoscript/engine',
    '@holoscript/framework',
    /^@holoscript\/engine\//,
    /^@holoscript\/framework\//,
    '@holoscript/agent-protocol',
    '@holoscript/mesh',
    /^@holoscript\/mesh\//,
    '@holoscript/platform',
    /^@holoscript\/platform\//,
    '@holoscript/mcp-server',
    // loro-crdt is only needed by mcp-server at runtime, but esbuild follows
    // relative imports from holoscript-runner.ts into mcp-server source
    'loro-crdt',
    // Externalize tree-sitter (native bindings, loaded at runtime)
    'tree-sitter',
    'tree-sitter-typescript',
    'tree-sitter-python',
    'tree-sitter-rust',
    'tree-sitter-go',
    'tree-sitter-javascript',
    'web-tree-sitter',
  ],
  // Rollup-specific options for advanced code splitting
  esbuildOptions(options) {
    // Enable advanced tree-shaking
    options.treeShaking = true;
  },
});
