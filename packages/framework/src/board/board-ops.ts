/**
 * Board Operations — Pure state machine logic for task and suggestion lifecycle.
 *
 * Absorbed from mcp-server/src/holomesh/http-routes.ts.
 * These are pure functions that mutate board/suggestion arrays.
 * The HTTP layer calls these and handles persistence + responses.
 */

import type { TeamTask, DoneLogEntry, TeamSuggestion, SuggestionCategory, SlotRole } from './board-types';
import { normalizeTitle, generateTaskId, generateSuggestionId } from './board-types';

// ── Task Operations ──

export interface ClaimResult {
  success: boolean;
  error?: string;
  task?: TeamTask;
}

export interface DoneResult {
  success: boolean;
  error?: string;
  task?: TeamTask;
  doneEntry?: DoneLogEntry;
}

export interface TaskActionResult {
  success: boolean;
  error?: string;
  task?: TeamTask;
  doneEntry?: DoneLogEntry;
}

/** Claim an open task. Returns error if task isn't open. */
export function claimTask(
  board: TeamTask[],
  taskId: string,
  claimerId: string,
  claimerName: string
): TaskActionResult {
  const task = board.find((t) => t.id === taskId);
  if (!task) return { success: false, error: 'Task not found' };
  if (task.status !== 'open') return { success: false, error: `Task is ${task.status}, not open` };

  task.status = 'claimed';
  task.claimedBy = claimerId;
  task.claimedByName = claimerName;
  return { success: true, task };
}

/** Mark a task as done. Removes from board, returns done log entry. */
export function completeTask(
  board: TeamTask[],
  taskId: string,
  completedBy: string,
  opts: { commit?: string; summary?: string } = {}
): { result: TaskActionResult; updatedBoard: TeamTask[] } {
  const task = board.find((t) => t.id === taskId);
  if (!task) return { result: { success: false, error: 'Task not found' }, updatedBoard: board };

  task.status = 'done';
  task.completedBy = completedBy;
  task.commitHash = opts.commit;
  task.completedAt = new Date().toISOString();

  const doneEntry: DoneLogEntry = {
    taskId: task.id,
    title: task.title,
    completedBy,
    commitHash: task.commitHash,
    timestamp: task.completedAt,
    summary: opts.summary || task.title,
  };

  const updatedBoard = board.filter((t) => t.id !== taskId);
  return { result: { success: true, task, doneEntry }, updatedBoard };
}

/** Block a task. */
export function blockTask(board: TeamTask[], taskId: string): TaskActionResult {
  const task = board.find((t) => t.id === taskId);
  if (!task) return { success: false, error: 'Task not found' };
  task.status = 'blocked';
  return { success: true, task };
}

/** Reopen a task (unclaim). */
export function reopenTask(board: TeamTask[], taskId: string): TaskActionResult {
  const task = board.find((t) => t.id === taskId);
  if (!task) return { success: false, error: 'Task not found' };
  task.status = 'open';
  task.claimedBy = undefined;
  task.claimedByName = undefined;
  return { success: true, task };
}

/** Delegate a task from a source board to a target board. */
export function delegateTask(
  sourceBoard: TeamTask[],
  targetBoard: TeamTask[],
  taskId: string
): { result: TaskActionResult; updatedSource: TeamTask[]; updatedTarget: TeamTask[] } {
  const task = sourceBoard.find((t) => t.id === taskId);
  if (!task) return { result: { success: false, error: 'Task not found' }, updatedSource: sourceBoard, updatedTarget: targetBoard };

  const updatedSource = sourceBoard.filter((t) => t.id !== taskId);
  
  // Clone task so it's fresh for the new board (unclaimed)
  const delegatedTask: TeamTask = {
    ...task,
    status: 'open',
    claimedBy: undefined,
    claimedByName: undefined,
  };
  
  targetBoard.push(delegatedTask);
  return { result: { success: true, task: delegatedTask }, updatedSource, updatedTarget: targetBoard };
}

/** Add tasks to a board with dedup against existing + done log. */
export function addTasksToBoard(
  board: TeamTask[],
  doneLog: DoneLogEntry[],
  tasks: Array<Omit<TeamTask, 'id' | 'status' | 'createdAt'>>
): { added: TeamTask[]; updatedBoard: TeamTask[] } {
  const existingNorm = new Set([
    ...board.map((t) => normalizeTitle(t.title)),
    ...doneLog.map((d) => normalizeTitle(d.title)),
  ]);

  const added: TeamTask[] = [];
  for (const t of tasks) {
    const title = String(t.title || '').slice(0, 200);
    if (!title || existingNorm.has(normalizeTitle(title))) continue;

    const task: TeamTask = {
      id: generateTaskId(),
      title,
      description: String(t.description || '').slice(0, 1000),
      status: 'open',
      source: String(t.source || 'manual'),
      priority: t.priority || 5,
      role: t.role,
      createdAt: new Date().toISOString(),
    };
    board.push(task);
    existingNorm.add(normalizeTitle(title));
    added.push(task);
  }

  return { added, updatedBoard: board };
}

// ── Suggestion Operations ──

export interface SuggestionActionResult {
  success: boolean;
  error?: string;
  suggestion?: TeamSuggestion;
  promotedTask?: TeamTask;
}

/** Create a suggestion with dedup against existing open suggestions. */
export function createSuggestion(
  suggestions: TeamSuggestion[],
  opts: {
    title: string;
    description?: string;
    category?: SuggestionCategory;
    evidence?: string;
    proposedBy: string;
    proposedByName: string;
  }
): SuggestionActionResult {
  const title = opts.title.trim().slice(0, 200);
  if (!title) return { success: false, error: 'title is required' };

  const existingNorm = new Set(
    suggestions.filter((s) => s.status === 'open').map((s) => normalizeTitle(s.title))
  );
  if (existingNorm.has(normalizeTitle(title))) {
    return { success: false, error: 'A similar open suggestion already exists' };
  }

  const suggestion: TeamSuggestion = {
    id: generateSuggestionId(),
    title,
    description: (opts.description || '').slice(0, 2000),
    category: opts.category || 'other',
    proposedBy: opts.proposedBy,
    proposedByName: opts.proposedByName,
    votes: [],
    score: 0,
    status: 'open',
    evidence: opts.evidence?.slice(0, 1000),
    createdAt: new Date().toISOString(),
  };
  suggestions.push(suggestion);
  return { success: true, suggestion };
}

/** Vote on a suggestion. Auto-promotes at majority, auto-dismisses at negative majority. */
export function voteSuggestion(
  suggestions: TeamSuggestion[],
  board: TeamTask[],
  suggestionId: string,
  voterId: string,
  voterName: string,
  value: 1 | -1,
  maxSlots: number,
  reason?: string
): SuggestionActionResult {
  const suggestion = suggestions.find((s) => s.id === suggestionId);
  if (!suggestion) return { success: false, error: 'Suggestion not found' };
  if (suggestion.status !== 'open') return { success: false, error: `Suggestion is ${suggestion.status}, voting closed` };

  // Replace previous vote from same agent
  suggestion.votes = suggestion.votes.filter((v) => v.agentId !== voterId);
  suggestion.votes.push({
    agentId: voterId,
    agentName: voterName,
    value,
    reason,
    votedAt: new Date().toISOString(),
  });
  suggestion.score = suggestion.votes.reduce((sum, v) => sum + v.value, 0);

  let promotedTask: TeamTask | undefined;

  // Auto-promote at majority
  const promoteThreshold = Math.ceil(maxSlots / 2);
  if (suggestion.score >= promoteThreshold && suggestion.status === 'open') {
    suggestion.status = 'promoted';
    suggestion.resolvedAt = new Date().toISOString();

    promotedTask = {
      id: generateTaskId(),
      title: suggestion.title,
      description: `${suggestion.description}\n\n[Auto-promoted from suggestion by ${suggestion.proposedByName} with ${suggestion.score} votes]`,
      status: 'open',
      source: `suggestion:${suggestion.id}`,
      priority: suggestion.category === 'architecture' ? 2 : suggestion.category === 'testing' ? 3 : 4,
      createdAt: new Date().toISOString(),
    };
    board.push(promotedTask);
    suggestion.promotedTaskId = promotedTask.id;
  }

  // Auto-dismiss at negative majority
  const dismissThreshold = -Math.ceil(maxSlots / 2);
  if (suggestion.score <= dismissThreshold && suggestion.status === 'open') {
    suggestion.status = 'dismissed';
    suggestion.resolvedAt = new Date().toISOString();
  }

  return { success: true, suggestion, promotedTask };
}

/** Promote a suggestion manually. Creates a board task. */
export function promoteSuggestion(
  suggestions: TeamSuggestion[],
  board: TeamTask[],
  suggestionId: string,
  promoterName: string,
  opts: { priority?: number; role?: SlotRole } = {}
): SuggestionActionResult {
  const suggestion = suggestions.find((s) => s.id === suggestionId);
  if (!suggestion) return { success: false, error: 'Suggestion not found' };
  if (suggestion.status !== 'open') return { success: false, error: `Suggestion is already ${suggestion.status}` };

  suggestion.status = 'promoted';
  suggestion.resolvedAt = new Date().toISOString();

  const task: TeamTask = {
    id: generateTaskId(),
    title: suggestion.title,
    description: `${suggestion.description}\n\n[Promoted by ${promoterName} from suggestion by ${suggestion.proposedByName}]`,
    status: 'open',
    source: `suggestion:${suggestion.id}`,
    priority: opts.priority || 3,
    role: opts.role,
    createdAt: new Date().toISOString(),
  };
  board.push(task);
  suggestion.promotedTaskId = task.id;

  return { success: true, suggestion, promotedTask: task };
}

/** Dismiss a suggestion. */
export function dismissSuggestion(
  suggestions: TeamSuggestion[],
  suggestionId: string
): SuggestionActionResult {
  const suggestion = suggestions.find((s) => s.id === suggestionId);
  if (!suggestion) return { success: false, error: 'Suggestion not found' };
  if (suggestion.status !== 'open') return { success: false, error: `Suggestion is already ${suggestion.status}` };

  suggestion.status = 'dismissed';
  suggestion.resolvedAt = new Date().toISOString();
  return { success: true, suggestion };
}
