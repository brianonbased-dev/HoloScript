'use client';

/**
 * /absorb — Paid AI-Powered Project Management Service.
 *
 * 4-tab layout: Dashboard, Projects, Credits, Pricing.
 * Unauthenticated users see a landing page with pricing.
 * Authenticated users manage projects and credits.
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { logger } from '@/lib/logger';
import { useAbsorbService } from '@/hooks/useAbsorbService';
import { useToast } from '@/app/providers';
import { CREDIT_PACKAGES } from '@/lib/absorb/pricing';
import type {
  MoltbookAgent,
  MoltbookAgentStatus,
  MoltbookAgentEvent,
} from '@/lib/stores/absorbServiceStore';
import { HoloSurfaceRenderer, useHoloComposition } from '@/components/holo-surface';
import {
  useDaemonJobs,
  useDaemonJobPoller,
  type DaemonJob,
  type DaemonProfile,
  type DaemonTelemetrySummary,
} from '@/hooks/useDaemonJobs';
import {
  CreditBalanceCard,
  ProjectCard,
  NewProjectForm,
  CreditPackageCard,
  OperationCostTable,
  TierComparisonTable,
  PricingTab,
  ToolsTab,
  timeSince,
  formatTime,
} from './components';

// ─── Types ────────────────────────────────────────────────────────────────────

type AbsorbTab = 'dashboard' | 'projects' | 'agents' | 'daemon-ops' | 'credits' | 'tools';
type QualityTierOption = 'low' | 'medium' | 'high' | 'ultra';

// ─── Sub-Components ───────────────────────────────────────────────────────────

// CreditBalanceCard moved to ./components/CreditBalanceCard.tsx

// ProjectCard moved to ./components/ProjectCard.tsx

// CreditPackageCard moved to ./components/PricingSection.tsx

// OperationCostTable moved to ./components/PricingSection.tsx

// TierComparisonTable moved to ./components/PricingSection.tsx

// NewProjectForm moved to ./components/NewProjectForm.tsx

// Utility functions moved to ./components/utils.ts

// ─── Landing Page (Unauthenticated) ───────────────────────────────────────────

function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-studio-bg text-studio-text">
      {/* Hero -- single CTA */}
      <header className="border-b border-studio-border bg-[#0d0d14] px-6 py-16 text-center">
        <h1 className="text-4xl font-bold tracking-tight">Absorb Intelligence</h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-studio-muted">
          Point it at your codebase. Get a knowledge graph, AI-powered search, and
          automated improvements. Multi-model AI pipeline.
        </p>
        <div className="mt-8">
          <Link
            href="/api/auth/signin"
            className="rounded-lg bg-studio-accent px-8 py-3 text-sm font-semibold text-white hover:bg-studio-accent/80 transition-colors"
          >
            Get Started Free
          </Link>
        </div>
        <p className="mt-3 text-xs text-studio-muted">
          Free tier included. No credit card required.
        </p>
      </header>

      {/* Three pillars */}
      <section className="border-b border-studio-border px-6 py-16">
        <div className="mx-auto grid max-w-4xl gap-8 md:grid-cols-3">
          {[
            {
              title: 'Absorb',
              desc: 'Deep codebase analysis. Patterns, dependencies, quality metrics. Understand your code in seconds.',
            },
            {
              title: 'Improve',
              desc: 'AI-driven fixes. Type errors, test failures, lint issues -- fixed automatically and explained.',
            },
            {
              title: 'Pipeline',
              desc: '3-layer recursive self-improvement. Code fixer, strategy optimizer, and meta-strategist.',
            },
          ].map((f) => (
            <div key={f.title} className="rounded-xl border border-studio-border bg-[#111827] p-6">
              <h3 className="text-lg font-semibold text-studio-text">{f.title}</h3>
              <p className="mt-2 text-sm text-studio-muted">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="px-6 py-16">
        <PricingTab onPurchase={() => { window.location.href = '/api/auth/signin'; }} />
      </section>

      {/* Footer */}
      <footer className="border-t border-studio-border bg-[#0d0d14] px-6 py-4">
        <div className="flex items-center justify-between text-[10px] text-studio-muted">
          <span>HoloScript Absorb Service</span>
          <span>
            <Link href="/" className="hover:text-studio-text">Home</Link>
            {' \u2022 '}
            <Link href="/holodaemon" className="hover:text-studio-text">Daemon</Link>
            {' \u2022 '}
            <Link href="/holoclaw" className="hover:text-studio-text">HoloClaw</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}

// ToolsTab, CreditBalanceCard, ProjectCard, NewProjectForm, PricingSection, utils
// all moved to ./components/ — see barrel export in ./components/index.ts

// Placeholder to mark where ~280 lines of dead ToolsTab code was removed.
// The ToolsTab is now imported from ./components/ToolsTab.tsx.
const _TOOLS_TAB_REMOVED = true; // eslint-disable-line @typescript-eslint/no-unused-vars
// ─── Moltbook Agent Helpers ──────────────────────────────────────────────────

type HealthLevel = 'green' | 'yellow' | 'red' | 'stopped';

const HEALTH_BADGE: Record<HealthLevel, { bg: string; text: string; dot: string; label: string }> =
  {
    green: {
      bg: 'bg-green-500/10 border-green-500/20',
      text: 'text-green-400',
      dot: 'bg-green-400',
      label: 'Healthy',
    },
    yellow: {
      bg: 'bg-yellow-500/10 border-yellow-500/20',
      text: 'text-yellow-400',
      dot: 'bg-yellow-400',
      label: 'Warning',
    },
    red: {
      bg: 'bg-red-500/10 border-red-500/20',
      text: 'text-red-400',
      dot: 'bg-red-400',
      label: 'Unhealthy',
    },
    stopped: {
      bg: 'bg-studio-bg border-studio-border',
      text: 'text-studio-muted',
      dot: 'bg-studio-muted',
      label: 'Stopped',
    },
  };

const PILLARS = ['research', 'infrastructure', 'showcase', 'community'] as const;

function getAgentHealth(agent: MoltbookAgent): HealthLevel {
  if (!agent.heartbeatEnabled) return 'stopped';
  const hours = agent.lastHeartbeat
    ? (Date.now() - new Date(agent.lastHeartbeat).getTime()) / 3_600_000
    : Infinity;
  if (hours > 4 || (agent.challengeFailures ?? 0) >= 3) return 'red';
  if (hours > 1 || (agent.challengeFailures ?? 0) >= 1) return 'yellow';
  return 'green';
}

// formatTime imported from ./components/utils.ts

// ─── Agent Config Editor ─────────────────────────────────────────────────────

function AgentConfigEditor({ agent, onSaved }: { agent: MoltbookAgent; onSaved: () => void }) {
  const { updateMoltbookAgent, fetchMoltbookAgents } = useAbsorbService();
  const { addToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pillars, setPillars] = useState<string[]>(agent.config.pillars || []);
  const [submolts, setSubmolts] = useState(agent.config.submolts?.join(', ') || '');
  const [searchTopics, setSearchTopics] = useState(agent.config.searchTopics?.join(', ') || '');
  const [persona, setPersona] = useState(agent.config.persona || '');

  const togglePillar = (p: string) => {
    setPillars((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  };

  const handleSave = async () => {
    setSaving(true);
    const updated = await updateMoltbookAgent(agent.id, {
      config: {
        pillars,
        submolts: submolts
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        searchTopics: searchTopics
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        persona,
      },
    });
    if (updated) {
      addToast('Config saved', 'success');
      setEditing(false);
      await fetchMoltbookAgents();
      onSaved();
    } else {
      addToast('Failed to save config', 'error');
    }
    setSaving(false);
  };

  const handleCancel = () => {
    setPillars(agent.config.pillars || []);
    setSubmolts(agent.config.submolts?.join(', ') || '');
    setSearchTopics(agent.config.searchTopics?.join(', ') || '');
    setPersona(agent.config.persona || '');
    setEditing(false);
  };

  if (!editing) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h5 className="text-[10px] font-semibold uppercase tracking-wider text-studio-muted">
            Configuration
          </h5>
          <button
            onClick={() => setEditing(true)}
            className="text-[10px] text-studio-accent hover:underline"
          >
            Edit
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-studio-muted">Pillars:</span>{' '}
            <span className="text-studio-text">{agent.config.pillars?.join(', ') || 'None'}</span>
          </div>
          <div>
            <span className="text-studio-muted">Submolts:</span>{' '}
            <span className="text-studio-text">{agent.config.submolts?.join(', ') || 'None'}</span>
          </div>
          <div>
            <span className="text-studio-muted">Topics:</span>{' '}
            <span className="text-studio-text">
              {agent.config.searchTopics?.join(', ') || 'None'}
            </span>
          </div>
          <div>
            <span className="text-studio-muted">Persona:</span>{' '}
            <span className="text-studio-text truncate">{agent.config.persona || 'Default'}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h5 className="text-[10px] font-semibold uppercase tracking-wider text-studio-muted">
        Edit Configuration
      </h5>
      <div>
        <label className="text-[10px] text-studio-muted">Pillars</label>
        <div className="flex gap-1.5 mt-1">
          {PILLARS.map((p) => (
            <button
              key={p}
              onClick={() => togglePillar(p)}
              className={`rounded px-2 py-1 text-[10px] font-medium border transition-colors ${
                pillars.includes(p)
                  ? 'bg-studio-accent/20 text-studio-accent border-studio-accent/30'
                  : 'bg-studio-bg text-studio-muted border-studio-border hover:border-studio-accent/20'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      <label className="block text-[10px] text-studio-muted">
        Submolts <span className="text-studio-muted/50">(comma separated)</span>
        <input
          type="text"
          value={submolts}
          onChange={(e) => setSubmolts(e.target.value)}
          placeholder="general, ai_agents"
          className="mt-1 block w-full rounded-lg border border-studio-border bg-[#0f172a] px-2.5 py-1.5 text-xs text-studio-text focus:border-studio-accent focus:outline-none"
        />
      </label>
      <label className="block text-[10px] text-studio-muted">
        Search Topics <span className="text-studio-muted/50">(comma separated)</span>
        <input
          type="text"
          value={searchTopics}
          onChange={(e) => setSearchTopics(e.target.value)}
          placeholder="MCP, agents, security"
          className="mt-1 block w-full rounded-lg border border-studio-border bg-[#0f172a] px-2.5 py-1.5 text-xs text-studio-text focus:border-studio-accent focus:outline-none"
        />
      </label>
      <label className="block text-[10px] text-studio-muted">
        Persona
        <textarea
          rows={3}
          value={persona}
          onChange={(e) => setPersona(e.target.value)}
          placeholder="Custom agent identity..."
          className="mt-1 block w-full rounded-lg border border-studio-border bg-[#0f172a] px-2.5 py-1.5 text-xs text-studio-text focus:border-studio-accent focus:outline-none resize-none"
        />
      </label>
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-studio-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-studio-accent/80 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button
          onClick={handleCancel}
          className="rounded-lg bg-studio-bg px-3 py-1.5 text-xs font-medium text-studio-muted border border-studio-border hover:border-studio-accent/20"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Agent Activity Feed ─────────────────────────────────────────────────────

function AgentActivityFeed({ agentId }: { agentId: string }) {
  const { fetchMoltbookAgentEvents } = useAbsorbService();
  const [events, setEvents] = useState<MoltbookAgentEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    setLoading(true);
    fetchMoltbookAgentEvents(agentId, 20).then((evts) => {
      setEvents(evts);
      setLoading(false);
    });
  }, [agentId, expanded, fetchMoltbookAgentEvents]);

  const typeColors: Record<string, string> = {
    created: 'text-emerald-400',
    started: 'text-green-400',
    stopped: 'text-yellow-400',
    triggered: 'text-blue-400',
    config_updated: 'text-purple-400',
    error: 'text-red-400',
  };

  return (
    <div className="mt-3 pt-3 border-t border-studio-border/50">
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-[10px] font-medium text-studio-accent hover:underline"
      >
        {expanded ? 'Hide' : 'Show'} Activity Log
      </button>
      {expanded && (
        <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-studio-border bg-[#0f172a] p-3 space-y-1.5">
          {loading ? (
            <div className="text-[10px] text-studio-muted animate-pulse">Loading events...</div>
          ) : events.length === 0 ? (
            <div className="text-[10px] text-studio-muted">No events recorded yet.</div>
          ) : (
            events.map((evt) => (
              <div key={evt.id} className="flex items-baseline gap-2 text-[10px]">
                <span className="text-studio-muted shrink-0">{formatTime(evt.createdAt)}</span>
                <span className={`font-medium ${typeColors[evt.eventType] || 'text-studio-text'}`}>
                  {evt.eventType.replace(/_/g, ' ')}
                </span>
                {evt.details && Object.keys(evt.details).length > 0 && (
                  <span className="text-studio-muted truncate">{JSON.stringify(evt.details)}</span>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Agent Detail Panel ──────────────────────────────────────────────────────

function AgentDetailPanel({
  agent,
  status,
  loading,
  onSaved,
}: {
  agent: MoltbookAgent;
  status: MoltbookAgentStatus | null;
  loading: boolean;
  onSaved: () => void;
}) {
  return (
    <div className="rounded-xl border border-studio-border bg-[#0d1117] p-5 mt-2 space-y-4">
      {loading ? (
        <div className="text-xs text-studio-muted animate-pulse">Loading agent details...</div>
      ) : (
        <>
          <AgentConfigEditor agent={agent} onSaved={onSaved} />

          <div className="space-y-2">
            <h5 className="text-[10px] font-semibold uppercase tracking-wider text-studio-muted">
              Status Details
            </h5>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
              <div>
                <span className="text-studio-muted">Created:</span>{' '}
                <span className="text-studio-text">{formatTime(agent.createdAt)}</span>
              </div>
              <div>
                <span className="text-studio-muted">Last heartbeat:</span>{' '}
                <span className="text-studio-text">{formatTime(agent.lastHeartbeat)}</span>
              </div>
              <div>
                <span className="text-studio-muted">LLM Spend:</span>{' '}
                <span className="text-studio-text">
                  ${(agent.totalLlmSpentCents / 100).toFixed(2)}
                </span>
              </div>
              <div>
                <span className="text-studio-muted">Challenge failures:</span>{' '}
                <span
                  className={`font-medium ${(agent.challengeFailures ?? 0) > 0 ? 'text-red-400' : 'text-studio-text'}`}
                >
                  {agent.challengeFailures ?? 0}
                </span>
              </div>
            </div>
          </div>

          {status?.heartbeatState && (
            <div className="space-y-2">
              <h5 className="text-[10px] font-semibold uppercase tracking-wider text-studio-muted">
                Heartbeat State
              </h5>
              <pre className="rounded-lg border border-studio-border bg-[#0f172a] p-3 text-[10px] text-studio-text overflow-x-auto max-h-32">
                {JSON.stringify(status.heartbeatState, null, 2)}
              </pre>
            </div>
          )}

          <AgentActivityFeed agentId={agent.id} />
        </>
      )}
    </div>
  );
}

// ─── Moltbook Agents Tab ────────────────────────────────────────────────────────

function MoltbookAgentsTab() {
  const {
    moltbookAgents,
    moltbookSummary,
    fetchMoltbookAgents,
    fetchMoltbookSummary,
    createMoltbookAgent,
    deleteMoltbookAgent,
    startMoltbookAgent,
    stopMoltbookAgent,
    triggerMoltbookHeartbeat,
    fetchMoltbookAgentStatus,
    projects,
  } = useAbsorbService();
  const { addToast } = useToast();

  // Form state
  const [projectId, setProjectId] = useState('');
  const [agentName, setAgentName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  // Action + expansion state
  const [actionLoading, setActionLoading] = useState<Record<string, string>>({});
  const [expandedAgentId, setExpandedAgentId] = useState<string | null>(null);
  const [agentStatus, setAgentStatus] = useState<MoltbookAgentStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);

  // Filter + sort state
  const [searchFilter, setSearchFilter] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'posts' | 'lastActive' | 'spend'>('name');
  const [bulkLoading, setBulkLoading] = useState<'start' | 'stop' | null>(null);

  // Auto-refresh (30s)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    timerRef.current = setInterval(() => {
      fetchMoltbookAgents();
      fetchMoltbookSummary();
    }, 30_000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchMoltbookAgents, fetchMoltbookSummary]);

  // Filtered + sorted agents
  const filteredAgents = useMemo(() => {
    let list = moltbookAgents;
    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase();
      list = list.filter((a) => a.agentName.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.agentName.localeCompare(b.agentName);
        case 'posts':
          return b.totalPostsGenerated - a.totalPostsGenerated;
        case 'lastActive':
          return (
            new Date(b.lastHeartbeat || 0).getTime() - new Date(a.lastHeartbeat || 0).getTime()
          );
        case 'spend':
          return b.totalLlmSpentCents - a.totalLlmSpentCents;
        default:
          return 0;
      }
    });
  }, [moltbookAgents, searchFilter, sortBy]);

  // Handlers
  const handleCreate = async () => {
    if (!projectId || !agentName || !apiKey) return;
    setCreating(true);
    setError('');
    const agent = await createMoltbookAgent(projectId, agentName, apiKey);
    if (agent) {
      setAgentName('');
      setApiKey('');
      addToast('Agent created', 'success');
      fetchMoltbookAgents();
    } else {
      setError('Failed to create agent');
      addToast('Failed to create agent', 'error');
    }
    setCreating(false);
  };

  const handleToggle = async (agentId: string, currentlyEnabled: boolean) => {
    setActionLoading((prev) => ({ ...prev, [agentId]: 'toggle' }));
    const ok = currentlyEnabled
      ? await stopMoltbookAgent(agentId)
      : await startMoltbookAgent(agentId);
    if (ok) {
      addToast(`Agent ${currentlyEnabled ? 'stopped' : 'started'}`, 'success');
      await fetchMoltbookAgents();
    } else {
      addToast('Action failed', 'error');
    }
    setActionLoading((prev) => {
      const n = { ...prev };
      delete n[agentId];
      return n;
    });
  };

  const handleTrigger = async (agentId: string) => {
    setActionLoading((prev) => ({ ...prev, [agentId]: 'trigger' }));
    const ok = await triggerMoltbookHeartbeat(agentId);
    if (ok) {
      addToast('Heartbeat triggered', 'success');
    } else {
      addToast('Trigger failed', 'error');
    }
    await fetchMoltbookAgents();
    setActionLoading((prev) => {
      const n = { ...prev };
      delete n[agentId];
      return n;
    });
  };

  const handleDelete = async (agent: MoltbookAgent) => {
    if (!confirm(`Delete agent "${agent.agentName}"?`)) return;
    const ok = await deleteMoltbookAgent(agent.id);
    if (ok) addToast('Agent deleted', 'success');
    else addToast('Failed to delete agent', 'error');
  };

  const handleExpand = async (agentId: string) => {
    if (expandedAgentId === agentId) {
      setExpandedAgentId(null);
      setAgentStatus(null);
      return;
    }
    setExpandedAgentId(agentId);
    setStatusLoading(true);
    const status = await fetchMoltbookAgentStatus(agentId);
    setAgentStatus(status);
    setStatusLoading(false);
  };

  const handleStartAll = async () => {
    const stopped = moltbookAgents.filter((a) => !a.heartbeatEnabled);
    if (stopped.length === 0) return;
    setBulkLoading('start');
    for (const agent of stopped) await startMoltbookAgent(agent.id);
    await fetchMoltbookAgents();
    addToast(`Started ${stopped.length} agents`, 'success');
    setBulkLoading(null);
  };

  const handleStopAll = async () => {
    const running = moltbookAgents.filter((a) => a.heartbeatEnabled);
    if (running.length === 0) return;
    setBulkLoading('stop');
    for (const agent of running) await stopMoltbookAgent(agent.id);
    await fetchMoltbookAgents();
    addToast(`Stopped ${running.length} agents`, 'success');
    setBulkLoading(null);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      {/* HoloMesh Registration Banner */}
      <div className="flex items-center gap-4 rounded-xl border border-purple-500/30 bg-purple-500/5 p-4">
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-purple-300">Deploy to HoloMesh</h3>
          <p className="mt-0.5 text-xs text-studio-muted">
            Register an agent on HoloMesh to share knowledge, earn reputation, and join the network.
            Moltbook agents post to social — HoloMesh agents trade knowledge.
          </p>
        </div>
        <Link
          href="/holomesh/onboard"
          className="shrink-0 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-500 transition-colors"
        >
          Register on HoloMesh
        </Link>
      </div>

      {/* Summary Cards */}
      {moltbookSummary && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="rounded-xl border border-studio-border bg-[#111827] p-5">
            <h3 className="text-sm font-semibold text-studio-text">Active Agents</h3>
            <p className="mt-2 text-2xl font-bold text-studio-accent">
              {moltbookSummary.activeAgents}
            </p>
          </div>
          <div className="rounded-xl border border-studio-border bg-[#111827] p-5">
            <h3 className="text-sm font-semibold text-studio-text">Total Posts</h3>
            <p className="mt-2 text-2xl font-bold text-studio-accent">
              {moltbookSummary.totalPosts}
            </p>
          </div>
          <div className="rounded-xl border border-studio-border bg-[#111827] p-5">
            <h3 className="text-sm font-semibold text-studio-text">Total Comments</h3>
            <p className="mt-2 text-2xl font-bold text-studio-accent">
              {moltbookSummary.totalComments}
            </p>
          </div>
          <div className="rounded-xl border border-studio-border bg-[#111827] p-5">
            <h3 className="text-sm font-semibold text-studio-text">Total Upvotes</h3>
            <p className="mt-2 text-2xl font-bold text-studio-accent">
              {moltbookSummary.totalUpvotesGiven ?? 0}
            </p>
          </div>
          <div className="rounded-xl border border-studio-border bg-[#111827] p-5">
            <h3 className="text-sm font-semibold text-studio-text">Avg Posts/Agent</h3>
            <p className="mt-2 text-2xl font-bold text-studio-accent">
              {moltbookSummary.totalAgents > 0
                ? (moltbookSummary.totalPosts / moltbookSummary.totalAgents).toFixed(1)
                : '0'}
            </p>
          </div>
          <div className="rounded-xl border border-studio-border bg-[#111827] p-5">
            <h3 className="text-sm font-semibold text-studio-text">LLM Spend</h3>
            <p className="mt-2 text-2xl font-bold text-studio-accent">
              ${(moltbookSummary.totalLlmSpentCents / 100).toFixed(2)}
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-4">
          {/* Header with bulk ops */}
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-studio-text">
              Agents (
              {searchFilter
                ? `${filteredAgents.length}/${moltbookAgents.length}`
                : moltbookAgents.length}
              )
            </h3>
            <button
              onClick={handleStartAll}
              disabled={!!bulkLoading || !moltbookAgents.some((a) => !a.heartbeatEnabled)}
              className="rounded bg-green-500/10 px-2.5 py-1 text-[10px] font-medium text-green-400 hover:bg-green-500/20 disabled:opacity-50"
            >
              {bulkLoading === 'start' ? 'Starting...' : 'Start All'}
            </button>
            <button
              onClick={handleStopAll}
              disabled={!!bulkLoading || !moltbookAgents.some((a) => a.heartbeatEnabled)}
              className="rounded bg-yellow-500/10 px-2.5 py-1 text-[10px] font-medium text-yellow-400 hover:bg-yellow-500/20 disabled:opacity-50"
            >
              {bulkLoading === 'stop' ? 'Stopping...' : 'Stop All'}
            </button>
          </div>

          {/* Filter + sort */}
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Filter agents..."
              className="flex-1 rounded-lg border border-studio-border bg-[#0f172a] px-3 py-2 text-sm text-studio-text placeholder:text-studio-muted/50 focus:border-studio-accent focus:outline-none"
            />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="rounded-lg border border-studio-border bg-[#0f172a] px-3 py-2 text-sm text-studio-text focus:border-studio-accent focus:outline-none"
            >
              <option value="name">Sort: Name</option>
              <option value="posts">Sort: Posts</option>
              <option value="lastActive">Sort: Last Active</option>
              <option value="spend">Sort: Spend</option>
            </select>
          </div>

          {/* Agent list */}
          {filteredAgents.length === 0 ? (
            <div className="text-center py-12 text-sm text-studio-muted border border-dashed border-studio-border rounded-xl">
              {moltbookAgents.length === 0
                ? 'No agents yet. Create one to start posting on Moltbook.'
                : 'No agents match the filter.'}
            </div>
          ) : (
            filteredAgents.map((agent) => {
              const loading = actionLoading[agent.id];
              const health = getAgentHealth(agent);
              const badge = HEALTH_BADGE[health];
              const isExpanded = expandedAgentId === agent.id;
              return (
                <div key={agent.id}>
                  <div
                    className={`rounded-xl border bg-[#111827] p-5 cursor-pointer transition-colors ${
                      isExpanded
                        ? 'border-studio-accent/40'
                        : 'border-studio-border hover:border-studio-border/80'
                    }`}
                    onClick={() => handleExpand(agent.id)}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-3">
                        <h4 className="font-semibold text-studio-text">{agent.agentName}</h4>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium border ${badge.bg} ${badge.text}`}
                        >
                          <span className={`inline-block h-1.5 w-1.5 rounded-full ${badge.dot}`} />
                          {badge.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleTrigger(agent.id)}
                          disabled={!!loading}
                          title="Trigger heartbeat now"
                          className="rounded bg-studio-accent/10 px-2.5 py-1.5 text-xs font-medium text-studio-accent hover:bg-studio-accent/20 disabled:opacity-50"
                        >
                          {loading === 'trigger' ? 'Running...' : 'Trigger'}
                        </button>
                        <button
                          onClick={() => handleToggle(agent.id, agent.heartbeatEnabled)}
                          disabled={!!loading}
                          className={`rounded px-2.5 py-1.5 text-xs font-medium disabled:opacity-50 ${
                            agent.heartbeatEnabled
                              ? 'bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20'
                              : 'bg-green-500/10 text-green-400 hover:bg-green-500/20'
                          }`}
                        >
                          {loading === 'toggle' ? '...' : agent.heartbeatEnabled ? 'Stop' : 'Start'}
                        </button>
                        <button
                          onClick={() => handleDelete(agent)}
                          disabled={!!loading}
                          className="rounded bg-red-500/10 px-2.5 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/20 disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-studio-muted mt-2">
                      Last heartbeat:{' '}
                      <span className="text-studio-text">{formatTime(agent.lastHeartbeat)}</span>
                      <span className="mx-2">|</span>
                      Project:{' '}
                      <span className="font-mono text-[10px] bg-studio-bg px-1 rounded">
                        {agent.projectId.slice(0, 8)}
                      </span>
                    </p>
                    <div className="flex gap-4 mt-3 text-xs">
                      <span className="text-studio-muted">
                        Posts:{' '}
                        <span className="text-studio-text font-medium">
                          {agent.totalPostsGenerated}
                        </span>
                      </span>
                      <span className="text-studio-muted">
                        Comments:{' '}
                        <span className="text-studio-text font-medium">
                          {agent.totalCommentsGenerated}
                        </span>
                      </span>
                      <span className="text-studio-muted">
                        Upvotes:{' '}
                        <span className="text-studio-text font-medium">
                          {agent.totalUpvotesGiven ?? 0}
                        </span>
                      </span>
                      <span className="text-studio-muted">
                        Spend:{' '}
                        <span className="text-studio-text font-medium">
                          ${(agent.totalLlmSpentCents / 100).toFixed(2)}
                        </span>
                      </span>
                      {(agent.challengeFailures ?? 0) > 0 && (
                        <span className="text-red-400">
                          Failures: <span className="font-medium">{agent.challengeFailures}</span>
                        </span>
                      )}
                    </div>
                  </div>
                  {isExpanded && (
                    <AgentDetailPanel
                      agent={agent}
                      status={agentStatus}
                      loading={statusLoading}
                      onSaved={() => handleExpand(agent.id)}
                    />
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Create form */}
        <div className="rounded-xl border border-studio-border bg-[#111827] p-5 self-start">
          <h3 className="text-sm font-semibold text-studio-text mb-4">New Moltbook Agent</h3>
          <div className="flex flex-col gap-3">
            <label className="text-xs font-medium text-studio-muted">
              Project
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-studio-border bg-[#0f172a] px-3 py-2 text-sm text-studio-text focus:border-studio-accent focus:outline-none"
              >
                <option value="" disabled>
                  Select Project
                </option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-studio-muted">
              Agent Name
              <input
                type="text"
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                placeholder="e.g. TrendBot"
                className="mt-1 block w-full rounded-lg border border-studio-border bg-[#0f172a] px-3 py-2 text-sm text-studio-text focus:border-studio-accent focus:outline-none"
              />
            </label>
            <label className="text-xs font-medium text-studio-muted">
              Moltbook API Key
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                className="mt-1 block w-full rounded-lg border border-studio-border bg-[#0f172a] px-3 py-2 text-sm text-studio-text focus:border-studio-accent focus:outline-none"
              />
            </label>
            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                {error}
              </div>
            )}
            <button
              onClick={handleCreate}
              disabled={creating || !projectId || !agentName || !apiKey}
              className="mt-2 rounded-lg bg-studio-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-studio-accent/80 disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Create Agent'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── HoloDaemon Dogfood Integration ──────────────────────────────────────────

function HoloDaemonSubPanel() {
  const composition = useHoloComposition('/api/daemon/surface?kind=dashboard');
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [jobs, setJobs] = useState<DaemonJob[]>([]);
  const [telemetry, setTelemetry] = useState<DaemonTelemetrySummary | null>(null);
  const [daemonMode, setDaemonMode] = useState<DaemonProfile>('balanced');
  const { createJob, listJobs, getTelemetry, creating, error } = useDaemonJobs();
  const { job: polledJob } = useDaemonJobPoller(selectedJobId);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const [jobList, tel] = await Promise.all([listJobs(), getTelemetry()]);
        if (mounted) {
          setJobs(jobList);
          setTelemetry(tel);
        }
      } catch (err) { logger.warn('[AbsorbPage] loading jobs/telemetry failed:', err); }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [listJobs, getTelemetry]);

  useEffect(() => {
    if (!composition.loading && telemetry) {
      composition.setState({
        totalJobsRun: telemetry.totalJobs ?? 0,
        totalPatchesProposed: telemetry.totalPatches ?? 0,
        costUSD: telemetry.totalCostUSD ?? 0,
        cyclesCompleted: telemetry.completedJobs ?? 0,
      });
    }
  }, [telemetry, composition.loading]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (polledJob) {
      setJobs((prev) => {
        const idx = prev.findIndex((j) => j.id === polledJob.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = polledJob;
          return next;
        }
        return [polledJob, ...prev];
      });
      composition.setState({
        daemonStatus:
          polledJob.status === 'running'
            ? 'running'
            : polledJob.status === 'failed'
              ? 'error'
              : 'idle',
        activeJobId: polledJob.id,
        activeJobProgress: polledJob.progress ?? 0,
        activeJobStatus: polledJob.statusMessage || polledJob.summary || 'Processing...',
        qualityScore: polledJob.metrics?.qualityAfter ?? 0,
        qualityDelta: polledJob.metrics?.qualityDelta ?? 0,
        typeErrorCount: polledJob.metrics?.typeErrors ?? 0,
      });
    }
  }, [polledJob]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const tel = await getTelemetry();
        setTelemetry(tel);
      } catch (err) { logger.warn('[AbsorbPage] telemetry poll failed:', err); }
    }, 10000);
    return () => clearInterval(interval);
  }, [getTelemetry]);

  const handleStartDaemon = useCallback(async () => {
    try {
      const job = await createJob({
        projectId: 'holoscript',
        profile: daemonMode,
        projectDna: {
          kind: 'spatial',
          confidence: 0.95,
          detectedStack: ['typescript', 'react', 'holoscript', 'three.js'],
          recommendedProfile: daemonMode,
          notes: ['HoloScript monorepo — self-improvement daemon run'],
        },
      });
      setSelectedJobId(job.id);
      setJobs((prev) => [job, ...prev]);
      composition.setState({
        daemonStatus: 'running',
        activeJobId: job.id,
        activeJobProgress: 0,
        activeJobStatus: 'Job created, starting...',
      });
    } catch (err) { logger.warn('[AbsorbPage] daemon job creation failed:', err); }
  }, [createJob, daemonMode, composition]);

  const daemonStatus =
    polledJob?.status === 'running' ? 'running' : polledJob?.status === 'failed' ? 'error' : 'idle';

  return (
    <div className="mb-6 rounded-xl border border-studio-border bg-[#0d0d14] overflow-hidden">
      <div className="flex items-center justify-between border-b border-studio-border bg-[#111827] px-5 py-3">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-bold text-studio-text flex items-center gap-2">
            <span className="text-studio-accent">HoloDaemon</span>
            <span className="text-[10px] uppercase font-normal text-studio-muted border border-studio-border px-1.5 py-0.5 rounded">
              Mesh Control
            </span>
          </h3>
          <div className="flex items-center gap-2 ml-4">
            <div
              className={`h-2.5 w-2.5 rounded-full ${daemonStatus === 'running' ? 'bg-emerald-500 animate-pulse' : daemonStatus === 'error' ? 'bg-red-500' : 'bg-amber-500'}`}
            />
            <span
              className={`text-[10px] font-medium uppercase ${daemonStatus === 'running' ? 'text-emerald-400' : daemonStatus === 'error' ? 'text-red-400' : 'text-amber-400'}`}
            >
              {daemonStatus}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={daemonMode}
            onChange={(e) => setDaemonMode(e.target.value as DaemonProfile)}
            className="rounded-md border border-studio-border bg-studio-surface px-2 py-1 text-xs text-studio-text"
          >
            <option value="quick">Quick</option>
            <option value="balanced">Balanced</option>
            <option value="deep">Deep</option>
          </select>
          <button
            onClick={handleStartDaemon}
            disabled={creating || daemonStatus === 'running'}
            className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
          >
            {creating
              ? 'Starting...'
              : daemonStatus === 'running'
                ? 'Running...'
                : 'Initialize Daemon'}
          </button>
        </div>
      </div>
      <div className="relative h-64 bg-[#050505]">
        {error && (
          <div className="absolute top-2 left-2 right-2 z-10 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-xs text-red-300 backdrop-blur-sm">
            {error}
          </div>
        )}
        {composition.loading ? (
          <div className="flex h-full items-center justify-center text-xs text-studio-muted">
            Loading Composition Engine...
          </div>
        ) : composition.error ? (
          <div className="flex h-full items-center justify-center text-xs text-red-400">
            Failed: {composition.error}
          </div>
        ) : (
          <HoloSurfaceRenderer
            nodes={composition.nodes}
            state={composition.state}
            computed={composition.computed}
            templates={composition.templates}
            onEmit={composition.emit}
            className="w-full h-full"
          />
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AbsorbPage() {
  const { data: session, status: authStatus } = useSession();

  // Show landing page for unauthenticated users
  if (authStatus === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center bg-studio-bg">
        <div className="text-sm text-studio-muted animate-pulse">Loading...</div>
      </div>
    );
  }

  if (!session?.user) {
    return <LandingPage />;
  }

  return <AuthenticatedDashboard />;
}

function AuthenticatedDashboard() {
  const {
    creditBalance,
    tier,
    qualityTier,
    projects,
    usageHistory,
    loading,
    error,
    fetchBalance,
    fetchProjects,
    fetchUsageHistory,
    runAbsorb,
    runImprove,
    runQuery,
    runRender,
    runDiff,
    extractKnowledge,
    publishKnowledge,
    purchaseCredits,
    setActiveProject,
    activeProjectId,
    setQualityTier,
    setError,
  } = useAbsorbService();

  const [tab, setTab] = useState<AbsorbTab>('dashboard');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [extractedKnowledge, setExtractedKnowledge] = useState<unknown[] | null>(null);
  const { listJobs } = useDaemonJobs();
  const [jobs, setJobs] = useState<DaemonJob[]>([]);

  // Load daemon jobs for daemon-ops tab
  useEffect(() => {
    if (tab === 'daemon-ops') {
      listJobs().then(setJobs).catch((err) => { logger.warn('[AbsorbPage] listing daemon jobs failed:', err); });
    }
  }, [tab, listJobs]);
  const [publishPremium, setPublishPremium] = useState(false);
  const [entryPremiumOverrides, setEntryPremiumOverrides] = useState<Record<string, boolean>>({});
  const [excludedEntries, setExcludedEntries] = useState<Set<string>>(new Set());
  const [publishResult, setPublishResult] = useState<{ count: number; projectName: string; premiumCount: number; freeCount: number } | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);

  const handleExtractKnowledge = useCallback(async (projectId: string) => {
    const result = await extractKnowledge(projectId, { minConfidence: 0.6, maxPerType: 15 });
    if (result.success && result.data?.entries) {
      setExtractedKnowledge(result.data.entries);
    }
  }, [extractKnowledge]);

  const handlePublishKnowledge = useCallback(async () => {
    if (!extractedKnowledge || extractedKnowledge.length === 0) return;
    setIsPublishing(true);
    try {
      const entries = extractedKnowledge
        .filter((e: any) => !excludedEntries.has(e.id))
        .map((e: any) => ({
          id: e.id,
          type: e.type,
          content: e.content,
          is_premium: entryPremiumOverrides[e.id] ?? publishPremium,
        }));
      if (entries.length === 0) return;
      const result = await publishKnowledge(entries, selectedProjectId || 'default');
      if (result.success) {
        const activeProject = projects.find((p) => p.id === selectedProjectId);
        const premiumCount = entries.filter((e) => e.is_premium).length;
        setPublishResult({
          count: entries.length,
          projectName: activeProject?.name || selectedProjectId || 'default',
          premiumCount,
          freeCount: entries.length - premiumCount,
        });
        setExtractedKnowledge(null);
        setEntryPremiumOverrides({});
        setExcludedEntries(new Set());
      }
      return result;
    } finally {
      setIsPublishing(false);
    }
  }, [extractedKnowledge, publishPremium, entryPremiumOverrides, excludedEntries, publishKnowledge, selectedProjectId, projects]);

  const toggleEntryPremium = useCallback((entryId: string) => {
    setEntryPremiumOverrides((prev) => ({
      ...prev,
      [entryId]: !(prev[entryId] ?? publishPremium),
    }));
  }, [publishPremium]);

  const toggleEntryExcluded = useCallback((entryId: string) => {
    setExcludedEntries((prev) => {
      const next = new Set(prev);
      if (next.has(entryId)) next.delete(entryId);
      else next.add(entryId);
      return next;
    });
  }, []);

  // Check URL params for tab and purchase confirmation
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    if (tabParam) {
      // pricing tab merged into credits
      const resolved = tabParam === 'pricing' ? 'credits' : tabParam;
      if (['dashboard', 'projects', 'credits', 'tools', 'agents', 'daemon-ops'].includes(resolved)) {
        setTab(resolved as AbsorbTab);
      }
    }
    if (params.get('purchased')) {
      setTab('credits');
      fetchBalance();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tab === 'credits') fetchUsageHistory();
  }, [tab, fetchUsageHistory]);

  const tabs: { id: AbsorbTab; label: string }[] = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'projects', label: 'Projects' },
    { id: 'agents', label: 'Agents' },
    { id: 'daemon-ops', label: 'Daemon Ops' },
    { id: 'tools', label: 'Tools' },
    { id: 'credits', label: 'Credits & Pricing' },
  ];

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-studio-bg text-studio-text">
      {/* Header */}
      <header className="shrink-0 border-b border-studio-border bg-[#0d0d14] px-6 py-4">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-lg font-bold">Absorb Service</h1>
            <p className="text-xs text-studio-muted">AI-powered project management</p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="rounded-lg border border-studio-border bg-[#111827] px-3 py-1.5 text-xs">
              <span className="text-studio-muted">Balance: </span>
              <span className="font-semibold text-studio-text">
                ${(creditBalance / 100).toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Tab bar */}
      <div className="shrink-0 border-b border-studio-border bg-[#0d0d14] px-6 py-2">
        <div className="flex gap-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-lg px-4 py-1.5 text-xs font-medium transition-colors ${
                tab === t.id
                  ? 'bg-studio-accent text-white'
                  : 'text-studio-muted hover:text-studio-text hover:bg-studio-panel'
              }`}
            >
              {t.label}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-3">
            <Link
              href="/holodaemon"
              className="rounded-lg border border-studio-border px-3 py-1.5 text-xs text-studio-muted hover:text-studio-text hover:border-studio-accent/40 transition-colors"
            >
              Daemon
            </Link>
            <Link
              href="/holoclaw"
              className="rounded-lg border border-studio-border px-3 py-1.5 text-xs text-studio-muted hover:text-studio-text hover:border-studio-accent/40 transition-colors"
            >
              HoloClaw
            </Link>
            <Link
              href="/pipeline"
              className="rounded-lg border border-studio-border px-3 py-1.5 text-xs text-studio-muted hover:text-studio-text hover:border-purple-500/40 transition-colors"
            >
              Pipeline
            </Link>
            <Link
              href="/"
              className="rounded-lg border border-studio-border px-3 py-1.5 text-xs text-studio-muted hover:text-studio-text hover:border-studio-accent/40 transition-colors"
            >
              Home
            </Link>
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-6">
        {error && (
          <div className="mb-4 flex items-center justify-between rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
            <button onClick={() => setError(null)} className="ml-4 text-xs hover:text-red-300">
              Dismiss
            </button>
          </div>
        )}

        {/* Dashboard Tab */}
        {tab === 'dashboard' && (
          <>
            <HoloDaemonSubPanel />
            <div className="grid gap-6 lg:grid-cols-2">
              <CreditBalanceCard balance={creditBalance} tier={tier} />
              <div className="rounded-xl border border-studio-border bg-[#111827] p-6">
                <h3 className="text-sm font-semibold text-studio-text">Quick Stats</h3>
                <div className="mt-4 grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-studio-text">{projects.length}</div>
                    <div className="text-[10px] uppercase tracking-wider text-studio-muted">
                      Projects
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-studio-text">
                      {projects.reduce((sum, p) => sum + p.totalOperations, 0)}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-studio-muted">
                      Operations
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-studio-text">
                      ${(projects.reduce((sum, p) => sum + p.totalSpentCents, 0) / 100).toFixed(2)}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-studio-muted">
                      Total Spent
                    </div>
                  </div>
                </div>
              </div>

              {/* Funnel — Absorb → HoloMesh pipeline */}
              <div className="lg:col-span-2">
                <div className="rounded-xl border border-studio-border bg-[#111827] p-5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-studio-muted mb-4">
                    Your Pipeline
                  </h3>
                  <div className="flex items-center gap-1">
                    {[
                      { label: 'Create Project', done: projects.length > 0, href: undefined as string | undefined },
                      { label: 'Absorb Codebase', done: projects.some((p) => p.status === 'ready'), href: undefined as string | undefined },
                      { label: 'Extract Knowledge', done: !!publishResult, href: undefined as string | undefined },
                      { label: 'Publish to HoloMesh', done: !!publishResult, href: '/holomesh' },
                      { label: 'Register Agent', done: false, href: '/holomesh/onboard' },
                    ].map((step, i, arr) => (
                      <React.Fragment key={step.label}>
                        {step.href && !step.done ? (
                          <Link
                            href={step.href}
                            className={`flex-1 rounded-lg border px-3 py-2 text-center text-[10px] font-medium transition-colors ${
                              step.done
                                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                                : 'border-studio-accent/40 bg-studio-accent/5 text-studio-accent hover:bg-studio-accent/10'
                            }`}
                          >
                            {step.done ? '\u2713 ' : ''}{step.label}
                          </Link>
                        ) : (
                          <div
                            className={`flex-1 rounded-lg border px-3 py-2 text-center text-[10px] font-medium ${
                              step.done
                                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                                : 'border-studio-border bg-[#0d1117] text-studio-muted'
                            }`}
                          >
                            {step.done ? '\u2713 ' : ''}{step.label}
                          </div>
                        )}
                        {i < arr.length - 1 && (
                          <svg className="h-3 w-3 shrink-0 text-studio-muted/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              </div>

              {/* Recent projects */}
              <div className="lg:col-span-2">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-studio-text">Your Projects</h3>
                  <button
                    onClick={() => setTab('projects')}
                    className="text-xs text-studio-accent hover:underline"
                  >
                    View all
                  </button>
                </div>
                {loading ? (
                  <div className="flex gap-4">
                    {[1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="h-32 flex-1 rounded-xl border border-studio-border bg-[#111827] animate-pulse"
                      />
                    ))}
                  </div>
                ) : projects.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-xl border border-studio-border bg-[#111827] py-12">
                    <p className="text-sm text-studio-muted">No projects yet</p>
                    <button
                      onClick={() => setTab('projects')}
                      className="mt-4 rounded-lg bg-studio-accent px-4 py-2 text-sm font-medium text-white hover:bg-studio-accent/80"
                    >
                      Create a Project
                    </button>
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {projects.slice(0, 6).map((p) => (
                      <ProjectCard
                        key={p.id}
                        project={p}
                        selected={selectedProjectId === p.id}
                        onSelect={() => setSelectedProjectId(p.id)}
                        onAbsorb={() => runAbsorb(p.id)}
                        onImprove={() => runImprove(p.id)}
                        onExtractKnowledge={() => handleExtractKnowledge(p.id)}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Knowledge Extraction Results */}
              {extractedKnowledge && extractedKnowledge.length > 0 && (
                <div className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-amber-300">
                      Extracted Knowledge ({extractedKnowledge.length} entries)
                    </h3>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 text-xs text-studio-muted">
                        <input
                          type="checkbox"
                          checked={publishPremium}
                          onChange={(e) => {
                            setPublishPremium(e.target.checked);
                            setEntryPremiumOverrides({});
                          }}
                          className="rounded border-studio-border"
                        />
                        All Premium (earn 4c/access)
                      </label>
                      <button
                        onClick={handlePublishKnowledge}
                        disabled={isPublishing || extractedKnowledge.every((e: any) => excludedEntries.has(e.id))}
                        className="rounded-lg bg-emerald-500/20 px-4 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isPublishing ? 'Publishing...' : 'Publish to HoloMesh'}
                      </button>
                      <button
                        onClick={() => {
                          setExtractedKnowledge(null);
                          setEntryPremiumOverrides({});
                          setExcludedEntries(new Set());
                        }}
                        className="rounded-lg bg-gray-500/20 px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-500/30"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>

                  {/* Publish summary */}
                  <div className="mt-3 flex gap-4 rounded-lg border border-studio-border bg-[#0d1117] px-4 py-2 text-[10px]">
                    <span className="text-studio-muted">
                      Selected: <span className="font-semibold text-studio-text">{extractedKnowledge.filter((e: any) => !excludedEntries.has(e.id)).length}</span>
                    </span>
                    <span className="text-studio-muted">
                      Premium: <span className="font-semibold text-amber-300">
                        {extractedKnowledge.filter((e: any) => !excludedEntries.has(e.id) && (entryPremiumOverrides[e.id] ?? publishPremium)).length}
                      </span>
                    </span>
                    <span className="text-studio-muted">
                      Free: <span className="font-semibold text-emerald-300">
                        {extractedKnowledge.filter((e: any) => !excludedEntries.has(e.id) && !(entryPremiumOverrides[e.id] ?? publishPremium)).length}
                      </span>
                    </span>
                    <span className="text-studio-muted">
                      Excluded: <span className="font-semibold text-gray-400">{excludedEntries.size}</span>
                    </span>
                  </div>

                  <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">
                    {extractedKnowledge.map((entry: any, i: number) => {
                      const isExcluded = excludedEntries.has(entry.id);
                      const isPremium = entryPremiumOverrides[entry.id] ?? publishPremium;
                      return (
                        <div
                          key={entry.id || i}
                          className={`rounded-lg border p-3 transition-opacity ${
                            isExcluded
                              ? 'border-gray-700 bg-[#0d1117] opacity-40'
                              : 'border-studio-border bg-[#0d1117]'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={!isExcluded}
                              onChange={() => toggleEntryExcluded(entry.id)}
                              className="rounded border-studio-border"
                              title={isExcluded ? 'Include in publish' : 'Exclude from publish'}
                            />
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                              entry.type === 'wisdom' ? 'bg-blue-500/20 text-blue-300' :
                              entry.type === 'pattern' ? 'bg-green-500/20 text-green-300' :
                              'bg-red-500/20 text-red-300'
                            }`}>
                              {entry.type}
                            </span>
                            <span className="text-[10px] text-studio-muted">{entry.id}</span>
                            {entry.confidence && (
                              <span className="text-[10px] text-studio-muted">
                                {Math.round(entry.confidence * 100)}%
                              </span>
                            )}
                            <div className="ml-auto flex items-center gap-1">
                              <button
                                onClick={() => toggleEntryPremium(entry.id)}
                                disabled={isExcluded}
                                className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
                                  isPremium
                                    ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30'
                                    : 'bg-gray-500/10 text-gray-500 hover:bg-gray-500/20 hover:text-gray-400'
                                } disabled:opacity-30 disabled:cursor-not-allowed`}
                                title={isPremium ? 'Switch to free' : 'Switch to premium (4c/access)'}
                              >
                                {isPremium ? 'Premium' : 'Free'}
                              </button>
                            </div>
                          </div>
                          <p className="mt-1 pl-6 text-xs text-studio-text line-clamp-2">{entry.content}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Post-Publish Handoff — Absorb → HoloMesh funnel */}
              {publishResult && (
                <div className="mt-6 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5">
                  <div className="flex items-start gap-4">
                    <div className="shrink-0 rounded-full bg-emerald-500/20 p-2">
                      <svg className="h-5 w-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-emerald-300">
                        {publishResult.count} entries published to HoloMesh
                      </h3>
                      <p className="mt-1 text-xs text-studio-muted">
                        Knowledge from <span className="font-mono text-studio-text">{publishResult.projectName}</span> is
                        now live on the network.
                        {publishResult.premiumCount > 0 && (
                          <span className="ml-1 text-amber-300">
                            {publishResult.premiumCount} premium (earning 4c/access)
                          </span>
                        )}
                        {publishResult.freeCount > 0 && (
                          <span className="ml-1 text-emerald-300">
                            {publishResult.freeCount} free
                          </span>
                        )}
                        . Next step: register an agent to represent this project on HoloMesh.
                      </p>
                      <div className="mt-4 flex flex-wrap gap-3">
                        <Link
                          href="/holomesh/onboard"
                          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 transition-colors"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                          </svg>
                          Register Agent on HoloMesh
                        </Link>
                        <Link
                          href="/holomesh"
                          className="rounded-lg border border-studio-border px-4 py-2 text-sm text-studio-muted hover:text-studio-text transition-colors"
                        >
                          Browse Feed
                        </Link>
                        <button
                          onClick={() => setTab('agents')}
                          className="rounded-lg border border-studio-border px-4 py-2 text-sm text-studio-muted hover:text-studio-text transition-colors"
                        >
                          Manage Agents
                        </button>
                        <button
                          onClick={() => setPublishResult(null)}
                          className="ml-auto text-xs text-studio-muted hover:text-studio-text transition-colors"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Projects Tab */}
        {tab === 'projects' && (
          <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-studio-text">
                  Projects ({projects.length})
                </h3>
                <button
                  onClick={() => fetchProjects()}
                  className="text-xs text-studio-muted hover:text-studio-text"
                >
                  Refresh
                </button>
              </div>
              {projects.map((p) => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  selected={selectedProjectId === p.id}
                  onSelect={() => setSelectedProjectId(p.id)}
                  onAbsorb={() => runAbsorb(p.id)}
                  onImprove={() => runImprove(p.id)}
                  onExtractKnowledge={() => handleExtractKnowledge(p.id)}
                />
              ))}
              {projects.length === 0 && !loading && (
                <div className="text-center py-12 text-sm text-studio-muted">
                  No projects. Create one to get started.
                </div>
              )}
            </div>
            <div>
              <NewProjectForm onCreated={() => fetchProjects()} />
            </div>
          </div>
        )}

        {/* Credits Tab */}
        {tab === 'credits' && (
          <div className="mx-auto max-w-4xl space-y-8">
            <CreditBalanceCard balance={creditBalance} tier={tier} />

            <div>
              <h3 className="mb-4 text-sm font-semibold text-studio-text">Buy Credits</h3>
              <div className="grid gap-4 md:grid-cols-4">
                {CREDIT_PACKAGES.map((pkg) => (
                  <CreditPackageCard
                    key={pkg.id}
                    pkg={pkg}
                    onPurchase={() => purchaseCredits(pkg.id)}
                  />
                ))}
              </div>
            </div>

            <div>
              <h3 className="mb-4 text-sm font-semibold text-studio-text">Usage History</h3>
              {usageHistory.length === 0 ? (
                <div className="rounded-xl border border-studio-border bg-[#111827] p-8 text-center text-xs text-studio-muted">
                  No transactions yet
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-studio-border">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-studio-border bg-[#0d0d14]">
                        <th className="px-4 py-3 text-left font-medium text-studio-muted">
                          Description
                        </th>
                        <th className="px-4 py-3 text-right font-medium text-studio-muted">
                          Amount
                        </th>
                        <th className="px-4 py-3 text-right font-medium text-studio-muted">
                          Balance
                        </th>
                        <th className="px-4 py-3 text-right font-medium text-studio-muted">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usageHistory.map((tx) => (
                        <tr key={tx.id} className="border-b border-studio-border/50 last:border-0">
                          <td className="px-4 py-2.5 text-studio-text">{tx.description}</td>
                          <td
                            className={`px-4 py-2.5 text-right font-mono ${tx.amountCents >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
                          >
                            {tx.amountCents >= 0 ? '+' : ''}
                            {(tx.amountCents / 100).toFixed(2)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-studio-muted">
                            ${(tx.balanceAfterCents / 100).toFixed(2)}
                          </td>
                          <td className="px-4 py-2.5 text-right text-studio-muted">
                            {new Date(tx.createdAt).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <TierComparisonTable />

            <OperationCostTable />
          </div>
        )}

        {/* Agents Tab */}
        {tab === 'agents' && <MoltbookAgentsTab />}

        {/* Daemon Ops Tab — Pipeline + Operations + Daemon Management */}
        {tab === 'daemon-ops' && (
          <div className="space-y-6">
            <div className="rounded-xl border border-studio-border bg-[#111827] p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Daemon Operations</h3>
              <p className="text-studio-muted text-sm mb-6">
                Manage daemons, pipelines, and operational monitoring. Launch HoloMesh and Moltbook agents,
                run self-improvement pipelines, and monitor system health.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <a href="/pipeline" className="rounded-lg border border-studio-border bg-[#0d1117] p-4 hover:border-blue-500/40 transition-colors">
                  <div className="text-2xl mb-2">⚡</div>
                  <div className="text-white font-medium">Pipeline</div>
                  <div className="text-studio-muted text-xs mt-1">L0/L1/L2 self-improvement feedback layers</div>
                </a>
                <a href="/operations" className="rounded-lg border border-studio-border bg-[#0d1117] p-4 hover:border-blue-500/40 transition-colors">
                  <div className="text-2xl mb-2">📈</div>
                  <div className="text-white font-medium">Operations</div>
                  <div className="text-studio-muted text-xs mt-1">Daemon health, alerts, sync status, jobs</div>
                </a>
                <a href="/holoclaw" className="rounded-lg border border-studio-border bg-[#0d1117] p-4 hover:border-blue-500/40 transition-colors">
                  <div className="text-2xl mb-2">🤖</div>
                  <div className="text-white font-medium">Agent Skills</div>
                  <div className="text-studio-muted text-xs mt-1">Browse, create, and manage AI skills</div>
                </a>
              </div>
            </div>
            {/* Running daemons */}
            <div className="rounded-xl border border-studio-border bg-[#111827] p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Running Daemons</h3>
              <div className="space-y-3">
                {jobs.length > 0 ? jobs.map((job) => (
                  <div key={job.id} className="flex items-center justify-between rounded-lg border border-studio-border bg-[#0d1117] px-4 py-3">
                    <div>
                      <div className="text-white text-sm font-medium">{job.profile || 'daemon'}</div>
                      <div className="text-studio-muted text-xs">{job.status}</div>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded ${job.status === 'running' ? 'bg-green-900/30 text-green-400' : 'bg-gray-800 text-gray-400'}`}>
                      {job.status}
                    </span>
                  </div>
                )) : (
                  <div className="text-studio-muted text-sm text-center py-8">
                    No daemons running. Start one from Pipeline or Operations.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tools Tab */}
        {tab === 'tools' && (
          <ToolsTab
            projects={projects}
            activeProjectId={selectedProjectId}
            qualityTier={qualityTier}
            onSetQualityTier={setQualityTier}
            onQuery={runQuery}
            onRender={runRender}
            onDiff={runDiff}
          />
        )}

        {/* Pricing Tab */}
        {/* Pricing merged into Credits tab */}
      </main>

      {/* Footer */}
      <footer className="shrink-0 border-t border-studio-border bg-[#0d0d14] px-6 py-2">
        <div className="flex items-center justify-between text-[10px] text-studio-muted">
          <span>Absorb Service v0.1 — Powered by HoloDaemon + HoloClaw + Claude/Grok/GPT</span>
          <span>
            <Link href="/holodaemon" className="hover:text-studio-text">
              Daemon
            </Link>
            {' \u2022 '}
            <Link href="/holoclaw" className="hover:text-studio-text">
              HoloClaw
            </Link>
            {' \u2022 '}
            <Link href="/pipeline" className="hover:text-studio-text">
              Pipeline
            </Link>
            {' \u2022 '}
            <Link href="/workspace" className="hover:text-studio-text">
              Workspace
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
