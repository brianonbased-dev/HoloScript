/**
 * GET  /api/pipeline — List pipeline runs.
 * POST /api/pipeline — Start a new pipeline run.
 *
 * Body: { mode: 'single' | 'continuous' | 'self-target', targetProject: string }
 *
 * Local Testing:
 *   Set DISABLE_AUTH=true in .env.local to bypass authentication
 *   OR pass ?no-auth=true query parameter
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { detectLLMProviderName } from '@/lib/recursive/llmProvider';

// Pipeline state is managed client-side in pipelineStore.
// These routes provide a server-side coordination point for multi-tab scenarios
// and eventual SSE/WebSocket integration.

// Auth bypass for local testing (NEVER enable in production)
const isAuthDisabled = (): boolean => {
  return process.env.DISABLE_AUTH === 'true' || process.env.NODE_ENV === 'test';
};

interface StartPipelineRequest {
  mode: 'single' | 'continuous' | 'self-target';
  targetProject: string;
}

// In-memory run registry (single-server; swap for Redis in production)
const activeRuns = new Map<string, {
  id: string;
  mode: string;
  targetProject: string;
  status: 'running' | 'completed' | 'failed' | 'paused';
  startedAt: string;
  completedAt: string | null;
}>();

function generateId(): string {
  return `pipe-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function GET(req: NextRequest) {
  // Check auth bypass
  const noAuth = req.nextUrl.searchParams.get('no-auth') === 'true' || isAuthDisabled();

  if (!noAuth) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
  }

  const runs = Array.from(activeRuns.values())
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

  return NextResponse.json({ runs, total: runs.length });
}

export async function POST(req: NextRequest) {
  // Check auth bypass
  const noAuth = req.nextUrl.searchParams.get('no-auth') === 'true' || isAuthDisabled();

  if (!noAuth) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
  }

  let body: StartPipelineRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { mode, targetProject } = body;

  if (!mode || !['single', 'continuous', 'self-target'].includes(mode)) {
    return NextResponse.json(
      { error: 'mode must be "single", "continuous", or "self-target"' },
      { status: 400 },
    );
  }

  if (!targetProject || typeof targetProject !== 'string') {
    return NextResponse.json(
      { error: 'targetProject is required' },
      { status: 400 },
    );
  }

  // Check for existing active pipeline
  const active = Array.from(activeRuns.values()).find((r) => r.status === 'running');
  if (active) {
    return NextResponse.json(
      { error: 'A pipeline is already running', activeId: active.id },
      { status: 409 },
    );
  }

  const id = generateId();
  const run = {
    id,
    mode,
    targetProject,
    status: 'running' as const,
    startedAt: new Date().toISOString(),
    completedAt: null,
  };

  activeRuns.set(id, run);

  // Cap registry size
  if (activeRuns.size > 100) {
    const oldest = Array.from(activeRuns.entries())
      .sort(([, a], [, b]) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());
    for (let i = 0; i < oldest.length - 100; i++) {
      activeRuns.delete(oldest[i][0]);
    }
  }

  return NextResponse.json({
    id,
    mode,
    targetProject,
    status: 'running',
    startedAt: run.startedAt,
    llmProvider: detectLLMProviderName(),
    hint: `GET /api/pipeline/${id} for status. POST /api/pipeline/${id} to control.`,
  });
}
