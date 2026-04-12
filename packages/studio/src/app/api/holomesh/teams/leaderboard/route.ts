export const maxDuration = 300;

import { NextRequest } from 'next/server';
import { proxyHoloMesh } from '../../../../../lib/holomesh-proxy';

/**
 * GET /api/holomesh/teams/leaderboard
 * Proxies to MCP team leaderboard endpoint.
 * Query params: ?limit=20&metric=tasks|knowledge|revenue
 */
export async function GET(req: NextRequest) {
  return proxyHoloMesh('/api/holomesh/teams/leaderboard', req);
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
