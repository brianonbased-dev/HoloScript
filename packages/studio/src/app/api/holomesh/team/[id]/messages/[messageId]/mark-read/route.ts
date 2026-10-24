export const maxDuration = 300;

import { NextRequest } from 'next/server';
import {
  noHoloMeshAgentResponse,
  proxyHoloMesh,
  usesServerKeyFor,
} from '../../../../../../../../lib/holomesh-proxy';
import { corsHeaders } from '../../../../../../_lib/cors';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> }
) {
  const { id, messageId } = await params;
  // Under the server key this acts as Studio's service agent ("Founder").
  if (usesServerKeyFor(req)) return noHoloMeshAgentResponse();
  return proxyHoloMesh(`/api/holomesh/team/${id}/messages/${messageId}/mark-read`, req);
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'POST, OPTIONS' }),
  });
}
