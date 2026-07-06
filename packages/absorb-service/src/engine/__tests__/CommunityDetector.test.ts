import { describe, it, expect } from 'vitest';
import { CommunityDetector } from '../CommunityDetector';
import type { ImportEdge } from '../types';

/** Minimal import edge (only fromFile + resolvedPath matter to the detector). */
function imp(fromFile: string, resolvedPath: string): ImportEdge {
  return { fromFile, toModule: resolvedPath, resolvedPath, line: 1 };
}

function communityOf(communities: Map<string, string[]>): Map<string, string> {
  const m = new Map<string, string>();
  for (const [comm, files] of communities) for (const f of files) m.set(f, comm);
  return m;
}

describe('CommunityDetector', () => {
  it('separates two dense clusters joined by one weak bridge (louvain, not the directory fallback)', () => {
    // Both clusters live under src/ so the directoryGrouping fallback (keyed on the
    // FIRST path segment) would merge them into one 'src' group — this test only
    // passes if louvain actually runs and finds the two module boundaries.
    const A = Array.from({ length: 6 }, (_, i) => `src/a/a${i}.ts`);
    const B = Array.from({ length: 6 }, (_, i) => `src/b/b${i}.ts`);
    const files = [...A, ...B];
    const imports: ImportEdge[] = [];
    for (let i = 0; i < A.length; i++) for (let j = 0; j < A.length; j++) if (i !== j) imports.push(imp(A[i], A[j]));
    for (let i = 0; i < B.length; i++) for (let j = 0; j < B.length; j++) if (i !== j) imports.push(imp(B[i], B[j]));
    imports.push(imp(A[0], B[0])); // single weak bridge

    const communities = new CommunityDetector().detect(files, imports, []);
    const commOf = communityOf(communities);

    const aComms = new Set(A.map((f) => commOf.get(f)));
    const bComms = new Set(B.map((f) => commOf.get(f)));
    expect(aComms.size).toBe(1); // all of A in one community
    expect(bComms.size).toBe(1); // all of B in one community
    expect([...aComms][0]).not.toBe([...bComms][0]); // A and B are distinct communities
  });

  it('returns a bounded response on a large graph without the O(V^2) hang', () => {
    // ~2000 nodes in 20 dense clusters. The old louvain recomputed per-community
    // degree with a full O(V) scan for every node every pass -> O(iterations*V^2),
    // which hung holo_impact_analysis for 300s+. The incremental version is O(V+E).
    const CLUSTERS = 20;
    const PER = 100;
    const files: string[] = [];
    const imports: ImportEdge[] = [];
    for (let c = 0; c < CLUSTERS; c++) {
      const g: string[] = [];
      for (let n = 0; n < PER; n++) {
        const f = `src/c${c}/f${n}.ts`;
        g.push(f);
        files.push(f);
      }
      for (let n = 0; n < PER; n++) {
        imports.push(imp(g[n], g[(n + 1) % PER]));
        imports.push(imp(g[n], g[(n + 2) % PER]));
      }
      if (c > 0) imports.push(imp(g[0], `src/c${c - 1}/f0.ts`)); // weak inter-cluster bridge
    }

    const t0 = performance.now();
    const communities = new CommunityDetector().detect(files, imports, []);
    const elapsedMs = performance.now() - t0;

    let assigned = 0;
    for (const [, fl] of communities) assigned += fl.length;
    expect(assigned).toBe(files.length); // every file assigned to a community
    expect(elapsedMs).toBeLessThan(5000); // bounded; the O(V^2) version took minutes
  });
});
