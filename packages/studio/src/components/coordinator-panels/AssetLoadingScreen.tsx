'use client';
/**
 * AssetLoadingScreen — Studio downstream consumer of AssetLoadCoordinator.
 *
 * Closes the W.081 "wire through ONE real consumer" requirement at the
 * Studio surface for the AssetLoadCoordinator bus. Renders an overlay
 * listing every asset currently in `loading` state with a progress bar,
 * plus per-asset error rows that auto-clear on next successful load.
 *
 * Hidden when no assets are tracked or every tracked asset is `loaded`
 * (idle Studio doesn't render the overlay at all).
 */
import { useMemo } from 'react';
import type { TraitRuntimeIntegration } from '@holoscript/engine/runtime/TraitRuntimeIntegration';
import { useAssetLoadStates } from './TraitRuntimeContext';

export interface AssetLoadingScreenProps {
  /** Optional explicit runtime — falls back to TraitRuntimeProvider context. */
  runtime?: TraitRuntimeIntegration | null;
  /** Hide the panel entirely once everything is loaded. Default true. */
  hideWhenIdle?: boolean;
}

export function AssetLoadingScreen({ runtime, hideWhenIdle = true }: AssetLoadingScreenProps) {
  const states = useAssetLoadStates(runtime);

  const { loading, errored, summary } = useMemo(() => {
    const loadingList = states.filter((s) => s.status === 'loading');
    const errorList = states.filter((s) => s.status === 'error');
    const loadedCount = states.filter((s) => s.status === 'loaded').length;
    const meanProgress =
      loadingList.length > 0
        ? loadingList.reduce((sum, s) => sum + s.progress, 0) / loadingList.length
        : 0;
    return {
      loading: loadingList,
      errored: errorList,
      summary: {
        total: states.length,
        loadedCount,
        loadingCount: loadingList.length,
        errorCount: errorList.length,
        meanProgress,
      },
    };
  }, [states]);

  const isIdle = loading.length === 0 && errored.length === 0;
  if (hideWhenIdle && isIdle) return null;

  return (
    <div
      data-testid="asset-loading-screen"
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        width: 320,
        maxWidth: '90vw',
        padding: 12,
        background: 'rgba(15, 23, 42, 0.92)',
        color: '#e2e8f0',
        borderRadius: 8,
        boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
        fontFamily: 'system-ui, sans-serif',
        fontSize: 13,
        zIndex: 1000,
      }}
    >
      <div
        data-testid="asset-loading-summary"
        style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}
      >
        <strong>Loading assets</strong>
        <span style={{ color: '#94a3b8' }}>
          {summary.loadedCount}/{summary.total} loaded
          {summary.errorCount > 0 ? ` · ${summary.errorCount} failed` : ''}
        </span>
      </div>

      {loading.map((s) => (
        <div
          key={`loading-${s.url}`}
          data-testid={`asset-loading-row-${s.url}`}
          style={{ marginBottom: 6 }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
              {s.url}
            </span>
            <span style={{ color: '#64748b' }}>
              {s.format} · {Math.round(s.progress * 100)}%
            </span>
          </div>
          <div
            style={{
              marginTop: 2,
              height: 4,
              background: '#1e293b',
              borderRadius: 2,
              overflow: 'hidden',
            }}
          >
            <div
              data-testid={`asset-progress-${s.url}`}
              style={{
                width: `${Math.round(s.progress * 100)}%`,
                height: '100%',
                background: '#38bdf8',
                transition: 'width 120ms linear',
              }}
            />
          </div>
        </div>
      ))}

      {errored.map((s) => (
        <div
          key={`error-${s.url}`}
          data-testid={`asset-error-row-${s.url}`}
          style={{ marginTop: 6, color: '#f87171', fontSize: 12 }}
        >
          ⚠ {s.url}: {s.error ?? 'load failed'}
        </div>
      ))}
    </div>
  );
}
