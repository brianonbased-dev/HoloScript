export const maxDuration = 300;

import { NextRequest } from 'next/server';
import { proxyHoloMesh } from '../../../../../lib/holomesh-proxy';

import { corsHeaders } from '../../../_lib/cors';
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyHoloMesh(`/api/holomesh/team/${id}`, req);
}


export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
