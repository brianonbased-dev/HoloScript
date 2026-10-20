/**
 * target-tiers.ts — how ready each export target is, as evidence a test checks.
 *
 * WHY THIS EXISTS (founder 2026-10-05, task_1791240203223_t0bw; outside review "make the vision
 * progressively trustworthy"): HoloScript lists ~60 export targets as if they were equal. They are
 * not. Android and Quest have apps proven on real hardware; most targets have unit tests and have
 * never been shown running in the engine they emit for; a few have no test at all. Before this
 * module the only maturity data was SOVEREIGN_ENGINES (sovereign-targets.ts), where every entry
 * says `maturity: 'real'` — one tier, so it could not tell anyone anything.
 *
 * A tier here is EARNED, not declared. Each entry names the files that prove it (compiler, tests,
 * golden test, a quote from a runtime/device proof, a reference app), and `auditTargetTiers`
 * checks those files: they must exist, a test must name the compiler it claims to test, a golden
 * test on core's known-failures list does not count, a proof quote must still be in its file, and
 * the declared tier must EQUAL the tier the evidence earns. Overclaiming fails, and so does
 * underclaiming (a label that sits below its evidence is stale). The unit test runs the audit on
 * the real repo, so a deleted proof or a broken golden test turns the label check red.
 *
 * The ladder (each rung needs everything below it):
 *   experimental — compiler code exists; no test exercises it.
 *   preview      — at least one test names and exercises the compiler.
 *   production   — plus a passing golden test pinning its output, and a proof that the real build
 *                  tool or engine consumed that output.
 *   reference    — plus a reference app the golden test anchors to, proven on a real device.
 * Off the ladder:
 *   format-only  — has tests, but writes a description/manifest/metadata for another system;
 *                  there is no program to run, so "does it run" is not the question.
 *
 * `satisfies Record<ExportTarget, TargetTierEntry>` makes a NEW ExportTarget without a tier a
 * compile error, the same "a new target cannot stay invisible" rule sovereign-targets.ts uses.
 * Next slice (same task): a trait-by-target support matrix.
 */

import type { ExportTarget } from './CircuitBreaker';

export type TargetTier = 'reference' | 'production' | 'preview' | 'experimental' | 'format-only';

/** Plain-language meaning of each tier, for people who will never read the code. */
export const TIER_MEANING: Readonly<Record<TargetTier, string>> = {
  reference:
    'Proven on a real device. Its output is pinned byte-for-byte to a reference app that every change is checked against.',
  production:
    'Its output is pinned by a passing golden test, and a real build tool or engine has accepted it. Not yet proven on a device.',
  preview:
    'Tests check the code, but nothing here shows its output running in the real engine yet.',
  experimental: 'The code exists, but no test checks it yet.',
  'format-only':
    'Writes a description or manifest for another system to read. There is no program to run.',
};

export interface TargetRuntimeProof {
  /** Repo-relative file recording that the real tool/engine/device consumed the output. */
  readonly file: string;
  /** Exact text that must still be present in `file`; if it is edited away the tier drops. */
  readonly quote: string;
  /** True only when the output ran on real hardware (not just a build). */
  readonly onDevice: boolean;
}

export interface TargetTierEntry {
  readonly tier: TargetTier;
  /** Repo-relative path of the compiler/emitter for this target. */
  readonly compiler: string;
  /** Repo-relative test files that name and exercise the compiler. */
  readonly tests: readonly string[];
  /** Repo-relative golden/snapshot test that pins the emitted output. */
  readonly golden?: string;
  readonly runtimeProof?: TargetRuntimeProof;
  /** Repo-relative reference-app directory the golden test anchors to. */
  readonly referenceApp?: string;
  /** Plain-language gap the evidence fields cannot express. */
  readonly knownGaps?: string;
}

export const TARGET_TIERS = {
  urdf: {
    tier: 'preview',
    compiler: 'packages/core/src/compiler/URDFCompiler.ts',
    tests: [
      'packages/core/src/compiler/URDFCompiler.test.ts',
      'packages/core/src/compiler/__tests__/URDFCompiler.test.ts',
      'packages/core/src/compiler/__tests__/URDFCompiler.v2.test.ts',
    ],
    golden: 'packages/core/src/compiler/__tests__/golden-output/golden.test.ts',
  },
  sdf: {
    tier: 'preview',
    compiler: 'packages/core/src/compiler/SDFCompiler.ts',
    tests: [
      'packages/core/src/compiler/SDFCompiler.test.ts',
      'packages/core/src/compiler/__tests__/SDFCompiler.test.ts',
      'packages/core/src/compiler/__tests__/SDFCompiler.prod.test.ts',
    ],
    golden: 'packages/core/src/compiler/__tests__/golden-output/golden.test.ts',
  },
  mjcf: {
    tier: 'preview',
    compiler: 'packages/core/src/compiler/MJCFCompiler.ts',
    tests: ['packages/core/src/compiler/__tests__/MJCFCompiler.test.ts'],
  },
  mjx: {
    tier: 'preview',
    compiler: 'packages/core/src/compiler/MJXCompiler.ts',
    tests: ['packages/core/src/compiler/__tests__/MJXCompiler.test.ts'],
  },
  'embodied-dataset': {
    tier: 'preview',
    compiler: 'packages/core/src/compiler/EmbodiedDatasetCompiler.ts',
    tests: ['packages/core/src/compiler/__tests__/EmbodiedDatasetCompiler.test.ts'],
  },
  unity: {
    tier: 'preview',
    compiler: 'packages/core/src/compiler/UnityCompiler.ts',
    tests: [
      'packages/core/src/compiler/__tests__/UnityCompiler.test.ts',
      'packages/core/src/compiler/__tests__/UnityCompiler.prod.test.ts',
    ],
    golden: 'packages/core/src/compiler/__tests__/golden-output/golden.test.ts',
  },
  unreal: {
    tier: 'preview',
    compiler: 'packages/core/src/compiler/UnrealCompiler.ts',
    tests: [
      'packages/core/src/compiler/UnrealCompiler.test.ts',
      'packages/core/src/compiler/__tests__/UnrealCompiler.test.ts',
      'packages/core/src/compiler/__tests__/UnrealCompiler.prod.test.ts',
    ],
  },
  'pcg-graph': {
    tier: 'preview',
    compiler: 'packages/core/src/compiler/PCGGraphCompiler.ts',
    tests: ['packages/core/src/compiler/__tests__/PCGGraphCompiler.test.ts'],
  },
  godot: {
    tier: 'preview',
    compiler: 'packages/core/src/compiler/GodotCompiler.ts',
    tests: [
      'packages/core/src/compiler/__tests__/GodotCompiler.test.ts',
      'packages/core/src/compiler/__tests__/GodotCompiler.prod.test.ts',
    ],
  },
  vrchat: {
    tier: 'preview',
    compiler: 'packages/core/src/compiler/VRChatCompiler.ts',
    tests: [
      'packages/core/src/compiler/VRChatCompiler.test.ts',
      'packages/core/src/compiler/__tests__/VRChatCompiler.test.ts',
      'packages/core/src/compiler/__tests__/VRChatCompiler.byte.test.ts',
    ],
  },
  openxr: {
    tier: 'preview',
    compiler: 'packages/core/src/compiler/OpenXRCompiler.ts',
    tests: [
      'packages/core/src/compiler/__tests__/OpenXRCompiler.test.ts',
      'packages/core/src/compiler/__tests__/OpenXRCompiler.prod.test.ts',
    ],
  },
  android: {
    tier: 'reference',
    compiler: 'packages/core/src/compiler/AndroidCompiler.ts',
    tests: [
      'packages/core/src/compiler/AndroidCompiler.test.ts',
      'packages/core/src/compiler/__tests__/AndroidCompiler.test.ts',
      'packages/core/src/compiler/__tests__/AndroidCompiler.prod.test.ts',
    ],
    golden: 'packages/core/src/compiler/__tests__/AndroidCompiler.golden.test.ts',
    runtimeProof: {
      file: 'apps/android-reference/README.md',
      quote: 'the APK installs and runs a live ARCore session',
      onDevice: true,
    },
    referenceApp: 'apps/android-reference/android',
  },
  'android-xr': {
    tier: 'production',
    compiler: 'packages/core/src/compiler/AndroidXRCompiler.ts',
    tests: [
      'packages/core/src/compiler/__tests__/AndroidXRCompiler.test.ts',
      'packages/core/src/compiler/__tests__/AndroidXRCompiler.prod.test.ts',
      'packages/core/src/compiler/__tests__/AndroidXRCompiler.golden.test.ts',
    ],
    golden: 'packages/core/src/compiler/__tests__/AndroidXRCompiler.golden.test.ts',
    referenceApp: 'apps/android-xr-reference/android-xr',
    runtimeProof: {
      file: 'apps/android-xr-reference/README.md',
      quote: 'The Gradle build harness is real and works end-to-end',
      onDevice: false,
    },
  },
  ios: {
    tier: 'preview',
    compiler: 'packages/core/src/compiler/IOSCompiler.ts',
    tests: [
      'packages/core/src/compiler/IOSCompiler.test.ts',
      'packages/core/src/compiler/IOSCompiler.lidar.test.ts',
      'packages/core/src/compiler/__tests__/IOSCompiler.test.ts',
    ],
  },
  visionos: {
    tier: 'preview',
    compiler: 'packages/core/src/compiler/VisionOSCompiler.ts',
    tests: [
      'packages/core/src/compiler/__tests__/VisionOSCompiler.test.ts',
      'packages/core/src/compiler/__tests__/VisionOSCompiler.prod.test.ts',
      'packages/core/src/compiler/__tests__/VisionOSCompiler.smoke.test.ts',
    ],
  },
  r3f: {
    tier: 'preview',
    compiler: 'packages/core/src/compiler/SceneIRTsxEmitter.ts',
    tests: ['packages/core/src/compiler/__tests__/SceneIRTsxEmitter.test.ts'],
  },
  webgpu: {
    tier: 'preview',
    compiler: 'packages/core/src/compiler/WebGPUCompiler.ts',
    tests: [
      'packages/core/src/compiler/WebGPUCompiler.test.ts',
      'packages/core/src/compiler/__tests__/WebGPUCompiler.test.ts',
      'packages/core/src/compiler/__tests__/WebGPUCompiler.prod.test.ts',
    ],
    golden: 'packages/core/src/compiler/__tests__/golden-output/golden.test.ts',
  },
  audio: {
    tier: 'preview',
    compiler: 'packages/core/src/compiler/SpatialAudioCompiler.ts',
    tests: ['packages/core/src/compiler/SpatialAudioCompiler.test.ts'],
  },
  'desktop-gpu': {
    tier: 'preview',
    compiler: 'packages/core/src/compiler/DesktopGPUCompiler.ts',
    tests: ['packages/core/src/compiler/DesktopGPUCompiler.test.ts'],
  },
  pathtrace: {
    tier: 'preview',
    compiler: 'packages/core/src/compiler/PathTracerCompiler.ts',
    tests: ['packages/core/src/compiler/PathTracerCompiler.test.ts'],
  },
  'pathtrace-cpu': {
    tier: 'preview',
    compiler: 'packages/core/src/compiler/CpuPathTracer.ts',
    tests: ['packages/core/src/compiler/CpuPathTracer.test.ts'],
  },
  media: {
    tier: 'preview',
    compiler: 'packages/core/src/compiler/MediaPipelineCompiler.ts',
    tests: ['packages/core/src/compiler/MediaPipelineCompiler.test.ts'],
  },
  'physics-sim': {
    tier: 'preview',
    compiler: 'packages/core/src/compiler/ComputePhysicsCompiler.ts',
    tests: ['packages/core/src/compiler/ComputePhysicsCompiler.test.ts'],
  },
  'character-webgpu': {
    tier: 'preview',
    compiler: 'packages/core/src/compiler/CharacterWebGPUCompiler.ts',
    tests: ['packages/core/src/compiler/__tests__/CharacterWebGPUCompiler.test.ts'],
  },
  wasm: {
    tier: 'preview',
    compiler: 'packages/core/src/compiler/WASMCompiler.ts',
    tests: [
      'packages/core/src/compiler/WASMCompiler.test.ts',
      'packages/core/src/compiler/__tests__/WASMCompiler.test.ts',
      'packages/core/src/compiler/__tests__/WASMCompiler.prod.test.ts',
    ],
    golden: 'packages/core/src/compiler/__tests__/golden-output/golden.test.ts',
  },
  sdk: {
    tier: 'preview',
    compiler: 'packages/core/src/compiler/SDKCompiler.ts',
    tests: ['packages/core/src/compiler/__tests__/SDKCompiler.test.ts'],
  },
  usd: {
    tier: 'preview',
    compiler: 'packages/core/src/compiler/USDPhysicsCompiler.ts',
    tests: [
      'packages/core/src/compiler/USDPhysicsCompiler.test.ts',
      'packages/core/src/compiler/__tests__/USDPhysicsCompiler.test.ts',
      'packages/core/src/compiler/__tests__/USDPhysicsCompiler.prod.test.ts',
    ],
  },
  usdz: {
    tier: 'preview',
    compiler: 'packages/core/src/compiler/USDZExportCompiler.ts',
    tests: ['packages/core/src/compiler/__tests__/VisionOSCompiler.smoke.test.ts'],
  },
  fmu: {
    tier: 'preview',
    compiler: 'packages/core/src/compiler/FMUCompiler.ts',
    tests: ['packages/core/src/compiler/__tests__/FMUCompiler.test.ts'],
  },
  dtdl: {
    tier: 'format-only',
    compiler: 'packages/core/src/compiler/DTDLCompiler.ts',
    tests: [
      'packages/core/src/compiler/DTDLCompiler.test.ts',
      'packages/core/src/compiler/__tests__/DTDLCompiler.test.ts',
      'packages/core/src/compiler/__tests__/DTDLCompiler.prod.test.ts',
    ],
  },
  'multi-layer': {
    tier: 'preview',
    compiler: 'packages/core/src/compiler/MultiLayerCompiler.ts',
    tests: ['packages/core/src/compiler/__tests__/MultiLayerCompiler.test.ts'],
    knownGaps: 'Its VR layer still hands off to the Babylon bridge.',
  },
  incremental: {
    tier: 'preview',
    compiler: 'packages/core/src/compiler/IncrementalCompiler.ts',
    tests: [
      'packages/core/src/compiler/IncrementalCompiler.test.ts',
      'packages/core/src/__tests__/compiler/IncrementalCompiler.test.ts',
      'packages/core/src/compiler/__tests__/IncrementalCompiler.test.ts',
    ],
  },
  state: {
    tier: 'preview',
    compiler: 'packages/core/src/compiler/StateCompiler.ts',
    tests: ['packages/core/src/compiler/__tests__/StateCompiler.prod.test.ts'],
  },
  'trait-composition': {
    tier: 'preview',
    compiler: 'packages/core/src/compiler/TraitCompositionCompiler.ts',
    tests: ['packages/core/src/compiler/__tests__/TraitCompositionCompiler.prod.test.ts'],
  },
  tsl: {
    tier: 'preview',
    compiler: 'packages/core/src/compiler/TSLCompiler.ts',
    tests: [
      'packages/core/src/compiler/TSLCompiler.test.ts',
      'packages/core/src/compiler/__tests__/TSLCompiler.test.ts',
    ],
  },
  'a2a-agent-card': {
    tier: 'format-only',
    compiler: 'packages/core/src/compiler/A2AAgentCardCompiler.ts',
    tests: ['packages/core/src/compiler/__tests__/A2AAgentCardCompiler.test.ts'],
  },
  'agent-inference': {
    tier: 'preview',
    compiler: 'packages/core/src/compiler/AgentInferenceExportTarget.ts',
    tests: ['packages/core/src/compiler/__tests__/AgentInferenceExportTarget.test.ts'],
  },
  'omnigent-agent-yaml': {
    tier: 'format-only',
    compiler: 'packages/core/src/compiler/OmnigentAgentYamlCompiler.ts',
    tests: ['packages/core/src/compiler/__tests__/OmnigentAgentYamlCompiler.test.ts'],
  },
  'daimon-seed': {
    tier: 'format-only',
    compiler: 'packages/core/src/compiler/DaimonSeedCompiler.ts',
    tests: ['packages/core/src/compiler/__tests__/DaimonSeedCompiler.test.ts'],
  },
  nir: {
    tier: 'preview',
    compiler: 'packages/core/src/compiler/NIRCompiler.ts',
    tests: ['packages/core/src/compiler/__tests__/NIRCompiler.test.ts'],
  },
  'openxr-spatial-entities': {
    tier: 'preview',
    compiler: 'packages/core/src/compiler/OpenXRSpatialEntitiesCompiler.ts',
    tests: ['packages/core/src/compiler/__tests__/OpenXRSpatialEntitiesCompiler.test.ts'],
  },
  'canvas2d-game': {
    tier: 'preview',
    compiler: 'packages/core/src/compiler/Canvas2DGameCompiler.ts',
    tests: ['packages/core/src/compiler/__tests__/Canvas2DGameCompiler.test.ts'],
  },
  '3dgs': {
    tier: 'preview',
    compiler: 'packages/core/src/compiler/GaussianSplattingCompiler.ts',
    tests: [
      'packages/core/src/compiler/__tests__/GaussianSplattingCompiler.test.ts',
      'packages/core/src/compiler/__tests__/GaussianSplattingCompiler.sharedSort.test.ts',
    ],
  },
  '3dtiles': {
    tier: 'format-only',
    compiler: 'packages/core/src/compiler/ThreeDTilesCompiler.ts',
    tests: ['packages/core/src/compiler/__tests__/ThreeDTilesCompiler.test.ts'],
  },
  'gaussian-train': {
    tier: 'preview',
    compiler: 'packages/core/src/compiler/GaussianTrainCompiler.ts',
    tests: ['packages/core/src/compiler/__tests__/GaussianTrainCompiler.test.ts'],
  },
  'code-editor': {
    tier: 'experimental',
    compiler: 'packages/core/src/compiler/CodeEditorCompiler.ts',
    tests: [],
  },
  svg: {
    tier: 'preview',
    compiler: 'packages/core/src/compiler/SVGCompiler.ts',
    tests: ['packages/core/src/compiler/__tests__/SVGCompiler.test.ts'],
  },
  holob: {
    // The holo-vm tests run hand-built bytecode; none of them call HolobCompiler.
    tier: 'experimental',
    compiler: 'packages/core/src/compiler/HolobCompiler.ts',
    tests: [],
  },
  openapi: {
    tier: 'experimental',
    compiler: 'packages/core/src/compiler/OpenAPICompiler.ts',
    tests: [],
  },
  onnx: {
    tier: 'experimental',
    compiler: 'packages/core/src/compiler/ONNXCompiler.ts',
    tests: [],
  },
  flutter: {
    tier: 'preview',
    compiler: 'packages/core/src/compiler/FlutterCompiler.ts',
    tests: ['packages/core/src/compiler/__tests__/FlutterCompiler.test.ts'],
  },
  'stl-export': {
    tier: 'experimental',
    compiler: 'packages/core/src/compiler/STLExportCompiler.ts',
    tests: [],
  },
  'lens-studio': {
    tier: 'preview',
    compiler: 'packages/core/src/compiler/LensStudioCompiler.ts',
    tests: ['packages/core/src/compiler/__tests__/LensStudioCompiler.test.ts'],
  },
  colyseus: {
    tier: 'preview',
    compiler: 'packages/core/src/compiler/ColyseusCompiler.ts',
    tests: ['packages/core/src/compiler/__tests__/ColyseusCompiler.test.ts'],
  },
  'ai-glasses': {
    tier: 'preview',
    compiler: 'packages/core/src/compiler/AIGlassesCompiler.ts',
    tests: ['packages/core/src/compiler/__tests__/AIGlassesCompiler.test.ts'],
  },
  scm: {
    tier: 'format-only',
    compiler: 'packages/core/src/compiler/SCMCompiler.ts',
    tests: [
      'packages/core/src/compiler/__tests__/SCMCompiler.test.ts',
      'packages/core/src/compiler/__tests__/SCMCompiler-Privacy.test.ts',
      'packages/core/src/compiler/__tests__/SCMCompiler-Affective.test.ts',
    ],
  },
  'nft-marketplace': {
    // Not format-only: it emits Solidity contracts and deploy scripts, programs that move value.
    tier: 'preview',
    compiler: 'packages/core/src/compiler/NFTMarketplaceCompiler.ts',
    tests: ['packages/core/src/compiler/__tests__/NFTMarketplaceCompiler.test.ts'],
  },
  edge: {
    tier: 'preview',
    compiler: 'packages/core/src/compiler/EdgeCompiler.ts',
    tests: ['packages/core/src/compiler/__tests__/EdgeCompiler.test.ts'],
  },
  'llama-server': {
    tier: 'preview',
    compiler: 'packages/core/src/compiler/LlamaServerCompiler.ts',
    tests: [
      'packages/core/src/compiler/__tests__/LlamaServerCompiler.test.ts',
      'packages/core/src/compiler/__tests__/LlamaServerCompiler.trace.test.ts',
    ],
  },
  'bot-swarm': {
    tier: 'preview',
    compiler: 'packages/core/src/compiler/BotSwarmCompiler.ts',
    tests: ['packages/core/src/compiler/__tests__/BotSwarmCompiler.test.ts'],
  },
  'dungeon-instance': {
    tier: 'preview',
    compiler: 'packages/core/src/compiler/DungeonInstancePoolCompiler.ts',
    tests: ['packages/core/src/compiler/__tests__/DungeonInstancePoolCompiler.test.ts'],
  },
  'world-shard': {
    tier: 'preview',
    compiler: 'packages/core/src/compiler/ShardRegistryCompiler.ts',
    tests: ['packages/core/src/compiler/__tests__/ShardRegistryCompiler.test.ts'],
  },
  'mcp-server': {
    tier: 'preview',
    compiler: 'packages/core/src/compiler/HoloMCPCompiler.ts',
    tests: ['packages/core/src/compiler/__tests__/HoloMCPCompiler.test.ts'],
  },
  quest: {
    // Not reference yet. The build that runs on Quest 3 (apps/quest-universal-qr-scanner/android-mr,
    // RELEASE.md "installed and running on Quest 3") is byte-checked only by the pre-commit script
    // scripts/holo-ci/check-quest-mr-emit-matches-reference.mts. The core golden test pins the
    // older 2D panel app (…/android), for which no device or build proof is recorded here. A core
    // test that byte-compares QuestCompiler's mr output to android-mr would earn reference.
    tier: 'preview',
    compiler: 'packages/core/src/compiler/QuestCompiler.ts',
    tests: [
      'packages/core/src/compiler/__tests__/QuestCompiler.mr.test.ts',
      'packages/core/src/compiler/__tests__/QuestCompiler.golden.test.ts',
      'packages/core/src/compiler/__tests__/QuestCompiler.reader.test.ts',
    ],
    golden: 'packages/core/src/compiler/__tests__/QuestCompiler.golden.test.ts',
    referenceApp: 'apps/quest-universal-qr-scanner/android',
    knownGaps:
      'The headset build is checked only by a pre-commit script; the core golden test pins the older 2D panel app, which has no recorded device run.',
  },
} as const satisfies Record<ExportTarget, TargetTierEntry>;

const LADDER: readonly TargetTier[] = ['experimental', 'preview', 'production', 'reference'];

/** Files the audit may read, injected so this module stays free of `fs` (core runs in browsers). */
export interface TierAuditIO {
  exists(repoRelativePath: string): boolean;
  read(repoRelativePath: string): string;
  /**
   * Repo-relative test files on core's known-failures list (packages/core/test-baseline.json).
   * The test gate ignores failures there, so a golden test listed there pins nothing.
   */
  knownFailingTests: ReadonlySet<string>;
}

/** Characters that continue a path; '.' is left out so a path can end a sentence. */
const PATH_CHAR = /[A-Za-z0-9_/-]/;

/**
 * True when `text` imports the real module whose file name is `name` (with or without an
 * extension). A file that vi.mock()s that module gets a stand-in, so it does not count.
 */
function importsModule(text: string, name: string): boolean {
  let imported = false;
  for (const quote of ["'", '"']) {
    for (const ext of ['', '.js', '.ts', '.mjs', '.mts']) {
      const tail = `/${name}${ext}${quote}`;
      let from = 0;
      for (;;) {
        const at = text.indexOf(tail, from);
        if (at < 0) break;
        const lineStart = text.lastIndexOf('\n', at) + 1;
        if (/\bmock\(\s*['"][^'"]*$/.test(text.slice(lineStart, at))) return false;
        imported = true;
        from = at + 1;
      }
    }
  }
  return imported;
}

/**
 * True when `text` names `path` as a whole path: 'apps/x/android' does not match inside
 * 'apps/x/android-mr', and 'apps/x' does not match inside 'apps/x/android' (the prefix trap that
 * let Quest's 2D-panel golden test vouch for the headset build).
 */
function namesExactPath(text: string, path: string): boolean {
  let from = 0;
  for (;;) {
    const at = text.indexOf(path, from);
    if (at < 0) return false;
    const next = text.charAt(at + path.length);
    if (next === '' || !PATH_CHAR.test(next)) return true;
    from = at + 1;
  }
}

function compilerName(entry: TargetTierEntry): string {
  const base = entry.compiler.split('/').pop() ?? entry.compiler;
  return base.replace(/\.tsx?$/, '');
}

/**
 * The tier the evidence fields earn. It trusts the fields; `auditTargetTiers` is what checks
 * them against the files (and the unit test runs that audit on every core test run).
 */
export function earnedTier(entry: TargetTierEntry): TargetTier {
  if (entry.tests.length === 0) return 'experimental';
  if (!entry.golden || !entry.runtimeProof) return 'preview';
  if (entry.referenceApp && entry.runtimeProof.onDevice) return 'reference';
  return 'production';
}

/**
 * Check every entry against the files it names. Returns one plain sentence per problem; an empty
 * list means every label is exactly what its evidence earns.
 */
export function auditTargetTiers(
  io: TierAuditIO,
  tiers: Readonly<Record<string, TargetTierEntry>> = TARGET_TIERS
): string[] {
  const problems: string[] = [];
  for (const [target, entry] of Object.entries(tiers)) {
    const name = compilerName(entry);
    if (!io.exists(entry.compiler)) {
      problems.push(`${target}: compiler file ${entry.compiler} does not exist.`);
    }
    for (const test of entry.tests) {
      if (!io.exists(test)) {
        problems.push(`${target}: test ${test} does not exist.`);
      } else if (!importsModule(io.read(test), name)) {
        // A mention in a comment or a vi.mock of the name exercises nothing; an import does.
        problems.push(
          `${target}: test ${test} never imports ${name}, so it does not test this target.`
        );
      }
    }
    if (entry.golden) {
      if (!io.exists(entry.golden)) {
        problems.push(`${target}: golden test ${entry.golden} does not exist.`);
      } else {
        const text = io.read(entry.golden);
        if (!text.includes(name) && !text.includes(`'${target}'`)) {
          problems.push(`${target}: golden test ${entry.golden} never names ${name}.`);
        }
        if (io.knownFailingTests.has(entry.golden)) {
          problems.push(
            `${target}: golden test ${entry.golden} is on core's known-failures list, so it pins nothing; fix it or drop it from this entry.`
          );
        }
        if (entry.referenceApp && !namesExactPath(text, entry.referenceApp)) {
          problems.push(
            `${target}: golden test ${entry.golden} does not compare against ${entry.referenceApp}.`
          );
        }
      }
    }
    if (entry.runtimeProof) {
      const { file, quote } = entry.runtimeProof;
      if (!io.exists(file)) {
        problems.push(`${target}: runtime proof ${file} does not exist.`);
      } else if (!io.read(file).includes(quote)) {
        problems.push(`${target}: runtime proof ${file} no longer says "${quote}".`);
      }
    }
    if (entry.referenceApp && !io.exists(entry.referenceApp)) {
      problems.push(`${target}: reference app ${entry.referenceApp} does not exist.`);
    }

    const earned = earnedTier(entry);
    if (entry.tier === 'format-only') {
      if (earned === 'experimental') {
        problems.push(`${target}: labelled format-only but no test checks it; it is experimental.`);
      }
    } else if (entry.tier !== earned) {
      const over = LADDER.indexOf(entry.tier) > LADDER.indexOf(earned);
      problems.push(
        `${target}: labelled ${entry.tier} but its evidence earns ${earned} (${over ? 'overclaim' : 'stale label'}).`
      );
    }
  }
  return problems;
}

/** The tier of a known target, or undefined for names outside the ExportTarget union. */
export function targetTier(target: string): TargetTier | undefined {
  return (TARGET_TIERS as Readonly<Record<string, TargetTierEntry>>)[target]?.tier;
}

/**
 * What a target is still missing, in plain words: the next rung's evidence plus any known gap.
 * Reads only the entry, so it works where there is no file access.
 */
export function describeTargetLimits(target: string): string {
  const entry = (TARGET_TIERS as Readonly<Record<string, TargetTierEntry>>)[target];
  if (!entry) return 'Not labelled yet: this target is outside the checked list.';
  const missing: string[] = [];
  if (entry.tier === 'experimental') {
    missing.push('no test checks this compiler');
  } else if (entry.tier === 'preview') {
    if (!entry.golden) missing.push('no golden test pins its output');
    if (!entry.runtimeProof) {
      missing.push(
        entry.golden
          ? 'a golden test pins its output, but nothing shows that output accepted by the real engine'
          : 'nothing shows its output accepted by the real engine'
      );
    }
  } else if (entry.tier === 'production') {
    if (!entry.referenceApp) missing.push('no reference app is checked against it');
    if (!entry.runtimeProof?.onDevice) missing.push('it has not been run on a real device');
  }
  const parts: string[] = [];
  if (missing.length > 0) {
    const text = missing.join('; ');
    parts.push(text.charAt(0).toUpperCase() + text.slice(1) + '.');
  }
  if (entry.knownGaps) parts.push(entry.knownGaps);
  return parts.length > 0 ? parts.join(' ') : 'No known gaps at this tier.';
}
