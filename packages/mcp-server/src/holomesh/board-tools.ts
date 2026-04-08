/**
 * HoloMesh Team Board MCP Tools (FW-0.3 hollowed)
 *
 * Thin MCP tool definitions + handlers that delegate entirely to
 * `@holoscript/framework` Team class. No inline board logic remains.
 *
 * Tools:
 * - holomesh_board_list, holomesh_board_add, holomesh_board_claim,
 *   holomesh_board_complete, holomesh_slot_assign, holomesh_mode_set,
 *   holomesh_scout, holomesh_suggest, holomesh_suggest_vote, holomesh_suggest_list
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { Team } from '@holoscript/framework';

// ── Server URL Resolution ──

function getServerUrl(): string {
  return (
    process.env.HOLOSCRIPT_SERVER_URL ||
    process.env.MCP_LOCAL_URL ||
    'https://mcp.holoscript.net'
  );
}

function getApiKey(): string {
  return process.env.HOLOMESH_API_KEY || process.env.MCP_API_KEY || '';
}

function getFrameworkTeam(teamId: string): Team {
  return new Team({
    name: teamId,
    agents: [],
    boardUrl: getServerUrl(),
    boardApiKey: getApiKey(),
  });
}

// ── MCP Tool Definitions ──

export const boardTools: Tool[] = [
  {
    name: 'holomesh_board_list',
    description:
      'List all tasks on a team board. Returns open, claimed, blocked tasks plus recent done log and slot roles.',
    inputSchema: {
      type: 'object',
      properties: {
        team_id: {
          type: 'string',
          description: 'The team ID to list the board for',
        },
      },
      required: ['team_id'],
    },
  },
  {
    name: 'holomesh_board_add',
    description:
      'Add one or more tasks to a team board. Each task needs a title; optional: description, priority (1-10), source, role.',
    inputSchema: {
      type: 'object',
      properties: {
        team_id: {
          type: 'string',
          description: 'The team ID',
        },
        tasks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: {
                type: 'string',
                description: 'Task title (max 200 chars)',
              },
              description: {
                type: 'string',
                description: 'Task description (max 1000 chars)',
              },
              priority: {
                type: 'number',
                description: 'Priority 1-10 (1 = critical, default 5)',
              },
              source: {
                type: 'string',
                description: 'Where the task came from (e.g., "audit", "manual")',
              },
              role: {
                type: 'string',
                enum: ['coder', 'tester', 'researcher', 'reviewer', 'flex'],
                description: 'Preferred slot role for this task',
              },
            },
            required: ['title'],
          },
          description: 'Array of tasks to add',
        },
      },
      required: ['team_id', 'tasks'],
    },
  },
  {
    name: 'holomesh_board_claim',
    description:
      'Claim an open task on a team board. The task must be in "open" status. The calling agent becomes the assignee.',
    inputSchema: {
      type: 'object',
      properties: {
        team_id: {
          type: 'string',
          description: 'The team ID',
        },
        task_id: {
          type: 'string',
          description: 'The task ID to claim',
        },
      },
      required: ['team_id', 'task_id'],
    },
  },
  {
    name: 'holomesh_board_complete',
    description:
      'Mark a claimed task as done. Optionally include a commit hash and summary as proof of work.',
    inputSchema: {
      type: 'object',
      properties: {
        team_id: {
          type: 'string',
          description: 'The team ID',
        },
        task_id: {
          type: 'string',
          description: 'The task ID to mark done',
        },
        commit: {
          type: 'string',
          description: 'Git commit hash as proof of work (optional)',
        },
        summary: {
          type: 'string',
          description: 'Summary of what was done (optional)',
        },
      },
      required: ['team_id', 'task_id'],
    },
  },
  {
    name: 'holomesh_slot_assign',
    description:
      'Set slot roles for a team. Provide an array of roles matching the team\'s max_slots count. Valid roles: coder, tester, researcher, reviewer, flex.',
    inputSchema: {
      type: 'object',
      properties: {
        team_id: {
          type: 'string',
          description: 'The team ID',
        },
        roles: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['coder', 'tester', 'researcher', 'reviewer', 'flex'],
          },
          description:
            'Array of roles for each slot. Length must equal team max_slots.',
        },
      },
      required: ['team_id', 'roles'],
    },
  },
  {
    name: 'holomesh_mode_set',
    description:
      'Set the team mode/preset. Changes the objective, rules, and task sources. Available modes: audit, research, build, review.',
    inputSchema: {
      type: 'object',
      properties: {
        team_id: {
          type: 'string',
          description: 'The team ID',
        },
        mode: {
          type: 'string',
          enum: ['audit', 'research', 'build', 'review'],
          description: 'The mode to switch to',
        },
      },
      required: ['team_id', 'mode'],
    },
  },
  {
    name: 'holomesh_scout',
    description:
      'Trigger an on-demand scout scan to populate the board when it is empty. Pass grep TODO/FIXME output as todo_content, or doc file contents as sources. Any agent can call this — it does NOT consume a team slot.',
    inputSchema: {
      type: 'object',
      properties: {
        team_id: {
          type: 'string',
          description: 'The team ID',
        },
        todo_content: {
          type: 'string',
          description: 'Grep output of TODO/FIXME markers (path:line: // TODO: message format). Each line becomes a task.',
        },
        sources: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Source file name (e.g., ROADMAP.md)' },
              content: { type: 'string', description: 'File content to derive tasks from' },
            },
            required: ['name', 'content'],
          },
          description: 'Doc files to derive tasks from (checkboxes, headers, TODOs)',
        },
        max_tasks: {
          type: 'number',
          description: 'Max tasks to create (default 50, max 100)',
        },
      },
      required: ['team_id'],
    },
  },
  {
    name: 'holomesh_suggest',
    description:
      'Propose an improvement to the team. Other agents can vote on it. If enough agents upvote, it auto-promotes to a real board task. Categories: process, tooling, architecture, testing, docs, performance, other.',
    inputSchema: {
      type: 'object',
      properties: {
        team_id: {
          type: 'string',
          description: 'The team ID',
        },
        title: {
          type: 'string',
          description: 'Short title for the suggestion (max 200 chars)',
        },
        description: {
          type: 'string',
          description: 'Detailed description of the improvement (max 2000 chars)',
        },
        category: {
          type: 'string',
          enum: ['process', 'tooling', 'architecture', 'testing', 'docs', 'performance', 'other'],
          description: 'Category of the suggestion',
        },
        evidence: {
          type: 'string',
          description: 'What you observed that led to this suggestion (optional, max 1000 chars)',
        },
      },
      required: ['team_id', 'title'],
    },
  },
  {
    name: 'holomesh_suggest_vote',
    description:
      'Vote on a team suggestion. +1 to support, -1 to oppose. Suggestions auto-promote to board tasks when they reach majority support, or auto-dismiss at majority opposition.',
    inputSchema: {
      type: 'object',
      properties: {
        team_id: {
          type: 'string',
          description: 'The team ID',
        },
        suggestion_id: {
          type: 'string',
          description: 'The suggestion ID to vote on',
        },
        value: {
          type: 'number',
          enum: [1, -1],
          description: '+1 to support, -1 to oppose',
        },
        reason: {
          type: 'string',
          description: 'Optional reason for your vote (max 500 chars)',
        },
      },
      required: ['team_id', 'suggestion_id', 'value'],
    },
  },
  {
    name: 'holomesh_suggest_list',
    description:
      'List all suggestions for a team, sorted by score. Optionally filter by status: open, promoted, dismissed.',
    inputSchema: {
      type: 'object',
      properties: {
        team_id: {
          type: 'string',
          description: 'The team ID',
        },
        status: {
          type: 'string',
          enum: ['open', 'promoted', 'dismissed'],
          description: 'Filter by status (optional, default: all)',
        },
      },
      required: ['team_id'],
    },
  },
  {
    name: 'holomesh_heartbeat',
    description:
      'Send a presence heartbeat to keep the agent alive on the team. Call every 60 seconds during active work. Missing 2 heartbeats marks the agent as offline and releases its slot.',
    inputSchema: {
      type: 'object',
      properties: {
        team_id: {
          type: 'string',
          description: 'The team ID',
        },
        agent_name: {
          type: 'string',
          description: 'Name of the calling agent',
        },
        ide_type: {
          type: 'string',
          description: 'IDE type (vscode, claude-code, cursor, gemini)',
        },
      },
      required: ['team_id'],
    },
  },
  {
    name: 'holomesh_knowledge_read',
    description:
      'Read team knowledge entries (Wisdom/Pattern/Gotcha). Call at session start to learn what other agents discovered. Returns the most recent entries.',
    inputSchema: {
      type: 'object',
      properties: {
        team_id: {
          type: 'string',
          description: 'The team ID',
        },
        limit: {
          type: 'number',
          description: 'Max entries to return (default 20)',
        },
      },
      required: ['team_id'],
    },
  },
];

// ── MCP Tool Handler ──

/**
 * Handle MCP tool calls for team board operations.
 * Returns null if the tool name is not a board tool.
 */
export async function handleBoardTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown | null> {
  switch (name) {
    case 'holomesh_board_list':
      return handleBoardList(args);
    case 'holomesh_board_add':
      return handleBoardAdd(args);
    case 'holomesh_board_claim':
      return handleBoardClaim(args);
    case 'holomesh_board_complete':
      return handleBoardComplete(args);
    case 'holomesh_slot_assign':
      return handleSlotAssign(args);
    case 'holomesh_mode_set':
      return handleModeSet(args);
    case 'holomesh_scout':
      return handleScout(args);
    case 'holomesh_suggest':
      return handleSuggest(args);
    case 'holomesh_suggest_vote':
      return handleSuggestVote(args);
    case 'holomesh_suggest_list':
      return handleSuggestList(args);
    case 'holomesh_heartbeat':
      return handleHeartbeat(args);
    case 'holomesh_knowledge_read':
      return handleKnowledgeRead(args);
    default:
      return null;
  }
}

// ── Individual Handlers ──

async function handleBoardList(
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const teamId = args.team_id as string;
  if (!teamId) return { error: '"team_id" is required.' };
  try {
    const team = getFrameworkTeam(teamId);
    return await team.listBoard();
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

async function handleBoardAdd(
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const teamId = args.team_id as string;
  const tasks = args.tasks as Array<Record<string, unknown>> | undefined;

  if (!teamId) return { error: '"team_id" is required.' };
  if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
    return { error: '"tasks" must be a non-empty array of task objects.' };
  }

  try {
    const team = getFrameworkTeam(teamId);
    // @ts-expect-error type variance on task properties
    const added = await team.addTasks(tasks);
    return { tasks: added };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

async function handleBoardClaim(
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const teamId = args.team_id as string;
  const taskId = args.task_id as string;

  if (!teamId) return { error: '"team_id" is required.' };
  if (!taskId) return { error: '"task_id" is required.' };

  try {
    const team = getFrameworkTeam(teamId);
    return await team.claimTask(taskId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

async function handleBoardComplete(
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const teamId = args.team_id as string;
  const taskId = args.task_id as string;
  const commit = args.commit as string | undefined;
  const summary = args.summary as string | undefined;

  if (!teamId) return { error: '"team_id" is required.' };
  if (!taskId) return { error: '"task_id" is required.' };

  try {
    const team = getFrameworkTeam(teamId);
    return await team.completeTask(taskId, commit, summary);
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

async function handleSlotAssign(
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const teamId = args.team_id as string;
  const roles = args.roles as string[] | undefined;

  if (!teamId) return { error: '"team_id" is required.' };
  if (!roles || !Array.isArray(roles) || roles.length === 0) {
    return { error: '"roles" must be a non-empty array of role strings.' };
  }

  try {
    const team = getFrameworkTeam(teamId);
    return await team.assignSlots(roles);
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

async function handleModeSet(
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const teamId = args.team_id as string;
  const mode = args.mode as string;

  if (!teamId) return { error: '"team_id" is required.' };
  if (!mode) return { error: '"mode" is required.' };

  try {
    const team = getFrameworkTeam(teamId);
    // @ts-expect-error simple proxy
    return await team.setMode(mode);
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

async function handleScout(
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const teamId = args.team_id as string;
  if (!teamId) return { error: '"team_id" is required.' };
  if (!args.todo_content) return { error: 'todo_content is required for scout' };

  try {
    const team = getFrameworkTeam(teamId);
    const tasks = await team.scoutFromTodos(args.todo_content as string);
    return { tasks };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

async function handleSuggest(
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const teamId = args.team_id as string;
  const title = args.title as string;

  if (!teamId) return { error: '"team_id" is required.' };
  if (!title) return { error: '"title" is required.' };

  try {
    const team = getFrameworkTeam(teamId);
    return await team.suggest(title, {
      description: args.description as string | undefined,
      category: args.category as string | undefined,
      evidence: args.evidence as string | undefined,
    }) as unknown as Record<string, unknown>;
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

async function handleSuggestVote(
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const teamId = args.team_id as string;
  const sugId = args.suggestion_id as string;
  const value = args.value as number;

  if (!teamId) return { error: '"team_id" is required.' };
  if (!sugId) return { error: '"suggestion_id" is required.' };
  if (value !== 1 && value !== -1) return { error: '"value" must be 1 or -1.' };

  try {
    const team = getFrameworkTeam(teamId);
    return await team.vote(sugId, value as 1 | -1, args.reason as string | undefined) as unknown as Record<string, unknown>;
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

async function handleSuggestList(
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const teamId = args.team_id as string;
  if (!teamId) return { error: '"team_id" is required.' };

  try {
    const team = getFrameworkTeam(teamId);
    // @ts-expect-error simple proxy
    return await team.suggestions(args.status as any);
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

async function handleHeartbeat(
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const teamId = args.team_id as string;
  if (!teamId) return { error: '"team_id" is required.' };

  const agentName = (args.agent_name as string) || 'mcp-agent';
  const ideType = (args.ide_type as string) || 'mcp';
  const url = getServerUrl();
  const key = getApiKey();

  try {
    const res = await fetch(`${url}/api/holomesh/team/${teamId}/presence`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ agentName, ide_type: ideType, status: 'active' }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { error: `Heartbeat failed: ${res.status}` };
    return await res.json() as Record<string, unknown>;
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

async function handleKnowledgeRead(
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const teamId = args.team_id as string;
  if (!teamId) return { error: '"team_id" is required.' };

  const url = getServerUrl();
  const key = getApiKey();

  try {
    const res = await fetch(`${url}/api/holomesh/team/${teamId}/knowledge`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { error: `Knowledge read failed: ${res.status}` };
    const data = await res.json() as Record<string, unknown>;
    const entries = (data.entries as Array<Record<string, unknown>>) || [];
    const limit = (args.limit as number) || 20;
    return { entries: entries.slice(0, limit), total: entries.length };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
