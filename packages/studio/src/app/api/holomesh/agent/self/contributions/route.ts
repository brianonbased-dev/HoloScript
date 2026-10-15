export const maxDuration = 300;

import { NextRequest } from 'next/server';
import {
  noHoloMeshAgentResponse,
  proxyHoloMesh,
  usesServerKeyFor,
} from '../../../../../../lib/holomesh-proxy';

import { corsHeaders } from '../../../../_lib/cors';
/**
 * GET /api/holomesh/agent/self/contributions
 * Returns daily contribution counts for the contribution graph.
 * Query params: ?days=365
 */
export async function GET(req: NextRequest) {
  // Never answer "self" under the server key: that is the Founder's graph.
  if (usesServerKeyFor(req)) return noHoloMeshAgentResponse();
  return proxyHoloMesh('/api/holomesh/agent/self/contributions', req);
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
