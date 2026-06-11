'use client';

/**
 * Projects — /projects
 *
 * Two-tab layout:
 *   - "Projects" — GitHub repo browser rendered via HoloSurfaceRenderer
 *     (composition: compositions/studio/projects.hsplus)
 *   - "Repos" — Agent workbench (workspace import, git ops, daemon jobs,
 *     board view, absorb diff). Previously lived at /workspace — moved here
 *     as part of the A4 IA consolidation (Studio A4 phase).
 *
 * Host responsibilities for the Projects tab:
 *   1. Load repo data via useGitHubRepos.
 *   2. Bridge data into composition state on every update.
 *   3. Handle emits: "open" → ImportRepoWizard, "signin" → GitHub OAuth.
 *
 * @see compositions/studio/projects.hsplus — layout / UI source of truth
 * @module projects/ProjectsView
 */

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { signIn } from 'next-auth/react';
import { HoloSurfaceRenderer, useHoloComposition } from '@/components/holo-surface';
import { useGitHubRepos } from '@/hooks/useGitHubRepos';
import { ReposTab } from './ReposTab';

// Lazy-load the wizard (large) — only when the user starts an import.
const ImportRepoWizard = dynamic(
  () =>
    import('@/components/wizard/ImportRepoWizard').then((m) => ({ default: m.ImportRepoWizard })),
  { ssr: false }
);

type ProjectsTab = 'projects' | 'repos';

export function ProjectsView() {
  const searchParams = useSearchParams();
  const initialTab: ProjectsTab =
    searchParams?.get('tab') === 'repos' ? 'repos' : 'projects';
  const [activeTab, setActiveTab] = useState<ProjectsTab>(initialTab);

  const { repos, isLoading, error, search, setSearch, isConnected, connectionError } =
    useGitHubRepos();

  const composition = useHoloComposition('/api/surface/projects');
  const [showImport, setShowImport] = useState(false);

  // ── Bridge data into composition state ─────────────────────────────────────
  useEffect(() => {
    if (!composition.loading) {
      composition.setState({
        repos,
        isLoading,
        isConnected,
        connectionError: connectionError ?? error ?? '',
        search,
      });
    }
  }, [repos, isLoading, isConnected, connectionError, error, search, composition.loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Emit handler ────────────────────────────────────────────────────────────
  const handleEmit = (event: string) => {
    if (event === 'open') {
      setShowImport(true);
    } else if (event === 'signin') {
      void signIn('github');
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      {/* Tab bar */}
      <div className="flex shrink-0 items-center gap-1 border-b border-slate-800 bg-slate-950 px-4 py-2">
        <button
          type="button"
          onClick={() => setActiveTab('projects')}
          className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
            activeTab === 'projects'
              ? 'bg-slate-700 text-slate-50'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Projects
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('repos')}
          className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
            activeTab === 'repos'
              ? 'bg-slate-700 text-slate-50'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Repos
        </button>
      </div>

      {/* Tab content */}
      {activeTab === 'projects' && (
        <>
          {!composition.loading && !composition.error ? (
            <HoloSurfaceRenderer
              nodes={composition.nodes}
              state={composition.state}
              computed={composition.computed}
              templates={composition.templates}
              onEmit={handleEmit}
              className="holo-surface-projects min-h-[calc(100vh-48px)]"
            />
          ) : (
            // Fallback while composition loads — minimal shell keeps layout stable
            <div className="flex-1 p-8">
              <div className="mx-auto max-w-3xl">
                <h1 className="text-2xl font-bold">My Repositories</h1>
                <p className="mt-1 text-sm text-studio-muted">
                  Absorb a GitHub repo into a HoloScript workspace.
                </p>
              </div>
            </div>
          )}
        </>
      )}

      {activeTab === 'repos' && <ReposTab />}

      {showImport && (
        <ImportRepoWizard
          onClose={() => {
            setShowImport(false);
            // Sync close back into composition state
            composition.setState({ showImport: false });
          }}
        />
      )}
    </div>
  );
}
