/**
 * ExportManager — end-to-end compile timing across every supported export target.
 *
 * Uses the production circuit-breaker compile path (R3F `compileComposition`, SSG, etc.).
 * Run manually or in CI with:
 *   pnpm --filter @holoscript/core run benchmark:export-targets
 *
 * Log freeze: paste Vitest stdout into
 *   ai-ecosystem/research/benchmark-results-YYYY-MM-DD-export-manager-targets.md
 */

import { describe, it, expect, vi } from 'vitest';
import { HoloCompositionParser } from '../../parser/HoloCompositionParser';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';
import { ExportManager } from '../ExportManager';
import type { ExportTarget } from '../CircuitBreaker';

vi.mock('../identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../identity/AgentRBAC')>();
  return {
    ...actual,
    getRBAC: () => ({
      checkAccess: () => ({ allowed: true, agentRole: 'code_generator' }),
    }),
  };
});

/** Default stress size; override with HOLO_EXPORT_BENCH_OBJECTS (e.g. 1000) for local bottleneck hunts. */
const BENCH_OBJECT_COUNT = Math.min(
  2000,
  Math.max(56, parseInt(process.env.HOLO_EXPORT_BENCH_OBJECTS || '120', 10) || 120)
);

function buildBenchFixture(objectCount: number): string {
  const lines: string[] = [
    `composition "ExportManagerTargetsBench" {`,
    `  environment {`,
    `    skybox: "studio"`,
    `    ambient_light: 0.6`,
    `  }`,
    `  spatial_group "BenchRoot" {`,
  ];

  const inner = Math.min(objectCount, 80);
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
  const mod = i % 11;
  const extraTraits: string[] = [];
  if (mod === 1 || mod === 2) extraTraits.push(`${indent}  @clickable`);
  if (mod === 3) extraTraits.push(`${indent}  @hoverable`);
  if (mod === 4 || mod === 5) extraTraits.push(`${indent}  @draggable`);
  if (mod === 6) extraTraits.push(`${indent}  @glowing`);
  if (mod === 7) extraTraits.push(`${indent}  @pointable`);
  if (mod === 8) extraTraits.push(`${indent}  @animated`);
  if (mod === 9) extraTraits.push(`${indent}  @throwable`);
  if (mod === 10) extraTraits.push(`${indent}  @collidable`);
  return [
    `${indent}object "BenchObj_${i}" {`,
    `${indent}  @grabbable`,
    `${indent}  @physics(mass: ${m}, restitution: 0.35)`,
    ...extraTraits,
    `${indent}  geometry: "${geo}"`,
    `${indent}  position: [${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}]`,
    `${indent}}`,
  ];
}

function parseFixture(source: string): HoloComposition {
  const parser = new HoloCompositionParser();
  const r = parser.parse(source);
  expect(r.success).toBe(true);
  return r.ast!;
}

function median(samples: number[]): number {
  const a = [...samples].sort((x, y) => x - y);
  return a[Math.floor(a.length / 2)];
}

describe('ExportManager — all targets compile bench', () => {
  it(
    'times trait-heavy composition export per supported target (bottleneck report)',
    async () => {
      const ast = parseFixture(buildBenchFixture(BENCH_OBJECT_COUNT));
      const mgr = new ExportManager({
        useMemoryMonitoring: false,
        enableGaussianBudgetWarnings: false,
        agentToken: 'export-manager-all-targets-bench',
        generateDocs: false,
      });
      const targets = mgr.getSupportedTargets();
      const WARMUP = 2;
      const N = 4;

      console.log('\n[export-manager-all-targets-bench] === per-target ExportManager.compile ===');
      console.log(
        `[export-manager-all-targets-bench] objects=${BENCH_OBJECT_COUNT} targets=${targets.length} warmup=${WARMUP} iters=${N}`
      );

      const rows: {
        target: ExportTarget;
        medianMs: number;
        successRate: number;
      }[] = [];

      for (const target of targets) {
        for (let w = 0; w < WARMUP; w++) {
          await mgr.export(target, ast, {});
        }
        const times: number[] = [];
        let successes = 0;
        for (let i = 0; i < N; i++) {
          const r = await mgr.export(target, ast, {});
          times.push(r.executionTime);
          if (r.success) successes++;
        }
        const med = median(times);
        const successRate = successes / N;
        rows.push({ target, medianMs: med, successRate });
        console.log(
          `[export-manager-all-targets-bench] ${target} | med=${med.toFixed(2)}ms | success=${successes}/${N}`
        );
      }

      const okRows = rows.filter((r) => r.successRate >= 1);
      const sorted = [...okRows].sort((a, b) => b.medianMs - a.medianMs);
      console.log('[export-manager-all-targets-bench] slowest (all iterations succeeded):');
      for (const r of sorted.slice(0, 10)) {
        console.log(`  ${r.target}: ${r.medianMs.toFixed(2)}ms`);
      }

      const flaky = rows.filter((r) => r.successRate > 0 && r.successRate < 1);
      if (flaky.length) {
        console.log(
          '[export-manager-all-targets-bench] partial failures:',
          flaky.map((f) => `${f.target}(${f.successRate.toFixed(2)})`).join(', ')
        );
      }

      const failed = rows.filter((r) => r.successRate === 0);
      if (failed.length) {
        console.log(
          '[export-manager-all-targets-bench] all-iteration failures:',
          failed.map((f) => f.target).join(', ')
        );
      }

      expect(rows.length).toBe(targets.length);
      expect(okRows.length).toBeGreaterThan(0);
    },
    600_000
  );
});
