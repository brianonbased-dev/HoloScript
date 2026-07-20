/**
 * HoloMesh Team Board MCP Tools (In-Memory Direct)
 *
 * MCP tool definitions + handlers that operate directly on in-memory
 * team stores. Avoids HTTP roundtrip to self (which fails when the
 * key registry doesn't contain the current API key).
 *
 * Tools:
 * - holomesh_board_list, holomesh_board_add, holomesh_board_claim,
 *   holomesh_board_complete, holomesh_board_done_log, holomesh_slot_assign, holomesh_mode_set,
 *   holomesh_scout, holomesh_suggest, holomesh_suggest_vote, holomesh_suggest_list
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  addTasksToBoard,
  claimTask,
  completeTask,
  appendFollowUpCommit,
  createSuggestion,
  voteSuggestion,
  evaluateBoardClaimGate,
  maintainBoard,
  type TeamTask,
  type DoneLogEntry,
  type SuggestionCategory,
} from '@holoscript/framework';
import { teamStore, teamPresenceStore, persistTeamDurable, reloadTeam } from './state';
import { broadcastToTeam } from './team-room';
import { recordTeamModeChange } from './mode-provenance';
import { normalizePresenceSurface, getPresenceTtlMs, pruneStalePresence } from './utils';

// ── Helper: get team from in-memory store ──

function getTeam(teamId: string) {
  const team = teamStore.get(teamId);
  if (!team)
    throw new Error(
      `Team not found: ${teamId} — verify HOLOMESH_TEAM_ID matches a registered team (the team store is in-memory; a restarted server has no teams until they re-register).`
    );
  if (!team.taskBoard) team.taskBoard = [];
  if (!team.doneLog) team.doneLog = [];
  return team;
}

function getClaimTtlMs(): number {
  const hours = Number(process.env.HOLOMESH_CLAIM_TTL_HOURS ?? 24);
  return Number.isFinite(hours) && hours > 0 ? hours * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
}

async function runBoardMaintenance(teamId: string, board: TeamTask[]) {
  const maintenance = maintainBoard(board, { claimTtlMs: getClaimTtlMs() });
  if (maintenance.changed) await persistTeamDurable(teamId);
  return maintenance;
}

// ── MCP Tool Definitions ──

export const boardTools: Tool[] = [
  {
    name: 'holomesh_board_list',
    description:
      'List tasks on a team board. Returns open, claimed, blocked tasks plus recent done log and slot roles. Pass tags to filter to tasks matching those capability tags. Pass status to scope to one bucket, and limit/offset to page a large board instead of returning everything (omit limit for the full board, today\'s default behavior).',
    inputSchema: {
      type: 'object',
      properties: {
        team_id: {
          type: 'string',
          description: 'The team ID to list the board for',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Optional capability tags to filter by. Returns only tasks whose tags array contains ALL specified tags (intersection). Useful for agent-scoped board views.',
        },
        status: {
          type: 'string',
          enum: ['open', 'claimed', 'blocked'],
          description:
            'Optional — scope the response to a single status bucket instead of all three. Other buckets are omitted from the response entirely (not just emptied).',
        },
        limit: {
          type: 'number',
          description:
            'Optional — maximum tasks to return per status bucket (each of open/claimed/blocked is capped independently, max 500). Omit for unbounded (current default: returns every matching task, which can be large on a busy board).',
        },
        offset: {
          type: 'number',
          description:
            'Optional — number of tasks to skip per bucket before applying limit (default 0). Only meaningful when limit is set.',
        },
      },
      required: ['team_id'],
    },
  },
  {
    name: 'holomesh_board_add',
    description:
      'Add one or more tasks to a team board. Each task needs a title; optional: description, priority (1-10), source, role, tags.',
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
                description:
                  'Task description (max 2000 chars; longer values are truncated and surface a description_truncated warning)',
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
              tags: {
                type: 'array',
                items: { type: 'string' },
                description:
                  'Capability tags for agent routing. Agents score +2 per tag that matches their brain capability_tags (vs +1 for text-match only). Use tags from agent brains: e.g. ["edge","local-inference","cael-trace","holoscript-native","hardware-receipt"] for Jetson tasks.',
              },
              required_tags: {
                type: 'array',
                items: { type: 'string' },
                description:
                  'Hard capability gate: ONLY agents whose heartbeat presence includes ALL of these tags can claim this task. The claim endpoint returns 403 capability_mismatch for agents missing any tag. Use for tasks that must run on specific hardware (e.g. ["edge","local-inference"] for Jetson-only tasks).',
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
    name: 'holomesh_board_done_log',
    description:
      'Read the completed task done-log for a team board, newest-first, with limit/offset pagination. Returns compact entries for peer verification.',
    inputSchema: {
      type: 'object',
      properties: {
        team_id: {
          type: 'string',
          description: 'The team ID to read done-log entries for',
        },
        limit: {
          type: 'number',
          description: 'Maximum entries to return (default 30, max 200)',
        },
        offset: {
          type: 'number',
          description: 'Number of newest entries to skip before returning results (default 0)',
        },
      },
      required: ['team_id'],
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
        agent_id: {
          type: 'string',
          description:
            'Provisioned agent ID for attribution (e.g. "claude1", "agent_XXXX_YYYY"). Defaults to "mcp-agent" when omitted.',
        },
        agent_name: {
          type: 'string',
          description: 'Display name for the claiming agent. Defaults to agent_id when omitted.',
        },
      },
      required: ['team_id', 'task_id'],
    },
  },
  {
    name: 'holomesh_board_complete',
    description:
      'Mark a claimed task as done. Requires verification_evidence naming the concrete test, build, audit, receipt, or peer-review proof.',
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
        verification_evidence: {
          type: 'string',
          description:
            'Concrete evidence required before closure: test/build output, audit diff, receipt, or peer review handle.',
        },
        agent_id: {
          type: 'string',
          description:
            'Provisioned agent ID for attribution. Defaults to "mcp-agent" when omitted.',
        },
        agent_name: {
          type: 'string',
          description: 'Display name for the completing agent. Defaults to agent_id when omitted.',
        },
      },
      required: ['team_id', 'task_id', 'verification_evidence'],
    },
  },
  {
    name: 'holomesh_board_append_commit',
    description:
      'Append a follow-up commit to an existing done-log entry. Use when a completed task receives additional commits post-closure.',
    inputSchema: {
      type: 'object',
      properties: {
        team_id: {
          type: 'string',
          description: 'The team ID',
        },
        task_id: {
          type: 'string',
          description: 'The task ID whose done-log entry should receive the commit',
        },
        commit: {
          type: 'string',
          description: 'Git commit hash to append',
        },
        summary: {
          type: 'string',
          description: 'Optional summary of what the follow-up commit contains',
        },
        agent_id: {
          type: 'string',
          description:
            'Provisioned agent ID for attribution. Defaults to "mcp-agent" when omitted.',
        },
      },
      required: ['team_id', 'task_id', 'commit'],
    },
  },
  {
    name: 'holomesh_slot_assign',
    description:
      "Set slot roles for a team. Provide an array of roles matching the team's max_slots count. Valid roles: coder, tester, researcher, reviewer, flex.",
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
    description:
      'Set the team mode/preset. Changes the objective, rules, and task sources. Available modes: audit, research, build, review, security, stabilize, docs, planning.',
    inputSchema: {
      type: 'object',
      properties: {
        team_id: {
          type: 'string',
          description: 'The team ID',
        },
        mode: {
          type: 'string',
          enum: [
            'audit',
            'research',
            'build',
            'review',
            'security',
            'stabilize',
            'docs',
            'planning',
          ],
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
          description:
            'Grep output of TODO/FIXME markers (path:line: // TODO: message format). Each line becomes a task.',
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
        agent_id: {
          type: 'string',
          description:
            'Provisioned agent ID for attribution (e.g. "claude1", "agent_XXXX_YYYY"). Defaults to "mcp-agent" when omitted.',
        },
        agent_name: {
          type: 'string',
          description: 'Display name for the proposing agent. Defaults to agent_id when omitted.',
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
        agent_id: {
          type: 'string',
          description:
            'Provisioned agent ID for attribution (e.g. "claude1", "agent_XXXX_YYYY"). Defaults to "mcp-agent" when omitted.',
        },
        agent_name: {
          type: 'string',
          description: 'Display name for the voting agent. Defaults to agent_id when omitted.',
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
        agent_id: {
          type: 'string',
          description:
            'Stable agent identifier for this presence slot. Use a provisioned agent ID (e.g. "claude1", "agent_XXXX_YYYY") so board mutations are attributed to a persistent identity rather than the ephemeral "mcp-agent" default.',
        },
        agent_name: {
          type: 'string',
          description: 'Display name of the calling agent',
        },
        ide_type: {
          type: 'string',
          description: 'IDE type (vscode, claude-code, cursor, gemini)',
        },
        surface: {
          type: 'string',
          description: 'Optional device surface for aliveness policy (mobile uses a shorter TTL)',
        },
        capability_tags: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Capability tags this agent supports (e.g. ["edge","local-inference"]). Stored in presence and enforced against task required_tags on claim.',
        },
      },
      required: ['team_id'],
    },
  },
  {
    name: 'holomesh_presence',
    description:
      'List all live agents currently on the team. Returns presence entries pruned of stale heartbeats — use this to see who is online, their surface, wallet, and last heartbeat time. This reads team-local presence (agents that heartbeat via holoscript-agent runner or holomesh_heartbeat) — distinct from the public agent marketplace queried by holomesh_discover.',
    inputSchema: {
      type: 'object',
      properties: {
        team_id: {
          type: 'string',
          description: 'The team ID',
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
    case 'holomesh_board_done_log':
      return handleBoardDoneLog(args);
    case 'holomesh_board_claim':
      return handleBoardClaim(args);
    case 'holomesh_board_complete':
      return handleBoardComplete(args);
    case 'holomesh_board_append_commit':
      return handleBoardAppendCommit(args);
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
    case 'holomesh_presence':
      return handlePresence(args);
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
    await reloadTeam(teamId);
    const team = getTeam(teamId);
    const board = team.taskBoard || [];
    const maintenance = await runBoardMaintenance(teamId, board);
    const filterTags = Array.isArray(args.tags) ? (args.tags as string[]).map((t) => t.toLowerCase()) : null;
    const tagMatch = (t: TeamTask) => {
      if (!filterTags || filterTags.length === 0) return true;
      const taskTags = (t.tags ?? []).map((x) => x.toLowerCase());
      const text = `${t.title} ${t.description}`.toLowerCase();
      return filterTags.every((ft) => taskTags.includes(ft) || text.includes(ft));
    };
    const statusFilter = typeof args.status === 'string' ? args.status : null;
    const wantsBucket = (s: 'open' | 'claimed' | 'blocked') => !statusFilter || statusFilter === s;
    const openAll = wantsBucket('open') ? board.filter((t: TeamTask) => t.status === 'open' && tagMatch(t)) : [];
    const claimedAll = wantsBucket('claimed') ? board.filter((t: TeamTask) => t.status === 'claimed' && tagMatch(t)) : [];
    const blockedAll = wantsBucket('blocked') ? board.filter((t: TeamTask) => t.status === 'blocked' && tagMatch(t)) : [];

    // limit/offset are opt-in: omitting them preserves today's behavior (return every
    // matching task). Passing limit pages each bucket independently — the fix for
    // holomesh_board_list previously having no bound at all on a busy board (W.911).
    const hasPaging = args.limit !== undefined && args.limit !== null;
    const limit = hasPaging ? clampInteger(args.limit, 500, 1, 500) : null;
    const offset = clampInteger(args.offset, 0, 0, Number.MAX_SAFE_INTEGER);
    const page = <T,>(all: T[]) => {
      if (!hasPaging) return { items: all, total: all.length, hasMore: false };
      const items = all.slice(offset, offset + (limit as number));
      return { items, total: all.length, hasMore: offset + items.length < all.length };
    };
    const openPage = page(openAll);
    const claimedPage = page(claimedAll);
    const blockedPage = page(blockedAll);

    return {
      success: true,
      board: { open: openPage.items, claimed: claimedPage.items, blocked: blockedPage.items },
      board_totals: { open: openPage.total, claimed: claimedPage.total, blocked: blockedPage.total },
      done_count: team.doneLog?.length || 0,
      mode: team.mode || 'general',
      objective: team.roomConfig?.objective || '',
      board_maintenance: {
        priorityBackfilled: maintenance.priorityBackfilled.map((task) => task.id),
        ttlReleased: maintenance.ttlReleased.map((task) => task.id),
        ttlClockStarted: maintenance.ttlClockStarted.map((task) => task.id),
        blockedEscalated: maintenance.blockedLifecycle.escalated.map((task) => task.id),
        blockedReopened: maintenance.blockedLifecycle.reopened.map((task) => task.id),
      },
      ...(filterTags ? { filtered_by_tags: filterTags } : {}),
      ...(statusFilter ? { filtered_by_status: statusFilter } : {}),
      ...(hasPaging
        ? { paging: { limit, offset, hasMore: openPage.hasMore || claimedPage.hasMore || blockedPage.hasMore } }
        : {}),
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
    const result = addTasksToBoard(
      team.taskBoard!,
      team.doneLog ?? [],
      tasks as Array<Omit<TeamTask, 'id' | 'status' | 'createdAt'>>
    );
    const warnings = result.warnings.length > 0
      ? result.warnings
      : tasks.flatMap((t) => {
          const raw = String((t as Record<string, unknown>).description || '');
          // In sync with board-ops.ts:300 cap (W.085 fix raised 1000→2000).
          if (raw.length <= 2000) return [];
          return [
            {
              title: String((t as Record<string, unknown>).title || '').slice(0, 200),
              reason: 'description_truncated' as const,
              originalLength: raw.length,
              keptLength: 2000,
            },
          ];
        });
    team.taskBoard = result.updatedBoard;
    await persistTeamDurable(teamId);

    for (const task of result.added) {
      broadcastToTeam(teamId, {
        type: 'board:added',
        agent: 'mcp-tool',
        data: { taskId: task.id, title: task.title, agent: 'mcp-tool' },
      });
    }

    return {
      success: true,
      added: result.added.length,
      tasks: result.added,
      skipped: result.skipped,
      warnings,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

async function handleBoardDoneLog(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const teamId = args.team_id as string;
  if (!teamId) return { error: '"team_id" is required.' };

  try {
    const team = getTeam(teamId);
    const log = team.doneLog || [];
    const total = log.length;
    const limit = clampInteger(args.limit, 30, 1, 200);
    const offset = clampInteger(args.offset, 0, 0, Number.MAX_SAFE_INTEGER);
    const endRank = Math.min(total, offset + limit);
    const entries: ReturnType<typeof compactDoneLogEntry>[] = [];

    for (let rank = offset; rank < endRank; rank += 1) {
      const entry = log[total - 1 - rank];
      if (entry) entries.push(compactDoneLogEntry(entry));
    }

    return {
      success: true,
      teamId,
      count: total,
      returned: entries.length,
      offset,
      limit,
      hasMore: endRank < total,
      entries,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function compactDoneLogEntry(entry: DoneLogEntry) {
  return {
    id: entry.taskId,
    taskId: entry.taskId,
    title: entry.title,
    completedAt: entry.timestamp,
    completedBy: entry.completedBy,
    completedByTag: entry.completedByTag,
    commitHash: entry.commitHash,
    verification_evidence: entry.verificationEvidence,
    verificationEvidence: entry.verificationEvidence,
    summary: entry.summary,
  };
}

async function handleBoardClaim(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const teamId = args.team_id as string;
  const taskId = args.task_id as string;
  const effectiveAgentId =
    typeof args.agent_id === 'string' && args.agent_id.trim() ? args.agent_id.trim() : 'mcp-agent';
  const effectiveAgentName =
    typeof args.agent_name === 'string' && args.agent_name.trim()
      ? args.agent_name.trim()
      : effectiveAgentId;

  if (!teamId) return { error: '"team_id" is required.' };
  if (!taskId) return { error: '"task_id" is required.' };

  try {
    await reloadTeam(teamId);
    const team = getTeam(teamId);

    pruneStalePresence(teamId);
    const agentPresence = teamPresenceStore.get(teamId)?.get(effectiveAgentId);
    const claimTtlHours = Number(process.env.HOLOMESH_CLAIM_TTL_HOURS ?? 24);
    const claimCap = Number(process.env.HOLOMESH_CLAIM_CAP ?? 5);
    const gate = evaluateBoardClaimGate(team.taskBoard!, {
      taskId,
      agentId: effectiveAgentId,
      isOwner: effectiveAgentId === team.ownerId,
      hasFreshHeartbeat: Boolean(agentPresence),
      capabilityTags: agentPresence?.capabilityTags ?? [],
      claimCap,
      claimTtlMs: claimTtlHours * 3600 * 1000,
    });
    if (gate.ttlReleased.length > 0 || gate.ttlClockStarted.length > 0) {
      await persistTeamDurable(teamId);
    }
    if (!gate.ok) {
      return {
        error: gate.error || 'Claim failed',
        code: gate.code,
        active_claims: gate.active_claims,
        claim_cap: gate.claim_cap,
        required_tags: gate.required_tags,
        missing_tags: gate.missing_tags,
        agent_capability_tags: gate.agent_capability_tags,
      };
    }

    const result = claimTask(team.taskBoard!, taskId, effectiveAgentId, effectiveAgentName);
    if (!result.success) return { error: result.error || 'Claim failed' };
    await persistTeamDurable(teamId);

    broadcastToTeam(teamId, {
      type: 'board:claimed',
      agent: effectiveAgentName,
      data: { taskId, title: result.task?.title || taskId, agent: effectiveAgentId },
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
  const verificationEvidence =
    typeof args.verification_evidence === 'string'
      ? args.verification_evidence.trim().slice(0, 2000)
      : '';
  const effectiveAgentId =
    typeof args.agent_id === 'string' && args.agent_id.trim() ? args.agent_id.trim() : 'mcp-agent';
  const effectiveAgentName =
    typeof args.agent_name === 'string' && args.agent_name.trim()
      ? args.agent_name.trim()
      : effectiveAgentId;

  if (!teamId) return { error: '"team_id" is required.' };
  if (!taskId) return { error: '"task_id" is required.' };
  if (!verificationEvidence) return { error: '"verification_evidence" is required.' };

  try {
    await reloadTeam(teamId);
    const team = getTeam(teamId);
    await runBoardMaintenance(teamId, team.taskBoard!);
    const wrap = completeTask(team.taskBoard!, taskId, effectiveAgentId, {
      commit,
      summary,
      verificationEvidence,
    });
    if (!wrap.result.success) return { error: wrap.result.error || 'Complete failed' };
    team.taskBoard = wrap.updatedBoard;
    if (wrap.result.doneEntry) {
      if (!team.doneLog) team.doneLog = [];
      team.doneLog.push(wrap.result.doneEntry);
    }
    await persistTeamDurable(teamId);

    broadcastToTeam(teamId, {
      type: 'board:completed',
      agent: effectiveAgentName,
      data: { taskId, title: wrap.result.task?.title || taskId, agent: effectiveAgentId },
    });

    return { success: true, task: wrap.result.task };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

async function handleBoardAppendCommit(
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const teamId = args.team_id as string;
  const taskId = args.task_id as string;
  const commit = (args.commit as string | undefined)?.trim();
  const summary = args.summary as string | undefined;
  const effectiveAgentId =
    typeof args.agent_id === 'string' && args.agent_id.trim() ? args.agent_id.trim() : 'mcp-agent';

  if (!teamId) return { error: '"team_id" is required.' };
  if (!taskId) return { error: '"task_id" is required.' };
  if (!commit) return { error: '"commit" is required.' };

  try {
    const team = getTeam(teamId);
    const wrap = appendFollowUpCommit(team.doneLog || [], taskId, commit, summary);
    if (!wrap.success) {
      return { error: wrap.error || 'Append failed' };
    }
    await persistTeamDurable(teamId);

    broadcastToTeam(teamId, {
      type: 'board:commit_appended',
      agent: effectiveAgentId,
      data: { taskId, title: wrap.entry?.title || taskId, commit, agent: effectiveAgentId },
    });

    return { success: true, task: { id: taskId, title: wrap.entry?.title } };
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
    if (!team.roomConfig) team.roomConfig = {};
    team.roomConfig.slotRoles = roles;
    await persistTeamDurable(teamId);
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
    const { changed } = await recordTeamModeChange({
      teamId,
      team,
      newMode: mode,
      source: 'mcp_tool',
      actor: { id: 'mcp-tool', name: 'mcp-tool' },
    });
    const objective = (team.roomConfig as { objective?: string } | undefined)?.objective || '';
    if (!changed) {
      return { success: true, mode: team.mode || mode, objective, unchanged: true };
    }
    return { success: true, mode, objective };
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
    // Require comment-anchored grep format: file:linenum: [// | # | *] (TODO|FIXME|HACK|XXX): message
    // Prevents self-derivation from string literals and non-comment occurrences.
    const SCOUT_TODO_RE = /^.+?:\d+:\s*(?:\/\/\s*|#\s*|\*\s*)?(TODO|FIXME|HACK|XXX)\s*:?\s*(.+)$/i;
    // Skip the scanner's own implementation file and test/spec files to prevent self-derivation.
    const SCOUT_SKIP_RE = /\bboard-tools\.ts[:#]|(?:__tests__[/\\]|\.test\.ts[:#]|\.spec\.ts[:#])/;
    const tasksBody = todoContent.split('\n').flatMap((l) => {
      if (SCOUT_SKIP_RE.test(l)) return [];
      const m = SCOUT_TODO_RE.exec(l);
      if (!m) return [];
      const [, kind, detail] = m;
      return [
        {
          title: `${kind.toUpperCase()}: ${detail.trim().slice(0, 180)}`,
          description: `Generated from source grep:\n\n${l}`,
          source: 'scout:todo-scan',
          priority: /^FIXME$/i.test(kind) ? 2 : 1,
        },
      ];
    });

    const maxTasks = (args.max_tasks as number) || 50;
    const scopedTasks = tasksBody.slice(0, maxTasks) as Array<Omit<TeamTask, 'id' | 'status' | 'createdAt'>>;
    const result = addTasksToBoard(team.taskBoard!, team.doneLog ?? [], scopedTasks);
    const warnings = result.warnings.length > 0
      ? result.warnings
      : scopedTasks.flatMap((t: { title?: string; description?: string }) => {
          const raw = String(t.description || '');
          // In sync with board-ops.ts:300 cap (W.085 fix raised 1000→2000).
          if (raw.length <= 2000) return [];
          return [
            {
              title: String(t.title || '').slice(0, 200),
              reason: 'description_truncated' as const,
              originalLength: raw.length,
              keptLength: 2000,
            },
          ];
        });
    team.taskBoard = result.updatedBoard;
    await persistTeamDurable(teamId);

    return {
      success: true,
      tasks_added: result.added.length,
      tasks: result.added,
      skipped: result.skipped,
      warnings,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

async function handleSuggest(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const teamId = args.team_id as string;
  const title = args.title as string;
  const effectiveAgentId =
    typeof args.agent_id === 'string' && args.agent_id.trim() ? args.agent_id.trim() : 'mcp-agent';
  const effectiveAgentName =
    typeof args.agent_name === 'string' && args.agent_name.trim()
      ? args.agent_name.trim()
      : effectiveAgentId;

  if (!teamId) return { error: '"team_id" is required.' };
  if (!title) return { error: '"title" is required.' };

  try {
    const team = getTeam(teamId);
    if (!team.suggestions) team.suggestions = [];
    const result = createSuggestion(team.suggestions, {
      title,
      description: args.description as string | undefined,
      category: args.category as SuggestionCategory | undefined,
      evidence: args.evidence as string | undefined,
      proposedBy: effectiveAgentId,
      proposedByName: effectiveAgentName,
    });
    if (!result.success) {
      return { error: result.error || 'suggestion create failed' };
    }
    await persistTeamDurable(teamId);
    return { success: true, suggestion: result.suggestion };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

async function handleSuggestVote(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const teamId = args.team_id as string;
  const sugId = args.suggestion_id as string;
  const value = args.value as number;
  const effectiveAgentId =
    typeof args.agent_id === 'string' && args.agent_id.trim() ? args.agent_id.trim() : 'mcp-agent';
  const effectiveAgentName =
    typeof args.agent_name === 'string' && args.agent_name.trim()
      ? args.agent_name.trim()
      : effectiveAgentId;

  if (!teamId) return { error: '"team_id" is required.' };
  if (!sugId) return { error: '"suggestion_id" is required.' };
  if (value !== 1 && value !== -1) return { error: '"value" must be 1 or -1.' };

  try {
    const team = getTeam(teamId);
    if (!team.suggestions) team.suggestions = [];
    const result = voteSuggestion(
      team.suggestions,
      team.taskBoard!,
      sugId,
      effectiveAgentId,
      effectiveAgentName,
      value as 1 | -1,
      team.maxSlots ?? 20,
      args.reason as string | undefined
    );
    if (!result.success) {
      return { error: result.error || 'vote failed' };
    }
    await persistTeamDurable(teamId);
    return { ...result, success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

async function handleSuggestList(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const teamId = args.team_id as string;
  if (!teamId) return { error: '"team_id" is required.' };

  try {
    const team = getTeam(teamId);
    const suggestions = team.suggestions ?? [];
    const status = args.status as string | undefined;
    const filtered = status ? suggestions.filter((s) => s.status === status) : suggestions;
    return {
      success: true,
      open: suggestions.filter((s) => s.status === 'open').length,
      promoted: suggestions.filter((s) => s.status === 'promoted').length,
      dismissed: suggestions.filter((s) => s.status === 'dismissed').length,
      suggestions: filtered,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

async function handleHeartbeat(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const teamId = args.team_id as string;
  if (!teamId) return { error: '"team_id" is required.' };

  const agentId =
    typeof args.agent_id === 'string' && args.agent_id.trim()
      ? args.agent_id.trim()
      : 'mcp-agent';
  const agentName =
    typeof args.agent_name === 'string' && args.agent_name.trim()
      ? args.agent_name.trim()
      : agentId;
  const ideType = (args.ide_type as string) || 'mcp';
  const surface = normalizePresenceSurface(args.surface);

  try {
    getTeam(teamId); // ensure team exists
    let presenceMap = teamPresenceStore.get(teamId);
    if (!presenceMap) {
      presenceMap = new Map();
      teamPresenceStore.set(teamId, presenceMap);
    }

    const lastHeartbeat = new Date().toISOString();
    const ttlMs = getPresenceTtlMs({ surface });
    const capabilityTags = Array.isArray(args.capability_tags)
      ? (args.capability_tags as string[])
      : undefined;
    const entry = {
      agentId,
      agentName,
      ideType,
      status: 'active' as const,
      lastHeartbeat,
      surface,
      expiresAt: new Date(Date.parse(lastHeartbeat) + ttlMs).toISOString(),
      ttlMs,
      capabilityTags,
    };
    presenceMap.set(agentId, entry);

    pruneStalePresence(teamId);
    const online = Array.from(presenceMap.values());
    return { success: true, online, presence: entry, online_count: online.length };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

async function handlePresence(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const teamId = args.team_id as string;
  if (!teamId) return { error: '"team_id" is required.' };
  try {
    getTeam(teamId);
    pruneStalePresence(teamId);
    const presenceMap = teamPresenceStore.get(teamId);
    const online = presenceMap ? Array.from(presenceMap.values()) : [];
    return { success: true, online, online_count: online.length };
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
    const entries = team.knowledge ?? [];
    const limit = (args.limit as number) || 20;
    return { entries: entries.slice(0, limit), total: entries.length };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
