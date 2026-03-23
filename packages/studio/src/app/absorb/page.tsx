'use client';

/**
 * /absorb — Paid AI-Powered Project Management Service.
 *
 * 4-tab layout: Dashboard, Projects, Credits, Pricing.
 * Unauthenticated users see a landing page with pricing.
 * Authenticated users manage projects and credits.
 */

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useAbsorbService } from '@/hooks/useAbsorbService';
import { CREDIT_PACKAGES, OPERATION_COSTS, TIER_LIMITS } from '@/lib/absorb/pricing';

// ─── Types ────────────────────────────────────────────────────────────────────

type AbsorbTab = 'dashboard' | 'projects' | 'credits' | 'tools' | 'pricing';
type QualityTierOption = 'low' | 'medium' | 'high' | 'ultra';

// ─── Sub-Components ───────────────────────────────────────────────────────────

function CreditBalanceCard({ balance, tier }: { balance: number; tier: string }) {
  const tierColors: Record<string, string> = {
    free: 'border-gray-500/30 text-gray-400',
    pro: 'border-indigo-500/30 text-indigo-400',
    enterprise: 'border-amber-500/30 text-amber-400',
  };
  return (
    <div className="rounded-xl border border-studio-border bg-[#111827] p-6">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-3xl font-bold text-studio-text">${(balance / 100).toFixed(2)}</div>
          <div className="mt-1 text-xs text-studio-muted">Available credits</div>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-medium uppercase ${tierColors[tier] || tierColors.free}`}>
          {tier}
        </span>
      </div>
    </div>
  );
}

function ProjectCard({
  project,
  selected,
  onSelect,
  onAbsorb,
  onImprove,
}: {
  project: { id: string; name: string; sourceType: string; status: string; totalSpentCents: number; totalOperations: number; lastAbsorbedAt: string | null; createdAt: string };
  selected: boolean;
  onSelect: () => void;
  onAbsorb: () => void;
  onImprove: () => void;
}) {
  const statusColors: Record<string, string> = {
    pending: 'bg-gray-500/20 text-gray-400',
    absorbing: 'bg-blue-500/20 text-blue-400 animate-pulse',
    ready: 'bg-emerald-500/20 text-emerald-400',
    improving: 'bg-purple-500/20 text-purple-400 animate-pulse',
    error: 'bg-red-500/20 text-red-400',
  };

  return (
    <div
      onClick={onSelect}
      className={`cursor-pointer rounded-xl border p-4 transition-all ${
        selected
          ? 'border-studio-accent bg-studio-accent/10 shadow-lg shadow-studio-accent/5'
          : 'border-studio-border bg-[#111827] hover:border-studio-accent/40'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-studio-text">{project.name}</h3>
          <p className="mt-1 text-xs text-studio-muted">{project.sourceType}</p>
        </div>
        <span className={`ml-2 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${statusColors[project.status] || statusColors.pending}`}>
          {project.status}
        </span>
      </div>
      <div className="mt-3 flex items-center gap-3 text-[10px] text-studio-muted">
        <span>${(project.totalSpentCents / 100).toFixed(2)} spent</span>
        <span>{project.totalOperations} ops</span>
        {project.lastAbsorbedAt && (
          <span className="ml-auto">{timeSince(project.lastAbsorbedAt)}</span>
        )}
      </div>
      <div className="mt-3 flex gap-2">
        <button
          onClick={(e) => { e.stopPropagation(); onAbsorb(); }}
          disabled={project.status === 'absorbing' || project.status === 'improving'}
          className="rounded-lg bg-blue-500/20 px-3 py-1.5 text-xs font-medium text-blue-300 hover:bg-blue-500/30 disabled:opacity-50"
        >
          Absorb
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onImprove(); }}
          disabled={project.status !== 'ready'}
          className="rounded-lg bg-purple-500/20 px-3 py-1.5 text-xs font-medium text-purple-300 hover:bg-purple-500/30 disabled:opacity-50"
        >
          Improve
        </button>
      </div>
    </div>
  );
}

function CreditPackageCard({
  pkg,
  onPurchase,
}: {
  pkg: { id: string; label: string; credits: number; priceCents: number; popular: boolean };
  onPurchase: () => void;
}) {
  return (
    <div className={`rounded-xl border p-5 transition-all ${
      pkg.popular
        ? 'border-studio-accent bg-studio-accent/5 shadow-lg shadow-studio-accent/10'
        : 'border-studio-border bg-[#111827] hover:border-studio-accent/40'
    }`}>
      {pkg.popular && (
        <div className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-studio-accent">Most Popular</div>
      )}
      <div className="text-lg font-bold text-studio-text">{pkg.label}</div>
      <div className="mt-1 text-2xl font-bold text-studio-text">${(pkg.priceCents / 100).toFixed(0)}</div>
      <div className="mt-1 text-xs text-studio-muted">{pkg.credits.toLocaleString()} credits</div>
      <div className="mt-1 text-[10px] text-studio-muted">
        ${(pkg.priceCents / pkg.credits).toFixed(3)}/credit
      </div>
      <button
        onClick={onPurchase}
        className={`mt-4 w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
          pkg.popular
            ? 'bg-studio-accent text-white hover:bg-studio-accent/80'
            : 'bg-studio-panel text-studio-text hover:bg-studio-accent/20'
        }`}
      >
        Buy Credits
      </button>
    </div>
  );
}

function OperationCostTable() {
  const ops = Object.entries(OPERATION_COSTS);
  return (
    <div className="overflow-hidden rounded-xl border border-studio-border">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-studio-border bg-[#0d0d14]">
            <th className="px-4 py-3 text-left font-medium text-studio-muted">Operation</th>
            <th className="px-4 py-3 text-right font-medium text-studio-muted">Credits</th>
            <th className="px-4 py-3 text-right font-medium text-studio-muted">Cost</th>
          </tr>
        </thead>
        <tbody>
          {ops.map(([key, op]) => (
            <tr key={key} className="border-b border-studio-border/50 last:border-0">
              <td className="px-4 py-2.5 text-studio-text">{op.description}</td>
              <td className="px-4 py-2.5 text-right font-mono text-studio-muted">{op.baseCostCents}</td>
              <td className="px-4 py-2.5 text-right font-mono text-studio-text">${(op.baseCostCents / 100).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TierComparisonTable() {
  const tiers = Object.entries(TIER_LIMITS) as [string, typeof TIER_LIMITS.free][];
  return (
    <div className="overflow-hidden rounded-xl border border-studio-border">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-studio-border bg-[#0d0d14]">
            <th className="px-4 py-3 text-left font-medium text-studio-muted">Feature</th>
            {tiers.map(([name]) => (
              <th key={name} className="px-4 py-3 text-center font-medium text-studio-muted capitalize">{name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-studio-border/50">
            <td className="px-4 py-2.5 text-studio-text">Free credits</td>
            {tiers.map(([name, t]) => (
              <td key={name} className="px-4 py-2.5 text-center text-studio-muted">{t.freeCredits > 0 ? `$${(t.freeCredits / 100).toFixed(2)}` : '—'}</td>
            ))}
          </tr>
          <tr className="border-b border-studio-border/50">
            <td className="px-4 py-2.5 text-studio-text">Active projects</td>
            {tiers.map(([name, t]) => (
              <td key={name} className="px-4 py-2.5 text-center text-studio-muted">{t.maxProjectsActive}</td>
            ))}
          </tr>
          <tr className="border-b border-studio-border/50">
            <td className="px-4 py-2.5 text-studio-text">Absorb depth</td>
            {tiers.map(([name, t]) => (
              <td key={name} className="px-4 py-2.5 text-center text-studio-muted capitalize">{t.maxAbsorbDepth}</td>
            ))}
          </tr>
          <tr className="border-b border-studio-border/50 last:border-0">
            <td className="px-4 py-2.5 text-studio-text">Recursive pipeline</td>
            {tiers.map(([name, t]) => (
              <td key={name} className="px-4 py-2.5 text-center text-studio-muted">{t.pipelineEnabled ? 'Yes' : '—'}</td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function NewProjectForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const { createProject } = useAbsorbService();

  const handleCreate = useCallback(async () => {
    if (!name.trim()) return;
    setCreating(true);
    setError('');
    const project = await createProject(name.trim(), sourceUrl ? 'github' : 'workspace', sourceUrl || undefined);
    if (project) {
      setName('');
      setSourceUrl('');
      onCreated();
    } else {
      setError('Failed to create project');
    }
    setCreating(false);
  }, [name, sourceUrl, createProject, onCreated]);

  return (
    <div className="rounded-xl border border-studio-border bg-[#111827] p-5">
      <h3 className="text-sm font-semibold text-studio-text mb-4">New Project</h3>
      <div className="flex flex-col gap-3">
        <label className="text-xs font-medium text-studio-muted">
          Project name
          <input
            type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="my-project"
            className="mt-1 block w-full rounded-lg border border-studio-border bg-[#0f172a] px-3 py-2 text-sm text-studio-text placeholder:text-studio-muted/50 focus:border-studio-accent focus:outline-none"
          />
        </label>
        <label className="text-xs font-medium text-studio-muted">
          GitHub URL (optional)
          <input
            type="text" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://github.com/user/repo"
            className="mt-1 block w-full rounded-lg border border-studio-border bg-[#0f172a] px-3 py-2 text-sm text-studio-text placeholder:text-studio-muted/50 focus:border-studio-accent focus:outline-none"
          />
        </label>
        {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</div>}
        <button
          onClick={handleCreate}
          disabled={creating || !name.trim()}
          className="rounded-lg bg-studio-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-studio-accent/80 disabled:opacity-50"
        >
          {creating ? 'Creating...' : 'Create Project'}
        </button>
      </div>
    </div>
  );
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function timeSince(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// ─── Landing Page (Unauthenticated) ───────────────────────────────────────────

function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-studio-bg text-studio-text">
      {/* Hero */}
      <header className="border-b border-studio-border bg-[#0d0d14] px-6 py-16 text-center">
        <h1 className="text-4xl font-bold tracking-tight">AI-Powered Code Improvement</h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-studio-muted">
          Import your project, let our AI analyze patterns, fix issues, and generate optimizations.
          Powered by Claude, Grok, and GPT — pay only for what you use.
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <Link
            href="/api/auth/signin"
            className="rounded-lg bg-studio-accent px-6 py-3 text-sm font-semibold text-white hover:bg-studio-accent/80"
          >
            Get Started Free
          </Link>
          <a
            href="#pricing"
            className="rounded-lg border border-studio-border px-6 py-3 text-sm font-semibold text-studio-muted hover:text-studio-text hover:border-studio-accent/40"
          >
            View Pricing
          </a>
        </div>
        <p className="mt-4 text-xs text-studio-muted">100 free credits ($1.00) on signup — no credit card required</p>
      </header>

      {/* Features */}
      <section className="border-b border-studio-border px-6 py-16">
        <div className="mx-auto grid max-w-4xl gap-8 md:grid-cols-3">
          {[
            { title: 'Absorb', desc: 'Deep codebase analysis — patterns, dependencies, quality metrics. Understand your code in seconds.' },
            { title: 'Improve', desc: 'AI-driven fixes and optimizations. Type errors, test failures, lint issues — fixed automatically.' },
            { title: 'Pipeline', desc: '3-layer recursive self-improvement. Code fixer, strategy optimizer, and meta-strategist working together.' },
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
        <h2 className="mb-8 text-center text-2xl font-bold text-studio-text">Simple, Pay-Per-Use Pricing</h2>
        <div className="mx-auto grid max-w-4xl gap-4 md:grid-cols-4">
          {CREDIT_PACKAGES.map((pkg) => (
            <CreditPackageCard
              key={pkg.id}
              pkg={pkg}
              onPurchase={() => { window.location.href = '/api/auth/signin'; }}
            />
          ))}
        </div>
        <div className="mx-auto mt-12 max-w-3xl">
          <h3 className="mb-4 text-lg font-semibold text-studio-text text-center">Operation Costs</h3>
          <OperationCostTable />
        </div>
        <div className="mx-auto mt-8 max-w-3xl">
          <h3 className="mb-4 text-lg font-semibold text-studio-text text-center">Tier Comparison</h3>
          <TierComparisonTable />
        </div>
        <p className="mt-8 text-center text-xs text-studio-muted">
          LLM token usage is metered on top of base operation costs. Fair pricing — only 15% over provider costs to cover infrastructure.
        </p>
      </section>

      {/* Footer */}
      <footer className="border-t border-studio-border bg-[#0d0d14] px-6 py-4">
        <div className="flex items-center justify-between text-[10px] text-studio-muted">
          <span>HoloScript Absorb Service — Powered by HoloDaemon + HoloClaw</span>
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

// ─── Tools Tab Component ──────────────────────────────────────────────────────

const QUALITY_TIER_DESCRIPTIONS: Record<QualityTierOption, { label: string; desc: string }> = {
  low: { label: 'Low', desc: 'Minimal particles, basic LOD, no shadows. Best for quick previews.' },
  medium: { label: 'Medium', desc: 'Balanced quality. Good for development and iteration.' },
  high: { label: 'High', desc: 'Full particles, detailed LOD, shadow maps. Production quality.' },
  ultra: { label: 'Ultra', desc: 'Maximum fidelity — all effects, highest resolution. GPU-intensive.' },
};

function ToolsTab({
  projects,
  activeProjectId,
  qualityTier,
  onSetQualityTier,
  onQuery,
  onRender,
  onDiff,
}: {
  projects: { id: string; name: string }[];
  activeProjectId: string | null;
  qualityTier: QualityTierOption;
  onSetQualityTier: (tier: QualityTierOption) => void;
  onQuery: (projectId: string, query: string, withLLM?: boolean) => Promise<{ success: boolean; data: Record<string, unknown> }>;
  onRender: (projectId: string, format: 'png' | 'jpeg' | 'webp' | 'pdf', options?: { width?: number; height?: number; quality?: number }) => Promise<{ success: boolean; data: Record<string, unknown> }>;
  onDiff: (projectId: string, sourceA: string, sourceB: string) => Promise<{ success: boolean; data: Record<string, unknown> }>;
}) {
  const [selectedProject, setSelectedProject] = useState(activeProjectId || projects[0]?.id || '');

  // Query state
  const [queryText, setQueryText] = useState('');
  const [withLLM, setWithLLM] = useState(false);
  const [queryResult, setQueryResult] = useState<Record<string, unknown> | null>(null);
  const [queryLoading, setQueryLoading] = useState(false);

  // Render state
  const [renderFormat, setRenderFormat] = useState<'png' | 'jpeg' | 'webp' | 'pdf'>('png');
  const [renderWidth, setRenderWidth] = useState(1280);
  const [renderHeight, setRenderHeight] = useState(720);
  const [renderResult, setRenderResult] = useState<Record<string, unknown> | null>(null);
  const [renderLoading, setRenderLoading] = useState(false);

  // Diff state
  const [sourceA, setSourceA] = useState('');
  const [sourceB, setSourceB] = useState('');
  const [diffResult, setDiffResult] = useState<Record<string, unknown> | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);

  const handleQuery = useCallback(async () => {
    if (!selectedProject || !queryText.trim()) return;
    setQueryLoading(true);
    const res = await onQuery(selectedProject, queryText, withLLM);
    setQueryResult(res.data);
    setQueryLoading(false);
  }, [selectedProject, queryText, withLLM, onQuery]);

  const handleRender = useCallback(async () => {
    if (!selectedProject) return;
    setRenderLoading(true);
    const res = await onRender(selectedProject, renderFormat, { width: renderWidth, height: renderHeight });
    setRenderResult(res.data);
    setRenderLoading(false);
  }, [selectedProject, renderFormat, renderWidth, renderHeight, onRender]);

  const handleDiff = useCallback(async () => {
    if (!selectedProject || !sourceA.trim() || !sourceB.trim()) return;
    setDiffLoading(true);
    const res = await onDiff(selectedProject, sourceA, sourceB);
    setDiffResult(res.data);
    setDiffLoading(false);
  }, [selectedProject, sourceA, sourceB, onDiff]);

  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-sm text-studio-muted">Create a project first to use tools.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      {/* Project Selector */}
      <div className="flex items-center gap-4">
        <label className="text-xs font-medium text-studio-muted">Project:</label>
        <select
          value={selectedProject}
          onChange={(e) => setSelectedProject(e.target.value)}
          className="rounded-lg border border-studio-border bg-[#0f172a] px-3 py-2 text-sm text-studio-text focus:border-studio-accent focus:outline-none"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {/* Quality Tier Selector */}
      <div className="rounded-xl border border-studio-border bg-[#111827] p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-studio-text">Quality Tier</h3>
          <span className="text-[10px] text-emerald-400 font-medium">Free — applies to all operations</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          {(Object.entries(QUALITY_TIER_DESCRIPTIONS) as [QualityTierOption, { label: string; desc: string }][]).map(([key, info]) => (
            <button
              key={key}
              onClick={() => onSetQualityTier(key)}
              className={`rounded-lg border p-3 text-left transition-all ${
                qualityTier === key
                  ? 'border-studio-accent bg-studio-accent/10'
                  : 'border-studio-border hover:border-studio-accent/40'
              }`}
            >
              <div className="text-xs font-semibold text-studio-text">{info.label}</div>
              <div className="mt-1 text-[10px] text-studio-muted">{info.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Codebase Query */}
      <div className="rounded-xl border border-studio-border bg-[#111827] p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-studio-text">Codebase Query</h3>
          <span className="text-[10px] text-studio-muted">{withLLM ? '~15+ credits (AI-powered)' : '5 credits'}</span>
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex gap-3">
            <input
              type="text"
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              placeholder="Search your codebase... e.g. 'how does authentication work?'"
              onKeyDown={(e) => e.key === 'Enter' && handleQuery()}
              className="flex-1 rounded-lg border border-studio-border bg-[#0f172a] px-3 py-2 text-sm text-studio-text placeholder:text-studio-muted/50 focus:border-studio-accent focus:outline-none"
            />
            <button
              onClick={handleQuery}
              disabled={queryLoading || !queryText.trim()}
              className="shrink-0 rounded-lg bg-studio-accent px-4 py-2 text-sm font-medium text-white hover:bg-studio-accent/80 disabled:opacity-50"
            >
              {queryLoading ? 'Searching...' : 'Search'}
            </button>
          </div>
          <label className="flex items-center gap-2 text-xs text-studio-muted">
            <input
              type="checkbox"
              checked={withLLM}
              onChange={(e) => setWithLLM(e.target.checked)}
              className="rounded border-studio-border"
            />
            Use AI synthesis (generates a natural language answer — costs more)
          </label>
          {queryResult && (
            <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-studio-border bg-[#0f172a] p-3">
              <pre className="whitespace-pre-wrap text-[11px] text-studio-muted">{JSON.stringify(queryResult, null, 2)}</pre>
            </div>
          )}
        </div>
      </div>

      {/* Render Export */}
      <div className="rounded-xl border border-studio-border bg-[#111827] p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-studio-text">Export / Render</h3>
          <span className="text-[10px] text-studio-muted">{renderFormat === 'pdf' ? '5 credits' : '3 credits'}</span>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-medium text-studio-muted">
            Format
            <select
              value={renderFormat}
              onChange={(e) => setRenderFormat(e.target.value as typeof renderFormat)}
              className="mt-1 block rounded-lg border border-studio-border bg-[#0f172a] px-3 py-2 text-sm text-studio-text focus:border-studio-accent focus:outline-none"
            >
              <option value="png">PNG</option>
              <option value="jpeg">JPEG</option>
              <option value="webp">WebP</option>
              <option value="pdf">PDF</option>
            </select>
          </label>
          <label className="text-xs font-medium text-studio-muted">
            Width
            <input
              type="number" value={renderWidth} onChange={(e) => setRenderWidth(Number(e.target.value))}
              min={320} max={3840} step={10}
              className="mt-1 block w-24 rounded-lg border border-studio-border bg-[#0f172a] px-3 py-2 text-sm text-studio-text focus:border-studio-accent focus:outline-none"
            />
          </label>
          <label className="text-xs font-medium text-studio-muted">
            Height
            <input
              type="number" value={renderHeight} onChange={(e) => setRenderHeight(Number(e.target.value))}
              min={240} max={2160} step={10}
              className="mt-1 block w-24 rounded-lg border border-studio-border bg-[#0f172a] px-3 py-2 text-sm text-studio-text focus:border-studio-accent focus:outline-none"
            />
          </label>
          <button
            onClick={handleRender}
            disabled={renderLoading}
            className="rounded-lg bg-blue-500/20 px-4 py-2 text-sm font-medium text-blue-300 hover:bg-blue-500/30 disabled:opacity-50"
          >
            {renderLoading ? 'Rendering...' : 'Render'}
          </button>
        </div>
        {renderResult && (
          <div className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-studio-border bg-[#0f172a] p-3">
            <pre className="whitespace-pre-wrap text-[11px] text-studio-muted">{JSON.stringify(renderResult, null, 2)}</pre>
          </div>
        )}
      </div>

      {/* Semantic Diff */}
      <div className="rounded-xl border border-studio-border bg-[#111827] p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-studio-text">Semantic Diff</h3>
          <span className="text-[10px] text-studio-muted">2 credits</span>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-xs font-medium text-studio-muted">
            Source A
            <textarea
              value={sourceA}
              onChange={(e) => setSourceA(e.target.value)}
              placeholder="Paste the original source code..."
              rows={6}
              className="mt-1 block w-full rounded-lg border border-studio-border bg-[#0f172a] px-3 py-2 text-xs font-mono text-studio-text placeholder:text-studio-muted/50 focus:border-studio-accent focus:outline-none resize-none"
            />
          </label>
          <label className="text-xs font-medium text-studio-muted">
            Source B
            <textarea
              value={sourceB}
              onChange={(e) => setSourceB(e.target.value)}
              placeholder="Paste the updated source code..."
              rows={6}
              className="mt-1 block w-full rounded-lg border border-studio-border bg-[#0f172a] px-3 py-2 text-xs font-mono text-studio-text placeholder:text-studio-muted/50 focus:border-studio-accent focus:outline-none resize-none"
            />
          </label>
        </div>
        <div className="mt-3 flex justify-end">
          <button
            onClick={handleDiff}
            disabled={diffLoading || !sourceA.trim() || !sourceB.trim()}
            className="rounded-lg bg-emerald-500/20 px-4 py-2 text-sm font-medium text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-50"
          >
            {diffLoading ? 'Comparing...' : 'Compare'}
          </button>
        </div>
        {diffResult && (
          <div className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-studio-border bg-[#0f172a] p-3">
            <pre className="whitespace-pre-wrap text-[11px] text-studio-muted">{JSON.stringify(diffResult, null, 2)}</pre>
          </div>
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
    creditBalance, tier, qualityTier, projects, usageHistory, loading, error,
    fetchBalance, fetchProjects, fetchUsageHistory,
    runAbsorb, runImprove, runQuery, runRender, runDiff, purchaseCredits,
    setActiveProject, activeProjectId, setQualityTier, setError,
  } = useAbsorbService();

  const [tab, setTab] = useState<AbsorbTab>('dashboard');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  // Check URL params for tab and purchase confirmation
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    if (tabParam && ['dashboard', 'projects', 'credits', 'tools', 'pricing'].includes(tabParam)) {
      setTab(tabParam as AbsorbTab);
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
    { id: 'tools', label: 'Tools' },
    { id: 'credits', label: 'Credits' },
    { id: 'pricing', label: 'Pricing' },
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
              <span className="font-semibold text-studio-text">${(creditBalance / 100).toFixed(2)}</span>
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
                tab === t.id ? 'bg-studio-accent text-white' : 'text-studio-muted hover:text-studio-text hover:bg-studio-panel'
              }`}
            >
              {t.label}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-3">
            <Link href="/holodaemon" className="rounded-lg border border-studio-border px-3 py-1.5 text-xs text-studio-muted hover:text-studio-text hover:border-studio-accent/40 transition-colors">
              Daemon
            </Link>
            <Link href="/holoclaw" className="rounded-lg border border-studio-border px-3 py-1.5 text-xs text-studio-muted hover:text-studio-text hover:border-studio-accent/40 transition-colors">
              HoloClaw
            </Link>
            <Link href="/pipeline" className="rounded-lg border border-studio-border px-3 py-1.5 text-xs text-studio-muted hover:text-studio-text hover:border-purple-500/40 transition-colors">
              Pipeline
            </Link>
            <Link href="/" className="rounded-lg border border-studio-border px-3 py-1.5 text-xs text-studio-muted hover:text-studio-text hover:border-studio-accent/40 transition-colors">
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
            <button onClick={() => setError(null)} className="ml-4 text-xs hover:text-red-300">Dismiss</button>
          </div>
        )}

        {/* Dashboard Tab */}
        {tab === 'dashboard' && (
          <div className="grid gap-6 lg:grid-cols-2">
            <CreditBalanceCard balance={creditBalance} tier={tier} />
            <div className="rounded-xl border border-studio-border bg-[#111827] p-6">
              <h3 className="text-sm font-semibold text-studio-text">Quick Stats</h3>
              <div className="mt-4 grid grid-cols-3 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-studio-text">{projects.length}</div>
                  <div className="text-[10px] uppercase tracking-wider text-studio-muted">Projects</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-studio-text">
                    {projects.reduce((sum, p) => sum + p.totalOperations, 0)}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-studio-muted">Operations</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-studio-text">
                    ${(projects.reduce((sum, p) => sum + p.totalSpentCents, 0) / 100).toFixed(2)}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-studio-muted">Total Spent</div>
                </div>
              </div>
            </div>

            {/* Recent projects */}
            <div className="lg:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-studio-text">Your Projects</h3>
                <button onClick={() => setTab('projects')} className="text-xs text-studio-accent hover:underline">View all</button>
              </div>
              {loading ? (
                <div className="flex gap-4">
                  {[1, 2, 3].map((i) => <div key={i} className="h-32 flex-1 rounded-xl border border-studio-border bg-[#111827] animate-pulse" />)}
                </div>
              ) : projects.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-studio-border bg-[#111827] py-12">
                  <p className="text-sm text-studio-muted">No projects yet</p>
                  <button onClick={() => setTab('projects')} className="mt-4 rounded-lg bg-studio-accent px-4 py-2 text-sm font-medium text-white hover:bg-studio-accent/80">
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
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Projects Tab */}
        {tab === 'projects' && (
          <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-studio-text">Projects ({projects.length})</h3>
                <button onClick={() => fetchProjects()} className="text-xs text-studio-muted hover:text-studio-text">Refresh</button>
              </div>
              {projects.map((p) => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  selected={selectedProjectId === p.id}
                  onSelect={() => setSelectedProjectId(p.id)}
                  onAbsorb={() => runAbsorb(p.id)}
                  onImprove={() => runImprove(p.id)}
                />
              ))}
              {projects.length === 0 && !loading && (
                <div className="text-center py-12 text-sm text-studio-muted">No projects. Create one to get started.</div>
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
                  <CreditPackageCard key={pkg.id} pkg={pkg} onPurchase={() => purchaseCredits(pkg.id)} />
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
                        <th className="px-4 py-3 text-left font-medium text-studio-muted">Description</th>
                        <th className="px-4 py-3 text-right font-medium text-studio-muted">Amount</th>
                        <th className="px-4 py-3 text-right font-medium text-studio-muted">Balance</th>
                        <th className="px-4 py-3 text-right font-medium text-studio-muted">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usageHistory.map((tx) => (
                        <tr key={tx.id} className="border-b border-studio-border/50 last:border-0">
                          <td className="px-4 py-2.5 text-studio-text">{tx.description}</td>
                          <td className={`px-4 py-2.5 text-right font-mono ${tx.amountCents >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {tx.amountCents >= 0 ? '+' : ''}{(tx.amountCents / 100).toFixed(2)}
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
        {tab === 'pricing' && (
          <div className="mx-auto max-w-4xl space-y-12">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-studio-text">Pay Only For What You Use</h2>
              <p className="mt-2 text-sm text-studio-muted">
                Buy credits and spend them on AI-powered code analysis and improvement.
                We use Claude, Grok, and GPT — you get the best model available.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
              {CREDIT_PACKAGES.map((pkg) => (
                <CreditPackageCard key={pkg.id} pkg={pkg} onPurchase={() => purchaseCredits(pkg.id)} />
              ))}
            </div>

            <div>
              <h3 className="mb-4 text-lg font-semibold text-studio-text text-center">Operation Costs</h3>
              <OperationCostTable />
              <p className="mt-4 text-center text-xs text-studio-muted">
                LLM token usage is metered on top of base costs with a transparent 15% markup over provider pricing.
              </p>
            </div>

            <div>
              <h3 className="mb-4 text-lg font-semibold text-studio-text text-center">Tier Comparison</h3>
              <TierComparisonTable />
            </div>

            <div className="rounded-xl border border-studio-border bg-[#111827] p-6">
              <h3 className="text-sm font-semibold text-studio-text mb-4">AI Providers</h3>
              <div className="grid gap-4 md:grid-cols-3">
                {[
                  { name: 'Claude (Anthropic)', model: 'claude-sonnet-4-5', input: '$3.00', output: '$15.00' },
                  { name: 'Grok (xAI)', model: 'grok-3-mini', input: '$2.00', output: '$10.00' },
                  { name: 'GPT (OpenAI)', model: 'gpt-4o-mini', input: '$2.50', output: '$10.00' },
                ].map((p) => (
                  <div key={p.name} className="rounded-lg bg-[#0f172a] p-4">
                    <div className="text-sm font-medium text-studio-text">{p.name}</div>
                    <div className="mt-1 text-[10px] text-studio-muted">{p.model}</div>
                    <div className="mt-2 text-[10px] text-studio-muted">Input: {p.input}/M tokens</div>
                    <div className="text-[10px] text-studio-muted">Output: {p.output}/M tokens</div>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-[10px] text-studio-muted">
                We automatically select the best available provider. Prices shown are base provider costs — our 30% markup is applied transparently.
              </p>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="shrink-0 border-t border-studio-border bg-[#0d0d14] px-6 py-2">
        <div className="flex items-center justify-between text-[10px] text-studio-muted">
          <span>Absorb Service v0.1 — Powered by HoloDaemon + HoloClaw + Claude/Grok/GPT</span>
          <span>
            <Link href="/holodaemon" className="hover:text-studio-text">Daemon</Link>
            {' \u2022 '}
            <Link href="/holoclaw" className="hover:text-studio-text">HoloClaw</Link>
            {' \u2022 '}
            <Link href="/pipeline" className="hover:text-studio-text">Pipeline</Link>
            {' \u2022 '}
            <Link href="/workspace" className="hover:text-studio-text">Workspace</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
