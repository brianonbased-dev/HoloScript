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
  requireNativeGraphRAGProvider,
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

  it('coerces non-native EMBEDDING_PROVIDER overrides to HoloEmbed (self-heal, not refuse)', async () => {
    // A stale session export (`openai`) is ambient shadow config, not an
    // explicit agent request — the shared absorb path self-heals to the
    // sovereign provider instead of bricking every absorb.
    vi.stubEnv('EMBEDDING_PROVIDER', 'openai');
    vi.stubEnv('OPENAI_API_KEY', 'present-but-ignored');

    await expect(detectBestEmbeddingProvider()).resolves.toBe('holoembed');
  });

  it('accepts HoloEmbed as the only explicit provider override', async () => {
    vi.stubEnv('EMBEDDING_PROVIDER', ' HoloEmbed ');

    await expect(detectBestEmbeddingProvider()).resolves.toBe('holoembed');
  });

  it('maps structural legacy overrides to HoloEmbed', async () => {
    vi.stubEnv('EMBEDDING_PROVIDER', ' Structural ');

    await expect(detectBestEmbeddingProvider()).resolves.toBe('holoembed');
  });

  it('coerces an ambient Ollama env override to HoloEmbed', async () => {
    // HoloLlama/Ollama may serve LLM synthesis, but shared Absorb indexes stay
    // in the canonical HoloGraph + HoloEmbed vector space — ambient env never
    // routes shared embeddings elsewhere, it self-heals to holoembed.
    vi.stubEnv('EMBEDDING_PROVIDER', ' Ollama ');

    await expect(detectBestEmbeddingProvider()).resolves.toBe('holoembed');
  });

  it('coerces ambient cloud-provider env overrides to HoloEmbed', async () => {
    vi.stubEnv('EMBEDDING_PROVIDER', 'xenova');

    await expect(detectBestEmbeddingProvider()).resolves.toBe('holoembed');
  });

  it('still fails closed on an explicit non-native embeddingProvider argument', () => {
    // Coercion is for ambient env only; an agent naming an external provider
    // per-call is a real error and keeps the fail-closed contract.
    expect(() => requireNativeGraphRAGProvider('openai', 'embeddingProvider argument')).toThrow(
      /not valid shared GraphRAG embedding providers/
    );
  });

  it('defaults to HoloEmbed even when external provider credentials exist', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'present-but-not-default');

    await expect(detectBestEmbeddingProvider()).resolves.toBe('holoembed');
  });

  it('defaults to HoloEmbed even when local Ollama environment is present', async () => {
    vi.stubEnv('OLLAMA_URL', 'http://localhost:11434');
    vi.stubEnv('OLLAMA_MODEL', 'nomic-embed-text');

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
