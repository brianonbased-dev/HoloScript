'use client';

/**
 * DesktopViewer — Embeddable HoloScript 3D viewer for desktop/Tauri shells.
 *
 * Companion to WebXRViewer for the Adaptive Platform Layers three-tier story.
 * Uses the same compilation bridge and AdaptivePlatformLayerReceipt so
 * desktop, web, and mobile experiences report unified parity metadata.
 *
 * For Tauri 2 + wgpu / native three.js (or a webgl2 fallback inside the shell).
 *
 * Usage (in tauri-app or desktop shell):
 *   import { DesktopViewer } from '@holoscript/studio/embed/DesktopViewer';
 *   <DesktopViewer code={holoScriptSource} />
 *
 * @see ADAPTIVE_PLATFORM_LAYERS.md (APL 75 desktop parity slice)
 */

import { useMemo } from 'react';
import {
  buildAdaptivePlatformLayerReceipt,
  type AdaptivePlatformLayerReceipt,
} from '@/lib/adaptive-platform-layers';
import { detectPlatform } from '@/lib/platform-detect';
import { logger } from '@/lib/logger';

export interface DesktopViewerProps {
  code: string;
  className?: string;
  style?: React.CSSProperties;
  showPlatformReceipt?: boolean;
  onPlatformReceipt?: (receipt: AdaptivePlatformLayerReceipt) => void;
  onErrors?: (errors: Array<{ message: string }>) => void;
}

export function DesktopViewer({
  code,
  className,
  style,
  showPlatformReceipt = true,
  onPlatformReceipt,
  onErrors,
}: DesktopViewerProps) {
  const receipt = useMemo(() => {
    try {
      const caps = detectPlatform();
      const r = buildAdaptivePlatformLayerReceipt(caps, {
        tier: 'desktop',
        shell: 'tauri-desktop',
        renderer: 'native-gpu',
        codeLength: code.length,
      });
      if (onPlatformReceipt) onPlatformReceipt(r);
      return r;
    } catch (e: any) {
      logger.error('[DesktopViewer] Failed to build platform receipt', e);
      if (onErrors) onErrors([{ message: e?.message || String(e) }]);
      return null;
    }
  }, [code, onPlatformReceipt, onErrors]);

  // Placeholder renderer — in a real desktop shell this would be the native
  // wgpu / three.js / Bevy view. For now we render a minimal status panel
  // so the component is drop-in usable and the receipt is exercised.
  return (
    <div className={className} style={{ ...style, position: 'relative' }}>
      <div
        style={{
          padding: 12,
          borderRadius: 6,
          background: 'rgba(0,0,0,0.6)',
          color: '#ddd',
          fontFamily: 'monospace',
          fontSize: 12,
        }}
      >
        Desktop HoloScript Viewer (Tauri / native-gpu path)
        {receipt && showPlatformReceipt && (
          <div style={{ marginTop: 8, fontSize: 11, opacity: 0.9 }}>
            tier: {receipt.tier} | shell: {receipt.shell} | engine: {receipt.engineDelivery} | renderer: {receipt.renderer}
          </div>
        )}
        <div style={{ marginTop: 6, fontSize: 10, opacity: 0.7 }}>
          (Real 3D canvas + wgpu/Bevy integration goes here — reuses same bridge + receipt as WebXRViewer)
        </div>
      </div>
    </div>
  );
}

export default DesktopViewer;
