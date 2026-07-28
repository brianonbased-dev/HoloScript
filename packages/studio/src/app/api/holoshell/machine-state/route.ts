import { NextResponse } from 'next/server';
import { resolveHoloShellApiUrl } from '@/lib/holoshell/apiUrl';

/**
 * /api/holoshell/machine-state — machine-state snapshot for the Operations panel.
 *
 * Read path (two-stage fallback, in priority order):
 *
 * 1. PROD endpoint (preferred): the MCP server's in-memory cache at
 *    /api/holomesh/machine-state/<seat-id>.  This is populated by the local
 *    holoshell-operate-room-server.mjs publisher every 2 min and has a 10 min
 *    TTL on the server side.  Available from any network context — Railway,
 *    browser, agent.
 *
 * 2. LOCAL fallback: if HOLOSHELL_API_URL is configured (dev / same-machine
 *    Studio), proxy directly to the local server's /api/machine-state.  This
 *    gives live data when the publisher hasn't run yet or the prod cache is
 *    stale.
 *
 * Both paths return 503 with a descriptive error when their backend is
 * unreachable, so the panel can show a "not connected" state instead of
 * failing silently.
 */

const MCP_BASE = (
  process.env.MCP_HOLOSCRIPT_URL ||
  process.env.MCP_SERVER_URL ||
  'https://mcp.holoscript.net'
).replace(/\/$/, '');

const MCP_KEY = process.env.HOLOSCRIPT_API_KEY || process.env.HOLOMESH_API_KEY || '';

const SEAT_ID =
  process.env.HOLOSHELL_SEAT_ID || process.env.HOLOMESH_AGENT_SURFACE || 'local-win-x64';

export async function GET() {
  const HOLOSHELL_API_URL = resolveHoloShellApiUrl();
  // Stage 1: prod MCP server cache
  if (MCP_KEY) {
    try {
      const url = `${MCP_BASE}/api/holomesh/machine-state/${encodeURIComponent(SEAT_ID)}`;
      const r = await fetch(url, {
        cache: 'no-store',
        headers: {
          'x-mcp-api-key': MCP_KEY,
          Authorization: `Bearer ${MCP_KEY}`,
        },
        signal: AbortSignal.timeout(8_000),
      });
      if (r.ok) {
        const j = await r.json();
        return NextResponse.json({ ...j, _source: 'mcp_prod_cache' });
      }
      if (r.status !== 404) {
        // Non-404 errors are unexpected — fall through to local but record
        console.warn(`[machine-state] prod cache returned ${r.status}`);
      }
      // 404 = publisher hasn't posted yet — fall through to local
    } catch (e) {
      console.warn('[machine-state] prod cache unreachable:', String(e).slice(0, 80));
    }
  }

  // Stage 2: local server fallback (HOLOSHELL_API_URL configured)
  if (HOLOSHELL_API_URL) {
    try {
      const r = await fetch(`${HOLOSHELL_API_URL}/api/machine-state`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(6_000),
      });
      if (r.ok) {
        const j = await r.json();
        return NextResponse.json({ ...j, _source: 'holoshell_local' });
      }
      return NextResponse.json(
        { error: `holoshell local returned ${r.status}` },
        { status: r.status }
      );
    } catch (e) {
      return NextResponse.json(
        { error: 'holoshell local unreachable', details: String(e).slice(0, 120) },
        { status: 503 }
      );
    }
  }

  return NextResponse.json(
    {
      error: 'machine-state not available',
      hint: 'Start holoshell-operate-room-server.mjs locally (sets HOLOSHELL_API_URL) or wait for the publisher to push a snapshot to the prod MCP cache.',
    },
    { status: 503 }
  );
}
