'use client';

import { Suspense, useState, useCallback, useEffect, useRef } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import {
  OrbitControls,
  Grid,
  Stars,
  Environment,
  TransformControls,
  Stats,
} from '@react-three/drei';
import type { R3FNode } from '@holoscript/core';
import { R3FNodeRenderer } from './R3FNodeRenderer';
import { useEditorStore, useSceneGraphStore } from '@/lib/stores';
import type { SceneNode, GizmoMode } from '@/lib/stores';
import { ASSET_DRAG_TYPE } from '@/components/assets/AssetLibrary';
import type { Asset } from '@/components/assets/useAssetStore';
import { VREditSession, xrStore } from '@/components/vr/VREditSession';
import { PerformanceOverlay } from '@/components/profiler/PerformanceOverlay';
import { PhysicsProvider } from '@/components/physics/PhysicsProvider';
import { PhysicsDebugOverlay } from '@/components/physics/PhysicsDebugOverlay';
import { usePhysicsStore } from '@/lib/physicsStore';
import { SketchCanvas } from '@/components/sketch/SketchCanvas';
import { SketchToolbar } from '@/components/sketch/SketchToolbar';
import { useSceneGraphSync } from '@/hooks/useSceneGraphSync';
import { useBuilderStore, snapToGrid } from '@/lib/stores/builderStore';
import { BuilderHotbar } from '@/components/builder/BuilderHotbar';
import { ContentCameraUI, ContentCameraCapture } from '@/components/camera/ContentCameraUI';
import { usePipelineMaturitySync } from '@/hooks/usePipelineMaturitySync';
import { useStudioBus } from '@/hooks/useStudioBus';
import { usePerformanceRegression, ProgressiveLoader } from '@holoscript/r3f-renderer';
import { LODManager } from '@holoscript/core';
import * as THREE from 'three';

/**
 * Subset of LODMetrics from @holoscript/core that we consume here.
 * Defined locally because the hand-crafted dist/index.d.ts does not export it.
 */
interface LODMetricsResult {
  totalObjects: number;
  objectsPerLevel: Map<number, number>;
  trianglesRendered: number;
  trianglesSaved: number;
}

interface SceneRendererProps {
  r3fTree: R3FNode | null;
  profilerOpen?: boolean;
}

function SceneContent({ r3fTree }: { r3fTree: R3FNode }) {
  const setSelectedId = useEditorStore((s) => s.setSelectedObjectId);

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
    <group onClick={() => setSelectedId(null)}>
      {!hasLights && (
        <>
          <ambientLight intensity={0.4} color="#e8e0ff" />
          <directionalLight
            position={[5, 10, 5]}
            intensity={1}
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
            shadow-camera-near={0.1}
            shadow-camera-far={50}
            shadow-camera-left={-10}
            shadow-camera-right={10}
            shadow-camera-top={10}
            shadow-camera-bottom={-10}
            shadow-bias={-0.0001}
          />
        </>
      )}
      {!hasEnv && <Environment preset="apartment" background={false} />}
      <R3FNodeRenderer node={r3fTree} />
    </group>
  );
}

function EmptyScene() {
  return (
    <group>
      <ambientLight intensity={0.3} />
      <directionalLight position={[5, 10, 5]} intensity={0.8} />
      <Environment preset="studio" background={false} />
    </group>
  );
}

// ─── Gizmo Controller ─────────────────────────────────────────────────────────

/**
 * GizmoController — attaches drei TransformControls to the selected mesh.
 * Traverses the R3F scene to find the Object3D tagged with userData.nodeId.
 */

function GizmoController() {
  const { scene } = useThree();
  const selectedId = useEditorStore((s) => s.selectedObjectId);
  const gizmoMode = useEditorStore((s) => s.gizmoMode);
  const updateNodeTransform = useSceneGraphStore((s) => s.updateNodeTransform);
  const gridSnap = useBuilderStore((s) => s.gridSnap);
  const gridSize = useBuilderStore((s) => s.gridSize);
  const controlsRef = useRef<{ detach: () => void } | null>(null);

  // Find the Three.js object whose userData.nodeId matches the selection
  const target: THREE.Object3D | null = selectedId
    ? (() => {
        let found: THREE.Object3D | null = null;
        scene.traverse((obj: THREE.Object3D) => {
          if (!found && obj.userData?.nodeId === selectedId) found = obj as THREE.Object3D;
        });
        return found;
      })()
    : null;

  const handleChange = useCallback(() => {
    if (!target || !selectedId) return;
    const t = target as THREE.Object3D;
    updateNodeTransform(selectedId, {
      position: [t.position.x, t.position.y, t.position.z],
      rotation: [t.rotation.x, t.rotation.y, t.rotation.z],
      scale: [t.scale.x, t.scale.y, t.scale.z],
    });
  }, [target, selectedId, updateNodeTransform]);

  if (!target) return null;
  return (
    <TransformControls
      ref={controlsRef}
      object={target}
      mode={gizmoMode as 'translate' | 'rotate' | 'scale'}
      translationSnap={gridSnap ? gridSize : undefined}
      rotationSnap={gridSnap ? Math.PI / 12 : undefined}
      scaleSnap={gridSnap ? 0.25 : undefined}
      onMouseUp={handleChange}
    />
  );
}

// ─── Placement System ────────────────────────────────────────────────────────

/**
 * GhostPreview — semi-transparent shape that follows the mouse on the ground
 */
function GhostPreview({ position }: { position: [number, number, number] }) {
  const activeShape = useBuilderStore((s) => s.hotbarSlots[s.activeSlot]);
  const builderMode = useBuilderStore((s) => s.builderMode);

  if (builderMode !== 'place') return null;

  const getGhostGeometry = () => {
    switch (activeShape.geometry) {
      case 'sphere':
        return <sphereGeometry args={[0.5, 32, 32]} />;
      case 'cylinder':
        return <cylinderGeometry args={[0.5, 0.5, 1, 32]} />;
      case 'cone':
        return <coneGeometry args={[0.5, 1, 4]} />;
      case 'torus':
        return <torusGeometry args={[0.5, 0.15, 16, 32]} />;
      case 'capsule':
        return <capsuleGeometry args={[0.3, 0.5, 4, 16]} />;
      case 'plane':
        return <planeGeometry args={[1, 1]} />;
      case 'ring':
        return <ringGeometry args={[0.3, 0.5, 32]} />;
      default:
        return <boxGeometry args={[1, 1, 1]} />;
    }
  };

  return (
    <mesh position={position}>
      {getGhostGeometry()}
      <meshBasicMaterial color={activeShape.color} transparent opacity={0.35} wireframe={false} />
    </mesh>
  );
}

/**
 * PlacementPlane — invisible ground plane for click-to-place.
 * In 'place' mode: click → create shape at snapped grid position.
 * In 'break' mode: handled by MeshNode.
 */
function PlacementPlane() {
  const builderMode = useBuilderStore((s) => s.builderMode);
  const gridSnap = useBuilderStore((s) => s.gridSnap);
  const gridSize = useBuilderStore((s) => s.gridSize);
  const addNode = useSceneGraphStore((s) => s.addNode);
  const getActiveShape = useBuilderStore((s) => s.getActiveShape);
  const [ghostPos, setGhostPos] = useState<[number, number, number]>([0, 0.5, 0]);

  const handlePointerMove = useCallback(
    (e: any) => {
      if (builderMode !== 'place') return;
      e.stopPropagation();
      const point = e.point as THREE.Vector3;
      const x = gridSnap ? snapToGrid(point.x, gridSize) : point.x;
      const z = gridSnap ? snapToGrid(point.z, gridSize) : point.z;
      setGhostPos([x, 0.5, z]);
    },
    [builderMode, gridSnap, gridSize]
  );

  const handleClick = useCallback(
    (e: any) => {
      if (builderMode !== 'place') return;
      e.stopPropagation();
      const shape = getActiveShape();
      const point = e.point as THREE.Vector3;
      const x = gridSnap ? snapToGrid(point.x, gridSize) : point.x;
      const z = gridSnap ? snapToGrid(point.z, gridSize) : point.z;
      const nodeId = `placed-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      addNode({
        id: nodeId,
        name: `${shape.label}-${nodeId.slice(-4)}`,
        type: 'mesh',
        parentId: null,
        traits: [],
        position: [x, 0.5, z],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      });
    },
    [builderMode, gridSnap, gridSize, addNode, getActiveShape]
  );

  return (
    <>
      {/* Invisible ground plane for raycasting */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        onPointerMove={handlePointerMove}
        onClick={handleClick}
        visible={false}
      >
        <planeGeometry args={[100, 100]} />
        <meshBasicMaterial />
      </mesh>
      <GhostPreview position={ghostPos} />
    </>
  );
}

// ─── Category → node type + trait mapping ────────────────────────────────────

function assetToNodeType(category: Asset['category']): SceneNode['type'] {
  if (category === 'splat') return 'splat';
  if (category === 'audio') return 'audio';
  if (category === 'model') return 'mesh';
  return 'mesh';
}

function assetToTrait(asset: Asset): { name: string; properties: Record<string, unknown> } | null {
  switch (asset.category) {
    case 'splat':
      return {
        name: 'gaussian_splat',
        properties: { source: asset.src, quality: 'medium', sh_degree: 3 },
      };
    case 'audio':
      return {
        name: 'audio_source',
        properties: { src: asset.src, volume: 1.0, loop: false, spatial: true },
      };
    case 'hdri':
      return { name: 'environment', properties: { src: asset.src } };
    default:
      return null;
  }
}

// ─── Physics wrapper (only mounts Rapier when physics enabled) ───────────────

function PhysicsProviderWrapper() {
  const physicsEnabled = usePhysicsStore((s) => s.physicsEnabled);
  if (!physicsEnabled) return null;
  return (
    <>
      <PhysicsProvider />
      <PhysicsDebugOverlay />
    </>
  );
}

// ─── LOD Controller (lives inside Canvas for useFrame/useThree access) ──────

/** Shared LOD metrics snapshot, updated each frame by LODController */
interface LODMetricsSnapshot {
  levelDistribution: [number, number, number, number];
  totalTriangles: number;
  entityCount: number;
}

const DEFAULT_LOD_SNAPSHOT: LODMetricsSnapshot = {
  levelDistribution: [0, 0, 0, 0],
  totalTriangles: 0,
  entityCount: 0,
};

/**
 * LODController — runs inside the Canvas to access useFrame/useThree.
 * Initializes an LODManager, syncs registered scene objects each frame,
 * and writes metrics to a shared ref so the outer SceneRenderer can read them.
 */
function LODController({
  r3fTree,
  metricsRef,
}: {
  r3fTree: R3FNode | null;
  metricsRef: React.MutableRefObject<LODMetricsSnapshot>;
}) {
  const { camera, scene } = useThree();
  const managerRef = useRef<LODManager | null>(null);
  const registeredIdsRef = useRef<Set<string>>(new Set());
  // Throttle LOD updates to ~30 Hz (every ~33ms) to keep render loop fast
  const lastUpdateRef = useRef(0);
  const UPDATE_INTERVAL_MS = 33;

  // Lazily create the LODManager once
  // Cast needed: dist/index.d.ts declares constructor() but source accepts options
  if (!managerRef.current) {
    const Ctor = LODManager as unknown as new (opts: Record<string, unknown>) => LODManager;
    managerRef.current = new Ctor({
      autoUpdate: false,
      collectMetrics: true,
      cameraFOV: 60,
      targetFrameRate: 60,
      updateFrequency: 30,
    });
    managerRef.current.start();
  }

  // Sync registered objects when the R3F tree changes
  useEffect(() => {
    const mgr = managerRef.current;
    if (!mgr || !r3fTree) return;

    const currentIds = new Set<string>();

    // Walk the tree and register any mesh node that has LOD config
    const walk = (node: R3FNode) => {
      if (
        node.type === 'mesh' &&
        node.id &&
        (node.props.lod || node.props.lodDistances || node.props.lodEnabled || node.props.lodConfig)
      ) {
        currentIds.add(node.id);

        if (!registeredIdsRef.current.has(node.id)) {
          const distances = (node.props.lodDistances as number[]) ?? [0, 25, 50, 100];
          mgr.register(node.id, {
            id: node.id,
            levels: distances.map((d, i) => ({
              level: i,
              distance: d,
              triangleCount: Math.round(10000 / (i + 1)),
              polygonRatio: 1 / (i + 1),
              textureScale: 1 - i * 0.25,
              disabledFeatures: [] as string[],
            })),
          });
          mgr.updatePosition(
            node.id,
            (node.props.position as [number, number, number]) ?? [0, 0, 0],
          );
        }
      }

      if (node.children) {
        for (const child of node.children) {
          walk(child);
        }
      }
    };

    walk(r3fTree);

    // Unregister objects that disappeared from the tree
    for (const oldId of registeredIdsRef.current) {
      if (!currentIds.has(oldId)) {
        mgr.unregister(oldId);
      }
    }

    registeredIdsRef.current = currentIds;
  }, [r3fTree]);

  // Also register all scene meshes (non-LOD) so we track total entity count
  // but only LOD-tagged nodes get full LOD config above.

  useFrame((_state, delta) => {
    const mgr = managerRef.current;
    if (!mgr) return;

    // Throttle: skip if not enough time has passed
    const now = performance.now();
    if (now - lastUpdateRef.current < UPDATE_INTERVAL_MS) return;
    lastUpdateRef.current = now;

    // Feed camera position to the manager
    const camPos: [number, number, number] = [
      camera.position.x,
      camera.position.y,
      camera.position.z,
    ];
    mgr.setCameraPosition(camPos);

    // Update object positions from the live scene graph
    scene.traverse((obj: THREE.Object3D) => {
      if (obj.userData?.nodeId && registeredIdsRef.current.has(obj.userData.nodeId as string)) {
        mgr.updatePosition(obj.userData.nodeId as string, [
          obj.position.x,
          obj.position.y,
          obj.position.z,
        ]);
      }
    });

    // Run LOD selection
    mgr.update(delta);

    // Collect metrics and write to shared ref (no React state — avoids re-renders)
    const metrics = mgr.getMetrics() as LODMetricsResult;
    const dist: [number, number, number, number] = [0, 0, 0, 0];
    for (const [level, count] of metrics.objectsPerLevel) {
      if (level >= 0 && level < 4) {
        dist[level] = count;
      }
    }

    metricsRef.current = {
      levelDistribution: dist,
      totalTriangles: metrics.trianglesRendered,
      entityCount: metrics.totalObjects,
    };
  });

  return null; // Pure logic component — no visual output
}

// ─── Main renderer with drop zone ────────────────────────────────────────────

export function SceneRenderer({ r3fTree, profilerOpen = false }: SceneRendererProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const addNode = useSceneGraphStore((s) => s.addNode);
  const addTrait = useSceneGraphStore((s) => s.addTrait);
  const selectedId = useEditorStore((s) => s.selectedObjectId);
  const gizmoMode = useEditorStore((s) => s.gizmoMode);
  const setGizmoMode = useEditorStore((s) => s.setGizmoMode);
  const artMode = useEditorStore((s) => s.artMode);
  const showPerfOverlay = useEditorStore((s) => s.showPerfOverlay);

  // Shared ref for LODController → bus bridge (no re-renders on metric ticks)
  const lodMetricsRef = useRef<LODMetricsSnapshot>(DEFAULT_LOD_SNAPSHOT);

  // Sync R3F tree → scene graph store (flattens nested native asset children)
  useSceneGraphSync(r3fTree);

  // Gap 3: Pipeline maturity events → scene graph store
  usePipelineMaturitySync();

  // Gap 5: Performance regression monitor → bus events for LODMetricsPanel
  const perfResult = usePerformanceRegression({
    thresholdMs: 9.0,
    windowSize: 60,
  });

  // Perf → bus bridge: emit lodMetrics:tick so LODMetricsPanel receives real data
  const { emit: emitBus } = useStudioBus();
  const lastEmitRef = useRef(0);
  useEffect(() => {
    // Throttle to ~60Hz (every 16ms) to avoid flooding the bus
    const now = Date.now();
    if (now - lastEmitRef.current < 16) return;
    lastEmitRef.current = now;

    const lodSnap = lodMetricsRef.current;
    emitBus('lodMetrics:tick', {
      timestamp: now,
      avgFrameTimeMs: perfResult.avgFrameTimeMs,
      isRegressed: perfResult.isRegressed,
      levelDistribution: lodSnap.levelDistribution,
      totalTriangles: lodSnap.totalTriangles,
      entityCount: lodSnap.entityCount,
      regressionCount: perfResult.regressionCount,
      recoveryCount: perfResult.recoveryCount,
    });
  });

  // ─── XR support detection ──────────────────────────────────────────────────
  const [xrSupport, setXrSupport] = useState<{ vr: boolean; ar: boolean }>({
    vr: false,
    ar: false,
  });

  useEffect(() => {
    if (!navigator.xr) return;
    Promise.all([
      navigator.xr.isSessionSupported('immersive-vr').catch(() => false),
      navigator.xr.isSessionSupported('immersive-ar').catch(() => false),
    ]).then(([vr, ar]) => setXrSupport({ vr, ar }));
  }, []);

  // ─── Asset drag/drop ────────────────────────────────────────────────────────

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes(ASSET_DRAG_TYPE)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      const raw = e.dataTransfer.getData(ASSET_DRAG_TYPE);
      if (!raw) return;

      try {
        const asset = JSON.parse(raw) as Asset;
        const nodeId = `dropped-${Date.now()}`;
        const node: SceneNode = {
          id: nodeId,
          name: asset.name,
          type: assetToNodeType(asset.category),
          parentId: null,
          traits: [],
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        };
        addNode(node);

        const trait = assetToTrait(asset);
        if (trait) addTrait(nodeId, trait);
      } catch {
        // ignore malformed drag data
      }
    },
    [addNode, addTrait]
  );

  return (
    <div
      className="relative h-full w-full"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <Canvas
        camera={{ position: [3, 3, 5], fov: 60 }}
        shadows
        style={{ background: '#0a0a12' }}
        gl={{
          antialias: true,
          toneMapping: 4, // ACESFilmicToneMapping
          toneMappingExposure: 1.0,
          outputColorSpace: 'srgb',
        }}
      >
        <Suspense fallback={null}>
          {r3fTree ? <SceneContent r3fTree={r3fTree} /> : <EmptyScene />}
        </Suspense>

        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.1}
          minDistance={1}
          maxDistance={50}
        />

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

        <Stars radius={80} depth={50} count={2000} factor={3} saturation={0.1} fade speed={0.5} />

        {/* VR edit session — active when XR is running */}
        <VREditSession />

        {/* Physics world + debug wireframes */}
        <PhysicsProviderWrapper />

        {/* Performance profiler overlay */}
        <PerformanceOverlay open={profilerOpen || showPerfOverlay} />

        {/* Transform gizmo — must be inside Canvas (now with grid snap) */}
        <GizmoController />

        {/* Placement system — ground plane + ghost preview */}
        <PlacementPlane />

        {/* Sketch mode — freehand 3D strokes */}
        {artMode === 'sketch' && <SketchCanvas />}

        {/* FPS/frame-time stats — shown in dev OR when Perf overlay toggled on */}
        {(process.env.NODE_ENV !== 'production' || showPerfOverlay) && (
          <Stats className="!bottom-2 !left-auto !right-2 !top-auto" />
        )}

        {/* Handles WebM video recording of the Canvas stream */}
        <ContentCameraCapture />

        {/* LOD Manager — updates LOD levels each frame and exposes metrics */}
        <LODController r3fTree={r3fTree} metricsRef={lodMetricsRef} />

        {/* Gap 6: Progressive loader for streaming asset LODs */}
        <ProgressiveLoader entities={[]} visible={true} />
      </Canvas>

      {/* Social Aspect Ratio Overlays & Recording UI */}
      <ContentCameraUI />

      {/* Gizmo mode toolbar — top-left overlay */}
      <div className="absolute left-3 top-3 z-10 flex items-center gap-1 rounded-xl border border-gray-700/60 bg-gray-900/80 p-1 backdrop-blur">
        {(['translate', 'rotate', 'scale'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setGizmoMode(m)}
            className={`rounded-lg px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider transition ${
              gizmoMode === m
                ? 'bg-indigo-500/20 text-indigo-300'
                : 'text-gray-500 hover:text-gray-300'
            }`}
            title={m.charAt(0).toUpperCase() + m.slice(1)}
            aria-label={`${m} mode`}
            aria-pressed={gizmoMode === m}
          >
            {m === 'translate' ? 'Move' : m === 'rotate' ? 'Rotate' : 'Scale'}
          </button>
        ))}
      </div>

      {/* Sketch toolbar — right side overlay when in sketch mode */}
      {artMode === 'sketch' && (
        <div className="absolute right-3 top-16 z-10">
          <SketchToolbar />
        </div>
      )}

      {/* Builder Hotbar — Minecraft-style bottom toolbar */}
      <BuilderHotbar />

      {isDragOver && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded border-2 border-dashed border-studio-accent bg-studio-accent/10 backdrop-blur-[1px]">
          <div className="rounded-xl bg-studio-panel/90 px-6 py-4 text-center shadow-xl">
            <p className="text-base font-semibold text-studio-accent">Drop to place in scene</p>
            <p className="mt-0.5 text-xs text-studio-muted">Asset will be added at origin</p>
          </div>
        </div>
      )}

      {/* Enter VR / AR buttons */}
      {(xrSupport.vr || xrSupport.ar) && (
        <div className="absolute bottom-3 right-3 flex items-center gap-2">
          {xrSupport.ar && (
            <button
              onClick={() => xrStore.enterAR()}
              className="flex items-center gap-1.5 rounded-lg border border-studio-border/60 bg-studio-panel/90 px-3 py-1.5 text-xs font-medium text-studio-muted backdrop-blur transition hover:border-studio-accent hover:text-studio-accent"
            >
              <svg
                className="h-3.5 w-3.5"
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
          {xrSupport.vr && (
            <button
              onClick={() => xrStore.enterVR()}
              className="flex items-center gap-1.5 rounded-lg border border-studio-accent/60 bg-studio-accent/10 px-3 py-1.5 text-xs font-medium text-studio-accent backdrop-blur transition hover:bg-studio-accent hover:text-white"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.5 7h-17A1.5 1.5 0 002 8.5v7A1.5 1.5 0 003.5 17h3.17a2 2 0 001.66-.9L10.17 14h3.66l1.84 2.1a2 2 0 001.66.9H20.5A1.5 1.5 0 0022 15.5v-7A1.5 1.5 0 0020.5 7zM8.5 13a2 2 0 110-4 2 2 0 010 4zm7 0a2 2 0 110-4 2 2 0 010 4z" />
              </svg>
              Enter VR
            </button>
          )}
        </div>
      )}

      {/* Scene info overlay */}
      {r3fTree && r3fTree.children && (
        <div className="absolute bottom-3 left-3 rounded-md bg-studio-panel/80 px-3 py-1.5 text-xs text-studio-muted backdrop-blur">
          {r3fTree.children.length} object{r3fTree.children.length !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}
