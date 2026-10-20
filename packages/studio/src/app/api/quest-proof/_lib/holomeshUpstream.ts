import { NextResponse } from 'next/server';

/**
 * Founder Console readers (inbox, next-actions, board, decide) proxy the team API
 * with Studio's HOLOMESH_API_KEY. Callers must pass requireFounder FIRST; only then
 * is the key read. With no key or team configured the route answers 503 and makes
 * no upstream call (it never calls the team API unauthenticated).
 */
export interface HolomeshUpstream {
  base: string;
  teamId: string;
  headers: Record<string, string>;
}

export function holomeshUpstream(empty: Record<string, unknown> = {}): HolomeshUpstream | NextResponse {
  const base =
    process.env.HOLOMESH_API_URL ?? process.env.MCP_SERVER_URL ?? 'https://mcp.holoscript.net';
  const key = process.env.HOLOMESH_API_KEY ?? process.env.HOLOMESH_KEY ?? '';
  const teamId = process.env.HOLOMESH_TEAM_ID ?? '';
  if (!teamId || !key) {
    return NextResponse.json(
      { ok: false, ...empty, error: 'Founder Console upstream not configured' },
      { status: 503 }
    );
  }
  return {
    base,
    teamId,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, 'x-mcp-api-key': key },
  };
}
