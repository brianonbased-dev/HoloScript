export const maxDuration = 300;

/**
 * GET /api/absorb/projects   -- List projects
 * POST /api/absorb/projects  -- Create project
 *
 * Gap 6: Studio API split -- standalone project management route.
 * Proxies to absorb service with proper auth and keeps a durable local
 * project index for imported workspaces when the service is unavailable.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ABSORB_BASE, ABSORB_API_KEY } from '@/lib/services/absorb-client';
import {
  type DurableAbsorbProject,
  listDurableAbsorbProjects,
  upsertDurableAbsorbProject,
} from '@/lib/absorb/projectState';

import { corsHeaders } from '../../_lib/cors';

async function proxyToAbsorb(
  path: string,
  method: string,
  body?: string,
  userAuth?: string | null
): Promise<{ ok: boolean; status: number; data: unknown }> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ABSORB_API_KEY}`,
    };
    if (userAuth) {
      headers['X-User-Authorization'] = userAuth;
    }

    const res = await fetch(`${ABSORB_BASE}${path}`, {
      method,
      headers,
      body: body || undefined,
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json().catch(() => ({ error: 'Invalid response' }));
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 502, data: null };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function projectArrayFromPayload(data: unknown): Record<string, unknown>[] {
  if (!isRecord(data) || !Array.isArray(data.projects)) return [];
  return data.projects.filter(isRecord);
}

function projectId(project: Record<string, unknown>): string | null {
  return typeof project.id === 'string' ? project.id : null;
}

function mergeProjectPayload(
  upstreamData: unknown,
  durableProjects: DurableAbsorbProject[]
): Record<string, unknown> {
  const base = isRecord(upstreamData) ? upstreamData : {};
  const merged = new Map<string, Record<string, unknown>>();
  for (const project of projectArrayFromPayload(upstreamData)) {
    const id = projectId(project);
    if (id) merged.set(id, project);
  }
  for (const project of durableProjects) {
    const upstream = merged.get(project.id);
    merged.set(project.id, {
      ...(upstream ?? {}),
      ...project,
      metadata: {
        ...(isRecord(upstream?.metadata) ? upstream.metadata : {}),
        ...project.metadata,
      },
      durable: true,
    });
  }
  const projects = Array.from(merged.values());
  return {
    ...base,
    projects,
    count: projects.length,
    durableCount: durableProjects.length,
  };
}

function textField(record: Record<string, unknown>, camel: string, snake: string): string | null {
  const value = record[camel] ?? record[snake];
  return typeof value === 'string' && value.trim() ? value : null;
}

export async function GET(req: NextRequest) {
  const userAuth = req.headers.get('authorization');
  const durableProjects = listDurableAbsorbProjects();

  // Try absorb service
  const result = await proxyToAbsorb('/api/projects', 'GET', undefined, userAuth);
  if (result.ok) {
    return NextResponse.json(mergeProjectPayload(result.data, durableProjects));
  }

  // Explicit durable fallback: not an upstream response.
  return NextResponse.json({
    projects: durableProjects,
    count: durableProjects.length,
    durableCount: durableProjects.length,
    durable: true,
    standalone: true,
    upstream: {
      ok: false,
      status: result.status,
    },
  });
}

export async function POST(req: NextRequest) {
  const userAuth = req.headers.get('authorization');
  const body = await req.text();

  // Try absorb service
  const result = await proxyToAbsorb('/api/projects', 'POST', body, userAuth);
  if (result.ok) {
    if (isRecord(result.data) && isRecord(result.data.project)) {
      const project = result.data.project;
      const id = textField(project, 'id', 'id');
      const name = textField(project, 'name', 'name');
      if (id && name) {
        upsertDurableAbsorbProject({
          id,
          name,
          sourceType: textField(project, 'sourceType', 'source_type') ?? 'github',
          sourceUrl: textField(project, 'sourceUrl', 'source_url'),
          localPath: textField(project, 'localPath', 'local_path'),
          status: textField(project, 'status', 'status') ?? 'pending',
          metadata: {
            upstreamSynced: true,
          },
        });
      }
    }
    return NextResponse.json(result.data, { status: 201 });
  }

  // Durable local create fallback.
  try {
    const parsed = JSON.parse(body) as unknown;
    if (!isRecord(parsed)) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    const project = upsertDurableAbsorbProject({
      name: textField(parsed, 'name', 'name') ?? 'Untitled',
      sourceType: textField(parsed, 'sourceType', 'source_type') ?? 'github',
      sourceUrl: textField(parsed, 'sourceUrl', 'source_url'),
      localPath: textField(parsed, 'localPath', 'local_path'),
      status: 'pending',
      metadata: {
        upstreamFallback: true,
        upstreamStatus: result.status,
      },
    });
    return NextResponse.json(
      {
        project,
        durable: true,
        standalone: true,
        upstream: {
          ok: false,
          status: result.status,
        },
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
