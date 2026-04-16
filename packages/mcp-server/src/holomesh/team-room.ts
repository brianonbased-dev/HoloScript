/**
 * Team Room — SSE-based real-time event bus for team operations.
 *
 * Agents connect once via GET /api/holomesh/team/:id/room/live and receive
 * all team events (board changes, messages, presence, knowledge, mode)
 * as they happen. No polling needed.
 *
 * The room connection IS the heartbeat — if the SSE stream is open,
 * the agent is alive. When it closes, the agent left.
 *
 * REST endpoints remain as fallback for agents that can't hold a socket
 * (CI bots, cron jobs, one-shot scripts).
 *
 * Architecture: P.501.02 (Context Pinning via real-time events)
 *               W.504 (Reduce polling = reduce token waste)
 */

import type http from 'http';
import { attachSseDisconnectGuards, attachSseHeartbeat } from './team-room-sse';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RoomEvent {
  type: string;
  team: string;
  agent?: string;
  data: unknown;
  ts: number;
}

interface RoomClient {
  res: http.ServerResponse;
  agentId: string;
  agentName: string;
  ide?: string;
  joinedAt: number;
}

// ─── Global State ─────────────────────────────────────────────────────────────

// teamId/roomId → Set<RoomClient>
const rooms = new Map<string, Set<RoomClient>>();

// teamId/roomId → last N events (for reconnect replay)
const roomHistory = new Map<string, RoomEvent[]>();

const MAX_HISTORY = 50;

// ─── Core Functions ───────────────────────────────────────────────────────────

/**
 * Broadcast an event to all connected clients in a room.
 * Called from mutation endpoints (board, messages, games, etc).
 */
export function broadcastToRoom(roomId: string, event: Omit<RoomEvent, 'ts' | 'team'>): void {
  const fullEvent: RoomEvent = {
    ...event,
    team: roomId, // Using 'team' field for the room identifier (backward compat)
    ts: Date.now(),
  };

  // Store in history for reconnect replay
  const hist = roomHistory.get(roomId) ?? [];
  hist.push(fullEvent);
  if (hist.length > MAX_HISTORY) hist.splice(0, hist.length - MAX_HISTORY);
  roomHistory.set(roomId, hist);

  // Broadcast to all connected clients
  const clients = rooms.get(roomId);
  if (!clients || clients.size === 0) return;

  const sseData = `data: ${JSON.stringify(fullEvent)}\n\n`;
  for (const client of clients) {
    try {
      client.res.write(sseData);
    } catch {
      // Client disconnected — will be cleaned up by close handler
    }
  }
}

/**
 * Alias for backward compatibility with team-only broadcasts.
 */
export const broadcastToTeam = broadcastToRoom;

/**
 * Get list of agents currently connected to a room.
 */
export function getRoomPresence(roomId: string): { agentId: string; agentName: string; ide?: string; joinedAt: number }[] {
  const clients = rooms.get(roomId);
  if (!clients) return [];
  return Array.from(clients).map(c => ({
    agentId: c.agentId,
    agentName: c.agentName,
    ide: c.ide,
    joinedAt: c.joinedAt,
  }));
}

/**
 * Get count of connected clients per room (for health/monitoring).
 */
export function getRoomStats(): Record<string, number> {
  const stats: Record<string, number> = {};
  for (const [roomId, clients] of rooms) {
    stats[roomId] = clients.size;
  }
  return stats;
}

// ─── SSE Handler ──────────────────────────────────────────────────────────────

/**
 * Handle GET /api/holomesh/team/:id/room/live — Open SSE stream.
 *
 * Query params:
 *   agent_id    — agent's registered ID
 *   agent_name  — agent's display name
 *   ide         — IDE type (claude-code, cursor, copilot, gemini, etc.)
 *   since       — ISO timestamp for replay (optional, replays events after this time)
 */
export function handleTeamRoomConnection(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  teamId: string,
  query: URLSearchParams
): void {
  const agentId = query.get('agent_id') || 'anonymous';
  const agentName = query.get('agent_name') || agentId;
  const ide = query.get('ide') || undefined;
  const since = query.get('since') ? new Date(query.get('since')!).getTime() : 0;

  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'X-Accel-Buffering': 'no', // Disable nginx/Railway buffering
  });

  // Create client entry
  const client: RoomClient = {
    res,
    agentId,
    agentName,
    ide,
    joinedAt: Date.now(),
  };

  // Add to room
  if (!rooms.has(teamId)) rooms.set(teamId, new Set());
  rooms.get(teamId)!.add(client);

  // Send SSE reconnect instruction (robust offline fallback)
  try {
    res.write('retry: 5000\n\n');
  } catch {
    // Client already gone
  }

  // Replay history for reconnecting clients
  const hist = roomHistory.get(teamId) ?? [];
  const replay = since > 0 ? hist.filter(e => e.ts > since) : hist;
  for (const event of replay) {
    try {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch {
      break;
    }
  }

  // Announce join to all clients in the room
  broadcastToRoom(teamId, {
    type: 'presence:join',
    agent: agentName,
    data: { agentId, agentName, ide },
  });

  // Heartbeat + disconnect handling live in team-room-sse.ts so timers/listeners
  // are cleared together and cannot leak if the socket half-closes.
  let finalized = false;
  let heartbeatDispose: () => void = () => {};

  const teardown = () => {
    if (finalized) return;
    finalized = true;
    heartbeatDispose();
    rooms.get(teamId)?.delete(client);

    broadcastToRoom(teamId, {
      type: 'presence:leave',
      agent: agentName,
      data: { agentId, agentName, ide },
    });

    if (rooms.get(teamId)?.size === 0) {
      rooms.delete(teamId);
    }
  };

  ({ dispose: heartbeatDispose } = attachSseHeartbeat(res, teardown));
  attachSseDisconnectGuards(req, res, teardown);
}
