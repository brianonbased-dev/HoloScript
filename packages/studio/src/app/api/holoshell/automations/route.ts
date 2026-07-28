import { NextResponse } from 'next/server';
import { resolveHoloShellApiUrl } from '@/lib/holoshell/apiUrl';
import { readHoloShellProdBundle } from '@/lib/holoshell/prodCache';

export async function GET() {
  const holoshellApiUrl = resolveHoloShellApiUrl();
  if (holoshellApiUrl) {
    try {
      const r = await fetch(`${holoshellApiUrl}/api/automations`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(6_000),
      });
      return NextResponse.json(await r.json(), { status: r.status });
    } catch {
      // Fall through to the prod cache.
    }
  }

  const cached = await readHoloShellProdBundle();
  if (cached?.bundle.automations) {
    return NextResponse.json({
      ok: true,
      items: cached.bundle.automations,
      summary: cached.bundle.automationSummary ?? null,
      publishedAt: cached.publishedAt,
      _source: 'mcp_prod_cache',
    });
  }

  return NextResponse.json(
    {
      error: 'holoshell automation state not available',
      hint: 'Start holoshell-operate-room-server.mjs on the seat machine or wait for the publisher snapshot.',
    },
    { status: 503 }
  );
}
