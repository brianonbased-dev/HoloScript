import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { hidePremiumRowsDeep } from '@/lib/premium-view';

const KNOWLEDGE_QUERY_ENDPOINT =
  'https://mcp-orchestrator-production-45f9.up.railway.app/knowledge/query';

const MAX_LIMIT = 50;
const MAX_SEARCH_CHARS = 500;

/**
 * POST /api/knowledge/query: the Knowledge panel and the W/P/G filing form
 * search the knowledge store through this route.
 *
 * Doors audit 2026-09-15. Before, anyone (no login) could send any body, which
 * went to the orchestrator under the server's own key, and every row came back
 * raw, premium text included. Now:
 *  - the caller must be signed in to Studio (requireAuth, the same guard every
 *    other Studio API route uses);
 *  - only the fields the two callers send are forwarded (search, limit, type,
 *    workspace_id, decayed), and limit is capped;
 *  - premium rows come back as teasers only, for EVERY caller. Studio cannot
 *    see HoloMesh purchases, and a Studio account is not a HoloMesh agent id,
 *    so it can never tell that the reader is the author or a buyer. The author
 *    and buyers read the full text on HoloMesh (GET /api/holomesh/entry/:id).
 */
export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const apiKey = process.env.HOLOSCRIPT_API_KEY || process.env.NEXT_PUBLIC_MCP_API_KEY || '';

    if (!apiKey) {
      return NextResponse.json({ error: 'Missing API key configuration' }, { status: 500 });
    }

    let raw: Record<string, unknown> = {};
    try {
      const parsed = await req.json();
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        raw = parsed as Record<string, unknown>;
      }
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const payload: Record<string, unknown> = {
      search: typeof raw.search === 'string' ? raw.search.slice(0, MAX_SEARCH_CHARS) : '',
      limit: Math.min(Math.max(Number(raw.limit) || 20, 1), MAX_LIMIT),
    };
    if (typeof raw.type === 'string') payload.type = raw.type;
    if (typeof raw.workspace_id === 'string') payload.workspace_id = raw.workspace_id;
    if (typeof raw.decayed === 'boolean') payload.decayed = raw.decayed;

    const response = await fetch(KNOWLEDGE_QUERY_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-mcp-api-key': apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return NextResponse.json({ error: 'Orchestrator query failed' }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(hidePremiumRowsDeep(data));
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Internal Server Error', details: error?.message },
      { status: 500 }
    );
  }
}
