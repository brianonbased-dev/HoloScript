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
  // "self" under the server key is the Founder's storefront. Named agents stay public.
  if (id === 'self' && usesServerKeyFor(req)) return noHoloMeshAgentResponse();
  return proxyHoloMesh(`/api/holomesh/agent/${id}/storefront`, req);
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
