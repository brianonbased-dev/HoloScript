export const GRAPH_RAG_EMBEDDING_POLICY_VERSION =
  'holoscript.graphrag.embedding-policy.v1' as const;
export const NATIVE_GRAPH_RAG_PROVIDER = 'holoembed' as const;
export const LEGACY_GRAPH_RAG_PROVIDER_ALIASES = ['structural'] as const;

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
      `GraphRAG embedding provider must be ${NATIVE_GRAPH_RAG_PROVIDER}; ${source} requested ${normalized}. Fix HoloEmbed instead of falling back.`
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
      'HoloScript GraphRAG uses HoloGraph plus HoloEmbed for every project. External embedding providers are disabled so mixed embedding spaces cannot enter shared GraphRAG caches.',
  };
}
