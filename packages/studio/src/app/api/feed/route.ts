export const maxDuration = 300;

/**
 * GET /api/feed
 *
 * WS-2 sovereign-web consumer loop MVP: proxies to the mcp-server's public,
 * anonymous feed of shared worlds (GET /api/public/feed) -- read-only, no
 * auth. Client components fetch THIS route (never the mcp-server URL
 * directly) so they never need to know the mcp-server's absolute origin.
 *
 * If the downstream fetch fails, degrade gracefully to an empty feed rather
 * than crashing the route handler.
 */

import { NextRequest, NextResponse } from 'next/server';

import { corsHeaders } from '../_lib/cors';

const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'https://mcp.holoscript.net';

export async function GET(req: NextRequest) {
  const limit = req.nextUrl.searchParams.get('limit');
  const query = limit ? `?limit=${encodeURIComponent(limit)}` : '';

  try {
    const upstream = await fetch(`${MCP_SERVER_URL}/api/public/feed${query}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { scenes: [], error: 'Failed to load shared worlds feed' },
        { status: 502 }
      );
    }

    const data = (await upstream.json()) as { scenes?: unknown[] };
    return NextResponse.json({ scenes: data.scenes ?? [] });
  } catch (err) {
    return NextResponse.json(
      {
        scenes: [],
        error: err instanceof Error ? err.message : 'Failed to load shared worlds feed',
      },
      { status: 502 }
    );
  }
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, OPTIONS' }),
  });
}
