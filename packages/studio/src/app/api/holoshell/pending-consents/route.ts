import { NextResponse } from 'next/server';
import { resolveHoloShellApiUrl } from '@/lib/holoshell/apiUrl';
import { readHoloShellProdBundle } from '@/lib/holoshell/prodCache';

export async function GET() {
  // Stage 2 first when a local server is reachable (fresher than the cache).
  const holoshellApiUrl = resolveHoloShellApiUrl();
  if (holoshellApiUrl) {
    try {
      const r = await fetch(`${holoshellApiUrl}/api/pending-consents`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(6_000),
      });
      return NextResponse.json(await r.json(), { status: r.status });
    } catch {
      // fall through to the prod cache
    }
  }

  // Stage 1: the published bundle in the prod MCP cache.
  const cached = await readHoloShellProdBundle();
  if (cached?.bundle.pendingConsents) {
    return NextResponse.json({
      ok: true,
      items: cached.bundle.pendingConsents,
      publishedAt: cached.publishedAt,
      _source: 'mcp_prod_cache',
    });
  }

  return NextResponse.json(
    {
      error: 'holoshell state not available',
      hint: 'Start holoshell-operate-room-server.mjs on the seat machine — it serves locally and publishes to the prod cache.',
    },
    { status: 503 }
  );
}
