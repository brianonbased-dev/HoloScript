/**
 * Shared copy for MCP / Graph RAG prerequisites so agents see consistent next steps.
 */

export const ABSORB_HOLO_ABSORB_REPO_HINT =
  'Run holo_absorb_repo with rootDir set to the repository root (or sourceFiles for inline upload), then retry this tool.';

/** Codebase graph is not loaded from memory or disk cache. */
export const ABSORB_CODEBASE_LOAD_ERROR =
  'No codebase graph loaded in memory or disk cache. Call holo_absorb_repo first.';

/**
 * Say why a graph that may exist on disk was refused, so a model does not read
 * "no graph" and rebuild from scratch when an incremental refresh would do.
 * Falls back to ABSORB_CODEBASE_LOAD_ERROR when no refusal reason is known.
 */
export function describeGraphUnavailable(receipt?: {
  reason?: string;
  requestedPath?: string | null;
  cacheAgeMs?: number | null;
}): string {
  const where = receipt?.requestedPath ? ` for ${receipt.requestedPath}` : '';
  const age =
    typeof receipt?.cacheAgeMs === 'number'
      ? ` (built ${Math.round(receipt.cacheAgeMs / 3_600_000)}h ago)`
      : '';
  switch (receipt?.reason) {
    case 'cache_stale':
      return `A codebase graph exists on disk${where}${age} but no longer provably matches the checkout, so it was not used. Call holo_absorb_repo with force:false; it patches only what changed.`;
    case 'cache_incomplete':
      return `A codebase graph exists on disk${where} but covers only part of the checkout, so it was not used. Call holo_absorb_repo with force:false to fill the gaps.`;
    case 'cache_root_mismatch':
      return `The codebase graph on disk covers ${receipt.requestedPath ?? 'another folder'}, not the workspace being asked about, so it was not used. Call holo_absorb_repo with rootDir set to the repository you mean.`;
    case 'rootDir_unavailable':
      return `The requested folder${where} is not visible to this server's filesystem. Use the server on the same machine as the code, or pass sourceFiles to holo_absorb_repo.`;
    default:
      return ABSORB_CODEBASE_LOAD_ERROR;
  }
}

/** GraphRAG engine + embedding index not initialized (after holo_absorb_repo). */
export const ABSORB_GRAPH_RAG_ENGINE_ERROR =
  'No Graph RAG engine initialized. Call holo_absorb_repo first with rootDir pointing to the project root (or sourceFiles for inline upload).';

/** Embedding index is missing even though GraphRAG tooling was requested. */
export const ABSORB_EMBEDDING_INDEX_ERROR =
  'No embedding index initialized. Call holo_absorb_repo first and allow embedding index creation to complete.';
