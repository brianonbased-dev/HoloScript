import { NextRequest, NextResponse } from 'next/server';

type TeamMode = 'audit' | 'research' | 'build' | 'review';

interface DerivedTask {
  title: string;
  description: string;
  role: string;
  priority: number;
  source: 'auto-derive';
  mode: TeamMode;
}

const MODE_TASKS: Record<TeamMode, DerivedTask[]> = {
  audit: [
    {
      title: 'Scan codebase for TODO/FIXME markers',
      description: 'grep -r TODO/FIXME across src/ and report unresolved markers as tasks.',
      role: 'auditor',
      priority: 1,
      source: 'auto-derive',
      mode: 'audit',
    },
    {
      title: 'Audit TypeScript errors across studio',
      description:
        'Run tsc --noEmit and file issues for any NEW errors beyond the known pre-existing set.',
      role: 'auditor',
      priority: 1,
      source: 'auto-derive',
      mode: 'audit',
    },
    {
      title: 'Review dependency freshness',
      description: 'Run `pnpm outdated` and flag packages more than 2 major versions behind.',
      role: 'auditor',
      priority: 2,
      source: 'auto-derive',
      mode: 'audit',
    },
    {
      title: 'Audit API routes for missing auth checks',
      description: 'Scan all /api/holomesh routes for missing Authorization header validation.',
      role: 'auditor',
      priority: 1,
      source: 'auto-derive',
      mode: 'audit',
    },
  ],
  research: [
    {
      title: 'Query knowledge store for coverage gaps',
      description: 'POST /knowledge/query with domain gaps; identify areas with < 3 W/P/G entries.',
      role: 'researcher',
      priority: 2,
      source: 'auto-derive',
      mode: 'research',
    },
    {
      title: 'Identify unstudied cross-domain relationships',
      description: 'Run GROW phase: find W/P/G entries with no domain cross-links.',
      role: 'researcher',
      priority: 2,
      source: 'auto-derive',
      mode: 'research',
    },
    {
      title: 'Summarize latest research files',
      description:
        'Read all ai-ecosystem/research/*.md files modified in last 7 days and output key findings.',
      role: 'researcher',
      priority: 3,
      source: 'auto-derive',
      mode: 'research',
    },
  ],
  build: [
    {
      title: 'Sync board from MCP and claim highest-priority open task',
      description: 'POST /board/sync then PATCH highest P1 open task to claimed status.',
      role: 'coder',
      priority: 1,
      source: 'auto-derive',
      mode: 'build',
    },
    {
      title: 'Run pnpm build and fix any new compilation errors',
      description:
        'cd packages/studio && pnpm build 2>&1; triage and fix errors not in pre-existing list.',
      role: 'coder',
      priority: 1,
      source: 'auto-derive',
      mode: 'build',
    },
    {
      title: 'Add test coverage for recently modified files',
      description:
        'Find files touched in last 3 commits with < 50% test coverage and add vitest cases.',
      role: 'tester',
      priority: 2,
      source: 'auto-derive',
      mode: 'build',
    },
  ],
  review: [
    {
      title: 'Review uncommitted changes and commit or stash',
      description:
        'git status; for each modified file decide: commit to branch or stash for later.',
      role: 'coder',
      priority: 1,
      source: 'auto-derive',
      mode: 'review',
    },
    {
      title: 'Summarize last 5 commits and check for regressions',
      description: 'git log -5 --oneline; run tests against the diff to confirm no regressions.',
      role: 'coder',
      priority: 1,
      source: 'auto-derive',
      mode: 'review',
    },
    {
      title: 'Check done-log for tasks missing commit hashes',
      description: 'GET /board and find done tasks with no commitHash; add missing references.',
      role: 'coder',
      priority: 2,
      source: 'auto-derive',
      mode: 'review',
    },
  ],
};

const HOLOMESH_API_URL =
  process.env.HOLOMESH_API_URL ?? process.env.MCP_SERVER_URL ?? 'https://mcp.holoscript.net';
const HOLOMESH_API_KEY = process.env.HOLOMESH_API_KEY ?? process.env.HOLOMESH_KEY ?? '';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const body = (await req.json()) as { mode?: string; agentId?: string; agentName?: string };
  const mode = (body.mode ?? '').trim() as TeamMode;

  if (!['audit', 'research', 'build', 'review'].includes(mode)) {
    return NextResponse.json(
      { error: 'mode must be one of: audit, research, build, review' },
      { status: 400 }
    );
  }

  // 1. Notify MCP of mode switch (best-effort, fire-and-forget)
  if (HOLOMESH_API_KEY) {
    fetch(`${HOLOMESH_API_URL}/api/holomesh/team/${id}/mode`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${HOLOMESH_API_KEY}`,
      },
      body: JSON.stringify(body),
    }).catch(() => {});
  }

  // 2. Derive tasks for this mode
  const tasks = MODE_TASKS[mode];
  const posted: Array<{ title: string; ok: boolean }> = [];
  const boardHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
  if (HOLOMESH_API_KEY) boardHeaders['Authorization'] = `Bearer ${HOLOMESH_API_KEY}`;

  for (const task of tasks) {
    try {
      const res = await fetch(`${HOLOMESH_API_URL}/api/holomesh/team/${id}/board`, {
        method: 'POST',
        headers: boardHeaders,
        body: JSON.stringify({
          title: task.title,
          description: task.description,
          role: task.role,
          priority: task.priority,
          source: task.source,
          metadata: { derivedMode: mode },
        }),
      });
      posted.push({ title: task.title, ok: res.ok });
    } catch {
      posted.push({ title: task.title, ok: false });
    }
  }

  const successCount = posted.filter((t) => t.ok).length;

  return NextResponse.json({
    success: true,
    mode,
    derived: tasks.length,
    posted: successCount,
    tasks: posted,
  });
}
