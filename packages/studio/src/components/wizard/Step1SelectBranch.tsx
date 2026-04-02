'use client';

import { GitBranch, FolderGit2 } from 'lucide-react';
import type { GitHubRepoItem } from '@/hooks/useGitHubRepos';

interface Step1SelectBranchProps {
  repoName: string;
  repoUrl: string;
  branch: string;
  setBranch: (v: string) => void;
  selectedRepo: GitHubRepoItem | null;
}

export function Step1SelectBranch({
  repoName,
  repoUrl,
  branch,
  setBranch,
  selectedRepo,
}: Step1SelectBranchProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 rounded-xl border border-blue-500/30 bg-blue-500/5 p-4">
        <FolderGit2 className="h-5 w-5 text-blue-400 shrink-0" />
        <div>
          <p className="text-sm font-medium text-studio-text">{repoName}</p>
          <p className="text-[11px] text-studio-muted truncate">{repoUrl}</p>
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-studio-text mb-1.5 block">
          Branch to import
        </label>
        <div className="relative">
          <GitBranch className="absolute left-3 top-2.5 h-3.5 w-3.5 text-studio-muted" />
          <input
            type="text"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            placeholder={selectedRepo?.defaultBranch ?? 'main'}
            className="w-full rounded-lg border border-studio-border bg-black/30 pl-9 pr-3 py-2 text-sm text-studio-text placeholder:text-studio-muted/50 focus:border-blue-500/60 focus:outline-none"
          />
        </div>
        <p className="text-[10px] text-studio-muted mt-1.5">
          Leave as default branch or type a specific branch name.
        </p>
      </div>

      <div className="rounded-lg border border-studio-border bg-black/20 p-3">
        <p className="text-xs font-medium text-studio-text mb-2">What happens next:</p>
        <div className="flex flex-col gap-1.5 text-[11px] text-studio-muted">
          <div className="flex items-center gap-2">
            <span className="text-blue-400">1.</span> Shallow clone into Studio workspace
          </div>
          <div className="flex items-center gap-2">
            <span className="text-blue-400">2.</span> Absorb + index the entire codebase
          </div>
          <div className="flex items-center gap-2">
            <span className="text-blue-400">3.</span> Detect Project DNA (stack, shape, risk)
          </div>
          <div className="flex items-center gap-2">
            <span className="text-blue-400">4.</span> Recommend daemon improvement strategy
          </div>
        </div>
      </div>
    </div>
  );
}
