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
import { JetBrains_Mono, Space_Grotesk } from 'next/font/google';
import { HoloSurfaceRenderer, useHoloComposition } from '@/components/holo-surface';

const displayFont = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
});

const dataFont = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['500', '700'],
});

export default function OperationsPage() {
  const composition = useHoloComposition('/api/surface/operations');
  const state = (composition.state ?? {}) as Record<string, unknown>;

  const daemonHealth = typeof state.daemonHealth === 'number' ? state.daemonHealth : null;
  const openAlerts = typeof state.openAlerts === 'number' ? state.openAlerts : 0;
  const pendingReviews = typeof state.pendingReviews === 'number' ? state.pendingReviews : 0;
  const syncStatus = typeof state.syncStatus === 'string' ? state.syncStatus : 'unknown';
  const workspaceName = typeof state.workspaceName === 'string' ? state.workspaceName : 'workspace';
  const branchName = typeof state.branchName === 'string' ? state.branchName : 'main';
  const jobs = Array.isArray(state.jobs) ? state.jobs as Array<Record<string, unknown>> : [];
  const runningJobs = jobs.filter((job) => job.status === 'running').length;

  const healthLabel =
    daemonHealth === null
      ? 'n/a'
      : `${Math.round(daemonHealth * 100)}%`;

  const healthTone =
    daemonHealth === null
      ? 'text-white/60'
      : daemonHealth >= 0.9
        ? 'text-emerald-300'
        : daemonHealth >= 0.75
          ? 'text-amber-300'
          : 'text-rose-300';

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#020617] text-white">
      <div className="pointer-events-none absolute inset-0 opacity-60">
        <div className="orb-one absolute left-[-120px] top-[-100px] h-[360px] w-[360px] rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="orb-two absolute bottom-[-120px] right-[-120px] h-[420px] w-[420px] rounded-full bg-indigo-500/20 blur-3xl" />
      </div>

      <header className="relative border-b border-white/10 bg-[#0b1220]/70 px-4 py-3 backdrop-blur sm:px-6 sm:py-4">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-white/60 transition hover:text-white" aria-label="Back to Studio">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <h1 className={`${displayFont.className} text-base font-semibold tracking-tight sm:text-lg`}>Studio Operations</h1>
              <p className="text-[11px] text-white/50 sm:text-xs">Hydrated from native composition surface</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-[11px] sm:gap-2 sm:text-xs">
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-white/70 sm:px-3">
              {workspaceName}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-white/70 sm:px-3">
              {branchName}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-white/70 sm:px-3">
              <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300 align-middle" />
              sync: {syncStatus}
            </span>
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-7xl px-4 py-4 sm:px-6 sm:py-5">
        <section className="mb-4 grid grid-cols-2 gap-2.5 sm:mb-5 sm:gap-3 lg:grid-cols-5">
          <div className="metric-card rounded-xl border border-white/10 bg-white/[0.03] p-3 sm:p-3.5">
            <p className="text-[10px] uppercase tracking-[0.1em] text-white/45">Daemon Health</p>
            <p className={`${dataFont.className} mt-1.5 text-lg font-semibold sm:text-xl ${healthTone}`}>{healthLabel}</p>
          </div>
          <div className="metric-card rounded-xl border border-white/10 bg-white/[0.03] p-3 sm:p-3.5">
            <p className="text-[10px] uppercase tracking-[0.1em] text-white/45">Running Jobs</p>
            <p className={`${dataFont.className} mt-1.5 text-lg font-semibold text-white sm:text-xl`}>{runningJobs}</p>
          </div>
          <div className="metric-card rounded-xl border border-white/10 bg-white/[0.03] p-3 sm:p-3.5">
            <p className="text-[10px] uppercase tracking-[0.1em] text-white/45">Pending Reviews</p>
            <p className={`${dataFont.className} mt-1.5 text-lg font-semibold text-white sm:text-xl`}>{pendingReviews}</p>
          </div>
          <div className="metric-card rounded-xl border border-white/10 bg-white/[0.03] p-3 sm:p-3.5">
            <p className="text-[10px] uppercase tracking-[0.1em] text-white/45">Open Alerts</p>
            <p className={`${dataFont.className} mt-1.5 text-lg font-semibold text-white sm:text-xl`}>{openAlerts}</p>
          </div>
          <div className="metric-card col-span-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 sm:col-span-1 sm:p-3.5 lg:col-span-1">
            <p className="text-[10px] uppercase tracking-[0.1em] text-white/45">Surface Endpoint</p>
            <p className={`${dataFont.className} mt-1.5 truncate text-xs text-cyan-300 sm:text-sm`}>/api/surface/operations</p>
          </div>
        </section>

        {!composition.loading && !composition.error ? (
          <section className="rounded-2xl border border-white/10 bg-[#0a1222]/80 p-2.5 shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_16px_50px_rgba(2,6,23,0.6)] sm:p-3">
            <HoloSurfaceRenderer
              nodes={composition.nodes}
              state={composition.state}
              computed={composition.computed}
              templates={composition.templates}
              onEmit={composition.emit}
              className="holo-surface-operations"
            />
          </section>
        ) : (
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-6">
            {composition.error ? (
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-rose-300">Failed to load operations composition</p>
                  <p className="mt-1 text-xs text-white/60">{composition.error}</p>
                </div>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="rounded-lg border border-white/15 bg-white/[0.05] px-3 py-1.5 text-sm text-white/80 transition hover:bg-white/[0.08]"
                >
                  Retry
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-white/70">Loading operations dashboard...</p>
                <div className="h-3 w-1/3 animate-pulse rounded bg-white/10" />
                <div className="h-3 w-2/3 animate-pulse rounded bg-white/10" />
                <div className="h-56 animate-pulse rounded-xl border border-white/10 bg-white/[0.02]" />
              </div>
            )}
          </section>
        )}

        <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] text-white/50 sm:mt-4 sm:gap-2 sm:text-xs">
          <Link href="/workspace" className="rounded-full border border-white/10 px-2.5 py-1 transition hover:bg-white/[0.05] hover:text-white/80 sm:px-3">
            Open Workspace
          </Link>
          <Link href="/projects" className="rounded-full border border-white/10 px-2.5 py-1 transition hover:bg-white/[0.05] hover:text-white/80 sm:px-3">
            Open Projects
          </Link>
          <Link href="/holodaemon" className="rounded-full border border-white/10 px-2.5 py-1 transition hover:bg-white/[0.05] hover:text-white/80 sm:px-3">
            HoloDaemon
          </Link>
        </div>
      </main>

      <style jsx>{`
        .orb-one {
          animation: driftA 16s ease-in-out infinite;
        }

        .orb-two {
          animation: driftB 18s ease-in-out infinite;
        }

        .metric-card {
          animation: riseFade 480ms ease both;
        }

        .metric-card:nth-child(2) {
          animation-delay: 60ms;
        }

        .metric-card:nth-child(3) {
          animation-delay: 110ms;
        }

        .metric-card:nth-child(4) {
          animation-delay: 160ms;
        }

        .metric-card:nth-child(5) {
          animation-delay: 210ms;
        }

        .holo-surface-operations {
          position: relative;
          min-height: 58vh;
          max-height: calc(100vh - 270px);
          border-radius: 14px;
          background: linear-gradient(180deg, rgba(15, 23, 42, 0.66), rgba(2, 6, 23, 0.66));
          overflow: auto;
          padding: 2px;
        }

        @keyframes riseFade {
          from {
            opacity: 0;
            transform: translateY(8px);
          }

          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes driftA {
          0%,
          100% {
            transform: translate3d(0, 0, 0) scale(1);
          }

          50% {
            transform: translate3d(16px, 12px, 0) scale(1.05);
          }
        }

        @keyframes driftB {
          0%,
          100% {
            transform: translate3d(0, 0, 0) scale(1);
          }

          50% {
            transform: translate3d(-18px, -10px, 0) scale(0.97);
          }
        }

        @media (max-width: 640px) {
          .holo-surface-operations {
            min-height: 52vh;
            max-height: calc(100vh - 300px);
            border-radius: 12px;
          }
        }
      `}</style>
    </div>
  );
}
