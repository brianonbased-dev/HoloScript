export const maxDuration = 60;

/**
 * POST /api/workspace/agent-genesis
 *
 * Builds the automatic skills-first agent crew for a workspace without
 * exposing raw secrets to the browser or repository.
 */

import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { buildAgentGenesisPlan } from '@/lib/workspace/agentGenesis';
import type { AgentGenesisInput } from '@/lib/workspace/agentGenesis';

import { corsHeaders } from '../../_lib/cors';

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === 'string' && item.trim() !== '');
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function parseInput(value: unknown): AgentGenesisInput | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const workspaceId = optionalString(record['workspaceId']);
  if (!workspaceId) return null;

  return {
    workspaceId,
    repoUrl: optionalString(record['repoUrl']),
    repoName: optionalString(record['repoName']),
    intent: optionalString(record['intent']),
    techStack: stringArray(record['techStack']),
    frameworks: stringArray(record['frameworks']),
    languages: stringArray(record['languages']),
    traits: stringArray(record['traits']),
    packageCount: numberValue(record['packageCount']),
    approvedRepos: stringArray(record['approvedRepos']),
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const input = parseInput(body);
  if (!input) {
    return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 });
  }

  try {
    return NextResponse.json({ plan: buildAgentGenesisPlan(input) }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 422 });
  }
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
