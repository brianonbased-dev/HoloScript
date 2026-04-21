/**
 * paper-10-compile-matrix-depth.bench.test.ts
 *
 * Paper-10 (HS Core PLDI) — compile matrix + depth distribution harness.
 *
 * Sweeps max chain depth × parallel root chains (width) × seeds (default 20).
 * Each cell builds a HoloComposition of independent object trees, runs
 * IncrementalCompiler with a deterministic stub, and records depth histograms.
 *
 * Set `PAPER10_FULL=1` locally for the full 20-seed matrix; CI uses a reduced grid.
 * Shipped entrypoints: `pnpm run benchmark:paper10:compile-matrix` (+ `:full`).
 *
 * @see memory/paper-10-depth-distribution-harness.md
 * @see packages/core/src/compiler/__tests__/paper-10-provenance-cache.test.ts
 */

import { describe, it, expect } from 'vitest';
import { IncrementalCompiler } from '../IncrementalCompiler';
import type { HoloComposition, HoloObjectDecl } from '../../parser/HoloCompositionTypes';

const TRAITS = ['glowing', 'collidable'] as string[];
const FULL = process.env.PAPER10_FULL === '1' || process.env.PAPER10_FULL === 'true';
const SEEDS = FULL ? 20 : 3;
const DEPTHS = FULL ? ([1, 2, 3, 4, 5, 6, 8] as const) : ([1, 4, 8] as const);
const WIDTHS = FULL ? ([1, 2, 4, 8, 16, 24, 32] as const) : ([1, 8, 32] as const);

function stubCompiler(obj: HoloObjectDecl): string {
  return `/* ${obj.name} */`;
}

function makeComposition(objects: HoloObjectDecl[]): HoloComposition {
  return { name: 'Paper10Harness', objects } as HoloComposition;
}

/** Linear chain: root at depth 1, deepest leaf at depth `maxDepth`. */
function makeChain(seed: number, maxDepth: number): HoloObjectDecl {
  let cur: HoloObjectDecl = {
    name: `n_${seed}_leaf`,
    traits: TRAITS,
    properties: [],
    children: [],
  };
  for (let d = maxDepth - 1; d >= 1; d--) {
    cur = {
      name: `n_${seed}_d${d}`,
      traits: TRAITS,
      properties: [],
      children: [cur],
    };
  }
  return cur;
}

function depthHistogram(comp: HoloComposition): Map<number, number> {
  const m = new Map<number, number>();
  const walk = (obj: HoloObjectDecl, d: number) => {
    m.set(d, (m.get(d) ?? 0) + 1);
    for (const c of obj.children || []) walk(c, d + 1);
  };
  for (const o of comp.objects || []) walk(o, 1);
  return m;
}

function countNodesComp(comp: HoloComposition): number {
  let n = 0;
  const walk = (obj: HoloObjectDecl) => {
    n++;
    for (const c of obj.children || []) walk(c);
  };
  for (const o of comp.objects || []) walk(o);
  return n;
}

/** Several parallel chains = "width" roots. */
function makeForest(seed: number, maxDepth: number, width: number): HoloComposition {
  const roots: HoloObjectDecl[] = [];
  for (let c = 0; c < width; c++) {
    roots.push(makeChain(seed + c * 9973, maxDepth));
  }
  return makeComposition(roots);
}

describe('[Paper-10] compile matrix — depth distribution harness', () => {
  it('depth × width × seeds: compile + histogram invariants', async () => {
    const compiler = new IncrementalCompiler();
    const tWall0 = performance.now();
    console.log(
      `\n[paper-10][compile-matrix] FULL=${FULL} SEEDS=${SEEDS} depths=[${[...DEPTHS].join(',')}] widths=[${[...WIDTHS].join(',')}]`
    );

    let cells = 0;
    for (let si = 0; si < SEEDS; si++) {
      const seed = 0x9e3779b9 + si * 31337;
      for (const depth of DEPTHS) {
        for (const width of WIDTHS) {
          const ast = makeForest(seed, depth, width);
          const t0 = performance.now();
          const result = await compiler.compile(ast, stubCompiler);
          const ms = performance.now() - t0;
          const hist = depthHistogram(ast);
          const total = countNodesComp(ast);
          expect(result.compiledCode.length).toBeGreaterThan(0);
          let sum = 0;
          for (const v of hist.values()) sum += v;
          expect(sum).toBe(total);
          if (si === 0 && depth === DEPTHS[0] && width === WIDTHS[0]) {
            const histStr = [...hist.entries()]
              .sort((a, b) => a[0] - b[0])
              .map(([k, v]) => `${k}:${v}`)
              .join(',');
            console.log(
              `[paper-10][sample] seed=${seed} depth=${depth} width=${width} nodes=${total} ms=${ms.toFixed(3)} hist=${histStr}`
            );
          }
          cells++;
        }
      }
    }

    const wallMs = performance.now() - tWall0;
    console.log(
      `[paper-10][compile-matrix] total cells=${cells} (seeds×depths×widths) wallMs=${wallMs.toFixed(1)}`
    );
    expect(cells).toBe(SEEDS * DEPTHS.length * WIDTHS.length);
  });
});
