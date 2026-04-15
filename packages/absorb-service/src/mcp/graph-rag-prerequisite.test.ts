import { describe, it, expect } from 'vitest';
import {
  ABSORB_CODEBASE_LOAD_ERROR,
  ABSORB_EMBEDDING_INDEX_ERROR,
  ABSORB_GRAPH_RAG_ENGINE_ERROR,
  ABSORB_HOLO_ABSORB_REPO_HINT,
} from './graph-rag-prerequisite';

describe('graph-rag-prerequisite', () => {
  it('exports stable prerequisite strings', () => {
    expect(ABSORB_GRAPH_RAG_ENGINE_ERROR).toContain('holo_absorb_repo');
    expect(ABSORB_HOLO_ABSORB_REPO_HINT).toContain('rootDir');
    expect(ABSORB_EMBEDDING_INDEX_ERROR).toContain('embedding');
    expect(ABSORB_CODEBASE_LOAD_ERROR).toContain('disk cache');
  });
});
