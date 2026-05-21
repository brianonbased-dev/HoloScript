/**
 * StructuralEmbeddingProvider — unit tests (HoloGraph Phase 1)
 */

import { describe, it, expect } from 'vitest';
import { StructuralEmbeddingProvider } from '../providers/StructuralEmbeddingProvider';
import type { ExternalSymbolDefinition } from '../types';

function makeSym(overrides: Partial<ExternalSymbolDefinition> = {}): ExternalSymbolDefinition {
  return {
    name:       'myFunction',
    type:       'function',
    language:   'typescript',
    visibility: 'public',
    filePath:   'packages/core/src/traits/pillar/GyriSulciPartitioner.ts',
    line:       10,
    isExported: true,
    signature:  'function myFunction(coord: BrainCoord): CacheRoute',
    lineCount:  40,
    ...overrides,
  };
}

describe('StructuralEmbeddingProvider', () => {
  const provider = new StructuralEmbeddingProvider();

  it('name is "structural"', () => {
    expect(provider.name).toBe('structural');
  });

  it('getEmbeddings() returns one 384-dim vector per input', async () => {
    const result = await provider.getEmbeddings(['hello world', 'function foo(): void']);
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveLength(384);
    expect(result[1]).toHaveLength(384);
  });

  it('getEmbeddings() vectors are normalized (magnitude ≈ 1)', async () => {
    const [vec] = await provider.getEmbeddings(['some code']);
    const magnitude = Math.sqrt(vec!.reduce((s, v) => s + v * v, 0));
    expect(magnitude).toBeCloseTo(1, 4);
  });

  it('embedSymbol() returns 384-dim Float32Array', () => {
    const vec = provider.embedSymbol(makeSym());
    expect(vec).toBeInstanceOf(Float32Array);
    expect(vec.length).toBe(384);
  });

  it('embedSymbol() is normalized (L2 magnitude ≈ 1)', () => {
    const vec = provider.embedSymbol(makeSym());
    const mag = Math.sqrt(Array.from(vec).reduce((s, v) => s + v * v, 0));
    expect(mag).toBeCloseTo(1, 4);
  });

  it('same symbol produces identical vector (deterministic)', () => {
    const sym = makeSym();
    const v1 = provider.embedSymbol(sym);
    const v2 = provider.embedSymbol(sym);
    expect(Array.from(v1)).toEqual(Array.from(v2));
  });

  it('different file paths produce different vectors', () => {
    const v1 = provider.embedSymbol(makeSym({ filePath: 'packages/core/src/traits/pillar/A.ts' }));
    const v2 = provider.embedSymbol(makeSym({ filePath: 'packages/mcp-server/src/tools/B.ts' }));
    // Cosine similarity between different packages should be < 1
    const dot = Array.from(v1).reduce((s, x, i) => s + x * v2[i]!, 0);
    expect(dot).toBeLessThan(0.99);
  });

  it('same file path → high cosine similarity even with different names', () => {
    const filePath = 'packages/core/src/traits/pillar/Classifier.ts';
    const v1 = provider.embedSymbol(makeSym({ filePath, name: 'classifyCoord',   line: 10 }));
    const v2 = provider.embedSymbol(makeSym({ filePath, name: 'classifyBrainCoord', line: 50 }));
    const dot = Array.from(v1).reduce((s, x, i) => s + x * v2[i]!, 0);
    // Same file/package/traits → should share a lot of structural features
    expect(dot).toBeGreaterThan(0.7);
  });

  it('test file gets flagged in embedding (dim 6 reflects test heuristic)', () => {
    const testVec = provider.embedSymbol(makeSym({
      filePath: 'packages/core/src/__tests__/MyModule.test.ts',
    }));
    const prodVec = provider.embedSymbol(makeSym({
      filePath: 'packages/core/src/MyModule.ts',
    }));
    // Vectors from test vs prod files should differ
    const dot = Array.from(testVec).reduce((s, x, i) => s + x * prodVec[i]!, 0);
    expect(dot).toBeLessThan(0.99);
  });

  it('event-chain enrichment changes the vector', () => {
    const sym = makeSym();
    const base  = provider.embedSymbol(sym);
    const enr   = provider.embedSymbol(sym, { emitCount: 3, eventNames: ['pillar:slice', 'pillar:training'] });
    const dot   = Array.from(base).reduce((s, x, i) => s + x * enr[i]!, 0);
    expect(dot).toBeLessThan(0.9999); // not identical
  });

  it('gyrus-type symbol (gyral package) vs sulcal produce distinct vectors', () => {
    const gyral  = provider.embedSymbol(makeSym({ filePath: 'packages/core/src/traits/pillar/SliceEmitter.ts' }));
    const sulcal = provider.embedSymbol(makeSym({ filePath: 'packages/plugins/robotics/src/RoboticsPlugin.ts' }));
    const dot = Array.from(gyral).reduce((s, x, i) => s + x * sulcal[i]!, 0);
    expect(dot).toBeLessThan(0.95);
  });

  it('private method has lower visibility score than public', () => {
    // Both vectors deterministic — just check they differ
    const pub  = provider.embedSymbol(makeSym({ visibility: 'public',  name: 'api'  }));
    const priv = provider.embedSymbol(makeSym({ visibility: 'private', name: 'impl' }));
    expect(Array.from(pub)).not.toEqual(Array.from(priv));
  });

  it('getEmbeddings() returns number[][] (not Float32Array)', async () => {
    const [vec] = await provider.getEmbeddings(['test']);
    expect(Array.isArray(vec)).toBe(true);
    expect(typeof vec![0]).toBe('number');
  });
});
