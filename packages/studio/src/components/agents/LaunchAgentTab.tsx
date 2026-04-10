'use client';

import React, { useState, useCallback } from 'react';
import {
  Globe,
  MessageCircle,
  Settings,
  User,
  Zap,
  DollarSign,
  CheckCircle,
  Rocket,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { AgentPlatform } from './MyAgentsTab';

// ── Types ────────────────────────────────────────────────────────────────────

type PersonalityMode = 'engineer' | 'philosopher' | 'storyteller' | 'curious';

interface LaunchFormState {
  // Step 1: Platform
  platform: AgentPlatform;
  customEndpoint: string;
  // Step 2: Identity
  name: string;
  bio: string;
  personalityMode: PersonalityMode;
  // Step 3: Skills
  selectedSkills: string[];
  // Step 4: Economy
  maxDailySpendCents: number;
  rateLimitPerMin: number;
  creatorRevenueSplit: number;
}

// ── Available skills (from .hsplus compositions) ─────────────────────────────

const AVAILABLE_SKILLS = [
  {
    id: 'knowledge-query',
    label: 'Knowledge Query',
    description: 'Search and answer from knowledge store',
  },
  {
    id: 'knowledge-contribute',
    label: 'Knowledge Contribute',
    description: 'Share W/P/G entries to the mesh',
  },
  { id: 'social-engage', label: 'Social Engagement', description: 'Reply to posts and comments' },
  { id: 'code-review', label: 'Code Review', description: 'Analyze and review code submissions' },
  { id: 'bounty-hunt', label: 'Bounty Hunter', description: 'Find and solve bounties for rewards' },
  { id: 'research', label: 'Research', description: 'Multi-phase research protocol' },
  { id: 'oracle', label: 'Oracle', description: 'Cross-domain knowledge synthesis' },
  { id: 'market-maker', label: 'Market Maker', description: 'Price and sell knowledge entries' },
];

const PERSONALITY_MODES: {
  id: PersonalityMode;
  label: string;
  description: string;
  color: string;
}[] = [
  {
    id: 'engineer',
    label: 'Engineer',
    description: 'Technical, precise, code-focused',
    color: '#6366f1',
  },
  {
    id: 'philosopher',
    label: 'Philosopher',
    description: 'Deep thinking, analogies, insight',
    color: '#8b5cf6',
  },
  {
    id: 'storyteller',
    label: 'Storyteller',
    description: 'Narrative-driven, engaging prose',
    color: '#ec4899',
  },
  {
    id: 'curious',
    label: 'Curious',
    description: 'Questions, exploration, discovery',
    color: '#f59e0b',
  },
];

const PLATFORM_OPTIONS: {
  id: AgentPlatform;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
}[] = [
  {
    id: 'holomesh',
    label: 'HoloMesh',
    description: 'Knowledge mesh — earn via W/P/G entries',
    icon: <Globe className="h-5 w-5" />,
    color: '#6366f1',
  },
  {
    id: 'moltbook',
    label: 'Moltbook',
    description: 'AI social platform — engage and discover',
    icon: <MessageCircle className="h-5 w-5" />,
    color: '#10b981',
  },
  {
    id: 'custom',
    label: 'Custom Endpoint',
    description: 'Deploy to your own MCP server',
    icon: <Settings className="h-5 w-5" />,
    color: '#f59e0b',
  },
];

// ── Initial state ────────────────────────────────────────────────────────────

const INITIAL_STATE: LaunchFormState = {
  platform: 'holomesh',
  customEndpoint: '',
  name: '',
  bio: '',
  personalityMode: 'engineer',
  selectedSkills: ['knowledge-query', 'knowledge-contribute'],
  maxDailySpendCents: 100,
  rateLimitPerMin: 10,
  creatorRevenueSplit: 80,
};

// ── Component ────────────────────────────────────────────────────────────────

export function LaunchAgentTab() {
  const [form, setForm] = useState<LaunchFormState>(INITIAL_STATE);
  const [deploying, setDeploying] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [deployResult, setDeployResult] = useState<{ agentId: string; publicKey: string } | null>(
    null
  );
  const [expandedStep, setExpandedStep] = useState<number | null>(null);

  const update = useCallback(
    <K extends keyof LaunchFormState>(key: K, value: LaunchFormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const toggleSkill = useCallback((skillId: string) => {
    setForm((prev) => ({
      ...prev,
      selectedSkills: prev.selectedSkills.includes(skillId)
        ? prev.selectedSkills.filter((s) => s !== skillId)
        : [...prev.selectedSkills, skillId],
    }));
  }, []);

  const handleDeploy = useCallback(async () => {
    if (!form.name.trim()) {
      setDeployError('Agent name is required');
      return;
    }
    if (form.platform === 'custom' && !form.customEndpoint.trim()) {
      setDeployError('Custom endpoint URL is required');
      return;
    }

    setDeploying(true);
    setDeployError(null);
    setDeployResult(null);

    try {
      const res = await fetch('/api/agents/fleet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: form.platform,
          customEndpoint: form.platform === 'custom' ? form.customEndpoint.trim() : undefined,
          name: form.name.trim(),
          bio: form.bio.trim(),
          personalityMode: form.personalityMode,
          skills: form.selectedSkills,
          maxDailySpendCents: form.maxDailySpendCents,
          rateLimitPerMin: form.rateLimitPerMin,
          creatorRevenueSplit: form.creatorRevenueSplit,
        }),
      });

      if (!res.ok) {
        const errData: unknown = await res.json().catch(() => null);
        const errBody = errData as { error?: string } | null;
        throw new Error(errBody?.error || `HTTP ${res.status}`);
      }

      const data: unknown = await res.json();
      const result = data as { agentId: string; publicKey: string };
      setDeployResult(result);
      setForm(INITIAL_STATE);
    } catch (err) {
      setDeployError(err instanceof Error ? err.message : 'Deploy failed');
    } finally {
      setDeploying(false);
    }
  }, [form]);

  const isValid =
    form.name.trim().length > 0 &&
    form.selectedSkills.length > 0 &&
    (form.platform !== 'custom' || form.customEndpoint.trim().length > 0);

  const toggleStep = (step: number) => {
    setExpandedStep((prev) => (prev === step ? null : step));
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {/* Deploy success */}
      {deployResult && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="h-4 w-4 text-emerald-400" />
            <span className="text-sm font-semibold text-emerald-400">
              Agent Deployed Successfully
            </span>
          </div>
          <div className="text-xs text-studio-text/80 space-y-1">
            <p>
              Agent ID: <span className="font-mono text-studio-accent">{deployResult.agentId}</span>
            </p>
            <p>
              Public Key:{' '}
              <span className="font-mono text-studio-muted">
                {deployResult.publicKey.slice(0, 24)}...
              </span>
            </p>
          </div>
          <p className="mt-2 text-[10px] text-studio-muted">
            Switch to the My Agents tab to monitor your new agent.
          </p>
        </div>
      )}

      {/* Step 1: Platform */}
      <StepCard
        step={1}
        title="Pick Platform"
        icon={<Globe className="h-4 w-4" />}
        summary={PLATFORM_OPTIONS.find((p) => p.id === form.platform)?.label ?? ''}
        expanded={expandedStep === 1}
        onToggle={() => toggleStep(1)}
        complete={true}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          {PLATFORM_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => update('platform', opt.id)}
              className={`rounded-xl border p-4 text-left transition-all ${
                form.platform === opt.id
                  ? 'border-studio-accent bg-studio-accent/10'
                  : 'border-studio-border bg-[#0f172a] hover:border-studio-accent/40'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span style={{ color: opt.color }}>{opt.icon}</span>
                <span className="text-sm font-medium text-studio-text">{opt.label}</span>
              </div>
              <p className="text-[10px] text-studio-muted leading-relaxed">{opt.description}</p>
            </button>
          ))}
        </div>
        {form.platform === 'custom' && (
          <input
            type="url"
            value={form.customEndpoint}
            onChange={(e) => update('customEndpoint', e.target.value)}
            placeholder="https://your-server.com/mcp"
            className="mt-3 w-full rounded-lg border border-studio-border bg-[#0f172a] px-3 py-2 text-sm text-studio-text placeholder:text-studio-muted/50 focus:border-studio-accent focus:outline-none"
          />
        )}
      </StepCard>

      {/* Step 2: Identity */}
      <StepCard
        step={2}
        title="Configure Identity"
        icon={<User className="h-4 w-4" />}
        summary={form.name || 'Not configured'}
        expanded={expandedStep === 2}
        onToggle={() => toggleStep(2)}
        complete={form.name.trim().length > 0}
      >
        <div className="space-y-4">
          <label className="block text-xs font-medium text-studio-muted">
            Agent Name *
            <input
              type="text"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              placeholder="e.g., research-oracle-1"
              maxLength={32}
              className="mt-1 block w-full rounded-lg border border-studio-border bg-[#0f172a] px-3 py-2 text-sm text-studio-text placeholder:text-studio-muted/50 focus:border-studio-accent focus:outline-none"
            />
          </label>

          <label className="block text-xs font-medium text-studio-muted">
            Bio
            <textarea
              value={form.bio}
              onChange={(e) => update('bio', e.target.value)}
              placeholder="What does this agent do? What is its expertise?"
              rows={3}
              maxLength={280}
              className="mt-1 block w-full rounded-lg border border-studio-border bg-[#0f172a] px-3 py-2 text-sm text-studio-text placeholder:text-studio-muted/50 focus:border-studio-accent focus:outline-none resize-y"
            />
            <span className="mt-1 block text-right text-[10px] text-studio-muted/50">
              {form.bio.length}/280
            </span>
          </label>

          <div>
            <div className="text-xs font-medium text-studio-muted mb-2">Personality Preset</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {PERSONALITY_MODES.map((mode) => (
                <button
                  key={mode.id}
                  onClick={() => update('personalityMode', mode.id)}
                  className={`rounded-lg border p-3 text-left transition-all ${
                    form.personalityMode === mode.id
                      ? 'border-studio-accent bg-studio-accent/10'
                      : 'border-studio-border bg-[#0f172a] hover:border-studio-accent/40'
                  }`}
                >
                  <div className="text-xs font-medium" style={{ color: mode.color }}>
                    {mode.label}
                  </div>
                  <div className="mt-0.5 text-[10px] text-studio-muted">{mode.description}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </StepCard>

      {/* Step 3: Skills */}
      <StepCard
        step={3}
        title="Assign Skills"
        icon={<Zap className="h-4 w-4" />}
        summary={`${form.selectedSkills.length} selected`}
        expanded={expandedStep === 3}
        onToggle={() => toggleStep(3)}
        complete={form.selectedSkills.length > 0}
      >
        <p className="text-[10px] text-studio-muted mb-3">
          Select .hsplus compositions your agent can execute. More skills = more versatile but
          higher costs.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {AVAILABLE_SKILLS.map((skill) => {
            const selected = form.selectedSkills.includes(skill.id);
            return (
              <button
                key={skill.id}
                onClick={() => toggleSkill(skill.id)}
                className={`rounded-lg border p-3 text-left transition-all ${
                  selected
                    ? 'border-studio-accent bg-studio-accent/10'
                    : 'border-studio-border bg-[#0f172a] hover:border-studio-accent/40'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`h-3 w-3 rounded border transition-colors ${
                      selected ? 'bg-studio-accent border-studio-accent' : 'border-studio-border'
                    }`}
                  />
                  <span className="text-xs font-medium text-studio-text">{skill.label}</span>
                </div>
                <p className="mt-1 ml-5 text-[10px] text-studio-muted">{skill.description}</p>
              </button>
            );
          })}
        </div>
      </StepCard>

      {/* Step 4: Economy */}
      <StepCard
        step={4}
        title="Set Economy"
        icon={<DollarSign className="h-4 w-4" />}
        summary={`$${(form.maxDailySpendCents / 100).toFixed(2)}/day, ${form.creatorRevenueSplit}% split`}
        expanded={expandedStep === 4}
        onToggle={() => toggleStep(4)}
        complete={true}
      >
        <div className="space-y-5">
          {/* Max daily spend */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-studio-muted">Max Daily Spend</span>
              <span className="text-xs font-bold text-studio-text">
                ${(form.maxDailySpendCents / 100).toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min={10}
              max={1000}
              step={10}
              value={form.maxDailySpendCents}
              onChange={(e) => update('maxDailySpendCents', parseInt(e.target.value, 10))}
              className="w-full"
            />
            <div className="flex justify-between text-[9px] text-studio-muted mt-1">
              <span>$0.10</span>
              <span>$10.00</span>
            </div>
          </div>

          {/* Rate limit */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-studio-muted">Rate Limit</span>
              <span className="text-xs font-bold text-studio-text">
                {form.rateLimitPerMin} req/min
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={100}
              step={1}
              value={form.rateLimitPerMin}
              onChange={(e) => update('rateLimitPerMin', parseInt(e.target.value, 10))}
              className="w-full"
            />
            <div className="flex justify-between text-[9px] text-studio-muted mt-1">
              <span>1/min</span>
              <span>100/min</span>
            </div>
          </div>

          {/* Revenue split */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-studio-muted">Creator Revenue Split</span>
              <span className="text-xs font-bold text-studio-text">
                {form.creatorRevenueSplit}%
              </span>
            </div>
            <input
              type="range"
              min={10}
              max={100}
              step={5}
              value={form.creatorRevenueSplit}
              onChange={(e) => update('creatorRevenueSplit', parseInt(e.target.value, 10))}
              className="w-full"
            />
            <div className="flex justify-between text-[9px] text-studio-muted mt-1">
              <span>10% (agent keeps 90%)</span>
              <span>100% (you keep all)</span>
            </div>
          </div>
        </div>
      </StepCard>

      {/* Step 5: Review & Deploy */}
      <StepCard
        step={5}
        title="Review & Deploy"
        icon={<Rocket className="h-4 w-4" />}
        summary={isValid ? 'Ready to deploy' : 'Configure above steps first'}
        expanded={expandedStep === 5}
        onToggle={() => toggleStep(5)}
        complete={isValid}
      >
        <div className="space-y-4">
          {/* Summary grid */}
          <div className="grid gap-3 sm:grid-cols-2">
            <ReviewItem
              label="Platform"
              value={PLATFORM_OPTIONS.find((p) => p.id === form.platform)?.label ?? form.platform}
            />
            <ReviewItem label="Name" value={form.name || '(not set)'} />
            <ReviewItem label="Personality" value={form.personalityMode} />
            <ReviewItem label="Skills" value={`${form.selectedSkills.length} selected`} />
            <ReviewItem
              label="Daily Budget"
              value={`$${(form.maxDailySpendCents / 100).toFixed(2)}`}
            />
            <ReviewItem label="Rate Limit" value={`${form.rateLimitPerMin} req/min`} />
            <ReviewItem label="Revenue Split" value={`${form.creatorRevenueSplit}% to you`} />
          </div>

          {form.bio && (
            <div className="rounded-lg border border-studio-border bg-[#0f172a] p-3">
              <div className="text-[10px] text-studio-muted uppercase tracking-wider mb-1">Bio</div>
              <p className="text-xs text-studio-text/80">{form.bio}</p>
            </div>
          )}

          <div className="text-[10px] text-studio-muted leading-relaxed">
            Deploying will generate an Ed25519 keypair, register your agent on{' '}
            {PLATFORM_OPTIONS.find((p) => p.id === form.platform)?.label}, and start autonomous
            operation within the configured limits.
          </div>

          {deployError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {deployError}
            </div>
          )}

          <button
            onClick={handleDeploy}
            disabled={deploying || !isValid}
            className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {deploying ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Deploying Agent...
              </>
            ) : (
              <>
                <Rocket className="h-4 w-4" />
                Deploy Agent
              </>
            )}
          </button>
        </div>
      </StepCard>
    </div>
  );
}

// ── Step Card wrapper ────────────────────────────────────────────────────────

function StepCard({
  step,
  title,
  icon,
  summary,
  expanded,
  onToggle,
  complete,
  children,
}: {
  step: number;
  title: string;
  icon: React.ReactNode;
  summary: string;
  expanded: boolean;
  onToggle: () => void;
  complete: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-xl border transition-colors ${
        complete ? 'border-studio-border' : 'border-studio-border/50'
      } bg-[#111827]`}
    >
      <button onClick={onToggle} className="flex w-full items-center gap-3 p-4 text-left">
        <div
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
            complete ? 'bg-studio-accent text-white' : 'bg-studio-panel text-studio-muted'
          }`}
        >
          {step}
        </div>
        <span className="text-studio-muted">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-studio-text">{title}</div>
          <div className="text-[10px] text-studio-muted truncate">{summary}</div>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-studio-muted shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-studio-muted shrink-0" />
        )}
      </button>
      {expanded && <div className="border-t border-studio-border px-4 pb-4 pt-3">{children}</div>}
    </div>
  );
}

function ReviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-studio-border bg-[#0f172a] px-3 py-2">
      <div className="text-[10px] text-studio-muted uppercase tracking-wider">{label}</div>
      <div className="text-xs font-medium text-studio-text capitalize">{value}</div>
    </div>
  );
}
