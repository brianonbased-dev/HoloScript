/**
 * @holoscript/collab-server
 *
 * Lightweight WebSocket relay for HoloScript Studio multi-user collaboration.
 *
 * Protocol (JSON messages over WebSocket):
 *   → { type:'join',   userId, name, color }
 *   → { type:'cursor', userId, x, y, selectedId? }
 *   → { type:'leave',  userId }
 *   → { type:'ping',   userId }
 *   ← same messages broadcast to all OTHER peers in the room
 *
 * URL format: ws://host:PORT/collab?room=<roomId>
 *
 * Usage:
 *   npx tsx src/server.ts
 *   PORT=4999 npx tsx src/server.ts
 */

import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'node:http';
import { URL } from 'node:url';

const PORT = Number(process.env.PORT ?? 4999);

// ─── Room registry ────────────────────────────────────────────────────────────

type Room = Set<WebSocket>;
const rooms = new Map<string, Room>();

function getOrCreateRoom(id: string): Room {
  let room = rooms.get(id);
  if (!room) {
    room = new Set();
    rooms.set(id, room);
  }
  return room;
}

function getRoomId(req: IncomingMessage): string {
  const base = `ws://localhost:${PORT}`;
  const url = new URL(req.url ?? '/', base);
  return url.searchParams.get('room') ?? 'default';
}

// ─── Server ───────────────────────────────────────────────────────────────────

const wss = new WebSocketServer({ port: PORT, path: '/collab' });

wss.on('listening', () => {
  console.log(`[collab-server] Listening on ws://localhost:${PORT}/collab`);
});

wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
  const roomId = getRoomId(req);
  const room = getOrCreateRoom(roomId);
  room.add(ws);

  console.log(`[collab-server] Client joined room "${roomId}" (${room.size} peers)`);

  ws.on('message', (data) => {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return; // malformed — ignore
    }

    // Skip pings — just a keep-alive, nothing to broadcast
    if (msg.type === 'ping') return;

    // Broadcast to everyone in the room EXCEPT the sender
    const payload = JSON.stringify(msg);
    for (const peer of room) {
      if (peer !== ws && peer.readyState === WebSocket.OPEN) {
        peer.send(payload);
      }
    }
  });

  ws.on('close', () => {
    room.delete(ws);
    // Optionally clean up empty rooms
    if (room.size === 0) rooms.delete(roomId);
    console.log(`[collab-server] Client left room "${roomId}" (${room.size} remaining)`);
  });

  ws.on('error', (err) => {
    console.error(`[collab-server] WebSocket error in room "${roomId}":`, err.message);
    room.delete(ws);
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[collab-server] SIGTERM received, shutting down…');
  wss.close(() => process.exit(0));
});
process.on('SIGINT', () => wss.close(() => process.exit(0)));
