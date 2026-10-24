export const maxDuration = 300;

import { NextRequest } from 'next/server';
import {
  noHoloMeshAgentResponse,
  proxyHoloMesh,
  usesServerKeyFor,
} from '../../../../../../lib/holomesh-proxy';
import { corsHeaders } from '../../../../_lib/cors';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Under the server key this acts as Studio's service agent ("Founder").
  if (usesServerKeyFor(req)) return noHoloMeshAgentResponse();
  return proxyHoloMesh(`/api/holomesh/team/${id}/messages`, req);
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, OPTIONS' }),
  });
}
