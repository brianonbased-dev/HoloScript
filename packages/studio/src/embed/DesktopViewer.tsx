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
import { OrbitControls, Grid, Stars, Environment, Text } from '@react-three/drei';
import { MATERIAL_PRESETS } from '@holoscript/core';
import type { R3FNode } from '@holoscript/core';
import { WebSurfaceRenderer, resolveWebSurfaceConfig } from '@holoscript/r3f-renderer';
import { useScenePipeline } from '@/hooks/useScenePipeline';
import {
  buildAdaptivePlatformLayerReceipt,
  type AdaptivePlatformLayerReceipt,
} from '@/lib/adaptive-platform-layers';
import { logger } from '@/lib/logger';
import { detectPlatform } from '@/lib/platform-detect';

// ═══════════════════════════════════════════════════════════════════
// Geometry + Material mappers (mirrors WebXRViewer's EmbedNodeRenderer)
// ═══════════════════════════════════════════════════════════════════

function getGeometry(hsType: string, size: number) {
  const s = size || 1;
  switch (hsType) {
    case 'sphere':
    case 'orb':
      return <sphereGeometry args={[s * 0.5, 32, 32]} />;
    case 'cube':
    case 'box':
      return <boxGeometry args={[s, s, s]} />;
    case 'cylinder':
      return <cylinderGeometry args={[s * 0.5, s * 0.5, s, 32]} />;
    case 'pyramid':
    case 'cone':
      return <coneGeometry args={[s * 0.5, s, 4]} />;
    case 'plane':
      return <planeGeometry args={[s, s]} />;
    case 'torus':
      return <torusGeometry args={[s * 0.5, s * 0.15, 16, 32]} />;
    case 'ring':
      return <ringGeometry args={[s * 0.3, s * 0.5, 32]} />;
    case 'capsule':
      return <capsuleGeometry args={[s * 0.3, s * 0.5, 4, 16]} />;
    default:
      return <boxGeometry args={[s, s, s]} />;
  }
}

function getMaterialProps(node: R3FNode): Record<string, unknown> {
  const props = node.props;
  const materialName = props.material || props.materialPreset;
  const preset = materialName
    ? (MATERIAL_PRESETS as Record<string, Record<string, unknown>>)[materialName as string]
    : undefined;

  const matProps: Record<string, unknown> = { ...(preset || {}) };

  if (props.color) matProps.color = props.color;
  if (props.emissive) matProps.emissive = props.emissive;
  if (props.emissiveIntensity !== undefined) matProps.emissiveIntensity = props.emissiveIntensity;
  if (props.opacity !== undefined) matProps.opacity = props.opacity;
  if (props.transparent !== undefined) matProps.transparent = props.transparent;
  if (props.metalness !== undefined) matProps.metalness = props.metalness;
  if (props.roughness !== undefined) matProps.roughness = props.roughness;
  if (props.wireframe !== undefined) matProps.wireframe = props.wireframe;
  if (props.materialProps) Object.assign(matProps, props.materialProps);
  if (!matProps.color) matProps.color = '#8888cc';

  return matProps;
}

// ═══════════════════════════════════════════════════════════════════
// Recursive node renderer — same contract as WebXRViewer's EmbedNodeRenderer,
// renders web-surface meshes via WebSurfaceRenderer (url-based) and falls back
// to geometry meshes for everything else.
// ═══════════════════════════════════════════════════════════════════

function DesktopNodeRenderer({
  node,
  selectedId,
  onSelect,
}: {
  node: R3FNode;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
}) {
  const children = node.children?.map((child: R3FNode, i: number) => (
    <DesktopNodeRenderer
      key={child.id || `child-${i}`}
      node={child}
      selectedId={selectedId}
      onSelect={onSelect}
    />
  ));

  const { props } = node;

  switch (node.type) {
    case 'mesh': {
      const webSurfaceCfg = resolveWebSurfaceConfig(node);
      if (webSurfaceCfg) {
        const wsUrl = typeof webSurfaceCfg.url === 'string' ? webSurfaceCfg.url : '';
        if (wsUrl) {
          const wsSize =
            Array.isArray(webSurfaceCfg.size) && webSurfaceCfg.size.length === 2
              ? (webSurfaceCfg.size as [number, number])
              : ([1024, 768] as [number, number]);
          const wsSandbox = Array.isArray(webSurfaceCfg.sandbox)
            ? (webSurfaceCfg.sandbox as string[])
            : undefined;
          return (
            <group>
              <WebSurfaceRenderer
                url={wsUrl}
                size={wsSize}
                position={props.position as [number, number, number] | undefined}
                rotation={props.rotation as [number, number, number] | undefined}
                scale={props.scale as [number, number, number] | number | undefined}
                sandbox={wsSandbox}
                allow_mic={!!webSurfaceCfg.allow_mic}
                allow_camera={!!webSurfaceCfg.allow_camera}
                origin_whitelist={
                  Array.isArray(webSurfaceCfg.origin_whitelist)
                    ? (webSurfaceCfg.origin_whitelist as string[])
                    : undefined
                }
                selected={node.id === selectedId}
                onSelect={() => onSelect?.(node.id ?? null)}
              />
              {children}
            </group>
          );
        }
      }
      const hsType = (props.hsType as string) || 'box';
      const size = (props.size as number) || 1;
      const isSelected = node.id === selectedId;
      const matProps = getMaterialProps(node);
      return (
        <group>
          <mesh
            position={props.position}
            rotation={props.rotation}
            scale={
              typeof props.scale === 'number'
                ? [props.scale, props.scale, props.scale]
                : props.scale
            }
            onClick={(e: ThreeEvent<MouseEvent>) => {
              e.stopPropagation();
              onSelect?.(node.id ?? null);
            }}
          >
            {getGeometry(hsType, size)}
            <meshPhysicalMaterial {...matProps} />
            {isSelected && (
              <mesh>
                {getGeometry(hsType, size * 1.05)}
                <meshBasicMaterial color="#3b82f6" wireframe transparent opacity={0.4} />
              </mesh>
            )}
          </mesh>
          {children}
        </group>
      );
    }
    case 'group':
      return (
        <group position={props.position} rotation={props.rotation} scale={props.scale}>
          {children}
        </group>
      );
    case 'directionalLight':
      return (
        <directionalLight
          color={props.color}
          intensity={props.intensity ?? 1}
          position={props.position || [5, 10, 5]}
          castShadow={props.shadows ?? false}
        />
      );
    case 'ambientLight':
      return <ambientLight color={props.color} intensity={props.intensity ?? 0.4} />;
    case 'pointLight':
      return (
        <pointLight
          color={props.color}
          intensity={props.intensity ?? 1}
          position={props.position || [0, 5, 0]}
          distance={props.distance}
          decay={props.decay ?? 2}
        />
      );
    case 'Text':
      return (
        <Text
          position={props.position}
          rotation={props.rotation}
          fontSize={props.fontSize ?? 0.5}
          color={props.color || '#ffffff'}
          anchorX="center"
          anchorY="middle"
        >
          {props.text || props.content || ''}
        </Text>
      );
    case 'Environment':
      return (
        <Environment preset={props.envPreset || 'studio'} background={props.background ?? false} />
      );
    default:
      return (
        <group position={props.position} rotation={props.rotation} scale={props.scale}>
          {children}
        </group>
      );
  }
}

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
  const [receipt, setReceipt] = useState<AdaptivePlatformLayerReceipt | null>(null);

  const { r3fTree, errors: compileErrors } = useScenePipeline(code);

  // Emit desktop-tier Adaptive Platform Layer receipt (reuses the exact same helper)
  useEffect(() => {
    if (!code) return;
    let cancelled = false;

    detectPlatform()
      .then((caps) => {
        if (cancelled) return;
        const r = buildAdaptivePlatformLayerReceipt(caps);

        // Force desktop reporting when we are intentionally the desktop viewer
        const desktopReceipt: AdaptivePlatformLayerReceipt = {
          ...r,
          tier: 'desktop',
          shell: 'tauri-desktop',
          renderer: caps.isTauri ? 'native-gpu' : 'webgl',
          evidence: [
            ...r.evidence,
            'viewer=DesktopViewer',
            'source=adaptive-platform-layers-desktop-parity-slice',
          ],
        };

        setReceipt(desktopReceipt);
        onPlatformReceipt?.(desktopReceipt);
      })
      .catch((err: unknown) => {
        logger.warn('[DesktopViewer] Failed to resolve adaptive platform receipt:', err);
      });

    return () => {
      cancelled = true;
    };
  }, [code, onPlatformReceipt]);

  // Surface compile errors locally and upstream
  useEffect(() => {
    setErrors(compileErrors);
    if (compileErrors.length > 0) {
      onErrors?.(compileErrors);
    }
  }, [compileErrors, onErrors]);

  const handleObjectSelect = useCallback(
    (id: string | null) => {
      const newSel = selectedObjectId === id ? null : id;
      onObjectSelect?.(newSel);
    },
    [selectedObjectId, onObjectSelect]
  );

  const objectCount = r3fTree?.children?.length ?? 0;

  const sceneNodes = useMemo(() => {
    if (!r3fTree) return null;
    return (
      <DesktopNodeRenderer
        node={r3fTree}
        selectedId={selectedObjectId}
        onSelect={handleObjectSelect}
      />
    );
  }, [r3fTree, selectedObjectId, handleObjectSelect]);

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
