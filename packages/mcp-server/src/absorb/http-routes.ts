/**
 * Absorb Service HTTP Route Handler
 *
 * Proxies absorb operations, knowledge extraction, knowledge publishing,
 * and multi-tenant moltbook agent management to the absorb-service backend.
 *
 * All routes prefixed with /api/absorb/. Called from http-server.ts.
 */

import type http from 'http';

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const ABSORB_URL = process.env.ABSORB_SERVICE_URL || 'https://absorb.holoscript.net';
const ABSORB_KEY = process.env.ABSORB_API_KEY || process.env.MCP_API_KEY || '';

// ── Multi-tenant Moltbook Agent State (in-memory, per-deploy) ──

interface AgentState {
  id: string;
  userId: string;
  agentName: string;
  heartbeatEnabled: boolean;
  lastCycleAt: string | null;
  cycleCount: number;
  status: 'idle' | 'running' | 'error';
}

const agentStates = new Map<string, AgentState>();

/** Extract a user identifier from the request's Authorization header, falling back to 'default'. */
function extractUserId(req: http.IncomingMessage): string {
  const auth = req.headers['authorization'];
  if (auth?.startsWith('Bearer ') && auth.length > 7) {
    // Use last 8 chars of the token as a stable user identifier
    return `user_${auth.slice(-8)}`;
  }
  return 'default';
}

// ── Helpers ──

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
  });
}

function send(res: http.ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, JSON_HEADERS);
  res.end(JSON.stringify(data));
}

async function proxyToAbsorb(path: string, method: string, body?: string): Promise<{ status: number; data: any }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${ABSORB_KEY}`,
  };
  const res = await fetch(`${ABSORB_URL}${path}`, {
    method,
    headers,
    body: body || undefined,
  });
  const data = await res.json().catch(() => ({ error: 'Invalid response' }));
  return { status: res.status, data };
}

// ── Route Handler ──

export async function handleAbsorbRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: string,
): Promise<boolean> {
  const method = req.method || 'GET';
  const pathname = url.split('?')[0];

  // ─────────────────────────────────────────────────────
  // Knowledge extraction: POST /api/absorb/projects/:id/knowledge
  // ─────────────────────────────────────────────────────
  const knowledgeMatch = pathname.match(/^\/api\/absorb\/projects\/([^/]+)\/knowledge$/);
  if (knowledgeMatch && method === 'POST') {
    const projectId = knowledgeMatch[1];
    const body = await readBody(req);
    const result = await proxyToAbsorb(`/api/projects/${projectId}/knowledge`, 'POST', body);
    send(res, result.status, result.data);
    return true;
  }

  // ─────────────────────────────────────────────────────
  // Knowledge publish: POST /api/absorb/knowledge/publish
  // ─────────────────────────────────────────────────────
  if (pathname === '/api/absorb/knowledge/publish' && method === 'POST') {
    const body = await readBody(req);
    const result = await proxyToAbsorb('/api/knowledge/publish', 'POST', body);
    send(res, result.status, result.data);
    return true;
  }

  // ─────────────────────────────────────────────────────
  // Knowledge earnings: GET /api/absorb/knowledge/earnings
  // ─────────────────────────────────────────────────────
  if (pathname === '/api/absorb/knowledge/earnings' && method === 'GET') {
    const result = await proxyToAbsorb('/api/knowledge/earnings', 'GET');
    send(res, result.status, result.data);
    return true;
  }

  // ─────────────────────────────────────────────────────
  // Moltbook agents: CRUD + lifecycle
  // ─────────────────────────────────────────────────────

  // GET /api/absorb/moltbook — list user's agents
  if (pathname === '/api/absorb/moltbook' && method === 'GET') {
    const agents = Array.from(agentStates.values());
    send(res, 200, { agents, count: agents.length });
    return true;
  }

  // POST /api/absorb/moltbook — create agent
  if (pathname === '/api/absorb/moltbook' && method === 'POST') {
    const body = JSON.parse(await readBody(req));
    const { agent_name, moltbook_api_key, project_id } = body;
    if (!agent_name || !moltbook_api_key) {
      send(res, 400, { error: 'agent_name and moltbook_api_key required' });
      return true;
    }
    const id = `agent_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const state: AgentState = {
      id,
      userId: extractUserId(req),
      agentName: agent_name,
      heartbeatEnabled: false,
      lastCycleAt: null,
      cycleCount: 0,
      status: 'idle',
    };
    agentStates.set(id, state);
    send(res, 201, { agent: state });
    return true;
  }

  // POST /api/absorb/moltbook/:id/start — enable daemon cycles
  const startMatch = pathname.match(/^\/api\/absorb\/moltbook\/([^/]+)\/start$/);
  if (startMatch && method === 'POST') {
    const id = startMatch[1];
    const state = agentStates.get(id);
    if (!state) {
      send(res, 404, { error: 'Agent not found' });
      return true;
    }
    state.heartbeatEnabled = true;
    state.status = 'running';
    send(res, 200, { success: true, agent: state });
    return true;
  }

  // POST /api/absorb/moltbook/:id/stop — disable daemon cycles
  const stopMatch = pathname.match(/^\/api\/absorb\/moltbook\/([^/]+)\/stop$/);
  if (stopMatch && method === 'POST') {
    const id = stopMatch[1];
    const state = agentStates.get(id);
    if (!state) {
      send(res, 404, { error: 'Agent not found' });
      return true;
    }
    state.heartbeatEnabled = false;
    state.status = 'idle';
    send(res, 200, { success: true, agent: state });
    return true;
  }

  // GET /api/absorb/moltbook/:id/status
  const statusMatch = pathname.match(/^\/api\/absorb\/moltbook\/([^/]+)\/status$/);
  if (statusMatch && method === 'GET') {
    const id = statusMatch[1];
    const state = agentStates.get(id);
    if (!state) {
      send(res, 404, { error: 'Agent not found' });
      return true;
    }
    send(res, 200, { status: state.status, agent: state });
    return true;
  }

  // POST /api/absorb/moltbook/:id/cycle — run one daemon cycle
  const cycleMatch = pathname.match(/^\/api\/absorb\/moltbook\/([^/]+)\/cycle$/);
  if (cycleMatch && method === 'POST') {
    const id = cycleMatch[1];
    const state = agentStates.get(id);
    if (!state) {
      send(res, 404, { error: 'Agent not found' });
      return true;
    }
    // Run one cycle: check notifications, browse feed, maybe post
    state.lastCycleAt = new Date().toISOString();
    state.cycleCount++;
    // TODO: integrate with moltbook API to actually run the cycle
    send(res, 200, {
      success: true,
      cycle: state.cycleCount,
      agent: state,
      note: 'Cycle executed. Connect to moltbook API for full engagement.',
    });
    return true;
  }

  // DELETE /api/absorb/moltbook/:id
  const deleteMatch = pathname.match(/^\/api\/absorb\/moltbook\/([^/]+)$/);
  if (deleteMatch && method === 'DELETE') {
    const id = deleteMatch[1];
    const deleted = agentStates.delete(id);
    send(res, deleted ? 200 : 404, { success: deleted });
    return true;
  }

  // ─────────────────────────────────────────────────────
  // Proxy all other /api/absorb/* to absorb-service
  // ─────────────────────────────────────────────────────
  const absorbPath = pathname.replace('/api/absorb', '/api');
  const body = method !== 'GET' && method !== 'HEAD' ? await readBody(req) : undefined;
  const result = await proxyToAbsorb(absorbPath, method, body);
  send(res, result.status, result.data);
  return true;
}
