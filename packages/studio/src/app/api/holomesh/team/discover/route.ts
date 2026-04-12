export const maxDuration = 300;

import { NextRequest } from 'next/server';
import { proxyHoloMesh } from '../../../../../lib/holomesh-proxy';

/**
 * GET /api/holomesh/team/discover
 * Proxies to MCP team discovery endpoint — returns list of public teams.
 * Query params forwarded as-is (e.g. ?type=open&limit=20).
 */
export async function GET(req: NextRequest) {
  return proxyHoloMesh('/api/holomesh/team/discover', req);
}


export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-mcp-api-key',
    },
  });
}
