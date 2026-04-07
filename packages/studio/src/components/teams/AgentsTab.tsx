'use client';

/**
 * AgentsTab — Team agent profiles panel embedded in team workspace.
 *
 * Shows the 4 agent slots (Brittney, Daemon, Absorb, Oracle) with
 * their status, current task, and last action. Includes a "Load Agents"
 * button that triggers agent loading.
 *
 * @module components/teams/AgentsTab
 */

import React, { useState, useEffect, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AgentSlot {
  name: string;
  role: string;
  description: string;
  status: 'online' | 'offline' | 'busy' | 'error';
  currentTask: string | null;
  lastAction: string | null;
  lastActionAt: string | null;
  icon: string;
}

// ---------------------------------------------------------------------------
// Default agent slots
// ---------------------------------------------------------------------------

const DEFAULT_AGENTS: AgentSlot[] = [
  {
    name: 'Brittney',
    role: 'Orchestrator',
    description: 'Business-to-simulation orchestrator. Describe what you want, she builds it.',
    status: 'offline',
    currentTask: null,
    lastAction: null,
    lastActionAt: null,
    icon: 'B',
  },
  {
    name: 'Daemon',
    role: 'Executor',
    description: 'Headless skill executor. Runs .hsplus compositions as always-on daemons.',
    status: 'offline',
    currentTask: null,
    lastAction: null,
    lastActionAt: null,
    icon: 'D',
  },
  {
    name: 'Absorb',
    role: 'Analyst',
    description: 'Codebase intelligence agent. Scans repos into knowledge graphs for GraphRAG.',
    status: 'offline',
    currentTask: null,
    lastAction: null,
    lastActionAt: null,
    icon: 'A',
  },
  {
    name: 'Oracle',
    role: 'Researcher',
    description: 'Knowledge oracle. Synthesizes cross-domain insights and publishes discoveries.',
    status: 'offline',
    currentTask: null,
    lastAction: null,
    lastActionAt: null,
    icon: 'O',
  },
];

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<string, { dot: string; label: string; bg: string }> = {
  online: { dot: 'bg-green-400', label: 'Online', bg: 'bg-green-500/10 text-green-400' },
  offline: { dot: 'bg-gray-500', label: 'Offline', bg: 'bg-studio-panel text-studio-muted' },
  busy: { dot: 'bg-yellow-400 animate-pulse', label: 'Busy', bg: 'bg-yellow-500/10 text-yellow-400' },
  error: { dot: 'bg-red-400', label: 'Error', bg: 'bg-red-500/10 text-red-400' },
};

const AGENT_COLORS: Record<string, string> = {
  Brittney: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  Daemon: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  Absorb: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  Oracle: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
// Agent Card
// ---------------------------------------------------------------------------

function AgentCard({ agent }: { agent: AgentSlot }) {
  const statusCfg = STATUS_CONFIG[agent.status];
  const colorClass = AGENT_COLORS[agent.name] || 'bg-studio-panel text-studio-muted border-studio-border';

  return (
    <div className="rounded-xl border border-studio-border bg-[#111827] p-5 transition-all hover:border-studio-accent/20">
      <div className="flex items-start gap-4">
        {/* Agent avatar */}
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border text-lg font-bold ${colorClass}`}>
          {agent.icon}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-studio-text">{agent.name}</h3>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusCfg.bg}`}>
              <span className="inline-flex items-center gap-1">
                <span className={`h-1.5 w-1.5 rounded-full ${statusCfg.dot}`} />
                {statusCfg.label}
              </span>
            </span>
          </div>
          <div className="mt-0.5 text-xs text-studio-accent">{agent.role}</div>
          <p className="mt-1 text-xs text-studio-muted">{agent.description}</p>
        </div>
      </div>

      {/* Current task & last action */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-[#0f172a] p-3">
          <div className="text-[10px] uppercase tracking-wider text-studio-muted mb-1">Current Task</div>
          {agent.currentTask ? (
            <div className="text-xs text-studio-text line-clamp-2">{agent.currentTask}</div>
          ) : (
            <div className="text-xs text-studio-muted/50 italic">None</div>
          )}
        </div>
        <div className="rounded-lg bg-[#0f172a] p-3">
          <div className="text-[10px] uppercase tracking-wider text-studio-muted mb-1">Last Action</div>
          {agent.lastAction ? (
            <>
              <div className="text-xs text-studio-text line-clamp-1">{agent.lastAction}</div>
              {agent.lastActionAt && (
                <div className="mt-0.5 text-[10px] text-studio-muted">{timeSince(agent.lastActionAt)}</div>
              )}
            </>
          ) : (
            <div className="text-xs text-studio-muted/50 italic">None</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Export
// ---------------------------------------------------------------------------

export function AgentsTab({ teamId }: { teamId: string }) {
  const [agents, setAgents] = useState<AgentSlot[]>(DEFAULT_AGENTS);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [loadResult, setLoadResult] = useState<string | null>(null);

  // Try to enrich agent data from team members endpoint
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/holomesh/team/${teamId}`);
        if (!res.ok) return;
        const data: { team?: { members?: Array<{ agentName: string; role: string; online: boolean }> } } = await res.json();
        const members = data.team?.members || [];

        if (!cancelled && members.length > 0) {
          setAgents((prev) =>
            prev.map((agent) => {
              const member = members.find(
                (m) => m.agentName.toLowerCase() === agent.name.toLowerCase()
              );
              if (member) {
                return {
                  ...agent,
                  status: member.online ? 'online' as const : 'offline' as const,
                  role: member.role || agent.role,
                };
              }
              return agent;
            })
          );
        }
      } catch {
        /* team fetch failed, use defaults */
      }
    })();
    return () => { cancelled = true; };
  }, [teamId]);

  const handleLoadAgents = useCallback(async () => {
    setLoadingAgents(true);
    setLoadResult(null);
    try {
      const res = await fetch(`/api/holomesh/team/${teamId}/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'load_agents' }),
      });
      if (res.ok) {
        const data: { message?: string } = await res.json();
        setLoadResult(data.message || 'Agents loaded successfully');
        // Update status for all agents to online
        setAgents((prev) =>
          prev.map((a) => ({ ...a, status: 'online' as const }))
        );
      } else {
        const errData: { error?: string } = await res.json().catch(() => ({}));
        setLoadResult(errData.error || `Failed (${res.status})`);
      }
    } catch (err) {
      setLoadResult((err as Error).message);
    } finally {
      setLoadingAgents(false);
    }
  }, [teamId]);

  const onlineCount = agents.filter((a) => a.status === 'online' || a.status === 'busy').length;

  return (
    <div className="flex flex-col gap-0 h-full">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between border-b border-studio-border bg-[#0d0d14] px-4 py-2.5">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-studio-text">Agent Slots</span>
          <span className="rounded-full bg-studio-panel px-2 py-0.5 text-[10px] text-studio-muted">
            {onlineCount}/{agents.length} online
          </span>
        </div>
        <div className="flex items-center gap-2">
          {loadResult && (
            <span className={`text-[10px] ${loadResult.includes('Failed') || loadResult.includes('Error') ? 'text-red-400' : 'text-green-400'}`}>
              {loadResult}
            </span>
          )}
          <button
            onClick={handleLoadAgents}
            disabled={loadingAgents}
            className="rounded-lg bg-studio-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-studio-accent/80 disabled:opacity-50"
          >
            {loadingAgents ? 'Loading...' : 'Load Agents'}
          </button>
        </div>
      </div>

      {/* Agent grid */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid gap-4 lg:grid-cols-2">
          {agents.map((agent) => (
            <AgentCard key={agent.name} agent={agent} />
          ))}
        </div>
      </div>
    </div>
  );
}
