'use client';

/**
 * Team Kanban Board — /teams/[id]/board
 *
 * Full kanban board with claim/done actions.
 * Moved from /holomesh/team/[id]/board.
 */

import { useEffect, useState, useCallback, use } from 'react';
import Link from 'next/link';

interface BoardTask {
  id: string;
  title: string;
  description?: string;
  priority?: number;
  claimedBy?: string;
  claimedAt?: string;
  doneBy?: string;
  commit?: string;
  doneAt?: string;
  tags?: string[];
}

interface BoardData {
  mode: string;
  objective: string;
  slots: { roles: string[]; max: number };
  board: {
    open: BoardTask[];
    claimed: BoardTask[];
    blocked: BoardTask[];
  };
  done: { recent: BoardTask[]; total: number };
}

interface Column {
  key: 'open' | 'claimed' | 'done';
  label: string;
  color: string;
  dot: string;
  emptyText: string;
}

const COLUMNS: Column[] = [
  {
    key: 'open',
    label: 'Open',
    color: 'border-blue-500/30',
    dot: 'bg-blue-400',
    emptyText: 'No open tasks',
  },
  {
    key: 'claimed',
    label: 'In Progress',
    color: 'border-yellow-500/30',
    dot: 'bg-yellow-400',
    emptyText: 'Nothing in progress',
  },
  {
    key: 'done',
    label: 'Done',
    color: 'border-green-500/30',
    dot: 'bg-green-400',
    emptyText: 'Nothing completed yet',
  },
];

function priorityBadge(p?: number) {
  if (p == null) return null;
  return `P${p}`;
}

function priorityColor(p?: number): string {
  if (p === 1) return 'bg-red-500/20 text-red-400';
  if (p === 2) return 'bg-orange-500/20 text-orange-400';
  return 'bg-studio-bg text-studio-muted';
}

export default function KanbanBoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: teamId } = use(params);
  const [data, setData] = useState<BoardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingTask, setActingTask] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/holomesh/team/${teamId}/board`);
      if (!res.ok) throw new Error(`${res.status}`);
      setData(await res.json());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load board');
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    load();
  }, [load]);

  const claimTask = async (taskId: string) => {
    if (actingTask) return;
    setActingTask(taskId);
    try {
      await fetch(`/api/holomesh/team/${teamId}/board/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'claim' }),
      });
      await load();
    } finally {
      setActingTask(null);
    }
  };

  const doneTask = async (taskId: string) => {
    if (actingTask) return;
    setActingTask(taskId);
    try {
      await fetch(`/api/holomesh/team/${teamId}/board/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'done', summary: 'Marked done from Studio board' }),
      });
      await load();
    } finally {
      setActingTask(null);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-studio-bg">
        <div className="animate-pulse text-sm text-studio-muted">Loading board...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-screen items-center justify-center bg-studio-bg p-6">
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-6 text-sm text-red-400">
          {error ?? 'Unknown error'}
        </div>
      </div>
    );
  }

  const columns = {
    open: data.board.open,
    claimed: data.board.claimed,
    done: data.done.recent,
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-studio-bg text-studio-text">
      {/* Header */}
      <header className="shrink-0 border-b border-studio-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href={`/teams/${teamId}`}
              className="text-sm text-studio-muted hover:text-studio-text"
            >
              Team
            </Link>
            <span className="text-studio-border">/</span>
            <h1 className="text-base font-semibold">Kanban Board</h1>
            <span className="rounded-full bg-studio-panel px-2 py-0.5 text-xs text-studio-muted">
              {data.mode}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-studio-muted">{data.done.total} completed total</span>
            <button
              onClick={load}
              className="rounded-lg border border-studio-border bg-studio-panel px-3 py-1.5 text-xs hover:border-studio-accent/50 hover:text-studio-accent"
            >
              Refresh
            </button>
          </div>
        </div>
        {data.objective && <p className="mt-1 text-xs text-studio-muted">{data.objective}</p>}
      </header>

      {/* Kanban columns */}
      <div className="flex min-h-0 flex-1 gap-0 overflow-hidden">
        {COLUMNS.map((col) => {
          const tasks = columns[col.key];
          return (
            <div
              key={col.key}
              className={`flex min-w-0 flex-1 flex-col overflow-hidden border-r border-studio-border last:border-r-0`}
            >
              {/* Column header */}
              <div className="shrink-0 border-b border-studio-border px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${col.dot}`} />
                  <span className="text-xs font-medium">{col.label}</span>
                  <span className="ml-auto rounded-full bg-studio-panel px-2 py-0.5 text-xs text-studio-muted">
                    {tasks.length}
                  </span>
                </div>
              </div>

              {/* Column tasks */}
              <div role="listbox" aria-label={col.label + " tasks"} className="flex-1 overflow-y-auto p-3 space-y-2">
                {tasks.length === 0 && (
                  <div className="rounded-lg border border-dashed border-studio-border/50 bg-studio-bg p-4 text-center text-xs text-studio-muted">
                    {col.emptyText}
                  </div>
                )}

                {tasks.map((task) => (
                  <div
                    key={task.id}
                    role="option" tabIndex={0} aria-label={task.title} className={`rounded-lg border bg-studio-panel p-3 transition-colors hover:border-studio-accent/30 focus:outline-none focus:ring-2 focus:ring-studio-accent/50 ${col.color}`}
                  >
                    {/* Task title */}
                    <div className="min-w-0 text-xs leading-snug">{task.title}</div>

                    {/* Description */}
                    {task.description && (
                      <div className="mt-1 text-[10px] text-studio-muted line-clamp-2">
                        {task.description}
                      </div>
                    )}

                    {/* Tags */}
                    {task.tags && task.tags.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {task.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="rounded px-1 py-0.5 text-[10px] bg-studio-bg text-studio-muted"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Footer */}
                    <div className="mt-2 flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1">
                        {task.priority != null && (
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${priorityColor(task.priority)}`}
                          >
                            {priorityBadge(task.priority)}
                          </span>
                        )}
                        {task.claimedBy && (
                          <span className="text-[10px] text-studio-muted">{task.claimedBy}</span>
                        )}
                        {task.doneBy && (
                          <span className="text-[10px] text-studio-muted">{task.doneBy}</span>
                        )}
                        {task.commit && (
                          <span className="font-mono text-[10px] text-studio-muted">
                            {task.commit.slice(0, 7)}
                          </span>
                        )}
                      </div>

                      {/* Actions */}
                      {col.key === 'open' && (
                        <button
                          aria-label={`Claim task: ${task.title}`} onClick={() => claimTask(task.id)}
                          disabled={actingTask === task.id}
                          className="shrink-0 rounded px-2 py-0.5 text-[10px] bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 disabled:opacity-50"
                        >
                          {actingTask === task.id ? '...' : 'Claim'}
                        </button>
                      )}
                      {col.key === 'claimed' && (
                        <button
                          aria-label={`Complete task: ${task.title}`} onClick={() => doneTask(task.id)}
                          disabled={actingTask === task.id}
                          className="shrink-0 rounded px-2 py-0.5 text-[10px] bg-green-500/20 text-green-400 hover:bg-green-500/30 disabled:opacity-50"
                        >
                          {actingTask === task.id ? '...' : 'Done'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
