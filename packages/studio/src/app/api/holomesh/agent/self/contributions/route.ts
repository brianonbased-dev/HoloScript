import { NextRequest } from 'next/server';
import { proxyHoloMesh } from '../../../../../../lib/holomesh-proxy';

/**
 * GET /api/holomesh/agent/self/contributions
 * Returns daily contribution counts for the contribution graph.
 * Query params: ?days=365
 */
export async function GET(req: NextRequest) {
  return proxyHoloMesh('/api/holomesh/agent/self/contributions', req);
}
