export const GRAPH_RAG_EMBEDDING_POLICY_VERSION =
  'holoscript.graphrag.embedding-policy.v1' as const;
export const NATIVE_GRAPH_RAG_PROVIDER = 'holoembed' as const;
export const LEGACY_GRAPH_RAG_PROVIDER_ALIASES = ['structural'] as const;

/**
 * Sovereign LOCAL providers permitted beside HoloEmbed. `ollama` runs a learned
 * encoder (e.g. nomic-embed-text) on-device at a loopback URL — $0, no cloud
 * call — so it satisfies the sovereignty intent while giving mean-based semantic
 * search. External/cloud providers (openai, remote xenova) stay forbidden. The
 * "no mixed embedding spaces in a shared cache" guarantee is preserved by the
 * cache layer, which rejects a cache built by a different provider.
 */
export const SOVEREIGN_LOCAL_GRAPH_RAG_PROVIDERS = ['ollama'] as const;

export type NativeGraphRAGProvider = typeof NATIVE_GRAPH_RAG_PROVIDER;
export type SovereignLocalGraphRAGProvider =
  (typeof SOVEREIGN_LOCAL_GRAPH_RAG_PROVIDERS)[number];
export type SovereignGraphRAGProvider =
  | NativeGraphRAGProvider
  | SovereignLocalGraphRAGProvider;

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
): SovereignGraphRAGProvider {
  const normalized = providerName.trim().toLowerCase();
  if ((LEGACY_GRAPH_RAG_PROVIDER_ALIASES as readonly string[]).includes(normalized)) {
    return NATIVE_GRAPH_RAG_PROVIDER;
  }
  if ((SOVEREIGN_LOCAL_GRAPH_RAG_PROVIDERS as readonly string[]).includes(normalized)) {
    return normalized as SovereignLocalGraphRAGProvider;
  }
  if (normalized !== NATIVE_GRAPH_RAG_PROVIDER) {
    throw new Error(
      `GraphRAG embedding provider must be ${NATIVE_GRAPH_RAG_PROVIDER} or a sovereign local provider (${SOVEREIGN_LOCAL_GRAPH_RAG_PROVIDERS.join(
        ', '
      )}); ${source} requested ${normalized}. External/cloud providers are disabled.`
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
      'HoloScript GraphRAG uses HoloGraph plus HoloEmbed, or a sovereign LOCAL learned encoder (Ollama at a loopback URL, e.g. nomic-embed-text), for every project. External/cloud embedding providers are disabled, and the cache rejects any index built by a different provider, so mixed embedding spaces cannot enter shared GraphRAG caches.',
  };
}
