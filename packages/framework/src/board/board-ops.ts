/**
 * Board Operations — Pure state machine logic for task and suggestion lifecycle.
 *
 * Absorbed from mcp-server/src/holomesh/http-routes.ts.
 * These are pure functions that mutate board/suggestion arrays.
 * The HTTP layer calls these and handles persistence + responses.
 */

import type {
  TeamTask,
  TaskAction,
  DoneLogEntry,
  TeamSuggestion,
  SuggestionCategory,
  SlotRole,
} from './board-types';
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

/**
 * Claim an open task. Returns error if task isn't open or has unmet dependencies.
 *
 * `claimerTag` is the optional surface-attribution tag (e.g. `cursor-claude`,
 * `claudecode-claude`, `copilot-vscode`) supplied by the caller via the PATCH
 * body. When multiple surfaces share one HoloMesh API key (S.IDENT legacy
 * `antigravity-seed`), the tag is the only way to tell which one actually
 * claimed the task, since `claimerId`/`claimerName` come from the key's
 * registered identity (the same agent for all sharing surfaces). Passing
 * through to `task.claimedByTag` is a pure no-op if the tag is undefined —
 * backward-compatible with pre-tag callers.
 */
export function claimTask(
  board: TeamTask[],
  taskId: string,
  claimerId: string,
  claimerName: string,
  claimerTag?: string
): TaskActionResult {
  const task = board.find((t) => t.id === taskId);
  if (!task) return { success: false, error: 'Task not found' };
  if (task.status !== 'open') return { success: false, error: `Task is ${task.status}, not open` };

  // Check dependencies — all must be done (not on the board)
  if (task.dependsOn && task.dependsOn.length > 0) {
    const pending = task.dependsOn.filter((depId) =>
      board.some((t) => t.id === depId && t.status !== 'done')
    );
    if (pending.length > 0) {
      return {
        success: false,
        error: `Blocked by ${pending.length} unfinished dependencies: ${pending.join(', ')}`,
      };
    }
  }

  task.status = 'claimed';
  task.claimedBy = claimerId;
  task.claimedByName = claimerName;
  if (claimerTag) task.claimedByTag = claimerTag;
  return { success: true, task };
}

/**
 * Mark a task as done. Removes from board, returns done log entry.
 *
 * `opts.completedByTag` is the optional surface-attribution tag — see
 * `claimTask`'s `claimerTag` doc. Propagates into both the task record and
 * the emitted `DoneLogEntry` so the `/board/done` enumeration preserves
 * surface attribution. Backward-compatible when undefined.
 */
export function completeTask(
  board: TeamTask[],
  taskId: string,
  completedBy: string,
  opts: { commit?: string; summary?: string; completedByTag?: string } = {}
): {
  result: TaskActionResult & { onComplete?: TaskAction[]; unblocked?: string[] };
  updatedBoard: TeamTask[];
} {
  const task = board.find((t) => t.id === taskId);
  if (!task) return { result: { success: false, error: 'Task not found' }, updatedBoard: board };

  task.status = 'done';
  task.completedBy = completedBy;
  if (opts.completedByTag) task.completedByTag = opts.completedByTag;
  task.commitHash = opts.commit;
  task.completedAt = new Date().toISOString();

  const doneEntry: DoneLogEntry = {
    taskId: task.id,
    title: task.title,
    completedBy,
    ...(opts.completedByTag ? { completedByTag: opts.completedByTag } : {}),
    commitHash: task.commitHash,
    timestamp: task.completedAt,
    summary: opts.summary || task.title,
  };

  // Unblock dependent tasks — move from 'blocked' to 'open' if all their deps are done
  const unblocked: string[] = [];
  if (task.unblocks) {
    for (const depId of task.unblocks) {
      const dep = board.find((t) => t.id === depId);
      if (!dep) continue;
      // Check if ALL of dep's dependencies are now done (off the board or status=done)
      const allDepsMet =
        !dep.dependsOn ||
        dep.dependsOn.every(
          (id) => id === taskId || !board.some((t) => t.id === id && t.status !== 'done')
        );
      if (allDepsMet && dep.status === 'blocked') {
        dep.status = 'open';
        unblocked.push(depId);
      }
    }
  }

  const updatedBoard = board.filter((t) => t.id !== taskId);
  return {
    result: {
      success: true,
      task,
      doneEntry,
      onComplete: task.onComplete,
      unblocked: unblocked.length > 0 ? unblocked : undefined,
    },
    updatedBoard,
  };
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

/**
 * Delete a task. Removes from board, appends a tombstone entry to doneLog so
 * the history of the deletion survives (audit trail). Owner-gating is enforced
 * at the HTTP layer — this pure helper assumes the caller already passed
 * authorization and just emits the tombstone.
 *
 * `deleterTag` and `reason` are optional surface-attribution + justification
 * fields. The tombstone's `summary` is prefixed with `[deleted]` so audits
 * can distinguish a real completion from a deletion.
 */
export function deleteTask(
  board: TeamTask[],
  taskId: string,
  deleterId: string,
  deleterName: string,
  opts: { deleterTag?: string; reason?: string } = {}
): {
  result: TaskActionResult & { tombstone?: DoneLogEntry };
  updatedBoard: TeamTask[];
} {
  const task = board.find((t) => t.id === taskId);
  if (!task) {
    return { result: { success: false, error: 'Task not found' }, updatedBoard: board };
  }

  const now = new Date().toISOString();
  const reasonSuffix = opts.reason ? `: ${opts.reason}` : '';
  const tombstone: DoneLogEntry = {
    taskId: task.id,
    title: task.title,
    completedBy: deleterName,
    ...(opts.deleterTag ? { completedByTag: `deleted-by:${opts.deleterTag}` } : {}),
    commitHash: undefined,
    timestamp: now,
    summary: `[deleted] ${task.title}${reasonSuffix}`,
  };

  // Record the deletion on the task record itself so consumers reading
  // `result.task` see what happened. `completedByTag` uses the `deleted-by:`
  // prefix so UIs can distinguish deletion from a normal `done` closure.
  task.completedBy = deleterName;
  task.completedAt = now;
  if (opts.deleterTag) task.completedByTag = `deleted-by:${opts.deleterTag}`;

  const updatedBoard = board.filter((t) => t.id !== taskId);
  return {
    result: { success: true, task, tombstone },
    updatedBoard,
  };
}

/** Delegate a task from a source board to a target board. */
export function delegateTask(
  sourceBoard: TeamTask[],
  targetBoard: TeamTask[],
  taskId: string
): { result: TaskActionResult; updatedSource: TeamTask[]; updatedTarget: TeamTask[] } {
  const task = sourceBoard.find((t) => t.id === taskId);
  if (!task)
    return {
      result: { success: false, error: 'Task not found' },
      updatedSource: sourceBoard,
      updatedTarget: targetBoard,
    };

  const updatedSource = sourceBoard.filter((t) => t.id !== taskId);

  // Clone task so it's fresh for the new board (unclaimed)
  const delegatedTask: TeamTask = {
    ...task,
    status: 'open',
    claimedBy: undefined,
    claimedByName: undefined,
  };

  targetBoard.push(delegatedTask);
  return {
    result: { success: true, task: delegatedTask },
    updatedSource,
    updatedTarget: targetBoard,
  };
}

/** Why an input row was not materialized as a new board task (batch POST transparency). */
export type SkippedTaskReason = 'duplicate' | 'empty_title';

export interface SkippedTaskEntry {
  title: string;
  reason: SkippedTaskReason;
}

/** Non-fatal normalization warnings for rows that were added but transformed. */
export interface TaskNormalizationWarning {
  title: string;
  reason: 'description_truncated';
  originalLength: number;
  keptLength: number;
}

/** Add tasks to a board with dedup against existing + done log. */
export function addTasksToBoard(
  board: TeamTask[],
  doneLog: DoneLogEntry[],
  tasks: Array<Omit<TeamTask, 'id' | 'status' | 'createdAt'>>
): {
  added: TeamTask[];
  skipped: SkippedTaskEntry[];
  warnings: TaskNormalizationWarning[];
  updatedBoard: TeamTask[];
} {
  const existingNorm = new Set([
    ...board.map((t) => normalizeTitle(t.title)),
    ...doneLog.map((d) => normalizeTitle(d.title)),
  ]);

  const added: TeamTask[] = [];
  const skipped: SkippedTaskEntry[] = [];
  const warnings: TaskNormalizationWarning[] = [];
  for (const t of tasks) {
    const title = String(t.title || '').slice(0, 200);
    if (!title) {
      skipped.push({ title: '', reason: 'empty_title' });
      continue;
    }
    if (existingNorm.has(normalizeTitle(title))) {
      skipped.push({ title, reason: 'duplicate' });
      continue;
    }

    const rawDescription = String(t.description || '');
    // Cap unified with the suggestion-description cap at line 367 (2000).
    // W.085 post-mortem: agents repeatedly hit the old 1000 cap while filing
    // security-audit tasks (~3 reproductions 2026-04-23 to 2026-04-24). The
    // warning signal already existed; raising the cap reduces false friction
    // without changing the signal shape — callers still get `warnings[]`
    // on overflow, just at a higher threshold.
    const normalizedDescription = rawDescription.slice(0, 2000);
    if (rawDescription.length > normalizedDescription.length) {
      warnings.push({
        title,
        reason: 'description_truncated',
        originalLength: rawDescription.length,
        keptLength: normalizedDescription.length,
      });
    }

    const task: TeamTask = {
      id: generateTaskId(),
      title,
      description: normalizedDescription,
      status: 'open',
      source: String(t.source || 'manual'),
      priority: t.priority || 5,
      role: t.role,
      createdAt: new Date().toISOString(),
    };
    if (t.dependsOn?.length) task.dependsOn = [...t.dependsOn];
    if (t.unblocks?.length) task.unblocks = [...t.unblocks];
    if (t.tags?.length) task.tags = [...t.tags];
    if (t.metadata && Object.keys(t.metadata).length) task.metadata = { ...t.metadata };
    if (t.onComplete?.length) task.onComplete = [...t.onComplete];
    board.push(task);
    existingNorm.add(normalizeTitle(title));
    added.push(task);
  }

  return { added, skipped, warnings, updatedBoard: board };
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
  if (suggestion.status !== 'open')
    return { success: false, error: `Suggestion is ${suggestion.status}, voting closed` };

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
      priority:
        suggestion.category === 'architecture' ? 2 : suggestion.category === 'testing' ? 3 : 4,
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
  if (suggestion.status !== 'open')
    return { success: false, error: `Suggestion is already ${suggestion.status}` };

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
  if (suggestion.status !== 'open')
    return { success: false, error: `Suggestion is already ${suggestion.status}` };

  suggestion.status = 'dismissed';
  suggestion.resolvedAt = new Date().toISOString();
  return { success: true, suggestion };
}
