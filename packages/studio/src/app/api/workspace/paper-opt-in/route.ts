export const maxDuration = 60;

/**
 * POST /api/workspace/paper-opt-in
 *
 * Body: {
 *   workspaceId: string,
 *   localPath: string,
 *   teamId?: string,
 *   createBoardTasks?: boolean,
 *   syncPublicKnowledge?: boolean,
 *   preparePublication?: boolean
 * }
 *
 * When a workspace scores high on publish-worthiness, the user can opt-in to the
 * paper-program research lane. This endpoint:
 *   1. Creates a research/ directory in the workspace with paper-cell, D.011 checklist,
 *      and evidence references.
 *   2. Creates a workspace-local memory entry.
 *   3. Optionally creates scoped board tasks on the given HoloMesh team.
 *   4. Publishes public knowledge only when explicit public-knowledge consent is present.
 *   5. Returns the updated paper-unlock state.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

import { corsHeaders } from '../../_lib/cors';

const HOLOMESH_API_URL =
  process.env.HOLOMESH_API_URL ?? process.env.MCP_SERVER_URL ?? 'https://mcp.holoscript.net';
const HOLOMESH_API_KEY = process.env.HOLOMESH_API_KEY ?? process.env.HOLOMESH_KEY ?? '';

function getWorkspacesDir(): string {
  return (
    process.env.HOLOSCRIPT_WORKSPACES_DIR ?? path.join(os.homedir(), '.holoscript', 'workspaces')
  );
}

function isInsidePath(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function holomeshHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (HOLOMESH_API_KEY) headers.Authorization = `Bearer ${HOLOMESH_API_KEY}`;
  return headers;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function readExistingPaperUnlockState(statePath: string): {
  boardTaskIds: string[];
  knowledgeEntryIds: string[];
  workspaceMemoryEntryIds: string[];
} {
  try {
    if (!fs.existsSync(statePath)) {
      return { boardTaskIds: [], knowledgeEntryIds: [], workspaceMemoryEntryIds: [] };
    }
    const parsed = JSON.parse(fs.readFileSync(statePath, 'utf-8')) as Record<string, unknown>;
    return {
      boardTaskIds: stringArray(parsed.boardTaskIds),
      knowledgeEntryIds: stringArray(parsed.knowledgeEntryIds),
      workspaceMemoryEntryIds: stringArray(parsed.workspaceMemoryEntryIds),
    };
  } catch {
    return { boardTaskIds: [], knowledgeEntryIds: [], workspaceMemoryEntryIds: [] };
  }
}

async function createBoardTasks(
  teamId: string,
  workspaceName: string
): Promise<{ taskIds: string[] }> {
  const tasks = [
    {
      title: `[paper] ${workspaceName} - D.011 G1 hardware/env capture plan`,
      description: 'Sketch the hardware/environment capture plan for the paper.',
      priority: 3,
    },
    {
      title: `[paper] ${workspaceName} - D.011 G2 N=12 study or waiver`,
      description: 'Design the user study or document the waiver justification.',
      priority: 3,
    },
    {
      title: `[paper] ${workspaceName} - D.011 G3 full-loop demo`,
      description: 'Build and record the full-loop demonstration.',
      priority: 3,
    },
    {
      title: `[paper] ${workspaceName} - D.011 G4 ablation plan`,
      description: 'Define the ablation study and baseline comparisons.',
      priority: 3,
    },
  ];

  const taskIds: string[] = [];
  for (const task of tasks) {
    try {
      const res = await fetch(`${HOLOMESH_API_URL}/api/holomesh/team/${teamId}/board`, {
        method: 'POST',
        headers: holomeshHeaders(),
        body: JSON.stringify({ tasks: [task] }),
      });
      if (res.ok) {
        const data = (await res.json()) as { tasks?: Array<{ id: string }> };
        const id = data.tasks?.[0]?.id;
        if (id) taskIds.push(id);
      }
    } catch {
      // Best-effort: don't block opt-in if board API fails
    }
  }
  return { taskIds };
}

async function createKnowledgeEntries(
  teamId: string,
  workspaceName: string
): Promise<{ entryIds: string[] }> {
  const entries = [
    {
      type: 'pattern',
      content: `Research packet for ${workspaceName} opened. D.011 checklist created. Evidence paths are tracked in workspace research/ directory.`,
      domain: 'research',
      tags: ['paper-program', 'd011', 'research-lane'],
      confidence: 0.85,
    },
    {
      type: 'wisdom',
      content: `Opt-in research lane pattern: only surface paper-program UI after explicit user consent. Prevents premature exposure of unfinished research claims.`,
      domain: 'research',
      tags: ['paper-program', 'ux', 'consent'],
      confidence: 0.9,
    },
  ];

  const entryIds: string[] = [];
  for (const entry of entries) {
    try {
      const res = await fetch(`${HOLOMESH_API_URL}/api/holomesh/team/${teamId}/knowledge`, {
        method: 'POST',
        headers: holomeshHeaders(),
        body: JSON.stringify({ entries: [entry] }),
      });
      if (res.ok) {
        const data = (await res.json()) as { entries?: Array<{ id: string }> };
        const id = data.entries?.[0]?.id;
        if (id) entryIds.push(id);
      }
    } catch {
      // Best-effort
    }
  }
  return { entryIds };
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body: {
    workspaceId?: string;
    localPath?: string;
    teamId?: string;
    createBoardTasks?: boolean;
    syncPublicKnowledge?: boolean;
    preparePublication?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const workspaceId = body.workspaceId;
  const localPath = body.localPath;
  const teamId = body.teamId;
  const createBoardTasksConsent = body.createBoardTasks === true;
  const publicKnowledgeConsent = body.syncPublicKnowledge === true;
  const publicationPrepConsent = body.preparePublication === true;

  if (!workspaceId || typeof workspaceId !== 'string') {
    return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 });
  }
  if (!localPath || typeof localPath !== 'string') {
    return NextResponse.json({ error: 'localPath is required' }, { status: 400 });
  }
  if (createBoardTasksConsent && (!teamId || typeof teamId !== 'string')) {
    return NextResponse.json(
      { error: 'teamId is required when createBoardTasks is true' },
      { status: 400 }
    );
  }
  if (publicKnowledgeConsent && (!teamId || typeof teamId !== 'string')) {
    return NextResponse.json(
      { error: 'teamId is required when syncPublicKnowledge is true' },
      { status: 400 }
    );
  }

  const workspacesDir = path.resolve(getWorkspacesDir());
  const resolvedLocalPath = path.resolve(localPath);
  if (!isInsidePath(workspacesDir, resolvedLocalPath)) {
    return NextResponse.json({ error: 'localPath is outside workspace root' }, { status: 403 });
  }

  if (!fs.existsSync(resolvedLocalPath)) {
    return NextResponse.json({ error: 'Workspace path does not exist' }, { status: 404 });
  }

  const researchDir = path.join(resolvedLocalPath, 'research');
  const memoryDir = path.join(resolvedLocalPath, 'memory');
  try {
    fs.mkdirSync(researchDir, { recursive: true });
    fs.mkdirSync(memoryDir, { recursive: true });
  } catch (err) {
    return NextResponse.json(
      {
        error: `Failed to create research directories: ${
          err instanceof Error ? err.message : String(err)
        }`,
      },
      { status: 500 }
    );
  }

  const now = new Date().toISOString();
  const workspaceName = path.basename(resolvedLocalPath);
  const statePath = path.join(researchDir, 'paper-unlock-state.json');
  const existingState = readExistingPaperUnlockState(statePath);

  // 1. Paper cell
  const paperCell = {
    schemaVersion: '0.1.0',
    workspaceId,
    createdAt: now,
    status: 'draft',
    title: `Research packet - ${workspaceName}`,
    problemStatement: '',
    contributions: [],
    relatedWork: [],
    methodology: '',
    evaluationPlan: '',
    limitations: '',
    nextMilestone: 'Complete D.011 checklist',
  };

  // 2. D.011 checklist
  const d011Checklist = {
    schemaVersion: '0.1.0',
    workspaceId,
    createdAt: now,
    gates: [
      { id: 'G1', name: 'hardware/env capture', status: 'pending', evidencePath: '' },
      { id: 'G2', name: 'N=12 study or waiver', status: 'pending', evidencePath: '' },
      { id: 'G3', name: 'full-loop demo', status: 'pending', evidencePath: '' },
      { id: 'G4', name: 'ablation', status: 'pending', evidencePath: '' },
    ],
    benchmarkHarness: { status: 'pending', evidencePath: '' },
    artifacts: [],
  };

  // 3. Evidence references
  const evidenceRefs = {
    schemaVersion: '0.1.0',
    workspaceId,
    createdAt: now,
    sources: [],
    claims: [],
    benchmarkPaths: [],
    demoPaths: [],
    studyPaths: [],
    ablationPaths: [],
    hardwarePaths: [],
  };

  // 4. Workspace-local memory entry. This is not public knowledge; it lives only
  // in the imported workspace until the user separately consents to sync.
  const workspaceMemoryEntry = {
    schemaVersion: '0.1.0',
    id: `paper-research-opt-in-${workspaceId}`,
    type: 'paper-research-opt-in',
    workspaceId,
    createdAt: now,
    privacy: 'workspace-local',
    summary: `Paper research packet opened for ${workspaceName}.`,
    consent: {
      paperResearchPacket: true,
      boardTasks: createBoardTasksConsent,
      publicKnowledge: publicKnowledgeConsent,
      publicationPrep: publicationPrepConsent,
    },
    refs: {
      paperCell: 'research/paper-cell.json',
      d011Checklist: 'research/d011-checklist.json',
      evidenceRefs: 'research/evidence-refs.json',
    },
  };

  try {
    fs.writeFileSync(
      path.join(researchDir, 'paper-cell.json'),
      `${JSON.stringify(paperCell, null, 2)}\n`
    );
    fs.writeFileSync(
      path.join(researchDir, 'd011-checklist.json'),
      `${JSON.stringify(d011Checklist, null, 2)}\n`
    );
    fs.writeFileSync(
      path.join(researchDir, 'evidence-refs.json'),
      `${JSON.stringify(evidenceRefs, null, 2)}\n`
    );
    fs.writeFileSync(
      path.join(memoryDir, 'research-packet.json'),
      `${JSON.stringify(workspaceMemoryEntry, null, 2)}\n`
    );
  } catch (err) {
    return NextResponse.json(
      {
        error: `Failed to write research artifacts: ${
          err instanceof Error ? err.message : String(err)
        }`,
      },
      { status: 500 }
    );
  }

  // 5. Optional HoloMesh board tasks + explicit public knowledge sync.
  let boardTaskIds: string[] = existingState.boardTaskIds;
  let knowledgeEntryIds: string[] = existingState.knowledgeEntryIds;
  if (
    teamId &&
    typeof teamId === 'string' &&
    createBoardTasksConsent &&
    boardTaskIds.length === 0
  ) {
    const boardResult = await createBoardTasks(teamId, workspaceName);
    boardTaskIds = boardResult.taskIds;
  }

  if (
    teamId &&
    typeof teamId === 'string' &&
    publicKnowledgeConsent &&
    knowledgeEntryIds.length === 0
  ) {
    const knowledgeResult = await createKnowledgeEntries(teamId, workspaceName);
    knowledgeEntryIds = knowledgeResult.entryIds;
  }

  const paperUnlockState = {
    status: 'opted-in' as const,
    optInAt: now,
    researchDir: 'research',
    artifactsCreated: [
      'research/paper-cell.json',
      'research/d011-checklist.json',
      'research/evidence-refs.json',
      'memory/research-packet.json',
    ],
    boardTaskIds,
    knowledgeEntryIds,
    workspaceMemoryEntryIds: existingState.workspaceMemoryEntryIds.length
      ? existingState.workspaceMemoryEntryIds
      : [workspaceMemoryEntry.id],
    workspaceMemoryPath: 'memory/research-packet.json',
    publicKnowledgeConsent,
    publicationPrepConsent,
  };

  try {
    fs.writeFileSync(statePath, `${JSON.stringify(paperUnlockState, null, 2)}\n`);
  } catch (err) {
    return NextResponse.json(
      {
        error: `Failed to write paper unlock state: ${
          err instanceof Error ? err.message : String(err)
        }`,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    paperUnlockState,
  });
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
