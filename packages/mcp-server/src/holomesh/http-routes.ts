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
import { resolveRequestingAgent } from './auth-utils';
import { isTrustedLoopbackMcpPeer, resolveMcpBindHost } from '../http-bind-host';
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
import { handleTokenRoutes } from './routes/token-routes';
import { handleCustodialWalletRoutes } from './routes/custodial-wallet-routes';
import { handleLotusRoutes } from './routes/lotus-routes';
import { handleSecretsBrokerRoutes } from './routes/secrets-broker-routes';
import { handlePublicDiscoveryRoutes } from './routes/public-discovery-routes';
import { handleInviteRoutes } from './routes/invite-routes';
import { handleStoryWeaverGenerationRoutes } from './routes/storyweaver-generation-routes';
import { handleWebhookRoutes } from './routes/webhook-routes';
import { handleGithubWebhookRoutes } from './routes/github-webhook-routes';
import { handleComputeJobRoutes } from './routes/compute-job-routes';
import { GossipProtocol, type GossipPacket } from '@holoscript/framework';

const meshGossip = new GossipProtocol();

/**
 * Local stays open; the cloud gets a lock.
 *
 * FOUNDER RULING, 2026-09-10: *"we have been building for local and cloud with
 * different use cases. local is more open because all the agents we have
 * running."* So the fix for an over-open endpoint is NOT to demand credentials
 * everywhere — that would put cloud ceremony on the local case, which is
 * deliberately low-friction because the machine is full of our own agents. The
 * lock belongs on the surface strangers can reach.
 *
 * `isTrustedLoopbackMcpPeer` is that line and it cannot be fooled from outside:
 * it requires the operator to have opted in AND the listener to be bound to
 * loopback AND the TCP peer to be loopback. A deployed box binds 0.0.0.0, so the
 * local branch is unreachable there by construction. http-server.ts already uses
 * the same primitive for its "explicit local-custody mode".
 *
 * Note for whoever wires this to more routes: MCP_TRUST_LOOPBACK is currently set
 * nowhere in our configuration, so today the local branch never fires and this is
 * in practice "authenticated only". That is safe, but it is not yet the founder's
 * shape — standing up a real local server is the other half of that work.
 */
function localOrAuthenticated(req: http.IncomingMessage): boolean {
  if (resolveRequestingAgent(req).authenticated) return true;
  return isTrustedLoopbackMcpPeer({
    enabled: process.env.MCP_TRUST_LOOPBACK === 'true',
    bindHost: resolveMcpBindHost(),
    remoteAddress: req.socket?.remoteAddress,
  });
}

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
    // THE ROOM IS NO LONGER OPEN TO THE INTERNET.
    //
    // Until now this dispatched with no authentication at all: one anonymous GET
    // replayed the room's last 50 events and then streamed everything said
    // afterwards for as long as the socket was held, and the connection could
    // announce itself under any name it liked. An intruder calling itself
    // "claudecode" was watched arriving in a real member's own feed.
    //
    // THE CHECK LIVES HERE, IN THE ROUTE, AND NOT INSIDE handleTeamRoomConnection
    // ON PURPOSE. The mini-game rooms in bounty-routes.ts call that same function
    // through their own unauthenticated flow, so putting the gate inside it would
    // silently change mini-game joining as a side effect. A shared function is
    // the wrong home for a policy belonging to one caller.
    //
    // WHY THIS DOES NOT LOCK US OUT — the reason it stayed open earlier today.
    // All three of our own room clients already send `Authorization: Bearer`
    // (room-connect.mjs, its canon-exec twin, and team-connect.mjs). My earlier
    // claim that they did not was wrong: it came from reading the URL-builder
    // helper and never its caller. Verified against the deployed server before
    // making this change — an authenticated read returned 200, so the key our
    // agents carry does resolve there.
    //
    // WHAT THIS DELIBERATELY DOES NOT FIX. A caller who authenticates may still
    // choose the display name it announces. Our agents share one key that
    // resolves to a single principal while announcing their own distinct names,
    // so deriving the name from the credential would collapse every agent in the
    // room into one identity — a worse room, not a safer one. Impersonation is
    // therefore now bounded to holders of our keys rather than open to anyone on
    // the internet, which is the honest description of what changed. Per-agent
    // keys are the real fix and are their own piece of work.
    if (!localOrAuthenticated(req)) {
      json(res, 401, {
        error: 'Authentication required to join the room.',
        hint: 'Send Authorization: Bearer <HoloMesh API key>.',
      });
      return true;
    }
    const teamId = extractParam(url, '/api/holomesh/team/').replace('/room/live', '');
    console.log(
      `[holomesh] SSE connection attempt for team ${teamId} from ${req.headers['user-agent'] || 'unknown'}`
    );
    const searchParams = new URL(url, 'http://localhost').searchParams;

    const agentId = searchParams.get('agent_id') || 'anonymous';
    // Hook SSE peer discovery into Gossip network
    meshGossip.shareWisdom(agentId, { teamId, status: 'sse_live', ts: Date.now() });

    handleTeamRoomConnection(req, res, teamId, searchParams);
    return true;
  }

  // 1b. Decentralized Gossip Protocol Sync
  //
  // ⚠ UNAUTHENTICATED, AND IT BOTH ACCEPTS AND RETURNS. An anonymous POST merges
  // caller-supplied entries into our gossip pool via antiEntropySync and then
  // returns the WHOLE host pool in the response — so one request is simultaneously
  // a write into shared state and a read of which agents and teams this server has
  // seen. It sits between the room route and the presence route, both of which
  // were gated on 2026-09-10; this one was read past in that same edit.
  //
  // Note what the route just above feeds it: the room handler calls
  // meshGossip.shareWisdom(agentId, ...) with the agent id taken from the query
  // string. So a name chosen by a caller reaches the pool that this endpoint hands
  // out. Gating the room did not close that, because this is a second door into
  // the same room.
  //
  // Not gated here for the same reason as the TTU block below: it is a published
  // protocol surface and turning it off is the founder's call. When made, the fix
  // is localOrAuthenticated(req) at this route. If the answer is that gossip must
  // stay open by design — which is a defensible thing for a gossip protocol — then
  // say so HERE, because an endpoint that is deliberately public and silent about
  // it is indistinguishable from one nobody checked.
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
    if (!localOrAuthenticated(req)) {
      json(res, 401, { error: 'Authentication required to read room presence.' });
      return true;
    }
    const teamId = extractParam(url, '/api/holomesh/team/').replace('/room/presence', '');
    const online = getRoomPresence(teamId);
    json(res, 200, { success: true, teamId, online });
    return true;
  }

  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/room\/stats$/)) {
    if (!localOrAuthenticated(req)) {
      json(res, 401, { error: 'Authentication required to read room stats.' });
      return true;
    }
    const teamId = extractParam(url, '/api/holomesh/team/').replace('/room/stats', '');
    const allStats = getRoomStats();
    const stats = { connected: allStats[teamId] || 0 };
    json(res, 200, { success: true, teamId, stats });
    return true;
  }

  // ⚠ UNAUTHENTICATED — READ AND WRITE. The six TTU routes below take no
  // credential of any kind, and `/publish` and `/step` are writes. Anyone who can
  // reach this server can open a session's stream, read its replay buffer, join
  // its presence list under any name they choose, and publish frames into it.
  //
  // READ THIS BEFORE ASSUMING THE LOCK ABOVE COVERS THEM. It does not. The three
  // `/room/*` routes ~60 lines up were gated on 2026-09-10 after an intruder was
  // observed in a live room. These mirror that exact shape — live / presence /
  // stats — and were left open in the same edit, by the same agent, because they
  // were read past rather than considered. Proximity to a guard is not coverage.
  //
  // WHY THEY ARE NOT GATED YET, and it is a decision rather than an oversight
  // now. The one real client, HoloMeshProphecyTransport in
  // packages/snn-webgpu/src/prophetic-gi/transport-holomesh.ts:182-186, sends
  // `Authorization: Bearer` only `if (this.options.apiKey)` — so auth is optional
  // at the client. Nothing in this repo constructs it outside
  // __tests__/prophetic-gi.test.ts (verified with `git grep`, which finds it where
  // ripgrep times out), but it IS exported from that package's public index.ts, so
  // gating changes a published contract for any outside consumer that omits the
  // key. That is the founder's call, not an unattended one.
  //
  // WHEN IT IS MADE, the fix is `localOrAuthenticated(req)` — already defined in
  // this file and used by the three room routes — applied at each route below,
  // NOT inside handleTtuLiveConnection, for the same reason the room gate sits
  // here: a shared handler is the wrong home for one caller's policy.
  //
  // SEPARATELY, and worse for a write path: ttu-feed.ts keeps session state in
  // memory keyed by a caller-supplied sessionId. An unauthenticated writer can
  // therefore create unbounded sessions. Treat that as the reason this is a
  // priority rather than a tidy-up.
  //
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
    const publisherAgentId = typeof body.agent_id === 'string' ? body.agent_id : undefined;
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
  if (await handleComputeJobRoutes(req, res, pathname, method, url)) return true;
  if (await handleHoloDoorRoutes(req, res, pathname, method, url)) return true;
  if (await handleIdentityExportRoutes(req, res, pathname, method, url)) return true;
  if (await handleAttestationRoutes(req, res, pathname, method, url)) return true;
  if (await handleCustodialWalletRoutes(req, res, pathname, method, url)) return true;
  if (await handleLotusRoutes(req, res, pathname, method, url)) return true;
  if (await handleTeamRoutes(req, res, pathname, method, url)) return true;
  if (await handleKnowledgeRoutes(req, res, pathname, method, url)) return true;
  if (await handleTokenRoutes(req, res, pathname, method, url)) return true;
  if (await handleSecretsBrokerRoutes(req, res, pathname, method, url)) return true;
  if (await handleInviteRoutes(req, res, pathname, method)) return true;
  if (await handleStoryWeaverGenerationRoutes(req, res, pathname, method, url)) return true;
  if (handlePublicDiscoveryRoutes(req, res)) return true;
  if (await handleGithubWebhookRoutes(req, res, pathname, method)) return true;
  if (await handleWebhookRoutes(req, res, pathname, method, url)) return true;

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
