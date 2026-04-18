import { describe, it, expect, vi } from 'vitest';
import { createHash } from 'crypto';
import { HoloCompositionParser } from '../../parser/HoloCompositionParser';
import { ExportManager } from '../ExportManager';
import type { ExportTarget } from '../CircuitBreaker';

// Benchmark validates compiler/runtime overhead behavior, not RBAC policy.
vi.mock('../identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../identity/AgentRBAC')>();
  return {
    ...actual,
    getRBAC: () => ({
      checkAccess: () => ({ allowed: true, agentRole: 'code_generator' }),
    }),
  };
});

function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function percentile(xs: number[], p: number): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const idx = Math.floor((sorted.length - 1) * Math.min(1, Math.max(0, p)));
  return sorted[idx];
}

function median(xs: number[]): number {
  return percentile(xs, 0.5);
}

interface TargetBenchRow {
  target: ExportTarget;
  category: string;
  n: number;
  baseMedianMs: number;
  baseP99Ms: number;
  provMedianMs: number;
  provP99Ms: number;
  ratioMedian: number;
  ratioP99: number;
  provenanceMarkerSeen: boolean;
}

const TARGETS: Array<{ target: ExportTarget; category: string }> = [
  { target: 'webgpu', category: 'render-web' },
  { target: 'r3f', category: 'render-web' },
  { target: 'babylon', category: 'render-web' },
  { target: 'playcanvas', category: 'render-web' },
  { target: 'unity', category: 'game-engine' },
  { target: 'unreal', category: 'game-engine' },
  { target: 'godot', category: 'game-engine' },
  { target: 'vrchat', category: 'game-engine' },
  { target: 'openxr', category: 'xr-runtime' },
  { target: 'ar', category: 'xr-runtime' },
  { target: 'urdf', category: 'robotics' },
  { target: 'sdf', category: 'robotics' },
];

const SOURCE_HOLO = `
composition "PaperTargetsOverheadScene" {
  environment {
    skybox: "studio"
    ambient_light: 0.55
  }

  template "BenchAgent" {
    @grabbable
    @physics(mass: 1.0, restitution: 0.8)
    geometry: "capsule"

    state {
      active: true
      energy: 100.0
    }
  }

  object "AgentA" using "BenchAgent" {
    position: [0.0, 1.5, -2.0]
  }
}
`;

describe('Paper 10/12 Benchmark: Per-target provenance overhead', () => {
  it('measures t_prov/t_base per target with median/p99 and category aggregates', async () => {
    const parser = new HoloCompositionParser();
    const parseResult = parser.parse(SOURCE_HOLO);
    expect(parseResult.success).toBe(true);
    expect(parseResult.ast).toBeDefined();

    const ast = parseResult.ast!;
    const provenanceHash = hashContent(JSON.stringify(ast));

    const N = Number(process.env.PAPER_TARGETS_BENCH_N ?? '20');
    expect(Number.isFinite(N) && N >= 5).toBe(true);

    const manager = new ExportManager({
      useCircuitBreaker: false,
      useFallback: false,
      throwOnError: false,
      useMemoryMonitoring: false,
      enableGaussianBudgetWarnings: false,
      agentToken: 'paper-targets-token',
    });

    const rows: TargetBenchRow[] = [];
    const failedTargets: Array<{ target: ExportTarget; error: string }> = [];

    for (const { target, category } of TARGETS) {
      const baseMs: number[] = [];
      const provMs: number[] = [];
      let markerSeen = false;
      let targetFailed = false;
      let failReason = '';

      for (let i = 0; i < N; i++) {
        const t0 = performance.now();
        const baseResult = await manager.export(target, ast, {
          useCircuitBreaker: false,
          useFallback: false,
          throwOnError: false,
          useMemoryMonitoring: false,
          enableGaussianBudgetWarnings: false,
          compilerOptions: {},
          agentToken: 'paper-targets-token',
        });
        const t1 = performance.now();

        if (!baseResult.success) {
          targetFailed = true;
          failReason = baseResult.error?.message ?? 'baseline compile failed';
          break;
        }
        baseMs.push(t1 - t0);

        const p0 = performance.now();
        const provResult = await manager.export(target, ast, {
          useCircuitBreaker: false,
          useFallback: false,
          throwOnError: false,
          useMemoryMonitoring: false,
          enableGaussianBudgetWarnings: false,
          compilerOptions: { provenanceHash },
          agentToken: 'paper-targets-token',
        });
        const p1 = performance.now();

        if (!provResult.success) {
          targetFailed = true;
          failReason = provResult.error?.message ?? 'provenance compile failed';
          break;
        }
        provMs.push(p1 - p0);

        const output = provResult.output ?? '';
        if (typeof output === 'string' && output.includes(provenanceHash)) {
          markerSeen = true;
        }
      }

      if (targetFailed || baseMs.length === 0 || provMs.length === 0) {
        failedTargets.push({ target, error: failReason || 'no timing samples collected' });
        continue;
      }

      const baseMedianMs = median(baseMs);
      const baseP99Ms = percentile(baseMs, 0.99);
      const provMedianMs = median(provMs);
      const provP99Ms = percentile(provMs, 0.99);

      rows.push({
        target,
        category,
        n: baseMs.length,
        baseMedianMs,
        baseP99Ms,
        provMedianMs,
        provP99Ms,
        ratioMedian: baseMedianMs > 0 ? provMedianMs / baseMedianMs : 0,
        ratioP99: baseP99Ms > 0 ? provP99Ms / baseP99Ms : 0,
        provenanceMarkerSeen: markerSeen,
      });
    }

    manager.dispose();

    rows.sort((a, b) => a.target.localeCompare(b.target));

    console.log('[paper-targets-overhead] === per-target (median/p99) ===');
    console.log('[paper-targets-overhead] target | category | base_med | prov_med | ratio_med | base_p99 | prov_p99 | ratio_p99 | marker');
    for (const r of rows) {
      console.log(
        `[paper-targets-overhead] ${r.target} | ${r.category} | ` +
          `${r.baseMedianMs.toFixed(3)} | ${r.provMedianMs.toFixed(3)} | ${r.ratioMedian.toFixed(3)} | ` +
          `${r.baseP99Ms.toFixed(3)} | ${r.provP99Ms.toFixed(3)} | ${r.ratioP99.toFixed(3)} | ` +
          `${r.provenanceMarkerSeen ? 'yes' : 'no'}`
      );
    }

    const categories = Array.from(new Set(rows.map((r) => r.category))).sort();
    console.log('[paper-targets-overhead] === category aggregates ===');
    for (const c of categories) {
      const subset = rows.filter((r) => r.category === c);
      const medRatioMedian = median(subset.map((r) => r.ratioMedian));
      const medRatioP99 = median(subset.map((r) => r.ratioP99));
      console.log(
        `[paper-targets-overhead] ${c} | targets=${subset.length} | ` +
          `median(ratio_med)=${medRatioMedian.toFixed(3)} | median(ratio_p99)=${medRatioP99.toFixed(3)}`
      );
    }

    if (failedTargets.length > 0) {
      console.log('[paper-targets-overhead] === failed targets ===');
      for (const f of failedTargets) {
        console.log(`[paper-targets-overhead] ${f.target}: ${f.error}`);
      }
    }

    // This benchmark should stay informative even if a subset of targets fails on a contributor machine.
    expect(rows.length).toBeGreaterThanOrEqual(8);
    expect(rows.every((r) => Number.isFinite(r.ratioMedian) && r.ratioMedian > 0)).toBe(true);
    expect(rows.every((r) => Number.isFinite(r.ratioP99) && r.ratioP99 > 0)).toBe(true);
  });
});
/**
 * Paper 10 / Paper 12 — per-target compile-time provenance overhead (Phase 1 harness).
 *
 * For each supported compiler: wall-clock compile with vs without `provenanceHash` banner,
 * over N iterations → median / p99 for base, prov, and percent overhead.
 *
 * Extend `TARGETS` as more compilers gain `provenanceHash` in options.
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

vi.mock('../identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../identity/AgentRBAC')>();
  return {
    ...actual,
    getRBAC: () => ({
      checkAccess: () => ({ allowed: true, agentRole: 'code_generator' }),
    }),
  };
});

/** Canonical .holo fixture (shared across targets). */
const CANONICAL_HOLO = `
composition "PaperTargetsOverheadBench" {
  environment {
    skybox: "studio"
    ambient_light: 0.6
  }

  template "ContractedAgent" {
    @grabbable
    @physics(mass: 1.0, restitution: 0.8)
    geometry: "capsule"

    state {
      active: true
      energy: 100.0
    }
  }

  object "AgentA" using "ContractedAgent" {
    position: [0.0, 1.5, -2.0]
  }
}
`;

const AGENT_TOKEN = 'paper-targets-overhead-bench';

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

export type TargetCategory = 'shader-ir' | 'game-engine' | 'scene-format';

interface TargetSpec {
  id: string;
  category: TargetCategory;
  compileBase: (ast: HoloComposition) => unknown;
  compileProv: (ast: HoloComposition, hash: string) => unknown;
  assertProvOutput: (out: unknown, hash: string) => void;
}

function parseFixture(): HoloComposition {
  const parser = new HoloCompositionParser();
  const r = parser.parse(CANONICAL_HOLO);
  expect(r.success).toBe(true);
  return r.ast!;
}

describe('Paper 10/12 — paper-targets-overhead-bench', () => {
  it(
    'reports median/p99 compile time base vs provenance per target',
    () => {
      const ast = parseFixture();
      const astJson = JSON.stringify(ast, null, 2);
      const provHash = sha256Hex(astJson);

      const TARGETS: TargetSpec[] = [
        {
          id: 'webgpu',
          category: 'shader-ir',
          compileBase: (c) => new WebGPUCompiler({}).compile(c, AGENT_TOKEN),
          compileProv: (c, h) => new WebGPUCompiler({ provenanceHash: h }).compile(c, AGENT_TOKEN),
          assertProvOutput: (out, h) => {
            expect(String(out)).toContain(`// Provenance Hash: ${h}`);
          },
        },
        {
          id: 'vrchat',
          category: 'game-engine',
          compileBase: (c) => new VRChatCompiler({}).compile(c, AGENT_TOKEN),
          compileProv: (c, h) => new VRChatCompiler({ provenanceHash: h }).compile(c, AGENT_TOKEN),
          assertProvOutput: (out, h) => {
            expect(String((out as { mainScript: string }).mainScript)).toContain(
              `// Provenance Hash: ${h}`
            );
          },
        },
        {
          id: 'babylon',
          category: 'game-engine',
          compileBase: (c) => new BabylonCompiler({}).compile(c, AGENT_TOKEN),
          compileProv: (c, h) => new BabylonCompiler({ provenanceHash: h }).compile(c, AGENT_TOKEN),
          assertProvOutput: (out, h) => {
            expect(String(out)).toContain(`// Provenance Hash: ${h}`);
          },
        },
        {
          id: 'unity',
          category: 'game-engine',
          compileBase: (c) => new UnityCompiler({}).compile(c, AGENT_TOKEN),
          compileProv: (c, h) => new UnityCompiler({ provenanceHash: h }).compile(c, AGENT_TOKEN),
          assertProvOutput: (out, h) => {
            expect(String(out)).toContain(`// Provenance Hash: ${h}`);
          },
        },
        {
          id: 'godot',
          category: 'game-engine',
          compileBase: (c) => new GodotCompiler({}).compile(c, AGENT_TOKEN),
          compileProv: (c, h) => new GodotCompiler({ provenanceHash: h }).compile(c, AGENT_TOKEN),
          assertProvOutput: (out, h) => {
            expect(String(out)).toContain(`# Provenance Hash: ${h}`);
          },
        },
        {
          id: 'usd-physics',
          category: 'scene-format',
          compileBase: (c) =>
            new USDPhysicsCompiler({ embedSemanticAST: true, targetContext: 'generic' }).compile(
              c,
              AGENT_TOKEN
            ),
          compileProv: (c, h) =>
            new USDPhysicsCompiler({
              embedSemanticAST: true,
              targetContext: 'generic',
              provenanceHash: h,
            }).compile(c, AGENT_TOKEN),
          assertProvOutput: (out, h) => {
            expect(String(out)).toContain(`# Provenance Hash: ${h}`);
          },
        },
        {
          id: 'unreal',
          category: 'game-engine',
          compileBase: (c) => new UnrealCompiler({ generateBlueprints: false }).compile(c, AGENT_TOKEN),
          compileProv: (c, h) =>
            new UnrealCompiler({ generateBlueprints: false, provenanceHash: h }).compile(c, AGENT_TOKEN),
          assertProvOutput: (out, h) => {
            expect(String((out as { headerFile: string }).headerFile)).toContain(
              `// Provenance Hash: ${h}`
            );
          },
        },
      ];

      const WARMUP = 12;
      const N = 40;
      console.log('\n[paper-targets-overhead-bench] === per-target provenance overhead ===');
      console.log(
        `[paper-targets-overhead-bench] warmup=${WARMUP} iterations=${N} fixture_sha256=${provHash.slice(0, 16)}…`
      );
      console.log(
        '[paper-targets-overhead-bench] NOTE: sub-ms medians are timer/JIT noise; use larger .holo fixtures or batch-total wall time for publishable overhead %.'
      );

      for (const t of TARGETS) {
        for (let w = 0; w < WARMUP; w++) {
          t.compileBase(ast);
          t.compileProv(ast, provHash);
        }

        const baseMs: number[] = [];
        const provMs: number[] = [];
        let lastProvOut: unknown;

        for (let i = 0; i < N; i++) {
          const t0 = performance.now();
          t.compileBase(ast);
          baseMs.push(performance.now() - t0);
        }
        for (let i = 0; i < N; i++) {
          const t0 = performance.now();
          lastProvOut = t.compileProv(ast, provHash);
          provMs.push(performance.now() - t0);
        }

        t.assertProvOutput(lastProvOut!, provHash);

        const b = medianP99(baseMs);
        const p = medianP99(provMs);
        const overheadMed =
          b.median > 1e-6 ? ((p.median - b.median) / b.median) * 100 : 0;
        const overheadP99 =
          b.p99 > 1e-6 ? ((p.p99 - b.p99) / b.p99) * 100 : 0;
        const sumBase = baseMs.reduce((a, x) => a + x, 0);
        const sumProv = provMs.reduce((a, x) => a + x, 0);
        const overheadSum = sumBase > 1e-6 ? ((sumProv - sumBase) / sumBase) * 100 : 0;

        console.log(
          `[paper-targets-overhead-bench] ${t.id} (${t.category}) | base med=${b.median.toFixed(3)}ms p99=${b.p99.toFixed(3)}ms | prov med=${p.median.toFixed(3)}ms p99=${p.p99.toFixed(3)}ms | overhead med=${overheadMed.toFixed(2)}% p99=${overheadP99.toFixed(2)}% | Σ-run overhead=${overheadSum.toFixed(2)}% (more stable at sub-ms per-compile)`
        );

        expect(p.median).toBeGreaterThan(0);
      }

      console.log('[paper-targets-overhead-bench] done.');
    },
    180_000
  );
});
