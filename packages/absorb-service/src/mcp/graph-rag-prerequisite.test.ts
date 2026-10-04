import { describe, it, expect } from 'vitest';
import {
  ABSORB_CODEBASE_LOAD_ERROR,
  ABSORB_EMBEDDING_INDEX_ERROR,
  ABSORB_GRAPH_RAG_ENGINE_ERROR,
  ABSORB_HOLO_ABSORB_REPO_HINT,
  describeGraphUnavailable,
} from './graph-rag-prerequisite';

describe('graph-rag-prerequisite', () => {
  it('exports stable prerequisite strings', () => {
    expect(ABSORB_GRAPH_RAG_ENGINE_ERROR).toContain('holo_absorb_repo');
    expect(ABSORB_HOLO_ABSORB_REPO_HINT).toContain('rootDir');
    expect(ABSORB_EMBEDDING_INDEX_ERROR).toContain('embedding');
    expect(ABSORB_CODEBASE_LOAD_ERROR).toContain('disk cache');
  });

  it('does not tell a model "no graph" when a refused graph exists on disk', () => {
    const stale = describeGraphUnavailable({
      reason: 'cache_stale',
      requestedPath: '/repo',
      cacheAgeMs: 30 * 3_600_000,
    });
    expect(stale).toContain('exists on disk for /repo (built 30h ago)');
    expect(stale).toContain('force:false');
    expect(stale).not.toContain('No codebase graph');

    expect(describeGraphUnavailable({ reason: 'cache_incomplete' })).toContain('only part');
    expect(describeGraphUnavailable({ reason: 'cache_root_mismatch' })).toContain('not the workspace');
    expect(describeGraphUnavailable({ reason: 'cache_missing' })).toBe(ABSORB_CODEBASE_LOAD_ERROR);
    expect(describeGraphUnavailable(undefined)).toBe(ABSORB_CODEBASE_LOAD_ERROR);
  });
});
