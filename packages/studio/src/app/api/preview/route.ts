export const maxDuration = 300;

import { NextResponse } from 'next/server';

/**
 * POST /api/preview
 *
 * Accepts { code, sceneId } and broadcasts to all active SSE listeners for that session.
 * Uses a global EventTarget as the in-process pub/sub bus.
 * SSE clients connect via GET /api/preview?sceneId=xxx (see below).
 *
 * In production swap this for Redis Pub/Sub or a WebSocket server.
 */

declare global {
  var __previewBus__: EventTarget | undefined;
}
const bus: EventTarget =
  globalThis.__previewBus__ ?? (globalThis.__previewBus__ = new EventTarget());

export async function POST(request: Request) {
  let body: { code?: string; sceneId?: string };
  try {
    body = (await request.json()) as { code?: string; sceneId?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { code, sceneId = 'default' } = body;
  if (!code) return NextResponse.json({ error: 'code required' }, { status: 400 });

  // Emit event to the bus — SSE handler will pick it up
  bus.dispatchEvent(
    Object.assign(new Event(`preview:${sceneId}`), { detail: { code, sceneId, ts: Date.now() } })
  );

  return NextResponse.json({ ok: true, sceneId, chars: code.length });
}

/**
 * GET /api/preview?sceneId=xxx
 * Server-Sent Events stream — clients subscribe and receive code updates in real time.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sceneId = searchParams.get('sceneId') ?? 'default';

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          clearInterval(heartbeat);
        }
      }, 15_000);

      const handler = (e: Event) => {
        const evt = e as Event & { detail: { code: string; sceneId: string; ts: number } };
        const payload = JSON.stringify(evt.detail);
        try {
          controller.enqueue(encoder.encode(`event: preview\ndata: ${payload}\n\n`));
        } catch {
          bus.removeEventListener(`preview:${sceneId}`, handler);
          clearInterval(heartbeat);
        }
      };

      bus.addEventListener(`preview:${sceneId}`, handler);

      // Cleanup when client disconnects
      request.signal.addEventListener('abort', () => {
        bus.removeEventListener(`preview:${sceneId}`, handler);
        clearInterval(heartbeat);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
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
