import { describe, expect, it } from 'vitest';
import {
  ABSORB_GEV_PACKAGE_NAME,
  CodebaseGraph,
  EmbeddingIndex,
  GraphRAGEngine,
  HoloEmbedProvider,
  buildAbsorbGevPackageReceipt,
  buildGraphRAGEmbeddingPolicyReceipt,
} from './index';

describe('Absorb GEV package surface', () => {
  it('exports graph, embedding, vector, and GraphRAG primitives from one package entry', () => {
    expect(ABSORB_GEV_PACKAGE_NAME).toBe('@holoscript/absorb-service/gev');
    expect(typeof CodebaseGraph).toBe('function');
    expect(typeof EmbeddingIndex).toBe('function');
    expect(typeof GraphRAGEngine).toBe('function');
    expect(new HoloEmbedProvider().name).toBe('holoembed');
  });

  it('emits a receipt that makes Absorb the canonical GEV package boundary', () => {
    expect(buildAbsorbGevPackageReceipt()).toMatchObject({
      packageName: '@holoscript/absorb-service/gev',
      canonicalPackage: '@holoscript/absorb-service',
      lanes: ['graph', 'embed', 'vector', 'rag'],
      graphProvider: 'holograph',
      embeddingProvider: 'holoembed',
      standaloneGraphRagPackage: false,
      standaloneEmbedConsumerPackage: false,
    });
    expect(buildGraphRAGEmbeddingPolicyReceipt()).toMatchObject({
      provider: 'holoembed',
      externalFallbacksAllowed: false,
    });
  });
});
