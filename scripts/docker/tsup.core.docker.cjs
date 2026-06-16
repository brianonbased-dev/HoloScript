// Docker-specific tsup config for core — inlines all workspace deps.
// Uses .cjs extension to prevent tsup from bundling it into ESM.
const { readFileSync } = require('fs');
const { execSync } = require('child_process');

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
let gitSha = 'unknown';
try {
  gitSha = execSync('git rev-parse --short HEAD').toString().trim();
} catch {}

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
    // Required by engine's simulation dispatch at runtime through
    // '@holoscript/core/traits/simulation-solver-factory' (a distinct subpath, NOT
    // re-exported via traits/index) — missing entry made the deployed engine 500
    // with "Cannot find module .../traits/simulation-solver-factory.js" on every
    // /sim solve. Enumerated as the only runtime core-subpath engine imports that
    // this config lacked (paper-0c-spike + reconstruction are already present).
    'traits/simulation-solver-factory': 'src/traits/SimulationSolverFactory.ts',
    'codebase/index': 'src/codebase/index.ts',
    'cli/holoscript-runner': 'src/cli/holoscript-runner.ts',
    'entries/scripting': 'src/entries/scripting.ts',
    'entries/interop': 'src/entries/interop.ts',
    'compiler/domain-block-utils': 'src/compiler/DomainBlockCompilerMixin.ts',
    // Required by mcp-server/src/holo-reconstruct-sessions.ts at runtime
    // (dynamic require through '@holoscript/core/reconstruction').
    'reconstruction/index': 'src/reconstruction/index.ts',
    // Required by engine's CAEL SimulationContract at runtime
    // through '@holoscript/core/paper-0c-spike'.
    'paper-0c-spike/index': 'src/paper-0c-spike/index.ts',
    // Required by mcp-server/src/hololand-mcp-tools.ts at runtime
    // through '@holoscript/core/hololand' — missing entry caused
    // mcp-server crashloop (prod outage 2026-05-16).
    'hololand/index': 'src/hololand/index.ts',
    // Required by mcp-server/src/generators.ts (generate_world) at runtime through
    // '@holoscript/core/world' — missing entry made generate_world 500 with
    // "Cannot find module .../dist/world/index.js" (surfaced by the persona dogfood
    // harness 2026-06-08; same Docker-entry-drift class as the entries above).
    'world/index': 'src/world/index.ts',
    // Required by mcp-server/src/hololand-mcp-tools.ts at runtime through
    // '@holoscript/core/policy' (ContentPolicyGate / GATE-001 content admission) —
    // missing entry caused mcp-server crashloop (prod outage 2026-06-16; same
    // Docker-entry-drift class as hololand/world above: d04a5f588 added the policy
    // subpath to tsup.config.ts + package.json exports but not to this Docker config).
    'policy/index': 'src/policy/index.ts',
    // Required by engine's SimulationContract at runtime through
    // '@holoscript/core/parameter-envelope' (checkParameterEnvelope value import) —
    // missing entry crashlooped mcp-server with "Cannot find module
    // .../dist/parameter-envelope/index.cjs" (prod outage 2026-06-16). Same
    // Docker-entry-drift class as policy/world/hololand above: ParameterEnvelope
    // (e67bdc0a1) was added to tsup.config.ts + package.json exports but not here.
    'parameter-envelope/index': 'src/parameter-envelope/index.ts',
    // Required by engine's TraitRuntimeIntegration at runtime through
    // '@holoscript/core/coordinators' (AssetLoadCoordinator / SecurityEventBus /
    // GenerativeJobMonitor / SessionPresenceCoordinator / NeuralForgeCoordinator /
    // ObjectTrackingCoordinator value imports) — same drift class, latent in the
    // engine boot barrel; caught preemptively in the 2026-06-16 outage sweep before
    // it became the next crashloop after parameter-envelope.
    'coordinators/index': 'src/coordinators/index.ts',
  },
  define: {
    __HOLOSCRIPT_VERSION__: JSON.stringify(pkg.version),
    __GIT_COMMIT_SHA__: JSON.stringify(gitSha),
    __BUILD_TIMESTAMP__: JSON.stringify(new Date().toISOString()),
  },
  // HoloMap is loaded through the ESM "import" condition in production, so
  // Docker images need the ESM subpath files that package.json exports.
  format: ['cjs', 'esm'],
  dts: false,
  clean: true,
  sourcemap: false,
  splitting: false,
  treeshake: true,
  minify: false,
  external: [
    // Self-reference (can't inline a package into itself)
    '@holoscript/core',
    /^@holoscript\/core\//,
    // Workspace packages with complex subpath exports (keep external, resolve at runtime)
    '@holoscript/engine',
    /^@holoscript\/engine\//,
    '@holoscript/framework',
    /^@holoscript\/framework\//,
    '@holoscript/absorb-service',
    /^@holoscript\/absorb-service\//,
    // ONNX runtimes — native bindings (onnxruntime-node) + WebGPU platform
    // packages; dynamically imported and optional. Must mirror
    // packages/core/tsup.config.ts (which externalizes these) or the Docker
    // core build fails: esbuild "Could not resolve onnxruntime-node".
    'onnxruntime-node',
    'onnxruntime-web',
    'onnxruntime-common',
    // Native/Node packages
    'dotenv',
    'jsonwebtoken',
    'jws',
    'safe-buffer',
    'ws',
    'react',
    'react-dom',
    'three',
    '@react-three/fiber',
    '@react-three/drei',
    'loro-crdt',
    'pg',
    'puppeteer',
    'playwright',
    '@playwright/test',
    'ioredis',
    'discord.js',
    'tree-sitter',
    'tree-sitter-typescript',
    'tree-sitter-python',
    'tree-sitter-rust',
    'tree-sitter-go',
    'tree-sitter-javascript',
    'web-tree-sitter',
  ],
};
