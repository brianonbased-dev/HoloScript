export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { fetchHoloMeshJson } from '../../../../lib/holomesh-proxy';
import {
  asObject,
  asObjectArray,
  normalizeKnowledgeEntry,
} from '../../../../lib/holomesh-normalize';

import { corsHeaders } from '../../_lib/cors';

type SearchPayload = {
  success?: boolean;
  query?: string;
  results?: unknown[];
  count?: number;
  types?: Record<string, number>;
  error?: string;
};

export async function GET(req: NextRequest) {
  const upstream = await fetchHoloMeshJson<SearchPayload>(
    `/api/holomesh/search${req.nextUrl.search}`,
    req
  );

  if (!upstream.ok) {
    return NextResponse.json(
      { success: false, error: asObject(upstream.data).error ?? 'Failed to search HoloMesh' },
      { status: upstream.status }
    );
  }

  const results = asObjectArray(upstream.data?.results).map((entry) =>
    normalizeKnowledgeEntry(entry)
  );
  return NextResponse.json({
    success: true,
    query: upstream.data?.query ?? req.nextUrl.searchParams.get('q') ?? '',
    results,
    count: upstream.data?.count ?? results.length,
    types: upstream.data?.types,
  });
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
