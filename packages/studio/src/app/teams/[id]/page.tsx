'use client';

/**
 * Team Dashboard — /teams/[id]
 *
 * Unified team workspace with 3 tabs:
 * - Board: kanban task board (default)
 * - Agents: team agent profiles (Brittney, Daemon, Absorb, Oracle)
 * - HoloClaw: agent execution engine (live view)
 *
 * The left sidebar retains mode selector, member slots, and treasury.
 */

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { BoardTab } from '@/components/teams/BoardTab';
import { AgentsTab } from '@/components/teams/AgentsTab';
import { HoloClawTab } from '@/components/teams/HoloClawTab';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TeamMember {
  agentId: string;
  agentName: string;
  role: string;
  online: boolean;
  joinedAt: string;
}

interface BoardData {
  mode: string;
  objective: string;
  slots: { roles: string[]; max: number };
  board: {
    open: Array<{ id: string; title: string }>;
    claimed: Array<{ id: string; title: string }>;
    blocked: Array<{ id: string; title: string }>;
  };
  done: { recent: Array<{ id: string; title: string }>; total: number };
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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type DashboardTab = 'board' | 'agents' | 'holoclaw';

const TABS: { id: DashboardTab; label: string; description: string }[] = [
  { id: 'board', label: 'Board', description: 'Task kanban' },
  { id: 'agents', label: 'Agents', description: 'Team agents' },
  { id: 'holoclaw', label: 'HoloClaw', description: 'Execution engine' },
];

const MODES = ['manual', 'build', 'audit', 'research', 'review'];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TeamDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: teamId } = use(params);

  const [team, setTeam] = useState<TeamData | null>(null);
  const [board, setBoard] = useState<BoardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modeChanging, setModeChanging] = useState(false);
  const [activeTab, setActiveTab] = useState<DashboardTab>('board');

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
      // silently ignore -- mode is best-effort
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

  const { done, mode, objective, slots } = board;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-studio-bg text-studio-text">
      {/* Header */}
      <header className="shrink-0 border-b border-studio-border px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/teams"
              className="text-xs text-studio-muted hover:text-studio-text transition-colors"
            >
              Teams
            </Link>
            <span className="text-studio-border">/</span>
            <h1 className="text-base font-semibold">{team.team.name}</h1>
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

          {/* Tab bar in header */}
          <div className="flex items-center gap-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-studio-accent text-white'
                    : 'text-studio-muted hover:text-studio-text hover:bg-studio-panel'
                }`}
                title={tab.description}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        {team.team.description && (
          <p className="mt-0.5 text-xs text-studio-muted">{team.team.description}</p>
        )}
      </header>

      <div className="flex min-h-0 flex-1 gap-0 overflow-hidden">
        {/* Left sidebar */}
        <div className="flex w-60 shrink-0 flex-col gap-4 overflow-y-auto border-r border-studio-border p-4">
          {/* Mode selector */}
          <section>
            <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-studio-muted">
              Mode
            </div>
            <div className="rounded-lg border border-studio-border bg-studio-panel p-2.5">
              <p className="mb-1.5 text-[10px] text-studio-muted line-clamp-2">{objective}</p>
              <div className="flex flex-wrap gap-1">
                {MODES.map((m) => (
                  <button
                    key={m}
                    onClick={() => switchMode(m)}
                    disabled={modeChanging}
                    className={`rounded px-2 py-0.5 text-[10px] transition-colors ${
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
            <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-studio-muted">
              Slots ({team.team.members.length}/{slots.max})
            </div>
            <div className="space-y-1">
              {team.team.members.map((m) => (
                <div
                  key={m.agentId}
                  className="flex items-center gap-2 rounded-lg border border-studio-border bg-studio-panel px-2.5 py-1.5"
                >
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      m.online ? 'bg-green-400' : 'bg-studio-muted/40'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[11px] font-medium">{m.agentName}</div>
                    <div className="text-[10px] text-studio-muted">{m.role}</div>
                  </div>
                </div>
              ))}
              {Array.from({ length: slots.max - team.team.members.length }).map((_, i) => (
                <div
                  key={`empty-${i}`}
                  className="flex items-center gap-2 rounded-lg border border-dashed border-studio-border/50 bg-studio-bg px-2.5 py-1.5"
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-studio-border/50" />
                  <div className="text-[10px] text-studio-muted/50">open slot</div>
                </div>
              ))}
            </div>
          </section>

          {/* Treasury */}
          <section>
            <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-studio-muted">
              Treasury
            </div>
            <div className="rounded-lg border border-studio-border bg-studio-panel p-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-studio-muted">Tasks done</span>
                <span className="text-sm font-semibold text-studio-accent">{done.total}</span>
              </div>
            </div>
          </section>

          {/* Quick stats */}
          <section>
            <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-studio-muted">
              Board
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { label: 'Open', count: board.board.open.length, color: 'text-blue-400' },
                { label: 'WIP', count: board.board.claimed.length, color: 'text-yellow-400' },
                { label: 'Block', count: board.board.blocked.length, color: 'text-red-400' },
              ].map(({ label, count, color }) => (
                <div
                  key={label}
                  className="rounded-lg border border-studio-border bg-[#0f172a] p-2 text-center"
                >
                  <div className={`text-sm font-bold ${color}`}>{count}</div>
                  <div className="text-[9px] text-studio-muted">{label}</div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Main content: tab body */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {activeTab === 'board' && <BoardTab teamId={teamId} />}
          {activeTab === 'agents' && <AgentsTab teamId={teamId} />}
          {activeTab === 'holoclaw' && <HoloClawTab />}
        </div>
      </div>
    </div>
  );
}
