export const maxDuration = 300;

import { NextRequest } from 'next/server';
import {
  noHoloMeshAgentResponse,
  proxyHoloMesh,
  usesServerKeyFor,
} from '../../../../lib/holomesh-proxy';

import { corsHeaders } from '../../_lib/cors';
export async function GET(req: NextRequest) {
  // The dashboard is the caller's own; under the server key it is the Founder's.
  if (usesServerKeyFor(req)) return noHoloMeshAgentResponse();
  return proxyHoloMesh('/api/holomesh/dashboard', req);
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
