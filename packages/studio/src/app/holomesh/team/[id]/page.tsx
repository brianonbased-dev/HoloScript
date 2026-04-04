'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';

interface TeamMember {
  agentId: string;
  agentName: string;
  role: string;
  online: boolean;
  joinedAt: string;
}

interface BoardTask {
  id: string;
  title: string;
  description?: string;
  priority?: number;
  claimedBy?: string;
  claimedAt?: string;
  tags?: string[];
}

interface DoneTask {
  id: string;
  title: string;
  doneBy?: string;
  commit?: string;
  doneAt?: string;
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
  done: { recent: DoneTask[]; total: number };
}

interface TeamData {
  team: {
    id: string;
    name: string;
    description: string;
    your_role: string;
    members: TeamMember[];
    online_count: number;
  };
  presence: unknown[];
}

const MODES = ['manual', 'build', 'audit', 'research', 'review'];

export default function TeamDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: teamId } = use(params);

  const [team, setTeam] = useState<TeamData | null>(null);
  const [board, setBoard] = useState<BoardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modeChanging, setModeChanging] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [teamRes, boardRes] = await Promise.all([
          fetch(`/api/holomesh/team/${teamId}`),
          fetch(`/api/holomesh/team/${teamId}/board`),
        ]);
        if (!teamRes.ok) throw new Error(`Team: ${teamRes.status}`);
        if (!boardRes.ok) throw new Error(`Board: ${boardRes.status}`);
        const [t, b] = await Promise.all([teamRes.json(), boardRes.json()]);
        if (!cancelled) {
          setTeam(t);
          setBoard(b);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [teamId]);

  const switchMode = async (newMode: string) => {
    if (!board || modeChanging) return;
    setModeChanging(true);
    try {
      await fetch(`/api/holomesh/team/${teamId}/board`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_mode', mode: newMode }),
      });
      setBoard({ ...board, mode: newMode });
    } catch {
      // silently ignore — mode is best-effort
    } finally {
      setModeChanging(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-studio-bg">
        <div className="animate-pulse text-sm text-studio-muted">Loading team...</div>
      </div>
    );
  }

  if (error || !team || !board) {
    return (
      <div className="flex h-screen items-center justify-center bg-studio-bg p-6">
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-6 text-sm text-red-400">
          {error ?? 'Unknown error'}
        </div>
      </div>
    );
  }

  const { board: taskBoard, done, mode, objective, slots } = board;
  const openCount = taskBoard.open.length;
  const claimedCount = taskBoard.claimed.length;
  const blockedCount = taskBoard.blocked.length;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-studio-bg text-studio-text">
      {/* Header */}
      <header className="shrink-0 border-b border-studio-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-semibold">{team.team.name}</h1>
              <span className="rounded-full bg-studio-panel px-2 py-0.5 text-xs text-studio-muted">
                {team.team.your_role}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  team.team.online_count > 0
                    ? 'bg-green-500/20 text-green-400'
                    : 'bg-studio-panel text-studio-muted'
                }`}
              >
                {team.team.online_count} online
              </span>
            </div>
            <p className="mt-0.5 text-xs text-studio-muted">{team.team.description}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/holomesh/team/${teamId}/board`}
              className="rounded-lg border border-studio-border bg-studio-panel px-3 py-1.5 text-xs hover:border-studio-accent/50 hover:text-studio-accent"
            >
              Full Board →
            </Link>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 gap-0 overflow-hidden">
        {/* Left column */}
        <div className="flex w-72 shrink-0 flex-col gap-4 overflow-y-auto border-r border-studio-border p-4">
          {/* Mode selector */}
          <section>
            <div className="mb-2 text-xs font-medium uppercase tracking-wider text-studio-muted">
              Mode
            </div>
            <div className="rounded-lg border border-studio-border bg-studio-panel p-3">
              <p className="mb-2 text-xs text-studio-muted">Objective: {objective}</p>
              <div className="flex flex-wrap gap-1">
                {MODES.map((m) => (
                  <button
                    key={m}
                    onClick={() => switchMode(m)}
                    disabled={modeChanging}
                    className={`rounded px-2 py-1 text-xs transition-colors ${
                      mode === m
                        ? 'bg-studio-accent/20 text-studio-accent ring-1 ring-studio-accent/40'
                        : 'bg-studio-bg text-studio-muted hover:text-studio-text'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Slots */}
          <section>
            <div className="mb-2 text-xs font-medium uppercase tracking-wider text-studio-muted">
              Slots ({team.team.members.length}/{slots.max})
            </div>
            <div className="space-y-1.5">
              {team.team.members.map((m) => (
                <div
                  key={m.agentId}
                  className="flex items-center gap-2 rounded-lg border border-studio-border bg-studio-panel px-3 py-2"
                >
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      m.online ? 'bg-green-400' : 'bg-studio-muted/40'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium">{m.agentName}</div>
                    <div className="text-[10px] text-studio-muted">{m.role}</div>
                  </div>
                </div>
              ))}
              {Array.from({ length: slots.max - team.team.members.length }).map((_, i) => (
                <div
                  key={`empty-${i}`}
                  className="flex items-center gap-2 rounded-lg border border-dashed border-studio-border/50 bg-studio-bg px-3 py-2"
                >
                  <span className="h-2 w-2 shrink-0 rounded-full bg-studio-border/50" />
                  <div className="text-xs text-studio-muted/50">open slot</div>
                </div>
              ))}
            </div>
          </section>

          {/* Treasury */}
          <section>
            <div className="mb-2 text-xs font-medium uppercase tracking-wider text-studio-muted">
              Treasury
            </div>
            <div className="rounded-lg border border-studio-border bg-studio-panel p-3">
              <div className="text-xs text-studio-muted">
                Wallet
              </div>
              <div className="mt-1 break-all font-mono text-[10px] text-studio-text/80">
                {/* Treasury wallet comes from equipment-load room config */}
                See room settings
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs text-studio-muted">Tasks done</span>
                <span className="text-sm font-semibold text-studio-accent">{done.total}</span>
              </div>
            </div>
          </section>
        </div>

        {/* Right column: board + done log */}
        <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          {/* Board summary */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <div className="text-xs font-medium uppercase tracking-wider text-studio-muted">
                Task Board
              </div>
              <Link
                href={`/holomesh/team/${teamId}/board`}
                className="text-xs text-studio-accent hover:underline"
              >
                Open kanban →
              </Link>
            </div>

            {/* Counts */}
            <div className="mb-3 grid grid-cols-3 gap-2">
              {[
                { label: 'Open', count: openCount, color: 'text-blue-400' },
                { label: 'Claimed', count: claimedCount, color: 'text-yellow-400' },
                { label: 'Blocked', count: blockedCount, color: 'text-red-400' },
              ].map(({ label, count, color }) => (
                <div
                  key={label}
                  className="rounded-lg border border-studio-border bg-studio-panel p-3 text-center"
                >
                  <div className={`text-2xl font-bold ${color}`}>{count}</div>
                  <div className="text-xs text-studio-muted">{label}</div>
                </div>
              ))}
            </div>

            {/* Open tasks (first 5) */}
            {taskBoard.open.length > 0 && (
              <div className="space-y-1.5">
                {taskBoard.open.slice(0, 5).map((t) => (
                  <div
                    key={t.id}
                    className="flex items-start gap-2 rounded-lg border border-studio-border bg-studio-panel px-3 py-2"
                  >
                    <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs">{t.title}</div>
                      {t.tags && t.tags.length > 0 && (
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {t.tags.slice(0, 3).map((tag) => (
                            <span
                              key={tag}
                              className="rounded px-1 py-0.5 text-[10px] bg-studio-bg text-studio-muted"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    {t.priority != null && (
                      <span className="shrink-0 text-[10px] text-studio-muted">
                        P{t.priority}
                      </span>
                    )}
                  </div>
                ))}
                {taskBoard.open.length > 5 && (
                  <Link
                    href={`/holomesh/team/${teamId}/board`}
                    className="block text-center text-xs text-studio-muted hover:text-studio-accent"
                  >
                    +{taskBoard.open.length - 5} more → view board
                  </Link>
                )}
              </div>
            )}

            {/* Claimed tasks */}
            {taskBoard.claimed.length > 0 && (
              <>
                <div className="mb-1.5 mt-3 text-xs text-studio-muted">In progress</div>
                <div className="space-y-1.5">
                  {taskBoard.claimed.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-start gap-2 rounded-lg border border-yellow-500/20 bg-yellow-500/5 px-3 py-2"
                    >
                      <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-yellow-400" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs">{t.title}</div>
                        {t.claimedBy && (
                          <div className="text-[10px] text-studio-muted">→ {t.claimedBy}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>

          {/* Done log */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-medium uppercase tracking-wider text-studio-muted">
                Done Log
              </div>
              <span className="text-xs text-studio-muted">{done.total} total</span>
            </div>
            <div className="space-y-1.5">
              {done.recent.slice(0, 8).map((t) => (
                <div
                  key={t.id}
                  className="flex items-start gap-2 rounded-lg border border-studio-border bg-studio-panel px-3 py-2"
                >
                  <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-green-400" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs">{t.title}</div>
                    <div className="flex items-center gap-2 text-[10px] text-studio-muted">
                      {t.doneBy && <span>{t.doneBy}</span>}
                      {t.commit && (
                        <span className="font-mono">{t.commit.slice(0, 7)}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {done.recent.length === 0 && (
                <div className="rounded-lg border border-dashed border-studio-border/50 bg-studio-bg p-4 text-center text-xs text-studio-muted">
                  No completed tasks yet
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
