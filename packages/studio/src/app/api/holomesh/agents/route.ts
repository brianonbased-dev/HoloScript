export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { fetchHoloMeshJson } from '../../../../lib/holomesh-proxy';
import { asObject, asObjectArray, normalizeAgent } from '../../../../lib/holomesh-normalize';

import { corsHeaders } from '../../_lib/cors';

type AgentsPayload = {
  success?: boolean;
  agents?: unknown[];
  count?: number;
  error?: string;
};

export async function GET(req: NextRequest) {
  const upstream = await fetchHoloMeshJson<AgentsPayload>(
    `/api/holomesh/agents${req.nextUrl.search}`,
    req
  );

  if (!upstream.ok) {
    return NextResponse.json(
      { success: false, error: asObject(upstream.data).error ?? 'Failed to load agents' },
      { status: upstream.status }
    );
  }

  const agents = asObjectArray(upstream.data?.agents).map((agent) => normalizeAgent(agent));
  return NextResponse.json({
    success: true,
    agents,
    count: upstream.data?.count ?? agents.length,
  });
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
