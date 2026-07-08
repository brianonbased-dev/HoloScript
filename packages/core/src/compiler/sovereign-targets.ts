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
  'audio', // SpatialAudioCompiler → our own Web Audio graph (HRTF PannerNode + Convolver reverb + filters); no third-party audio engine
  'desktop-gpu', // DesktopGPUCompiler → standalone Rust wgpu project (Vulkan/Metal/DX12), renders the scene offscreen on the machine's own GPU; no browser, no third-party engine. Verified on Jetson Orin/Vulkan.
  'pathtrace', // PathTracerCompiler → standalone Rust wgpu COMPUTE path tracer (cosine-weighted GI, emissive area lights, multi-sample) → tonemapped PNG; our own tracer, no Cycles/OptiX. Verified on Jetson Orin/Vulkan.
  'pathtrace-cpu', // CpuPathTracer → the no-GPU fallback: pure-TS CPU path tracer (same algorithm + shared scene extraction) → PNG. Runs offline GI anywhere Node/JS runs (server/CI/old device). The "runs anywhere / no-WebGPU compute fallback" gap.
  'media', // MediaPipelineCompiler → renders an animated turntable of the scene (CPU) and encodes it to an APNG with our OWN encoder (node:zlib only, no ffmpeg/codec/muxer). The video/media-pipeline gap; a moving picture from a .holo.
  'physics-sim', // ComputePhysicsCompiler → WGSL COMPUTE rigid-body solver (gravity + sphere/sphere + sphere/AABB collisions, restitution, double-buffered) that steps on the GPU + renders the settled state. Our own solver, no third-party physics engine. Consumes the collider vocabulary; the DYNAMICS layer on top of PhysicsColliderCompiler. Verified on Jetson Orin/Vulkan.
  'character-webgpu', // CharacterWebGPUCompiler → authored .holo character → CharacterDrawSpec run by our renderCharacter (sovereign skinned-character path)
  'nir', // NIRCompiler → our Neuromorphic IR; NIRToWGSLCompiler runs it on our WebGPU path
  'canvas2d-game', // Canvas2DGameCompiler → self-contained canvas game runtime (loop/physics/WebAudio)
  'tsl', // Trait Shader Language — our trait-to-shader codegen
  'wasm', // compiler-wasm Rust front-end → our own WASM artifact
  'sdk', // SDKCompiler -> typed client source from service-contract AST; no third-party generator
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
  'mjcf', // MuJoCo MJCF XML consumed by the MuJoCo physics engine
  'mjx', // MuJoCo MJX (JAX) differentiable-physics env — consumed by the jax + mujoco.mjx runtimes
  'embodied-dataset', // Embodied-AI dataset generator (Python) — runs on mujoco + h5py/pyarrow/tf-datasets; emits RLDS|LeRobot|HDF5
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
  'usd',
  'usdz',
  'fmu',
  'dtdl',
  'a2a-agent-card',
  'agent-inference', // Runnable agent scripts consumed by Node/Python + model/provider runtimes
  'omnigent-agent-yaml', // Omnigent agent YAML bridge plus HoloScript projection receipt
  'daimon-seed', // Seed-only Daimon IR consumed by identity/emergence runtimes; soul stays runtime-only
  'openxr-spatial-entities',
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
  'mcp-server', // MCP server module/manifest — consumed by a TypeScript/MCP server runtime
] as const satisfies readonly ExportTarget[];

/**
 * NATIVE compile MODES — sovereign, but transforms/orchestrators rather than a render/runtime
 * engine (so counted separately from "engines" in promotion surfaces). `multi-layer` currently
 * delegates its VR slice to the Babylon bridge — see MultiLayerCompiler (partial).
 */
export const NATIVE_COMPILE_MODES = [
  'llama-server', // HoloLlama authoring mode: llama.cpp launch/service/registry bundle for owned local runtime nodes
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
  {
    id: 'spatial-audio',
    name: 'SpatialAudioCompiler',
    file: 'packages/core/src/compiler/SpatialAudioCompiler.ts',
    kind: 'compiler',
    maturity: 'real',
    tests: true,
    promoted: false,
    note: 'The audio peer of WebGPU: emits our OWN Web Audio graph (HRTF PannerNode + Convolver reverb from synthesized rt60 impulses + directivity/occlusion/portal filters) from @audio_source/@audio_listener/@reverb_zone/@audio_material/@audio_occlusion/@audio_portal traits. Sovereign — no FMOD/Wwise/Resonance. Fills the #1 spatial-computing gap (no audio compiler existed).',
  },
  {
    id: 'desktop-gpu',
    name: 'DesktopGPUCompiler',
    file: 'packages/core/src/compiler/DesktopGPUCompiler.ts',
    kind: 'compiler',
    maturity: 'real',
    tests: true,
    promoted: false,
    note: 'Sovereign native-desktop GPU: emits a self-contained Rust wgpu project (Vulkan/Metal/DX12) that renders the scene offscreen to a PNG on the machine\'s OWN GPU — standalone, no browser, no third-party engine. WebGPU is browser/runtime-bound; this is the "runs standalone at native perf" gap. Matrices computed in the compiler; geometry generators + wgpu host emitted. VERIFIED on real hardware: Jetson Orin (Tegra) via Vulkan rendered a 6-object scene offscreen to PNG (adapter=NVIDIA Tegra Orin, backend=Vulkan). Consumes the same geometry-registry + geometry-purpose vocabulary as render/physics/audio.',
  },
  {
    id: 'path-tracer',
    name: 'PathTracerCompiler',
    file: 'packages/core/src/compiler/PathTracerCompiler.ts',
    kind: 'compiler',
    maturity: 'real',
    tests: true,
    promoted: false,
    note: 'Sovereign OFFLINE path-traced render — the film-grade-still gap the rasterizers (WebGPU/desktop-gpu) do not fill. Emits a self-contained Rust wgpu COMPUTE program: our OWN GPU path tracer (no Cycles/OptiX) that traces cosine-weighted diffuse bounces against analytic sphere/box primitives, accumulates many samples, and tonemaps to PNG. Global illumination — soft shadows, colour bleeding, emissive area lights. VERIFIED on Jetson Orin (Tegra/Vulkan): a Cornell-box scene rendered with visible GI colour-bleed + soft shadows. Fifth consumer of the shared geometry-registry + geometry-purpose vocabulary.',
  },
  {
    id: 'cpu-path-tracer',
    name: 'CpuPathTracer',
    file: 'packages/core/src/compiler/CpuPathTracer.ts',
    kind: 'runtime',
    maturity: 'real',
    tests: true,
    promoted: false,
    note: 'The sovereign no-GPU FALLBACK: a pure-TypeScript CPU path tracer that RUNS (not emits) the same GI algorithm as PathTracerCompiler, sharing extractRaytraceScene so the two render the same scene. Renders offline global-illumination stills anywhere Node/JS runs — server, CI, old device, no WebGPU/GPU needed. Ships its own PNG encoder (node:zlib), zero deps. Fills the "runs anywhere / no-WebGPU compute fallback" gap the audit named (compiler-wasm is a parser, not a compute backend).',
  },
  {
    id: 'media-pipeline',
    name: 'MediaPipelineCompiler',
    file: 'packages/core/src/compiler/MediaPipelineCompiler.ts',
    kind: 'runtime',
    maturity: 'real',
    tests: true,
    promoted: false,
    note: 'The sovereign VIDEO / media-pipeline: renders an animated turntable of the scene (orbiting camera, fast CPU flat projector over the shared raytrace-scene extraction) and encodes the frame sequence to an APNG with our OWN encoder (acTL/fcTL/fdAT via node:zlib) — no ffmpeg / codec / muxer dependency. A moving picture from a .holo, runs anywhere Node runs. Fills the media-pipeline gap the audit named; browser-native WebCodecs H.264/WebM is the follow-on encode path.',
  },
  {
    id: 'compute-physics',
    name: 'ComputePhysicsCompiler',
    file: 'packages/core/src/compiler/ComputePhysicsCompiler.ts',
    kind: 'compiler',
    maturity: 'real',
    tests: true,
    promoted: false,
    note: 'The sovereign GPU rigid-body SIMULATION — the dynamics layer PhysicsColliderCompiler was missing. Emits a Rust wgpu program with a WGSL COMPUTE solver: gravity + sphere/sphere + sphere/static-AABB collisions with restitution + friction, double-buffered (gather, race-free), stepped N times on the GPU; then renders the settled state to PNG. Our own solver, no third-party physics engine. One .holo drives BOTH render and sim (Grok + Claude converged design). Dynamic bodies = @rigid_body spheres; statics = scene boxes. VERIFIED on Jetson Orin (Tegra/Vulkan): spheres dropped above a floor fall, collide and settle. Hooks the physics-discovery / provenance goals.',
  },
] as const;

export type SovereignEngine = (typeof SOVEREIGN_ENGINES)[number];
