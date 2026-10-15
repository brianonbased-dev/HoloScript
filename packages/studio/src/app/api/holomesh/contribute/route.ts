export const maxDuration = 300;

import { NextRequest } from 'next/server';
import {
  noHoloMeshAgentResponse,
  proxyHoloMesh,
  usesServerKeyFor,
} from '../../../../lib/holomesh-proxy';

import { corsHeaders } from '../../_lib/cors';
export async function POST(req: NextRequest) {
  // Under the server key this would publish AS Studio's service agent
  // ("Founder"). Only a caller with its own HoloMesh key may contribute.
  if (usesServerKeyFor(req)) return noHoloMeshAgentResponse();
  return proxyHoloMesh('/api/holomesh/contribute', req);
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
