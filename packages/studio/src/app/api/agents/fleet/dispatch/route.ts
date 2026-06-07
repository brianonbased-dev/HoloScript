export const maxDuration = 120;

import { NextRequest, NextResponse } from 'next/server';
import { ENDPOINTS, getHolomeshKey } from '@holoscript/config';
import {
  planFleetDispatch,
  SpendGovernor,
  DEFAULT_DAILY_SPEND_CAP_USD,
  type BoardTask,
  type FleetAgent,
  type FleetDispatchPlan,
} from '@/lib/brittney/FleetOrchestrator';

/**
 * POST /api/agents/fleet/dispatch
 *
 * The EXECUTE link in the autonomy chain:
 *   schedule → file board task → claim → **EXECUTE** → close
 *
 * Body: { teamId?: string, maxDispatches?: number, dryRun?: boolean }
 *
 * Flow:
 *   1. Fetch live board tasks + fleet agents from HoloMesh.
 *   2. Run FleetOrchestrator.planFleetDispatch (priority + capability + spend-gate).
 *   3. dryRun=true → return the plan only (no mutations).
 *   4. dryRun=false → for each decision: claim the task via PATCH, emit [fleet-metric],
 *      record estimated spend. Actual LLM execution per agent is Phase 2 (requires
 *      execution sandboxing — see research/2026-06-07_brittney-fleet-orchestrator-wiring.md §5).
 */

const HOLOMESH_BASE = ENDPOINTS.HOLOSCRIPT_MCP;
const HOLOMESH_KEY = getHolomeshKey() || '';

const DEFAULT_TEAM_ID = process.env['HOLOMESH_TEAM_ID'] ?? 'team_1777834718247_unr35n';

function holomeshHeaders(clientAuth?: string | null): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (clientAuth) {
    h['Authorization'] = clientAuth;
  } else if (HOLOMESH_KEY) {
    h['Authorization'] = `Bearer ${HOLOMESH_KEY}`;
  }
  return h;
}

// ── Board + fleet fetch ───────────────────────────────────────────────────────

async function fetchBoardTasks(teamId: string, clientAuth?: string | null): Promise<BoardTask[]> {
  const res = await fetch(`${HOLOMESH_BASE}/api/holomesh/team/${encodeURIComponent(teamId)}/board`, {
    headers: holomeshHeaders(clientAuth),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return [];
  const data: unknown = await res.json();
  const body = data as { tasks?: unknown[]; board?: { tasks?: unknown[] } };
  const raw = body.tasks ?? body.board?.tasks ?? [];
  return raw.map((t: unknown) => {
    const task = t as Record<string, unknown>;
    return {
      id: String(task['id'] ?? task['taskId'] ?? ''),
      title: String(task['title'] ?? ''),
      description: task['description'] ? String(task['description']) : undefined,
      priority: task['priority'] as BoardTask['priority'],
      role: task['role'] ? String(task['role']) : undefined,
      tags: Array.isArray(task['tags']) ? (task['tags'] as string[]) : undefined,
      status: task['status'] ? String(task['status']) : 'open',
      claimedBy: task['claimedBy'] ? String(task['claimedBy']) : null,
      createdAt: task['createdAt'] ? String(task['createdAt']) : undefined,
    } satisfies BoardTask;
  }).filter((t) => t.id);
}

async function fetchFleetAgents(teamId: string, clientAuth?: string | null): Promise<FleetAgent[]> {
  // Try the HoloMesh team members endpoint to get presence + skills
  const [membersRes, agentsRes] = await Promise.allSettled([
    fetch(`${HOLOMESH_BASE}/api/holomesh/team/${encodeURIComponent(teamId)}/members`, {
      headers: holomeshHeaders(clientAuth),
      signal: AbortSignal.timeout(8_000),
    }),
    fetch(`${HOLOMESH_BASE}/api/holomesh/agents/fleet`, {
      headers: holomeshHeaders(clientAuth),
      signal: AbortSignal.timeout(8_000),
    }),
  ]);

  const seen = new Set<string>();
  const agents: FleetAgent[] = [];

  const pushAgent = (raw: Record<string, unknown>) => {
    const id = String(raw['id'] ?? raw['agentId'] ?? raw['handle'] ?? '');
    if (!id || seen.has(id)) return;
    seen.add(id);
    agents.push({
      id,
      handle: String(raw['handle'] ?? raw['name'] ?? id),
      skills: Array.isArray(raw['skills'])
        ? (raw['skills'] as string[])
        : Array.isArray(raw['defaultSkills'])
          ? (raw['defaultSkills'] as string[])
          : [],
      status: raw['status'] ? String(raw['status']) : 'online',
      currentTask: raw['currentTask'] ? String(raw['currentTask']) : null,
      mission: raw['mission'] ? String(raw['mission']) : undefined,
    } satisfies FleetAgent);
  };

  if (membersRes.status === 'fulfilled' && membersRes.value.ok) {
    const data: unknown = await membersRes.value.json();
    const body = data as { members?: unknown[] };
    for (const m of body.members ?? []) pushAgent(m as Record<string, unknown>);
  }

  if (agentsRes.status === 'fulfilled' && agentsRes.value.ok) {
    const data: unknown = await agentsRes.value.json();
    const body = data as { agents?: unknown[] };
    for (const a of body.agents ?? []) pushAgent(a as Record<string, unknown>);
  }

  return agents;
}

// ── Claim helper ─────────────────────────────────────────────────────────────

interface ClaimResult {
  taskId: string;
  agentId: string;
  success: boolean;
  error?: string;
}

async function claimTask(
  teamId: string,
  taskId: string,
  agentId: string,
  agentHandle: string,
  clientAuth?: string | null,
): Promise<ClaimResult> {
  try {
    const res = await fetch(
      `${HOLOMESH_BASE}/api/holomesh/team/${encodeURIComponent(teamId)}/board/${encodeURIComponent(taskId)}`,
      {
        method: 'PATCH',
        headers: holomeshHeaders(clientAuth),
        body: JSON.stringify({ action: 'claim', agentId, agentName: agentHandle }),
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (!res.ok) {
      const errData: unknown = await res.json().catch(() => null);
      const errMsg =
        typeof errData === 'object' && errData !== null && 'error' in errData
          ? String((errData as Record<string, unknown>)['error'])
          : `HTTP ${res.status}`;
      return { taskId, agentId, success: false, error: errMsg };
    }
    return { taskId, agentId, success: true };
  } catch (err) {
    return {
      taskId,
      agentId,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ── POST handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const clientAuth = req.headers.get('authorization');

  let body: unknown;
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    body = {};
  }

  const params = (body ?? {}) as Record<string, unknown>;
  const teamId = typeof params['teamId'] === 'string' && params['teamId'].trim()
    ? params['teamId'].trim()
    : DEFAULT_TEAM_ID;
  const maxDispatches = typeof params['maxDispatches'] === 'number'
    ? Math.min(Math.max(1, params['maxDispatches']), 10)
    : 1;
  const dryRun = params['dryRun'] === true || params['dryRun'] === 'true';

  // Fetch live state
  const [tasks, agents] = await Promise.all([
    fetchBoardTasks(teamId, clientAuth),
    fetchFleetAgents(teamId, clientAuth),
  ]);

  // capUsd: body param (Studio override) > env > default
  const bodyCapUsd = typeof params['capUsd'] === 'number' && params['capUsd'] > 0
    ? params['capUsd']
    : undefined;
  const capUsd = bodyCapUsd ?? Number(process.env['FLEET_DAILY_SPEND_CAP_USD']) || DEFAULT_DAILY_SPEND_CAP_USD;
  // TODO(Phase 2): hydrate from persisted snapshot (DB/KV) per {teamId, dayKey}
  const governor = new SpendGovernor({ capUsd });

  const plan: FleetDispatchPlan = planFleetDispatch(tasks, agents, governor, { maxDispatches });

  if (dryRun || plan.decisions.length === 0) {
    return NextResponse.json({
      dryRun: true,
      teamId,
      plan: {
        decisions: plan.decisions.map((d) => ({
          taskId: d.task.id,
          taskTitle: d.task.title,
          agentId: d.agent.id,
          agentHandle: d.agent.handle,
          score: d.score,
          estimatedSpendUsd: d.estimatedSpendUsd,
          reason: d.reason,
        })),
        unassigned: plan.unassigned.map((t) => t.id),
        capReached: plan.capReached,
      },
      spend: plan.spend,
      agentCount: agents.length,
      taskCount: tasks.length,
    });
  }

  // Execute: claim each decided task, record estimated spend
  const dispatched: Array<ClaimResult & { taskTitle: string; agentHandle: string; estimatedSpendUsd: number; reason: string }> = [];

  for (const decision of plan.decisions) {
    const claim = await claimTask(
      teamId,
      decision.task.id,
      decision.agent.id,
      decision.agent.handle,
      clientAuth,
    );

    if (claim.success) {
      governor.record(decision.estimatedSpendUsd);
      console.log(
        `[fleet-metric] dispatch task=${decision.task.id} agent=${decision.agent.handle} score=${decision.score.toFixed(2)} est=$${decision.estimatedSpendUsd} reason="${decision.reason}"`,
      );
    }

    dispatched.push({
      ...claim,
      taskTitle: decision.task.title,
      agentHandle: decision.agent.handle,
      estimatedSpendUsd: decision.estimatedSpendUsd,
      reason: decision.reason,
    });
  }

  return NextResponse.json({
    dryRun: false,
    teamId,
    dispatched,
    plan: {
      unassigned: plan.unassigned.map((t) => t.id),
      capReached: plan.capReached,
    },
    spend: governor.snapshot(),
    executorNote:
      'Tasks claimed. Actual LLM execution per agent is Phase 2 (sandboxing required — see research/2026-06-07_brittney-fleet-orchestrator-wiring.md §5).',
  });
}
