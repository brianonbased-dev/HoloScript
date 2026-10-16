export const maxDuration = 300;

import { NextRequest } from 'next/server';
import { proxyHoloMeshSelf } from '../../../../lib/holomesh-proxy';

import { corsHeaders } from '../../_lib/cors';
export async function GET(req: NextRequest) {
  return proxyHoloMeshSelf('/api/holomesh/dashboard', req);
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
