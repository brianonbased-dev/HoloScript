export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { TEAM_MODES, type TeamMode } from '@holoscript/framework';

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
  security: [
    {
      title: 'Review /api/holomesh routes for auth guards',
      description:
        'Scan packages/mcp-server and Studio proxy routes; list handlers missing Authorization or team membership checks.',
      role: 'reviewer',
      priority: 1,
      source: 'auto-derive',
      mode: 'security',
    },
    {
      title: 'Secrets and env hygiene pass',
      description:
        'Grep for API keys, tokens, private keys in source; confirm .env.example and pre-commit cover tracked files.',
      role: 'reviewer',
      priority: 1,
      source: 'auto-derive',
      mode: 'security',
    },
    {
      title: 'Dependency audit triage',
      description: 'Run pnpm audit (or npm audit) at repo root; file tasks for high/critical with minimal upgrade path.',
      role: 'coder',
      priority: 2,
      source: 'auto-derive',
      mode: 'security',
    },
    {
      title: 'Sandbox and execution boundary checklist',
      description:
        'Verify vm/createContext or documented sandbox for user code paths; note gaps in team knowledge.',
      role: 'tester',
      priority: 2,
      source: 'auto-derive',
      mode: 'security',
    },
  ],
  stabilize: [
    {
      title: 'Capture current failing tests or CI signal',
      description:
        'Run pnpm vitest for the package you are stabilizing; paste failing file names and error snippets into the task.',
      role: 'tester',
      priority: 1,
      source: 'auto-derive',
      mode: 'stabilize',
    },
    {
      title: 'Flaky test identification',
      description:
        'From CI or local reruns, list tests that pass/fail intermittently; open one task per flake root cause.',
      role: 'tester',
      priority: 1,
      source: 'auto-derive',
      mode: 'stabilize',
    },
    {
      title: 'Fix one failing suite with minimal diff',
      description:
        'Pick the smallest failing area; fix root cause; sectioned commit; no unrelated refactors.',
      role: 'coder',
      priority: 1,
      source: 'auto-derive',
      mode: 'stabilize',
    },
    {
      title: 'Preflight gate',
      description:
        'Run node scripts/preflight.mjs or package preflight where applicable; resolve or file blockers.',
      role: 'tester',
      priority: 2,
      source: 'auto-derive',
      mode: 'stabilize',
    },
  ],
  docs: [
    {
      title: 'NUMBERS.md compliance sweep',
      description:
        'Scan docs/ and README for hardcoded trait or tool counts; replace with pointers to docs/NUMBERS.md or curl /health.',
      role: 'researcher',
      priority: 1,
      source: 'auto-derive',
      mode: 'docs',
    },
    {
      title: 'Public API and MCP doc parity',
      description:
        'If MCP tools or CLI changed recently, update holomesh-skill.md / AGENTS.md per NORTH_STAR DT-8.',
      role: 'researcher',
      priority: 1,
      source: 'auto-derive',
      mode: 'docs',
    },
    {
      title: 'Archive banner verification',
      description:
        'For any docs/archive file cited in search results, confirm top banner points to NUMBERS.md for metrics.',
      role: 'reviewer',
      priority: 2,
      source: 'auto-derive',
      mode: 'docs',
    },
    {
      title: 'Getting-started smoke read',
      description:
        'Walk through docs/academy or quickstart; note broken links or version pins; file follow-up tasks.',
      role: 'reviewer',
      priority: 2,
      source: 'auto-derive',
      mode: 'docs',
    },
  ],
  planning: [
    {
      title: 'Roadmap vs board alignment',
      description:
        'Compare docs/strategy or ROADMAP.md milestones to open board tasks; list gaps as new tasks with priority.',
      role: 'researcher',
      priority: 1,
      source: 'auto-derive',
      mode: 'planning',
    },
    {
      title: 'Milestone plan: Remains and Excludes',
      description:
        'For the active milestone, write What Remains and Excludes (F.007); post summary to team knowledge.',
      role: 'researcher',
      priority: 1,
      source: 'auto-derive',
      mode: 'planning',
    },
    {
      title: 'RFC / decision gate checklist',
      description:
        'List open RFCs or strategy docs; mark decision gates and owners; convert blockers into board tasks.',
      role: 'reviewer',
      priority: 2,
      source: 'auto-derive',
      mode: 'planning',
    },
    {
      title: 'Cross-link research to implementation',
      description:
        'For recent research/*.md outputs, ensure at least one board task or suggestion references execution path.',
      role: 'researcher',
      priority: 2,
      source: 'auto-derive',
      mode: 'planning',
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

  if (!(TEAM_MODES as readonly string[]).includes(mode)) {
    return NextResponse.json(
      { error: `mode must be one of: ${TEAM_MODES.join(', ')}` },
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
          tasks: [
            {
              title: task.title,
              description: task.description,
              role: task.role,
              priority: task.priority,
              source: task.source,
              metadata: { derivedMode: mode },
            },
          ],
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


export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-mcp-api-key',
    },
  });
}
