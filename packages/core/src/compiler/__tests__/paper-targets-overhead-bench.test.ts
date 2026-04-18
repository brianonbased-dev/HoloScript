/**
 * Paper 10 / Paper 12 — per-target compile-time provenance overhead (Phase 1–2 harness).
 *
 * - **Phase 1:** WebGPU, VRChat, Babylon, Unity, Godot, USD Physics, Unreal, glTF.
 * - **Phase 2:** PlayCanvas, Android XR, VRR (plus Phase 1). Append here as more backends
 *   gain `provenanceHash` or a small adapter for non-`CompilerBase.compile` pipelines.
 * - **Code targets** use a large multi-object `.holo` grid (see `BENCH_OBJECT_COUNT`).
 * - **glTF** uses a smaller grid (`BENCH_GLTF_OBJECT_COUNT`) — full `GLTFPipeline` is
 *   heavy (normals / LOD / skin); keep this count modest for CI runtime.
 *
 * Log freeze: paste Vitest stdout into
 *   `ai-ecosystem/research/benchmark-results-YYYY-MM-DD-paper-targets-overhead.md`
 * and/or `HoloScript/.bench-logs/<timestamp>.txt`.
 */

import { describe, it, expect, vi } from 'vitest';
import { createHash } from 'crypto';
import { HoloCompositionParser } from '../../parser/HoloCompositionParser';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';
import { WebGPUCompiler } from '../WebGPUCompiler';
import { VRChatCompiler } from '../VRChatCompiler';
import { BabylonCompiler } from '../BabylonCompiler';
import { UnityCompiler } from '../UnityCompiler';
import { GodotCompiler } from '../GodotCompiler';
import { USDPhysicsCompiler } from '../USDPhysicsCompiler';
import { UnrealCompiler } from '../UnrealCompiler';
import { GLTFPipeline } from '../GLTFPipeline';
import { PlayCanvasCompiler } from '../PlayCanvasCompiler';
import { AndroidXRCompiler } from '../AndroidXRCompiler';
import { VRRCompiler } from '../VRRCompiler';
// Phase 3 — noise-floor targets (W.067)
import { SCMCompiler } from '../SCMCompiler';
import { DTDLCompiler } from '../DTDLCompiler';
import { OpenXRCompiler } from '../OpenXRCompiler';
import { OpenXRSpatialEntitiesCompiler } from '../OpenXRSpatialEntitiesCompiler';
import { URDFCompiler } from '../URDFCompiler';
import { MCPConfigCompiler } from '../MCPConfigCompiler';
import { NIRCompiler } from '../NIRCompiler';
import { NIRToWGSLCompiler } from '../NIRToWGSLCompiler';
import { TSLCompiler } from '../TSLCompiler';
import { NFTMarketplaceCompiler } from '../NFTMarketplaceCompiler';
import { PhoneSleeveVRCompiler } from '../PhoneSleeveVRCompiler';
import { NodeServiceCompiler } from '../NodeServiceCompiler';
import { Native2DCompiler } from '../Native2DCompiler';
import { A2AAgentCardCompiler } from '../A2AAgentCardCompiler';
import { AIGlassesCompiler } from '../AIGlassesCompiler';
import { SDFCompiler } from '../SDFCompiler';
import { AndroidCompiler } from '../AndroidCompiler';
import { IOSCompiler } from '../IOSCompiler';
import { WASMCompiler } from '../WASMCompiler';
import { VisionOSCompiler } from '../VisionOSCompiler';
import { NextJSAPICompiler } from '../NextJSAPICompiler';

vi.mock('../identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../identity/AgentRBAC')>();
  return {
    ...actual,
    getRBAC: () => ({
      checkAccess: () => ({ allowed: true, agentRole: 'code_generator' }),
    }),
  };
});

const BENCH_OBJECT_COUNT = 140;
/** glTF path is CPU-heavy; keep ≤~60 for sub-minute total bench on laptops. */
const BENCH_GLTF_OBJECT_COUNT = 44;

function buildPaperTargetsFixture(objectCount: number): string {
  const lines: string[] = [
    `composition "PaperTargetsOverheadBench" {`,
    `  environment {`,
    `    skybox: "studio"`,
    `    ambient_light: 0.6`,
    `  }`,
    `  spatial_group "BenchRoot" {`,
  ];

  const inner = Math.min(objectCount, 48);
  for (let i = 0; i < inner; i++) {
    lines.push(...objectLines(i, '    '));
  }
  lines.push(`  }`);

  for (let i = inner; i < objectCount; i++) {
    lines.push(...objectLines(i, '  '));
  }

  lines.push(`}`);
  return lines.join('\n');
}

function objectLines(i: number, indent: string): string[] {
  const x = (i % 14) * 1.1;
  const z = Math.floor(i / 14) * 1.1;
  const geo = i % 3 === 0 ? 'sphere' : i % 3 === 1 ? 'cube' : 'capsule';
  const m = 0.4 + (i % 7) * 0.05;
  const y = 0.2 + (i % 5) * 0.08;
  return [
    `${indent}object "BenchObj_${i}" {`,
    `${indent}  @grabbable`,
    `${indent}  @physics(mass: ${m}, restitution: 0.35)`,
    `${indent}  geometry: "${geo}"`,
    `${indent}  position: [${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}]`,
    `${indent}}`,
  ];
}

const AGENT_TOKEN = 'paper-targets-overhead-bench';

/** Minimal VRR options — bench scene has no VRR traits; compiler still emits a valid bundle. */
const VRR_BENCH_OPTS = {
  target: 'threejs' as const,
  minify: false,
  source_maps: false,
  api_integrations: {},
  performance: { target_fps: 60, max_players: 1000, lazy_loading: true },
};

function sha256Hex(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

function medianP99(samples: number[]): { median: number; p99: number } {
  const a = [...samples].sort((x, y) => x - y);
  const n = a.length;
  const median = a[Math.floor(n / 2)];
  const p99 = a[Math.min(n - 1, Math.floor(n * 0.99))];
  return { median, p99 };
}

export type TargetCategory = 'shader-ir' | 'game-engine' | 'scene-format' | 'interchange';

interface TargetSpec {
  id: string;
  category: TargetCategory;
  provHash: string;
  compileBase: () => unknown;
  compileProv: () => unknown;
  assertProvOutput: (out: unknown, h: string) => void;
}

function parseFixture(source: string): HoloComposition {
  const parser = new HoloCompositionParser();
  const r = parser.parse(source);
  expect(r.success).toBe(true);
  return r.ast!;
}

describe('Paper 10/12 — paper-targets-overhead-bench', () => {
  it(
    'reports median/p99 compile time base vs provenance per target',
    () => {
      const astMain = parseFixture(buildPaperTargetsFixture(BENCH_OBJECT_COUNT));
      const provHashMain = sha256Hex(JSON.stringify(astMain, null, 2));
      const astGltf = parseFixture(buildPaperTargetsFixture(BENCH_GLTF_OBJECT_COUNT));
      const provHashGltf = sha256Hex(JSON.stringify(astGltf, null, 2));

      const gltfOpts = {
        format: 'gltf' as const,
        dracoCompression: false,
        quantize: true,
        prune: true,
        dedupe: true,
      };

      const TARGETS: TargetSpec[] = [
        {
          id: 'webgpu',
          category: 'shader-ir',
          provHash: provHashMain,
          compileBase: () => new WebGPUCompiler({}).compile(astMain, AGENT_TOKEN),
          compileProv: () => new WebGPUCompiler({ provenanceHash: provHashMain }).compile(astMain, AGENT_TOKEN),
          assertProvOutput: (out, h) => {
            expect(String(out)).toContain(`// Provenance Hash: ${h}`);
          },
        },
        {
          id: 'vrchat',
          category: 'game-engine',
          provHash: provHashMain,
          compileBase: () => new VRChatCompiler({}).compile(astMain, AGENT_TOKEN),
          compileProv: () => new VRChatCompiler({ provenanceHash: provHashMain }).compile(astMain, AGENT_TOKEN),
          assertProvOutput: (out, h) => {
            expect(String((out as { mainScript: string }).mainScript)).toContain(
              `// Provenance Hash: ${h}`
            );
          },
        },
        {
          id: 'babylon',
          category: 'game-engine',
          provHash: provHashMain,
          compileBase: () => new BabylonCompiler({}).compile(astMain, AGENT_TOKEN),
          compileProv: () => new BabylonCompiler({ provenanceHash: provHashMain }).compile(astMain, AGENT_TOKEN),
          assertProvOutput: (out, h) => {
            expect(String(out)).toContain(`// Provenance Hash: ${h}`);
          },
        },
        {
          id: 'unity',
          category: 'game-engine',
          provHash: provHashMain,
          compileBase: () => new UnityCompiler({}).compile(astMain, AGENT_TOKEN),
          compileProv: () => new UnityCompiler({ provenanceHash: provHashMain }).compile(astMain, AGENT_TOKEN),
          assertProvOutput: (out, h) => {
            expect(String(out)).toContain(`// Provenance Hash: ${h}`);
          },
        },
        {
          id: 'godot',
          category: 'game-engine',
          provHash: provHashMain,
          compileBase: () => new GodotCompiler({}).compile(astMain, AGENT_TOKEN),
          compileProv: () => new GodotCompiler({ provenanceHash: provHashMain }).compile(astMain, AGENT_TOKEN),
          assertProvOutput: (out, h) => {
            expect(String(out)).toContain(`# Provenance Hash: ${h}`);
          },
        },
        {
          id: 'usd-physics',
          category: 'scene-format',
          provHash: provHashMain,
          compileBase: () =>
            new USDPhysicsCompiler({ embedSemanticAST: true, targetContext: 'generic' }).compile(
              astMain,
              AGENT_TOKEN
            ),
          compileProv: () =>
            new USDPhysicsCompiler({
              embedSemanticAST: true,
              targetContext: 'generic',
              provenanceHash: provHashMain,
            }).compile(astMain, AGENT_TOKEN),
          assertProvOutput: (out, h) => {
            expect(String(out)).toContain(`# Provenance Hash: ${h}`);
          },
        },
        {
          id: 'unreal',
          category: 'game-engine',
          provHash: provHashMain,
          compileBase: () => new UnrealCompiler({ generateBlueprints: false }).compile(astMain, AGENT_TOKEN),
          compileProv: () =>
            new UnrealCompiler({ generateBlueprints: false, provenanceHash: provHashMain }).compile(
              astMain,
              AGENT_TOKEN
            ),
          assertProvOutput: (out, h) => {
            expect(String((out as { headerFile: string }).headerFile)).toContain(
              `// Provenance Hash: ${h}`
            );
          },
        },
        {
          id: 'playcanvas',
          category: 'game-engine',
          provHash: provHashMain,
          compileBase: () =>
            new PlayCanvasCompiler({ enablePhysics: false, enableXR: false }).compile(astMain, AGENT_TOKEN),
          compileProv: () =>
            new PlayCanvasCompiler({
              enablePhysics: false,
              enableXR: false,
              provenanceHash: provHashMain,
            }).compile(astMain, AGENT_TOKEN),
          assertProvOutput: (out, h) => {
            expect(String(out)).toContain(`// Provenance Hash: ${h}`);
          },
        },
        {
          id: 'android-xr',
          category: 'game-engine',
          provHash: provHashMain,
          compileBase: () =>
            new AndroidXRCompiler({
              useARCore: false,
              useFilament: false,
            }).compile(astMain, AGENT_TOKEN),
          compileProv: () =>
            new AndroidXRCompiler({
              useARCore: false,
              useFilament: false,
              provenanceHash: provHashMain,
            }).compile(astMain, AGENT_TOKEN),
          assertProvOutput: (out, h) => {
            expect(String((out as { activityFile: string }).activityFile)).toContain(
              `// Provenance Hash: ${h}`
            );
          },
        },
        {
          id: 'vrr',
          category: 'game-engine',
          provHash: provHashMain,
          compileBase: () => new VRRCompiler(VRR_BENCH_OPTS).compile(astMain, AGENT_TOKEN),
          compileProv: () =>
            new VRRCompiler({ ...VRR_BENCH_OPTS, provenanceHash: provHashMain }).compile(
              astMain,
              AGENT_TOKEN
            ),
          assertProvOutput: (out, h) => {
            expect(String((out as { code: string }).code)).toContain(`// Provenance Hash: ${h}`);
          },
        },
        {
          id: 'gltf',
          category: 'interchange',
          provHash: provHashGltf,
          compileBase: () => new GLTFPipeline(gltfOpts).compile(astGltf, AGENT_TOKEN),
          compileProv: () =>
            new GLTFPipeline({ ...gltfOpts, provenanceHash: provHashGltf }).compile(astGltf, AGENT_TOKEN),
          assertProvOutput: (out, h) => {
            const doc = (out as { json: Record<string, unknown> }).json;
            const asset = doc.asset as Record<string, unknown>;
            const extras = asset.extras as Record<string, unknown>;
            const hs = extras.holoscript as Record<string, unknown>;
            expect(hs.provenanceHash).toBe(h);
          },
        },
      ];

      const WARMUP = 8;
      const N = 24;
      console.log('\n[paper-targets-overhead-bench] === per-target provenance overhead ===');
      console.log(
        `[paper-targets-overhead-bench] objects_main=${BENCH_OBJECT_COUNT} objects_gltf=${BENCH_GLTF_OBJECT_COUNT} warmup=${WARMUP} iters=${N}`
      );
      console.log(`[paper-targets-overhead-bench] hash_main=${provHashMain.slice(0, 16)}… hash_gltf=${provHashGltf.slice(0, 16)}…`);

      let maxBaseMedian = 0;

      for (const t of TARGETS) {
        for (let w = 0; w < WARMUP; w++) {
          t.compileBase();
          t.compileProv();
        }

        const baseMs: number[] = [];
        const provMs: number[] = [];
        let lastProvOut: unknown;

        for (let i = 0; i < N; i++) {
          const t0 = performance.now();
          t.compileBase();
          baseMs.push(performance.now() - t0);
        }
        for (let i = 0; i < N; i++) {
          const t0 = performance.now();
          lastProvOut = t.compileProv();
          provMs.push(performance.now() - t0);
        }

        t.assertProvOutput(lastProvOut!, t.provHash);

        const b = medianP99(baseMs);
        const p = medianP99(provMs);
        maxBaseMedian = Math.max(maxBaseMedian, b.median);
        const overheadMed =
          b.median > 1e-6 ? ((p.median - b.median) / b.median) * 100 : 0;
        const overheadP99 =
          b.p99 > 1e-6 ? ((p.p99 - b.p99) / b.p99) * 100 : 0;
        const sumBase = baseMs.reduce((a, x) => a + x, 0);
        const sumProv = provMs.reduce((a, x) => a + x, 0);
        const overheadSum = sumBase > 1e-6 ? ((sumProv - sumBase) / sumBase) * 100 : 0;

        console.log(
          `[paper-targets-overhead-bench] ${t.id} (${t.category}) | base med=${b.median.toFixed(3)}ms p99=${b.p99.toFixed(3)}ms | prov med=${p.median.toFixed(3)}ms p99=${p.p99.toFixed(3)}ms | overhead med=${overheadMed.toFixed(2)}% p99=${overheadP99.toFixed(2)}% | Σ-run=${overheadSum.toFixed(2)}%`
        );

        expect(p.median).toBeGreaterThan(0);
      }

      console.log(
        `[paper-targets-overhead-bench] max base median=${maxBaseMedian.toFixed(3)}ms | raise BENCH_OBJECT_COUNT if code targets need >1 ms`
      );
      console.log('[paper-targets-overhead-bench] done.');
    },
    600_000
  );

  it(
    'Phase 3 — W.067 noise-floor: base compile time for remaining CompilerBase targets',
    () => {
      const astMain = parseFixture(buildPaperTargetsFixture(BENCH_OBJECT_COUNT));

      /** W.067 criterion: base median ≥ 100 ms → measurable overhead %; < 100 ms → noise-floor exclusion */
      const W067_MS = 100;
      const WARMUP = 4;
      const N = 12;

      type NoiseFloorSpec = { id: string; baseCall: () => unknown };

      const PHASE3_TARGETS: NoiseFloorSpec[] = [
        { id: 'scm',                    baseCall: () => new SCMCompiler().compile(astMain, AGENT_TOKEN) },
        { id: 'dtdl',                   baseCall: () => new DTDLCompiler().compile(astMain, AGENT_TOKEN) },
        { id: 'urdf',                   baseCall: () => new URDFCompiler().compile(astMain, AGENT_TOKEN) },
        { id: 'mcp-config',             baseCall: () => new MCPConfigCompiler().compile(astMain, AGENT_TOKEN) },
        { id: 'nir',                    baseCall: () => new NIRCompiler().compile(astMain, AGENT_TOKEN) },
        // NIRToWGSLCompiler requires a pre-built NIR graph (pipe via NIRCompiler) — excluded from direct bench
        { id: 'openxr',                 baseCall: () => new OpenXRCompiler().compile(astMain, AGENT_TOKEN) },
        { id: 'openxr-spatial',         baseCall: () => new OpenXRSpatialEntitiesCompiler().compile(astMain, AGENT_TOKEN) },
        { id: 'tsl',                    baseCall: () => new TSLCompiler().compile(astMain, AGENT_TOKEN) },
        // NFTMarketplaceCompiler requires NFT-domain AST (marketplace.contracts) — excluded from generic bench
        { id: 'node-service',           baseCall: () => new NodeServiceCompiler().compile(astMain, AGENT_TOKEN) },
        { id: 'native-2d',              baseCall: () => new Native2DCompiler().compile(astMain, AGENT_TOKEN) },
        { id: 'a2a-agent-card',         baseCall: () => new A2AAgentCardCompiler().compile(astMain, AGENT_TOKEN) },
        { id: 'ai-glasses',             baseCall: () => new AIGlassesCompiler().compile(astMain, AGENT_TOKEN) },
        { id: 'sdf',                    baseCall: () => new SDFCompiler().compile(astMain, AGENT_TOKEN) },
        { id: 'android',                baseCall: () => new AndroidCompiler().compile(astMain, AGENT_TOKEN) },
        { id: 'ios',                    baseCall: () => new IOSCompiler().compile(astMain, AGENT_TOKEN) },
        { id: 'wasm',                   baseCall: () => new WASMCompiler().compile(astMain, AGENT_TOKEN) },
        { id: 'vision-os',              baseCall: () => new VisionOSCompiler().compile(astMain, AGENT_TOKEN) },
        { id: 'nextjs-api',             baseCall: () => new NextJSAPICompiler().compile(astMain, AGENT_TOKEN) },
      ];

      console.log('\n[paper-targets-overhead-bench/phase3] === W.067 noise-floor analysis ===');
      console.log(
        `[paper-targets-overhead-bench/phase3] targets=${PHASE3_TARGETS.length} threshold=${W067_MS}ms warmup=${WARMUP} iters=${N} objects=${BENCH_OBJECT_COUNT}`
      );

      const belowFloor: string[] = [];
      const aboveFloor: string[] = [];

      for (const t of PHASE3_TARGETS) {
        for (let w = 0; w < WARMUP; w++) t.baseCall();
        const baseMs: number[] = [];
        for (let i = 0; i < N; i++) {
          const t0 = performance.now();
          t.baseCall();
          baseMs.push(performance.now() - t0);
        }
        const { median, p99 } = medianP99(baseMs);
        const label = median < W067_MS ? 'BELOW-FLOOR' : 'MEASURABLE';
        if (label === 'BELOW-FLOOR') belowFloor.push(t.id);
        else aboveFloor.push(t.id);
        console.log(
          `[paper-targets-overhead-bench/phase3] ${t.id} | base med=${median.toFixed(3)}ms p99=${p99.toFixed(3)}ms | W.067=${label}`
        );
        expect(median).toBeGreaterThan(0);
      }

      console.log(
        `[paper-targets-overhead-bench/phase3] BELOW-FLOOR (${belowFloor.length}): ${belowFloor.join(', ')}`
      );
      if (aboveFloor.length > 0) {
        console.log(
          `[paper-targets-overhead-bench/phase3] MEASURABLE (${aboveFloor.length}): ${aboveFloor.join(', ')}`
        );
      }
      console.log('[paper-targets-overhead-bench/phase3] done.');
    },
    600_000
  );
});
