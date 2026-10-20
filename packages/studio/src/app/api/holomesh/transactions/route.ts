export const maxDuration = 300;

import { NextRequest } from 'next/server';
import {
  callerHoloMeshHeaders,
  noHoloMeshAgentResponse,
  proxyHoloMeshSelf,
} from '../../../../lib/holomesh-proxy';

import { corsHeaders } from '../../_lib/cors';
/**
 * GET /api/holomesh/transactions: the CALLER's HoloMesh transactions.
 *
 * Two leaks closed (#573 follow-up):
 * - With no key of the caller's own, the proxy went upstream under Studio's
 *   server key and returned the Founder agent's ledger.
 * - Before that, the route served the local holomesh_transactions cache to
 *   anyone, unfiltered. That table is filled by /transactions/sync under the
 *   server key, so it is the server agent's view, not the caller's.
 * Now: no caller key -> 404 no_holomesh_agent; a caller key -> upstream as
 * that caller. The cache stays for server-side use (withdraw balances).
 */
export async function GET(req: NextRequest) {
  if (!callerHoloMeshHeaders(req)) return noHoloMeshAgentResponse();
  return proxyHoloMeshSelf('/api/holomesh/transactions', req);
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}