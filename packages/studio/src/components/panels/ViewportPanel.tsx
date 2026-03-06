'use client';
/**
 * ViewportPanel — Live 3D preview canvas powered by React Three Fiber
 *
 * Renders entities and lights from useViewport hook.
 * Responds to useStudioBus events from other panels (Terrain, Lighting, Camera).
 */
import React, { useRef, useMemo, Suspense } from 'react';
import { Canvas, useFrame, type ThreeElements } from '@react-three/fiber';
import { OrbitControls, Grid, GizmoHelper, GizmoViewport, Environment, Stats } from '@react-three/drei';
import { useViewport, type ViewportEntity, type ViewportLight, type ViewportMode } from '../../hooks/useViewport';
import * as THREE from 'three';

// ─── Entity Mesh ───────────────────────────────────────────────────────────────

function EntityMesh({ entity, mode }: { entity: ViewportEntity; mode: ViewportMode }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const isWireframe = mode === 'wireframe';

  // Gentle hover animation for selected entities
  useFrame((_, delta) => {
    if (meshRef.current && entity.selected) {
      meshRef.current.rotation.y += delta * 0.5;
    }
  });

  const geometry = useMemo(() => {
    switch (entity.type) {
      case 'box': return <boxGeometry args={[1, 1, 1]} />;
      case 'sphere': return <sphereGeometry args={[0.5, 32, 32]} />;
      case 'plane': return <planeGeometry args={[1, 1]} />;
      case 'cylinder': return <cylinderGeometry args={[0.5, 0.5, 1, 32]} />;
      case 'cone': return <coneGeometry args={[0.5, 1, 32]} />;
      case 'torus': return <torusGeometry args={[0.5, 0.2, 16, 32]} />;
      default: return <boxGeometry args={[1, 1, 1]} />;
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
      return <directionalLight position={light.position} color={light.color} intensity={light.intensity} castShadow />;
    case 'point':
      return <pointLight position={light.position} color={light.color} intensity={light.intensity} distance={20} />;
    case 'spot':
      return <spotLight position={light.position} color={light.color} intensity={light.intensity} angle={0.5} penumbra={0.5} castShadow />;
    case 'ambient':
      return <ambientLight color={light.color} intensity={light.intensity} />;
    default:
      return null;
  }
}

// ─── Main Viewport Panel ───────────────────────────────────────────────────────

export function ViewportPanel() {
  const { state, selectEntity, setMode, toggleGrid, toggleAxes, addEntity, buildDemo, clear } = useViewport();

  const modes: ViewportMode[] = ['scene', 'wireframe', 'normals'];
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
        {modes.map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-1.5 py-0.5 rounded transition ${state.mode === m ? 'bg-studio-accent/20 text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
          >
            {m === 'scene' ? '🎨' : m === 'wireframe' ? '🔲' : '🧭'} {m}
          </button>
        ))}

        <div className="w-px h-3 bg-studio-border/30 mx-1" />

        <button onClick={toggleGrid} className={`px-1 py-0.5 rounded ${state.gridVisible ? 'text-studio-accent' : 'text-studio-muted'}`}>
          ⊞ Grid
        </button>
        <button onClick={toggleAxes} className={`px-1 py-0.5 rounded ${state.axesVisible ? 'text-studio-accent' : 'text-studio-muted'}`}>
          ✛ Axes
        </button>
      </div>

      {/* 3D Canvas */}
      <div className="flex-1 relative" style={{ minHeight: 300 }}>
        <Canvas
          shadows
          camera={{ position: [8, 6, 8], fov: 50 }}
          style={{ background: state.backgroundColor }}
          gl={{ antialias: true, alpha: false }}
        >
          <Suspense fallback={null}>
            {/* Entities */}
            {state.entities.map(entity => (
              <EntityMesh key={entity.id} entity={entity} mode={state.mode} />
            ))}

            {/* Lights */}
            {state.lights.map(light => (
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

        {/* Overlay Stats */}
        <div className="absolute bottom-2 left-2 bg-black/60 rounded px-2 py-1 text-[9px] text-studio-muted font-mono">
          {state.entities.length} entities · {state.lights.filter(l => l.enabled).length} lights · {state.mode}
        </div>

        {/* Selected entity info */}
        {state.selectedId && (
          <div className="absolute top-2 left-2 bg-black/70 rounded px-2 py-1 text-[10px] text-studio-accent">
            ✦ {state.entities.find(e => e.id === state.selectedId)?.name ?? state.selectedId}
          </div>
        )}
      </div>

      {/* Quick Add Bar */}
      <div className="flex items-center gap-1 px-3 py-1.5 bg-studio-panel/30 border-t border-studio-border/20 text-[10px]">
        <span className="text-studio-muted mr-1">Add:</span>
        {entityTypes.map(({ type, icon, label }) => (
          <button
            key={type}
            onClick={() => addEntity({
              name: label,
              type,
              position: [Math.random() * 6 - 3, 1, Math.random() * 6 - 3],
              rotation: [0, 0, 0],
              scale: [1, 1, 1],
              color: `hsl(${Math.random() * 360}, 70%, 60%)`,
            })}
            className="px-1.5 py-0.5 bg-studio-panel/40 rounded hover:bg-studio-accent/20 hover:text-studio-accent transition"
          >
            {icon} {label}
          </button>
        ))}
        <div className="flex-1" />
        <button onClick={buildDemo} className="px-1.5 py-0.5 text-emerald-400 hover:bg-emerald-500/20 rounded transition">🎮 Demo</button>
        <button onClick={clear} className="px-1.5 py-0.5 text-red-400 hover:bg-red-500/20 rounded transition">🗑️</button>
      </div>
    </div>
  );
}
