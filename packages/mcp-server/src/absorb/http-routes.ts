/**
 * Absorb Service HTTP Route Handler
 *
 * Proxies absorb operations, knowledge extraction, knowledge publishing,
 * and moltbook agent APIs to the absorb-service backend (no in-memory stub).
 *
 * All routes prefixed with /api/absorb/. Called from http-server.ts.
 */

import type http from 'http';

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' };
const ABSORB_URL = process.env.ABSORB_SERVICE_URL || 'https://absorb.holoscript.net';
const ABSORB_KEY =
  process.env.ABSORB_API_KEY ||
  process.env.HOLOSCRIPT_API_KEY ||
  process.env.HOLOSCRIPT_API_KEY ||
  '';

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

async function proxyToAbsorb(
  path: string,
  method: string,
  body?: string,
  req?: http.IncomingMessage
): Promise<{ status: number; data: any }> {
  const incomingAuth = req?.headers.authorization;
  const authHeader =
    typeof incomingAuth === 'string' && incomingAuth.length > 0
      ? incomingAuth
      : `Bearer ${ABSORB_KEY}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: authHeader,
  };
  const res = await fetch(`${ABSORB_URL}${path}`, {
    method,
    headers,
    body: body || undefined,
  });
  const data = await res.json().catch(async () => {
    const text = await res.text().catch(() => '<unreadable>');
    return { error: `Absorb service at ${ABSORB_URL}${path} returned non-JSON (status ${res.status}): ${text.slice(0, 200)}` };
  });
  return { status: res.status, data };
}

// ── Route Handler ──

export async function handleAbsorbRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: string
): Promise<boolean> {
  const method = req.method || 'GET';
  const q = url.indexOf('?');
  const pathname = q >= 0 ? url.slice(0, q) : url;
  const search = q >= 0 ? url.slice(q) : '';

  // ─────────────────────────────────────────────────────
  // Knowledge extraction: POST /api/absorb/projects/:id/knowledge
  // ─────────────────────────────────────────────────────
  const knowledgeMatch = pathname.match(/^\/api\/absorb\/projects\/([^/]+)\/knowledge$/);
  if (knowledgeMatch && method === 'POST') {
    const projectId = knowledgeMatch[1];
    const body = await readBody(req);
    const result = await proxyToAbsorb(`/api/projects/${projectId}/knowledge`, 'POST', body, req);
    send(res, result.status, result.data);
    return true;
  }

  // ─────────────────────────────────────────────────────
  // Knowledge publish: POST /api/absorb/knowledge/publish
  // ─────────────────────────────────────────────────────
  if (pathname === '/api/absorb/knowledge/publish' && method === 'POST') {
    const body = await readBody(req);
    const result = await proxyToAbsorb('/api/knowledge/publish', 'POST', body, req);
    send(res, result.status, result.data);
    return true;
  }

  // ─────────────────────────────────────────────────────
  // Knowledge earnings: GET /api/absorb/knowledge/earnings
  // ─────────────────────────────────────────────────────
  if (pathname === '/api/absorb/knowledge/earnings' && method === 'GET') {
    const result = await proxyToAbsorb('/api/knowledge/earnings', 'GET', undefined, req);
    send(res, result.status, result.data);
    return true;
  }

  // POST /api/absorb/moltbook/:id/cycle — legacy alias for absorb-service POST .../:id/trigger
  const cycleMatch = pathname.match(/^\/api\/absorb\/moltbook\/([^/]+)\/cycle$/);
  if (cycleMatch && method === 'POST') {
    const id = cycleMatch[1];
    const result = await proxyToAbsorb(`/api/absorb/moltbook/${id}/trigger`, 'POST', '{}', req);
    const d = result.data;
    const payload =
      d !== null && typeof d === 'object' && !Array.isArray(d)
        ? { ...d, _alias: 'cycle → trigger (absorb-service)' }
        : { result: d, _alias: 'cycle → trigger (absorb-service)' };
    send(res, result.status, payload);
    return true;
  }

  // ─────────────────────────────────────────────────────
  // Proxy all other /api/absorb/* to absorb-service (preserve /api/absorb prefix)
  // ─────────────────────────────────────────────────────
  const absorbPath = `${pathname}${search}`;
  const body = method !== 'GET' && method !== 'HEAD' ? await readBody(req) : undefined;
  const result = await proxyToAbsorb(absorbPath, method, body, req);
  send(res, result.status, result.data);
  return true;
}
