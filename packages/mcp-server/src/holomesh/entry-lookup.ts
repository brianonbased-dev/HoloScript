/**
 * Shared knowledge-entry resolution for HoloMesh HTTP routes (SEC: orphan-write prevention).
 */
import type { HoloMeshOrchestratorClient } from './orchestrator-client';
import type { MeshKnowledgeEntry, Team } from './types';
import { teamStore } from './state';

/** Max entries kept per team in the on-disk mirror (ring on overflow). */
export const TEAM_KNOWLEDGE_MIRROR_MAX = 500;

/**
 * Literal match for a team-knowledge `q` when embedding search is empty or
 * returned an unranked dump. Semantic phrases (whitespace) may still fall
 * through to orchestrator rank when nothing literal hits.
 */
export function knowledgeEntryMatchesQuery(entry: MeshKnowledgeEntry | undefined, q: string): boolean {
  const needle = String(q || '').trim().toLowerCase();
  if (!needle || !entry) return false;
  const blob = [
    entry.id,
    entry.type,
    entry.content,
    entry.domain,
    entry.authorName,
    entry.authorId,
    ...(Array.isArray(entry.tags) ? entry.tags : []),
  ].join('\n').toLowerCase();
  return blob.includes(needle);
}

/**
 * Merge orchestrator query results with the team JSON mirror: orchestrator order first,
 * then mirror-only rows. When both have the same id, the orchestrator copy wins.
 */
export function mergeTeamKnowledgeWithOrchestrator(
  fromOrchestrator: MeshKnowledgeEntry[],
  fromMirror: MeshKnowledgeEntry[] | undefined
): MeshKnowledgeEntry[] {
  if (!fromMirror?.length) return [...fromOrchestrator];
  const orchIds = new Set(fromOrchestrator.map((e) => e.id).filter(Boolean));
  const byId = new Map<string, MeshKnowledgeEntry>();
  for (const e of fromMirror) {
    if (e?.id) byId.set(e.id, e);
  }
  for (const e of fromOrchestrator) {
    if (e?.id) byId.set(e.id, e);
  }
  const out: MeshKnowledgeEntry[] = fromOrchestrator
    .filter((e) => e?.id)
    .map((e) => byId.get(e.id) ?? e);
  for (const e of fromMirror) {
    if (e?.id && !orchIds.has(e.id)) {
      out.push(e);
    }
  }
  return out;
}

/** Append or update entries in the team mirror, then trim to TEAM_KNOWLEDGE_MIRROR_MAX (newest tail). */
export function appendTeamKnowledgeMirror(team: Team, newEntries: MeshKnowledgeEntry[]): void {
  if (newEntries.length === 0) return;
  if (!team.knowledge) team.knowledge = [];
  for (const e of newEntries) {
    if (!e?.id) continue;
    const idx = team.knowledge.findIndex((x) => x.id === e.id);
    if (idx >= 0) {
      team.knowledge[idx] = e;
    } else {
      team.knowledge.push(e);
    }
  }
  if (team.knowledge.length > TEAM_KNOWLEDGE_MIRROR_MAX) {
    team.knowledge = team.knowledge.slice(-TEAM_KNOWLEDGE_MIRROR_MAX);
  }
}

/** Exact id match in any team's persisted knowledge mirror. */
export function findKnowledgeEntryInTeamMirrors(entryId: string): MeshKnowledgeEntry | undefined {
  for (const team of teamStore.values()) {
    const k = team.knowledge?.find((e) => e.id === entryId);
    if (k) return k;
  }
  return undefined;
}

/**
 * Same lookup semantics as GET /api/holomesh/entry/:id — exact id in orchestrator results,
 * with fallback to the team knowledge mirror when the orchestrator has not indexed the row yet.
 */
export async function findKnowledgeEntryById(
  client: HoloMeshOrchestratorClient,
  entryId: string
): Promise<MeshKnowledgeEntry | undefined> {
  const results = await client.queryKnowledge(entryId, { limit: 1 });
  const fromOrch = results.find((e) => e.id === entryId);
  if (fromOrch) return fromOrch;
  return findKnowledgeEntryInTeamMirrors(entryId);
}
