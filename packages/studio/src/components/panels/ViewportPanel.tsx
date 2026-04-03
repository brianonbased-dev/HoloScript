'use client';
/**
 * ViewportPanel — Live 3D preview canvas powered by React Three Fiber
 *
 * Renders entities and lights from useViewport hook.
 * Responds to useStudioBus events from other panels (Terrain, Lighting, Camera).
 */
import React, { useRef, useMemo, Suspense } from 'react';
import { Canvas, useFrame, type ThreeElements, type ThreeEvent } from '@react-three/fiber';
import { ErrorBoundary as StudioErrorBoundary } from '@holoscript/ui';
import {
  OrbitControls,
  Grid,
  GizmoHelper,
  GizmoViewport,
  Environment,
  Stats,
} from '@react-three/drei';
import {
  useViewport,
  type ViewportEntity,
  type ViewportLight,
  type ViewportMode,
} from '../../hooks/useViewport';
import { useEditorStore } from '../../lib/stores/editorStore';
import * as THREE from 'three';

// ─── Historic Ghost Mesh (Diff Mode) ──────────────────────────────────────────

function HistoricGhostMesh({ entity }: { entity: ViewportEntity }) {
  // In production, an alternate historic AST is fetched via GitService
  // For Sprint 2 Phase 1 UI mockup, we render the current entity with an offset
  // and a translucent green/red "diff overlay" material to mimic an old state.

  const ghostPosition = useMemo(() => {
    return new THREE.Vector3(
      entity.position[0] - 1.5, // Translate historic object left
      entity.position[1],
      entity.position[2]
    );
  }, [entity.position]);

  const geometry = useMemo(() => {
    switch (entity.type) {
      case 'box':
        return <boxGeometry args={[1, 1, 1]} />;
      case 'sphere':
        return <sphereGeometry args={[0.5, 32, 32]} />;
      case 'plane':
        return <planeGeometry args={[1, 1]} />;
      case 'cylinder':
        return <cylinderGeometry args={[0.5, 0.5, 1, 32]} />;
      case 'cone':
        return <coneGeometry args={[0.5, 1, 32]} />;
      case 'torus':
        return <torusGeometry args={[0.5, 0.2, 16, 32]} />;
      default:
        return <boxGeometry args={[1, 1, 1]} />;
    }
  }, [entity.type]);

  return (
    <>
      <mesh position={ghostPosition} rotation={entity.rotation} scale={entity.scale}>
        {geometry}
        <meshStandardMaterial
          color="#fca5a5"
          wireframe
          transparent
          opacity={0.3}
          metalness={0}
          roughness={1}
          emissive="#ef4444"
          emissiveIntensity={0.2}
        />
      </mesh>

      {/* Diff mapping line linking current mesh to historic mesh */}
      <line>
        <bufferGeometry>
          {/* @ts-ignore */}
          <bufferAttribute
            attach="attributes-position"
            count={2}
            array={
              new Float32Array([
                entity.position[0],
                entity.position[1],
                entity.position[2],
                ghostPosition.x,
                ghostPosition.y,
                ghostPosition.z,
              ])
            }
            itemSize={3}
          />
        </bufferGeometry>
        <lineDashedMaterial
          color="#818cf8"
          dashSize={0.2}
          gapSize={0.1}
          opacity={0.5}
          transparent
        />
      </line>
    </>
  );
}

// ─── Entity Mesh ───────────────────────────────────────────────────────────────

function EntityMesh({ entity, mode }: { entity: ViewportEntity; mode: ViewportMode }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const isWireframe = mode === 'wireframe';
  const { setSpatialBlameTooltip } = useEditorStore();

  // Gentle hover animation for selected entities
  useFrame((_, delta) => {
    if (meshRef.current && entity.selected) {
      meshRef.current.rotation.y += delta * 0.5;
    }
  });

  const handleClick = async (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation(); // Prevent canvas background click

    // Show loading state
    setSpatialBlameTooltip(
      true,
      e.clientX,
      e.clientY - 40,
      <div className="flex items-center gap-2 p-1 text-slate-300 text-xs">
        <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-indigo-500"></div>
        Tracking origin...
      </div>
    );

    try {
      const { GitService } = await import('../../services/GitService');
      // In a real environment, this would be the actual path of the loaded composition
      const service = new GitService(process.cwd());
      const blame = await service.getBlameForNode('example.holo', entity.id);

      if (blame) {
        setSpatialBlameTooltip(
          true,
          e.clientX,
          e.clientY - 40,
          <div className="flex flex-col gap-1">
            <span className="font-bold text-indigo-300">@{blame.author.name}</span>
            <span>Added {entity.name || entity.type} geometry</span>
            <span className="text-[9px] text-slate-400 font-mono mt-1">
              commit: {blame.oid.substring(0, 7)}
            </span>
            <span className="text-[9px] text-slate-500 mt-1 max-w-[150px] truncate">
              {blame.message}
            </span>
          </div>
        );
      } else {
        setSpatialBlameTooltip(
          true,
          e.clientX,
          e.clientY - 40,
          <div className="flex flex-col gap-1">
            <span className="text-slate-400 text-xs italic">No spatial history found.</span>
          </div>
        );
      }
    } catch (err) {
      setSpatialBlameTooltip(
        true,
        e.clientX,
        e.clientY - 40,
        <div className="flex flex-col gap-1">
          <span className="text-red-400 text-xs">Error tracking history</span>
        </div>
      );
    }
  };

  const geometry = useMemo(() => {
    switch (entity.type) {
      case 'box':
        return <boxGeometry args={[1, 1, 1]} />;
      case 'sphere':
        return <sphereGeometry args={[0.5, 32, 32]} />;
      case 'plane':
        return <planeGeometry args={[1, 1]} />;
      case 'cylinder':
        return <cylinderGeometry args={[0.5, 0.5, 1, 32]} />;
      case 'cone':
        return <coneGeometry args={[0.5, 1, 32]} />;
      case 'torus':
        return <torusGeometry args={[0.5, 0.2, 16, 32]} />;
      default:
        return <boxGeometry args={[1, 1, 1]} />;
    }
  }, [entity.type]);

  const material = useMemo(() => {
    if (mode === 'normals') return <meshNormalMaterial wireframe={isWireframe} />;
    return (
      <meshStandardMaterial
        color={entity.color}
        wireframe={isWireframe}
        metalness={0.1}
        roughness={0.7}
        emissive={entity.selected ? entity.color : '#000000'}
        emissiveIntensity={entity.selected ? 0.15 : 0}
      />
    );
  }, [entity.color, entity.selected, mode, isWireframe]);

  return (
    <mesh
      ref={meshRef}
      position={entity.position}
      rotation={entity.rotation}
      scale={entity.scale}
      onClick={handleClick}
      onPointerMissed={() => setSpatialBlameTooltip(false)}
    >
      {geometry}
      {material}
      {entity.selected && (
        <lineSegments>
          <edgesGeometry args={[new THREE.BoxGeometry(1.02, 1.02, 1.02)]} />
          <lineBasicMaterial color="#00ffff" linewidth={2} />
        </lineSegments>
      )}
    </mesh>
  );
}

// ─── Light Visualization ───────────────────────────────────────────────────────

function SceneLight({ light }: { light: ViewportLight }) {
  if (!light.enabled) return null;

  switch (light.type) {
    case 'directional':
      return (
        <directionalLight
          position={light.position}
          color={light.color}
          intensity={light.intensity}
          castShadow
        />
      );
    case 'point':
      return (
        <pointLight
          position={light.position}
          color={light.color}
          intensity={light.intensity}
          distance={20}
        />
      );
    case 'spot':
      return (
        <spotLight
          position={light.position}
          color={light.color}
          intensity={light.intensity}
          angle={0.5}
          penumbra={0.5}
          castShadow
        />
      );
    case 'ambient':
      return <ambientLight color={light.color} intensity={light.intensity} />;
    default:
      return null;
  }
}

// ─── Main Viewport Panel ───────────────────────────────────────────────────────

export function ViewportPanel() {
  const { state, selectEntity, setMode, toggleGrid, toggleAxes, addEntity, buildDemo, clear } =
    useViewport();
  const { diffModeHash } = useEditorStore();

  const modes = ['scene', 'wireframe', 'normals', 'flat-semantic'] as const;
  const entityTypes = [
    { type: 'box' as const, icon: '📦', label: 'Box' },
    { type: 'sphere' as const, icon: '🔵', label: 'Sphere' },
    { type: 'cylinder' as const, icon: '🪵', label: 'Cylinder' },
    { type: 'cone' as const, icon: '🔺', label: 'Cone' },
    { type: 'torus' as const, icon: '🍩', label: 'Torus' },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-studio-panel/50 border-b border-studio-border/20 text-[10px]">
        <span className="text-studio-accent font-semibold text-xs">🎬 Viewport</span>
        <div className="flex-1" />

        {/* Mode toggle */}
        {modes.map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-1.5 py-0.5 rounded transition ${state.mode === m ? 'bg-indigo-500/20 text-indigo-400' : 'text-studio-muted hover:text-studio-text'}`}
          >
            {m === 'scene' ? '🎨' : m === 'wireframe' ? '🔲' : m === 'normals' ? '🧭' : '🌌'}{' '}
            {m === 'flat-semantic' ? '2d-revolution' : m}
          </button>
        ))}

        <div className="w-px h-3 bg-studio-border/30 mx-1" />

        <button
          onClick={() => alert('Absorb HTML into Semantic2D via Graph pipeline.')}
          className="px-1.5 py-0.5 rounded text-fuchsia-400 hover:bg-fuchsia-500/20 transition ml-1 flex items-center gap-1"
        >
          ✨ Absorb HTML
        </button>

        <div className="w-px h-3 bg-studio-border/30 mx-1" />

        <button
          onClick={toggleGrid}
          className={`px-1 py-0.5 rounded ${state.gridVisible ? 'text-studio-accent' : 'text-studio-muted'}`}
        >
          ⊞ Grid
        </button>
        <button
          onClick={toggleAxes}
          className={`px-1 py-0.5 rounded ${state.axesVisible ? 'text-studio-accent' : 'text-studio-muted'}`}
        >
          ✛ Axes
        </button>
      </div>

      {/* 3D Canvas */}
      <div className="flex-1 relative" style={{ minHeight: 300 }}>
        <StudioErrorBoundary label="ViewportPanel Canvas">
        <Canvas
          shadows
          orthographic={state.mode === 'flat-semantic'}
          camera={{
            position: state.mode === 'flat-semantic' ? [0, 0, 10] : [8, 6, 8],
            fov: 50,
            zoom: state.mode === 'flat-semantic' ? 50 : 1,
          }}
          style={{ background: state.backgroundColor }}
          gl={{ antialias: true, alpha: false }}
        >
          <Suspense fallback={null}>
            {/* Entities */}
            {state.entities.map((entity) => (
              <React.Fragment key={entity.id}>
                <EntityMesh entity={entity} mode={state.mode} />
                {diffModeHash && <HistoricGhostMesh entity={entity} />}
              </React.Fragment>
            ))}

            {/* Lights */}
            {state.lights.map((light) => (
              <SceneLight key={light.id} light={light} />
            ))}

            {/* Helpers */}
            {state.gridVisible && (
              <Grid
                args={[20, 20]}
                position={[0, -0.01, 0]}
                cellSize={1}
                cellThickness={0.5}
                cellColor="#334155"
                sectionSize={5}
                sectionThickness={1}
                sectionColor="#475569"
                fadeDistance={30}
                infiniteGrid
              />
            )}

            {state.axesVisible && (
              <GizmoHelper alignment="bottom-right" margin={[60, 60]}>
                <GizmoViewport axisColors={['#ff4444', '#44ff44', '#4444ff']} labelColor="white" />
              </GizmoHelper>
            )}

            {/* Camera Controls */}
            <OrbitControls
              makeDefault
              enableDamping
              dampingFactor={0.08}
              minDistance={2}
              maxDistance={50}
            />

            <Environment preset="sunset" background={false} />
          </Suspense>
        </Canvas>
        </StudioErrorBoundary>

        {/* Overlay Stats */}
        <div className="absolute bottom-2 left-2 bg-black/60 rounded px-2 py-1 text-[9px] text-studio-muted font-mono">
          {state.entities.length} entities · {state.lights.filter((l) => l.enabled).length} lights ·{' '}
          {state.mode}
        </div>

        {/* Selected entity info */}
        {state.selectedId && (
          <div className="absolute top-2 left-2 bg-black/70 rounded px-2 py-1 text-[10px] text-studio-accent">
            ✦ {state.entities.find((e) => e.id === state.selectedId)?.name ?? state.selectedId}
          </div>
        )}
      </div>

      {/* Quick Add Bar */}
      <div className="flex items-center gap-1 px-3 py-1.5 bg-studio-panel/30 border-t border-studio-border/20 text-[10px]">
        <span className="text-studio-muted mr-1">Add:</span>
        {entityTypes.map(({ type, icon, label }) => (
          <button
            key={type}
            onClick={() =>
              addEntity({
                name: label,
                type,
                position: [Math.random() * 6 - 3, 1, Math.random() * 6 - 3],
                rotation: [0, 0, 0],
                scale: [1, 1, 1],
                color: `hsl(${Math.random() * 360}, 70%, 60%)`,
              })
            }
            className="px-1.5 py-0.5 bg-studio-panel/40 rounded hover:bg-studio-accent/20 hover:text-studio-accent transition"
          >
            {icon} {label}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={buildDemo}
          className="px-1.5 py-0.5 text-emerald-400 hover:bg-emerald-500/20 rounded transition"
        >
          🎮 Demo
        </button>
        <button
          onClick={clear}
          className="px-1.5 py-0.5 text-red-400 hover:bg-red-500/20 rounded transition"
        >
          🗑️
        </button>
      </div>
    </div>
  );
}
