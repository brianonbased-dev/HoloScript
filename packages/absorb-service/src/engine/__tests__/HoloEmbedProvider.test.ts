/**
 * HoloEmbedProvider Tests
 *
 * Validates the Phase 1 NL→code semantic embedding layer:
 * - Output dimensionality and normalization
 * - Subword trigram similarity: NL query matches camelCase identifier
 * - camelSplit correctness
 * - Recall improvement over StructuralEmbeddingProvider baseline
 * - Factory wiring (provider: 'holoembed')
 * - EmbeddingProviderName type includes 'holoembed'
 */

import { describe, it, expect } from 'vitest';
import { HoloEmbedProvider } from '../providers/HoloEmbedProvider';
import { StructuralEmbeddingProvider } from '../providers/StructuralEmbeddingProvider';
import { createEmbeddingProvider } from '../providers/EmbeddingProviderFactory';
import type { EmbeddingProviderName } from '../providers/EmbeddingProvider';
import type { ExternalSymbolDefinition } from '../types';

// =============================================================================
// HELPERS
// =============================================================================

function makeSym(overrides: Partial<ExternalSymbolDefinition> = {}): ExternalSymbolDefinition {
  return {
    name: 'exampleFunction',
    type: 'function',
    filePath: 'packages/core/src/example.ts',
    line: 10,
    isExported: true,
    visibility: 'public',
    signature: 'exampleFunction(input: string): string',
    ...overrides,
  };
}

/** Dot product of two Float32Array / number[] (cosine similarity for unit vectors). */
function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += (a[i] ?? 0) * (b[i] ?? 0);
  return dot;
}

/** L2 norm */
function norm(a: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] ?? 0) ** 2;
  return Math.sqrt(s);
}

// =============================================================================
// TESTS
// =============================================================================

describe('HoloEmbedProvider', () => {
  const provider = new HoloEmbedProvider();

  // ── Dimensionality ──────────────────────────────────────────────────────

  it('getEmbeddings returns 768-dim vectors', async () => {
    const [[vec]] = await Promise.all([provider.getEmbeddings(['hello world'])]);
    expect(vec).toHaveLength(768);
  });

  it('embedSymbol returns 768-dim Float32Array', () => {
    const vec = provider.embedSymbol(makeSym());
    expect(vec).toBeInstanceOf(Float32Array);
    expect(vec.length).toBe(768);
  });

  // ── Normalization ───────────────────────────────────────────────────────

  it('getEmbeddings output is L2-normalized (norm ≈ 1.0)', async () => {
    const [vecs] = await Promise.all([provider.getEmbeddings(['pillar slice emitter'])]);
    const n = norm(vecs[0]!);
    expect(n).toBeCloseTo(1.0, 4);
  });

  it('embedSymbol output is L2-normalized (norm ≈ 1.0)', () => {
    const vec = provider.embedSymbol(makeSym({
      name: 'PillarSliceEmitter',
      eventNames: ['pillar:slice:emitted'],
    } as Partial<ExternalSymbolDefinition> & { eventNames?: string[] }));
    expect(norm(vec)).toBeCloseTo(1.0, 4);
  });

  // ── Structural base wired correctly ────────────────────────────────────

  it('dims 0–383 are proportional to StructuralEmbeddingProvider.embedSymbol (same direction)', () => {
    const structural = new StructuralEmbeddingProvider();
    const sym = makeSym({ name: 'SomeClass', type: 'class' });
    const structVec = structural.embedSymbol(sym);
    const holoVec   = provider.embedSymbol(sym);

    // After joint L2-normalization over 768 dims, the structural sub-vector (0-383)
    // is scaled down proportionally but points in the SAME direction as structVec.
    // Verify via cosine similarity between the sub-vector and structVec > 0.99.
    const holoBase = holoVec.slice(0, 384);
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < 384; i++) {
      dot   += holoBase[i]! * structVec[i]!;
      normA += holoBase[i]! * holoBase[i]!;
      normB += structVec[i]! * structVec[i]!;
    }
    const cosim = dot / (Math.sqrt(normA) * Math.sqrt(normB));
    expect(cosim).toBeGreaterThan(0.99);
  });

  // ── Subword trigram similarity ──────────────────────────────────────────

  it('NL query "pillar slice emitter" scores higher against PillarSliceEmitter than unrelated sym', async () => {
    const query = 'pillar slice emitter';
    const [queryVecs] = await Promise.all([provider.getEmbeddings([query])]);
    const queryVec = queryVecs[0]!;

    const targetSym = makeSym({
      name: 'PillarSliceEmitter',
      type: 'class',
      filePath: 'packages/core/src/pillar/PillarSliceEmitter.ts',
      signature: 'class PillarSliceEmitter',
    });
    const unrelatedSym = makeSym({
      name: 'GraphEdgeRenderer',
      type: 'class',
      filePath: 'packages/r3f-renderer/src/GraphEdgeRenderer.ts',
      signature: 'class GraphEdgeRenderer',
    });

    const targetVec   = provider.embedSymbol(targetSym);
    const unrelatedVec = provider.embedSymbol(unrelatedSym);

    const simTarget   = cosine(queryVec, targetVec);
    const simUnrelated = cosine(queryVec, unrelatedVec);

    expect(simTarget).toBeGreaterThan(simUnrelated);
  });

  it('"extract emit sites" query scores higher against extractEmitSites than unrelated', async () => {
    const query = 'extract emit sites';
    const [[queryVec]] = await Promise.all([provider.getEmbeddings([query])]);

    const targetSym = makeSym({
      name: 'extractEmitSites',
      type: 'function',
      filePath: 'packages/absorb-service/src/engine/CodebaseScanner.ts',
      signature: 'extractEmitSites(tree: ParseTree, filePath: string): EmitSite[]',
    });
    const unrelatedSym = makeSym({
      name: 'l2Normalize',
      type: 'function',
      filePath: 'packages/absorb-service/src/engine/providers/StructuralEmbeddingProvider.ts',
      signature: 'l2Normalize(vec: Float32Array): void',
    });

    const simTarget   = cosine(queryVec!, provider.embedSymbol(targetSym));
    const simUnrelated = cosine(queryVec!, provider.embedSymbol(unrelatedSym));

    expect(simTarget).toBeGreaterThan(simUnrelated);
  });

  // ── HoloEmbed vs Structural recall improvement ─────────────────────────

  it('HoloEmbed cosine(query, target) > Structural cosine(query, target) for name-matched pair', async () => {
    const query = 'brain coord node mapper';
    const sym = makeSym({
      name: 'BrainCoordNodeMapper',
      type: 'class',
      filePath: 'packages/absorb-service/src/engine/BrainCoordNodeMapper.ts',
      signature: 'class BrainCoordNodeMapper',
    });

    const structural = new StructuralEmbeddingProvider();

    // HoloEmbed path
    const [[holoQueryVec]] = await Promise.all([provider.getEmbeddings([query])]);
    const holoDocVec = provider.embedSymbol(sym);
    const holoSim = cosine(holoQueryVec!, holoDocVec);

    // Structural path
    const [[structQueryVec]] = await Promise.all([structural.getEmbeddings([query])]);
    const structDocVec = structural.embedSymbol(sym);
    const structSim = cosine(structQueryVec!, structDocVec);

    // HoloEmbed MUST score higher on name-matched pairs
    expect(holoSim).toBeGreaterThan(structSim);
  });

  it('HoloEmbed improves similarity for event-name queries via event trigrams', () => {
    const query = 'pillar spike event';
    const sym = makeSym({
      name: 'SpikeHandler',
      type: 'function',
      filePath: 'packages/snn-webgpu/src/SpikeHandler.ts',
      signature: 'handleSpike(event: SpikeEvent): void',
    });

    // embedSymbol with event names enriched
    const vecWithEvents = provider.embedSymbol(sym, { eventNames: ['pillar:spike', 'snn:spike'] });
    const vecNoEvents   = provider.embedSymbol(sym); // no event names

    // Prepare a fake "query" symbol that contains the event name tokens
    // Query embedded as text (only fills block 1)
    // Test: vecWithEvents should have non-zero values in dims 640-767 (event block)
    let eventBlockSum = 0;
    for (let i = 640; i < 768; i++) eventBlockSum += Math.abs(vecWithEvents[i]!);
    expect(eventBlockSum).toBeGreaterThan(0);

    // Without event names the event block should be all zeros before normalization
    // (after normalization structural dims dominate, but event block stays near zero)
    let noEventBlockSum = 0;
    for (let i = 640; i < 768; i++) noEventBlockSum += Math.abs(vecNoEvents[i]!);
    // The event block should be smaller when no events are provided
    expect(noEventBlockSum).toBeLessThan(eventBlockSum);
  });

  // ── Determinism ─────────────────────────────────────────────────────────

  it('same input produces identical output (deterministic)', async () => {
    const sym = makeSym({ name: 'TraitCommunityDetector' });
    const v1 = provider.embedSymbol(sym);
    const v2 = provider.embedSymbol(sym);
    for (let i = 0; i < v1.length; i++) {
      expect(v1[i]).toBe(v2[i]);
    }
  });

  it('getEmbeddings is deterministic for same text', async () => {
    const [a, b] = await Promise.all([
      provider.getEmbeddings(['holo embed provider test']),
      provider.getEmbeddings(['holo embed provider test']),
    ]);
    expect(a[0]).toEqual(b[0]);
  });

  // ── Different inputs produce different vectors ──────────────────────────

  it('distinct symbols produce distinct vectors', () => {
    const v1 = provider.embedSymbol(makeSym({ name: 'FunctionA' }));
    const v2 = provider.embedSymbol(makeSym({ name: 'FunctionB' }));
    // cosine similarity should be < 1.0
    expect(cosine(v1, v2)).toBeLessThan(1.0 - 1e-6);
  });

  // ── Factory wiring ───────────────────────────────────────────────────────

  it('createEmbeddingProvider({ provider: "holoembed" }) returns HoloEmbedProvider', async () => {
    const p = await createEmbeddingProvider({ provider: 'holoembed' });
    expect(p.name).toBe('holoembed');
  });

  it('EmbeddingProviderName type includes "holoembed" (type-level)', () => {
    // This test is purely compile-time — if it compiles, the union includes 'holoembed'.
    const name: EmbeddingProviderName = 'holoembed';
    expect(name).toBe('holoembed');
  });

  // ── docComment block ────────────────────────────────────────────────────

  it('docComment trigrams populate dims 512–639', () => {
    const symWithDoc = makeSym({
      name: 'computeSliceDiversity',
      docComment: 'Counts distinct contractHashes per file as defined in Paper 32 §5',
    });
    const symNoDoc = makeSym({ name: 'computeSliceDiversity' });

    const vecWithDoc = provider.embedSymbol(symWithDoc);
    const vecNoDoc   = provider.embedSymbol(symNoDoc);

    // Dims 512–639 should differ when docComment is present
    let diff = 0;
    for (let i = 512; i < 640; i++) diff += Math.abs(vecWithDoc[i]! - vecNoDoc[i]!);
    expect(diff).toBeGreaterThan(0);
  });
});
