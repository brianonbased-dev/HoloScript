/**
 * Paper-10 §3.2 — Provenance-aware BuildCache wiring
 *
 * Validates that:
 * 1. BuildCache exposes content-addressable get/set via SHA-256 provenance hash
 * 2. IncrementalCompiler uses BuildCache (via buildCache option) for cross-session
 *    persistence keyed by the same hash as deploy/provenance.computeContentHash()
 * 3. A re-created IncrementalCompiler instance hits the cache without recompiling
 *    (same source → same hash → cache hit on second session)
 *
 * Cross-layer contract (paper-10 §3.2):
 *   deploy/provenance.computeContentHash(source) ≡ BuildCache provenance key
 *
 * @see packages/core/src/compiler/BuildCache.ts  getByProvenanceHash / setByProvenanceHash
 * @see packages/core/src/compiler/IncrementalCompiler.ts  buildCache option
 * @see packages/core/src/deploy/provenance.ts  computeContentHash
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { BuildCache } from '../BuildCache';
import { IncrementalCompiler } from '../IncrementalCompiler';
import { computeContentHash } from '../../deploy/provenance';
import type { HoloComposition, HoloObjectDecl } from '../../parser/HoloCompositionTypes';

// ── Helpers ────────────────────────────────────────────────────────────────

const BASE_DIR = join(tmpdir(), `hs-paper10-prov-${process.pid}`);

function makeCacheDir(suffix: string): string {
  const dir = join(BASE_DIR, suffix);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function makeComposition(name: string, objects: HoloObjectDecl[]): HoloComposition {
  return { name, objects } as unknown as HoloComposition;
}

function makeObject(name: string, traits: string[]): HoloObjectDecl {
  return {
    name,
    traits,
    properties: [],
    children: [],
  } as unknown as HoloObjectDecl;
}

/** Simple object compiler stub that returns deterministic output. */
function stubCompiler(obj: HoloObjectDecl): string {
  return `/* compiled: ${obj.name} traits=[${(obj.traits as string[]).join(',')}] */`;
}

// ── BuildCache provenance-hash API ─────────────────────────────────────────

describe('[Paper-10 §3.2] BuildCache provenance-hash API', () => {
  let cache: BuildCache;
  let cacheDir: string;

  beforeEach(async () => {
    cacheDir = makeCacheDir(`bc-${Date.now()}`);
    cache = new BuildCache({ cacheDir, version: '1.0.0', debug: false });
    await cache.initialize();
  });

  afterEach(() => {
    try {
      if (existsSync(cacheDir)) rmSync(cacheDir, { recursive: true, force: true });
    } catch {}
  });

  it('returns miss for unknown provenance hash', async () => {
    const result = await cache.getByProvenanceHash('a'.repeat(64), 'compiled');
    expect(result.hit).toBe(false);
    expect(result.reason).toBe('not_found');
  });

  it('setByProvenanceHash / getByProvenanceHash round-trip', async () => {
    const source = 'object Ball @collidable { geometry: "sphere" }';
    const hash = computeContentHash(source);

    await cache.setByProvenanceHash(hash, 'compiled', { code: '/* Ball */', nodeCount: 1 });
    const result = await cache.getByProvenanceHash<{ code: string; nodeCount: number }>(
      hash,
      'compiled'
    );

    expect(result.hit).toBe(true);
    expect(result.entry!.data.code).toBe('/* Ball */');
    expect(result.entry!.meta.sourceHash).toBe(hash);
  });

  it('hash produced by computeContentHash is a 64-hex SHA-256 string', () => {
    const hash = computeContentHash('hello provenance');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('same source content → same provenance hash (content-addressable contract)', () => {
    const source = 'composition "Scene" { object A @glowing {} }';
    const h1 = computeContentHash(source);
    const h2 = computeContentHash(source);
    expect(h1).toBe(h2);
  });

  it('different source content → different provenance hash', () => {
    const h1 = computeContentHash('object A @collidable {}');
    const h2 = computeContentHash('object A @grabbable {}');
    expect(h1).not.toBe(h2);
  });

  it('each entry type is stored independently under the same provenance hash', async () => {
    const hash = computeContentHash('shared source');

    await cache.setByProvenanceHash(hash, 'ast', { nodes: 5 });
    await cache.setByProvenanceHash(hash, 'compiled', { code: '...' });

    const astResult = await cache.getByProvenanceHash(hash, 'ast');
    const compiledResult = await cache.getByProvenanceHash(hash, 'compiled');

    expect(astResult.hit).toBe(true);
    expect(compiledResult.hit).toBe(true);
    expect((astResult.entry!.data as { nodes: number }).nodes).toBe(5);
  });
});

// ── IncrementalCompiler × BuildCache wiring ────────────────────────────────

describe('[Paper-10 §3.2] IncrementalCompiler provenance-keyed cross-session caching', () => {
  let cacheDir: string;

  beforeEach(() => {
    cacheDir = makeCacheDir(`ic-${Date.now()}`);
  });

  afterEach(() => {
    try {
      if (existsSync(cacheDir)) rmSync(cacheDir, { recursive: true, force: true });
    } catch {}
  });

  /**
   * Session A: compile a composition. Session B: different IncrementalCompiler
   * instance backed by the SAME BuildCache → objects should be served from cache
   * without invoking the stub compiler.
   */
  it('cross-session: second compiler instance hits provenance cache (no recompile)', async () => {
    const ast = makeComposition('Scene', [
      makeObject('Ball', ['collidable', 'physics']),
      makeObject('Cube', ['grabbable']),
    ]);

    const cache = new BuildCache({ cacheDir, version: '1.0.0' });

    // --- Session A ---
    const compilerA = new IncrementalCompiler(undefined, { buildCache: cache });
    const compilerCallsA: string[] = [];
    await compilerA.compile(ast, (obj) => {
      compilerCallsA.push(obj.name);
      return stubCompiler(obj);
    });

    expect(compilerCallsA).toEqual(expect.arrayContaining(['Ball', 'Cube']));

    // --- Session B: fresh IncrementalCompiler, same cache ---
    const compilerB = new IncrementalCompiler(undefined, { buildCache: cache });
    const compilerCallsB: string[] = [];
    const resultB = await compilerB.compile(ast, (obj) => {
      compilerCallsB.push(obj.name);
      return stubCompiler(obj);
    });

    // Session B: all objects already in cache → no recompilation
    expect(compilerCallsB).toHaveLength(0);
    expect(resultB.cachedObjects).toEqual(expect.arrayContaining(['Ball', 'Cube']));
    expect(resultB.recompiledObjects).toHaveLength(0);
  });

  it('changed object invalidates only that object in next session', async () => {
    const cache = new BuildCache({ cacheDir, version: '1.0.0' });

    const astV1 = makeComposition('Scene', [
      makeObject('Ball', ['collidable']),
      makeObject('Light', ['emissive']),
    ]);

    // Session A: compile both
    const compilerA = new IncrementalCompiler(undefined, { buildCache: cache });
    await compilerA.compile(astV1, stubCompiler);

    // V2: Ball traits changed, Light unchanged
    const astV2 = makeComposition('Scene', [
      makeObject('Ball', ['collidable', 'physics']), // changed
      makeObject('Light', ['emissive']),              // unchanged
    ]);

    // Session B: Ball content hash differs → recompile Ball; Light hash same → cache hit
    const compilerB = new IncrementalCompiler(undefined, { buildCache: cache });
    const recompiledB: string[] = [];
    const resultB = await compilerB.compile(astV2, (obj) => {
      recompiledB.push(obj.name);
      return stubCompiler(obj);
    });

    expect(recompiledB).toContain('Ball');
    expect(resultB.cachedObjects).toContain('Light');
  });

  it('compiledCode output is identical when served from provenance cache', async () => {
    const cache = new BuildCache({ cacheDir, version: '1.0.0' });
    const ast = makeComposition('Scene', [makeObject('Sphere', ['transparent', 'reflective'])]);

    const compilerA = new IncrementalCompiler(undefined, { buildCache: cache });
    const resultA = await compilerA.compile(ast, stubCompiler);

    const compilerB = new IncrementalCompiler(undefined, { buildCache: cache });
    const resultB = await compilerB.compile(ast, stubCompiler);

    expect(resultB.compiledCode).toBe(resultA.compiledCode);
  });

  it('without buildCache option behaves as before (no regression)', async () => {
    const ast = makeComposition('Scene', [makeObject('Box', ['collidable'])]);
    const compiler = new IncrementalCompiler(); // no buildCache
    const result = await compiler.compile(ast, stubCompiler);
    expect(result.compiledCode).toContain('Box');
  });
});
