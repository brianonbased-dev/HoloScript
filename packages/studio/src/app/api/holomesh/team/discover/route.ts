export const maxDuration = 300;

import { NextRequest } from 'next/server';
import { proxyHoloMesh } from '../../../../../lib/holomesh-proxy';

import { corsHeaders } from '../../../_lib/cors';
/**
 * GET /api/holomesh/team/discover
 * Proxies to MCP team discovery endpoint — returns list of public teams.
 * Query params forwarded as-is (e.g. ?type=open&limit=20).
 */
export async function GET(req: NextRequest) {
  return proxyHoloMesh('/api/holomesh/team/discover', req);
}


export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
