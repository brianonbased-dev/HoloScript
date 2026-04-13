/**
 * Docker-specific tsup config for @holoscript/core.
 *
 * Key difference from packages/core/tsup.config.ts:
 * - Does NOT externalize workspace packages (engine, framework, mesh, platform, plugins)
 * - These get inlined into the bundle so there are no runtime resolution issues in Docker
 * - Only externalizes truly external packages (React, Three.js, native bindings, Node built-ins)
 *
 * This exists because pnpm's strict workspace resolution in Docker containers doesn't
 * reliably create the symlinks that CJS require() traversal expects for subpath exports
 * like @holoscript/engine/choreography → engine/dist/choreography/index.cjs.
 */
const { defineConfig } = require("tsup");
const { execSync } = require("child_process");
const { readFileSync } = require("fs");

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
let gitSha = 'unknown';
try {
  gitSha = execSync('git rev-parse --short HEAD').toString().trim();
} catch { /* not in git */ }

module.exports = defineConfig({
  entry: {
    index: 'src/index.ts',
    'math/vec3': 'src/math/vec3.ts',
    parser: 'src/parser/HoloScriptPlusParser.ts',
    runtime: 'src/HoloScriptRuntime.ts',
    'type-checker': 'src/HoloScriptTypeChecker.ts',
    debugger: 'src/HoloScriptDebugger.ts',
    'storage/index': 'src/storage/index.ts',
    'compiler/vrr': 'src/compiler/VRRCompiler.ts',
    'compiler/ar': 'src/compiler/ARCompiler.ts',
    'compiler/multi-layer': 'src/compiler/MultiLayerCompiler.ts',
    'compiler/openxr': 'src/compiler/OpenXRCompiler.ts',
    'compiler/vrchat': 'src/compiler/VRChatCompiler.ts',
    'compiler/babylon': 'src/compiler/BabylonCompiler.ts',
    'compiler/unity': 'src/compiler/UnityCompiler.ts',
    'compiler/unreal': 'src/compiler/UnrealCompiler.ts',
    'compiler/godot': 'src/compiler/GodotCompiler.ts',
    'compiler/r3f': 'src/compiler/R3FCompiler.ts',
    'compiler/playcanvas': 'src/compiler/PlayCanvasCompiler.ts',
    'compiler/android': 'src/compiler/AndroidCompiler.ts',
    'compiler/android-xr': 'src/compiler/AndroidXRCompiler.ts',
    'compiler/ios': 'src/compiler/IOSCompiler.ts',
    'compiler/visionos': 'src/compiler/VisionOSCompiler.ts',
    'compiler/wasm': 'src/compiler/WASMCompiler.ts',
    'compiler/webgpu': 'src/compiler/WebGPUCompiler.ts',
    'compiler/dtdl': 'src/compiler/DTDLCompiler.ts',
    'compiler/urdf': 'src/compiler/URDFCompiler.ts',
    'compiler/usd-physics': 'src/compiler/USDPhysicsCompiler.ts',
    'compiler/sdf': 'src/compiler/SDFCompiler.ts',
    'compiler/state': 'src/compiler/StateCompiler.ts',
    'compiler/trait-composition': 'src/compiler/TraitCompositionCompiler.ts',
    'compiler/incremental': 'src/compiler/IncrementalCompiler.ts',
    'codebase/index': 'src/codebase/index.ts',
    'cli/holoscript-runner': 'src/cli/holoscript-runner.ts',
    'traits/index': 'src/traits/index.ts',
    'compiler/index': 'src/compiler/index.ts',
    'entries/scripting': 'src/entries/scripting.ts',
    'entries/interop': 'src/entries/interop.ts',
    'compiler/coco': 'src/compiler/COCOExporter.ts',
    'compiler/gltf-pipeline': 'src/compiler/GLTFPipelineMCPTool.ts',
    'compiler/nodetoy': 'src/compiler/NodeToyMapping.ts',
    'compiler/remotion': 'src/compiler/RemotionBridge.ts',
    'compiler/reproducibility': 'src/compiler/ReproducibilityMode.ts',
    'compiler/semantic-scene': 'src/compiler/SemanticSceneGraph.ts',
    'compiler/agent-inference': 'src/compiler/AgentInferenceExportTarget.ts',
    'compiler/domain-block-utils': 'src/compiler/DomainBlockCompilerMixin.ts',
  },
  define: {
    __HOLOSCRIPT_VERSION__: JSON.stringify(pkg.version),
    __GIT_COMMIT_SHA__: JSON.stringify(gitSha),
    __BUILD_TIMESTAMP__: JSON.stringify(new Date().toISOString()),
  },
  format: ['cjs'],          // Docker only needs CJS
  dts: false,               // No types needed at runtime
  clean: true,
  sourcemap: false,         // Smaller image
  splitting: false,         // Avoid chunk path resolution issues
  treeshake: true,
  minify: false,
  external: [
    // Only externalize packages that are NOT in the workspace
    // (native bindings, React, Three.js, etc.)
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
    'tree-sitter',
    'tree-sitter-typescript',
    'tree-sitter-python',
    'tree-sitter-rust',
    'tree-sitter-go',
    'tree-sitter-javascript',
    'web-tree-sitter',
    'pg',
    'puppeteer',
    'playwright',
    '@playwright/test',
    'ioredis',
    'discord.js',
  ],
  esbuildOptions(options) {
    options.treeShaking = true;
  },
});
