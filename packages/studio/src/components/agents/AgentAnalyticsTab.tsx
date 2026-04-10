'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, TrendingUp, Trophy } from 'lucide-react';
import type { FleetAgent, AgentPlatform } from './MyAgentsTab';

// ── Types ────────────────────────────────────────────────────────────────────

interface FleetAnalytics {
  totalAgents: number;
  activeAgents: number;
  pausedAgents: number;
  stoppedAgents: number;
  totalEarnedCents: number;
  totalSpentCents: number;
  agents: FleetAgent[];
}

const WIDTH_CLASSES = [
  'w-0',
  'w-[5%]',
  'w-[10%]',
  'w-[15%]',
  'w-[20%]',
  'w-[25%]',
  'w-[30%]',
  'w-[35%]',
  'w-[40%]',
  'w-[45%]',
  'w-[50%]',
  'w-[55%]',
  'w-[60%]',
  'w-[65%]',
  'w-[70%]',
  'w-[75%]',
  'w-[80%]',
  'w-[85%]',
  'w-[90%]',
  'w-[95%]',
  'w-full',
] as const;

function widthClassFromPercent(percent: number): string {
  const clamped = Math.max(0, Math.min(100, percent));
  const bucket = Math.round(clamped / 5);
  return WIDTH_CLASSES[bucket] ?? 'w-full';
}

// ── Component ────────────────────────────────────────────────────────────────

export function AgentAnalyticsTab() {
  const [analytics, setAnalytics] = useState<FleetAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/agents/fleet');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: unknown = await res.json();
      const body = data as { agents?: FleetAgent[] };
      const agents = body.agents ?? [];

      setAnalytics({
        totalAgents: agents.length,
        activeAgents: agents.filter(a => a.status === 'active').length,
        pausedAgents: agents.filter(a => a.status === 'paused').length,
        stoppedAgents: agents.filter(a => a.status === 'stopped').length,
        totalEarnedCents: agents.reduce((s, a) => s + a.earningsCents, 0),
        totalSpentCents: agents.reduce((s, a) => s + a.spentCents, 0),
        agents,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAnalytics(); }, [loadAnalytics]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-studio-panel" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-xl bg-studio-panel" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400 flex items-center gap-3">
        <span>{error}</span>
        <button onClick={loadAnalytics} className="ml-auto text-xs underline hover:text-red-300">
          Retry
        </button>
      </div>
    );
  }

  if (!analytics || analytics.totalAgents === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="mb-4 rounded-full bg-studio-panel p-4">
          <TrendingUp className="h-8 w-8 text-studio-muted" />
        </div>
        <p className="text-sm font-medium text-studio-text">No analytics yet</p>
        <p className="mt-1 text-xs text-studio-muted">
          Launch agents from the Launch Agent tab to start seeing performance data.
        </p>
      </div>
    );
  }

  const netCents = analytics.totalEarnedCents - analytics.totalSpentCents;
  const sortedByEarnings = [...analytics.agents].sort((a, b) => b.earningsCents - a.earningsCents);
  const topAgent = sortedByEarnings[0] ?? null;

  const PLATFORM_LABEL: Record<AgentPlatform, string> = {
    holomesh: 'HoloMesh',
    moltbook: 'Moltbook',
    custom: 'Custom',
  };

  return (
    <div className="max-w-5xl space-y-6">
      {/* Refresh */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-studio-text">Fleet Analytics</h2>
        <button
          onClick={loadAnalytics}
          className="rounded-lg border border-studio-border p-1.5 text-studio-muted hover:text-studio-text transition"
          title="Refresh"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Aggregate stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AnalyticsCard
          label="Total Agents"
          value={String(analytics.totalAgents)}
          sub={`${analytics.activeAgents} active, ${analytics.pausedAgents} paused`}
          color="#6366f1"
        />
        <AnalyticsCard
          label="Total Earned"
          value={formatUsd(analytics.totalEarnedCents)}
          sub="across all agents"
          color="#10b981"
        />
        <AnalyticsCard
          label="Total Spent"
          value={formatUsd(analytics.totalSpentCents)}
          sub="operational costs"
          color="#f59e0b"
        />
        <AnalyticsCard
          label="Net Revenue"
          value={formatUsd(netCents)}
          sub={netCents >= 0 ? 'profit' : 'loss'}
          color={netCents >= 0 ? '#10b981' : '#ef4444'}
        />
      </div>

      {/* Top agent highlight */}
      {topAgent && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Trophy className="h-4 w-4 text-amber-400" />
            <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Top Performing Agent</span>
          </div>
          <div className="flex items-center gap-6">
            <div>
              <div className="text-lg font-bold text-studio-text">{topAgent.name}</div>
              <div className="text-xs text-studio-muted">{PLATFORM_LABEL[topAgent.platform]}</div>
            </div>
            <div className="ml-auto grid grid-cols-3 gap-6 text-center">
              <div>
                <div className="text-sm font-bold text-emerald-400">{formatUsd(topAgent.earningsCents)}</div>
                <div className="text-[9px] text-studio-muted uppercase">Earned</div>
              </div>
              <div>
                <div className="text-sm font-bold text-indigo-400">{topAgent.reputation.toFixed(1)}</div>
                <div className="text-[9px] text-studio-muted uppercase">Reputation</div>
              </div>
              <div>
                <div className="text-sm font-bold text-studio-text">{formatUsd(topAgent.earningsCents - topAgent.spentCents)}</div>
                <div className="text-[9px] text-studio-muted uppercase">Net</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Per-agent breakdown */}
      <div className="rounded-xl border border-studio-border bg-[#111827] p-5">
        <h3 className="text-xs font-medium text-studio-muted mb-4 uppercase tracking-wider">Per-Agent Performance</h3>

        {sortedByEarnings.length === 0 ? (
          <p className="text-xs text-studio-muted text-center py-8">No agents to display</p>
        ) : (
          <div className="space-y-3">
            {/* Header */}
            <div className="grid grid-cols-12 gap-2 text-[10px] text-studio-muted uppercase tracking-wider px-3 py-1">
              <div className="col-span-3">Agent</div>
              <div className="col-span-2">Platform</div>
              <div className="col-span-1 text-right">Rep</div>
              <div className="col-span-2 text-right">Earned</div>
              <div className="col-span-2 text-right">Spent</div>
              <div className="col-span-2 text-right">Net</div>
            </div>

            {sortedByEarnings.map(agent => {
              const agentNet = agent.earningsCents - agent.spentCents;
              const maxEarned = sortedByEarnings[0]?.earningsCents || 1;
              const barWidth = maxEarned > 0 ? Math.max(2, (agent.earningsCents / maxEarned) * 100) : 2;

              return (
                <div key={agent.id} className="rounded-lg border border-studio-border bg-[#0f172a] p-3 transition hover:border-studio-accent/30">
                  <div className="grid grid-cols-12 gap-2 items-center text-xs">
                    <div className="col-span-3 font-medium text-studio-text truncate">{agent.name}</div>
                    <div className="col-span-2 text-studio-muted">{PLATFORM_LABEL[agent.platform]}</div>
                    <div className="col-span-1 text-right text-indigo-400 font-mono">{agent.reputation.toFixed(1)}</div>
                    <div className="col-span-2 text-right text-emerald-400 font-mono">{formatUsd(agent.earningsCents)}</div>
                    <div className="col-span-2 text-right text-amber-400 font-mono">{formatUsd(agent.spentCents)}</div>
                    <div className={`col-span-2 text-right font-mono font-bold ${agentNet >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {formatUsd(agentNet)}
                    </div>
                  </div>
                  {/* Earnings bar */}
                  <div className="mt-2 h-1.5 rounded-full bg-studio-border overflow-hidden">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all ${widthClassFromPercent(barWidth)}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Cost vs Revenue summary */}
      <div className="rounded-xl border border-studio-border bg-[#111827] p-5">
        <h3 className="text-xs font-medium text-studio-muted mb-4 uppercase tracking-wider">Cost vs Revenue</h3>
        <div className="space-y-3">
          {sortedByEarnings.map(agent => {
            const total = Math.max(agent.earningsCents + agent.spentCents, 1);
            const earnPct = (agent.earningsCents / total) * 100;
            const spendPct = (agent.spentCents / total) * 100;

            return (
              <div key={agent.id} className="flex items-center gap-3">
                <div className="w-28 shrink-0 text-xs text-studio-text truncate">{agent.name}</div>
                <div className="flex-1 flex h-3 rounded-full overflow-hidden bg-studio-border">
                  <div
                    className={`h-full bg-emerald-500/70 transition-all ${widthClassFromPercent(earnPct)}`}
                    title={`Earned: ${formatUsd(agent.earningsCents)}`}
                  />
                  <div
                    className={`h-full bg-red-500/70 transition-all ${widthClassFromPercent(spendPct)}`}
                    title={`Spent: ${formatUsd(agent.spentCents)}`}
                  />
                </div>
                <div className="w-20 shrink-0 text-right text-[10px] text-studio-muted">
                  {formatUsd(agent.earningsCents - agent.spentCents)}
                </div>
              </div>
            );
          })}
          <div className="flex items-center gap-4 mt-2 text-[10px] text-studio-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500/70" /> Revenue
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-red-500/70" /> Cost
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Subcomponents ────────────────────────────────────────────────────────────

function AnalyticsCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  const valueColorClass =
    color === '#6366f1'
      ? 'text-indigo-500'
      : color === '#10b981'
        ? 'text-emerald-500'
        : color === '#f59e0b'
          ? 'text-amber-500'
          : color === '#ef4444'
            ? 'text-red-500'
            : 'text-studio-text';

  return (
    <div className="rounded-xl border border-studio-border bg-[#111827] p-4">
      <div className={`text-2xl font-bold ${valueColorClass}`}>{value}</div>
      <div className="text-xs font-medium text-studio-text mt-1">{label}</div>
      <div className="text-[10px] text-studio-muted mt-0.5">{sub}</div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatUsd(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}
