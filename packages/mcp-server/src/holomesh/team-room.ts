/**
 * Team Room — SSE-based real-time event bus for team operations.
 *
 * Agents connect once via GET /api/holomesh/team/:id/room and receive
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

// teamId → Set<RoomClient>
const teamRooms = new Map<string, Set<RoomClient>>();

// teamId → last N events (for reconnect replay)
const teamHistory = new Map<string, RoomEvent[]>();

const MAX_HISTORY = 50;
const HEARTBEAT_INTERVAL = 25_000; // 25s SSE keepalive

// ─── Core Functions ───────────────────────────────────────────────────────────

/**
 * Broadcast an event to all connected clients in a team room.
 * Called from mutation endpoints (board, messages, presence, knowledge, etc).
 */
export function broadcastToTeam(teamId: string, event: Omit<RoomEvent, 'ts' | 'team'>): void {
  const fullEvent: RoomEvent = {
    ...event,
    team: teamId,
    ts: Date.now(),
  };

  // Store in history for reconnect replay
  const hist = teamHistory.get(teamId) ?? [];
  hist.push(fullEvent);
  if (hist.length > MAX_HISTORY) hist.splice(0, hist.length - MAX_HISTORY);
  teamHistory.set(teamId, hist);

  // Broadcast to all connected clients
  const clients = teamRooms.get(teamId);
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
 * Get list of agents currently connected to a team room.
 * Replaces presence polling — if they're connected, they're alive.
 */
export function getRoomPresence(teamId: string): { agentId: string; agentName: string; ide?: string; joinedAt: number }[] {
  const clients = teamRooms.get(teamId);
  if (!clients) return [];
  return Array.from(clients).map(c => ({
    agentId: c.agentId,
    agentName: c.agentName,
    ide: c.ide,
    joinedAt: c.joinedAt,
  }));
}

/**
 * Get count of connected clients per team (for health/monitoring).
 */
export function getRoomStats(): Record<string, number> {
  const stats: Record<string, number> = {};
  for (const [teamId, clients] of teamRooms) {
    stats[teamId] = clients.size;
  }
  return stats;
}

// ─── SSE Handler ──────────────────────────────────────────────────────────────

/**
 * Handle GET /api/holomesh/team/:id/room — Open SSE stream.
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
  if (!teamRooms.has(teamId)) teamRooms.set(teamId, new Set());
  teamRooms.get(teamId)!.add(client);

  // Replay history for reconnecting clients
  const hist = teamHistory.get(teamId) ?? [];
  const replay = since > 0 ? hist.filter(e => e.ts > since) : hist;
  for (const event of replay) {
    try {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch {
      break;
    }
  }

  // Announce join to all clients in the room
  broadcastToTeam(teamId, {
    type: 'presence:join',
    agent: agentName,
    data: { agentId, agentName, ide },
  });

  // SSE heartbeat keepalive
  const heartbeat = setInterval(() => {
    try {
      res.write(': hb\n\n');
    } catch {
      clearInterval(heartbeat);
    }
  }, HEARTBEAT_INTERVAL);

  // Cleanup on disconnect
  const cleanup = () => {
    clearInterval(heartbeat);
    teamRooms.get(teamId)?.delete(client);

    // Announce leave
    broadcastToTeam(teamId, {
      type: 'presence:leave',
      agent: agentName,
      data: { agentId, agentName, ide },
    });

    // Clean up empty rooms
    if (teamRooms.get(teamId)?.size === 0) {
      teamRooms.delete(teamId);
    }
  };

  req.on('close', cleanup);
  req.on('error', cleanup);
}
