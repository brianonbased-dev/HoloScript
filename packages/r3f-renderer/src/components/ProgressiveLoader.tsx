/**
 * ProgressiveLoader — Loading progress overlay for the Draft→Mesh→Final pipeline.
 *
 * Renders a HUD-style progress indicator inside the R3F Canvas using
 * drei's Html component. Shows per-entity loading state as assets
 * promote from draft → mesh → final maturity.
 *
 * Usage:
 * ```tsx
 * <Canvas>
 *   <ProgressiveLoader
 *     entities={[
 *       { id: 'building', maturity: 'draft', progress: 0 },
 *       { id: 'tree', maturity: 'mesh', progress: 0.6 },
 *       { id: 'rock', maturity: 'final', progress: 1.0 },
 *     ]}
 *   />
 *   <SceneContents />
 * </Canvas>
 * ```
 *
 * @see W.080 — Draft→Mesh→Final pipeline
 * @see FE-2 — Progressive loading indicator directive
 */

import { useMemo } from 'react';
import { Html } from '@react-three/drei';
import type { AssetMaturity } from '@holoscript/core';

// ── Types ────────────────────────────────────────────────────────────────────

export interface LoadingEntity {
  /** Entity ID */
  id: string;
  /** Current asset maturity stage */
  maturity: AssetMaturity;
  /** Loading progress within current stage (0.0 - 1.0) */
  progress: number;
  /** Optional label (defaults to id) */
  label?: string;
}

export interface ProgressiveLoaderProps {
  /** Entities being loaded/promoted */
  entities: LoadingEntity[];
  /** Whether to show the overlay (default: true when entities are loading) */
  visible?: boolean;
  /** Position in 3D space (default: [0, 3, 0]) */
  position?: [number, number, number];
  /** Whether to render as a fixed HUD (default: true) */
  hud?: boolean;
}

// ── Constants ────────────────────────────────────────────────────────────────

const MATURITY_COLORS: Record<AssetMaturity, string> = {
  draft: '#88aaff',
  mesh: '#ffaa44',
  final: '#44dd88',
};

const MATURITY_LABELS: Record<AssetMaturity, string> = {
  draft: 'Draft',
  mesh: 'Loading Mesh',
  final: 'Final',
};

// ── Styles ───────────────────────────────────────────────────────────────────

const containerStyle: React.CSSProperties = {
  background: 'rgba(0, 0, 0, 0.75)',
  borderRadius: '8px',
  padding: '12px 16px',
  minWidth: '200px',
  maxWidth: '320px',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  fontSize: '12px',
  color: '#eee',
  pointerEvents: 'none',
  userSelect: 'none',
};

const headerStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.5px',
  color: '#999',
  marginBottom: '8px',
};

const entityRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  marginBottom: '6px',
};

const labelStyle: React.CSSProperties = {
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap' as const,
  fontSize: '11px',
};

const barContainerStyle: React.CSSProperties = {
  width: '80px',
  height: '6px',
  background: 'rgba(255,255,255,0.15)',
  borderRadius: '3px',
  overflow: 'hidden',
};

function barFillStyle(progress: number, color: string): React.CSSProperties {
  return {
    width: `${Math.min(100, Math.max(0, progress * 100))}%`,
    height: '100%',
    background: color,
    borderRadius: '3px',
    transition: 'width 0.3s ease',
  };
}

const stageStyle = (color: string): React.CSSProperties => ({
  fontSize: '10px',
  color,
  fontWeight: 500,
  minWidth: '50px',
  textAlign: 'right' as const,
});

// ── Component ────────────────────────────────────────────────────────────────

export function ProgressiveLoader({
  entities,
  visible,
  position = [0, 3, 0],
  hud = true,
}: ProgressiveLoaderProps) {
  // Count entities still loading (not yet final)
  const loadingEntities = useMemo(
    () => entities.filter((e) => e.maturity !== 'final' || e.progress < 1),
    [entities],
  );

  // Auto-hide when nothing is loading
  const isVisible = visible !== undefined ? visible : loadingEntities.length > 0;

  if (!isVisible || entities.length === 0) return null;

  // Overall progress
  const overallProgress = useMemo(() => {
    if (entities.length === 0) return 0;
    const maturityWeight: Record<AssetMaturity, number> = {
      draft: 0,
      mesh: 0.33,
      final: 0.66,
    };
    const total = entities.reduce((sum, e) => {
      const base = maturityWeight[e.maturity] ?? 0;
      const stageContrib = e.progress * 0.34;
      return sum + base + stageContrib;
    }, 0);
    return total / entities.length;
  }, [entities]);

  return (
    <group position={position}>
      <Html
        center
        distanceFactor={hud ? undefined : 10}
        style={{ pointerEvents: 'none' }}
        zIndexRange={[100, 0]}
      >
        <div style={containerStyle}>
          <div style={headerStyle}>
            Asset Pipeline — {Math.round(overallProgress * 100)}%
          </div>

          {entities.map((entity) => {
            const color = MATURITY_COLORS[entity.maturity];
            return (
              <div key={entity.id} style={entityRowStyle}>
                <span style={labelStyle}>{entity.label || entity.id}</span>
                <div style={barContainerStyle}>
                  <div style={barFillStyle(entity.progress, color)} />
                </div>
                <span style={stageStyle(color)}>
                  {MATURITY_LABELS[entity.maturity]}
                </span>
              </div>
            );
          })}
        </div>
      </Html>
    </group>
  );
}
