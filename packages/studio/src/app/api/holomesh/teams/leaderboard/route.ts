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
