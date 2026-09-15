import { NextRequest } from 'next/server';

const BASE =
  process.env.HOLOMESH_API_URL || process.env.MCP_SERVER_URL || 'https://mcp.holoscript.net';
const KEY = process.env.HOLOMESH_API_KEY || process.env.HOLOMESH_KEY || '';

function holomeshHeaders(req?: Request): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (KEY) headers['Authorization'] = `Bearer ${KEY}`;

  const xPayment = req?.headers.get('x-payment');
  if (xPayment) headers['X-Payment'] = xPayment;

  const clientAuth = req?.headers.get('authorization');
  if (clientAuth) headers['Authorization'] = clientAuth;

  return headers;
}

export async function fetchHoloMeshJson<T>(
  path: string,
  req?: Request
): Promise<{ ok: boolean; status: number; data: T | null }> {
  const upstream = await fetch(`${BASE}${path}`, {
    method: 'GET',
    headers: holomeshHeaders(req),
    cache: 'no-store',
  });

  let data: T | null = null;
  try {
    data = (await upstream.json()) as T;
  } catch {
    data = null;
  }

  return { ok: upstream.ok, status: upstream.status, data };
}

export type HoloMeshCaller =
  | { ok: true; agentId: string; name: string; wallet: string | null }
  | { ok: false; status: 401 | 502; error: string };

/**
 * The caller's OWN HoloMesh credential, exactly as mcp-server accepts it
 * (`Authorization: Bearer <key>` or `x-mcp-api-key: <key>`), or null.
 */
function callerCredentialHeaders(req: Request): Record<string, string> | null {
  const auth = req.headers.get('authorization')?.trim();
  if (auth && /^Bearer\s+\S+/i.test(auth)) return { Authorization: auth };
  const mcpKey = req.headers.get('x-mcp-api-key')?.trim();
  if (mcpKey) return { 'x-mcp-api-key': mcpKey };
  return null;
}

/**
 * Who is calling, according to mcp-server's `GET /api/holomesh/me` — the same
 * key introspection `/api/holomesh/agent/self` relies on.
 *
 * Unlike {@link fetchHoloMeshJson}, this NEVER falls back to Studio's own
 * HOLOMESH_API_KEY: with the fallback, every anonymous caller would be
 * identified as Studio's service agent. No caller credential means 401.
 */
export async function resolveHoloMeshCaller(req: Request): Promise<HoloMeshCaller> {
  const credential = callerCredentialHeaders(req);
  if (!credential) {
    return {
      ok: false,
      status: 401,
      error: 'Authentication required. Send your HoloMesh API key as Authorization: Bearer <key>.',
    };
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${BASE}/api/holomesh/me`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', ...credential },
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return { ok: false, status: 502, error: 'Could not verify your HoloMesh identity.' };
  }

  if (upstream.status === 401 || upstream.status === 403) {
    return { ok: false, status: 401, error: 'HoloMesh API key was not recognised.' };
  }
  if (!upstream.ok) {
    return { ok: false, status: 502, error: 'Could not verify your HoloMesh identity.' };
  }

  let data: { success?: unknown; agentId?: unknown; name?: unknown; wallet?: unknown } | null;
  try {
    data = (await upstream.json()) as typeof data;
  } catch {
    data = null;
  }
  const agentId = typeof data?.agentId === 'string' ? data.agentId.trim() : '';
  if (data?.success !== true || !agentId || agentId === 'anonymous') {
    return { ok: false, status: 401, error: 'HoloMesh API key was not recognised.' };
  }

  return {
    ok: true,
    agentId,
    name: typeof data.name === 'string' ? data.name : '',
    wallet: typeof data.wallet === 'string' ? data.wallet : null,
  };
}

/**
 * Proxy a request to the HoloMesh API on the MCP server.
 * Forwards auth headers, x-payment headers, query params, and body.
 */
export async function proxyHoloMesh(path: string, req: NextRequest): Promise<Response> {
  const url = `${BASE}${path}${req.nextUrl.search}`;
  const headers = holomeshHeaders(req);

  const upstream = await fetch(url, {
    method: req.method,
    headers,
    ...(req.method !== 'GET' && req.method !== 'HEAD' ? { body: await req.text() } : {}),
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('Content-Type') || 'application/json' },
  });
}
