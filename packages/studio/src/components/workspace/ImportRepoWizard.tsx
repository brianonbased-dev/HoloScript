'use client';

/**
 * ImportRepoWizard — GitHub repository import workflow
 *
 * Integrates with connectorStore to check GitHub connection status.
 * Guides users through: Connect → Browse → Import → Absorb → Pipeline
 *
 * @module components/workspace/ImportRepoWizard
 */

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Search,
  Github,
  ExternalLink,
  Download,
  GitBranch,
  Star,
  AlertCircle,
  CheckCircle,
  XCircle,
  Loader2,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import { useGitHubRepos } from '@/hooks/useGitHubRepos';

// ── Types ────────────────────────────────────────────────────────────────────

type WizardStep = 'connect' | 'browse' | 'import' | 'absorb' | 'pipeline';

interface ImportRepoWizardProps {
  onClose?: () => void;
  onImportComplete?: (repoUrl: string) => void;
}

// ── Connection Status Banner ─────────────────────────────────────────────────

function ConnectionStatusBanner({
  isConnected,
  connectionError,
}: {
  isConnected: boolean;
  connectionError: string | null;
}) {
  if (isConnected) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
        <CheckCircle className="h-5 w-5 text-emerald-400" />
        <div className="flex-1">
          <p className="text-sm font-medium text-emerald-300">GitHub Connected</p>
          <p className="text-xs text-emerald-400/70">
            Your GitHub account is connected and ready to import repositories
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
      <AlertCircle className="h-5 w-5 text-amber-400" />
      <div className="flex-1">
        <p className="text-sm font-medium text-amber-300">GitHub Not Connected</p>
        <p className="text-xs text-amber-400/70">
          {connectionError || 'Connect your GitHub account to browse and import repositories'}
        </p>
      </div>
      <Link
        href="/integrations"
        className="flex items-center gap-2 rounded-lg bg-amber-500/20 px-3 py-1.5 text-sm font-medium text-amber-200 transition hover:bg-amber-500/30"
      >
        Connect GitHub
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

// ── Repo Card ────────────────────────────────────────────────────────────────

function RepoCard({
  repo,
  onImport,
}: {
  repo: {
    id: number;
    name: string;
    fullName: string;
    description: string | null;
    cloneUrl: string;
    defaultBranch: string;
    language: string | null;
    stars: number;
    pushedAt: string;
    isPrivate: boolean;
    isFork: boolean;
    sizeKB: number;
  };
  onImport: (cloneUrl: string) => void;
}) {
  const lastPushed = new Date(repo.pushedAt);
  const daysSinceUpdate = Math.floor(
    (Date.now() - lastPushed.getTime()) / (1000 * 60 * 60 * 24)
  );

  return (
    <div className="group relative overflow-hidden rounded-xl border border-white/5 bg-white/[0.02] p-4 transition-all hover:border-white/10 hover:bg-white/[0.05]">
      <div className="mb-3 flex items-start justify-between">
        <div className="flex-1">
          <div className="mb-1 flex items-center gap-2">
            <Github className="h-4 w-4 text-white/40" />
            <h3 className="text-sm font-semibold text-white">{repo.fullName}</h3>
            {repo.isPrivate && (
              <span className="rounded-full bg-yellow-500/20 px-2 py-0.5 text-xs text-yellow-400">
                Private
              </span>
            )}
            {repo.isFork && (
              <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-xs text-blue-400">
                Fork
              </span>
            )}
          </div>
          {repo.description && (
            <p className="mb-2 text-xs text-white/50">{repo.description}</p>
          )}
        </div>
      </div>

      <div className="mb-3 flex items-center gap-4 text-xs text-white/40">
        {repo.language && (
          <div className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-full bg-blue-400" />
            <span>{repo.language}</span>
          </div>
        )}
        <div className="flex items-center gap-1">
          <Star className="h-3 w-3" />
          <span>{repo.stars}</span>
        </div>
        <div className="flex items-center gap-1">
          <GitBranch className="h-3 w-3" />
          <span>{repo.defaultBranch}</span>
        </div>
        <span>
          {daysSinceUpdate === 0
            ? 'Updated today'
            : daysSinceUpdate === 1
            ? 'Updated yesterday'
            : `Updated ${daysSinceUpdate}d ago`}
        </span>
        <span>{(repo.sizeKB / 1024).toFixed(1)} MB</span>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => onImport(repo.cloneUrl)}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-indigo-500/20 px-3 py-2 text-sm font-medium text-indigo-200 transition hover:bg-indigo-500/30"
        >
          <Download className="h-3.5 w-3.5" />
          Import to Workspace
        </button>
        <a
          href={`https://github.com/${repo.fullName}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70 transition hover:bg-white/10"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function ImportRepoWizard({ onClose, onImportComplete }: ImportRepoWizardProps) {
  const [step, setStep] = useState<WizardStep>('browse');
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);

  const { repos, isLoading, error, search, setSearch, refresh, isConnected, connectionError } =
    useGitHubRepos();

  const handleImport = (cloneUrl: string) => {
    setSelectedRepo(cloneUrl);
    setStep('import');
    // TODO: Wire into absorbPipelineBridge
    onImportComplete?.(cloneUrl);
  };

  const handleRefresh = async () => {
    await refresh();
  };

  return (
    <div className="mx-auto max-w-5xl">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="mb-1 text-2xl font-bold text-white">Import from GitHub</h2>
          <p className="text-sm text-white/50">
            Browse your repositories and import them to your workspace
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 transition hover:bg-white/10"
          >
            Close
          </button>
        )}
      </div>

      {/* Connection Status */}
      <div className="mb-6">
        <ConnectionStatusBanner isConnected={isConnected} connectionError={connectionError} />
      </div>

      {/* Search + Refresh */}
      {isConnected && (
        <div className="mb-6 flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
            <input
              type="text"
              placeholder="Search repositories..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-white/5 bg-white/[0.03] py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-white/30 focus:border-white/10 focus:outline-none focus:ring-1 focus:ring-white/10"
            />
          </div>
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white/70 transition hover:bg-white/10 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      )}

      {/* Content */}
      <div>
        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-white/30" />
          </div>
        )}

        {/* Error State */}
        {error && !isLoading && (
          <div className="flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3">
            <XCircle className="h-5 w-5 text-red-400" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-300">Error Loading Repositories</p>
              <p className="text-xs text-red-400/70">{error}</p>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && isConnected && repos.length === 0 && (
          <div className="rounded-xl border border-white/5 bg-white/[0.02] px-6 py-12 text-center">
            <Github className="mx-auto mb-4 h-12 w-12 text-white/20" />
            <h3 className="mb-2 text-lg font-semibold text-white/70">No Repositories Found</h3>
            <p className="text-sm text-white/40">
              {search
                ? 'Try adjusting your search query'
                : "You don't have any repositories yet"}
            </p>
          </div>
        )}

        {/* Repos Grid */}
        {!isLoading && !error && isConnected && repos.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            {repos.map((repo) => (
              <RepoCard key={repo.id} repo={repo} onImport={handleImport} />
            ))}
          </div>
        )}

        {/* Not Connected State */}
        {!isConnected && !isLoading && (
          <div className="rounded-xl border border-white/5 bg-white/[0.02] px-6 py-12 text-center">
            <Github className="mx-auto mb-4 h-12 w-12 text-white/20" />
            <h3 className="mb-2 text-lg font-semibold text-white/70">
              Connect GitHub to Get Started
            </h3>
            <p className="mb-4 text-sm text-white/40">
              Connect your GitHub account to browse and import your repositories
            </p>
            <Link
              href="/integrations"
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-500/20 px-4 py-2 text-sm font-medium text-indigo-200 transition hover:bg-indigo-500/30"
            >
              <Github className="h-4 w-4" />
              Connect GitHub Account
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
