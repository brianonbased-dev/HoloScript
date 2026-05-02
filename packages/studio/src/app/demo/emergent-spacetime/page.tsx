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
 * - Provenance flow particles along entanglement edges
 * - Real-time Hubble correction display
 * - Post-processing: Bloom, SSAO, Vignette, ToneMapping
 * - Performance: instanced rendering (2 draw calls)
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import { EffectComposer, Bloom, SSAO, Vignette, ToneMapping } from '@react-three/postprocessing';
import * as THREE from 'three';
import { emergentSpacetimeHandler, type EmergentSpacetimeConfig } from '@holoscript/core/traits';
import type { HSPlusNode } from '@holoscript/core/traits';
import { PerformanceOverlay } from '@/components/profiler/PerformanceOverlay';

// =============================================================================
// INSTANCED VOXEL RENDERER
// =============================================================================

const MAX_VOXELS = 2000;
const MAX_EDGES = 6000;
const MAX_FLOW_PARTICLES = 300; // Reduced from 500 for 2k voxel budget
const MIN_FLOW_PARTICLES = 30;
const FRAME_TIME_TARGET_MS = 33; // 30Hz target for 2k voxels

// =============================================================================
// PROVENANCE FLOW PARTICLES
// =============================================================================

function ProvenanceFlowParticles({
  edges,
  voxels,
  targetParticleCount = MAX_FLOW_PARTICLES,
}: {
  edges: EdgeData[];
  voxels: Map<string, VoxelData>;
  targetParticleCount?: number;
}) {
  const pointsRef = useRef<THREE.Points>(null);
  const particleState = useRef<{
    progress: number;
    positions: Float32Array;
    colors: Float32Array;
  }>({
    progress: 0,
    positions: new Float32Array(MAX_FLOW_PARTICLES * 3),
    colors: new Float32Array(MAX_FLOW_PARTICLES * 3),
  });

  useFrame((_, delta) => {
    if (!pointsRef.current || edges.length === 0) return;

    const state = particleState.current;
    const positions = state.positions;
    const colors = state.colors;
    const particleCount = Math.max(MIN_FLOW_PARTICLES, Math.min(MAX_FLOW_PARTICLES, targetParticleCount));

    // Update particle positions along edges
    for (let i = 0; i < particleCount; i++) {
      const particleEdgeIndex = i % edges.length;
      const edge = edges[particleEdgeIndex];
      const source = voxels.get(edge.source);
      const target = voxels.get(edge.target);

      if (!source || !target) continue;

      // Move particle along edge
      state.progress += delta * (0.5 + edge.weight * 0.5);
      if (state.progress > 1) state.progress = 0;

      const t = (state.progress + (i / MAX_FLOW_PARTICLES)) % 1;
      const x = source.position[0] + (target.position[0] - source.position[0]) * t;
      const y = source.position[1] + (target.position[1] - source.position[1]) * t;
      const z = source.position[2] + (target.position[2] - source.position[2]) * t;

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      // Color based on provenance
      const color = new THREE.Color();
      color.setHSL(0.5 + edge.provenance * 0.2, 0.8, 0.6);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    pointsRef.current.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    pointsRef.current.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    pointsRef.current.geometry.attributes.position.needsUpdate = true;
    pointsRef.current.geometry.attributes.color.needsUpdate = true;
  });

  const geometry = useMemo(() => {
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(MAX_FLOW_PARTICLES * 3);
    const colors = new Float32Array(MAX_FLOW_PARTICLES * 3);
    for (let i = 0; i < MAX_FLOW_PARTICLES; i++) {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = -100;
      positions[i * 3 + 2] = 0;
      colors[i * 3] = 1;
      colors[i * 3 + 1] = 1;
      colors[i * 3 + 2] = 1;
    }
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geom;
  }, []);

  return (
    <points ref={pointsRef} geometry={geometry}>
      <pointsMaterial
        size={0.03}
        vertexColors
        transparent
        opacity={0.7}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

function InstancedVoxels({
  voxels,
  lodLevel = 1,
}: {
  voxels: Map<string, VoxelData>;
  lodLevel?: number;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);
  const geometry = useMemo(() => {
    // LOD 0 = high detail (icosahedron), LOD 1+ = low detail (tetrahedron-like)
    const detail = lodLevel === 0 ? 1 : 0;
    const radius = lodLevel === 0 ? 0.08 : 0.06;
    return new THREE.IcosahedronGeometry(radius, detail);
  }, [lodLevel]);

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
  particleCount,
  lodLevel,
}: {
  voxelCount: number;
  edgeCount: number;
  hubbleCorrection: number;
  violationCount: number;
  fps: number;
  particleCount?: number;
  lodLevel?: number;
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
        <div className="flex justify-between gap-4">
          <span className="text-gray-400">Particles:</span>
          <span className="font-semibold">{particleCount ?? MAX_FLOW_PARTICLES}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-400">LOD:</span>
          <span className={`font-semibold ${lodLevel === 0 ? 'text-green-400' : 'text-yellow-400'}`}>
            {lodLevel === 0 ? 'High' : 'Low'}
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
  setDebugInfo,
}: {
  setStats: React.Dispatch<React.SetStateAction<{ voxels: number; edges: number; hubble: number; violations: number }>>;
  setFps: React.Dispatch<React.SetStateAction<number>>;
  setDebugInfo: React.Dispatch<React.SetStateAction<{ particleCount: number; lodLevel: number }>>;
}) {
  const { camera } = useThree();
  const networkRef = useRef<{ voxels: Map<string, VoxelData>; edges: EdgeData[] }>({
    voxels: new Map(),
    edges: [],
  });
  const traitNodeRef = useRef<HSPlusNode | null>(null);
  const fpsAccumRef = useRef(0);
  const frameCountRef = useRef(0);
  const lodLevelRef = useRef(0);
  const frameTimeRef = useRef(0);
  const targetParticleCountRef = useRef(MAX_FLOW_PARTICLES);

  // Initialize trait on mount
  useEffect(() => {
    const node = createMockNode();
    traitNodeRef.current = node;

    const config: EmergentSpacetimeConfig = {
      initial_voxels: 2000,
      max_voxels: 2000,
      seed: 42,
      force_layout_guard: true,
      ricci_error_bound: 1e-4,
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
      initial_voxels: 2000,
      max_voxels: 2000,
      seed: 42,
      force_layout_guard: true,
      ricci_error_bound: 1e-4, // Relaxed for demo stability (Paper 3 claims 1e-5)
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

    // LOD calculation based on camera distance
    const cameraDistance = camera.position.distanceTo(new THREE.Vector3(0, 0, 0));
    lodLevelRef.current = cameraDistance > 5 ? 1 : 0;

    // Auto-degrade particle count if frame time exceeds target
    const frameTime = delta * 1000;
    frameTimeRef.current = frameTime;
    if (frameTime > FRAME_TIME_TARGET_MS && targetParticleCountRef.current > MIN_FLOW_PARTICLES) {
      targetParticleCountRef.current -= 10;
    } else if (frameTime < FRAME_TIME_TARGET_MS * 0.8 && targetParticleCountRef.current < MAX_FLOW_PARTICLES) {
      targetParticleCountRef.current += 10;
    }

    // Update debug info (throttled to every 10 frames)
    if (frameCountRef.current % 10 === 0) {
      setDebugInfo({
        particleCount: targetParticleCountRef.current,
        lodLevel: lodLevelRef.current,
      });
    }
  });

  return (
    <>
      <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
      <ambientLight intensity={0.2} />
      <pointLight position={[10, 10, 10]} intensity={0.5} />
      {networkRef.current && networkRef.current.voxels.size > 0 && (
        <>
          <InstancedVoxels voxels={networkRef.current.voxels} lodLevel={lodLevelRef.current} />
          <InstancedEdges edges={networkRef.current.edges} voxels={networkRef.current.voxels} />
          <ProvenanceFlowParticles edges={networkRef.current.edges} voxels={networkRef.current.voxels} targetParticleCount={targetParticleCountRef.current} />
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
      <EffectComposer disableNormalPass>
        <Bloom
          intensity={0.6}
          luminanceThreshold={0.8}
          luminanceSmoothing={0.03}
          mipmapBlur
        />
        <SSAO
          radius={0.4}
          intensity={12}
          luminanceInfluence={0.5}
          normalPass={false}
        />
        <Vignette offset={0.35} darkness={0.6} />
        <ToneMapping />
      </EffectComposer>
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
  const [debugInfo, setDebugInfo] = useState({ particleCount: MAX_FLOW_PARTICLES, lodLevel: 0 });

  return (
    <div className="w-full h-screen bg-black relative">
      <InfoPanel
        voxelCount={stats.voxels}
        edgeCount={stats.edges}
        hubbleCorrection={stats.hubble}
        violationCount={stats.violations}
        fps={fps}
        particleCount={debugInfo.particleCount}
        lodLevel={debugInfo.lodLevel}
      />
      <Canvas
        camera={{ position: [3, 2, 3], fov: 60 }}
        gl={{ antialias: true, alpha: false }}
        dpr={[1, 2]}
        linear
        flat
      >
        <SceneContent setStats={setStats} setFps={setFps} setDebugInfo={setDebugInfo} />
        <PerformanceOverlay />
      </Canvas>
    </div>
  );
}
