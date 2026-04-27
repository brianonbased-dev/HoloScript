/**
 * paper-12-scene-suite-overhead.bench.test.ts
 *
 * Paper-12 (HoloLand I3D) §"Remaining Work for Camera-Ready" item 1 —
 * Scene-suite mean/median plugin-loaded overhead matrix. Closes the first
 * `\todo{}` in `paper-12-holo-i3d.tex:597-600` ("Scene suite size, target
 * list, host, and mean/median overhead from timed runs").
 *
 * Existing single-scene probe (`paper12PluginProbe.ts` /
 * `paper-12-plugin-probe.test.ts`) measures one HoloScript scene and one
 * static OpenUSD LOC proxy. This harness extends to a multi-scene SUITE
 * (5 scenes spanning tiny → plugin-heavy) and reports per-scene cold/warm
 * means PLUS suite-aggregate mean/median/p95/max so the paper can claim a
 * scene-shape distribution rather than a single point.
 *
 * Targets (k = 2): canonical HoloScript parser path and the plugin-authored
 * OpenUSD export path (@holoscript/openusd-plugin). Per-scene measurements
 * for both.
 *
 * Artifact: `.bench-logs/2026-04-27-paper-12-scene-suite-overhead.md`
 * (cited from paper-12 via `\measuredFrom{}`).
 *
 * Item 2 of paper-12's remaining-work list (structural-biology extension
 * LOC + toolchain + provenance vs pinned-tag OpenUSD schema plugins) is
 * NOT covered by this harness — it is split into a separate board task
 * because it requires actual structural-biology extension code on both
 * the HoloScript and pxr sides.
 *
 * @see packages/comparative-benchmarks/src/paper12PluginProbe.ts
 * @see research/paper-12-holo-i3d.tex §"Remaining Work for Camera-Ready"
 */

import { describe, it, expect } from 'vitest';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { parseHolo } from '@holoscript/core';
import { exportToUsda, type UsdaExportInput } from '@holoscript/openusd-plugin';

// ── Scene suite ────────────────────────────────────────────────────────────

interface SceneSpec {
  name: string;
  /** Function returning a HoloScript source string given a unique seed.
   *  Seeded so cold-path measurements vary the root identifier (defeating
   *  parser memoization) while warm-path uses a fixed seed. */
  src: (seed: number) => string;
  /** Companion OpenUSD plugin scene for the same shape. */
  usd: UsdaExportInput;
  /** Object count and trait count for the per-scene row. */
  objectCount: number;
  traitsPerObject: number;
}

const SCENES: SceneSpec[] = [
  {
    name: 'tiny',
    objectCount: 1,
    traitsPerObject: 0,
    src: (s) => `tiny_${s} {}`,
    usd: { name: 'tiny', stage: 'world', primitives: [{ kind: 'xform', path: 'Root', attrs: {} }] },
  },
  {
    name: 'small',
    objectCount: 1,
    traitsPerObject: 4,
    src: (s) => `small_${s} {
      @color(red)
      @position(0, 1, 0)
      @physics
      @grabbable
    }`,
    usd: {
      name: 'small',
      stage: 'world',
      primitives: [
        { kind: 'mesh', path: 'Hero', attrs: { extent: [-0.5, -0.5, -0.5, 0.5, 0.5, 0.5] } },
      ],
    },
  },
  {
    name: 'medium',
    objectCount: 5,
    traitsPerObject: 2,
    src: (s) => {
      const lines: string[] = [];
      for (let i = 0; i < 5; i++) {
        lines.push(`medium_${s}_${i} {
          @color(blue)
          @position(${i}, 1, 0)
        }`);
      }
      return lines.join('\n');
    },
    usd: {
      name: 'medium',
      stage: 'world',
      primitives: Array.from({ length: 5 }, (_, i) => ({
        kind: 'mesh' as const,
        path: `M${i}`,
        attrs: { extent: [-0.5, -0.5, -0.5, 0.5, 0.5, 0.5] },
      })),
    },
  },
  {
    name: 'large',
    objectCount: 20,
    traitsPerObject: 4,
    src: (s) => {
      const lines: string[] = [];
      for (let i = 0; i < 20; i++) {
        lines.push(`large_${s}_${i} {
          @color(green)
          @position(${i}, ${i}, 0)
          @physics
          @grabbable
        }`);
      }
      return lines.join('\n');
    },
    usd: {
      name: 'large',
      stage: 'world',
      primitives: Array.from({ length: 20 }, (_, i) => ({
        kind: 'mesh' as const,
        path: `L${i}`,
        attrs: { extent: [-0.5, -0.5, -0.5, 0.5, 0.5, 0.5], doc: `large primitive ${i}` },
      })),
    },
  },
  {
    name: 'plugin-heavy',
    objectCount: 10,
    traitsPerObject: 4,
    src: (s) => {
      const lines: string[] = [];
      for (let i = 0; i < 10; i++) {
        lines.push(`plugin_${s}_${i} {
          @color(purple)
          @position(${i * 2}, 0, ${i})
          @physics
          @grabbable
        }`);
      }
      return lines.join('\n');
    },
    usd: {
      name: 'plugin_heavy',
      stage: 'world',
      primitives: Array.from({ length: 10 }, (_, i) => ({
        kind: 'mesh' as const,
        path: `P${i}`,
        attrs: { extent: [-1, -1, -1, 1, 1, 1], doc: `plugin probe ${i}` },
      })),
    },
  },
];

// ── Measurement primitives ─────────────────────────────────────────────────

function meanOf(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function medianOf(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function percentileOf(xs: number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.floor(s.length * p));
  return s[idx];
}

interface ScenePoint {
  name: string;
  objectCount: number;
  traitsPerObject: number;
  holoSourceLines: number;
  usdLines: number;
  /** Cold parse: each iter uses a fresh root id so the parser cannot reuse
   *  a single memoized key. Mean over N iterations (ms). */
  holoColdMeanMs: number;
  /** Warm parse: each iter uses the same source string. Mean over N iters. */
  holoWarmMeanMs: number;
  /** Mean ms per OpenUSD plugin export call (same scene shape). */
  usdExportMeanMs: number;
  /** Plugin-emitted USDA line count (vs static probe LOC for A/B). */
  usdPluginGeneratedLines: number;
}

function timedMean(fn: () => void, iters: number): number {
  // Warmup
  for (let i = 0; i < Math.min(8, iters); i++) fn();
  const ms: number[] = [];
  for (let i = 0; i < iters; i++) {
    const t0 = performance.now();
    fn();
    ms.push(performance.now() - t0);
  }
  return meanOf(ms);
}

function countNonEmptyLines(s: string): number {
  return s.split(/\r?\n/).filter((l) => l.trim().length > 0).length;
}

function measureScene(scene: SceneSpec, iters: number): ScenePoint {
  const fixedSeed = 42;
  const warmSrc = scene.src(fixedSeed);
  const holoSourceLines = countNonEmptyLines(warmSrc);

  // Cold path — fresh seed every iter defeats parser memoization.
  let coldCounter = 0;
  const holoColdMeanMs = timedMean(() => {
    parseHolo(scene.src(0xc0ffee + ++coldCounter));
  }, iters);

  // Warm path — same source string each iter.
  const holoWarmMeanMs = timedMean(() => {
    parseHolo(warmSrc);
  }, iters);

  // OpenUSD plugin export path on the same conceptual scene.
  let usdLines = 0;
  const usdExportMeanMs = timedMean(() => {
    const out = exportToUsda(scene.usd);
    usdLines = out.loc;
  }, Math.min(iters, 60));

  return {
    name: scene.name,
    objectCount: scene.objectCount,
    traitsPerObject: scene.traitsPerObject,
    holoSourceLines,
    usdLines: countNonEmptyLines(scene.usd.primitives.map((p) => p.path).join('\n')),
    holoColdMeanMs,
    holoWarmMeanMs,
    usdExportMeanMs,
    usdPluginGeneratedLines: usdLines,
  };
}

// ── Artifact rendering ─────────────────────────────────────────────────────

function renderArtifact(points: ScenePoint[], wallMs: number, date: string): string {
  const lines: string[] = [];
  lines.push(`# Paper-12 §"Remaining Work" item 1 — Scene-Suite Plugin-Loaded Overhead`);
  lines.push('');
  lines.push(`- Date: ${date}`);
  lines.push(`- Suite: ${points.length} scenes × 2 target paths (HoloScript parser + OpenUSD plugin export)`);
  lines.push(`- Iterations per measurement: see code (PAPER12_QUICK env supported)`);
  lines.push(`- Wall-clock: ${wallMs.toFixed(1)} ms`);
  lines.push(`- Item 2 (structural-biology USD comparison) is split into a separate board task — NOT covered here.`);
  lines.push('');
  lines.push(`## Per-scene measurements`);
  lines.push('');
  lines.push(`| Scene | Objects | Traits/Obj | Holo LOC | Cold parse mean (ms) | Warm parse mean (ms) | Warm/Cold | USD export mean (ms) | USD plugin LOC |`);
  lines.push(`|-------|---------|------------|----------|----------------------|----------------------|-----------|----------------------|----------------|`);
  for (const p of points) {
    const ratio = p.holoColdMeanMs > 0 ? p.holoWarmMeanMs / p.holoColdMeanMs : 0;
    lines.push(
      `| ${p.name} | ${p.objectCount} | ${p.traitsPerObject} | ${p.holoSourceLines} | ${p.holoColdMeanMs.toFixed(4)} | ${p.holoWarmMeanMs.toFixed(4)} | ${ratio.toFixed(3)} | ${p.usdExportMeanMs.toFixed(4)} | ${p.usdPluginGeneratedLines} |`
    );
  }
  lines.push('');
  lines.push(`## Suite aggregates`);
  lines.push('');
  const colds = points.map((p) => p.holoColdMeanMs);
  const warms = points.map((p) => p.holoWarmMeanMs);
  const usds = points.map((p) => p.usdExportMeanMs);
  lines.push(`| Metric | mean | median | p95 | max |`);
  lines.push(`|--------|------|--------|-----|-----|`);
  lines.push(
    `| HoloScript cold parse (ms) | ${meanOf(colds).toFixed(4)} | ${medianOf(colds).toFixed(4)} | ${percentileOf(colds, 0.95).toFixed(4)} | ${Math.max(...colds).toFixed(4)} |`
  );
  lines.push(
    `| HoloScript warm parse (ms) | ${meanOf(warms).toFixed(4)} | ${medianOf(warms).toFixed(4)} | ${percentileOf(warms, 0.95).toFixed(4)} | ${Math.max(...warms).toFixed(4)} |`
  );
  lines.push(
    `| OpenUSD plugin export (ms) | ${meanOf(usds).toFixed(4)} | ${medianOf(usds).toFixed(4)} | ${percentileOf(usds, 0.95).toFixed(4)} | ${Math.max(...usds).toFixed(4)} |`
  );
  lines.push('');
  lines.push(`## Methodology`);
  lines.push('');
  lines.push(
    `Per scene, cold-path parse uses a fresh root identifier each iteration (defeating parser memoization); warm-path uses a single fixed source string. OpenUSD plugin export runs the @holoscript/openusd-plugin pipeline on the same conceptual scene shape. Mean = arithmetic mean over N iterations after an 8-iter warmup. Suite aggregates reduce the per-scene means via mean / median / p95 / max across the 5-scene suite.`
  );
  lines.push('');
  lines.push(`## Source`);
  lines.push('');
  lines.push(`- Harness: \`packages/comparative-benchmarks/src/__tests__/paper-12-scene-suite-overhead.bench.test.ts\``);
  lines.push(`- Sibling probe: \`packages/comparative-benchmarks/src/paper12PluginProbe.ts\` (single-scene reference)`);
  lines.push('');
  return lines.join('\n');
}

// ── Test ───────────────────────────────────────────────────────────────────

describe('[Paper-12 §RemainingWork item 1] scene-suite mean/median plugin-loaded overhead', () => {
  it('measures HoloScript cold/warm parse + OpenUSD plugin export across the 5-scene suite', () => {
    const quick = process.env.PAPER12_QUICK === '1' || process.env.PAPER12_QUICK === 'true';
    const iters = quick ? 30 : 120;

    const t0 = performance.now();
    const points: ScenePoint[] = SCENES.map((s) => measureScene(s, iters));
    const wallMs = performance.now() - t0;

    // Sanity invariants.
    expect(points.length).toBe(SCENES.length);
    for (const p of points) {
      expect(p.holoColdMeanMs).toBeGreaterThan(0);
      expect(p.holoWarmMeanMs).toBeGreaterThan(0);
      expect(p.usdExportMeanMs).toBeGreaterThanOrEqual(0);
      expect(p.usdPluginGeneratedLines).toBeGreaterThan(0);
    }

    // Write artifact for paper-12 \measuredFrom{}.
    const __dir = dirname(fileURLToPath(import.meta.url));
    // __tests__ → src → comparative-benchmarks → packages → HoloScript root
    const repoRoot = resolve(__dir, '..', '..', '..', '..');
    const benchLogsDir = resolve(repoRoot, '.bench-logs');
    if (!existsSync(benchLogsDir)) mkdirSync(benchLogsDir, { recursive: true });
    const artifactPath = resolve(
      benchLogsDir,
      '2026-04-27-paper-12-scene-suite-overhead.md'
    );
    const md = renderArtifact(points, wallMs, '2026-04-27');
    writeFileSync(artifactPath, md);

    console.log(
      `[paper-12][scene-suite] scenes=${points.length} iters=${iters} wallMs=${wallMs.toFixed(1)}`
    );
    for (const p of points) {
      console.log(
        `[paper-12][scene-suite] ${p.name.padEnd(14)} cold=${p.holoColdMeanMs.toFixed(4)}ms warm=${p.holoWarmMeanMs.toFixed(4)}ms usdExport=${p.usdExportMeanMs.toFixed(4)}ms`
      );
    }
    console.log(`[paper-12][scene-suite] artifact=${artifactPath}`);
  });
});
