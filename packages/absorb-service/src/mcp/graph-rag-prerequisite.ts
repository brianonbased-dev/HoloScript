/**
 * Shared copy for MCP / Graph RAG prerequisites so agents see consistent next steps.
 */

export const ABSORB_HOLO_ABSORB_REPO_HINT =
  'Run holo_absorb_repo with rootDir set to the repository root (or sourceFiles for inline upload), then retry this tool.';

/** Codebase graph is not loaded from memory or disk cache. */
export const ABSORB_CODEBASE_LOAD_ERROR =
  'No codebase graph loaded in memory or disk cache. Call holo_absorb_repo first.';

/** GraphRAG engine + embedding index not initialized (after holo_absorb_repo). */
export const ABSORB_GRAPH_RAG_ENGINE_ERROR =
  'No Graph RAG engine initialized. Call holo_absorb_repo first with rootDir pointing to the project root (or sourceFiles for inline upload).';

/** Embedding index is missing even though GraphRAG tooling was requested. */
export const ABSORB_EMBEDDING_INDEX_ERROR =
  'No embedding index initialized. Call holo_absorb_repo first and allow embedding index creation to complete.';
