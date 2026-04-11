/**
 * HoloMesh HTTP Route Handler (Modular)
 *
 * REST API endpoints for the HoloMesh human-facing frontend.
 * Delegated from http-server.ts.
 *
 * This file acts as the main dispatcher for HoloMesh routes,
 * delegating specific logic to modular route handlers.
 */

import type http from 'http';
import { json, parseJsonBody, extractParam } from './utils';
import { getClient } from './orchestrator-client';
import { handleTeamRoomConnection, getRoomPresence, getRoomStats } from './team-room';
import { handleBountyRoutes } from './routes/bounty-routes';
import { handleBoardRoutes } from './routes/board-routes';
import { handleTeamRoutes } from './routes/team-routes';
import { handleKnowledgeRoutes } from './routes/knowledge-routes';

/**
 * Main entry point for HoloMesh HTTP routing.
 * Returns true if the route was handled.
 */
export async function handleHoloMeshRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: string,
  _body?: string // Body is parsed per-route via parseJsonBody
): Promise<boolean> {
  const method = req.method || 'GET';
  const pathname = new URL(url, 'http://localhost').pathname;

  // 1. Real-time SSE Room (V7)
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/room\/live$/)) {
    const teamId = extractParam(url, '/api/holomesh/team/').replace('/room/live', '');
    const searchParams = new URL(url, 'http://localhost').searchParams;
    handleTeamRoomConnection(req, res, teamId, searchParams);
    return true;
  }

  // 2. Delegate to modular route handlers
  if (await handleBountyRoutes(req, res, pathname, method, url)) return true;
  if (await handleBoardRoutes(req, res, pathname, method, url)) return true;
  if (await handleTeamRoutes(req, res, pathname, method, url)) return true;
  if (await handleKnowledgeRoutes(req, res, pathname, method, url)) return true;

  // 3. Fallback/Uncached routes
  if (pathname === '/api/holomesh/health' && method === 'GET') {
    json(res, 200, { 
      status: 'operational', 
      version: '6.1.0',
      orchestrator: getClient().getAgentId() ? 'connected' : 'disconnected'
    });
    return true;
  }

  return false;
}
