/**
 * Shared copy for MCP / Graph RAG prerequisites so agents see consistent next steps.
 */

export const ABSORB_HOLO_ABSORB_REPO_HINT =
  'Run holo_absorb_repo with rootDir set to the repository root, then retry this tool.';

/** GraphRAG engine + embedding index not initialized (after holo_absorb_repo). */
export const ABSORB_GRAPH_RAG_ENGINE_ERROR =
  'No Graph RAG engine initialized. Call holo_absorb_repo first with rootDir pointing to the project root.';

/** Embedding index missing while graph may exist (partial init). */
export const ABSORB_EMBEDDING_INDEX_ERROR =
  'No embedding index built. Call holo_absorb_repo first (embeddings are built automatically during absorb).';

/** No in-memory graph and no disk cache for codebase tools. */
export const ABSORB_CODEBASE_LOAD_ERROR =
  'No codebase loaded and no disk cache found. Call holo_absorb_repo first with rootDir pointing to the project root.';
