// Docker-specific tsup config for core — inlines all workspace deps.
// Uses .cjs extension to prevent tsup from bundling it into ESM.
const { readFileSync } = require('fs');
const { execSync } = require('child_process');

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
let gitSha = 'unknown';
try { gitSha = execSync('git rev-parse --short HEAD').toString().trim(); } catch {}

module.exports = {
  entry: {
    index: 'src/index.ts',
    'math/vec3': 'src/math/vec3.ts',
    parser: 'src/parser/HoloScriptPlusParser.ts',
    runtime: 'src/HoloScriptRuntime.ts',
    'type-checker': 'src/HoloScriptTypeChecker.ts',
    debugger: 'src/HoloScriptDebugger.ts',
    'storage/index': 'src/storage/index.ts',
    'compiler/index': 'src/compiler/index.ts',
    'traits/index': 'src/traits/index.ts',
    'codebase/index': 'src/codebase/index.ts',
    'cli/holoscript-runner': 'src/cli/holoscript-runner.ts',
    'entries/scripting': 'src/entries/scripting.ts',
    'entries/interop': 'src/entries/interop.ts',
    'compiler/domain-block-utils': 'src/compiler/DomainBlockCompilerMixin.ts',
  },
  define: {
    __HOLOSCRIPT_VERSION__: JSON.stringify(pkg.version),
    __GIT_COMMIT_SHA__: JSON.stringify(gitSha),
    __BUILD_TIMESTAMP__: JSON.stringify(new Date().toISOString()),
  },
  format: ['cjs'],
  dts: false,
  clean: true,
  sourcemap: false,
  splitting: false,
  treeshake: true,
  minify: false,
  external: [
    'dotenv', 'jsonwebtoken', 'jws', 'safe-buffer', 'ws',
    'react', 'react-dom', 'three', '@react-three/fiber', '@react-three/drei',
    'loro-crdt', 'pg', 'puppeteer', 'playwright', '@playwright/test',
    'ioredis', 'discord.js',
    'tree-sitter', 'tree-sitter-typescript', 'tree-sitter-python',
    'tree-sitter-rust', 'tree-sitter-go', 'tree-sitter-javascript', 'web-tree-sitter',
  ],
};
