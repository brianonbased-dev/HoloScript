/**
 * HoloMesh Team Board MCP Tools (In-Memory Direct)
 *
 * MCP tool definitions + handlers that operate directly on in-memory
 * team stores. Avoids HTTP roundtrip to self (which fails when the
 * key registry doesn't contain the current API key).
 *
 * Tools:
 * - holomesh_board_list, holomesh_board_add, holomesh_board_claim,
 *   holomesh_board_complete, holomesh_slot_assign, holomesh_mode_set,
 *   holomesh_scout, holomesh_suggest, holomesh_suggest_vote, holomesh_suggest_list
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  addTasksToBoard,
  claimTask,
  completeTask,
  ROOM_PRESETS,
  createSuggestion,
  voteSuggestion,
  type TeamTask,
} from '@holoscript/framework';
import {
  teamStore,
  teamPresenceStore,
  persistTeamStore,
} from './state';
import { broadcastToTeam } from './team-room';

// ── Helper: get team from in-memory store ──

function getTeam(teamId: string) {
  const team = teamStore.get(teamId);
  if (!team) throw new Error(`Team not found: ${teamId}`);
  if (!team.taskBoard) team.taskBoard = [];
  if (!team.doneLog) team.doneLog = [];
  return team;
}

// ── MCP Tool Definitions ──

export const boardTools: Tool[] = [
  {
    name: 'holomesh_board_list',
    description: 'List all tasks on a team board. Returns open, claimed, blocked tasks plus recent done log and slot roles.',
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
    description: 'Add one or more tasks to a team board. Each task needs a title; optional: description, priority (1-10), source, role.',
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
    description: 'Claim an open task on a team board. The task must be in "open" status. The calling agent becomes the assignee.',
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
    description: 'Mark a claimed task as done. Optionally include a commit hash and summary as proof of work.',
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
    description: "Set slot roles for a team. Provide an array of roles matching the team's max_slots count. Valid roles: coder, tester, researcher, reviewer, flex.",
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
          description: 'Array of roles for each slot. Length must equal team max_slots.',
        },
      },
      required: ['team_id', 'roles'],
    },
  },
  {
    name: 'holomesh_mode_set',
    description: 'Set the team mode/preset. Changes the objective, rules, and task sources. Available modes: audit, research, build, review.',
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
    description: 'Trigger an on-demand scout scan to populate the board when it is empty. Pass grep TODO/FIXME output as todo_content, or doc file contents as sources. Any agent can call this — it does NOT consume a team slot.',
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
    description: 'Propose an improvement to the team. Other agents can vote on it. If enough agents upvote, it auto-promotes to a real board task. Categories: process, tooling, architecture, testing, docs, performance, other.',
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
    description: 'Vote on a team suggestion. +1 to support, -1 to oppose. Suggestions auto-promote to board tasks when they reach majority support, or auto-dismiss at majority opposition.',
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
    description: 'List all suggestions for a team, sorted by score. Optionally filter by status: open, promoted, dismissed.',
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
    description: 'Send a presence heartbeat to keep the agent alive on the team. Call every 60 seconds during active work. Missing 2 heartbeats marks the agent as offline and releases its slot.',
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
    description: 'Read team knowledge entries (Wisdom/Pattern/Gotcha). Call at session start to learn what other agents discovered. Returns the most recent entries.',
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

// ── Individual Handlers (in-memory, no HTTP roundtrip) ──

async function handleBoardList(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const teamId = args.team_id as string;
  if (!teamId) return { error: '"team_id" is required.' };
  try {
    const team = getTeam(teamId);
    const board = team.taskBoard || [];
    const open = board.filter((t: TeamTask) => t.status === 'open');
    const claimed = board.filter((t: TeamTask) => t.status === 'claimed' || t.status === 'in-progress');
    const blocked = board.filter((t: TeamTask) => t.status === 'blocked');
    return {
      success: true,
      board: { open, claimed, blocked },
      done_count: team.doneLog?.length || 0,
      mode: team.mode || 'general',
      objective: team.roomConfig?.objective || '',
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

async function handleBoardAdd(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const teamId = args.team_id as string;
  const tasks = args.tasks as Array<Record<string, unknown>> | undefined;

  if (!teamId) return { error: '"team_id" is required.' };
  if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
    return { error: '"tasks" must be a non-empty array of task objects.' };
  }

  try {
    const team = getTeam(teamId);
    const result = addTasksToBoard(team.taskBoard!, (team.doneLog || []) as any, tasks as any);
    team.taskBoard = result.updatedBoard;
    persistTeamStore();

    for (const task of result.added) {
      broadcastToTeam(teamId, {
        type: 'board:added' as any,
        agent: 'mcp-tool',
        data: { taskId: task.id, title: task.title, agent: 'mcp-tool' },
      });
    }

    return { success: true, added: result.added.length, tasks: result.added };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

async function handleBoardClaim(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const teamId = args.team_id as string;
  const taskId = args.task_id as string;

  if (!teamId) return { error: '"team_id" is required.' };
  if (!taskId) return { error: '"task_id" is required.' };

  try {
    const team = getTeam(teamId);
    const result = claimTask(team.taskBoard!, taskId, 'mcp-agent', 'mcp-agent');
    if (!result.success) return { error: result.error || 'Claim failed' };
    persistTeamStore();

    broadcastToTeam(teamId, {
      type: 'board:claimed' as any,
      agent: 'mcp-agent',
      data: { taskId, title: result.task?.title || taskId, agent: 'mcp-agent' },
    });

    return { success: true, task: result.task };
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
    const team = getTeam(teamId);
    const wrap = completeTask(team.taskBoard!, taskId, 'mcp-agent', { summary });
    if (!wrap.result.success) return { error: wrap.result.error || 'Complete failed' };
    team.taskBoard = wrap.updatedBoard;
    if (wrap.result.doneEntry) {
      if (commit) (wrap.result.doneEntry as any).commit = commit;
      team.doneLog!.push(wrap.result.doneEntry as any);
    }
    persistTeamStore();

    broadcastToTeam(teamId, {
      type: 'board:completed' as any,
      agent: 'mcp-agent',
      data: { taskId, title: wrap.result.task?.title || taskId, agent: 'mcp-agent' },
    });

    return { success: true, task: wrap.result.task };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

async function handleSlotAssign(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const teamId = args.team_id as string;
  const roles = args.roles as string[] | undefined;

  if (!teamId) return { error: '"team_id" is required.' };
  if (!roles || !Array.isArray(roles) || roles.length === 0) {
    return { error: '"roles" must be a non-empty array of role strings.' };
  }

  try {
    const team = getTeam(teamId);
    if (!team.roomConfig) team.roomConfig = {} as any;
    (team.roomConfig as any).slotRoles = roles;
    persistTeamStore();
    return { success: true, roles };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

async function handleModeSet(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const teamId = args.team_id as string;
  const mode = args.mode as string;

  if (!teamId) return { error: '"team_id" is required.' };
  if (!mode) return { error: '"mode" is required.' };

  try {
    const team = getTeam(teamId);
    const preset = (ROOM_PRESETS as any)[mode];
    team.mode = mode;
    if (preset?.objective) {
      if (!team.roomConfig) team.roomConfig = {} as any;
      (team.roomConfig as any).objective = preset.objective;
    }
    persistTeamStore();
    broadcastToTeam(teamId, {
      type: 'mode:changed' as any,
      agent: 'mcp-tool',
      data: { mode, objective: preset?.objective || '' },
    });
    return { success: true, mode, objective: preset?.objective || '' };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

async function handleScout(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const teamId = args.team_id as string;
  if (!teamId) return { error: '"team_id" is required.' };
  if (!args.todo_content) return { error: 'todo_content is required for scout' };

  try {
    const team = getTeam(teamId);
    const todoContent = args.todo_content as string;
    const tasksBody = todoContent.split('\n')
      .filter(l => l.includes('TODO:') || l.includes('FIXME:'))
      .map(l => ({
        title: l.substring(l.indexOf(l.includes('TODO:') ? 'TODO:' : 'FIXME:')).trim(),
        description: `Generated from source grep:\n\n${l}`,
        source: 'scout:todo-scan',
        priority: l.includes('FIXME:') ? 2 : 1,
      }));

    const maxTasks = (args.max_tasks as number) || 50;
    const result = addTasksToBoard(team.taskBoard!, (team.doneLog || []) as any, tasksBody.slice(0, maxTasks) as any);
    team.taskBoard = result.updatedBoard;
    persistTeamStore();

    return { success: true, tasks_added: result.added.length, tasks: result.added };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

async function handleSuggest(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const teamId = args.team_id as string;
  const title = args.title as string;

  if (!teamId) return { error: '"team_id" is required.' };
  if (!title) return { error: '"title" is required.' };

  try {
    const team = getTeam(teamId) as any;
    if (!team.suggestions) team.suggestions = [];
    const suggestion = createSuggestion(
      team.suggestions,
      title,
      'mcp-agent',
      args.description as string | undefined,
      args.category as string | undefined,
    );
    persistTeamStore();
    return { success: true, suggestion };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

async function handleSuggestVote(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const teamId = args.team_id as string;
  const sugId = args.suggestion_id as string;
  const value = args.value as number;

  if (!teamId) return { error: '"team_id" is required.' };
  if (!sugId) return { error: '"suggestion_id" is required.' };
  if (value !== 1 && value !== -1) return { error: '"value" must be 1 or -1.' };

  try {
    const team = getTeam(teamId) as any;
    if (!team.suggestions) team.suggestions = [];
    const result = voteSuggestion(
      team.suggestions,
      sugId,
      'mcp-agent',
      value as 1 | -1,
      args.reason as string | undefined,
    );
    persistTeamStore();
    return { success: true, ...result };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

async function handleSuggestList(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const teamId = args.team_id as string;
  if (!teamId) return { error: '"team_id" is required.' };

  try {
    const team = getTeam(teamId) as any;
    const suggestions = team.suggestions || [];
    const status = args.status as string | undefined;
    const filtered = status ? suggestions.filter((s: any) => s.status === status) : suggestions;
    return {
      success: true,
      open: suggestions.filter((s: any) => s.status === 'open').length,
      promoted: suggestions.filter((s: any) => s.status === 'promoted').length,
      dismissed: suggestions.filter((s: any) => s.status === 'dismissed').length,
      suggestions: filtered,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

async function handleHeartbeat(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const teamId = args.team_id as string;
  if (!teamId) return { error: '"team_id" is required.' };

  const agentName = (args.agent_name as string) || 'mcp-agent';
  const ideType = (args.ide_type as string) || 'mcp';

  try {
    getTeam(teamId); // ensure team exists
    let presenceMap = teamPresenceStore.get(teamId);
    if (!presenceMap) {
      presenceMap = new Map();
      teamPresenceStore.set(teamId, presenceMap);
    }

    const entry = {
      agentId: 'mcp-agent',
      agentName,
      ideType,
      status: 'active' as const,
      lastHeartbeat: new Date().toISOString(),
    };
    presenceMap.set('mcp-agent', entry);

    const online = Array.from(presenceMap.values());
    return { success: true, online, presence: entry, online_count: online.length };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

async function handleKnowledgeRead(
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const teamId = args.team_id as string;
  if (!teamId) return { error: '"team_id" is required.' };

  try {
    const team = getTeam(teamId);
    const entries = (team as any).knowledge || [];
    const limit = (args.limit as number) || 20;
    return { entries: entries.slice(0, limit), total: entries.length };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
