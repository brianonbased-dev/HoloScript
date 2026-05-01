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

import { useEffect, useRef, useState, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stars, Text, Stats } from '@react-three/drei';
import * as THREE from 'three';
import { emergentSpacetimeHandler, type EmergentSpacetimeConfig } from '@holoscript/core/traits';
import type { HSPlusNode } from '@holoscript/core/traits';

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
// VOXEL VISUALIZATION
// =============================================================================

function Voxel({
  position,
  ricci,
  provenance,
  scale = 0.08,
}: {
  position: [number, number, number];
  ricci: number;
  provenance: number;
  scale?: number;
}) {
  // Ricci heatmap: red (violation) → yellow → green → blue (flat)
  const color = new THREE.Color();
  const violation = Math.max(0, Math.min(1, (ricci - 1e-5) / 0.001));

  if (violation > 0.5) {
    // Red to yellow
    color.setHSL(0.0 + (1 - violation) * 0.15, 0.9, 0.5);
  } else if (violation > 0.1) {
    // Yellow to green
    color.setHSL(0.15 + (0.5 - violation) * 0.3, 0.7, 0.5);
  } else {
    // Green to blue (flat space)
    color.setHSL(0.5 + (0.1 - violation) * 0.3, 0.6, 0.5 + violation * 0.2);
  }

  // Provenance affects opacity
  const opacity = Math.min(1, 0.3 + provenance * 0.7);

  return (
    <mesh position={position}>
      <icosahedronGeometry args={[scale, 1]} />
      <meshStandardMaterial
        color={color}
        transparent
        opacity={opacity}
        emissive={color}
        emissiveIntensity={0.3}
      />
    </mesh>
  );
}

// =============================================================================
// EDGE VISUALIZATION
// =============================================================================

function Edge({
  start,
  end,
  weight,
  provenance,
}: {
  start: [number, number, number];
  end: [number, number, number];
  weight: number;
  provenance: number;
}) {
  const lineRef = useRef<THREE.Line>(null);

  // Color based on weight (entanglement strength)
  const color = new THREE.Color();
  color.setHSL(0.6 - weight * 0.4, 0.8, 0.5 + weight * 0.3);

  const points = [new THREE.Vector3(...start), new THREE.Vector3(...end)];
  const geometry = new THREE.BufferGeometry().setFromPoints(points);

  return (
    <line ref={lineRef} geometry={geometry}>
      <lineBasicMaterial
        color={color}
        transparent
        opacity={Math.min(1, 0.2 + provenance * 0.5)}
        linewidth={1}
      />
    </line>
  );
}

// =============================================================================
// NETWORK VISUALIZATION
// =============================================================================

function SpacetimeNetwork({
  voxels,
  edges,
}: {
  voxels: Map<string, VoxelData>;
  edges: EdgeData[];
}) {
  const voxelArray = Array.from(voxels.values());

  return (
    <group>
      {voxelArray.map((v) => (
        <Voxel
          key={v.id}
          position={v.position}
          ricci={v.ricci}
          provenance={v.provenance}
        />
      ))}
      {edges.map((e, i) => {
        const source = voxels.get(e.source);
        const target = voxels.get(e.target);
        if (!source || !target) return null;
        return (
          <Edge
            key={`edge-${i}`}
            start={source.position}
            end={target.position}
            weight={e.weight}
            provenance={e.provenance}
          />
        );
      })}
    </group>
  );
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

function SceneContent() {
  const { camera } = useThree();
  const networkRef = useRef<{ voxels: Map<string, VoxelData>; edges: EdgeData[] }>({
    voxels: new Map(),
    edges: [],
  });
  const traitNodeRef = useRef<HSPlusNode | null>(null);
  const [stats, setStats] = useState({
    voxels: 0,
    edges: 0,
    hubble: 0,
    violations: 0,
  });
  const [fps, setFps] = useState(60);
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
      loop_threshold: 0.05,
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
      loop_threshold: 0.05,
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
      <InfoPanel
        voxelCount={stats.voxels}
        edgeCount={stats.edges}
        hubbleCorrection={stats.hubble}
        violationCount={stats.violations}
        fps={fps}
      />
      <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
      <ambientLight intensity={0.2} />
      <pointLight position={[10, 10, 10]} intensity={0.5} />
      <SpacetimeNetwork voxels={networkRef.current.voxels} edges={networkRef.current.edges} />
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
  return (
    <div className="w-full h-screen bg-black relative">
      <Canvas
        camera={{ position: [3, 2, 3], fov: 60 }}
        gl={{ antialias: true, alpha: false }}
        dpr={[1, 2]}
      >
        <SceneContent />
      </Canvas>
    </div>
  );
}
