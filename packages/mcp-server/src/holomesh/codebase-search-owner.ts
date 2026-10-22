/**
 * Owner scoping for POST /api/holomesh/codebase/search.
 *
 * The route is hosted, so it must never read the process-wide `local` GraphRAG
 * slot (that belongs to the unscoped stdio / CLI caller). It reads only the
 * calling agent's own per-owner slot, and refuses when there is no owner.
 */

export interface CodebaseSearchGraphApi {
  isGraphRAGReady: (ownerKey?: string) => boolean;
  handleGraphRagTool: (
    name: string,
    args: Record<string, unknown>,
    ctx?: { ownerKey: string | null }
  ) => Promise<unknown>;
}

export type CodebaseSearchOutcome =
  | { status: 200; body: { success: true; result: unknown } }
  | { status: 401 | 503 | 500; body: Record<string, unknown> };

/** Per-owner GraphRAG key for a HoloMesh caller id, or null when there is none. */
export function holomeshGraphOwner(callerId: unknown): string | null {
  if (typeof callerId !== 'string') return null;
  const id = callerId.trim();
  return id ? `holomesh:${id}` : null;
}

export async function searchCodebaseForCaller(
  callerId: unknown,
  args: Record<string, unknown>,
  api: CodebaseSearchGraphApi | undefined
): Promise<CodebaseSearchOutcome> {
  const ownerKey = holomeshGraphOwner(callerId);
  if (!ownerKey) {
    return {
      status: 401,
      body: { error: 'owner_required', hint: 'Codebase search reads only the calling agent\'s own graph.' },
    };
  }
  if (!api || !api.isGraphRAGReady(ownerKey)) {
    return {
      status: 503,
      body: {
        error: 'codebase-graph-not-ready',
        hint: 'No GraphRAG index is loaded for this caller. Absorb a repo as this caller first, or use GET /team/:id/knowledge?q= for semantic knowledge-store search (already wired to HoloEmbed ranking).',
      },
    };
  }
  try {
    const result = await api.handleGraphRagTool('holo_semantic_search', args, { ownerKey });
    return { status: 200, body: { success: true, result } };
  } catch (err: unknown) {
    return {
      status: 500,
      body: {
        error: 'semantic-search-failed',
        detail: err instanceof Error ? err.message : String(err),
      },
    };
  }
}