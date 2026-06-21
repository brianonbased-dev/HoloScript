/**
 * sovereign-targets.ts — the machine-readable native-vs-bridge registry.
 *
 * WHY THIS EXISTS (native-engine tracking, founder 2026-06-05):
 *   D.006 splits compile targets into SOVEREIGN (HoloScript runs/renders/owns it — no
 *   third-party runtime is needed to EXECUTE the output) and BRIDGE (emits to a third-party
 *   engine/format/runtime: Unity, Unreal, Godot, Babylon, R3F/Three.js, USD, glTF, …). That
 *   split was DOCTRINE only — FULL_README and NUMBERS.md describe it in prose, but nothing
 *   enumerated it as data. Consequence: our own native engines could not be counted, promoted,
 *   listed distinctly by `list_export_targets`, or guarded against deletion — they were
 *   invisible behind the third-party engine names that lead the marketing surface.
 *
 *   This module is the single source of truth for that classification. Downstream surfaces
 *   (list_export_targets, docs/NUMBERS.md, the marketing CompileTargetGrid, the
 *   native-engine-registry doc) consume it instead of re-deriving the split. Classification is
 *   DATA — reviewable and editable here; if a target is misclassified, fix the set, not a
 *   scattered prose mention.
 *
 * Keep `SOVEREIGN_TARGETS ∪ BRIDGE_TARGETS ∪ NATIVE_COMPILE_MODES` covering every member of the
 * `ExportTarget` union in CircuitBreaker.ts. The unit test asserts exhaustiveness so a NEW
 * target added to the union without being classified here fails loudly (it can't stay invisible).
 */

import type { ExportTarget } from './CircuitBreaker';

/**
 * SOVEREIGN render/runtime targets — HoloScript executes these itself. The emitted artifact runs
 * on our own GPU/DOM/VM path with no dependency on a third-party engine to render or execute.
 */
export const SOVEREIGN_TARGETS = [
  'webgpu', // WebGPUCompiler → WGSL compute+render shaders on our own WebGPU device (WebGPURenderer)
  'nir', // NIRCompiler → our Neuromorphic IR; NIRToWGSLCompiler runs it on our WebGPU path
  'native-2d', // Native2DCompiler → flat DOM/Tailwind/React UI; no 3D/third-party runtime
  'canvas2d-game', // Canvas2DGameCompiler → self-contained canvas game runtime (loop/physics/WebAudio)
  'tsl', // Trait Shader Language — our trait-to-shader codegen
  'vrr', // custom VR Rendering path (sovereign, not a vendor SDK)
  'wasm', // compiler-wasm Rust front-end → our own WASM artifact
  'svg', // SVGCompiler → sovereign SVG vector output (no third-party renderer needed)
  'holob', // HolobCompiler → HoloVM bytecode; executed by our own holo-vm runtime
  'gaussian-train', // GaussianTrainCompiler → native 3DGS training job run by GaussianTrainer3D (our own autodiff path, $0)
] as const satisfies readonly ExportTarget[];

/**
 * BRIDGE targets — HoloScript emits an artifact a THIRD-PARTY engine/format/runtime consumes to
 * render or execute. Valuable interop; just not sovereign. (The marketing surface has historically
 * led with these names — the registry exists to give the sovereign set equal billing.)
 */
export const BRIDGE_TARGETS = [
  'urdf',
  'sdf',
  'unity',
  'unreal',
  'pcg-graph', // Unreal PCG graph XML consumed by Unreal PCG
  'godot',
  'vrchat',
  'openxr',
  'android',
  'android-xr',
  'quest', // Meta Quest (Horizon OS / Meta Spatial SDK) — emits a native Kotlin app to Meta's runtime
  'ios',
  'visionos',
  'ar',
  'babylon',
  'r3f',
  'playcanvas',
  'usd',
  'usdz',
  'fmu',
  'dtdl',
  'a2a-agent-card',
  'openxr-spatial-entities',
  'phone-sleeve-vr',
  '3dgs',
  '3dtiles',
  'openapi', // OpenAPI 3.x spec — consumed by third-party API gateways/clients
  'onnx', // ONNX model export — consumed by third-party ML runtimes (ONNX Runtime, TensorFlow, etc.)
  'flutter', // Flutter/Dart widget tree — consumed by Flutter engine
  'stl-export', // STL mesh — consumed by slicers / CAD tools / 3D printers
  'lens-studio', // Snap Lens Studio AR effects — consumed by Snap runtime
  'colyseus', // Colyseus multiplayer server scaffold — consumed by Colyseus server/client
  'ai-glasses', // AI/smart-glasses display manifest — consumed by glasses firmware/SDK
  'scm', // Supply-chain manifest — consumed by SCM platforms
  'nft-marketplace', // NFT marketplace metadata + asset bundle — consumed by marketplace contracts
  'edge', // Edge device Python bundle — consumed by device-local Python/systemd runtime
  'bot-swarm', // In-process MMO load/balance harness — consumed by a Node/vitest test runner
  'dungeon-instance', // Per-party instance pool + completion receipt — consumed by the game server
  'world-shard', // World AABB shard router + handoff bootstrap — consumed by the multi-room game server
] as const satisfies readonly ExportTarget[];

/**
 * NATIVE compile MODES — sovereign, but transforms/orchestrators rather than a render/runtime
 * engine (so counted separately from "engines" in promotion surfaces). `multi-layer` currently
 * delegates its VR slice to the Babylon bridge — see MultiLayerCompiler (partial).
 */
export const NATIVE_COMPILE_MODES = [
  'state', // StateCompiler → reactive state-shape extraction
  'trait-composition', // native trait composition
  'incremental', // incremental compilation mode
  'multi-layer', // multi-layer orchestrator (VR layer bridges to Babylon)
  'code-editor', // CodeEditorCompiler → CM6 config JSON bundle (Studio native editor)
] as const satisfies readonly ExportTarget[];

/**
 * Compile-time exhaustiveness guard: if a NEW member is added to the `ExportTarget` union without
 * being placed in one of the three sets above, `_Unclassified` becomes a non-`never` union and
 * this line fails to compile (the `pnpm build` gate catches it). That is the "a new target can't
 * stay invisible" property — it must be consciously classified sovereign / bridge / mode.
 */
type _Unclassified = Exclude<
  ExportTarget,
  | (typeof SOVEREIGN_TARGETS)[number]
  | (typeof BRIDGE_TARGETS)[number]
  | (typeof NATIVE_COMPILE_MODES)[number]
>;
type _AssertNever<T extends never> = T;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _ExhaustivenessCheck = _AssertNever<_Unclassified>;

const SOVEREIGN_SET: ReadonlySet<string> = new Set(SOVEREIGN_TARGETS);
const BRIDGE_SET: ReadonlySet<string> = new Set(BRIDGE_TARGETS);

/** True iff `target` is a sovereign (native) render/runtime target. */
export function isSovereignTarget(target: ExportTarget): boolean {
  return SOVEREIGN_SET.has(target);
}

/** True iff `target` emits to a third-party engine/format/runtime. */
export function isBridgeTarget(target: ExportTarget): boolean {
  return BRIDGE_SET.has(target);
}

/** Coarse classification for a target. */
export function targetSovereignty(target: ExportTarget): 'sovereign' | 'bridge' | 'mode' {
  if (SOVEREIGN_SET.has(target)) return 'sovereign';
  if (BRIDGE_SET.has(target)) return 'bridge';
  return 'mode';
}

/**
 * Sovereign runtime ENGINES/renderers — package-level subsystems HoloScript owns end-to-end.
 * These are not `ExportTarget` keys; they are the engines the sovereign targets run ON. Tracked
 * here so they are countable, promotable, and deletion-guardable as a set. `promoted` reflects
 * whether the engine is named on a user/developer-facing surface today (most are not — the
 * founder's point). `maturity`/`tests` are the honest current state, not aspiration.
 */
export const SOVEREIGN_ENGINES = [
  {
    id: 'webgpu-renderer',
    name: 'WebGPURenderer',
    file: 'packages/engine/src/rendering/webgpu/WebGPURenderer.ts',
    kind: 'renderer',
    maturity: 'real',
    tests: false,
    promoted: true,
    note: 'Sovereign GPU renderer — owns device/pipelines/shaders/buffers + WebXR; no Three.js/Babylon. Wired into preview/deploy path (2026-06-08): compile_to_webgpu returns previewHtml, POST /api/compile/webgpu-preview serves sovereign HTML, /scene/:id?renderer=webgpu and /embed/:id?renderer=webgpu compile+serve on the native path.',
  },
  {
    id: 'spatial-engine',
    name: 'SpatialEngine',
    file: 'packages/engine/src/SpatialEngine.ts',
    kind: 'engine',
    maturity: 'real',
    tests: true,
    promoted: false,
    note: 'Native game loop: input→net→physics→anim→cull→render. Render stage can drive WebGPURenderer.',
  },
  {
    id: 'snn-webgpu',
    name: 'snn-webgpu',
    file: 'packages/snn-webgpu/src',
    kind: 'runtime',
    maturity: 'real',
    tests: true,
    promoted: false,
    note: 'Sovereign GPU spiking-neural-net runtime (raw WGSL). Best-tested native GPU stack; paper-grade (Paper 2).',
  },
  {
    id: 'nir-to-wgsl',
    name: 'NIRToWGSLCompiler',
    file: 'packages/core/src/compiler/NIRToWGSLCompiler.ts',
    kind: 'compiler',
    maturity: 'real',
    tests: true,
    promoted: false,
    note: 'Runs neuromorphic IR (LIF/CubaLIF ODEs, Euler/RK4) on our own WebGPU path. Most substantial native compiler.',
  },
  {
    id: 'holo-vm',
    name: 'holo-vm',
    file: 'packages/holo-vm/src/executor.ts',
    kind: 'runtime',
    maturity: 'real',
    tests: true,
    promoted: false,
    note: 'Sovereign bytecode execution VM.',
  },
  {
    id: 'compiler-wasm',
    name: 'compiler-wasm',
    file: 'packages/compiler-wasm/src',
    kind: 'frontend',
    maturity: 'real',
    tests: true,
    promoted: false,
    note: 'Sovereign Rust lexer/parser/AST front-end compiled to WASM.',
  },
  {
    id: 'native-2d',
    name: 'Native2DCompiler',
    file: 'packages/core/src/compiler/Native2DCompiler.ts',
    kind: 'compiler',
    maturity: 'real',
    tests: true,
    promoted: false,
    note: 'HS UI traits → flat DOM/Tailwind/React. The D.080 HS-native console base. Emits an "@generated by HoloScript" header.',
  },
  {
    id: 'canvas2d-game',
    name: 'Canvas2DGameCompiler',
    file: 'packages/core/src/compiler/Canvas2DGameCompiler.ts',
    kind: 'compiler',
    maturity: 'real',
    tests: true,
    promoted: false,
    note: 'I.017 "2D-game compiler COMPLETE". Trait→self-contained offline HTML canvas game.',
  },
  {
    id: 'webgpu-compiler',
    name: 'WebGPUCompiler',
    file: 'packages/core/src/compiler/WebGPUCompiler.ts',
    kind: 'compiler',
    maturity: 'real',
    tests: true,
    promoted: false,
    note: 'HS AST → WGSL compute+render + WebGPU init. Native GPU codegen.',
  },
  {
    id: 'nir-compiler',
    name: 'NIRCompiler',
    file: 'packages/core/src/compiler/NIRCompiler.ts',
    kind: 'compiler',
    maturity: 'real',
    tests: true,
    promoted: false,
    note: 'HS → Neuromorphic IR graph (Loihi 2 / SpiNNaker 2 / SynSense interop). Sovereign IR.',
  },
  {
    id: 'sdf-raymarch',
    name: 'SDFRayMarchCompiler',
    file: 'packages/core/src/compiler/SDFRayMarchCompiler.ts',
    kind: 'compiler',
    maturity: 'real',
    tests: true,
    promoted: false,
    note: 'Signed-distance-field → raymarch WGSL/GLSL. Native GPU renderer codegen.',
  },
] as const;

export type SovereignEngine = (typeof SOVEREIGN_ENGINES)[number];
