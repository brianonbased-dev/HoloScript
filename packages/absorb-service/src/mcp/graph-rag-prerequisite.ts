/**
 * Shared copy for MCP / Graph RAG prerequisites so agents see consistent next steps.
 */

export const ABSORB_HOLO_ABSORB_REPO_HINT =
  'Run holo_absorb_repo with rootDir set to the repository root (or sourceFiles for inline upload), then retry this tool.';

/** GraphRAG engine + embedding index not initialized (after holo_absorb_repo). */
export const ABSORB_GRAPH_RAG_ENGINE_ERROR =
  'No Graph RAG engine initialized. Call holo_absorb_repo first with rootDir pointing to the project root (or sourceFiles for inline upload).';
