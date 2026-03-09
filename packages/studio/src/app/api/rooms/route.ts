import { NextRequest } from 'next/server';

/**
 * /api/rooms — SSE-based multiplayer room bus.
 *
 * GET  /api/rooms?room=<id>&user=<name>&color=<hex>  → open SSE stream
 * POST /api/rooms  { room, user, type, payload }     → broadcast event to room
 *
 * Event types: join | leave | cursor | select | chat | code
 * In-memory map: roomId → Set<ReadableStreamController>
 */

interface RoomEvent {
  room?: string;
  user?: string;
  type?: string;
  payload?: unknown;
  color?: string;
  ts?: number;
}

// Global room bus — persists across requests in one process
const roomBus = new Map<string, Set<ReadableStreamDefaultController>>();
// Recent events per room (last 20) for reconnect replay
const roomHistory = new Map<string, RoomEvent[]>();

function broadcast(room: string, event: RoomEvent) {
  const controllers = roomBus.get(room);
  if (!controllers) return;
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const ctrl of controllers) {
    try {
      ctrl.enqueue(data);
    } catch {
      /* stream closed */
    }
  }
  // Keep last 20 events
  const hist = roomHistory.get(room) ?? [];
  hist.push(event);
  if (hist.length > 20) hist.shift();
  roomHistory.set(room, hist);
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const room = searchParams.get('room') ?? 'default';
  const user = searchParams.get('user') ?? 'Anonymous';
  const color = searchParams.get('color') ?? '#a78bfa';

  let controller: ReadableStreamDefaultController;
  const stream = new ReadableStream({
    start(ctrl) {
      controller = ctrl;

      if (!roomBus.has(room)) roomBus.set(room, new Set());
      roomBus.get(room)!.add(controller);

      // Send history for reconnects
      const hist = roomHistory.get(room) ?? [];
      for (const evt of hist) {
        ctrl.enqueue(`data: ${JSON.stringify(evt)}\n\n`);
      }

      // Announce join
      broadcast(room, { room, user, color, type: 'join', ts: Date.now() });

      // Heartbeat every 25s
      const hb = setInterval(() => {
        try {
          ctrl.enqueue(': hb\n\n');
        } catch {
          clearInterval(hb);
        }
      }, 25_000);

      request.signal.addEventListener('abort', () => {
        clearInterval(hb);
        roomBus.get(room)?.delete(controller);
        broadcast(room, { room, user, color, type: 'leave', ts: Date.now() });
        ctrl.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

export async function POST(request: NextRequest) {
  let body: RoomEvent;
  try {
    body = (await request.json()) as RoomEvent;
  } catch {
    return Response.json({ error: 'Bad JSON' }, { status: 400 });
  }
  const room = body.room ?? 'default';
  broadcast(room, { ...body, ts: Date.now() });
  return Response.json({ ok: true });
}
