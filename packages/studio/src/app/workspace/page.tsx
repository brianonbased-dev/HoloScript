'use client';

/**
 * Creator Workspace Hub — /workspace
 *
 * Native HoloScript-driven workspace hub. The header and stats bar are
 * defined in compositions/studio/workspace.hsplus and rendered by
 * HoloSurfaceRenderer. Content type grid, search, and quick actions
 * stay in React (require icons + Link components).
 *
 * @module workspace/page
 */

import { useState } from 'react';
import Link from 'next/link';
import {
  Layers,
  Puzzle,
  Brain,
  Bot,
  Package,
  Database,
  LayoutTemplate,
  Plus,
  Search,
  TrendingUp,
  ArrowRight,
  Zap,
  Shield,
  Code,
  Sparkles,
  Cog,
  RefreshCw,
  Github,
} from 'lucide-react';
import { HoloSurfaceRenderer, useHoloComposition } from '@/components/holo-surface';
import { ImportRepoWizard } from '@/components/wizard/ImportRepoWizard';

// ─── Types ───────────────────────────────────────────────────────────────────

type ContentType =
  | 'scenes'
  | 'traits'
  | 'skills'
  | 'agents'
  | 'plugins'
  | 'training_data'
  | 'templates';

interface ContentTypeConfig {
  id: ContentType;
  label: string;
  description: string;
  icon: typeof Layers;
  color: string;
  gradient: string;
  createLabel: string;
  createUrl: string;
  count: number;
  published: number;
  revenue: number;
}

// ─── Content Type Configs ────────────────────────────────────────────────────

const CONTENT_TYPES: ContentTypeConfig[] = [
  {
    id: 'scenes',
    label: 'Scenes',
    description: 'Interactive 3D scenes and experiences',
    icon: Layers,
    color: 'text-indigo-400',
    gradient: 'from-indigo-500/20 to-violet-500/20',
    createLabel: 'New Scene',
    createUrl: '/create',
    count: 0,
    published: 0,
    revenue: 0,
  },
  {
    id: 'traits',
    label: 'Traits',
    description: 'Reusable VR/AR behavior components',
    icon: Puzzle,
    color: 'text-emerald-400',
    gradient: 'from-emerald-500/20 to-teal-500/20',
    createLabel: 'New Trait',
    createUrl: '/workspace/traits/new',
    count: 0,
    published: 0,
    revenue: 0,
  },
  {
    id: 'skills',
    label: 'Skills',
    description: 'AI agent workflows, RBAC policies, MCP bundles',
    icon: Brain,
    color: 'text-amber-400',
    gradient: 'from-amber-500/20 to-orange-500/20',
    createLabel: 'New Skill',
    createUrl: '/workspace/skills',
    count: 0,
    published: 0,
    revenue: 0,
  },
  {
    id: 'agents',
    label: 'Agents',
    description: 'Trained AI agent models and configs',
    icon: Bot,
    color: 'text-cyan-400',
    gradient: 'from-cyan-500/20 to-blue-500/20',
    createLabel: 'New Agent',
    createUrl: '/workspace/agents/new',
    count: 0,
    published: 0,
    revenue: 0,
  },
  {
    id: 'plugins',
    label: 'Plugins',
    description: 'Studio extensions and integrations',
    icon: Package,
    color: 'text-rose-400',
    gradient: 'from-rose-500/20 to-pink-500/20',
    createLabel: 'New Plugin',
    createUrl: '/workspace/plugins/new',
    count: 0,
    published: 0,
    revenue: 0,
  },
  {
    id: 'training_data',
    label: 'Training Data',
    description: 'Curated AI datasets processed via DataForge',
    icon: Database,
    color: 'text-purple-400',
    gradient: 'from-purple-500/20 to-fuchsia-500/20',
    createLabel: 'New Dataset',
    createUrl: '/workspace/training-data/new',
    count: 0,
    published: 0,
    revenue: 0,
  },
  {
    id: 'templates',
    label: 'Templates',
    description: 'Project starters and boilerplate templates',
    icon: LayoutTemplate,
    color: 'text-teal-400',
    gradient: 'from-teal-500/20 to-green-500/20',
    createLabel: 'New Template',
    createUrl: '/workspace/templates/new',
    count: 0,
    published: 0,
    revenue: 0,
  },
];

// ─── Content Type Card ───────────────────────────────────────────────────────

function ContentTypeCard({ config }: { config: ContentTypeConfig }) {
  const Icon = config.icon;

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border border-white/5 bg-gradient-to-br ${config.gradient} p-6 transition-all hover:border-white/10 hover:shadow-xl hover:shadow-black/20`}
    >
      <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/5 blur-3xl transition group-hover:bg-white/10" />

      <div className="relative">
        <div className="mb-4 flex items-start justify-between">
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-xl bg-white/5 ${config.color}`}
          >
            <Icon className="h-6 w-6" />
          </div>
          <div className="flex gap-2">
            <span className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-white/50">
              {config.count} total
            </span>
            <span className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-white/50">
              {config.published} live
            </span>
          </div>
        </div>

        <h3 className="mb-1 text-lg font-semibold text-white">{config.label}</h3>
        <p className="mb-4 text-sm text-white/50">{config.description}</p>

        {config.revenue > 0 && (
          <div className="mb-4 flex items-center gap-1.5 text-sm">
            <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
            <span className="text-emerald-400">${(config.revenue / 100).toFixed(2)}</span>
            <span className="text-white/30">earned</span>
          </div>
        )}

        <div className="flex gap-2">
          <Link
            href={config.createUrl}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-white/10 py-2.5 text-sm font-medium text-white transition hover:bg-white/20"
          >
            <Plus className="h-4 w-4" />
            {config.createLabel}
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── Quick Action ────────────────────────────────────────────────────────────

function QuickAction({
  icon: Icon,
  label,
  href,
  color,
}: {
  icon: typeof Zap;
  label: string;
  href: string;
  color: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 transition hover:border-white/10 hover:bg-white/[0.05]"
    >
      <div className={`flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 ${color}`}>
        <Icon className="h-4 w-4" />
      </div>
      <span className="text-sm font-medium text-white/70">{label}</span>
      <ArrowRight className="ml-auto h-4 w-4 text-white/20" />
    </Link>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function WorkspacePage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [showImportWizard, setShowImportWizard] = useState(false);
  const composition = useHoloComposition('/api/surface/workspace');

  const filteredTypes = searchQuery
    ? CONTENT_TYPES.filter(
        (ct) =>
          ct.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
          ct.description.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : CONTENT_TYPES;

  return (
    <div className="min-h-screen bg-[#0a0a12] text-white">
      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Native composition header + stats */}
        {!composition.loading && !composition.error ? (
          <div className="mb-8">
            <HoloSurfaceRenderer
              nodes={composition.nodes}
              state={composition.state}
              computed={composition.computed}
              templates={composition.templates}
              onEmit={composition.emit}
              className="holo-surface-workspace-header"
            />
          </div>
        ) : (
          <div className="mb-8">
            <h1 className="mb-2 text-3xl font-bold tracking-tight">Creator Workspace</h1>
            <p className="text-white/50">
              Build, experiment, and ship to the HoloScript marketplace
            </p>
          </div>
        )}

        {/* Search */}
        <div className="mb-6 flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
            <input
              type="text"
              placeholder="Search your content..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-white/5 bg-white/[0.03] py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-white/30 focus:border-white/10 focus:outline-none focus:ring-1 focus:ring-white/10"
            />
          </div>
        </div>

        {/* Content Type Grid */}
        <div className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredTypes.map((ct) => (
            <ContentTypeCard key={ct.id} config={ct} />
          ))}
        </div>

        {/* Quick Actions */}
        <div className="mb-8">
          <h2 className="mb-4 text-lg font-semibold text-white/80">Quick Actions</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <button
              onClick={() => setShowImportWizard(true)}
              className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 text-left transition hover:border-white/10 hover:bg-white/[0.05]"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-indigo-400">
                <Github className="h-4 w-4" />
              </div>
              <span className="text-sm font-medium text-white/70">Import from GitHub</span>
              <ArrowRight className="ml-auto h-4 w-4 text-white/20" />
            </button>
            <QuickAction icon={Cog} label="HoloDaemon Dashboard" href="/holodaemon" color="text-sky-400" />
            <QuickAction icon={Zap} label="HoloClaw Shelf" href="/holoclaw" color="text-amber-400" />
            <QuickAction icon={RefreshCw} label="Recursive Pipeline" href="/pipeline" color="text-purple-400" />
            <QuickAction icon={Shield} label="Create RBAC Policy" href="/workspace/skills?category=rbac_policy" color="text-blue-400" />
            <QuickAction icon={Code} label="New MCP Tool Bundle" href="/workspace/skills?category=mcp_bundle" color="text-emerald-400" />
            <QuickAction icon={Sparkles} label="AI Prompt Template" href="/workspace/skills?category=prompt_template" color="text-violet-400" />
            <QuickAction icon={Database} label="Forge Training Data" href="/workspace/training-data/new" color="text-purple-400" />
            <QuickAction icon={Bot} label="Train an Agent" href="/workspace/agents/new" color="text-cyan-400" />
            <QuickAction icon={Layers} label="Browse Marketplace" href="/registry" color="text-rose-400" />
          </div>
        </div>

        {/* Import Wizard Modal — Full 5-step: Repo → Branch → Clone+Absorb → DNA → Ready */}
        {showImportWizard && (
          <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-4 pt-10">
            <div className="w-full max-w-3xl rounded-2xl border border-white/10 bg-[#0a0a12] shadow-2xl">
              <ImportRepoWizard onClose={() => setShowImportWizard(false)} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
