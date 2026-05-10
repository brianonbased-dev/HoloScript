'use client';

import { Check, Download, ExternalLink, FileCode2, X } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ConversionAction, ConversionCandidate } from '@/lib/stores/workspaceStore';

interface ConversionRecommendationsProps {
  candidates: ConversionCandidate[];
  actions: Record<string, ConversionAction>;
  repoUrl: string;
  branch: string;
  onAccept: (candidateId: string) => void;
  onDismiss: (candidateId: string) => void;
  onExport: () => void;
  compact?: boolean;
}

const TARGET_LABELS: Record<string, string> = {
  '.holo': '.holo scene',
  '.hs': '.hs script',
  '.hsplus': '.hsplus surface',
  'trait-package': 'trait package',
  'mcp-tool': 'MCP tool',
  'compiler-export-target': 'compiler target',
  'hololand-scene': 'HoloLand scene',
};

const TARGET_COLORS: Record<string, string> = {
  '.holo': 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  '.hs': 'border-blue-500/30 bg-blue-500/10 text-blue-300',
  '.hsplus': 'border-purple-500/30 bg-purple-500/10 text-purple-300',
  'trait-package': 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  'mcp-tool': 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300',
  'compiler-export-target': 'border-red-500/30 bg-red-500/10 text-red-300',
  'hololand-scene': 'border-lime-500/30 bg-lime-500/10 text-lime-300',
};

export function buildGitHubEvidenceUrl(
  repoUrl: string,
  branch: string,
  sourcePath: string
): string | null {
  const trimmed = repoUrl.trim();
  let owner: string | undefined;
  let repo: string | undefined;

  const sshMatch = trimmed.match(/^git@github\.com:([^/\s]+)\/([^/\s]+?)(?:\.git)?$/);
  if (sshMatch) {
    owner = sshMatch[1];
    repo = sshMatch[2];
  } else {
    try {
      const parsed = new URL(trimmed);
      if (parsed.hostname !== 'github.com') return null;
      const parts = parsed.pathname.replace(/^\/+|\/+$/g, '').split('/');
      owner = parts[0];
      repo = parts[1]?.replace(/\.git$/i, '');
    } catch {
      return null;
    }
  }

  if (!owner || !repo || !sourcePath.trim()) return null;
  const encodedPath = sourcePath
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/');
  return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/blob/${encodeURIComponent(branch || 'main')}/${encodedPath}`;
}

function ActionButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded-md border border-studio-border bg-black/20 text-studio-muted transition hover:border-studio-accent/50 hover:text-studio-text"
    >
      {children}
    </button>
  );
}

export function ConversionRecommendations({
  candidates,
  actions,
  repoUrl,
  branch,
  onAccept,
  onDismiss,
  onExport,
  compact = false,
}: ConversionRecommendationsProps) {
  if (candidates.length === 0) return null;

  const shown = compact ? candidates.slice(0, 3) : candidates.slice(0, 6);
  const accepted = Object.values(actions).filter((action) => action === 'accepted').length;

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-studio-border bg-black/20 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-studio-text">Conversion Recommendations</p>
          <p className="text-[10px] text-studio-muted">
            {accepted} accepted · {candidates.length} found
          </p>
        </div>
        <button
          type="button"
          title="Export recommendations"
          aria-label="Export recommendations"
          onClick={onExport}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-studio-border bg-black/20 text-studio-muted transition hover:border-studio-accent/50 hover:text-studio-text"
        >
          <Download className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {shown.map((candidate) => {
          const action = actions[candidate.id];
          const targetClass =
            TARGET_COLORS[candidate.target] ?? 'border-studio-border bg-white/5 text-studio-muted';

          return (
            <article
              key={candidate.id}
              className="rounded-lg border border-studio-border bg-studio-panel/60 p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-md border px-2 py-0.5 text-[10px] ${targetClass}`}>
                      {TARGET_LABELS[candidate.target] ?? candidate.target}
                    </span>
                    <span className="text-[10px] text-studio-muted">
                      {Math.round(candidate.confidence * 100)}% · {candidate.effort} ·{' '}
                      {candidate.risk} risk
                    </span>
                    {action && (
                      <span
                        className={`rounded-md px-1.5 py-0.5 text-[9px] ${
                          action === 'accepted'
                            ? 'bg-emerald-500/10 text-emerald-300'
                            : 'bg-studio-surface text-studio-muted'
                        }`}
                      >
                        {action}
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-medium text-studio-text">
                    {candidate.detectedPattern}
                  </p>
                  {!compact && (
                    <p className="text-[10px] leading-relaxed text-studio-muted">
                      {candidate.whyItMatters}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 gap-1">
                  <ActionButton
                    title="Accept recommendation"
                    onClick={() => onAccept(candidate.id)}
                  >
                    <Check className="h-3.5 w-3.5 text-emerald-300" />
                  </ActionButton>
                  <ActionButton
                    title="Dismiss recommendation"
                    onClick={() => onDismiss(candidate.id)}
                  >
                    <X className="h-3.5 w-3.5 text-red-300" />
                  </ActionButton>
                </div>
              </div>

              <div className="mt-2 flex flex-col gap-1">
                {candidate.sourcePaths.slice(0, compact ? 1 : 3).map((sourcePath) => {
                  const href = buildGitHubEvidenceUrl(repoUrl, branch, sourcePath);
                  return href ? (
                    <a
                      key={sourcePath}
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className="flex min-w-0 items-center gap-1.5 text-[10px] font-mono text-studio-accent hover:underline"
                    >
                      <FileCode2 className="h-3 w-3 shrink-0" />
                      <span className="truncate">{sourcePath}</span>
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                  ) : (
                    <span
                      key={sourcePath}
                      className="flex min-w-0 items-center gap-1.5 text-[10px] font-mono text-studio-muted"
                    >
                      <FileCode2 className="h-3 w-3 shrink-0" />
                      <span className="truncate">{sourcePath}</span>
                    </span>
                  );
                })}
              </div>

              {!compact && (
                <p className="mt-2 text-[10px] leading-relaxed text-studio-muted">
                  {candidate.nextAction}
                </p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
