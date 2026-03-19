'use client';

/**
 * HoloClaw — /holoclaw
 *
 * The Claw Shelf: skill marketplace for HoloScript-native daemon compositions.
 * Skills are .hsplus files that define behavior trees, actions, states, and
 * trait-guarded capabilities. Drop a .hsplus file into compositions/skills/
 * and the daemon hot-reloads it.
 *
 * Tabs:
 *   - Shelf: browse installed skills with trait badges and action counts
 *   - Create: author a new skill from a template
 *   - Activity: recent skill executions and channel messages
 *
 * @module holoclaw/page
 */

import React, { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';

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
// Templates
// ---------------------------------------------------------------------------

const SKILL_TEMPLATES: { name: string; label: string; description: string; content: string }[] = [
  {
    name: 'basic-action',
    label: 'Basic Action',
    description: 'A single action with shell execution',
    content: `composition "my-skill" {
  @rate_limiter
  @timeout_guard

  state status: string = "idle"

  action "run" {
    command: "echo"
    args: ["hello from my-skill"]
  }
}
`,
  },
  {
    name: 'bt-workflow',
    label: 'BT Workflow',
    description: 'A behavior tree with sequence and fallback nodes',
    content: `composition "my-workflow" {
  @behavior_tree
  @economy
  @circuit_breaker

  state phase: string = "init"
  state retries: number = 0

  sequence "main" {
    action "diagnose" {
      // Analyze the current state
    }
    action "fix" {
      // Apply a fix
    }
    action "verify" {
      // Verify the fix worked
    }
  }

  fallback "recovery" {
    action "rollback" {
      // Undo changes if verify failed
    }
    action "report_failure" {
      // Log the failure
    }
  }
}
`,
  },
  {
    name: 'channel-listener',
    label: 'Channel Listener',
    description: 'Ingests messages from Discord/Slack and responds',
    content: `composition "channel-responder" {
  @rate_limiter
  @rbac

  state lastMessage: string = ""
  state responseCount: number = 0

  sequence "listen-respond" {
    action "channel_ingest" {
      // Read from inbox.jsonl
    }
    action "process_message" {
      // LLM processes the message
    }
    action "channel_send" {
      // Send response to outbox.jsonl
    }
  }
}
`,
  },
  {
    name: 'scheduled-task',
    label: 'Scheduled Task',
    description: 'Runs on a schedule with economy tracking',
    content: `composition "scheduled-health-check" {
  @scheduler
  @economy
  @timeout_guard

  state lastRun: string = ""
  state healthScore: number = 1.0

  action "check_health" {
    command: "npm"
    args: ["test", "--", "--run"]
  }

  action "report" {
    // Emit health metrics
  }
}
`,
  },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SkillCard({
  skill,
  onSelect,
  selected,
}: {
  skill: SkillMeta;
  onSelect: (s: SkillMeta) => void;
  selected: boolean;
}) {
  const age = timeSince(skill.modifiedAt);
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

      {/* Actions */}
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

      {/* Traits */}
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

      {/* Footer */}
      <div className="mt-3 flex items-center gap-3 text-[10px] text-studio-muted">
        <span>{skill.states} state{skill.states !== 1 ? 's' : ''}</span>
        <span>{skill.actions.length} action{skill.actions.length !== 1 ? 's' : ''}</span>
        <span className="ml-auto">{age}</span>
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

      {skill.description && (
        <p className="text-sm text-studio-text/80">{skill.description}</p>
      )}

      <div>
        <h4 className="text-[10px] uppercase tracking-wider text-studio-muted mb-2">Actions</h4>
        <div className="flex flex-col gap-1">
          {skill.actions.map((a) => (
            <div
              key={a}
              className="flex items-center gap-2 rounded-lg bg-[#0f172a] px-3 py-2"
            >
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
            <span
              key={t}
              className={`rounded border px-2 py-1 text-xs ${traitBadgeClass(t)}`}
            >
              @{t}
            </span>
          ))}
          {skill.traits.length === 0 && (
            <span className="text-xs text-studio-muted italic">No traits</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatMini label="States" value={skill.states} />
        <StatMini label="Actions" value={skill.actions.length} />
        <StatMini label="Size" value={formatBytes(skill.size)} />
      </div>

      <div className="text-[10px] text-studio-muted">
        Last modified: {new Date(skill.modifiedAt).toLocaleString()}
      </div>
    </div>
  );
}

function StatMini({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-[#0f172a] p-3 text-center">
      <div className="text-lg font-bold text-studio-text">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-studio-muted">{label}</div>
    </div>
  );
}

function CreateSkillPanel({ onCreated }: { onCreated: () => void }) {
  const [selectedTemplate, setSelectedTemplate] = useState(0);
  const [skillName, setSkillName] = useState('');
  const [content, setContent] = useState(SKILL_TEMPLATES[0].content);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const handleTemplateSelect = useCallback((idx: number) => {
    setSelectedTemplate(idx);
    setContent(SKILL_TEMPLATES[idx].content);
    setError('');
  }, []);

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
      {/* Template selector */}
      <div>
        <h3 className="text-xs font-medium text-studio-muted mb-2">Choose a template</h3>
        <div className="grid grid-cols-2 gap-2">
          {SKILL_TEMPLATES.map((t, idx) => (
            <button
              key={t.name}
              onClick={() => handleTemplateSelect(idx)}
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

      {/* Name input */}
      <div>
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
      </div>

      {/* Content editor */}
      <div>
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
      </div>

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

  useEffect(() => {
    // Activity is read from the daemon's outbox — a future API endpoint.
    // For now, show placeholder.
    setLoading(false);
    setEntries([]);
  }, []);

  if (loading) {
    return <div className="text-sm text-studio-muted animate-pulse">Loading activity...</div>;
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="text-4xl mb-3 opacity-40">&#x1f4e1;</div>
        <p className="text-sm text-studio-muted">No activity yet</p>
        <p className="mt-1 text-xs text-studio-muted/60">
          Skill executions and channel messages will appear here
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {entries.map((e, i) => (
        <div key={i} className="flex items-start gap-3 rounded-lg bg-[#0f172a] p-3">
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
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function HoloClawPage() {
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
      setSkills(data.skills || []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

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
      {/* Header */}
      <header className="shrink-0 border-b border-studio-border bg-[#0d0d14] px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">&#x1f9de;</span>
            <div>
              <h1 className="text-lg font-bold">HoloClaw</h1>
              <p className="text-xs text-studio-muted">
                Skill shelf &middot; {skills.length} installed
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/holodaemon"
              className="rounded-lg border border-studio-border px-3 py-1.5 text-xs text-studio-muted hover:text-studio-text hover:border-studio-accent/40 transition-colors"
            >
              Daemon
            </Link>
            <Link
              href="/"
              className="rounded-lg border border-studio-border px-3 py-1.5 text-xs text-studio-muted hover:text-studio-text hover:border-studio-accent/40 transition-colors"
            >
              Home
            </Link>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-4 flex gap-1">
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
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-6">
        {error && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {tab === 'shelf' && (
          <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
            {/* Skill list */}
            <div className="flex flex-col gap-3">
              {loading ? (
                <div className="flex flex-col gap-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-32 rounded-xl border border-studio-border bg-[#111827] animate-pulse" />
                  ))}
                </div>
              ) : skills.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="text-5xl mb-4 opacity-30">&#x1f4e6;</div>
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

            {/* Detail panel */}
            <div className="hidden lg:block">
              {selectedSkill ? (
                <SkillDetail skill={selectedSkill} />
              ) : (
                <div className="flex flex-col items-center justify-center rounded-xl border border-studio-border bg-[#111827] p-8 text-center">
                  <div className="text-3xl mb-3 opacity-20">&#x1f50d;</div>
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
          <span>
            HoloClaw v0.1 &middot; Skills hot-reload from compositions/skills/
          </span>
          <span>
            <Link href="/holodaemon" className="hover:text-studio-text">
              Daemon Dashboard
            </Link>
            {' '}&#x2022;{' '}
            <Link href="/create" className="hover:text-studio-text">
              Create
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
