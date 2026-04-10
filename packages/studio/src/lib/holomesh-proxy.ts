import { NextRequest } from 'next/server';

const BASE = process.env.HOLOMESH_API_URL || process.env.MCP_SERVER_URL || 'https://mcp.holoscript.net';
const KEY = process.env.HOLOMESH_API_KEY || process.env.HOLOMESH_KEY || '';

/**
 * Proxy a request to the HoloMesh API on the MCP server.
 * Forwards auth headers, x-payment headers, query params, and body.
 */
export async function proxyHoloMesh(path: string, req: NextRequest): Promise<Response> {
  const url = `${BASE}${path}${req.nextUrl.search}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (KEY) headers['Authorization'] = `Bearer ${KEY}`;
  const xPayment = req.headers.get('x-payment');
  if (xPayment) headers['X-Payment'] = xPayment;
  const clientAuth = req.headers.get('authorization');
  if (clientAuth) headers['Authorization'] = clientAuth;

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
