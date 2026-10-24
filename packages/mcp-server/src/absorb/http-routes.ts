/**
 * Absorb Service HTTP Route Handler
 *
 * Proxies absorb operations, knowledge extraction, knowledge publishing,
 * and moltbook agent APIs to the absorb-service backend (no in-memory stub).
 *
 * All routes prefixed with /api/absorb/. Called from http-server.ts.
 */

import type http from 'http';
import { createHash, timingSafeEqual } from 'crypto';

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' };
const ABSORB_URL = process.env.ABSORB_SERVICE_URL || 'https://absorb.holoscript.net';
// No service-key path: the proxy never lends a server key, and a server key
// presented by a caller is refused (absorb must see a user/account credential).

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

/** Server-side keys that must never reach absorb through this proxy. Read per call. */
function serviceKeys(): string[] {
  return [process.env.ABSORB_API_KEY, process.env.HOLOSCRIPT_API_KEY].filter(
    (k): k is string => typeof k === 'string' && k.trim().length > 0
  );
}

function sameSecret(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

/**
 * Every value a caller could be presenting as a secret, whatever the scheme:
 * the raw header, the credential after any scheme word (Bearer, Token, ...),
 * and for Basic the decoded user:pass plus the user and the password alone.
 */
function presentedSecrets(header: string): string[] {
  const out = new Set<string>([header.trim()]);
  const m = /^(\S+)\s+(.+)$/.exec(header.trim());
  if (m) {
    const cred = m[2].trim();
    out.add(cred);
    if (m[1].toLowerCase() === 'basic') {
      try {
        const decoded = Buffer.from(cred, 'base64').toString('utf8');
        out.add(decoded);
        const i = decoded.indexOf(':');
        if (i >= 0) {
          out.add(decoded.slice(0, i));
          out.add(decoded.slice(i + 1));
        }
      } catch {
        // not base64: the raw credential is already a candidate
      }
    }
  }
  return [...out].filter((v) => v.length > 0);
}

type ProxyAuth = { header: string } | { refused: 'missing' | 'service_key' };

function resolveProxyAuth(req?: http.IncomingMessage): ProxyAuth {
  let header: string | null = null;
  const incomingAuth = req?.headers.authorization;
  const incomingApiKey = req?.headers['x-api-key'];
  if (typeof incomingAuth === 'string' && incomingAuth.trim().length > 0) {
    header = incomingAuth.trim();
  } else if (typeof incomingApiKey === 'string' && incomingApiKey.trim().length > 0) {
    header = `Bearer ${incomingApiKey.trim()}`;
  }
  if (!header) return { refused: 'missing' };

  const candidates = presentedSecrets(header);
  const keys = serviceKeys().map((k) => k.trim());
  if (candidates.some((c) => keys.some((k) => sameSecret(c, k)))) {
    return { refused: 'service_key' };
  }
  return { header };
}

async function proxyToAbsorb(
  path: string,
  method: string,
  body?: string,
  req?: http.IncomingMessage
): Promise<{ status: number; data: any }> {
  const auth = resolveProxyAuth(req);
  if ('refused' in auth) {
    return auth.refused === 'service_key'
      ? {
          status: 401,
          data: {
            error: 'absorb_service_key_refused',
            message: 'Service keys are not accepted here. Send your own user or account credential.',
          },
        }
      : {
          status: 401,
          data: {
            error: 'missing_absorb_proxy_auth',
            message: 'Provide Authorization or x-api-key to proxy absorb-service requests.',
          },
        };
  }
  const authHeader = auth.header;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    Authorization: authHeader,
  };
  const absorbEndpointUrl = new URL(path, ABSORB_URL).toString();
  const res = await fetch(absorbEndpointUrl, {
    method,
    headers,
    body: body || undefined,
  });
  const data = await res.json().catch(async () => {
    const text = await res.text().catch(() => '<unreadable>');
    return {
      error: `Absorb service at ${absorbEndpointUrl} returned non-JSON (status ${res.status}): ${text.slice(0, 200)}`,
    };
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
