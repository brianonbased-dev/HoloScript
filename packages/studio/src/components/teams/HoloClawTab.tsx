'use client';

/**
 * HoloClawTab — Agent execution engine embedded in team workspace.
 *
 * Shows active skills, live activity stream, economy stats, bounty cards,
 * and a signed commit log. Feels like watching a CI/CD pipeline.
 *
 * @module components/teams/HoloClawTab
 */

import React, { useState, useEffect, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SkillMeta {
  name: string;
  fileName: string;
  path: string;
  size: number;
  modifiedAt: string;
  actions: string[];
  traits: string[];
  states: number;
  description: string;
}

interface RunningSkill {
  name: string;
  pid: number;
  startedAt: string;
  skillPath: string;
}

interface ActivityEntry {
  timestamp: string;
  channel?: string;
  message?: string;
  metadata?: Record<string, unknown>;
}

type SkillStatus = 'running' | 'idle' | 'error';

interface SkillWithStatus extends SkillMeta {
  status: SkillStatus;
  pid?: number;
  startedAt?: string;
}

interface BountyEntry {
  id: string;
  title: string;
  reward: number;
  currency: string;
  status: 'open' | 'claimed' | 'escrowed' | 'completed';
  claimedBy?: string;
  postedAt: string;
}

interface CommitEntry {
  hash: string;
  message: string;
  author: string;
  timestamp: string;
  signature?: string;
  verified: boolean;
}

// ---------------------------------------------------------------------------
// Trait badge colors (shared with holoclaw page)
// ---------------------------------------------------------------------------

const TRAIT_COLORS: Record<string, string> = {
  rate_limiter: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  circuit_breaker: 'bg-red-500/20 text-red-400 border-red-500/30',
  economy: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  rbac: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
  timeout_guard: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  scheduler: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  shell: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  llm_agent: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  file_system: 'bg-lime-500/20 text-lime-400 border-lime-500/30',
  behavior_tree: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
};

function traitBadgeClass(trait: string): string {
  return TRAIT_COLORS[trait] || 'bg-studio-panel text-studio-muted border-studio-border';
}

// ---------------------------------------------------------------------------
// Status indicator
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<SkillStatus, { dot: string; label: string; ring: string }> = {
  running: { dot: 'bg-green-400', label: 'Running', ring: 'ring-green-500/30' },
  idle: { dot: 'bg-yellow-400', label: 'Idle', ring: 'ring-yellow-500/30' },
  error: { dot: 'bg-red-400', label: 'Error', ring: 'ring-red-500/30' },
};

// ---------------------------------------------------------------------------
// Sub-sections
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Daemon types — 3 compositions that power the platform
// ---------------------------------------------------------------------------

type DaemonType = 'holodaemon' | 'holomesh' | 'moltbook';

interface DaemonInfo {
  id: DaemonType;
  name: string;
  composition: string;
  description: string;
  command: string;
  color: string;
  dotColor: string;
}

const DAEMONS: DaemonInfo[] = [
  {
    id: 'holodaemon',
    name: 'HoloDaemon',
    composition: 'self-improve-daemon.hsplus',
    description: 'Self-improvement — types, tests, cleanup, code quality',
    command: 'holoscript holodaemon compositions/self-improve-daemon.hsplus',
    color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
    dotColor: 'bg-emerald-400',
  },
  {
    id: 'holomesh',
    name: 'HoloMesh Agent',
    composition: 'holomesh-agent.hsplus',
    description: 'Knowledge exchange — contribute, discover, trade W/P/G',
    command: 'holoscript holomesh-daemon compositions/holomesh-agent.hsplus',
    color: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
    dotColor: 'bg-blue-400',
  },
  {
    id: 'moltbook',
    name: 'Moltbook Agent',
    composition: 'moltbook-agent.hsplus',
    description: 'Social engagement — replies, posts, community building',
    command: 'holoscript moltbook-daemon compositions/moltbook-agent.hsplus',
    color: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
    dotColor: 'bg-purple-400',
  },
];

type ClawSection = 'daemons' | 'skills' | 'stream' | 'economy' | 'bounties' | 'commits';

const SECTIONS: { id: ClawSection; label: string }[] = [
  { id: 'daemons', label: 'Daemons' },
  { id: 'skills', label: 'Active Skills' },
  { id: 'stream', label: 'Live Stream' },
  { id: 'economy', label: 'Economy' },
  { id: 'bounties', label: 'Bounties' },
  { id: 'commits', label: 'Commit Log' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function timeSince(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// ---------------------------------------------------------------------------
// Skill Card
// ---------------------------------------------------------------------------

function SkillCard({ skill }: { skill: SkillWithStatus }) {
  const cfg = STATUS_CONFIG[skill.status];

  return (
    <div
      className={`rounded-xl border border-studio-border bg-[#111827] p-4 transition-all hover:border-studio-accent/30 ${cfg.ring} ring-1`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 shrink-0 rounded-full ${cfg.dot} ${skill.status === 'running' ? 'animate-pulse' : ''}`} />
            <h3 className="text-sm font-semibold text-studio-text truncate">{skill.name}</h3>
          </div>
          {skill.description && (
            <p className="mt-1 ml-4 text-xs text-studio-muted line-clamp-1">{skill.description}</p>
          )}
        </div>
        <div className="ml-2 flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
            skill.status === 'running' ? 'bg-green-500/20 text-green-400' :
            skill.status === 'error' ? 'bg-red-500/20 text-red-400' :
            'bg-yellow-500/20 text-yellow-400'
          }`}>
            {cfg.label}
          </span>
          <span className="rounded bg-studio-panel px-2 py-0.5 text-[10px] text-studio-muted">
            {formatBytes(skill.size)}
          </span>
        </div>
      </div>

      <div className="mt-2 ml-4 flex flex-wrap gap-1">
        {skill.traits.slice(0, 5).map((t) => (
          <span
            key={t}
            className={`rounded border px-1.5 py-0.5 text-[10px] ${traitBadgeClass(t)}`}
          >
            @{t}
          </span>
        ))}
        {skill.traits.length > 5 && (
          <span className="rounded border border-studio-border px-1.5 py-0.5 text-[10px] text-studio-muted">
            +{skill.traits.length - 5}
          </span>
        )}
      </div>

      <div className="mt-2 ml-4 flex items-center gap-3 text-[10px] text-studio-muted">
        <span>{skill.actions.length} action{skill.actions.length !== 1 ? 's' : ''}</span>
        <span>{skill.states} state{skill.states !== 1 ? 's' : ''}</span>
        {skill.pid && <span className="font-mono">PID {skill.pid}</span>}
        <span className="ml-auto">{timeSince(skill.startedAt || skill.modifiedAt)}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Live Stream
// ---------------------------------------------------------------------------

function LiveStream() {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [streaming, setStreaming] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/holoclaw/activity?limit=50');
        const data: { entries?: ActivityEntry[] } = await res.json();
        if (!cancelled) setEntries((data.entries || []).reverse());
      } catch {
        /* ignore */
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const es = new EventSource('/api/holoclaw/activity?stream=true');
    es.onopen = () => setStreaming(true);
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as ActivityEntry & { type?: string };
        if (data.type === 'connected') return;
        setEntries((prev) => [data, ...prev].slice(0, 200));
      } catch {
        /* skip */
      }
    };
    es.onerror = () => setStreaming(false);
    return () => es.close();
  }, []);

  if (loading) {
    return <div className="text-sm text-studio-muted animate-pulse py-8 text-center">Loading stream...</div>;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-[10px] text-studio-muted">
        <div className={`h-2 w-2 rounded-full ${streaming ? 'bg-emerald-500 animate-pulse' : 'bg-gray-600'}`} />
        {streaming ? 'Live' : 'Disconnected'}
        <span className="ml-auto">{entries.length} entries</span>
      </div>

      {entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-sm text-studio-muted">No activity yet</p>
          <p className="mt-1 text-xs text-studio-muted/60">
            Skill executions and agent actions will appear here in real-time
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-1 max-h-96 overflow-y-auto">
          {entries.map((e, i) => {
            const isError = e.channel?.includes(':error');
            return (
              <div
                key={`${e.timestamp}-${i}`}
                className={`flex items-start gap-3 rounded-lg p-2.5 ${
                  isError ? 'bg-red-500/5 border border-red-500/10' : 'bg-[#0f172a]'
                }`}
              >
                <div className="shrink-0 text-[10px] text-studio-muted font-mono whitespace-nowrap">
                  {new Date(e.timestamp).toLocaleTimeString()}
                </div>
                {e.channel && (
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${
                    isError ? 'bg-red-500/20 text-red-400' : 'bg-studio-panel text-studio-muted'
                  }`}>
                    #{e.channel}
                  </span>
                )}
                <span className={`text-xs ${isError ? 'text-red-300' : 'text-studio-text'} min-w-0 break-words`}>
                  {e.message || '(empty)'}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Economy Widget
// ---------------------------------------------------------------------------

function EconomyWidget({ skills }: { skills: SkillWithStatus[] }) {
  const economySkills = skills.filter((s) => s.traits.includes('economy'));
  const totalSkills = skills.length;
  const runningCount = skills.filter((s) => s.status === 'running').length;

  // Mock budget data -- in production these come from the economy trait state
  const totalBudget = 100;
  const spent = runningCount * 2.5; // placeholder
  const remaining = totalBudget - spent;
  const pct = Math.min(100, (spent / totalBudget) * 100);

  return (
    <div className="flex flex-col gap-4">
      {/* Overview stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-studio-border bg-[#0f172a] p-3 text-center">
          <div className="text-lg font-bold text-studio-text">{totalSkills}</div>
          <div className="text-[10px] uppercase tracking-wider text-studio-muted">Total Skills</div>
        </div>
        <div className="rounded-lg border border-studio-border bg-[#0f172a] p-3 text-center">
          <div className="text-lg font-bold text-green-400">{runningCount}</div>
          <div className="text-[10px] uppercase tracking-wider text-studio-muted">Running</div>
        </div>
        <div className="rounded-lg border border-studio-border bg-[#0f172a] p-3 text-center">
          <div className="text-lg font-bold text-emerald-400">{economySkills.length}</div>
          <div className="text-[10px] uppercase tracking-wider text-studio-muted">Economy-Tracked</div>
        </div>
      </div>

      {/* Budget bar */}
      <div className="rounded-lg border border-studio-border bg-[#111827] p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-studio-text">Budget Usage</span>
          <span className="text-xs text-studio-muted">
            {spent.toFixed(1)} / {totalBudget} credits
          </span>
        </div>
        <div className="h-2.5 rounded-full bg-[#0f172a] overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              pct > 80 ? 'bg-red-500' : pct > 50 ? 'bg-yellow-500' : 'bg-emerald-500'
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between text-[10px] text-studio-muted">
          <span>Spent: {spent.toFixed(1)}</span>
          <span>Remaining: {remaining.toFixed(1)}</span>
        </div>
      </div>

      {/* Per-skill budget bars */}
      {economySkills.length > 0 && (
        <div className="rounded-lg border border-studio-border bg-[#111827] p-4">
          <div className="text-xs font-medium text-studio-text mb-3">Per-Skill Spend</div>
          <div className="space-y-3">
            {economySkills.map((skill) => {
              const skillSpend = skill.status === 'running' ? 2.5 : 0;
              const skillPct = Math.min(100, (skillSpend / 10) * 100);
              return (
                <div key={skill.name}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-studio-muted">{skill.name}</span>
                    <span className="text-[10px] text-studio-muted">{skillSpend.toFixed(1)} cr</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[#0f172a] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-500/70 transition-all duration-500"
                      style={{ width: `${skillPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bounties Widget
// ---------------------------------------------------------------------------

function BountiesWidget() {
  const [bounties] = useState<BountyEntry[]>([]);

  // Bounties come from the HoloMesh bounty system -- empty state for now
  if (bounties.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="mb-3 rounded-full bg-studio-panel p-3">
          <svg className="h-6 w-6 text-studio-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="text-sm text-studio-muted">No bounties posted</p>
        <p className="mt-1 text-xs text-studio-muted/60">
          Bounties from HoloMesh teams will appear here with claim and escrow status
        </p>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    open: 'bg-blue-500/20 text-blue-400',
    claimed: 'bg-yellow-500/20 text-yellow-400',
    escrowed: 'bg-purple-500/20 text-purple-400',
    completed: 'bg-green-500/20 text-green-400',
  };

  return (
    <div className="space-y-2">
      {bounties.map((b) => (
        <div
          key={b.id}
          className="rounded-lg border border-studio-border bg-[#111827] p-3"
        >
          <div className="flex items-start justify-between">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-studio-text">{b.title}</div>
              {b.claimedBy && (
                <div className="mt-0.5 text-[10px] text-studio-muted">Claimed by {b.claimedBy}</div>
              )}
            </div>
            <div className="ml-2 flex items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusColors[b.status] || ''}`}>
                {b.status}
              </span>
              <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-mono text-emerald-400">
                {b.reward} {b.currency}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Commit Log Widget
// ---------------------------------------------------------------------------

function CommitLogWidget() {
  const [commits] = useState<CommitEntry[]>([]);

  if (commits.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="mb-3 rounded-full bg-studio-panel p-3">
          <svg className="h-6 w-6 text-studio-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
        <p className="text-sm text-studio-muted">No signed commits yet</p>
        <p className="mt-1 text-xs text-studio-muted/60">
          Ed25519 signed commits by agents will appear here with verification status
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {commits.map((c) => (
        <div
          key={c.hash}
          className="flex items-start gap-3 rounded-lg border border-studio-border bg-[#111827] p-3"
        >
          <div className="shrink-0 mt-0.5">
            {c.verified ? (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-500/20">
                <svg className="h-3 w-3 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </span>
            ) : (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500/20">
                <svg className="h-3 w-3 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs text-studio-text">{c.message}</div>
            <div className="mt-0.5 flex items-center gap-2 text-[10px] text-studio-muted">
              <span className="font-mono">{c.hash.slice(0, 7)}</span>
              <span>{c.author}</span>
              <span>{timeSince(c.timestamp)}</span>
              {c.verified && (
                <span className="rounded bg-green-500/10 px-1 py-0.5 text-green-400">verified</span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Export
// ---------------------------------------------------------------------------

export function HoloClawTab() {
  const [section, setSection] = useState<ClawSection>('daemons');
  const [skills, setSkills] = useState<SkillWithStatus[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSkills = useCallback(async () => {
    setLoading(true);
    try {
      const [skillsRes, runningRes] = await Promise.all([
        fetch('/api/holoclaw'),
        fetch('/api/holoclaw/run'),
      ]);

      const skillsData: { skills?: SkillMeta[] } = await skillsRes.json();
      const runningData: { running?: RunningSkill[] } = await runningRes.json();

      const allSkills = skillsData.skills || [];
      const running = runningData.running || [];
      const _runningNames = new Set(running.map((r) => r.name));

      const merged: SkillWithStatus[] = allSkills.map((s) => {
        const runEntry = running.find((r) => r.name === s.name);
        return {
          ...s,
          status: runEntry ? 'running' as const : 'idle' as const,
          pid: runEntry?.pid,
          startedAt: runEntry?.startedAt,
        };
      });

      // Sort: running first, then by modification date
      merged.sort((a, b) => {
        if (a.status === 'running' && b.status !== 'running') return -1;
        if (b.status === 'running' && a.status !== 'running') return 1;
        return new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime();
      });

      setSkills(merged);
    } catch {
      // skills fetch failed, leave empty
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSkills();
    // Refresh every 10 seconds for running status
    const interval = setInterval(fetchSkills, 10000);
    return () => clearInterval(interval);
  }, [fetchSkills]);

  const runningCount = skills.filter((s) => s.status === 'running').length;
  const idleCount = skills.filter((s) => s.status === 'idle').length;

  return (
    <div className="flex flex-col gap-0 h-full">
      {/* Pipeline header bar */}
      <div className="shrink-0 flex items-center gap-4 border-b border-studio-border bg-[#0d0d14] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${runningCount > 0 ? 'bg-green-400 animate-pulse' : 'bg-gray-600'}`} />
          <span className="text-xs font-medium text-studio-text">HoloClaw</span>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-studio-muted">
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-green-400" /> {runningCount} running
          </span>
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-yellow-400" /> {idleCount} idle
          </span>
          <span>{skills.length} total</span>
        </div>
        <div className="ml-auto">
          <button
            onClick={fetchSkills}
            className="rounded border border-studio-border px-2 py-1 text-[10px] text-studio-muted hover:text-studio-text hover:border-studio-accent/40 transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Section nav */}
      <div className="shrink-0 flex gap-1 border-b border-studio-border bg-[#0d0d14]/50 px-4 py-1.5">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={`rounded-lg px-3 py-1 text-xs transition-colors ${
              section === s.id
                ? 'bg-studio-accent/20 text-studio-accent ring-1 ring-studio-accent/30'
                : 'text-studio-muted hover:text-studio-text hover:bg-studio-panel'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {section === 'daemons' && (
          <div className="space-y-3">
            <p className="text-xs text-studio-muted mb-4">
              Three HoloScript compositions power your project. Each runs as a behavior tree with economy limits and Ed25519 signing.
            </p>
            {DAEMONS.map((d) => (
              <div
                key={d.id}
                className={`rounded-xl border p-4 ${d.color} transition-all hover:brightness-110`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${d.dotColor} animate-pulse`} />
                      <h3 className="text-sm font-semibold">{d.name}</h3>
                    </div>
                    <p className="mt-1 ml-5 text-xs opacity-80">{d.description}</p>
                    <div className="mt-2 ml-5 flex items-center gap-2">
                      <code className="rounded bg-black/30 px-2 py-0.5 text-[10px] font-mono opacity-70">{d.composition}</code>
                    </div>
                  </div>
                  <div className="ml-3 flex gap-2">
                    <button className="rounded-lg border border-current/20 px-3 py-1 text-[11px] font-medium opacity-80 hover:opacity-100 transition">
                      Configure
                    </button>
                    <button className="rounded-lg border border-current/20 px-3 py-1 text-[11px] font-medium opacity-80 hover:opacity-100 transition">
                      Start
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {section === 'skills' && (
          loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-24 rounded-xl border border-studio-border bg-[#111827] animate-pulse" />
              ))}
            </div>
          ) : skills.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-sm text-studio-muted">No skills installed</p>
              <p className="mt-1 text-xs text-studio-muted/60">
                Install .hsplus compositions to see them here
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {skills.map((s) => (
                <SkillCard key={s.path} skill={s} />
              ))}
            </div>
          )
        )}

        {section === 'stream' && <LiveStream />}
        {section === 'economy' && <EconomyWidget skills={skills} />}
        {section === 'bounties' && <BountiesWidget />}
        {section === 'commits' && <CommitLogWidget />}
      </div>
    </div>
  );
}
