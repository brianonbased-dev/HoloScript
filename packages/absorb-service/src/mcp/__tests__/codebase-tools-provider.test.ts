import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  detectBestEmbeddingProvider,
  handleCodebaseTool,
  resetDetectedEmbeddingProviderForTests,
  resetCodebaseToolStateForTests,
} from '../codebase-tools';
import {
  buildGraphRAGEmbeddingPolicyReceipt,
  GRAPH_RAG_EMBEDDING_POLICY_VERSION,
} from '../graph-rag-embedding-policy';

describe('detectBestEmbeddingProvider', () => {
  beforeEach(() => {
    resetCodebaseToolStateForTests();
    resetDetectedEmbeddingProviderForTests();
    vi.stubEnv('EMBEDDING_PROVIDER', '');
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('OLLAMA_URL', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetCodebaseToolStateForTests();
    resetDetectedEmbeddingProviderForTests();
  });

  it('rejects non-native EMBEDDING_PROVIDER overrides', async () => {
    vi.stubEnv('EMBEDDING_PROVIDER', 'openai');
    vi.stubEnv('OPENAI_API_KEY', 'present-but-ignored');

    await expect(detectBestEmbeddingProvider()).rejects.toThrow(
      /GraphRAG embedding provider must be holoembed/
    );
  });

  it('accepts HoloEmbed as the only explicit provider override', async () => {
    vi.stubEnv('EMBEDDING_PROVIDER', ' HoloEmbed ');

    await expect(detectBestEmbeddingProvider()).resolves.toBe('holoembed');
  });

  it('maps structural legacy overrides to HoloEmbed', async () => {
    vi.stubEnv('EMBEDDING_PROVIDER', ' Structural ');

    await expect(detectBestEmbeddingProvider()).resolves.toBe('holoembed');
  });

  it('defaults to HoloEmbed even when external provider credentials exist', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'present-but-not-default');

    await expect(detectBestEmbeddingProvider()).resolves.toBe('holoembed');
  });

  it('caches the native provider for the session', async () => {
    await expect(detectBestEmbeddingProvider()).resolves.toBe('holoembed');

    vi.stubEnv('EMBEDDING_PROVIDER', 'structural');

    await expect(detectBestEmbeddingProvider()).resolves.toBe('holoembed');
  });

  it('emits a stable GraphRAG embedding policy receipt', () => {
    expect(buildGraphRAGEmbeddingPolicyReceipt()).toMatchObject({
      schemaVersion: GRAPH_RAG_EMBEDDING_POLICY_VERSION,
      kind: 'GraphRAGEmbeddingPolicy',
      provider: 'holoembed',
      acceptedAliases: ['structural'],
      externalProvidersAllowed: false,
      externalFallbacksAllowed: false,
    });
  });

  it('reports the GraphRAG embedding policy in graph status', async () => {
    const status = await handleCodebaseTool('holo_graph_status', {});

    expect(status).toMatchObject({
      embeddingPolicy: {
        schemaVersion: GRAPH_RAG_EMBEDDING_POLICY_VERSION,
        provider: 'holoembed',
        externalProvidersAllowed: false,
        externalFallbacksAllowed: false,
      },
    });
  });
});
