'use client';

/**
 * HoloClaw — /holoclaw
 *
 * Native HoloScript-driven skill shelf. The stats dashboard hydrates from
 * compositions/holoclaw.hsplus via HoloSurfaceRenderer. The interactive
 * tabs (Shelf, Create, Activity) remain React for form/SSE handling.
 *
 * Second studio page migrated to native composition (G.ARCH.001 Phase 2).
 *
 * @module holoclaw/page
 */

import React, { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { HoloSurfaceRenderer, useHoloComposition } from '@/components/holo-surface';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ClawTab = 'shelf' | 'create' | 'activity';

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

interface ActivityEntry {
  timestamp: string;
  channel?: string;
  message?: string;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Trait badge colors
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
// Skill templates
// ---------------------------------------------------------------------------

const SKILL_TEMPLATES = [
  {
    name: 'basic-action',
    label: 'Basic Action',
    description: 'A single action with shell execution',
    content: `composition "my-skill" {\n  @rate_limiter\n  @timeout_guard\n\n  state status: string = "idle"\n\n  action "run" {\n    command: "echo"\n    args: ["hello from my-skill"]\n  }\n}\n`,
  },
  {
    name: 'bt-workflow',
    label: 'BT Workflow',
    description: 'A behavior tree with sequence and fallback nodes',
    content: `composition "my-workflow" {\n  @behavior_tree\n  @economy\n  @circuit_breaker\n\n  state phase: string = "init"\n\n  sequence "main" {\n    action "diagnose" { }\n    action "fix" { }\n    action "verify" { }\n  }\n}\n`,
  },
  {
    name: 'channel-listener',
    label: 'Channel Listener',
    description: 'Ingests messages from Discord/Slack and responds',
    content: `composition "channel-responder" {\n  @rate_limiter\n  @rbac\n\n  state lastMessage: string = ""\n\n  sequence "listen-respond" {\n    action "channel_ingest" { }\n    action "process_message" { }\n    action "channel_send" { }\n  }\n}\n`,
  },
  {
    name: 'scheduled-task',
    label: 'Scheduled Task',
    description: 'Runs on a schedule with economy tracking',
    content: `composition "scheduled-health-check" {\n  @scheduler\n  @economy\n  @timeout_guard\n\n  state lastRun: string = ""\n  state healthScore: number = 1.0\n\n  action "check_health" {\n    command: "npm"\n    args: ["test", "--", "--run"]\n  }\n}\n`,
  },
];

// ---------------------------------------------------------------------------
// Sub-components (kept in React for interactive list/form patterns)
// ---------------------------------------------------------------------------

function SkillCard({
  skill,
  selected,
  onSelect,
}: {
  skill: SkillMeta;
  selected: boolean;
  onSelect: (s: SkillMeta) => void;
}) {
  return (
    <button
      onClick={() => onSelect(skill)}
      className={`w-full text-left rounded-xl border p-4 transition-all duration-200 ${
        selected
          ? 'border-studio-accent bg-studio-accent/10 shadow-lg shadow-studio-accent/5'
          : 'border-studio-border bg-[#111827] hover:border-studio-accent/40 hover:bg-[#1a1a2e]'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-studio-text truncate">{skill.name}</h3>
          {skill.description && (
            <p className="mt-1 text-xs text-studio-muted line-clamp-2">{skill.description}</p>
          )}
        </div>
        <span className="ml-2 shrink-0 rounded bg-studio-panel px-2 py-0.5 text-[10px] text-studio-muted">
          {formatBytes(skill.size)}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {skill.actions.slice(0, 6).map((a) => (
          <span
            key={a}
            className="rounded-full bg-studio-accent/10 px-2 py-0.5 text-[10px] font-medium text-studio-accent"
          >
            {a}
          </span>
        ))}
        {skill.actions.length > 6 && (
          <span className="rounded-full bg-studio-panel px-2 py-0.5 text-[10px] text-studio-muted">
            +{skill.actions.length - 6}
          </span>
        )}
      </div>
      {skill.traits.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
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
      )}
      <div className="mt-3 flex items-center gap-3 text-[10px] text-studio-muted">
        <span>
          {skill.states} state{skill.states !== 1 ? 's' : ''}
        </span>
        <span>
          {skill.actions.length} action{skill.actions.length !== 1 ? 's' : ''}
        </span>
        <span className="ml-auto">{timeSince(skill.modifiedAt)}</span>
      </div>
    </button>
  );
}

function SkillDetail({ skill }: { skill: SkillMeta }) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-studio-border bg-[#111827] p-5">
      <div>
        <h2 className="text-lg font-bold text-studio-text">{skill.name}</h2>
        <p className="mt-1 text-xs text-studio-muted">{skill.path}</p>
      </div>
      {skill.description && <p className="text-sm text-studio-text/80">{skill.description}</p>}
      <div>
        <h4 className="text-[10px] uppercase tracking-wider text-studio-muted mb-2">Actions</h4>
        <div className="flex flex-col gap-1">
          {skill.actions.map((a) => (
            <div key={a} className="flex items-center gap-2 rounded-lg bg-[#0f172a] px-3 py-2">
              <div className="h-1.5 w-1.5 rounded-full bg-studio-accent" />
              <span className="text-sm font-mono text-studio-text">{a}</span>
            </div>
          ))}
          {skill.actions.length === 0 && (
            <span className="text-xs text-studio-muted italic">No actions defined</span>
          )}
        </div>
      </div>
      <div>
        <h4 className="text-[10px] uppercase tracking-wider text-studio-muted mb-2">Traits</h4>
        <div className="flex flex-wrap gap-1.5">
          {skill.traits.map((t) => (
            <span key={t} className={`rounded border px-2 py-1 text-xs ${traitBadgeClass(t)}`}>
              @{t}
            </span>
          ))}
          {skill.traits.length === 0 && (
            <span className="text-xs text-studio-muted italic">No traits</span>
          )}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-[#0f172a] p-3 text-center">
          <div className="text-lg font-bold text-studio-text">{skill.states}</div>
          <div className="text-[10px] uppercase tracking-wider text-studio-muted">States</div>
        </div>
        <div className="rounded-lg bg-[#0f172a] p-3 text-center">
          <div className="text-lg font-bold text-studio-text">{skill.actions.length}</div>
          <div className="text-[10px] uppercase tracking-wider text-studio-muted">Actions</div>
        </div>
        <div className="rounded-lg bg-[#0f172a] p-3 text-center">
          <div className="text-lg font-bold text-studio-text">{formatBytes(skill.size)}</div>
          <div className="text-[10px] uppercase tracking-wider text-studio-muted">Size</div>
        </div>
      </div>
      <div className="text-[10px] text-studio-muted">
        Last modified: {new Date(skill.modifiedAt).toLocaleString()}
      </div>
    </div>
  );
}

function CreateSkillPanel({ onCreated }: { onCreated: () => void }) {
  const [selectedTemplate, setSelectedTemplate] = useState(0);
  const [skillName, setSkillName] = useState('');
  const [content, setContent] = useState(SKILL_TEMPLATES[0].content);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = useCallback(async () => {
    const name = skillName.trim() || SKILL_TEMPLATES[selectedTemplate].name;
    setCreating(true);
    setError('');
    try {
      const res = await fetch('/api/holoclaw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, content }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to create skill');
        return;
      }
      setSkillName('');
      onCreated();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  }, [skillName, content, selectedTemplate, onCreated]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-xs font-medium text-studio-muted mb-2">Choose a template</h3>
        <div className="grid grid-cols-2 gap-2">
          {SKILL_TEMPLATES.map((t, idx) => (
            <button
              key={t.name}
              onClick={() => {
                setSelectedTemplate(idx);
                setContent(SKILL_TEMPLATES[idx].content);
                setError('');
              }}
              className={`rounded-lg border p-3 text-left transition-all ${
                selectedTemplate === idx
                  ? 'border-studio-accent bg-studio-accent/10'
                  : 'border-studio-border bg-[#111827] hover:border-studio-accent/40'
              }`}
            >
              <div className="text-sm font-medium text-studio-text">{t.label}</div>
              <div className="mt-1 text-[10px] text-studio-muted">{t.description}</div>
            </button>
          ))}
        </div>
      </div>
      <label className="text-xs font-medium text-studio-muted">
        Skill name
        <input
          type="text"
          value={skillName}
          onChange={(e) => setSkillName(e.target.value)}
          placeholder={SKILL_TEMPLATES[selectedTemplate].name}
          className="mt-1 block w-full rounded-lg border border-studio-border bg-[#0f172a] px-3 py-2 text-sm text-studio-text placeholder:text-studio-muted/50 focus:border-studio-accent focus:outline-none"
        />
      </label>
      <label className="text-xs font-medium text-studio-muted">
        Composition source
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={16}
          spellCheck={false}
          className="mt-1 block w-full rounded-lg border border-studio-border bg-[#0f172a] px-3 py-2 font-mono text-xs text-studio-text placeholder:text-studio-muted/50 focus:border-studio-accent focus:outline-none resize-y"
        />
      </label>
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}
      <button
        onClick={handleCreate}
        disabled={creating || !content.trim()}
        className="rounded-lg bg-studio-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-studio-accent/80 disabled:opacity-50"
      >
        {creating ? 'Installing...' : 'Install Skill'}
      </button>
    </div>
  );
}

function ActivityPanel() {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [streaming, setStreaming] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/holoclaw/activity?limit=50');
        const data = await res.json();
        if (!cancelled) setEntries((data.entries || []).reverse());
      } catch {
        /* ignore */
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
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

  if (loading)
    return <div className="text-sm text-studio-muted animate-pulse">Loading activity...</div>;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-[10px] text-studio-muted">
        <div
          className={`h-2 w-2 rounded-full ${streaming ? 'bg-emerald-500 animate-pulse' : 'bg-gray-600'}`}
        />
        {streaming ? 'Live' : 'Disconnected'}
        <span className="ml-auto">{entries.length} entries</span>
      </div>
      {entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm text-studio-muted">No activity yet</p>
          <p className="mt-1 text-xs text-studio-muted/60">
            Skill executions and channel messages will appear here
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {entries.map((e, i) => (
            <div
              key={`${e.timestamp}-${i}`}
              className="flex items-start gap-3 rounded-lg bg-[#0f172a] p-3"
            >
              <div className="shrink-0 text-[10px] text-studio-muted font-mono">
                {new Date(e.timestamp).toLocaleTimeString()}
              </div>
              <div className="flex-1 min-w-0">
                {e.channel && (
                  <span className="rounded bg-studio-panel px-1.5 py-0.5 text-[10px] text-studio-muted mr-2">
                    #{e.channel}
                  </span>
                )}
                <span className="text-xs text-studio-text">{e.message || '(empty)'}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Utility
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
// Main Page
// ---------------------------------------------------------------------------

export default function HoloClawPage() {
  // Native composition surface for stats dashboard
  const composition = useHoloComposition('/api/holoclaw/surface');

  // Interactive state (tabs, skill list, selection)
  const [tab, setTab] = useState<ClawTab>('shelf');
  const [skills, setSkills] = useState<SkillMeta[]>([]);
  const [selectedSkill, setSelectedSkill] = useState<SkillMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchSkills = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/holoclaw');
      const data = await res.json();
      const fetchedSkills = data.skills || [];
      setSkills(fetchedSkills);
      // Bridge skill count into composition state
      composition.setState({ skillsLoaded: fetchedSkills.length });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchSkills();
  }, [fetchSkills]);

  const tabs: { id: ClawTab; label: string }[] = [
    { id: 'shelf', label: 'Shelf' },
    { id: 'create', label: 'Create' },
    { id: 'activity', label: 'Activity' },
  ];

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-studio-bg text-studio-text">
      {/* Native HoloScript Surface — stats dashboard from holoclaw.hsplus */}
      {!composition.loading && composition.nodes.length > 0 && (
        <div className="shrink-0">
          <HoloSurfaceRenderer
            nodes={composition.nodes}
            state={composition.state}
            computed={composition.computed}
            templates={composition.templates}
            onEmit={composition.emit}
            className="holo-surface-holoclaw"
          />
        </div>
      )}

      {/* Fallback header if composition not loaded */}
      {(composition.loading || composition.nodes.length === 0) && (
        <header className="shrink-0 border-b border-studio-border bg-[#0d0d14] px-6 py-4">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-lg font-bold">HoloClaw</h1>
              <p className="text-xs text-studio-muted">Skill shelf</p>
            </div>
          </div>
        </header>
      )}

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
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {tab === 'shelf' && (
          <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
            <div className="flex flex-col gap-3">
              {loading ? (
                <div className="flex flex-col gap-3">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="h-32 rounded-xl border border-studio-border bg-[#111827] animate-pulse"
                    />
                  ))}
                </div>
              ) : skills.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <p className="text-sm text-studio-muted">No skills installed</p>
                  <p className="mt-1 text-xs text-studio-muted/60">
                    Create your first skill or drop a .hsplus file into compositions/skills/
                  </p>
                  <button
                    onClick={() => setTab('create')}
                    className="mt-4 rounded-lg bg-studio-accent px-4 py-2 text-sm font-medium text-white hover:bg-studio-accent/80"
                  >
                    Create a Skill
                  </button>
                </div>
              ) : (
                skills.map((s) => (
                  <SkillCard
                    key={s.path}
                    skill={s}
                    selected={selectedSkill?.path === s.path}
                    onSelect={setSelectedSkill}
                  />
                ))
              )}
            </div>
            <div className="hidden lg:block">
              {selectedSkill ? (
                <SkillDetail skill={selectedSkill} />
              ) : (
                <div className="flex flex-col items-center justify-center rounded-xl border border-studio-border bg-[#111827] p-8 text-center">
                  <p className="text-xs text-studio-muted">Select a skill to view details</p>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'create' && (
          <div className="mx-auto max-w-2xl">
            <CreateSkillPanel
              onCreated={() => {
                fetchSkills();
                setTab('shelf');
              }}
            />
          </div>
        )}

        {tab === 'activity' && <ActivityPanel />}
      </main>

      {/* Footer */}
      <footer className="shrink-0 border-t border-studio-border bg-[#0d0d14] px-6 py-2">
        <div className="flex items-center justify-between text-[10px] text-studio-muted">
          <span>HoloClaw v0.1 — Skills hot-reload from compositions/skills/ — Native Surface</span>
          <span>
            <Link href="/holodaemon" className="hover:text-studio-text">
              Daemon
            </Link>
            {' \u2022 '}
            <Link href="/pipeline" className="hover:text-studio-text">
              Pipeline
            </Link>
            {' \u2022 '}
            <Link href="/create" className="hover:text-studio-text">
              Create
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
