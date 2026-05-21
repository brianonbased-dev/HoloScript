'use client';

/**
 * DesktopViewer — Embeddable HoloScript 3D viewer for desktop / Tauri shells.
 *
 * Companion to WebXRViewer for Adaptive Platform Layers (idea-seed 75).
 * Reuses the exact same compilation bridge, scene pipeline, and
 * AdaptivePlatformLayerReceipt emission so "compile once, view anywhere"
 * is real.
 *
 * Features:
 *   - Same code prop and callbacks as WebXRViewer
 *   - Pure three.js / OrbitControls navigation (no XR requirement)
 *   - Automatic desktop-tier receipt via existing buildAdaptivePlatformLayerReceipt
 *   - Falls back gracefully when run outside Tauri (still reports 'desktop' when isTauri is true)
 *   - Supports the same object selection + error surface
 *
 * Usage:
 *   import { DesktopViewer } from '@/embed/DesktopViewer';
 *   <DesktopViewer code={holoScriptSource} />
 *
 * @see research/2026-05-20-adaptive-platform-layers-desktop-parity-slice.md
 * @see ADAPTIVE_PLATFORM_LAYERS.md
 */

import { useState, useEffect, useCallback, Suspense, useMemo } from 'react';
import { Canvas, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Grid, Stars, Environment, Text, Sparkles } from '@react-three/drei';
import { MATERIAL_PRESETS } from '@holoscript/core';
import type { R3FNode } from '@holoscript/core';
import { WebSurfaceRenderer, resolveWebSurfaceConfig } from '@holoscript/r3f-renderer';
import { useScenePipeline } from '@/hooks/useScenePipeline';
import {
  buildAdaptivePlatformLayerReceipt,
  type AdaptivePlatformLayerReceipt,
} from '@/lib/adaptive-platform-layers';
import { logger } from '@/lib/logger';
import { detectPlatform, type PlatformCapabilities } from '@/lib/platform-detect';

export interface DesktopViewerProps {
  code: string;
  className?: string;
  style?: React.CSSProperties;
  showGrid?: boolean;
  showStars?: boolean;
  showObjectCount?: boolean;
  backgroundColor?: string;
  selectedObjectId?: string | null;
  onObjectSelect?: (id: string | null) => void;
  onErrors?: (errors: Array<{ message: string }>) => void;
  showPlatformReceipt?: boolean;
  onPlatformReceipt?: (receipt: AdaptivePlatformLayerReceipt) => void;
}

export function DesktopViewer({
  code,
  className,
  style,
  showGrid = true,
  showStars = true,
  showObjectCount = true,
  backgroundColor = '#0a0a0f',
  selectedObjectId,
  onObjectSelect,
  onErrors,
  showPlatformReceipt = true,
  onPlatformReceipt,
}: DesktopViewerProps) {
  const [errors, setErrors] = useState<Array<{ message: string }>>([]);
  const [objectCount, setObjectCount] = useState(0);
  const [receipt, setReceipt] = useState<AdaptivePlatformLayerReceipt | null>(null);

  const { nodes, compileErrors, isCompiling } = useScenePipeline(code, {
    onErrors: (errs) => {
      setErrors(errs);
      onErrors?.(errs);
    },
  });

  // Emit desktop-tier Adaptive Platform Layer receipt (reuses the exact same helper)
  useEffect(() => {
    if (!code) return;

    const caps: PlatformCapabilities = detectPlatform();
    const r = buildAdaptivePlatformLayerReceipt(caps);

    // Force desktop reporting when we are intentionally the desktop viewer
    const desktopReceipt: AdaptivePlatformLayerReceipt = {
      ...r,
      tier: 'desktop',
      shell: 'tauri-desktop',
      renderer: caps.isTauri ? 'native-gpu' : 'webgl',
      evidence: [...r.evidence, 'viewer=DesktopViewer', 'source=adaptive-platform-layers-desktop-parity-slice'],
    };

    setReceipt(desktopReceipt);
    onPlatformReceipt?.(desktopReceipt);
  }, [code, onPlatformReceipt]);

  useEffect(() => {
    if (compileErrors.length > 0) {
      onErrors?.(compileErrors);
    }
  }, [compileErrors, onErrors]);

  const handleObjectClick = useCallback(
    (e: ThreeEvent<MouseEvent>, node: R3FNode) => {
      e.stopPropagation();
      const newSel = selectedObjectId === node.id ? null : node.id;
      onObjectSelect?.(newSel);
    },
    [selectedObjectId, onObjectSelect]
  );

  const sceneNodes = useMemo(() => {
    if (!nodes || nodes.length === 0) return null;
    setObjectCount(nodes.length);

    return nodes.map((node: R3FNode) => {
      const isSelected = selectedObjectId === node.id;
      return (
        <group
          key={node.id}
          onClick={(e) => handleObjectClick(e, node)}
          onPointerOver={(e) => {
            e.object.userData.hovered = true;
          }}
          onPointerOut={(e) => {
            e.object.userData.hovered = false;
          }}
        >
          <WebSurfaceRenderer
            node={node}
            isSelected={isSelected}
            materialPreset={MATERIAL_PRESETS.standard}
          />
        </group>
      );
    });
  }, [nodes, selectedObjectId, handleObjectClick]);

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: backgroundColor,
        ...style,
      }}
    >
      <Canvas
        camera={{ position: [0, 6, 14], fov: 50 }}
        style={{ background: backgroundColor }}
      >
        <Suspense fallback={null}>
          <ambientLight intensity={0.6} />
          <directionalLight position={[10, 20, 5]} intensity={0.9} castShadow />

          {showStars && <Stars radius={300} depth={50} count={800} factor={3} />}
          {showGrid && <Grid args={[40, 40]} cellColor="#1f2937" sectionColor="#374151" />}

          <Environment preset="night" />

          {sceneNodes}

          {selectedObjectId && (
            <Text
              position={[0, 8, 0]}
              fontSize={0.6}
              color="#a5b4fc"
              anchorX="center"
              anchorY="middle"
            >
              Selected: {selectedObjectId}
            </Text>
          )}

          <OrbitControls
            enablePan
            enableZoom
            enableRotate
            minDistance={2}
            maxDistance={80}
            target={[0, 1.5, 0]}
          />
        </Suspense>
      </Canvas>

      {/* Desktop platform receipt badge (identical contract to WebXRViewer) */}
      {showPlatformReceipt && receipt && (
        <div
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            background: 'rgba(15, 23, 42, 0.92)',
            color: '#e0e7ff',
            padding: '6px 10px',
            borderRadius: 6,
            fontSize: 11,
            fontFamily: 'ui-monospace, monospace',
            border: '1px solid #334155',
            maxWidth: 260,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 2 }}>
            APL • {receipt.tier} • {receipt.shell}
          </div>
          <div style={{ opacity: 0.8, fontSize: 10 }}>
            {receipt.engineDelivery} → {receipt.renderer}
          </div>
          <div style={{ opacity: 0.6, fontSize: 9, marginTop: 2 }}>
            WIT: {receipt.witWorld}
          </div>
        </div>
      )}

      {showObjectCount && objectCount > 0 && (
        <div
          style={{
            position: 'absolute',
            bottom: 12,
            left: 12,
            background: 'rgba(15, 23, 42, 0.85)',
            color: '#94a3b8',
            padding: '2px 8px',
            borderRadius: 4,
            fontSize: 11,
          }}
        >
          {objectCount} objects
        </div>
      )}

      {isCompiling && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: '#64748b',
            fontSize: 13,
          }}
        >
          Compiling…
        </div>
      )}

      {errors.length > 0 && (
        <div
          style={{
            position: 'absolute',
            bottom: 12,
            right: 12,
            background: 'rgba(127, 29, 29, 0.9)',
            color: '#fecaca',
            padding: '6px 10px',
            borderRadius: 6,
            fontSize: 11,
            maxWidth: 320,
          }}
        >
          {errors.slice(0, 2).map((e, i) => (
            <div key={i}>{e.message}</div>
          ))}
        </div>
      )}
    </div>
  );
}
