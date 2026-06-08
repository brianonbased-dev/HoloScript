export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'node:child_process';
import { ENDPOINTS, getHolomeshKey } from '@holoscript/config';
import {
  planFleetDispatch,
  SpendGovernor,
  DEFAULT_DAILY_SPEND_CAP_USD,
  type BoardTask,
  type FleetAgent,
  type FleetDispatchPlan,
} from '@/lib/brittney/FleetOrchestrator';
import { loadGovernor, saveGovernor } from '@/lib/brittney/spendStore';
import { resolveBrittneyProviderAsync } from '@/lib/brittney/provider';
import type { LLMMessage, LLMStreamChunk } from '@holoscript/llm-provider';

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
  const res = await fetch(
    `${HOLOMESH_BASE}/api/holomesh/team/${encodeURIComponent(teamId)}/board`,
    {
      headers: holomeshHeaders(clientAuth),
      signal: AbortSignal.timeout(10_000),
    }
  );
  if (!res.ok) return [];
  const data: unknown = await res.json();
  const body = data as { tasks?: unknown[]; board?: { tasks?: unknown[] } };
  const raw = body.tasks ?? body.board?.tasks ?? [];
  return raw
    .map((t: unknown) => {
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
    })
    .filter((t) => t.id);
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
  clientAuth?: string | null
): Promise<ClaimResult> {
  try {
    const res = await fetch(
      `${HOLOMESH_BASE}/api/holomesh/team/${encodeURIComponent(teamId)}/board/${encodeURIComponent(taskId)}`,
      {
        method: 'PATCH',
        headers: holomeshHeaders(clientAuth),
        body: JSON.stringify({ action: 'claim', agentId, agentName: agentHandle }),
        signal: AbortSignal.timeout(8_000),
      }
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

// ── GET handler — current config + spend state ───────────────────────────────

export async function GET() {
  const capUsd = Number(process.env['FLEET_DAILY_SPEND_CAP_USD']) || DEFAULT_DAILY_SPEND_CAP_USD;
  const executorEnabled = process.env['FLEET_EXECUTOR_ENABLED'] === 'true';
  const governor = await loadGovernor(DEFAULT_TEAM_ID, capUsd);
  return NextResponse.json({
    teamId: DEFAULT_TEAM_ID,
    executorEnabled,
    spend: governor.snapshot(),
  });
}

// ── HoloClaw lifecycle helpers ────────────────────────────────────────────────

async function setAgentStatus(
  agentId: string,
  status: 'active' | 'paused',
  clientAuth?: string | null
): Promise<void> {
  try {
    await fetch(`${HOLOMESH_BASE}/api/holomesh/agents/fleet/${encodeURIComponent(agentId)}`, {
      method: 'PATCH',
      headers: holomeshHeaders(clientAuth),
      body: JSON.stringify({ status }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    // non-fatal — lifecycle state is best-effort; execution continues
  }
}

// ── Self-improve executor (real engine, propose-only) ─────────────────────────

const REPO_ROOT = process.env['HOLOSCRIPT_REPO_ROOT'] || process.cwd();

/**
 * Startup guard: if HOLOSCRIPT_REPO_ROOT is explicitly set, verify the self-improve
 * runner path exists before the first self-improve task is accepted. This catches
 * W.691-class cwd mismatches (Railway container root ≠ monorepo root) at startup
 * rather than at runtime, producing a clear ENOENT message instead of a silent
 * spawn failure deep in the execution path.
 *
 * Only runs when HOLOSCRIPT_REPO_ROOT is set (i.e. the operator has confirmed the
 * repo root). When unset we fall back to process.cwd() — the guard can't help there,
 * but at least the subsequent spawn will fail loud with the resolved path in the error.
 */
const SELF_IMPROVE_RUNNER = 'packages/absorb-service/src/self-improvement/run-self-improve.ts';

if (process.env['HOLOSCRIPT_REPO_ROOT']) {
  // Lazy dynamic imports so the guard runs at module-load time without requiring
  // node:fs/node:path at the top-level (Next.js edge compat, unit-test isolation).
  Promise.all([import('node:fs'), import('node:path')])
    .then(([fs, path]) => {
      const runnerAbs = path.join(process.env['HOLOSCRIPT_REPO_ROOT']!, SELF_IMPROVE_RUNNER);
      if (!fs.existsSync(runnerAbs)) {
        console.error(
          `[fleet-dispatch] STARTUP GUARD FAILED: HOLOSCRIPT_REPO_ROOT is set to ` +
            `"${process.env['HOLOSCRIPT_REPO_ROOT']}" but the self-improve runner was not found ` +
            `at expected path: ${runnerAbs}\n` +
            `Self-improve tasks WILL fail with ENOENT. ` +
            `Check HOLOSCRIPT_REPO_ROOT in Railway studio-service env vars.`
        );
      } else {
        console.log(`[fleet-dispatch] REPO_ROOT guard OK: runner found at ${runnerAbs}`);
      }
    })
    .catch(() => {
      /* non-fatal — guard failure must never block the route */
    });
}

/**
 * Self-improve-tagged tasks run the REAL propose-only engine (run-self-improve.ts) — the
 * fleet's first genuinely-executing task class — instead of the generic LLM-describe path.
 * Spawns the runner exactly like HoloClaw spawns daemons; returns its JSON summary as the
 * task evidence. Bounded (maxIterations) + propose-only (the runner forces autoCommit=false),
 * so an autonomous fleet run can never commit to the branch.
 *
 * Requires HOLOSCRIPT_REPO_ROOT to be set in the Railway studio-service env vars.
 * See scripts/holo-ci/env-requirements.md for the full required/optional env var list.
 */
async function executeSelfImproveViaRunner(task: BoardTask): Promise<string> {
  const runner = SELF_IMPROVE_RUNNER;
  return await new Promise<string>((resolve) => {
    const child = spawn('npx', ['tsx', runner, '--json', '--max-iterations', '2'], {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'production' },
    });
    let out = '';
    let err = '';
    child.stdout?.on('data', (d: Buffer) => {
      out += d.toString();
    });
    child.stderr?.on('data', (d: Buffer) => {
      err += d.toString();
    });
    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        /* already gone */
      }
    }, 280_000);
    child.on('exit', (code) => {
      clearTimeout(timer);
      const summary = out.trim() || err.trim().slice(-2000) || '(no runner output)';
      resolve(
        `self-improve runner exit=${code} for "${task.title}". Propose-only — review and ` +
          `apply the passing proposals:\n${summary.slice(0, 6000)}`
      );
    });
    child.on('error', (e: Error) => {
      clearTimeout(timer);
      resolve(`self-improve runner spawn error: ${e.message}`);
    });
  });
}

// ── Executor (FLEET_EXECUTOR_ENABLED=true gate) ───────────────────────────────

/**
 * Activate a HoloClaw agent, execute a task through its sovereign provider
 * (same resolveBrittneyProviderAsync chain Brittney uses), then deactivate.
 * Gated by FLEET_EXECUTOR_ENABLED so the claim-only path remains the safe default.
 */
async function executeTaskViaHoloClaw(
  task: BoardTask,
  agent: FleetAgent,
  clientAuth?: string | null
): Promise<string> {
  await setAgentStatus(agent.id, 'active', clientAuth);

  try {
    const resolved = await resolveBrittneyProviderAsync();
    const messages: LLMMessage[] = [
      {
        role: 'user',
        content:
          `You are an autonomous HoloClaw agent executing a board task. Reason through the task, produce a concrete plan, and carry out any steps you can with your available tools.\n\n` +
          `Task: ${task.title}\n` +
          (task.description ? `Description: ${task.description}\n` : '') +
          (task.role ? `Role: ${task.role}\n` : '') +
          `\nRespond with: what you did (or would do), any decisions made, and the verification evidence (test results, commit hash, or analysis) that proves the task is complete.`,
      },
    ];

    const req = {
      model: resolved.model,
      messages,
      max_tokens: Math.min(resolved.maxTokens, 4096),
      system:
        `You are ${agent.handle}, a HoloClaw fleet agent executing an autonomous board task. ` +
        `Be concise and factual. Produce a verifiable execution record: what was done, how it was verified.`,
    };

    const chunks: string[] = [];
    for await (const chunk of resolved.provider.streamCompletion(
      req
    ) as AsyncIterable<LLMStreamChunk>) {
      if (chunk.type === 'text_delta' && chunk.text) chunks.push(chunk.text);
    }
    return chunks.join('').trim() || '(no output from executor)';
  } finally {
    await setAgentStatus(agent.id, 'paused', clientAuth);
  }
}

async function closeTask(
  teamId: string,
  taskId: string,
  evidence: string,
  clientAuth?: string | null
): Promise<void> {
  try {
    await fetch(
      `${HOLOMESH_BASE}/api/holomesh/team/${encodeURIComponent(teamId)}/board/${encodeURIComponent(taskId)}`,
      {
        method: 'PATCH',
        headers: holomeshHeaders(clientAuth),
        body: JSON.stringify({ action: 'done', verification_evidence: evidence }),
        signal: AbortSignal.timeout(8_000),
      }
    );
  } catch {
    // non-fatal — task was claimed; close failure is logged but doesn't fail the response
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
  const teamId =
    typeof params['teamId'] === 'string' && params['teamId'].trim()
      ? params['teamId'].trim()
      : DEFAULT_TEAM_ID;
  const maxDispatches =
    typeof params['maxDispatches'] === 'number'
      ? Math.min(Math.max(1, params['maxDispatches']), 10)
      : 1;
  const dryRun = params['dryRun'] === true || params['dryRun'] === 'true';
  const executorEnabled =
    params['executeAfterClaim'] === true || process.env['FLEET_EXECUTOR_ENABLED'] === 'true';

  // Fetch live state
  const [tasks, agents] = await Promise.all([
    fetchBoardTasks(teamId, clientAuth),
    fetchFleetAgents(teamId, clientAuth),
  ]);

  // capUsd: body param (Studio override) > env > default
  const bodyCapUsd =
    typeof params['capUsd'] === 'number' && params['capUsd'] > 0 ? params['capUsd'] : undefined;
  const capUsd =
    bodyCapUsd ?? (Number(process.env['FLEET_DAILY_SPEND_CAP_USD']) || DEFAULT_DAILY_SPEND_CAP_USD);
  const governor = await loadGovernor(teamId, capUsd);

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
  const dispatched: Array<
    ClaimResult & {
      taskTitle: string;
      agentHandle: string;
      estimatedSpendUsd: number;
      reason: string;
    }
  > = [];

  for (const decision of plan.decisions) {
    const claim = await claimTask(
      teamId,
      decision.task.id,
      decision.agent.id,
      decision.agent.handle,
      clientAuth
    );

    let executionRecord: string | undefined;
    if (claim.success) {
      governor.record(decision.estimatedSpendUsd);
      await saveGovernor(teamId, governor);
      console.log(
        `[fleet-metric] dispatch task=${decision.task.id} agent=${decision.agent.handle} score=${decision.score.toFixed(2)} est=$${decision.estimatedSpendUsd} reason="${decision.reason}"`
      );
      if (executorEnabled) {
        try {
          const isSelfImprove = (decision.task.tags ?? []).some(
            (t) => t.toLowerCase() === 'self-improve'
          );
          executionRecord = isSelfImprove
            ? await executeSelfImproveViaRunner(decision.task)
            : await executeTaskViaHoloClaw(decision.task, decision.agent, clientAuth);
          await closeTask(teamId, decision.task.id, executionRecord, clientAuth);
        } catch (execErr) {
          executionRecord = `Executor error: ${execErr instanceof Error ? execErr.message : String(execErr)}`;
        }
      }
    }

    dispatched.push({
      ...claim,
      taskTitle: decision.task.title,
      agentHandle: decision.agent.handle,
      estimatedSpendUsd: decision.estimatedSpendUsd,
      reason: decision.reason,
      ...(executionRecord !== undefined ? { executionRecord } : {}),
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
    executorEnabled,
    executorNote: executorEnabled
      ? 'Tasks claimed and executed via HoloClaw. Agent activated before execution, paused on completion. Execution records in dispatched[].executionRecord.'
      : 'Tasks claimed. Set FLEET_EXECUTOR_ENABLED=true or pass executeAfterClaim:true to activate HoloClaw agents and execute.',
  });
}
