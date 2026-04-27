'use client';

/**
 * AcceptanceVideoInspector — Sprint-3 HoloMap reconstruction panel widget.
 *
 * Surfaces the manifest of a completed reconstruction so the user can:
 *   1. See the video hash, frame count, video bytes, and replay fingerprint
 *      that the SimulationContract emitted.
 *   2. Pin the current fingerprint as an "acceptance baseline" (localStorage)
 *      so future reconstructions of the same scene can be drift-checked
 *      against it.
 *   3. Compare a pasted-in or pinned baseline fingerprint against the current
 *      run — MATCH means the reconstruction is byte-identical (deterministic
 *      replay); DRIFT means the SimulationContract diverged from the baseline.
 *   4. Download the full manifest as JSON for CI use (the regression-test
 *      harness consumes the manifest's `simulationContract.replayFingerprint`
 *      to gate merges).
 *
 * The pure helpers (`compareFingerprints`, `manifestFilename`,
 * `defaultBaseline`) are exported alongside the component so unit tests can
 * exercise the comparison + download logic without a React renderer.
 */

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, Save, Video } from 'lucide-react';

export interface AcceptanceManifest {
  version: string;
  replayHash: string;
  simulationContract: { replayFingerprint: string };
}

export interface AcceptanceVideoInspectorProps {
  manifest: AcceptanceManifest;
  videoHash?: string;
  frameCount?: number;
  videoBytes?: number;
  replayFingerprint?: string;
}

export const ACCEPTANCE_BASELINE_STORAGE_KEY = 'studio.holomap.acceptance-baseline';

export type FingerprintComparison = 'no-baseline' | 'match' | 'drift';

export function compareFingerprints(
  baseline: string | undefined | null,
  current: string,
): FingerprintComparison {
  if (!baseline || baseline.trim() === '') return 'no-baseline';
  return baseline.trim() === current.trim() ? 'match' : 'drift';
}

export function manifestFilename(replayFingerprint: string): string {
  const slug = replayFingerprint.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 16) || 'unknown';
  return `acceptance-manifest-${slug}.json`;
}

export function defaultBaseline(storage?: Pick<Storage, 'getItem'>): string {
  try {
    return storage?.getItem(ACCEPTANCE_BASELINE_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function AcceptanceVideoInspector({
  manifest,
  videoHash,
  frameCount,
  videoBytes,
  replayFingerprint,
}: AcceptanceVideoInspectorProps) {
  const current = replayFingerprint ?? manifest.simulationContract.replayFingerprint;
  const [baseline, setBaseline] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setBaseline(defaultBaseline(window.localStorage));
    }
  }, []);

  const status = compareFingerprints(baseline, current);

  const handleDownload = useCallback(() => {
    if (typeof window === 'undefined') return;
    const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = manifestFilename(current);
    a.click();
    URL.revokeObjectURL(url);
  }, [manifest, current]);

  const handlePin = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(ACCEPTANCE_BASELINE_STORAGE_KEY, current);
      setBaseline(current);
    } catch {
      // localStorage unavailable (private mode, quota) — silently no-op
    }
  }, [current]);

  const handleClearBaseline = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.removeItem(ACCEPTANCE_BASELINE_STORAGE_KEY);
      setBaseline('');
    } catch {
      // no-op
    }
  }, []);

  return (
    <div
      data-testid="acceptance-video-inspector"
      className="mt-3 rounded-xl border border-studio-border bg-studio-panel p-3 text-xs"
    >
      <div className="mb-2 flex items-center gap-2">
        <Video className="h-4 w-4 text-fuchsia-300" />
        <span className="font-medium">Acceptance video inspector</span>
        <span className="ml-auto rounded bg-fuchsia-500/10 px-1.5 py-0.5 text-[10px] text-fuchsia-300">
          Sprint 3
        </span>
      </div>

      <dl className="mb-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        <dt className="text-studio-muted">Manifest version</dt>
        <dd className="font-mono">{manifest.version}</dd>
        <dt className="text-studio-muted">Replay fingerprint</dt>
        <dd className="break-all font-mono">{current}</dd>
        <dt className="text-studio-muted">Replay hash</dt>
        <dd className="break-all font-mono">{manifest.replayHash}</dd>
        {videoHash && (
          <>
            <dt className="text-studio-muted">Video hash</dt>
            <dd className="break-all font-mono">{videoHash}</dd>
          </>
        )}
        {frameCount !== undefined && (
          <>
            <dt className="text-studio-muted">Frames</dt>
            <dd className="font-mono">{frameCount}</dd>
          </>
        )}
        {videoBytes !== undefined && (
          <>
            <dt className="text-studio-muted">Video size</dt>
            <dd className="font-mono">{(videoBytes / 1024 / 1024).toFixed(2)} MB</dd>
          </>
        )}
      </dl>

      <div className="mb-3">
        <label className="mb-1 block text-[10px] uppercase tracking-wider text-studio-muted">
          Baseline fingerprint (compare against)
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={baseline}
            onChange={(e) => setBaseline(e.target.value)}
            placeholder="Paste a previous fingerprint, or pin the current run as baseline"
            className="flex-1 rounded border border-studio-border bg-studio-surface px-2 py-1 font-mono text-[11px] text-studio-text outline-none focus:border-fuchsia-400"
            data-testid="baseline-input"
          />
          {baseline && (
            <button
              onClick={handleClearBaseline}
              className="rounded border border-studio-border px-2 py-1 text-[10px] text-studio-muted hover:text-studio-text"
              data-testid="clear-baseline"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="mb-3" data-testid={`status-${status}`}>
        {status === 'no-baseline' && (
          <div className="rounded bg-studio-surface px-2 py-1 text-studio-muted">
            No baseline pinned. Pin the current fingerprint to enable drift detection on future runs.
          </div>
        )}
        {status === 'match' && (
          <div className="inline-flex items-center gap-1.5 rounded bg-green-500/10 px-2 py-1 text-green-300">
            <CheckCircle2 className="h-3.5 w-3.5" /> MATCH — replay is byte-identical to baseline
          </div>
        )}
        {status === 'drift' && (
          <div className="inline-flex items-center gap-1.5 rounded bg-amber-500/10 px-2 py-1 text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5" /> DRIFT — current fingerprint differs from baseline
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleDownload}
          className="inline-flex items-center gap-1.5 rounded-lg border border-studio-border px-3 py-1.5 text-xs text-studio-muted hover:text-studio-text"
          data-testid="download-manifest"
        >
          <Download className="h-3.5 w-3.5" /> Download manifest JSON
        </button>
        <button
          onClick={handlePin}
          disabled={status === 'match'}
          className="inline-flex items-center gap-1.5 rounded-lg border border-studio-border px-3 py-1.5 text-xs text-studio-muted hover:text-studio-text disabled:opacity-50"
          data-testid="pin-baseline"
        >
          <Save className="h-3.5 w-3.5" /> Pin as baseline
        </button>
      </div>
    </div>
  );
}
