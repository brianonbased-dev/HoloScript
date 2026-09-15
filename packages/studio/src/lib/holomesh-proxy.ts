import { NextRequest } from 'next/server';
import { hidePremiumRowsDeep } from './premium-view';

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

/**
 * Doors audit 2026-09-15. When the visitor sends no Authorization header of
 * its own, the request goes upstream under Studio's server key, so HoloMesh
 * answers with whatever THAT key may read: an author's own premium entries,
 * or every premium entry if the key is a founder key. None of that belongs to
 * the visitor. So whenever the server key stood in for the visitor, premium
 * rows in the answer are cut to their teaser (premium-view.ts). A visitor who
 * sends its own key is judged by HoloMesh's own premium gate instead.
 */
export function usesServerKeyFor(req?: Request): boolean {
  return !req?.headers.get('authorization');
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
  if (data !== null && usesServerKeyFor(req)) data = hidePremiumRowsDeep(data);

  return { ok: upstream.ok, status: upstream.status, data };
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

  const contentType = upstream.headers.get('Content-Type') || 'application/json';
  if (usesServerKeyFor(req) && contentType.includes('json')) {
    const text = await upstream.text();
    let body = text;
    try {
      body = JSON.stringify(hidePremiumRowsDeep(JSON.parse(text)));
    } catch {
      // Not JSON after all: no knowledge rows to cut; pass it on as it came.
    }
    return new Response(body, { status: upstream.status, headers: { 'Content-Type': contentType } });
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: { 'Content-Type': contentType },
  });
}
