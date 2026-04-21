export const maxDuration = 300;

import { NextRequest } from 'next/server';
import { proxyHoloMesh } from '../../../../lib/holomesh-proxy';

import { corsHeaders } from '../../_lib/cors';
export async function POST(req: NextRequest) {
  return proxyHoloMesh('/api/holomesh/contribute', req);
}


export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
