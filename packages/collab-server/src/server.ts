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
 * URL format: ws://host:PORT/collab?room=<roomId>&token=<jwt>
 *
 * Authentication:
 *   When COLLAB_AUTH_SECRET is set, connections must provide a valid JWT
 *   in the ?token= query parameter. The JWT is verified using the shared
 *   secret (same as NEXTAUTH_SECRET in the Studio).
 *
 * Usage:
 *   npx tsx src/server.ts
 *   PORT=4999 COLLAB_AUTH_SECRET=xxx npx tsx src/server.ts
 */

import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'node:http';
import { URL } from 'node:url';
import { createHmac } from 'node:crypto';

const PORT = Number(process.env.PORT ?? 4999);
const AUTH_SECRET = process.env.COLLAB_AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;

// ─── Simple JWT verification ─────────────────────────────────────────────────

interface TokenPayload {
  sub?: string;
  name?: string;
  email?: string;
  exp?: number;
  [key: string]: unknown;
}

/**
 * Verify a HS256 JWT token. Returns the payload if valid, null if not.
 * This is a minimal implementation — does not depend on jsonwebtoken.
 */
function verifyToken(token: string, secret: string): TokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [header64, payload64, sig64] = parts;

    // Verify signature
    const data = `${header64}.${payload64}`;
    const expectedSig = createHmac('sha256', secret).update(data).digest('base64url');

    if (sig64 !== expectedSig) return null;

    // Decode payload
    const payload = JSON.parse(
      Buffer.from(payload64, 'base64url').toString('utf-8')
    ) as TokenPayload;

    // Check expiry
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;

    return payload;
  } catch {
    return null;
  }
}

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

function parseUrl(req: IncomingMessage) {
  const base = `ws://localhost:${PORT}`;
  return new URL(req.url ?? '/', base);
}

// ─── Server ───────────────────────────────────────────────────────────────────

const wss = new WebSocketServer({ port: PORT, path: '/collab' });

wss.on('listening', () => {
  const authMode = AUTH_SECRET ? 'JWT auth enabled' : 'no auth (open)';
  console.log(`[collab-server] Listening on ws://localhost:${PORT}/collab (${authMode})`);
});

wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
  const url = parseUrl(req);
  const roomId = url.searchParams.get('room') ?? 'default';

  // ─── Auth gate ────────────────────────────────────────────────────────
  if (AUTH_SECRET) {
    const token = url.searchParams.get('token');
    if (!token) {
      ws.close(1008, 'Authentication required');

      return;
    }

    const payload = verifyToken(token, AUTH_SECRET);
    if (!payload) {
      ws.close(1008, 'Invalid or expired token');

      return;
    }

    // Attach user info for logging
    (ws as unknown as Record<string, string>)._userId = payload.sub ?? 'unknown';
    (ws as unknown as Record<string, string>)._userName =
      payload.name ?? payload.email ?? 'Anonymous';
  }
  // ────────────────────────────────────────────────────────────────────────

  const room = getOrCreateRoom(roomId);
  room.add(ws);

  const userLabel = (ws as unknown as Record<string, string>)._userName ?? 'anonymous';

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
    if (room.size === 0) rooms.delete(roomId);
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
