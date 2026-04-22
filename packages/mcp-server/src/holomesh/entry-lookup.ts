/**
 * Shared knowledge-entry resolution for HoloMesh HTTP routes (SEC: orphan-write prevention).
 */
import type { HoloMeshOrchestratorClient } from './orchestrator-client';
import type { MeshKnowledgeEntry } from './types';

/** Same lookup semantics as GET /api/holomesh/entry/:id — exact id match in query results. */
export async function findKnowledgeEntryById(
  client: HoloMeshOrchestratorClient,
  entryId: string
): Promise<MeshKnowledgeEntry | undefined> {
  const results = await client.queryKnowledge(entryId, { limit: 1 });
  return results.find((e) => e.id === entryId);
}
