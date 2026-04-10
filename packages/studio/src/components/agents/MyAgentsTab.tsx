'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Globe,
  MessageCircle,
  Settings,
  Pause,
  Play,
  Square,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

export type AgentPlatform = 'holomesh' | 'moltbook' | 'custom';
export type AgentStatus = 'active' | 'paused' | 'stopped' | 'deploying' | 'error';

export interface FleetAgent {
  id: string;
  name: string;
  platform: AgentPlatform;
  status: AgentStatus;
  reputation: number;
  earningsCents: number;
  spentCents: number;
  lastAction: string;
  lastActionAt: string | null;
  bio: string;
  personalityMode: string;
  skills: string[];
  maxDailySpendCents: number;
  rateLimitPerMin: number;
  creatorRevenueSplit: number;
  createdAt: string;
}

// ── Platform config ──────────────────────────────────────────────────────────

const PLATFORM_META: Record<AgentPlatform, { label: string; icon: React.ReactNode; color: string; border: string }> = {
  holomesh: {
    label: 'HoloMesh',
    icon: <Globe className="h-4 w-4" />,
    color: 'text-indigo-400',
    border: 'border-indigo-500/30',
  },
  moltbook: {
    label: 'Moltbook',
    icon: <MessageCircle className="h-4 w-4" />,
    color: 'text-emerald-400',
    border: 'border-emerald-500/30',
  },
  custom: {
    label: 'Custom',
    icon: <Settings className="h-4 w-4" />,
    color: 'text-amber-400',
    border: 'border-amber-500/30',
  },
};

const STATUS_BADGE: Record<AgentStatus, { label: string; cls: string }> = {
  active: { label: 'Active', cls: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  paused: { label: 'Paused', cls: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  stopped: { label: 'Stopped', cls: 'bg-red-500/20 text-red-400 border-red-500/30' },
  deploying: { label: 'Deploying', cls: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  error: { label: 'Error', cls: 'bg-red-500/20 text-red-400 border-red-500/30' },
};

// ── Component ────────────────────────────────────────────────────────────────

export function MyAgentsTab() {
  const [agents, setAgents] = useState<FleetAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<AgentPlatform | 'all'>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadAgents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/agents/fleet');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: unknown = await res.json();
      const body = data as { agents?: FleetAgent[] };
      setAgents(body.agents ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load fleet');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAgents(); }, [loadAgents]);

  const handleAction = useCallback(async (agentId: string, action: 'pause' | 'resume' | 'stop') => {
    setActionLoading(agentId);
    try {
      const statusMap: Record<string, AgentStatus> = { pause: 'paused', resume: 'active', stop: 'stopped' };
      const res = await fetch(`/api/agents/fleet/${agentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: statusMap[action] }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updated: unknown = await res.json();
      const body = updated as { agent: FleetAgent };
      setAgents(prev => prev.map(a => a.id === agentId ? body.agent : a));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionLoading(null);
    }
  }, []);

  const visible = filter === 'all' ? agents : agents.filter(a => a.platform === filter);
  const FILTERS: Array<{ id: AgentPlatform | 'all'; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'holomesh', label: 'HoloMesh' },
    { id: 'moltbook', label: 'Moltbook' },
    { id: 'custom', label: 'Custom' },
  ];

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-48 animate-pulse rounded-xl bg-studio-panel" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400 flex items-center gap-3">
        <span>{error}</span>
        <button onClick={loadAgents} className="ml-auto text-xs underline hover:text-red-300">
          Retry
        </button>
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="mb-4 rounded-full bg-studio-panel p-4">
          <Globe className="h-8 w-8 text-studio-muted" />
        </div>
        <p className="text-sm font-medium text-studio-text">Launch your first agent to start earning</p>
        <p className="mt-1 text-xs text-studio-muted">
          Deploy agents to HoloMesh, Moltbook, or custom endpoints. They earn reputation and revenue autonomously.
        </p>
        <p className="mt-3 text-xs text-studio-muted">
          Switch to the <span className="text-studio-accent font-medium">Launch Agent</span> tab to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl">
      {/* Filters + refresh */}
      <div className="mb-4 flex items-center gap-3">
        <div className="flex gap-2">
          {FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                filter === f.id
                  ? 'bg-studio-accent text-white'
                  : 'bg-studio-panel border border-studio-border text-studio-muted hover:text-studio-text'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          onClick={loadAgents}
          className="ml-auto rounded-lg border border-studio-border p-1.5 text-studio-muted hover:text-studio-text transition"
          title="Refresh"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Agent grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map(agent => {
          const plat = PLATFORM_META[agent.platform];
          const status = STATUS_BADGE[agent.status];
          const isLoading = actionLoading === agent.id;

          return (
            <div
              key={agent.id}
              className={`rounded-xl border bg-[#111827] p-4 transition-all hover:border-studio-accent/40 ${plat.border}`}
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className={plat.color}>{plat.icon}</span>
                  <div>
                    <div className="text-sm font-semibold text-studio-text">{agent.name}</div>
                    <div className="text-[10px] text-studio-muted">{plat.label}</div>
                  </div>
                </div>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${status.cls}`}>
                  {status.label}
                </span>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div>
                  <div className="text-xs font-bold text-indigo-400">{agent.reputation.toFixed(1)}</div>
                  <div className="text-[9px] text-studio-muted uppercase">Rep</div>
                </div>
                <div>
                  <div className="text-xs font-bold text-emerald-400">${(agent.earningsCents / 100).toFixed(2)}</div>
                  <div className="text-[9px] text-studio-muted uppercase">Earned</div>
                </div>
                <div>
                  <div className="text-xs font-bold text-amber-400">${(agent.spentCents / 100).toFixed(2)}</div>
                  <div className="text-[9px] text-studio-muted uppercase">Spent</div>
                </div>
              </div>

              {/* Last action */}
              <div className="mb-3 text-[10px] text-studio-muted truncate">
                Last: {agent.lastAction || 'No actions yet'}
                {agent.lastActionAt && (
                  <span className="ml-1 text-studio-muted/50">
                    {formatRelative(agent.lastActionAt)}
                  </span>
                )}
              </div>

              {/* Quick actions */}
              <div className="flex items-center gap-1.5 border-t border-studio-border pt-3">
                {agent.status === 'active' && (
                  <button
                    onClick={() => handleAction(agent.id, 'pause')}
                    disabled={isLoading}
                    className="flex items-center gap-1 rounded-lg bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 text-[10px] font-medium text-amber-400 hover:bg-amber-500/20 transition disabled:opacity-50"
                  >
                    <Pause className="h-3 w-3" /> Pause
                  </button>
                )}
                {agent.status === 'paused' && (
                  <button
                    onClick={() => handleAction(agent.id, 'resume')}
                    disabled={isLoading}
                    className="flex items-center gap-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 text-[10px] font-medium text-emerald-400 hover:bg-emerald-500/20 transition disabled:opacity-50"
                  >
                    <Play className="h-3 w-3" /> Resume
                  </button>
                )}
                {agent.status !== 'stopped' && (
                  <button
                    onClick={() => handleAction(agent.id, 'stop')}
                    disabled={isLoading}
                    className="flex items-center gap-1 rounded-lg bg-red-500/10 border border-red-500/30 px-2.5 py-1 text-[10px] font-medium text-red-400 hover:bg-red-500/20 transition disabled:opacity-50"
                  >
                    <Square className="h-3 w-3" /> Stop
                  </button>
                )}
                <Link
                  href={`/agents/${agent.id}`}
                  className="ml-auto flex items-center gap-1 rounded-lg border border-studio-border px-2.5 py-1 text-[10px] text-studio-muted hover:text-studio-text transition"
                >
                  <ExternalLink className="h-3 w-3" /> View
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatRelative(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60_000) return 'just now';
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
    return `${Math.floor(diff / 86400_000)}d ago`;
  } catch {
    return '';
  }
}
