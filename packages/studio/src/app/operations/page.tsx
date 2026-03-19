'use client';

/**
 * Operations — /operations
 *
 * Native HoloScript-driven operations dashboard. The full dashboard surface is
 * defined in compositions/studio/operations.hsplus and rendered by
 * HoloSurfaceRenderer.
 *
 * @module operations/page
 */

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { HoloSurfaceRenderer, useHoloComposition } from '@/components/holo-surface';

export default function OperationsPage() {
  const composition = useHoloComposition('/api/surface/operations');

  return (
    <div className="min-h-screen bg-[#020617] text-white">
      <header className="border-b border-white/10 bg-[#0b1220]/80 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3">
          <Link href="/" className="text-white/60 transition hover:text-white" aria-label="Back to Studio">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-lg font-semibold">Studio Operations</h1>
            <p className="text-xs text-white/50">Hydrated from native composition surface</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6">
        {!composition.loading && !composition.error ? (
          <HoloSurfaceRenderer
            nodes={composition.nodes}
            state={composition.state}
            computed={composition.computed}
            templates={composition.templates}
            onEmit={composition.emit}
            className="holo-surface-operations"
          />
        ) : (
          <div className="rounded-xl border border-white/10 bg-white/5 p-6">
            {composition.error ? (
              <p className="text-sm text-red-300">Failed to load operations composition: {composition.error}</p>
            ) : (
              <p className="text-sm text-white/60">Loading operations dashboard...</p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
