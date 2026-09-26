/**
 * Shared knowledge-entry resolution for HoloMesh HTTP routes (SEC: orphan-write prevention).
 */
import type { HoloMeshOrchestratorClient } from './orchestrator-client';
import type { MeshKnowledgeEntry, Team } from './types';
import { paidAccessStore, teamStore } from './state';
import { hidePremiumText, isPremiumEntry } from './premium-view';

// ── Who may read a premium entry (doors audit 2026-09-15) ────────────────────
//
// A premium entry (price > 0) goes in full only to an ENTITLED reader: the
// author, a founder key, or a caller with a recorded purchase. A purchase is
// recorded only after a verified payment (see verifyPremiumPayment in
// routes/knowledge-routes.ts). Every place a knowledge lookup result leaves the
// server passes it through `entryForViewer` (or, where the reader can never be
// known, `hidePremiumText` from premium-view.ts). A new exit that skips both is
// a leak.

export type PremiumAccess = 'author' | 'founder' | 'purchased';

export interface PremiumViewer {
  authenticated: boolean;
  id: string;
  isFounder?: boolean;
}

/** A reader with no identity: never entitled to premium text. */
export const ANONYMOUS_VIEWER: PremiumViewer = Object.freeze({
  authenticated: false,
  id: 'anonymous',
  isFounder: false,
});

/**
 * The reader of an MCP tool call, for the premium gate. handlers.ts stamps
 * `__authAgentId` from the verified signer and deletes any caller-supplied
 * value first; without it (stdio, anonymous HTTP) the reader is anonymous.
 * Founder keys are not recognised on this path, so a founder reads premium
 * entries through GET /api/holomesh/entry/:id instead.
 */
export function mcpToolViewer(args: Record<string, unknown>): PremiumViewer {
  const id = args.__authAgentId;
  return typeof id === 'string' && id ? { authenticated: true, id } : ANONYMOUS_VIEWER;
}

export function premiumEntryAccess(
  viewer: PremiumViewer,
  entryId: string,
  authorId: string | undefined
): PremiumAccess | null {
  // Not dead code: every unauthenticated caller carries the id 'anonymous'
  // (ANONYMOUS_VIEWER, and resolveRequestingAgent for a missing or expired
  // key). Without this line an entry whose recorded author is 'anonymous', or
  // a purchase record keyed 'anonymous:<entry>', would open to every caller
  // with no key. premium-exits.test.ts covers it.
  if (!viewer.authenticated) return null;
  if (authorId && viewer.id === authorId) return 'author';
  if (viewer.isFounder) return 'founder';
  if (paidAccessStore.has(`${viewer.id}:${entryId}`)) return 'purchased';
  return null;
}

/**
 * Author id as the orchestrator stores it. The HoloMesh client copies
 * `metadata.authorId` onto the row. A raw knowledge fetch leaves it nested.
 * Same person, same `premiumEntryAccess` check.
 */
function entryAuthorId(entry: { authorId?: string; metadata?: unknown }): string | undefined {
  if (typeof entry.authorId === 'string' && entry.authorId.length > 0) return entry.authorId;
  const meta = entry.metadata;
  if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
    const nested = (meta as Record<string, unknown>).authorId;
    if (typeof nested === 'string' && nested.length > 0) return nested;
  }
  return undefined;
}

/**
 * Premium rows a search may match.
 *
 * Entitlement is `premiumEntryAccess`: the author, a founder key, or a
 * recorded purchase in `paidAccessStore`. An unauthenticated viewer is never
 * entitled. Drop the others before any id, snippet, rationale, or section is
 * built. A locked teaser is not enough: returning the row tells the caller
 * the query hit hidden paid text.
 *
 * Unmerged PRs #350 (`team-routes.ts`) and #352 (`knowledge-routes.ts` GET
 * /search) each keep a local copy of this filter. After those land, both
 * copies should call this export and the local helpers should go.
 */
export function entitledSearchRows<
  T extends { id?: string; authorId?: string; price?: unknown; metadata?: unknown },
>(rows: T[], viewer: PremiumViewer): T[] {
  return rows.filter((entry) => {
    if (!isPremiumEntry(entry)) return true;
    const id = typeof entry.id === 'string' ? entry.id : '';
    return premiumEntryAccess(viewer, id, entryAuthorId(entry)) !== null;
  });
}

/**
 * THE premium gate for lookup results: a free entry, or a premium entry this
 * viewer is entitled to, passes through unchanged; any other premium entry
 * leaves with only its teaser (premium-view.ts) and `locked: true`.
 */
export function entryForViewer<
  T extends {
    id: string;
    authorId?: string;
    price?: unknown;
    content?: unknown;
    metadata?: unknown;
  },
>(entry: T, viewer: PremiumViewer): T & { premium?: boolean; locked?: boolean } {
  if (!isPremiumEntry(entry)) return entry;
  if (premiumEntryAccess(viewer, entry.id, entry.authorId)) return entry;
  return hidePremiumText(entry);
}

export function entriesForViewer<
  T extends {
    id: string;
    authorId?: string;
    price?: unknown;
    content?: unknown;
    metadata?: unknown;
  },
>(entries: T[], viewer: PremiumViewer): Array<T & { premium?: boolean; locked?: boolean }> {
  return entries.map((entry) => entryForViewer(entry, viewer));
}

/** Public-feed quality filter: no raw dumps, logs, tombstones or rejected entries. */
export function isPublicFeedEntry(entry: MeshKnowledgeEntry): boolean {
  if (
    entry.tags?.some((tag) => ['raw-dump', 'session-dump', 'system-log', 'tombstone'].includes(tag))
  ) {
    return false;
  }
  const metadata = entry.metadata;
  const quality =
    metadata &&
    typeof metadata.quality === 'object' &&
    metadata.quality !== null &&
    !Array.isArray(metadata.quality)
      ? (metadata.quality as Record<string, unknown>)
      : null;
  const state = typeof quality?.state === 'string' ? quality.state : '';
  return state !== 'rejected' && state !== 'raw-dump';
}

/** Max entries kept per team in the on-disk mirror (ring on overflow). */
export const TEAM_KNOWLEDGE_MIRROR_MAX = 500;

/**
 * Literal match for a team-knowledge `q` when embedding search is empty or
 * returned an unranked dump. Semantic phrases (whitespace) may still fall
 * through to orchestrator rank when nothing literal hits.
 */
export function knowledgeEntryMatchesQuery(
  entry: MeshKnowledgeEntry | undefined,
  q: string
): boolean {
  const needle = String(q || '')
    .trim()
    .toLowerCase();
  if (!needle || !entry) return false;
  const blob = [
    entry.id,
    entry.type,
    entry.content,
    entry.domain,
    entry.authorName,
    entry.authorId,
    ...(Array.isArray(entry.tags) ? entry.tags : []),
  ]
    .join('\n')
    .toLowerCase();
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
