export const maxDuration = 300;

import { NextResponse } from 'next/server';

import { corsHeaders } from '../../_lib/cors';

type ShareScene = {
  id: string;
  name: string;
  author: string;
  createdAt: string;
  views: number;
  code?: string;
};

type PublishedScenePayload = {
  publishedAt?: string;
  scene?: {
    code?: string;
    title?: string;
    author?: string;
    metadata?: { name?: string };
  };
};
/** GET /api/share/[id] — retrieve a shared scene by its token.
 *
 * Note: In-memory scenes live in the POST /api/share route module.
 * This stub proxies to the list endpoint. For production, replace with a DB query.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const base = new URL(request.url);
    const origin = `${base.protocol}//${base.host}`;
    const listUrl = `${origin}/api/share`;
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
    if (scene) {
      return NextResponse.json(scene);
    }

    const published = await fetch(`${origin}/api/publish?id=${encodeURIComponent(id)}`);
    if (!published.ok) {
      return NextResponse.json({ error: `Scene '${id}' not found` }, { status: 404 });
    }

    const payload = (await published.json()) as PublishedScenePayload;
    const publishedScene = payload.scene;
    if (!publishedScene?.code) {
      return NextResponse.json(
        { error: `Scene '${id}' has no HoloScript source` },
        { status: 404 }
      );
    }

    const bridged: ShareScene = {
      id,
      name: publishedScene.metadata?.name ?? publishedScene.title ?? `World ${id}`,
      author: publishedScene.author ?? 'Anonymous',
      createdAt: payload.publishedAt ?? new Date().toISOString(),
      views: 0,
      code: publishedScene.code,
    };

    return NextResponse.json(bridged);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
