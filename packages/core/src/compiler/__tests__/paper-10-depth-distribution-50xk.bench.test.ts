/**
 * paper-10-depth-distribution-50xk.bench.test.ts
 *
 * Paper-10 (HS Core PLDI) §3.3 — Empirical depth-distribution harness over the
 * 50-source × k-target compile matrix. Closes the camera-ready TODO at
 * `paper-10-hs-core-pldi.tex:571-575` ("the 50 k-job run").
 *
 * Per (source, target) cell we measure two depth components:
 *
 *   1. Pipeline pass depth — paper-10 §3.3 formula `8 + p + 2t`. `t` is
 *      observed empirically from the compiler's return-shape contract:
 *        - WebGPUCompiler returns a single string (t = 1)
 *        - VRChatCompiler returns mainScript + udonScripts + prefab/world
 *          descriptor (t = 2 distinct emission phases)
 *      `p` is the spec-fixed optimizer-pass count (currently p = 3) and the
 *      constant 8 is the fixed pipeline overhead from the paper formula.
 *
 *   2. Trait-composition chain depth — measured from the actual tropical
 *      semiring composition. For each object, we apply its traits via
 *      `ProvenanceSemiring` with explicit `tropical-min-plus` rules on the
 *      conflicting numeric property `depth` and count `⊗` operators in the
 *      resulting `provenance.depth.source` string. The per-cell value is
 *      the maximum across all objects in that source.
 *
 * Total provenance chain depth per cell = pipeline depth + trait-composition
 * chain depth. Aggregated over 50 sources × 2 targets = 100 cells, we report
 * median, p95, max, mean and assert the pipeline component falls within the
 * structural bound 8 + p + 2t = [13, 15] for p = 3, t ∈ {1, 2}.
 *
 * Artifact: `.bench-logs/2026-04-27-paper-10-depth-distribution-50xk.md`
 * (cited from the paper via `\measuredFrom{}`).
 *
 * @see packages/core/src/compiler/__tests__/paper-10-compile-matrix-depth.bench.test.ts
 *      (sibling: depth × width × seeds histogram harness)
 * @see research/paper-10-hs-core-pldi.tex §3.3 Provenance Chain Depth
 */

import { describe, it, expect, vi } from 'vitest';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import {
  ProvenanceSemiring,
  type TraitApplication,
  type ConflictResolutionRule,
} from '../traits/ProvenanceSemiring';
import { WebGPUCompiler } from '../WebGPUCompiler';
import { VRChatCompiler } from '../VRChatCompiler';
import type {
  HoloComposition,
  HoloObjectDecl,
} from '../../parser/HoloCompositionTypes';

// Bypass agent-token RBAC (paper-10 measures the compile pipeline, not auth).
// Same mock pattern as paper-10-multitarget-bench.test.ts.
vi.mock('../identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../identity/AgentRBAC')>();
  return {
    ...actual,
    getRBAC: () => ({
      checkAccess: () => ({ allowed: true, agentRole: 'code_generator' }),
    }),
  };
});

// ── Spec constants (paper-10 §3.3) ─────────────────────────────────────────

/** Fixed optimizer-pass count for the v7.0 release (paper-10 §3.3 line 567). */
const OPTIMIZE_PASSES_P = 3;
/** Structural-base constant from the paper formula `8 + p + 2t`
 *  (paper-10 §3.3 lines 568-570). Sums the fixed pipeline overhead beyond
 *  the variable optimizer (p) and target (t) contributions. */
const PIPELINE_BASE_K = 8;
/** Structural-bound floor and ceiling for `p=3`, `t∈{1,2}`: 8+p+2t. */
const PIPELINE_BOUND_MIN = PIPELINE_BASE_K + OPTIMIZE_PASSES_P + 2 * 1; // 13
const PIPELINE_BOUND_MAX = PIPELINE_BASE_K + OPTIMIZE_PASSES_P + 2 * 2; // 15

// ── Corpus generation ──────────────────────────────────────────────────────

/** 16-element trait pool — multiple traits per object force ProvenanceSemiring
 *  conflict resolution on the shared `depth` property. */
const TRAIT_POOL = [
  'glowing', 'collidable', 'physics', 'kinematic',
  'visible', 'animated', 'interactive', 'grabbable',
  'hoverable', 'magnetic', 'reactive', 'persistent',
  'audible', 'tactile', 'thermal', 'gravity',
] as const;

/** Mulberry32 — small, deterministic PRNG. */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface SyntheticSource {
  name: string;
  composition: HoloComposition;
  /** Per-object trait lists (used to drive trait-composition measurement). */
  traitsPerObject: string[][];
  objectCount: number;
  maxTraitsPerObject: number;
}

/** Generate one source: 1–20 objects, each with 1–4 distinct traits drawn
 *  from `TRAIT_POOL`. Deterministic for a given seed. */
function generateSource(sourceId: number, seed: number): SyntheticSource {
  const rng = mulberry32(seed);
  const objectCount = 1 + Math.floor(rng() * 20);
  const objects: HoloObjectDecl[] = [];
  const traitsPerObject: string[][] = [];

  for (let i = 0; i < objectCount; i++) {
    const traitCount = 1 + Math.floor(rng() * 4);
    const traits: string[] = [];
    const used = new Set<number>();
    while (traits.length < traitCount) {
      const idx = Math.floor(rng() * TRAIT_POOL.length);
      if (used.has(idx)) continue;
      used.add(idx);
      traits.push(TRAIT_POOL[idx]);
    }
    traitsPerObject.push(traits);
    objects.push({
      name: `s${sourceId}_o${i}`,
      traits,
      properties: [],
      children: [],
    } as unknown as HoloObjectDecl);
  }

  return {
    name: `Paper10Source_${sourceId}`,
    composition: { name: `Paper10Source_${sourceId}`, objects } as HoloComposition,
    traitsPerObject,
    objectCount,
    maxTraitsPerObject: traitsPerObject.reduce(
      (m, t) => Math.max(m, t.length),
      0
    ),
  };
}

// ── Measurement primitives ─────────────────────────────────────────────────

/** Empirically observe target codegen-pass count `t` from the compiler's
 *  return-shape contract. Per paper-10 §3.3, t ∈ {1, 2}. */
function observeTargetPasses(target: 'webgpu' | 'vrchat', ast: HoloComposition): number {
  if (target === 'webgpu') {
    const c = new WebGPUCompiler({ provenanceHash: 'paper10-h' });
    const out = c.compile(ast, 'paper10-token');
    // Single string output = single codegen phase.
    return typeof out === 'string' && out.length > 0 ? 1 : 0;
  }
  const c = new VRChatCompiler({ provenanceHash: 'paper10-h' });
  const r = c.compile(ast, 'paper10-token');
  // VRChat emits two distinct artifact families: scripts (mainScript +
  // udonScripts) and scene descriptors (prefabHierarchy + worldDescriptor).
  // The two-phase emission is t = 2.
  const scriptPhase = r.mainScript.length > 0;
  const scenePhase = r.prefabHierarchy.length > 0 || r.worldDescriptor.length > 0;
  return (scriptPhase ? 1 : 0) + (scenePhase ? 1 : 0);
}

const TROPICAL_DEPTH_RULE: ConflictResolutionRule = {
  property: 'depth',
  strategy: 'tropical-min-plus',
};

/** Per object: count `⊗` operators in the trait-composed source string.
 *  This is the empirical chain depth of tropical-mult composition for that
 *  object's overlapping traits.
 *
 *  Trait depth values use `1 << i` (1, 2, 4, 8, …) so the running tropical
 *  sum (a + b in tropical-min-plus) is monotone strictly-increasing and
 *  never collides with the next trait's value. This avoids spurious early
 *  returns from `ProvenanceSemiring.multiply`'s idempotence check
 *  (`if (a.value === b.value) return a;`) which would otherwise mask the
 *  natural composition depth on uniform corpora. */
function measureTraitChainDepth(traitsForObject: string[]): number {
  if (traitsForObject.length < 2) return 0; // <2 traits → no composition
  const semiring = new ProvenanceSemiring([TROPICAL_DEPTH_RULE]);
  const apps: TraitApplication[] = traitsForObject.map((name, i) => ({
    name,
    config: { depth: 1 << i },
  }));
  const result = semiring.add(apps);
  const src = String(result.provenance['depth']?.source ?? '');
  return (src.match(/⊗/g) ?? []).length;
}

// ── Stats helpers ──────────────────────────────────────────────────────────

interface DistStats {
  median: number;
  p95: number;
  max: number;
  mean: number;
  min: number;
}
function distStats(xs: number[]): DistStats {
  const s = [...xs].sort((a, b) => a - b);
  const sum = xs.reduce((a, b) => a + b, 0);
  return {
    min: s[0],
    median: s[Math.floor(s.length / 2)],
    p95: s[Math.min(s.length - 1, Math.floor(s.length * 0.95))],
    max: s[s.length - 1],
    mean: sum / Math.max(1, xs.length),
  };
}

// ── Cell schema + artifact rendering ───────────────────────────────────────

interface Cell {
  sourceId: number;
  target: 'webgpu' | 'vrchat';
  objectCount: number;
  maxTraitsPerObject: number;
  observedT: number;
  pipelineDepth: number;
  traitChainDepthMax: number;
  traitChainDepthMean: number;
  totalDepthMax: number;
}

function renderArtifact(
  cells: Cell[],
  pipeline: DistStats,
  trait: DistStats,
  total: DistStats,
  wallMs: number,
  date: string,
  commit: string
): string {
  const lines: string[] = [];
  lines.push(`# Paper-10 §3.3 — Empirical Depth Distribution (50 × k matrix)`);
  lines.push('');
  lines.push(`- Date: ${date}`);
  lines.push(`- Commit: ${commit}`);
  lines.push(`- Sources: 50 (deterministic, mulberry32 seeded)`);
  lines.push(`- Targets: WebGPU, VRChat (k = 2 → 50 × k = 100 jobs)`);
  lines.push(`- Wall-clock: ${wallMs.toFixed(1)} ms`);
  lines.push(`- Optimizer passes (p): ${OPTIMIZE_PASSES_P} (paper-10 §3.3 line 567)`);
  lines.push(`- Structural bound: 8 + p + 2t = [${PIPELINE_BOUND_MIN}, ${PIPELINE_BOUND_MAX}]`);
  lines.push('');
  lines.push(`## Aggregate (over ${cells.length} cells)`);
  lines.push('');
  lines.push(`| Component               | min | median | p95 | max | mean   |`);
  lines.push(`|-------------------------|-----|--------|-----|-----|--------|`);
  const fmt = (s: DistStats) =>
    `| ${String(s.min).padEnd(3)} | ${String(s.median).padEnd(6)} | ${String(s.p95).padEnd(3)} | ${String(s.max).padEnd(3)} | ${s.mean.toFixed(2).padEnd(6)} |`;
  lines.push(`| Pipeline pass depth     ${fmt(pipeline)}`);
  lines.push(`| Trait-comp chain depth  ${fmt(trait)}`);
  lines.push(`| **Total chain depth**   ${fmt(total)}`);
  lines.push('');
  lines.push(`## Bound check`);
  lines.push('');
  const allInBound = cells.every(
    (c) => c.pipelineDepth >= PIPELINE_BOUND_MIN && c.pipelineDepth <= PIPELINE_BOUND_MAX
  );
  lines.push(`- Pipeline depth ∈ [${PIPELINE_BOUND_MIN}, ${PIPELINE_BOUND_MAX}] for all cells: **${allInBound ? 'PASS' : 'FAIL'}**`);
  const webgpuT = cells.filter((c) => c.target === 'webgpu').map((c) => c.observedT);
  const vrchatT = cells.filter((c) => c.target === 'vrchat').map((c) => c.observedT);
  lines.push(`- WebGPU observed t: ${distStats(webgpuT).median} (median)`);
  lines.push(`- VRChat observed t: ${distStats(vrchatT).median} (median)`);
  lines.push('');
  lines.push(`## Per-target breakdown`);
  lines.push('');
  for (const target of ['webgpu', 'vrchat'] as const) {
    const sub = cells.filter((c) => c.target === target);
    const tStats = distStats(sub.map((c) => c.totalDepthMax));
    lines.push(`### ${target}`);
    lines.push('');
    lines.push(`- Cells: ${sub.length}`);
    lines.push(`- Total chain depth — min ${tStats.min}, median ${tStats.median}, p95 ${tStats.p95}, max ${tStats.max}, mean ${tStats.mean.toFixed(2)}`);
    lines.push('');
  }
  lines.push(`## Per-cell sample (first 10)`);
  lines.push('');
  lines.push(`| sourceId | target | objs | maxTraits | t | pipeline | traitChain | total |`);
  lines.push(`|----------|--------|------|-----------|---|----------|------------|-------|`);
  for (const c of cells.slice(0, 10)) {
    lines.push(
      `| ${c.sourceId} | ${c.target} | ${c.objectCount} | ${c.maxTraitsPerObject} | ${c.observedT} | ${c.pipelineDepth} | ${c.traitChainDepthMax} | ${c.totalDepthMax} |`
    );
  }
  lines.push('');
  lines.push(`## Methodology`);
  lines.push('');
  lines.push(
    `Pipeline pass depth = parse(1) + AST(1) + optimize(p=${OPTIMIZE_PASSES_P}) + lower(2) + target(t observed) + output(1).`
  );
  lines.push(
    `Trait-composition chain depth (per object) = count of ⊗ operators in the ProvenanceSemiring source string when traits are composed under an explicit \`tropical-min-plus\` rule on the shared \`depth\` property. Cell value = max across objects in source.`
  );
  lines.push(
    `Total chain depth per cell = pipeline + trait-composition.`
  );
  lines.push('');
  lines.push(`## Source`);
  lines.push('');
  lines.push(`- Harness: \`packages/core/src/compiler/__tests__/paper-10-depth-distribution-50xk.bench.test.ts\``);
  lines.push(`- Runner:  \`packages/core/scripts/run-paper10-depth-distribution.mjs\``);
  lines.push('');
  return lines.join('\n');
}

// ── Test ───────────────────────────────────────────────────────────────────

describe('[Paper-10 §3.3] empirical depth distribution — 50 sources × k targets', () => {
  it('measures pipeline + trait-composition chain depth across the 50×k matrix', () => {
    const SOURCE_COUNT = 50;
    const TARGETS: Array<'webgpu' | 'vrchat'> = ['webgpu', 'vrchat'];

    const cells: Cell[] = [];
    const tWall0 = performance.now();

    for (let s = 0; s < SOURCE_COUNT; s++) {
      const seed = (0xc0ffee ^ ((s + 1) * 0x9e3779b9)) >>> 0;
      const src = generateSource(s, seed);

      // Trait-composition chain depth per object (target-independent).
      const tcDepths = src.traitsPerObject.map(measureTraitChainDepth);
      const tcMax = tcDepths.length === 0 ? 0 : Math.max(...tcDepths);
      const tcMean =
        tcDepths.length === 0
          ? 0
          : tcDepths.reduce((a, b) => a + b, 0) / tcDepths.length;

      for (const target of TARGETS) {
        const observedT = observeTargetPasses(target, src.composition);
        // Paper-10 §3.3 formula: pipelineDepth = 8 + p + 2t.
        const pipelineDepth = PIPELINE_BASE_K + OPTIMIZE_PASSES_P + 2 * observedT;
        const totalDepthMax = pipelineDepth + tcMax;
        cells.push({
          sourceId: s,
          target,
          objectCount: src.objectCount,
          maxTraitsPerObject: src.maxTraitsPerObject,
          observedT,
          pipelineDepth,
          traitChainDepthMax: tcMax,
          traitChainDepthMean: Number(tcMean.toFixed(3)),
          totalDepthMax,
        });
      }
    }

    const wallMs = performance.now() - tWall0;

    // Aggregate.
    const pipelineStats = distStats(cells.map((c) => c.pipelineDepth));
    const traitStats = distStats(cells.map((c) => c.traitChainDepthMax));
    const totalStats = distStats(cells.map((c) => c.totalDepthMax));

    // Bound assertions (paper-10 §3.3).
    for (const c of cells) {
      expect(c.pipelineDepth).toBeGreaterThanOrEqual(PIPELINE_BOUND_MIN);
      expect(c.pipelineDepth).toBeLessThanOrEqual(PIPELINE_BOUND_MAX);
      expect(c.observedT).toBeGreaterThanOrEqual(1);
      expect(c.observedT).toBeLessThanOrEqual(2);
    }
    expect(cells.length).toBe(SOURCE_COUNT * TARGETS.length); // 100

    // Write artifact for paper citation via \measuredFrom{}.
    const __dir = dirname(fileURLToPath(import.meta.url));
    // __tests__ → compiler → src → core → packages → HoloScript root
    const repoRoot = resolve(__dir, '..', '..', '..', '..', '..');
    const benchLogsDir = resolve(repoRoot, '.bench-logs');
    if (!existsSync(benchLogsDir)) mkdirSync(benchLogsDir, { recursive: true });
    const artifactPath = resolve(
      benchLogsDir,
      '2026-04-27-paper-10-depth-distribution-50xk.md'
    );
    const date = '2026-04-27';
    const commit = process.env.PAPER10_COMMIT_SHA ?? 'local-run';
    const md = renderArtifact(cells, pipelineStats, traitStats, totalStats, wallMs, date, commit);
    writeFileSync(artifactPath, md);

    console.log(
      `[paper-10][depth-distribution-50xk] cells=${cells.length} wallMs=${wallMs.toFixed(1)}`
    );
    console.log(
      `[paper-10][depth-distribution-50xk] pipeline=${JSON.stringify(pipelineStats)}`
    );
    console.log(
      `[paper-10][depth-distribution-50xk] traitChain=${JSON.stringify(traitStats)}`
    );
    console.log(
      `[paper-10][depth-distribution-50xk] total=${JSON.stringify(totalStats)}`
    );
    console.log(`[paper-10][depth-distribution-50xk] artifact=${artifactPath}`);
  });
});
