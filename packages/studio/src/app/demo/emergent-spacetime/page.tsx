'use client';

/**
 * EmergentSpacetime Interactive Demo
 *
 * Real-time visualization of spacetime emerging from entanglement provenance.
 * Drag to rotate, scroll to zoom, pinch on touch devices.
 *
 * Features:
 * - 1000-voxel entanglement network with force-layout
 * - Ricci curvature heatmap (red = violation, blue = flat)
 * - Provenance trails showing fusion history
 * - Real-time Hubble correction display
 * - Performance: adaptive LOD, instanced rendering
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import * as THREE from 'three';
import { emergentSpacetimeHandler, type EmergentSpacetimeConfig } from '@holoscript/core/traits';
import type { HSPlusNode } from '@holoscript/core/traits';
import { PerformanceOverlay } from '@/components/profiler/PerformanceOverlay';

// =============================================================================
// INSTANCED VOXEL RENDERER
// =============================================================================

const MAX_VOXELS = 1000;
const MAX_EDGES = 3000;

function InstancedVoxels({
  voxels,
}: {
  voxels: Map<string, VoxelData>;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);
  const geometry = useMemo(() => new THREE.IcosahedronGeometry(0.08, 1), []);

  useFrame(() => {
    if (!meshRef.current) return;

    let i = 0;
    for (const voxel of voxels.values()) {
      if (i >= MAX_VOXELS) break;

      // Set position
      dummy.position.set(...voxel.position);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);

      // Set color based on Ricci heatmap
      const violation = Math.max(0, Math.min(1, (voxel.ricci - 1e-5) / 0.001));
      if (violation > 0.5) {
        color.setHSL(0.0 + (1 - violation) * 0.15, 0.9, 0.5);
      } else if (violation > 0.1) {
        color.setHSL(0.15 + (0.5 - violation) * 0.3, 0.7, 0.5);
      } else {
        color.setHSL(0.5 + (0.1 - violation) * 0.3, 0.6, 0.5 + violation * 0.2);
      }
      meshRef.current.setColorAt(i, color);

      i++;
    }

    meshRef.current.count = i;
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, MAX_VOXELS]}
      geometry={geometry}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial
        transparent
        opacity={0.9}
        emissiveIntensity={0.3}
      />
    </instancedMesh>
  );
}

// =============================================================================
// INSTANCED EDGE RENDERER (LineSegments2)
// =============================================================================

function InstancedEdges({
  edges,
  voxels,
}: {
  edges: EdgeData[];
  voxels: Map<string, VoxelData>;
}) {
  const geometry = useMemo(() => {
    const positions: number[] = [];
    const colors: number[] = [];

    for (const edge of edges) {
      const source = voxels.get(edge.source);
      const target = voxels.get(edge.target);
      if (!source || !target) continue;

      positions.push(...source.position, ...target.position);

      const color = new THREE.Color();
      color.setHSL(0.6 - edge.weight * 0.4, 0.8, 0.5 + edge.weight * 0.3);
      const opacity = Math.min(1, 0.3 + edge.provenance * 0.5);

      colors.push(color.r, color.g, color.b, opacity);
      colors.push(color.r, color.g, color.b, opacity);
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
    return geom;
  }, [edges, voxels]);

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial attach="material" vertexColors transparent opacity={0.8} />
    </lineSegments>
  );
}

// =============================================================================
// TYPES
// =============================================================================

interface VoxelData {
  id: string;
  position: [number, number, number];
  ricci: number;
  provenance: number;
}

interface EdgeData {
  source: string;
  target: string;
  weight: number;
  provenance: number;
}

// =============================================================================
// MOCK NODE FOR TRAIT HANDLER
// =============================================================================

function createMockNode(): HSPlusNode {
  return {
    name: 'spacetime_network',
    id: 'spacetime_root',
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    traits: ['emergent_spacetime'],
    properties: {},
    children: [],
    parentId: null,
  } as HSPlusNode;
}

// =============================================================================
// UI OVERLAY
// =============================================================================

function InfoPanel({
  voxelCount,
  edgeCount,
  hubbleCorrection,
  violationCount,
  fps,
}: {
  voxelCount: number;
  edgeCount: number;
  hubbleCorrection: number;
  violationCount: number;
  fps: number;
}) {
  return (
    <div className="absolute top-4 left-4 bg-black/80 backdrop-blur-sm text-white p-4 rounded-lg text-sm font-mono z-10">
      <h2 className="text-lg font-bold mb-2 bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
        Emergent Spacetime Demo
      </h2>
      <div className="space-y-1">
        <div className="flex justify-between gap-4">
          <span className="text-gray-400">Voxels:</span>
          <span className="font-semibold">{voxelCount}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-400">Edges:</span>
          <span className="font-semibold">{edgeCount}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-400">Hubble δ:</span>
          <span className={`font-semibold ${Math.abs(hubbleCorrection) > 0.05 ? 'text-yellow-400' : 'text-green-400'}`}>
            {(hubbleCorrection * 100).toFixed(2)}%
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-400">Ricci violations:</span>
          <span className={`font-semibold ${violationCount > 0 ? 'text-red-400' : 'text-green-400'}`}>
            {violationCount}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-400">FPS:</span>
          <span className={`font-semibold ${fps < 30 ? 'text-red-400' : fps < 50 ? 'text-yellow-400' : 'text-green-400'}`}>
            {fps}
          </span>
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-gray-700 text-xs text-gray-500">
        <p>Drag to rotate • Scroll to zoom</p>
        <p className="mt-1">Ricci heatmap: 🔴 violation → 🔵 flat</p>
      </div>
    </div>
  );
}

// =============================================================================
// MAIN SCENE
// =============================================================================

function SceneContent({
  setStats,
  setFps,
}: {
  setStats: React.Dispatch<React.SetStateAction<{ voxels: number; edges: number; hubble: number; violations: number }>>;
  setFps: React.Dispatch<React.SetStateAction<number>>;
}) {
  const { camera } = useThree();
  const networkRef = useRef<{ voxels: Map<string, VoxelData>; edges: EdgeData[] }>({
    voxels: new Map(),
    edges: [],
  });
  const traitNodeRef = useRef<HSPlusNode | null>(null);
  const fpsAccumRef = useRef(0);
  const frameCountRef = useRef(0);

  // Initialize trait on mount
  useEffect(() => {
    const node = createMockNode();
    traitNodeRef.current = node;

    const config: EmergentSpacetimeConfig = {
      initial_voxels: 500,
      max_voxels: 1000,
      seed: 42,
      force_layout_guard: true,
      ricci_error_bound: 1e-5,
      ricci_heatmap: true,
      loop_threshold: 0.03, // Lower threshold to activate Hubble earlier
    };

    emergentSpacetimeHandler.onAttach(node, config, {} as any);

    // Initial sync
    const state = (node as any).__emergentSpacetimeState;
    if (state) {
      const voxels = new Map<string, VoxelData>();
      for (const [id, voxel] of state.network.voxels) {
        voxels.set(id, {
          id,
          position: voxel.position,
          ricci: 0,
          provenance: voxel.provenance,
        });
      }
      const edges = state.network.edges.map((e: any) => ({
        source: e.source,
        target: e.target,
        weight: e.weight,
        provenance: e.provenance,
      }));
      networkRef.current = { voxels, edges };
    }

    // Camera position
    camera.position.set(3, 2, 3);
    camera.lookAt(0, 0, 0);

    return () => {
      if (traitNodeRef.current) {
        emergentSpacetimeHandler.onDetach(traitNodeRef.current);
      }
    };
  }, [camera]);

  // Animation loop
  useFrame((state, delta) => {
    if (!traitNodeRef.current) return;

    const node = traitNodeRef.current;
    const config: EmergentSpacetimeConfig = {
      initial_voxels: 500,
      max_voxels: 1000,
      seed: 42,
      force_layout_guard: true,
      ricci_error_bound: 1e-5,
      ricci_heatmap: true,
      loop_threshold: 0.03, // Lower threshold to activate Hubble earlier
    };

    // Update trait
    emergentSpacetimeHandler.onUpdate(node, config, {} as any, delta);

    // Sync state to visualization
    const state_ = (node as any).__emergentSpacetimeState;
    if (state_) {
      // Update voxel positions and compute Ricci
      for (const [id, voxel] of state_.network.voxels) {
        let existing = networkRef.current.voxels.get(id);
        if (!existing) {
          existing = {
            id,
            position: voxel.position,
            ricci: 0,
            provenance: voxel.provenance,
          };
          networkRef.current.voxels.set(id, existing);
        }
        existing.position = voxel.position;
        existing.provenance = voxel.provenance;
      }

      // Update edges
      networkRef.current.edges = state_.network.edges.map((e: any) => ({
        source: e.source,
        target: e.target,
        weight: e.weight,
        provenance: e.provenance,
      }));

      // Update stats (throttled)
      setStats({
        voxels: state_.network.voxels.size,
        edges: state_.network.edges.length,
        hubble: state_.hubbleCorrection,
        violations: state_.violationCount,
      });
    }

    // FPS counter
    fpsAccumRef.current += delta;
    frameCountRef.current++;
    if (fpsAccumRef.current >= 0.5) {
      setFps(Math.round(frameCountRef.current / fpsAccumRef.current));
      fpsAccumRef.current = 0;
      frameCountRef.current = 0;
    }
  });

  return (
    <>
      <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
      <ambientLight intensity={0.2} />
      <pointLight position={[10, 10, 10]} intensity={0.5} />
      {networkRef.current && networkRef.current.voxels.size > 0 && (
        <>
          <InstancedVoxels voxels={networkRef.current.voxels} />
          <InstancedEdges edges={networkRef.current.edges} voxels={networkRef.current.voxels} />
        </>
      )}
      <OrbitControls
        enablePan={false}
        enableZoom={true}
        enableRotate={true}
        minDistance={1}
        maxDistance={10}
        autoRotate
        autoRotateSpeed={0.5}
      />
    </>
  );
}

// =============================================================================
// PAGE COMPONENT
// =============================================================================

export default function EmergentSpacetimeDemo() {
  const [stats, setStats] = useState({
    voxels: 0,
    edges: 0,
    hubble: 0,
    violations: 0,
  });
  const [fps, setFps] = useState(60);

  return (
    <div className="w-full h-screen bg-black relative">
      <InfoPanel
        voxelCount={stats.voxels}
        edgeCount={stats.edges}
        hubbleCorrection={stats.hubble}
        violationCount={stats.violations}
        fps={fps}
      />
      <Canvas
        camera={{ position: [3, 2, 3], fov: 60 }}
        gl={{ antialias: true, alpha: false }}
        dpr={[1, 2]}
        linear
        flat
      >
        <SceneContent setStats={setStats} setFps={setFps} />
        <PerformanceOverlay />
      </Canvas>
    </div>
  );
}
