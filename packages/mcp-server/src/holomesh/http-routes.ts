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
import { handleAdminRoutes } from './routes/admin-routes';
import { handleCoreRoutes } from './routes/core-routes';
import { handleHoloDoorRoutes } from './routes/holodoor-routes';

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

  // 0. Global CORS Preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-mcp-api-key',
    });
    res.end();
    return true;
  }

  // 1. Real-time SSE Room (V7)
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/room\/live$/)) {
    const teamId = extractParam(url, '/api/holomesh/team/').replace('/room/live', '');
    console.log(`[holomesh] SSE connection attempt for team ${teamId} from ${req.headers['user-agent'] || 'unknown'}`);
    const searchParams = new URL(url, 'http://localhost').searchParams;
    handleTeamRoomConnection(req, res, teamId, searchParams);
    return true;
  }

  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/room\/presence$/)) {
    const teamId = extractParam(url, '/api/holomesh/team/').replace('/room/presence', '');
    const online = getRoomPresence(teamId);
    json(res, 200, { success: true, teamId, online });
    return true;
  }

  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/room\/stats$/)) {
    const teamId = extractParam(url, '/api/holomesh/team/').replace('/room/stats', '');
    const allStats = getRoomStats();
    const stats = { connected: allStats[teamId] || 0 };
    json(res, 200, { success: true, teamId, stats });
    return true;
  }

  // 2. Delegate to modular route handlers
  if (await handleCoreRoutes(req, res, pathname, method, url)) return true;
  if (await handleAdminRoutes(req, res, pathname, method, url)) return true;
  if (await handleBountyRoutes(req, res, pathname, method, url)) return true;
  if (await handleBoardRoutes(req, res, pathname, method, url)) return true;
  if (await handleHoloDoorRoutes(req, res, pathname, method, url)) return true;
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
