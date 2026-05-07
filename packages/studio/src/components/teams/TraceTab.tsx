'use client';

/**
 * TraceTab - Multiagent trace timeline for HoloMesh teams.
 *
 * Displays a unified chronological view of:
 * - Tasks (created, claimed, done, blocked)
 * - Messages (handoffs, DMs, mode changes)
 * - Feed items (hologram publishes)
 * - Subagent events (decompose, delegate, subtask lifecycle)
 * - Policy events (tool/network/filesystem/secret/spend decisions)
 * - Artifacts (receipts with provenance links)
 * - Presence (agent heartbeats)
 * - Suggestions (proposals + votes)
 *
 * Supports filtering by agent, task, status, and artifact type.
 * Shows model/vendor identity for model-agnostic mesh runs.
 *
 * @module components/teams/TraceTab
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Filter,
  Search,
  X,
  ChevronDown,
  ChevronRight,
  User,
  Bot,
  MessageSquare,
  FileText,
  CheckCircle,
  Clock,
  AlertCircle,
  Layers,
  Zap,
  Shield,
  Package,
  Radio,
  Lightbulb,
  GitCommit,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types (mirrored from MCP server trace endpoint)
// ---------------------------------------------------------------------------

type TraceKind =
  | 'task_created'
  | 'task_claimed'
  | 'task_done'
  | 'task_blocked'
  | 'message'
  | 'mode_change'
  | 'feed'
  | 'subagent'
  | 'policy'
  | 'artifact'
  | 'presence'
  | 'suggestion';

interface TraceActor {
  surface?: string;
  agentId?: string;
  agentName?: string;
  handle?: string;
  model?: string;
  provider?: string;
}

interface TraceArtifact {
  id: string;
  type: string;
  path?: string;
  uri?: string;
  hash: string;
  hashAlgorithm: string;
  producer: string;
  provenance?: {
    taskId?: string;
    commitHash?: string;
    source?: string;
    parentArtifactIds?: string[];
    url?: string;
  };
  verificationCommands?: Array<{
    id?: string;
    command: string;
    status?: string;
    artifactIds?: string[];
    exitCode?: number;
  }>;
}

interface TraceEntry {
  id: string;
  timestamp: string;
  kind: TraceKind;
  agentId?: string;
  agentName?: string;
  surfaceTag?: string;
  taskId?: string;
  taskTitle?: string;
  taskStatus?: 'open' | 'claimed' | 'done' | 'blocked';
  taskPriority?: number;
  parentTaskId?: string;
  childTaskIds?: string[];
  commitHash?: string;
  messageType?: string;
  content?: string;
  fromMode?: string;
  toMode?: string;
  source?: string;
  feedKind?: string;
  hash?: string;
  shareUrl?: string;
  eventType?: string;
  actor?: TraceActor;
  target?: TraceActor;
  wave?: number;
  childTaskId?: string;
  policyDecision?: string;
  policyActionKind?: string;
  artifact?: TraceArtifact;
  model?: string;
  provider?: string;
  ideType?: string;
  status?: string;
  title?: string;
  category?: string;
  score?: number;
  modeChange?: { previousMode: string; newMode: string; source: string; reason?: string };
}

interface TraceData {
  success: boolean;
  teamId: string;
  entries: TraceEntry[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const KIND_META: Record<
  TraceKind,
  { label: string; color: string; icon: React.ReactNode }
> = {
  task_created: { label: 'Task Created', color: 'bg-blue-500/15 text-blue-400 border-blue-500/20', icon: <FileText size={14} /> },
  task_claimed: { label: 'Claimed', color: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20', icon: <Clock size={14} /> },
  task_done: { label: 'Done', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20', icon: <CheckCircle size={14} /> },
  task_blocked: { label: 'Blocked', color: 'bg-red-500/15 text-red-400 border-red-500/20', icon: <AlertCircle size={14} /> },
  message: { label: 'Message', color: 'bg-purple-500/15 text-purple-400 border-purple-500/20', icon: <MessageSquare size={14} /> },
  mode_change: { label: 'Mode Change', color: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/20', icon: <Layers size={14} /> },
  feed: { label: 'Feed', color: 'bg-pink-500/15 text-pink-400 border-pink-500/20', icon: <Radio size={14} /> },
  subagent: { label: 'Subagent', color: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20', icon: <Bot size={14} /> },
  policy: { label: 'Policy', color: 'bg-orange-500/15 text-orange-400 border-orange-500/20', icon: <Shield size={14} /> },
  artifact: { label: 'Artifact', color: 'bg-teal-500/15 text-teal-400 border-teal-500/20', icon: <Package size={14} /> },
  presence: { label: 'Presence', color: 'bg-slate-500/15 text-slate-400 border-slate-500/20', icon: <User size={14} /> },
  suggestion: { label: 'Suggestion', color: 'bg-amber-500/15 text-amber-400 border-amber-500/20', icon: <Lightbulb size={14} /> },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(ts: string): string {
  const seconds = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatTime(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDate(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ModelBadge({ model, provider }: { model?: string; provider?: string }) {
  if (!model && !provider) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded bg-slate-700/40 px-1.5 py-0.5 text-[10px] text-slate-300">
      <Zap size={10} />
      {model && <span>{model}</span>}
      {model && provider && <span className="text-slate-500">/</span>}
      {provider && <span className="text-slate-400">{provider}</span>}
    </span>
  );
}

function ArtifactReceiptCard({ artifact }: { artifact: TraceArtifact }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2 rounded border border-studio-border/60 bg-[#0f172a]/60">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-studio-text hover:bg-studio-panel/40"
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Package size={14} className="text-teal-400" />
        <span className="font-medium">{artifact.type}</span>
        <span className="text-studio-muted">{artifact.path || artifact.uri || artifact.id}</span>
        <span className="ml-auto text-[10px] text-studio-muted">{artifact.hashAlgorithm}</span>
      </button>
      {open && (
        <div className="border-t border-studio-border/40 px-3 py-2 text-[11px] text-studio-muted">
          <div className="grid gap-1">
            <div>
              <span className="text-slate-400">Producer:</span> {artifact.producer}
            </div>
            <div>
              <span className="text-slate-400">Hash:</span>{' '}
              <code className="rounded bg-slate-800 px-1 py-0.5 text-[10px]">{artifact.hash}</code>
            </div>
            {artifact.provenance?.commitHash && (
              <div className="flex items-center gap-1">
                <GitCommit size={10} />
                <span className="text-slate-400">Commit:</span>{' '}
                <code className="rounded bg-slate-800 px-1 py-0.5 text-[10px]">
                  {artifact.provenance.commitHash}
                </code>
              </div>
            )}
            {artifact.provenance?.taskId && (
              <div>
                <span className="text-slate-400">Task:</span> {artifact.provenance.taskId}
              </div>
            )}
            {artifact.verificationCommands && artifact.verificationCommands.length > 0 && (
              <div className="mt-1">
                <span className="text-slate-400">Verification:</span>
                <ul className="mt-1 space-y-1">
                  {artifact.verificationCommands.map((cmd) => (
                    <li key={cmd.id || cmd.command} className="flex items-center gap-2">
                      <span
                        className={`inline-block h-1.5 w-1.5 rounded-full ${
                          cmd.status === 'passed'
                            ? 'bg-emerald-400'
                            : cmd.status === 'failed'
                              ? 'bg-red-400'
                              : 'bg-yellow-400'
                        }`}
                      />
                      <code className="text-[10px]">{cmd.command}</code>
                      {cmd.exitCode !== undefined && (
                        <span className="text-[10px] text-slate-500">exit {cmd.exitCode}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TraceRow({ entry }: { entry: TraceEntry }) {
  const meta = KIND_META[entry.kind];

  const isTask = entry.kind.startsWith('task_');

  return (
    <div className="group relative flex gap-3 py-2 pl-3 pr-2 transition-colors hover:bg-studio-panel/30">
      {/* Timeline line */}
      <div className="flex flex-col items-center">
        <div className={`flex h-6 w-6 items-center justify-center rounded-full border ${meta.color}`}>
          {meta.icon}
        </div>
        <div className="w-px flex-1 bg-studio-border/40 group-last:h-2" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${meta.color}`}>
            {meta.label}
          </span>
          <span className="text-studio-muted">{timeAgo(entry.timestamp)}</span>
          <span className="text-[10px] text-slate-500">{formatTime(entry.timestamp)}</span>
          {entry.taskPriority !== undefined && (
            <span className="rounded bg-slate-700/30 px-1 text-[10px] text-slate-300">
              P{entry.taskPriority}
            </span>
          )}
          {entry.model || entry.provider ? (
            <ModelBadge model={entry.model} provider={entry.provider} />
          ) : null}
        </div>

        <div className="mt-1 text-sm text-studio-text">
          {isTask && entry.taskTitle ? (
            <span className="font-medium">{entry.taskTitle}</span>
          ) : entry.title ? (
            <span className="font-medium">{entry.title}</span>
          ) : null}
          {entry.content && (
            <p className="mt-0.5 text-xs text-studio-muted line-clamp-2">{entry.content}</p>
          )}
        </div>

        {/* Metadata row */}
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-studio-muted">
          {entry.agentName && (
            <span className="inline-flex items-center gap-1">
              <User size={10} />
              {entry.agentName}
              {entry.surfaceTag && <span className="text-slate-500">({entry.surfaceTag})</span>}
            </span>
          )}
          {entry.taskId && !isTask && (
            <span className="rounded bg-slate-800/50 px-1 py-0.5 text-[10px]">{entry.taskId}</span>
          )}
          {entry.commitHash && (
            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400">
              <GitCommit size={10} />
              {entry.commitHash.slice(0, 7)}
            </span>
          )}
          {entry.policyDecision && (
            <span
              className={`rounded px-1 py-0.5 text-[10px] ${
                entry.policyDecision === 'allow'
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : entry.policyDecision === 'deny'
                    ? 'bg-red-500/10 text-red-400'
                    : 'bg-yellow-500/10 text-yellow-400'
              }`}
            >
              {entry.policyDecision}
            </span>
          )}
          {entry.eventType && (
            <span className="rounded bg-slate-800/50 px-1 py-0.5 text-[10px]">{entry.eventType}</span>
          )}
          {entry.status && entry.kind !== 'task_created' && (
            <span className="rounded bg-slate-800/50 px-1 py-0.5 text-[10px]">{entry.status}</span>
          )}
          {entry.score !== undefined && (
            <span className="rounded bg-amber-500/10 px-1 py-0.5 text-[10px] text-amber-400">
              {entry.score > 0 ? '+' : ''}
              {entry.score}
            </span>
          )}
        </div>

        {/* Expandable artifact receipt */}
        {entry.artifact && <ArtifactReceiptCard artifact={entry.artifact} />}

        {/* Mode change detail */}
        {entry.modeChange && (
          <div className="mt-1 text-[11px] text-indigo-300">
            {entry.modeChange.previousMode} {'->'} {entry.modeChange.newMode}
            {entry.modeChange.reason && <span className="text-slate-500"> ({entry.modeChange.reason})</span>}
          </div>
        )}

        {/* Feed link */}
        {entry.shareUrl && (
          <a
            href={entry.shareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-block text-[11px] text-pink-400 hover:underline"
          >
            View hologram
          </a>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Export
// ---------------------------------------------------------------------------

export function TraceTab({ teamId }: { teamId: string }) {
  const [data, setData] = useState<TraceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [agentFilter, setAgentFilter] = useState('');
  const [taskFilter, setTaskFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [artifactFilter, setArtifactFilter] = useState('');
  const [searchText, setSearchText] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/holomesh/team/${teamId}/trace`);
      if (!res.ok) throw new Error(`${res.status}`);
      setData(await res.json());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load trace');
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    load();
    const id = setInterval(load, 30000); // refresh every 30s
    return () => clearInterval(id);
  }, [load]);

  // Derive filter options
  const agents = useMemo(() => {
    if (!data) return [];
    const set = new Set<string>();
    for (const e of data.entries) {
      if (e.agentName) set.add(e.agentName);
    }
    return Array.from(set).sort();
  }, [data]);

  const tasks = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, string>();
    for (const e of data.entries) {
      if (e.taskId && e.taskTitle) map.set(e.taskId, e.taskTitle);
      else if (e.taskId) map.set(e.taskId, e.taskId);
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [data]);

  const artifactTypes = useMemo(() => {
    if (!data) return [];
    const set = new Set<string>();
    for (const e of data.entries) {
      if (e.artifact?.type) set.add(e.artifact.type);
    }
    return Array.from(set).sort();
  }, [data]);

  // Apply filters
  const filtered = useMemo(() => {
    if (!data) return [];
    let out = data.entries;
    if (agentFilter) {
      out = out.filter((e) => e.agentName === agentFilter || e.agentId === agentFilter);
    }
    if (taskFilter) {
      out = out.filter(
        (e) =>
          e.taskId === taskFilter ||
          e.parentTaskId === taskFilter ||
          e.childTaskId === taskFilter
      );
    }
    if (statusFilter) {
      out = out.filter((e) => e.taskStatus === statusFilter || e.status === statusFilter);
    }
    if (artifactFilter) {
      out = out.filter((e) => e.artifact?.type === artifactFilter);
    }
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      out = out.filter(
        (e) =>
          e.content?.toLowerCase().includes(q) ||
          e.taskTitle?.toLowerCase().includes(q) ||
          e.title?.toLowerCase().includes(q) ||
          e.agentName?.toLowerCase().includes(q) ||
          e.eventType?.toLowerCase().includes(q)
      );
    }
    return out;
  }, [data, agentFilter, taskFilter, statusFilter, artifactFilter, searchText]);

  // Group by date for headers
  const grouped = useMemo(() => {
    const groups: { date: string; entries: TraceEntry[] }[] = [];
    let current: { date: string; entries: TraceEntry[] } | null = null;
    for (const entry of filtered) {
      const date = formatDate(entry.timestamp);
      if (!current || current.date !== date) {
        current = { date, entries: [] };
        groups.push(current);
      }
      current.entries.push(entry);
    }
    return groups;
  }, [filtered]);

  const hasFilters = agentFilter || taskFilter || statusFilter || artifactFilter || searchText;

  return (
    <div className="flex h-full flex-col">
      {/* Filter bar */}
      <div className="shrink-0 border-b border-studio-border bg-[#0d0d14] px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-studio-muted">
            <Filter size={14} />
            <span className="text-xs font-medium">Filters</span>
          </div>

          <select
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
            className="rounded border border-studio-border bg-[#0f172a] px-2 py-1 text-xs text-studio-text focus:border-studio-accent focus:outline-none"
          >
            <option value="">All agents</option>
            {agents.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>

          <select
            value={taskFilter}
            onChange={(e) => setTaskFilter(e.target.value)}
            className="rounded border border-studio-border bg-[#0f172a] px-2 py-1 text-xs text-studio-text focus:border-studio-accent focus:outline-none"
          >
            <option value="">All tasks</option>
            {tasks.map(([id, title]) => (
              <option key={id} value={id}>
                {title.slice(0, 40)}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded border border-studio-border bg-[#0f172a] px-2 py-1 text-xs text-studio-text focus:border-studio-accent focus:outline-none"
          >
            <option value="">All statuses</option>
            <option value="open">open</option>
            <option value="claimed">claimed</option>
            <option value="done">done</option>
            <option value="blocked">blocked</option>
          </select>

          <select
            value={artifactFilter}
            onChange={(e) => setArtifactFilter(e.target.value)}
            className="rounded border border-studio-border bg-[#0f172a] px-2 py-1 text-xs text-studio-text focus:border-studio-accent focus:outline-none"
          >
            <option value="">All artifacts</option>
            {artifactTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <div className="relative ml-auto">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-studio-muted" />
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search trace..."
              className="rounded border border-studio-border bg-[#0f172a] pl-7 pr-2 py-1 text-xs text-studio-text placeholder:text-studio-muted/50 focus:border-studio-accent focus:outline-none"
            />
          </div>

          {hasFilters && (
            <button
              onClick={() => {
                setAgentFilter('');
                setTaskFilter('');
                setStatusFilter('');
                setArtifactFilter('');
                setSearchText('');
              }}
              className="inline-flex items-center gap-1 rounded border border-red-500/20 px-2 py-1 text-[11px] text-red-400 hover:bg-red-500/10"
            >
              <X size={12} />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto px-4 py-2">
        {loading ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-16 rounded-xl border border-studio-border bg-[#111827] animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm text-studio-muted">No trace entries</p>
            <p className="mt-1 text-xs text-studio-muted/60">
              {hasFilters ? 'Try relaxing your filters' : 'Team activity will appear here as agents work'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {grouped.map((g) => (
              <div key={g.date}>
                <div className="sticky top-0 z-10 my-2 flex items-center gap-2 bg-[#0a0a12]/90 px-2 py-1 backdrop-blur">
                  <span className="h-px flex-1 bg-studio-border/30" />
                  <span className="text-[10px] font-medium uppercase tracking-wider text-studio-muted">
                    {g.date}
                  </span>
                  <span className="h-px flex-1 bg-studio-border/30" />
                </div>
                {g.entries.map((entry) => (
                  <TraceRow key={entry.id} entry={entry} />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer stats */}
      {!loading && !error && data && (
        <div className="shrink-0 border-t border-studio-border bg-[#0d0d14] px-4 py-2">
          <div className="flex items-center justify-between text-[10px] text-studio-muted">
            <span>
              Showing {filtered.length} of {data.entries.length} entries
            </span>
            <span className="text-studio-muted/60">Auto-refreshes every 30s</span>
          </div>
        </div>
      )}
    </div>
  );
}
