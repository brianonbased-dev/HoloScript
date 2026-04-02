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
