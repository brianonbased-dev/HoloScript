'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ErrorBoundary as StudioErrorBoundary } from '@holoscript/ui';

const ScenarioLauncher = dynamic(
  () =>
    import('@/industry/scenarios/ScenarioLauncher').then((m) => ({ default: m.ScenarioLauncher })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-xs text-studio-muted animate-pulse">
        Initializing AI Scenarios...
      </div>
    ),
  }
);

export default function ScenariosRoute() {
  return (
    <main className="flex h-screen w-screen flex-col overflow-hidden bg-studio-bg text-studio-text">
      {/* Isolated Header */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-studio-border bg-studio-panel px-4">
        <div className="flex items-center gap-4">
          <Link
            href="/create"
            className="flex items-center gap-2 text-studio-muted transition hover:text-studio-text"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="text-sm font-medium">Back to Editor</span>
          </Link>
          <div className="flex items-center gap-2 border-l border-studio-border pl-4">
            <span className="text-sm font-semibold text-sky-400">AI Scenario Launchpad</span>
          </div>
        </div>
      </header>

      {/* Main workspace */}
      <div className="relative flex-1 overflow-hidden">
        <StudioErrorBoundary label="Scenario Launcher">
          <ScenarioLauncher />
        </StudioErrorBoundary>
      </div>
    </main>
  );
}
