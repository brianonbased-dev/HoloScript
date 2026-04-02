'use client';

import {
  GitBranch,
  Globe,
  Lock,
  GitFork,
  FolderGit2,
  Search,
  Loader2,
  Star,
  Check,
  AlertCircle,
} from 'lucide-react';
import type { GitHubRepoItem } from '@/hooks/useGitHubRepos';

interface Step0ChooseRepoProps {
  repos: GitHubRepoItem[];
  reposLoading: boolean;
  reposError: string | null | undefined;
  search: string;
  setSearch: (v: string) => void;
  selectedRepo: GitHubRepoItem | null;
  setSelectedRepo: (repo: GitHubRepoItem | null) => void;
  manualUrl: string;
  setManualUrl: (v: string) => void;
  useManual: boolean;
  setUseManual: (v: boolean) => void;
  timeAgo: (dateStr: string) => string;
}

export function Step0ChooseRepo({
  repos,
  reposLoading,
  reposError,
  search,
  setSearch,
  selectedRepo,
  setSelectedRepo,
  manualUrl,
  setManualUrl,
  useManual,
  setUseManual,
  timeAgo,
}: Step0ChooseRepoProps) {
  return (
    <div className="flex flex-col gap-3">
      {/* Toggle: GitHub list vs manual URL */}
      <div className="flex gap-2 mb-1">
        <button
          onClick={() => setUseManual(false)}
          className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition ${
            !useManual
              ? 'border-blue-500/60 bg-blue-500/10 text-blue-300'
              : 'border-studio-border bg-black/20 text-studio-muted hover:text-studio-text'
          }`}
        >
          <GitBranch className="h-3.5 w-3.5" />
          My Repositories
        </button>
        <button
          onClick={() => setUseManual(true)}
          className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition ${
            useManual
              ? 'border-blue-500/60 bg-blue-500/10 text-blue-300'
              : 'border-studio-border bg-black/20 text-studio-muted hover:text-studio-text'
          }`}
        >
          <Globe className="h-3.5 w-3.5" />
          Paste URL
        </button>
      </div>

      {useManual ? (
        /* Manual URL input */
        <div>
          <label className="text-xs font-medium text-studio-text mb-1.5 block">
            Repository URL
          </label>
          <input
            type="url"
            value={manualUrl}
            onChange={(e) => setManualUrl(e.target.value)}
            placeholder="https://github.com/user/repo.git"
            className="w-full rounded-lg border border-studio-border bg-black/30 px-3 py-2 text-sm text-studio-text placeholder:text-studio-muted/50 focus:border-blue-500/60 focus:outline-none"
          />
          <p className="text-[10px] text-studio-muted mt-1.5">
            Supports HTTPS and SSH URLs. Private repos require GitHub authentication.
          </p>
        </div>
      ) : (
        /* GitHub repo list */
        <div>
          {/* Search */}
          <div className="relative mb-2">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-studio-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search repositories..."
              className="w-full rounded-lg border border-studio-border bg-black/30 pl-9 pr-3 py-2 text-sm text-studio-text placeholder:text-studio-muted/50 focus:border-blue-500/60 focus:outline-none"
            />
          </div>

          {/* Repo list */}
          <div className="max-h-[240px] overflow-y-auto space-y-1.5 pr-1">
            {reposLoading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
                <span className="ml-2 text-sm text-studio-muted">Loading repos...</span>
              </div>
            )}

            {reposError && (
              <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 text-center">
                <AlertCircle className="h-8 w-8 text-amber-400" />
                <div>
                  <p className="text-sm font-semibold text-amber-300">GitHub Not Connected</p>
                  <p className="text-[11px] text-amber-300/70 mt-1 max-w-[240px] mx-auto">
                    {reposError ||
                      'You must connect your GitHub account in the Integration Hub before importing repositories.'}
                  </p>
                </div>
                <a
                  href="/integrations"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-2 flex items-center gap-2 rounded-lg bg-indigo-500/20 px-4 py-2 text-xs font-medium text-indigo-300 hover:bg-indigo-500/30 hover:text-indigo-200 transition"
                >
                  Open Integration Hub
                </a>
              </div>
            )}

            {!reposLoading && !reposError && repos.length === 0 && (
              <div className="text-center py-8">
                <p className="text-sm text-studio-muted">No repositories found</p>
                <p className="text-[10px] text-studio-muted mt-1">
                  Try a different search or paste a URL
                </p>
              </div>
            )}

            {repos.map((repo) => (
              <button
                key={repo.id}
                onClick={() => setSelectedRepo(repo)}
                className={`w-full flex items-start gap-3 rounded-xl border p-3 text-left transition-all duration-200 ${
                  selectedRepo?.id === repo.id
                    ? 'border-blue-500/60 bg-blue-500/10 scale-[1.01]'
                    : 'border-studio-border bg-black/20 hover:border-studio-border/60 hover:bg-white/5'
                }`}
              >
                <div className="mt-0.5 shrink-0">
                  {repo.isPrivate ? (
                    <Lock className="h-4 w-4 text-amber-400" />
                  ) : repo.isFork ? (
                    <GitFork className="h-4 w-4 text-studio-muted" />
                  ) : (
                    <FolderGit2 className="h-4 w-4 text-studio-muted" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-studio-text truncate">
                      {repo.name}
                    </span>
                    {repo.language && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-studio-muted">
                        {repo.language}
                      </span>
                    )}
                  </div>
                  {repo.description && (
                    <p className="text-[11px] text-studio-muted mt-0.5 truncate">
                      {repo.description}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-1 text-[10px] text-studio-muted">
                    {repo.stars > 0 && (
                      <span className="flex items-center gap-0.5">
                        <Star className="h-3 w-3" /> {repo.stars}
                      </span>
                    )}
                    <span>{repo.defaultBranch}</span>
                    <span>{timeAgo(repo.pushedAt)}</span>
                  </div>
                </div>
                {selectedRepo?.id === repo.id && (
                  <Check className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
