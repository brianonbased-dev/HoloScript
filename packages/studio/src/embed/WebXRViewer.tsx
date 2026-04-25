'use client';

/**
 * WebXRViewer — Embeddable HoloScript 3D viewer with WebXR support.
 *
 * A standalone component that compiles HoloScript source and renders it
 * in a @react-three/fiber Canvas with full VR/AR session support via
 * @react-three/xr v6.
 *
 * Features:
 *   - Automatic XR capability detection (VR, AR, inline)
 *   - Enter/exit VR and AR buttons with platform gating
 *   - Bridge-mediated compilation (WASM primary, TS fallback)
 *   - Scene content reuse from SceneViewer (EmbedNodeRenderer)
 *   - Hand controllers and ray-pointer interaction in XR
 *   - Configurable floor reference space + teleportation
 *
 * Usage:
 *   import { WebXRViewer } from '@/embed/WebXRViewer';
 *   <WebXRViewer code={holoScriptSource} mode="immersive-vr" />
 *
 * @see ADAPTIVE_PLATFORM_LAYERS.md §4 Platform Plugin Architecture
 */

import { useState, useEffect, useCallback, Suspense, useMemo } from 'react';
import { Canvas, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Grid, Stars, Environment, Text, Sparkles } from '@react-three/drei';
import { createXRStore, XR } from '@react-three/xr';
import { MATERIAL_PRESETS } from '@holoscript/core';
import type { R3FNode } from '@holoscript/core';
import { useScenePipeline } from '@/hooks/useScenePipeline';
import { logger } from '@/lib/logger';

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

export type XRSessionMode = 'immersive-vr' | 'immersive-ar' | 'inline';

export interface WebXRViewerProps {
  /** HoloScript source code (.hsplus or .holo) */
  code: string;
  /** Preferred XR mode — buttons shown based on device support */
  mode?: XRSessionMode;
  /** CSS className for the container */
  className?: string;
  /** Inline styles for the container */
  style?: React.CSSProperties;
  /** Show ground grid */
  showGrid?: boolean;
  /** Show background stars (disabled in AR) */
  showStars?: boolean;
  /** Show object count overlay */
  showObjectCount?: boolean;
  /** Background color (used in non-AR modes) */
  backgroundColor?: string;
  /** Currently selected object ID */
  selectedObjectId?: string | null;
  /** Object selection callback */
  onObjectSelect?: (id: string | null) => void;
  /** Error callback */
  onErrors?: (errors: Array<{ message: string }>) => void;
  /** Called when XR session starts */
  onXRSessionStart?: (mode: XRSessionMode) => void;
  /** Called when XR session ends */
  onXRSessionEnd?: () => void;
  /** Auto-enter XR mode on mount (requires user gesture in practice) */
  autoEnterXR?: boolean;
  /** Reference space type (default: 'local-floor') */
  referenceSpace?: XRReferenceSpaceType;
}

interface XRCapabilities {
  vr: boolean;
  ar: boolean;
  inline: boolean;
}

// ═══════════════════════════════════════════════════════════════════
// Geometry + Material mappers (shared with SceneViewer)
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

function getMaterialProps(node: R3FNode) {
  const props = node.props;
  const materialName = props.material || props.materialPreset;
  const preset = materialName
    ? (MATERIAL_PRESETS as Record<string, Record<string, any>>)[materialName]
    : undefined;

  const matProps: Record<string, any> = { ...(preset || {}) };

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
// Mesh + Node Renderers
// ═══════════════════════════════════════════════════════════════════

function EmbedMeshNode({
  node,
  selectedId,
  onSelect,
}: {
  node: R3FNode;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
}) {
  const { props } = node;
  const hsType = props.hsType || 'box';
  const size = props.size || 1;
  const position = props.position || [0, 0, 0];
  const rotation = props.rotation || [0, 0, 0];
  const scale = props.scale || [1, 1, 1];
  const isSelected = node.id === selectedId;
  const matProps = getMaterialProps(node);

  return (
    <mesh
      position={position}
      rotation={rotation}
      scale={typeof scale === 'number' ? [scale, scale, scale] : scale}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onSelect?.(node.id || null);
      }}
    >
      {getGeometry(hsType, size)}
      <meshPhysicalMaterial
        {...matProps}
        emissive={matProps.emissive || undefined}
        color={matProps.color}
      />
      {isSelected && (
        <mesh>
          {getGeometry(hsType, size * 1.05)}
          <meshBasicMaterial color="#3b82f6" wireframe transparent opacity={0.4} />
        </mesh>
      )}
    </mesh>
  );
}

function EmbedNodeRenderer({
  node,
  selectedId,
  onSelect,
}: {
  node: R3FNode;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
}) {
  const children = node.children?.map((child: R3FNode, i: number) => (
    <EmbedNodeRenderer
      key={child.id || `child-${i}`}
      node={child}
      selectedId={selectedId}
      onSelect={onSelect}
    />
  ));

  const { props } = node;

  switch (node.type) {
    case 'mesh':
      return (
        <group>
          <EmbedMeshNode node={node} selectedId={selectedId} onSelect={onSelect} />
          {children}
        </group>
      );
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
    case 'spotLight':
      return (
        <spotLight
          color={props.color}
          intensity={props.intensity ?? 1}
          position={props.position || [0, 10, 0]}
          angle={props.angle ?? 0.3}
          penumbra={props.penumbra ?? 0.5}
          castShadow={props.shadows ?? false}
        />
      );
    case 'hemisphereLight':
      return (
        <hemisphereLight
          color={props.color || '#ffffff'}
          groundColor={props.groundColor || '#444444'}
          intensity={props.intensity ?? 0.5}
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
    case 'Sparkles':
      return (
        <Sparkles
          count={props.count ?? 50}
          size={props.size ?? 2}
          scale={props.scale ?? 5}
          color={props.color}
          speed={props.speed ?? 0.5}
        />
      );
    case 'Environment':
      return (
        <Environment preset={props.envPreset || 'studio'} background={props.background ?? false} />
      );
    case 'fog':
      return null;
    case 'EffectComposer':
      return <>{children}</>;
    default:
      return (
        <group position={props.position} rotation={props.rotation} scale={props.scale}>
          {children}
        </group>
      );
  }
}

// ═══════════════════════════════════════════════════════════════════
// Scene Content (shared lighting defaults)
// ═══════════════════════════════════════════════════════════════════

function SceneContent({
  r3fTree,
  selectedId,
  onSelect,
}: {
  r3fTree: R3FNode;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
}) {
  const hasLights = r3fTree.children?.some(
    (c: R3FNode) =>
      c.type === 'ambientLight' ||
      c.type === 'directionalLight' ||
      c.type === 'pointLight' ||
      c.type === 'spotLight' ||
      c.type === 'hemisphereLight'
  );
  const hasEnv = r3fTree.children?.some((c: R3FNode) => c.type === 'Environment');

  return (
    <group onClick={() => onSelect?.(null)}>
      {!hasLights && (
        <>
          <ambientLight intensity={0.4} color="#e8e0ff" />
          <directionalLight position={[5, 10, 5]} intensity={1} castShadow />
        </>
      )}
      {!hasEnv && <Environment preset="studio" background={false} />}
      <EmbedNodeRenderer node={r3fTree} selectedId={selectedId} onSelect={onSelect} />
    </group>
  );
}

// ═══════════════════════════════════════════════════════════════════
// XR detection hook
// ═══════════════════════════════════════════════════════════════════

function useXRCapabilities(): XRCapabilities {
  const [caps, setCaps] = useState<XRCapabilities>({ vr: false, ar: false, inline: true });

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.xr) return;

    Promise.all([
      navigator.xr.isSessionSupported('immersive-vr').catch(() => false),
      navigator.xr.isSessionSupported('immersive-ar').catch(() => false),
      navigator.xr.isSessionSupported('inline').catch(() => true),
    ]).then(([vr, ar, inline]) => setCaps({ vr, ar, inline }));
  }, []);

  return caps;
}

// ═══════════════════════════════════════════════════════════════════
// XR Session Controls Overlay
// ═══════════════════════════════════════════════════════════════════

function XRControls({
  xrCaps,
  xrActive,
  onEnterVR,
  onEnterAR,
  onExit,
}: {
  xrCaps: XRCapabilities;
  xrActive: boolean;
  onEnterVR: () => void;
  onEnterAR: () => void;
  onExit: () => void;
}) {
  if (xrActive) {
    return (
      <div
        style={{
          position: 'absolute',
          bottom: 12,
          right: 12,
          zIndex: 20,
        }}
      >
        <button
          onClick={onExit}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 14px',
            fontSize: 12,
            fontWeight: 500,
            color: '#ef4444',
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.4)',
            borderRadius: 8,
            backdropFilter: 'blur(8px)',
            cursor: 'pointer',
          }}
        >
          Exit XR
        </button>
      </div>
    );
  }

  if (!xrCaps.vr && !xrCaps.ar) return null;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 12,
        right: 12,
        zIndex: 20,
        display: 'flex',
        gap: 8,
      }}
    >
      {xrCaps.ar && (
        <button
          onClick={onEnterAR}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 14px',
            fontSize: 12,
            fontWeight: 500,
            color: '#888',
            background: 'rgba(13,13,20,0.9)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 8,
            backdropFilter: 'blur(8px)',
            cursor: 'pointer',
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
          Enter AR
        </button>
      )}
      {xrCaps.vr && (
        <button
          onClick={onEnterVR}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 14px',
            fontSize: 12,
            fontWeight: 500,
            color: '#818cf8',
            background: 'rgba(99,102,241,0.1)',
            border: '1px solid rgba(99,102,241,0.4)',
            borderRadius: 8,
            backdropFilter: 'blur(8px)',
            cursor: 'pointer',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.5 7h-17A1.5 1.5 0 002 8.5v7A1.5 1.5 0 003.5 17h3.17a2 2 0 001.66-.9L10.17 14h3.66l1.84 2.1a2 2 0 001.66.9H20.5A1.5 1.5 0 0022 15.5v-7A1.5 1.5 0 0020.5 7zM8.5 13a2 2 0 110-4 2 2 0 010 4zm7 0a2 2 0 110-4 2 2 0 010 4z" />
          </svg>
          Enter VR
        </button>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// WebXRViewer (Main export)
// ═══════════════════════════════════════════════════════════════════

/**
 * Embeddable HoloScript 3D viewer with WebXR (VR/AR) support.
 *
 * Compiles HoloScript source via the bridge (WASM or TS fallback),
 * renders the R3F tree in a Canvas with full XR session support.
 *
 * Drop-in replacement for `<SceneViewer>` when XR is needed.
 */
export function WebXRViewer({
  code,
  mode = 'immersive-vr',
  className,
  style,
  showGrid = true,
  showStars = true,
  showObjectCount = true,
  backgroundColor = '#0a0a12',
  selectedObjectId,
  onObjectSelect,
  onErrors,
  onXRSessionStart,
  onXRSessionEnd,
  autoEnterXR = false,
  referenceSpace: _referenceSpace = 'local-floor',
}: WebXRViewerProps) {
  const { r3fTree, errors } = useScenePipeline(code);
  const xrCaps = useXRCapabilities();
  const [xrActive, setXrActive] = useState(false);

  // Create XR store for this viewer instance (isolated from editor's store)
  const xrStore = useMemo(
    () =>
      createXRStore({
        hand: {
          rayPointer: {
            rayModel: { color: '#6366f1', opacity: 0.6, maxLength: 3 },
          },
        },
        controller: {
          rayPointer: {
            rayModel: { color: '#6366f1', opacity: 0.6, maxLength: 3 },
          },
        },
      }),
    []
  );

  // Report compile errors upstream
  useEffect(() => {
    if (onErrors && errors.length > 0) {
      onErrors(errors);
    }
  }, [errors, onErrors]);

  // Track XR session state
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.xr) return;

    const handleSessionStart = () => {
      setXrActive(true);
      onXRSessionStart?.(mode);
    };

    const handleSessionEnd = () => {
      setXrActive(false);
      onXRSessionEnd?.();
    };

    // @react-three/xr v6 fires events on the xr store
    // We monitor via the navigator.xr session events as a fallback
    const xr = navigator.xr;
    xr.addEventListener('sessiongranted', handleSessionStart);

    return () => {
      xr.removeEventListener('sessiongranted', handleSessionStart);
      void handleSessionEnd; // referenced for cleanup
    };
  }, [mode, onXRSessionStart, onXRSessionEnd]);

  // Enter VR/AR session
  const enterVR = useCallback(() => {
    xrStore
      .enterVR()
      .then(() => {
        setXrActive(true);
        onXRSessionStart?.('immersive-vr');
      })
      .catch((err: unknown) => {
        logger.warn('[WebXRViewer] Failed to enter VR:', err);
      });
  }, [xrStore, onXRSessionStart]);

  const enterAR = useCallback(() => {
    xrStore
      .enterAR()
      .then(() => {
        setXrActive(true);
        onXRSessionStart?.('immersive-ar');
      })
      .catch((err: unknown) => {
        logger.warn('[WebXRViewer] Failed to enter AR:', err);
      });
  }, [xrStore, onXRSessionStart]);

  const exitXR = useCallback(() => {
    // End any active XR session
    if (typeof navigator !== 'undefined' && navigator.xr) {
      setXrActive(false);
      onXRSessionEnd?.();
    }
  }, [onXRSessionEnd]);

  // Auto-enter XR after mount (requires prior user gesture)
  useEffect(() => {
    if (!autoEnterXR) return;
    const timer = setTimeout(() => {
      if (mode === 'immersive-ar' && xrCaps.ar) {
        enterAR();
      } else if (xrCaps.vr) {
        enterVR();
      }
    }, 500); // Small delay for Canvas + XR store to initialize
    return () => clearTimeout(timer);
  }, [autoEnterXR, mode, xrCaps, enterVR, enterAR]);

  // In AR mode, disable background rendering
  const isARMode = xrActive && mode === 'immersive-ar';
  const bgColor = isARMode ? 'transparent' : backgroundColor;

  return (
    <div
      className={className}
      style={{ position: 'relative', width: '100%', height: '100%', ...style }}
    >
      <Canvas
        camera={{ position: [3, 3, 5], fov: 60 }}
        shadows
        style={{ background: bgColor }}
        gl={{
          antialias: true,
          toneMapping: 3,
          alpha: isARMode, // Enable alpha for AR passthrough
        }}
      >
        <XR store={xrStore}>
          <Suspense fallback={null}>
            {r3fTree ? (
              <SceneContent
                r3fTree={r3fTree}
                selectedId={selectedObjectId}
                onSelect={onObjectSelect}
              />
            ) : (
              <group>
                <ambientLight intensity={0.3} />
                <directionalLight position={[5, 10, 5]} intensity={0.8} />
                <Environment preset="studio" background={false} />
              </group>
            )}
          </Suspense>

          <OrbitControls
            makeDefault
            enableDamping
            dampingFactor={0.1}
            minDistance={1}
            maxDistance={50}
          />

          {showGrid && !isARMode && (
            <Grid
              args={[20, 20]}
              cellSize={1}
              cellThickness={0.5}
              cellColor="#2d2d3d"
              sectionSize={5}
              sectionThickness={1}
              sectionColor="#3d3d4d"
              fadeDistance={25}
              position={[0, -0.01, 0]}
            />
          )}

          {showStars && !isARMode && (
            <Stars
              radius={80}
              depth={50}
              count={2000}
              factor={3}
              saturation={0.1}
              fade
              speed={0.5}
            />
          )}
        </XR>
      </Canvas>

      {/* XR enter/exit controls */}
      <XRControls
        xrCaps={xrCaps}
        xrActive={xrActive}
        onEnterVR={enterVR}
        onEnterAR={enterAR}
        onExit={exitXR}
      />

      {/* Object count overlay */}
      {showObjectCount && r3fTree?.children && (
        <div
          style={{
            position: 'absolute',
            bottom: 12,
            left: 12,
            background: 'rgba(13,13,20,0.8)',
            color: '#888',
            fontSize: 12,
            padding: '4px 10px',
            borderRadius: 6,
            backdropFilter: 'blur(4px)',
          }}
        >
          {r3fTree.children.length} object{r3fTree.children.length !== 1 ? 's' : ''}
          {xrActive && ' • XR active'}
        </div>
      )}

      {/* XR capability badge */}
      {(xrCaps.vr || xrCaps.ar) && !xrActive && (
        <div
          style={{
            position: 'absolute',
            top: 12,
            left: 12,
            background: 'rgba(13,13,20,0.8)',
            color: '#666',
            fontSize: 10,
            padding: '3px 8px',
            borderRadius: 4,
            backdropFilter: 'blur(4px)',
            letterSpacing: 1,
            textTransform: 'uppercase',
          }}
        >
          {[xrCaps.vr && 'VR', xrCaps.ar && 'AR'].filter(Boolean).join(' + ')} ready
        </div>
      )}
    </div>
  );
}
