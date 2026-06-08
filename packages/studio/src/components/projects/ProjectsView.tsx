'use client';

/**
 * Projects — /projects
 *
 * **Native body**: the full page surface (header, repo list, empty-states,
 * CTA) is defined in `compositions/studio/projects.hsplus` and rendered by
 * HoloSurfaceRenderer.  ProjectsView is reduced to its irreducible host
 * responsibilities:
 *
 *   1. Load repo data via useGitHubRepos (the data source — GitHub API).
 *   2. Bridge data into composition state via setState() on every update.
 *   3. Handle emits that require React side-effects:
 *      - "open"   → open the ImportRepoWizard overlay
 *      - "signin" → trigger GitHub OAuth via signIn('github')
 *      - "back"   → navigate back (handled by Link in the composition)
 *
 * This is the template conversion for the other 9 holo-pages whose page.holo
 * is currently just @slot(HandWrittenComponent).
 *
 * @see compositions/studio/projects.hsplus — the source of truth for layout / UI
 * @module projects/ProjectsView
 */

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { signIn } from 'next-auth/react';
import { HoloSurfaceRenderer, useHoloComposition } from '@/components/holo-surface';
import { useGitHubRepos } from '@/hooks/useGitHubRepos';

// Lazy-load the wizard (large) — only when the user starts an import.
const ImportRepoWizard = dynamic(
  () =>
    import('@/components/wizard/ImportRepoWizard').then((m) => ({ default: m.ImportRepoWizard })),
  { ssr: false }
);

export function ProjectsView() {
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
    <>
      {!composition.loading && !composition.error ? (
        <HoloSurfaceRenderer
          nodes={composition.nodes}
          state={composition.state}
          computed={composition.computed}
          templates={composition.templates}
          onEmit={handleEmit}
          className="holo-surface-projects min-h-screen"
        />
      ) : (
        // Fallback while composition loads — minimal shell keeps layout stable
        <div className="min-h-screen p-8">
          <div className="mx-auto max-w-3xl">
            <h1 className="text-2xl font-bold">My Repositories</h1>
            <p className="text-sm text-studio-muted mt-1">
              Absorb a GitHub repo into a HoloScript workspace.
            </p>
          </div>
        </div>
      )}

      {showImport && (
        <ImportRepoWizard
          onClose={() => {
            setShowImport(false);
            // Sync close back into composition state
            composition.setState({ showImport: false });
          }}
        />
      )}
    </>
  );
}
