/**
 * HoloMesh Team Agent MCP Tools
 *
 * MCP tool wrappers for team agent coordination:
 * - holomesh_team_load_agents: Load agent profiles into a team room
 * - holomesh_team_run_cycle: Execute one work cycle for agents in a room
 * - holomesh_team_compound: Trigger knowledge compounding across agents
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  assignAgentsToRoom,
  runAgentCycle,
  compoundKnowledge,
  getRoomAgents,
  getRoomCycleHistory,
} from './agent/team-coordinator';
import { getAllProfiles, TEAM_AGENT_PROFILES } from './agent/team-agents';

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
          description: 'Agent profile IDs to load. Available: agent_brittney, agent_daemon, agent_absorb, agent_oracle. Omit to load all.',
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
