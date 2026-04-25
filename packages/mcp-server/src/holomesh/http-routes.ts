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
import {
  handleTtuLiveConnection,
  getTtuPresence,
  getTtuStats,
  getTtuHistory,
  publishTtuFrame,
  submitTtuStep,
  type TtuFrame,
  type TtuScene,
} from './ttu-feed';
import { handleBountyRoutes } from './routes/bounty-routes';
import { handleBoardRoutes } from './routes/board-routes';
import { handleTeamRoutes } from './routes/team-routes';
import { handleKnowledgeRoutes } from './routes/knowledge-routes';
import { handleAdminRoutes } from './routes/admin-routes';
import { handleCoreRoutes } from './routes/core-routes';
import { handleHoloDoorRoutes } from './routes/holodoor-routes';
import { handleIdentityExportRoutes } from './routes/identity-export-routes';
import { handleAttestationRoutes } from './routes/attestation-routes';
import { GossipProtocol, type GossipPacket } from '@holoscript/framework';

const meshGossip = new GossipProtocol();

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
    
    const agentId = searchParams.get('agent_id') || 'anonymous';
    // Hook SSE peer discovery into Gossip network
    meshGossip.shareWisdom(agentId, { teamId, status: 'sse_live', ts: Date.now() });

    handleTeamRoomConnection(req, res, teamId, searchParams);
    return true;
  }

  // 1b. Decentralized Gossip Protocol Sync
  if (pathname === '/api/holomesh/gossip/sync' && method === 'POST') {
    try {
      const payload = _body ? JSON.parse(_body) : {};
      const peerPool = new Map<string, GossipPacket>(Object.entries(payload.pool || {}));
      const absorbed = meshGossip.antiEntropySync(peerPool);
      const hostPool = Object.fromEntries(meshGossip.getPool());
      json(res, 200, { success: true, absorbed, pool: hostPool });
    } catch (e) {
      json(res, 400, { success: false, error: 'Invalid gossip payload format' });
    }
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

  // 1c. TTU multi-agent feed sessions (sibling task _0v98 — Phase 2 swarm builder).
  // Mirrors the team-room SSE/REST shape: many agents share one session,
  // any can publish frames, any can request the next frame via /step.
  // Endpoint identity matches the canonical CRDT URI shape used by
  // TextToUniverseTrait + the prophetic-GI HoloMesh transport:
  //   crdt://holomesh/feed/ttu/<sessionId>  ↔  /api/holomesh/ttu/<sessionId>/...
  if (pathname.match(/^\/api\/holomesh\/ttu\/[^/]+\/live$/) && method === 'GET') {
    const sessionId = extractParam(url, '/api/holomesh/ttu/').replace('/live', '');
    const searchParams = new URL(url, 'http://localhost').searchParams;
    handleTtuLiveConnection(req, res, sessionId, searchParams);
    return true;
  }

  if (pathname.match(/^\/api\/holomesh\/ttu\/[^/]+\/presence$/) && method === 'GET') {
    const sessionId = extractParam(url, '/api/holomesh/ttu/').replace('/presence', '');
    const online = getTtuPresence(sessionId);
    json(res, 200, { success: true, sessionId, online });
    return true;
  }

  if (pathname.match(/^\/api\/holomesh\/ttu\/[^/]+\/stats$/) && method === 'GET') {
    const sessionId = extractParam(url, '/api/holomesh/ttu/').replace('/stats', '');
    const all = getTtuStats();
    const stats = all[sessionId] || { connected: 0, pending: 0, queued: 0 };
    json(res, 200, { success: true, sessionId, stats });
    return true;
  }

  if (pathname.match(/^\/api\/holomesh\/ttu\/[^/]+\/history$/) && method === 'GET') {
    const sessionId = extractParam(url, '/api/holomesh/ttu/').replace('/history', '');
    const events = getTtuHistory(sessionId);
    json(res, 200, { success: true, sessionId, events });
    return true;
  }

  if (pathname.match(/^\/api\/holomesh\/ttu\/[^/]+\/publish$/) && method === 'POST') {
    const sessionId = extractParam(url, '/api/holomesh/ttu/').replace('/publish', '');
    let body: any;
    try {
      body = _body ? JSON.parse(_body) : await parseJsonBody(req);
    } catch {
      json(res, 400, { success: false, error: 'invalid JSON body' });
      return true;
    }
    const frame = body?.frame as TtuFrame | undefined;
    if (!frame || !Array.isArray(frame.probes) || typeof frame.frameId !== 'number') {
      json(res, 400, { success: false, error: 'frame { frameId, probes, ... } is required' });
      return true;
    }
    const publisherAgentId =
      typeof body.agent_id === 'string' ? body.agent_id : undefined;
    const result = publishTtuFrame(sessionId, frame, publisherAgentId);
    json(res, 200, { success: true, sessionId, ...result });
    return true;
  }

  if (pathname.match(/^\/api\/holomesh\/ttu\/[^/]+\/step$/) && method === 'POST') {
    const sessionId = extractParam(url, '/api/holomesh/ttu/').replace('/step', '');
    let body: any;
    try {
      body = _body ? JSON.parse(_body) : await parseJsonBody(req);
    } catch {
      json(res, 400, { success: false, error: 'invalid JSON body' });
      return true;
    }
    const scene = body?.scene as TtuScene | undefined;
    if (
      !scene ||
      !Array.isArray(scene.cameraPosition) ||
      !Array.isArray(scene.sunDirection) ||
      !Array.isArray(scene.sunColor)
    ) {
      json(res, 400, {
        success: false,
        error: 'scene { cameraPosition, cameraForward, sunDirection, sunColor } is required',
      });
      return true;
    }
    const agentId = typeof body.agent_id === 'string' ? body.agent_id : 'anonymous';
    const timeoutMs = Number.isFinite(body.timeout_ms) ? Number(body.timeout_ms) : undefined;
    try {
      const frame = await submitTtuStep(sessionId, scene, agentId, timeoutMs);
      json(res, 200, { success: true, sessionId, frame });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown error';
      // 504 Gateway Timeout is the right code when no producer responded in budget.
      const status = msg.includes('no frame within') ? 504 : 500;
      json(res, status, { success: false, sessionId, error: msg });
    }
    return true;
  }

  // 2. Delegate to modular route handlers
  if (await handleCoreRoutes(req, res, pathname, method, url)) return true;
  if (await handleAdminRoutes(req, res, pathname, method, url)) return true;
  if (await handleBountyRoutes(req, res, pathname, method, url)) return true;
  if (await handleBoardRoutes(req, res, pathname, method, url)) return true;
  if (await handleHoloDoorRoutes(req, res, pathname, method, url)) return true;
  if (await handleIdentityExportRoutes(req, res, pathname, method, url)) return true;
  if (await handleAttestationRoutes(req, res, pathname, method, url)) return true;
  if (await handleTeamRoutes(req, res, pathname, method, url)) return true;
  if (await handleKnowledgeRoutes(req, res, pathname, method, url)) return true;

  // 3. Fallback/Uncached routes
  if (pathname === '/api/holomesh/health' && method === 'GET') {
    json(res, 200, { 
      status: 'operational', 
      version: '6.1.0',
      orchestrator: getClient().getAgentId() ? 'connected' : 'disconnected',
      contracts: {
        board_add_warnings_field: {
          path: '/api/holomesh/team/:id/board',
          expectedType: 'array',
          requiredForLongDescriptions: true,
          reason: 'description truncation metadata must be machine-detectable',
        },
      },
    });
    return true;
  }

  return false;
}
