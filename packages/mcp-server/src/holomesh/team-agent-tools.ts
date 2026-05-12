/**
 * HoloMesh Team Agent MCP Tools
 *
 * MCP tool wrappers for team agent coordination:
 * - holomesh_team_load_agents: Load agent profiles into a team room
 * - holomesh_team_run_cycle: Execute one work cycle for agents in a room
 * - holomesh_team_compound: Trigger knowledge compounding across agents
 * - holomesh_autonomous_control: Start/stop/query autonomous room loops
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  assignAgentsToRoom,
  runAgentCycle,
  compoundKnowledge,
  getRoomAgents,
} from './agent/team-coordinator';
import { getAllProfiles, TEAM_AGENT_PROFILES } from './agent/team-agents';

type AutonomousAction = 'start' | 'stop' | 'status' | 'query' | 'tick';

interface AutonomousLoopState {
  loopId: string;
  teamId: string;
  intervalMs: number;
  startedAt: string;
  lastTickAt?: string;
  stoppedAt?: string;
  status: 'running' | 'stopped';
  cycleCount: number;
  maxCycles?: number;
  compoundAfterCycle: boolean;
  runningTick: boolean;
  lastResult?: unknown;
  lastError?: string;
  timer?: ReturnType<typeof setInterval>;
}

const autonomousLoops = new Map<string, AutonomousLoopState>();

// ── MCP Tool Definitions ──

export const teamAgentTools: Tool[] = [
  {
    name: 'holomesh_team_load_agents',
    description: 'Load agent profiles into a team room. Agents are assigned slot roles and can then participate in work cycles. Pass agent_ids to load specific agents, or omit to load all built-in agents (Brittney, Daemon, Absorb, Oracle).',
    inputSchema: {
      type: 'object',
      properties: {
        team_id: {
          type: 'string',
          description: 'The team room ID to load agents into',
        },
        agent_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Agent profile IDs to load. Available: agent_primary_assistant (legacy alias: agent_brittney), agent_daemon, agent_absorb, agent_oracle. Omit to load all.',
        },
      },
      required: ['team_id'],
    },
  },
  {
    name: 'holomesh_team_run_cycle',
    description: 'Execute one work cycle for all agents loaded in a team room. Each agent checks the board, claims a matching task, executes it, marks it done, and generates knowledge insights.',
    inputSchema: {
      type: 'object',
      properties: {
        team_id: {
          type: 'string',
          description: 'The team room ID to run the cycle in',
        },
      },
      required: ['team_id'],
    },
  },
  {
    name: 'holomesh_team_compound',
    description: 'Trigger knowledge compounding for a team room. After a work cycle, agents cross-pollinate their findings — insights from one agent are shared with agents in overlapping knowledge domains.',
    inputSchema: {
      type: 'object',
      properties: {
        team_id: {
          type: 'string',
          description: 'The team room ID to compound knowledge for',
        },
      },
      required: ['team_id'],
    },
  },
  {
    name: 'holomesh_autonomous_control',
    description:
      'Start, stop, query, or tick an autonomous agent loop for a HoloMesh team room. The loop reuses holomesh_team_run_cycle semantics and can optionally compound knowledge after each cycle.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['start', 'stop', 'status', 'query', 'tick'],
          description: 'Control action. "query" is an alias for "status". Defaults to status.',
        },
        team_id: {
          type: 'string',
          description: 'Team room ID. Required for start and tick. Used as loop_id when loop_id is omitted.',
        },
        loop_id: {
          type: 'string',
          description: 'Optional loop ID. Defaults to team_id.',
        },
        agent_ids: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Optional agent profile IDs to load before starting the loop. Uses existing loaded agents when omitted.',
        },
        interval_ms: {
          type: 'number',
          description: 'Cycle interval in milliseconds. Clamped to 5000..3600000. Default 60000.',
        },
        max_cycles: {
          type: 'number',
          description: 'Optional maximum cycle count before the loop stops itself.',
        },
        run_immediately: {
          type: 'boolean',
          description: 'When true, execute one cycle before returning from start.',
        },
        compound_after_cycle: {
          type: 'boolean',
          description: 'When true, run holomesh_team_compound after each cycle.',
        },
      },
    },
  },
];

// ── MCP Tool Handler ──

/**
 * Handle MCP tool calls for team agent operations.
 * Returns null if the tool name is not a team agent tool.
 */
export async function handleTeamAgentTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown | null> {
  switch (name) {
    case 'holomesh_team_load_agents':
      return handleLoadAgents(args);
    case 'holomesh_team_run_cycle':
      return handleRunCycle(args);
    case 'holomesh_team_compound':
      return handleCompound(args);
    case 'holomesh_autonomous_control':
      return handleAutonomousControl(args);
    default:
      return null;
  }
}

// ── Individual Handlers ──

function handleLoadAgents(args: Record<string, unknown>): Record<string, unknown> {
  const teamId = args.team_id as string;
  if (!teamId) {
    return { error: '"team_id" is required.' };
  }

  let agentIds = args.agent_ids as string[] | undefined;
  if (!agentIds || !Array.isArray(agentIds) || agentIds.length === 0) {
    // Load all built-in agents
    agentIds = getAllProfiles().map((p) => p.id);
  }

  // Validate agent IDs
  const unknownIds = agentIds.filter((id) => !TEAM_AGENT_PROFILES.has(id));
  if (unknownIds.length > 0) {
    return {
      error: `Unknown agent profile IDs: ${unknownIds.join(', ')}. Available: ${getAllProfiles()
        .map((p) => p.id)
        .join(', ')}`,
    };
  }

  const result = assignAgentsToRoom(teamId, agentIds);
  return {
    success: true,
    roomId: result.roomId,
    loaded: result.loaded.map((s) => ({
      agentId: s.agentId,
      agentName: s.agentName,
      role: s.role,
      joinedAt: s.joinedAt,
    })),
    skipped: result.skipped,
    totalAgentsInRoom: getRoomAgents(teamId).length,
  };
}

async function handleRunCycle(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const teamId = args.team_id as string;
  if (!teamId) {
    return { error: '"team_id" is required.' };
  }

  const agents = getRoomAgents(teamId);
  if (agents.length === 0) {
    return {
      error: `No agents loaded in room "${teamId}". Use holomesh_team_load_agents first.`,
    };
  }

  const results = await runAgentCycle(teamId);

  const completed = results.filter((r) => r.action === 'completed');
  const skipped = results.filter((r) => r.action === 'skipped');
  const errors = results.filter((r) => r.action === 'error');
  const totalInsights = results.reduce((sum, r) => sum + r.knowledgeEntries.length, 0);

  return {
    success: true,
    roomId: teamId,
    summary: {
      completed: completed.length,
      skipped: skipped.length,
      errors: errors.length,
      totalInsights,
    },
    results: results.map((r) => ({
      agentId: r.agentId,
      agentName: r.agentName,
      action: r.action,
      taskId: r.taskId,
      taskTitle: r.taskTitle,
      summary: r.summary,
      insightCount: r.knowledgeEntries.length,
    })),
  };
}

function handleCompound(args: Record<string, unknown>): Record<string, unknown> {
  const teamId = args.team_id as string;
  if (!teamId) {
    return { error: '"team_id" is required.' };
  }

  const agents = getRoomAgents(teamId);
  if (agents.length === 0) {
    return {
      error: `No agents loaded in room "${teamId}". Use holomesh_team_load_agents first.`,
    };
  }

  const result = compoundKnowledge(teamId);

  return {
    success: true,
    roomId: result.roomId,
    agentsInvolved: result.agentsInvolved,
    insightsShared: result.insightsShared,
    crossReferences: result.crossReferences,
    timestamp: result.timestamp,
  };
}

async function handleAutonomousControl(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const action = normalizeAutonomousAction(args.action);
  const teamId = stringOrUndefined(args.team_id);
  const loopId = stringOrUndefined(args.loop_id) || teamId;

  if ((action === 'start' || action === 'tick') && !teamId) {
    return { error: '"team_id" is required for holomesh_autonomous_control start/tick.' };
  }
  if ((action === 'stop' || action === 'status' || action === 'query') && !loopId) {
    return {
      success: true,
      loops: Array.from(autonomousLoops.values()).map(serializeLoop),
      count: autonomousLoops.size,
    };
  }

  switch (action) {
    case 'start':
      return startAutonomousLoop(args, teamId!, loopId!);
    case 'stop':
      return stopAutonomousLoop(loopId!);
    case 'tick':
      return tickAutonomousLoop(args, teamId!, loopId!);
    case 'query':
    case 'status':
      return statusAutonomousLoop(loopId!);
  }
}

async function startAutonomousLoop(
  args: Record<string, unknown>,
  teamId: string,
  loopId: string
): Promise<Record<string, unknown>> {
  const existing = autonomousLoops.get(loopId);
  if (existing?.status === 'running') {
    return {
      success: true,
      message: `Autonomous loop "${loopId}" is already running.`,
      loop: serializeLoop(existing),
    };
  }

  const loaded = ensureAutonomousAgents(teamId, args.agent_ids);
  if ('error' in loaded) return loaded;

  const intervalMs = clampNumber(args.interval_ms, 60_000, 5_000, 3_600_000);
  const maxCycles = optionalPositiveInteger(args.max_cycles);
  const loop: AutonomousLoopState = {
    loopId,
    teamId,
    intervalMs,
    startedAt: new Date().toISOString(),
    status: 'running',
    cycleCount: 0,
    maxCycles,
    compoundAfterCycle: args.compound_after_cycle === true,
    runningTick: false,
  };
  loop.timer = setInterval(() => {
    void runAutonomousLoopOnce(loop);
  }, intervalMs);
  const timerWithUnref = loop.timer as { unref?: () => void };
  timerWithUnref.unref?.();

  autonomousLoops.set(loopId, loop);

  if (args.run_immediately === true) {
    await runAutonomousLoopOnce(loop);
  }

  return {
    success: true,
    message: `Autonomous loop "${loopId}" started.`,
    loadedAgents: loaded.loadedAgents,
    loop: serializeLoop(loop),
  };
}

function stopAutonomousLoop(loopId: string): Record<string, unknown> {
  const loop = autonomousLoops.get(loopId);
  if (!loop) {
    return {
      success: false,
      error: `Autonomous loop "${loopId}" is not running.`,
      loopId,
    };
  }

  stopLoop(loop);
  autonomousLoops.delete(loopId);
  return {
    success: true,
    message: `Autonomous loop "${loopId}" stopped.`,
    loop: serializeLoop(loop),
  };
}

async function tickAutonomousLoop(
  args: Record<string, unknown>,
  teamId: string,
  loopId: string
): Promise<Record<string, unknown>> {
  const loaded = ensureAutonomousAgents(teamId, args.agent_ids);
  if ('error' in loaded) return loaded;

  const loop =
    autonomousLoops.get(loopId) ||
    ({
      loopId,
      teamId,
      intervalMs: 0,
      startedAt: new Date().toISOString(),
      status: 'stopped',
      cycleCount: 0,
      compoundAfterCycle: args.compound_after_cycle === true,
      runningTick: false,
    } satisfies AutonomousLoopState);

  await runAutonomousLoopOnce(loop);
  return {
    success: !loop.lastError,
    loadedAgents: loaded.loadedAgents,
    loop: serializeLoop(loop),
  };
}

function statusAutonomousLoop(loopId: string): Record<string, unknown> {
  const loop = autonomousLoops.get(loopId);
  if (!loop) {
    return {
      success: true,
      loopId,
      status: 'stopped',
      running: false,
    };
  }
  return {
    success: true,
    running: loop.status === 'running',
    loop: serializeLoop(loop),
  };
}

async function runAutonomousLoopOnce(loop: AutonomousLoopState): Promise<void> {
  if (loop.runningTick) return;
  loop.runningTick = true;
  loop.lastTickAt = new Date().toISOString();

  try {
    const results = await runAgentCycle(loop.teamId);
    const compound = loop.compoundAfterCycle ? compoundKnowledge(loop.teamId) : undefined;
    loop.cycleCount += 1;
    loop.lastResult = {
      summary: summarizeCycleResults(results),
      results: results.map((result) => ({
        agentId: result.agentId,
        agentName: result.agentName,
        action: result.action,
        taskId: result.taskId,
        taskTitle: result.taskTitle,
        insightCount: result.knowledgeEntries.length,
      })),
      compound,
    };
    loop.lastError = undefined;
    if (loop.maxCycles && loop.cycleCount >= loop.maxCycles) {
      stopLoop(loop);
    }
  } catch (err: unknown) {
    loop.lastError = err instanceof Error ? err.message : String(err);
  } finally {
    loop.runningTick = false;
  }
}

function ensureAutonomousAgents(
  teamId: string,
  agentIdsValue: unknown
): { loadedAgents: number } | Record<string, unknown> {
  const agentIds = Array.isArray(agentIdsValue)
    ? agentIdsValue.filter((id): id is string => typeof id === 'string')
    : [];

  if (agentIds.length > 0) {
    const unknownIds = agentIds.filter((id) => !TEAM_AGENT_PROFILES.has(id));
    if (unknownIds.length > 0) {
      return {
        error: `Unknown agent profile IDs: ${unknownIds.join(', ')}. Available: ${getAllProfiles()
          .map((p) => p.id)
          .join(', ')}`,
      };
    }
    assignAgentsToRoom(teamId, agentIds);
  }

  const loadedAgents = getRoomAgents(teamId).length;
  if (loadedAgents === 0) {
    return {
      error: `No agents loaded in room "${teamId}". Provide agent_ids or use holomesh_team_load_agents first.`,
    };
  }

  return { loadedAgents };
}

function stopLoop(loop: AutonomousLoopState): void {
  if (loop.timer) {
    clearInterval(loop.timer);
    loop.timer = undefined;
  }
  loop.status = 'stopped';
  loop.stoppedAt = new Date().toISOString();
}

function serializeLoop(loop: AutonomousLoopState): Record<string, unknown> {
  return {
    loopId: loop.loopId,
    teamId: loop.teamId,
    status: loop.status,
    running: loop.status === 'running',
    intervalMs: loop.intervalMs,
    startedAt: loop.startedAt,
    lastTickAt: loop.lastTickAt,
    stoppedAt: loop.stoppedAt,
    cycleCount: loop.cycleCount,
    maxCycles: loop.maxCycles,
    compoundAfterCycle: loop.compoundAfterCycle,
    runningTick: loop.runningTick,
    lastResult: loop.lastResult,
    lastError: loop.lastError,
  };
}

function summarizeCycleResults(results: Awaited<ReturnType<typeof runAgentCycle>>): Record<string, number> {
  return {
    completed: results.filter((result) => result.action === 'completed').length,
    skipped: results.filter((result) => result.action === 'skipped').length,
    errors: results.filter((result) => result.action === 'error').length,
    synthesized: results.filter((result) => result.action === 'synthesized').length,
    totalInsights: results.reduce((sum, result) => sum + result.knowledgeEntries.length, 0),
  };
}

function normalizeAutonomousAction(value: unknown): AutonomousAction {
  if (
    value === 'start' ||
    value === 'stop' ||
    value === 'status' ||
    value === 'query' ||
    value === 'tick'
  ) {
    return value;
  }
  return 'status';
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function optionalPositiveInteger(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const integer = Math.floor(value);
  return integer > 0 ? integer : undefined;
}

export function _resetAutonomousControlState(): void {
  for (const loop of autonomousLoops.values()) {
    stopLoop(loop);
  }
  autonomousLoops.clear();
}
