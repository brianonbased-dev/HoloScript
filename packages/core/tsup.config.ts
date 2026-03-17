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
  entry: {
    // CLI runner (compiled for bin + fast daemon test startup in CI)
    'cli/holoscript-runner': 'src/cli/holoscript-runner.ts',

    // Core exports (always loaded)
    index: 'src/index.ts',
    parser: 'src/parser/HoloScriptPlusParser.ts',
    runtime: 'src/HoloScriptRuntime.ts',
    'type-checker': 'src/HoloScriptTypeChecker.ts',
    debugger: 'src/HoloScriptDebugger.ts',
    'storage/index': 'src/storage/index.ts',
    'wot/index': 'src/wot/index.ts',

    // Compiler targets (dynamically loaded on-demand)
    // VR/AR/XR Compilers
    'compiler/vrr': 'src/compiler/VRRCompiler.ts',
    'compiler/ar': 'src/compiler/ARCompiler.ts',
    'compiler/multi-layer': 'src/compiler/MultiLayerCompiler.ts',
    'compiler/openxr': 'src/compiler/OpenXRCompiler.ts',
    'compiler/vrchat': 'src/compiler/VRChatCompiler.ts',

    // Engine-Specific Compilers
    'compiler/babylon': 'src/compiler/BabylonCompiler.ts',
    'compiler/unity': 'src/compiler/UnityCompiler.ts',
    'compiler/unreal': 'src/compiler/UnrealCompiler.ts',
    'compiler/godot': 'src/compiler/GodotCompiler.ts',
    'compiler/r3f': 'src/compiler/R3FCompiler.ts',
    'compiler/playcanvas': 'src/compiler/PlayCanvasCompiler.ts',

    // Platform-Specific Compilers
    'compiler/android': 'src/compiler/AndroidCompiler.ts',
    'compiler/android-xr': 'src/compiler/AndroidXRCompiler.ts',
    'compiler/ios': 'src/compiler/IOSCompiler.ts',
    'compiler/visionos': 'src/compiler/VisionOSCompiler.ts',

    // Low-Level Compilers
    'compiler/wasm': 'src/compiler/WASMCompiler.ts',
    'compiler/webgpu': 'src/compiler/WebGPUCompiler.ts',

    // Specialized Compilers
    'compiler/dtdl': 'src/compiler/DTDLCompiler.ts',
    'compiler/urdf': 'src/compiler/URDFCompiler.ts',
    'compiler/usd-physics': 'src/compiler/USDPhysicsCompiler.ts',
    'compiler/sdf': 'src/compiler/SDFCompiler.ts',
    'compiler/state': 'src/compiler/StateCompiler.ts',
    'compiler/trait-composition': 'src/compiler/TraitCompositionCompiler.ts',
    'compiler/incremental': 'src/compiler/IncrementalCompiler.ts',

    // Codebase Absorption Engine (dynamically loaded)
    'codebase/index': 'src/codebase/index.ts',

    // Self-Improvement Pipeline (dynamically loaded)
    'self-improvement/index': 'src/self-improvement/index.ts',

    // Sub-barrel focused entry points (lighter than monolithic index.ts)
    'entries/scripting': 'src/entries/scripting.ts',
    'entries/interop': 'src/entries/interop.ts',

    // Sprint 2: Compiler extensions
    'compiler/coco': 'src/compiler/COCOExporter.ts',
    'compiler/gltf-pipeline': 'src/compiler/GLTFPipelineMCPTool.ts',
    'compiler/nodetoy': 'src/compiler/NodeToyMapping.ts',
    'compiler/remotion': 'src/compiler/RemotionBridge.ts',
    'compiler/reproducibility': 'src/compiler/ReproducibilityMode.ts',
    'compiler/semantic-scene': 'src/compiler/SemanticSceneGraph.ts',

    // Sprint 3: Agent inference export
    'compiler/agent-inference': 'src/compiler/AgentInferenceExportTarget.ts',
  },
  define: {
    __HOLOSCRIPT_VERSION__: JSON.stringify(pkg.version),
    __GIT_COMMIT_SHA__: JSON.stringify(gitSha),
    __BUILD_TIMESTAMP__: JSON.stringify(new Date().toISOString()),
  },
  format: ['cjs', 'esm'],
  dts: true, // Re-enabled for proper TypeScript support
  clean: true,
  sourcemap: true,
  splitting: true, // Enable code splitting for shared chunks
  treeshake: true, // Remove unused code
  minify: false, // Keep readable for debugging, enable for production
  external: [
    // Externalize blockchain/wallet packages that don't work in browser webpack bundles
    '@coinbase/agentkit',
    'viem',
    'viem/accounts',
    // Externalize Node.js CJS packages that break in ESM bundles
    'jsonwebtoken',
    'jws',
    'safe-buffer',
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
