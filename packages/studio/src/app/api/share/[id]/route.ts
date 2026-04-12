export const maxDuration = 300;

import { NextResponse } from 'next/server';

/** GET /api/share/[id] — retrieve a shared scene by its token.
 *
 * Note: In-memory scenes live in the POST /api/share route module.
 * This stub proxies to the list endpoint. For production, replace with a DB query.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const base = new URL(request.url);
    const listUrl = `${base.protocol}//${base.host}/api/share`;
    const res = await fetch(listUrl);

    if (!res.ok) {
      return NextResponse.json({ error: 'Gallery unavailable' }, { status: 502 });
    }

    const { scenes } = (await res.json()) as {
      scenes: Array<{
        id: string;
        name: string;
        author: string;
        createdAt: string;
        views: number;
      }>;
    };

    const scene = scenes.find((s) => s.id === id);
    if (!scene) {
      return NextResponse.json({ error: `Scene '${id}' not found` }, { status: 404 });
    }

    return NextResponse.json(scene);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}


export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-mcp-api-key',
    },
  });
}
