export const maxDuration = 300;

import { NextRequest } from 'next/server';
import { proxyHoloMesh, proxyHoloMeshSelf } from '../../../../../../lib/holomesh-proxy';

import { corsHeaders } from '../../../../_lib/cors';
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // "self"/"me" is the caller's own storefront: ask with the caller's key only,
  // never Studio's server key (which would answer as the "Founder" agent).
  if (id === 'self' || id === 'me') {
    return proxyHoloMeshSelf(`/api/holomesh/agent/${encodeURIComponent(id)}/storefront`, req);
  }
  return proxyHoloMesh(`/api/holomesh/agent/${encodeURIComponent(id)}/storefront`, req);
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
