'use client';

/**
 * Projects — /projects
 *
 * The "Projects" surface IS the GitHub-repo → absorb experience: list the
 * signed-in user's repositories and let them absorb one into a HoloScript
 * workspace via the existing ImportRepoWizard.
 *
 * History: this page previously listed projects from browser IndexedDB
 * (`@/lib/storage` `listProjects`) — but nothing in the web app ever WROTE to
 * that store (`saveProject` had zero callers), so it always rendered empty
 * ("no projects showing up"). The real, working vertical (repos → absorb) lived
 * only behind the header "Import" button. This repoints the page at it.
 *
 * @module projects/page
 */

import { useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import {
  ArrowLeft,
  Search,
  Loader2,
  AlertCircle,
  FolderGit2,
  Lock,
  Globe,
  GitFork,
  Star,
  Zap,
} from 'lucide-react';
import { useGitHubRepos, type GitHubRepoItem } from '@/hooks/useGitHubRepos';

// Lazy-load the wizard (large) — only when the user starts an import.
const ImportRepoWizard = dynamic(
  () => import('@/components/wizard/ImportRepoWizard').then((m) => ({ default: m.ImportRepoWizard })),
  { ssr: false }
);

function timeAgo(dateStr: string): string {
  const d = new Date(dateStr).getTime();
  if (Number.isNaN(d)) return '';
  const secs = Math.max(0, Math.floor((Date.now() - d) / 1000));
  const units: [number, string][] = [
    [60, 'second'],
    [60, 'minute'],
    [24, 'hour'],
    [30, 'day'],
    [12, 'month'],
    [Number.POSITIVE_INFINITY, 'year'],
  ];
  let value = secs;
  for (const [step, label] of units) {
    if (value < step) return `${value} ${label}${value === 1 ? '' : 's'} ago`;
    value = Math.floor(value / step);
  }
  return '';
}

export function ProjectsView() {
  const { repos, isLoading, error, search, setSearch, isConnected, connectionError } =
    useGitHubRepos();
  const [showImport, setShowImport] = useState(false);

  return (
    <div className="min-h-screen p-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-studio-muted transition hover:text-studio-text">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold">My Repositories</h1>
              <p className="text-sm text-studio-muted">
                Absorb a GitHub repo into a HoloScript workspace.
              </p>
            </div>
          </div>
          {isConnected && (
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400"
            >
              <Zap className="h-4 w-4" />
              Import a repo
            </button>
          )}
        </div>

        {!isConnected ? (
          <div className="rounded-xl border border-studio-border bg-studio-panel p-8 text-center">
            <FolderGit2 className="mx-auto mb-3 h-8 w-8 text-studio-muted" />
            <p className="mb-1 text-sm font-medium text-studio-text">
              Connect GitHub to see your repositories
            </p>
            <p className="mb-4 text-xs text-studio-muted">
              {connectionError ?? 'Sign in with GitHub to list and absorb your repos.'}
            </p>
            <button
              onClick={() => signIn('github')}
              className="rounded-lg border border-studio-border bg-studio-bg px-5 py-2 text-sm font-medium transition hover:border-studio-text hover:text-studio-text"
            >
              Continue with GitHub
            </button>
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-studio-border bg-black/20 px-3 py-2">
              <Search className="h-4 w-4 text-studio-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search your repositories…"
                className="w-full bg-transparent text-sm outline-none placeholder:text-studio-muted"
              />
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-studio-muted">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading your repositories…
              </div>
            ) : error ? (
              <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            ) : repos.length === 0 ? (
              <div className="rounded-xl border border-studio-border bg-studio-panel p-8 text-center text-sm text-studio-muted">
                No repositories found for this account.
              </div>
            ) : (
              <ul className="flex flex-col gap-2">
                {repos.map((repo: GitHubRepoItem) => (
                  <li key={repo.id}>
                    <button
                      onClick={() => setShowImport(true)}
                      className="group flex w-full items-center justify-between gap-3 rounded-lg border border-studio-border bg-black/20 px-4 py-3 text-left transition hover:border-emerald-500/50 hover:bg-emerald-500/5"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {repo.isPrivate ? (
                            <Lock className="h-3.5 w-3.5 text-studio-muted" />
                          ) : (
                            <Globe className="h-3.5 w-3.5 text-studio-muted" />
                          )}
                          <span className="truncate text-sm font-medium text-studio-text">
                            {repo.name}
                          </span>
                          {repo.isFork && <GitFork className="h-3.5 w-3.5 text-studio-muted" />}
                        </div>
                        {repo.description && (
                          <p className="mt-0.5 truncate text-xs text-studio-muted">
                            {repo.description}
                          </p>
                        )}
                        <div className="mt-1 flex items-center gap-3 text-[11px] text-studio-muted">
                          {repo.language && <span>{repo.language}</span>}
                          {repo.stars > 0 && (
                            <span className="flex items-center gap-0.5">
                              <Star className="h-3 w-3" /> {repo.stars}
                            </span>
                          )}
                          {repo.pushedAt && <span>{timeAgo(repo.pushedAt)}</span>}
                        </div>
                      </div>
                      <span className="flex shrink-0 items-center gap-1 rounded-md bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400 opacity-0 transition group-hover:opacity-100">
                        <Zap className="h-3.5 w-3.5" /> Absorb
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {showImport && <ImportRepoWizard onClose={() => setShowImport(false)} />}
    </div>
  );
}
