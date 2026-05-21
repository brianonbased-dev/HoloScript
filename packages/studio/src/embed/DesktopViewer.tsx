'use client';

/**
 * DesktopViewer — Embeddable HoloScript 3D viewer for desktop/Tauri shells (APL parity).
 *
 * Full parity with WebXRViewer:
 * - Same `code` prop + useScenePipeline / usePipeline compilation bridge (via SceneViewer)
 * - Orbit + selection controls (non-XR desktop / Tauri context)
 * - Emits identical AdaptivePlatformLayerReceipt shape (tier=desktop when in Tauri)
 * - Reuses all scene pipeline, node renderers, materials, WebSurfaceRenderer support
 *
 * Drop-in for Tauri 2 desktop shells or any React desktop container.
 *
 * Usage:
 *   import { DesktopViewer } from '@holoscript/studio/embed/DesktopViewer';
 *   <DesktopViewer code={holoScriptSource} onPlatformReceipt={...} />
 *
 * @see research/2026-05-20-adaptive-platform-layers-desktop-parity-slice.md
 * @see ADAPTIVE_PLATFORM_LAYERS.md
 */

import { useEffect, useState } from 'react';
import {
  buildAdaptivePlatformLayerReceipt,
  type AdaptivePlatformLayerReceipt,
} from '@/lib/adaptive-platform-layers';
import { detectPlatform } from '@/lib/platform-detect';
import { logger } from '@/lib/logger';
import { SceneViewer, type SceneViewerProps } from './SceneViewer';

export interface DesktopViewerProps extends Omit<SceneViewerProps, 'onErrors'> {
  /** Show the Adaptive Platform Layer receipt badge */
  showPlatformReceipt?: boolean;
  /** Called with desktop-tier receipt (auto-inferred via detectPlatform + Tauri caps) */
  onPlatformReceipt?: (receipt: AdaptivePlatformLayerReceipt) => void;
  /** Error callback (parse/compile) */
  onErrors?: (errors: Array<{ message: string }>) => void;
}

export function DesktopViewer({
  code,
  className,
  style,
  showGrid = true,
  showStars = true,
  showObjectCount = true,
  backgroundColor = '#0a0a12',
  selectedObjectId,
  onObjectSelect,
  onErrors,
  showPlatformReceipt = true,
  onPlatformReceipt,
  ...sceneViewerRest
}: DesktopViewerProps) {
  const [platformReceipt, setPlatformReceipt] = useState<AdaptivePlatformLayerReceipt | null>(null);

  // Async platform detection + receipt (matches WebXRViewer contract exactly)
  useEffect(() => {
    let cancelled = false;
    detectPlatform()
      .then((caps) => {
        if (cancelled) return;
        const r = buildAdaptivePlatformLayerReceipt(caps);
        setPlatformReceipt(r);
        onPlatformReceipt?.(r);
      })
      .catch((err: unknown) => {
        logger.warn('[DesktopViewer] Failed to resolve adaptive platform receipt:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [onPlatformReceipt]);

  // Forward errors from SceneViewer (which uses the pipeline)
  const handleErrors = (errors: Array<{ message: string }>) => {
    if (onErrors) onErrors(errors);
  };

  return (
    <div
      className={className}
      style={{ position: 'relative', width: '100%', height: '100%', ...style }}
    >
      <SceneViewer
        code={code}
        showGrid={showGrid}
        showStars={showStars}
        showObjectCount={showObjectCount}
        backgroundColor={backgroundColor}
        selectedObjectId={selectedObjectId}
        onObjectSelect={onObjectSelect}
        onErrors={handleErrors}
        {...sceneViewerRest}
      />

      {/* APL receipt badge — parity with WebXRViewer */}
      {platformReceipt && showPlatformReceipt && (
        <div
          style={{
            position: 'absolute',
            bottom: 12,
            right: 12,
            zIndex: 20,
            padding: '4px 8px',
            borderRadius: 4,
            background: 'rgba(0,0,0,0.75)',
            color: '#ddd',
            fontFamily: 'monospace',
            fontSize: 10,
            pointerEvents: 'none',
          }}
          aria-label="Adaptive platform receipt"
        >
          APL: {platformReceipt.tier} | {platformReceipt.shell} | {platformReceipt.renderer}
          <div style={{ fontSize: 9, opacity: 0.7 }}>
            {platformReceipt.engineDelivery} • {platformReceipt.witWorld}
          </div>
        </div>
      )}
      {/* parity note: full 3D via SceneViewer; receipts match web shape exactly */}
    </div>
  );
}

export default DesktopViewer;
