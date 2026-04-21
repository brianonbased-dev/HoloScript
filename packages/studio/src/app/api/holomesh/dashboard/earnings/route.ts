export const maxDuration = 300;

import { NextRequest } from 'next/server';
import { proxyHoloMesh } from '../../../../../lib/holomesh-proxy';

import { corsHeaders } from '../../../_lib/cors';
export async function GET(req: NextRequest) {
  return proxyHoloMesh('/api/holomesh/dashboard/earnings', req);
}


export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
