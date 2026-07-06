export const GRAPH_RAG_EMBEDDING_POLICY_VERSION =
  'holoscript.graphrag.embedding-policy.v1' as const;
export const NATIVE_GRAPH_RAG_PROVIDER = 'holoembed' as const;
export const LEGACY_GRAPH_RAG_PROVIDER_ALIASES = ['structural'] as const;

/**
 * Shared project GraphRAG has one native embedding space: HoloGraph + HoloEmbed.
 * Low-level factory providers such as Ollama, OpenAI, and Xenova are useful for
 * isolated experiments, but they must not enter shared Absorb caches. Local model
 * serving belongs in HoloLlama / LLM synthesis, not the embedding substrate.
 */
export type NativeGraphRAGProvider = typeof NATIVE_GRAPH_RAG_PROVIDER;

export interface GraphRAGEmbeddingPolicyReceipt {
  schemaVersion: typeof GRAPH_RAG_EMBEDDING_POLICY_VERSION;
  kind: 'GraphRAGEmbeddingPolicy';
  provider: NativeGraphRAGProvider;
  acceptedAliases: readonly string[];
  externalProvidersAllowed: false;
  externalFallbacksAllowed: false;
  policy: string;
}

export function requireNativeGraphRAGProvider(
  providerName: string,
  source: string
): NativeGraphRAGProvider {
  const normalized = providerName.trim().toLowerCase();
  if ((LEGACY_GRAPH_RAG_PROVIDER_ALIASES as readonly string[]).includes(normalized)) {
    return NATIVE_GRAPH_RAG_PROVIDER;
  }
  if (normalized !== NATIVE_GRAPH_RAG_PROVIDER) {
    throw new Error(
      `GraphRAG embedding provider must be ${NATIVE_GRAPH_RAG_PROVIDER}; ${source} requested ${normalized}. structural is a legacy alias. Ollama/HoloLlama and cloud embedding providers are not valid shared GraphRAG embedding providers.`
    );
  }
  return NATIVE_GRAPH_RAG_PROVIDER;
}

export function buildGraphRAGEmbeddingPolicyReceipt(): GraphRAGEmbeddingPolicyReceipt {
  return {
    schemaVersion: GRAPH_RAG_EMBEDDING_POLICY_VERSION,
    kind: 'GraphRAGEmbeddingPolicy',
    provider: NATIVE_GRAPH_RAG_PROVIDER,
    acceptedAliases: LEGACY_GRAPH_RAG_PROVIDER_ALIASES,
    externalProvidersAllowed: false,
    externalFallbacksAllowed: false,
    policy:
      'HoloScript GraphRAG uses HoloGraph plus HoloEmbed for every shared project cache. structural is accepted only as a legacy alias and maps to holoembed. Ollama/HoloLlama may serve LLM synthesis, and low-level factory providers may support isolated experiments, but they are not valid shared GraphRAG embedding providers.',
  };
}
