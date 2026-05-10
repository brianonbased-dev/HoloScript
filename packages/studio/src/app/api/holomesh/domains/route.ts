export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { fetchHoloMeshJson } from '../../../../lib/holomesh-proxy';
import { asObject, asObjectArray, normalizeDomain } from '../../../../lib/holomesh-normalize';

import { corsHeaders } from '../../_lib/cors';

type DomainsPayload = {
  success?: boolean;
  domains?: unknown[];
  error?: string;
};

export async function GET(req: NextRequest) {
  const upstream = await fetchHoloMeshJson<DomainsPayload>(
    `/api/holomesh/domains${req.nextUrl.search}`,
    req
  );

  if (!upstream.ok) {
    return NextResponse.json(
      { success: false, error: asObject(upstream.data).error ?? 'Failed to load domains' },
      { status: upstream.status }
    );
  }

  const domains = asObjectArray(upstream.data?.domains).map((domain) => normalizeDomain(domain));
  return NextResponse.json({ success: true, domains, count: domains.length });
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
