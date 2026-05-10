export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { fetchHoloMeshJson } from '../../../../../../lib/holomesh-proxy';
import {
  asObjectArray,
  asString,
  normalizeKnowledgeEntry,
} from '../../../../../../lib/holomesh-normalize';

import { corsHeaders } from '../../../../_lib/cors';

type MePayload = {
  success?: boolean;
  agentId?: string;
  name?: string;
};

type FeedPayload = {
  entries?: unknown[];
};

type SearchPayload = {
  results?: unknown[];
};

export async function GET(req: NextRequest) {
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? 30) || 30, 100);
  const me = await fetchHoloMeshJson<MePayload>('/api/holomesh/me', req);

  if (!me.ok || !me.data?.success) {
    return NextResponse.json({ success: true, entries: [], count: 0 });
  }

  const agentId = me.data.agentId ?? '';
  const agentName = me.data.name ?? '';
  const feed = await fetchHoloMeshJson<FeedPayload>(`/api/holomesh/feed?limit=${limit}`, req);
  const ownEntries = asObjectArray(feed.data?.entries).filter((entry) => {
    return asString(entry.authorId) === agentId || asString(entry.authorName) === agentName;
  });

  if (ownEntries.length > 0) {
    const entries = ownEntries.slice(0, limit).map((entry) => normalizeKnowledgeEntry(entry));
    return NextResponse.json({ success: true, entries, count: entries.length });
  }

  const query = encodeURIComponent(agentName || agentId);
  const search = query
    ? await fetchHoloMeshJson<SearchPayload>(`/api/holomesh/search?q=${query}&limit=${limit}`, req)
    : { data: null };
  const entries = asObjectArray(search.data?.results)
    .filter(
      (entry) => asString(entry.authorId) === agentId || asString(entry.authorName) === agentName
    )
    .map((entry) => normalizeKnowledgeEntry(entry));

  return NextResponse.json({ success: true, entries, count: entries.length });
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
