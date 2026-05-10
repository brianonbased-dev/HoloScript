export const maxDuration = 300;

import * as os from 'os';
import * as path from 'path';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth';
import { ABSORB_API_KEY, ABSORB_BASE } from '@/lib/services/absorb-client';
import {
  buildFounderWorkspaceBackfill,
  persistFounderWorkspaceBackfill,
  type FounderLinkedRepo,
  type FounderWorkspaceBackfillResult,
} from '@/lib/workspace/founderWorkspaceBackfill';

import { corsHeaders } from '../../../_lib/cors';

interface FounderBackfillRequest {
  rootPath?: string;
  workspaceId?: string;
  teamId?: string;
  manifestPath?: string;
  persist?: boolean;
  dryRun?: boolean;
  syncKnowledge?: boolean;
  registerAbsorb?: boolean;
  maxKnowledgeEntries?: number;
  maxResearchItems?: number;
}

interface ActionResult {
  requested: boolean;
  success: boolean;
  status: 'skipped' | 'synced' | 'registered' | 'failed';
  count: number;
  details?: unknown;
  errors?: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function optionalPositiveInteger(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) return undefined;
  return value;
}

function parseBody(value: unknown): FounderBackfillRequest {
  if (!isRecord(value)) return {};
  return {
    rootPath: optionalString(value['rootPath']),
    workspaceId: optionalString(value['workspaceId']),
    teamId: optionalString(value['teamId']),
    manifestPath: optionalString(value['manifestPath']),
    persist: optionalBoolean(value['persist']),
    dryRun: optionalBoolean(value['dryRun']),
    syncKnowledge: optionalBoolean(value['syncKnowledge']),
    registerAbsorb: optionalBoolean(value['registerAbsorb']),
    maxKnowledgeEntries: optionalPositiveInteger(value['maxKnowledgeEntries']),
    maxResearchItems: optionalPositiveInteger(value['maxResearchItems']),
  };
}

function defaultFounderRoot(): string {
  return process.env.AI_ECOSYSTEM_ROOT ?? path.join(os.homedir(), '.ai-ecosystem');
}

function getWorkspacesDir(): string {
  return (
    process.env.HOLOSCRIPT_WORKSPACES_DIR ?? path.join(os.homedir(), '.holoscript', 'workspaces')
  );
}

function getOrchestratorBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_MCP_ORCHESTRATOR_URL ??
    'https://mcp-orchestrator-production-45f9.up.railway.app'
  );
}

function getOrchestratorApiKey(): string {
  return process.env.HOLOSCRIPT_API_KEY ?? process.env.NEXT_PUBLIC_MCP_API_KEY ?? '';
}

async function readResponsePayload(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return response.json().catch(() => ({ error: 'Invalid JSON response' }));
  }
  return response.text().catch(() => '');
}

async function syncKnowledgePayload(
  backfill: FounderWorkspaceBackfillResult,
  requested: boolean
): Promise<ActionResult> {
  if (!requested) {
    return {
      requested: false,
      success: true,
      status: 'skipped',
      count: backfill.knowledgeSyncPayload.entries.length,
    };
  }

  if (backfill.knowledgeSyncPayload.entries.length === 0) {
    return { requested: true, success: true, status: 'synced', count: 0 };
  }

  const apiKey = getOrchestratorApiKey();
  if (!apiKey) {
    return {
      requested: true,
      success: false,
      status: 'failed',
      count: 0,
      errors: ['Missing HOLOSCRIPT_API_KEY or NEXT_PUBLIC_MCP_API_KEY'],
    };
  }

  try {
    const response = await fetch(`${getOrchestratorBaseUrl()}/knowledge/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-mcp-api-key': apiKey,
      },
      body: JSON.stringify(backfill.knowledgeSyncPayload),
      signal: AbortSignal.timeout(30_000),
    });
    const details = await readResponsePayload(response);
    return {
      requested: true,
      success: response.ok,
      status: response.ok ? 'synced' : 'failed',
      count: response.ok ? backfill.knowledgeSyncPayload.entries.length : 0,
      details,
      ...(response.ok ? {} : { errors: [`Orchestrator returned HTTP ${response.status}`] }),
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      requested: true,
      success: false,
      status: 'failed',
      count: 0,
      errors: [message],
    };
  }
}

async function registerAbsorbRepos(
  repos: FounderLinkedRepo[],
  requested: boolean
): Promise<ActionResult> {
  if (!requested) {
    return { requested: false, success: true, status: 'skipped', count: repos.length };
  }

  if (repos.length === 0) {
    return { requested: true, success: true, status: 'registered', count: 0 };
  }

  const errors: string[] = [];
  const details: unknown[] = [];
  let registered = 0;

  for (const repo of repos) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (ABSORB_API_KEY) headers['Authorization'] = `Bearer ${ABSORB_API_KEY}`;

    try {
      const response = await fetch(`${ABSORB_BASE}/api/projects`, {
        method: 'POST',
        headers,
        body: JSON.stringify(repo.absorbProject),
        signal: AbortSignal.timeout(15_000),
      });
      const payload = await readResponsePayload(response);
      details.push({ repo: repo.cloneUrl, status: response.status, payload });
      if (response.ok) {
        registered += 1;
      } else {
        errors.push(`${repo.cloneUrl}: HTTP ${response.status}`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${repo.cloneUrl}: ${message}`);
    }
  }

  return {
    requested: true,
    success: errors.length === 0,
    status: errors.length === 0 ? 'registered' : 'failed',
    count: registered,
    details,
    ...(errors.length > 0 ? { errors } : {}),
  };
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  let body: FounderBackfillRequest;
  try {
    body = parseBody(await request.json());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const workspaceId = body.workspaceId ?? 'ai-ecosystem';
  const dryRun = body.dryRun === true;

  try {
    const backfill = await buildFounderWorkspaceBackfill({
      rootPath: body.rootPath ?? defaultFounderRoot(),
      workspaceId,
      teamId: body.teamId,
      manifestPath: body.manifestPath,
      maxKnowledgeEntries: body.maxKnowledgeEntries,
      maxResearchItems: body.maxResearchItems,
    });

    const workspaceDir = path.join(getWorkspacesDir(), workspaceId);
    const persistedPath =
      !dryRun && body.persist !== false
        ? persistFounderWorkspaceBackfill({ workspaceDir, backfill })
        : null;

    const knowledgeSync = await syncKnowledgePayload(
      backfill,
      !dryRun && body.syncKnowledge !== false
    );
    const absorbRegistration = await registerAbsorbRepos(
      backfill.linkedRepos,
      !dryRun && body.registerAbsorb !== false
    );

    return NextResponse.json({
      success: knowledgeSync.success && absorbRegistration.success,
      dryRun,
      persistedPath,
      backfill,
      knowledgeSync,
      absorbRegistration,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: 'Founder workspace backfill failed', details: message },
      { status: 500 }
    );
  }
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'POST, OPTIONS' }),
  });
}
