import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text, Html, Float, Line, Environment } from '@react-three/drei';
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Types & Props
// ---------------------------------------------------------------------------

interface SkillData {
  name: string;
  status: 'running' | 'idle' | 'error';
  traits: string[];
}

interface HoloClaw3DDeckProps {
  skills: SkillData[];
}

// ---------------------------------------------------------------------------
// Colors & Materials
// ---------------------------------------------------------------------------

const STATUS_COLORS = {
  running: '#10B981', // Emerald
  idle: '#FBBF24',    // Yellow
  error: '#EF4444',   // Red
};

// ---------------------------------------------------------------------------
// Scene Nodes
// ---------------------------------------------------------------------------

function TentacleNode({ skill, position }: { skill: SkillData; position: [number, number, number] }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const color = STATUS_COLORS[skill.status];

  // Rotate slowly if idle, fast if running
  useFrame((state, delta) => {
    if (meshRef.current) {
      const speed = skill.status === 'running' ? 2 : 0.5;
      meshRef.current.rotation.y += delta * speed;
      meshRef.current.rotation.x += delta * speed * 0.5;
    }
  });

  return (
    <group position={position}>
      {/* Visual node */}
      <Float speed={skill.status === 'running' ? 4 : 1} rotationIntensity={0.5} floatIntensity={0.5}>
        <mesh ref={meshRef}>
          <icosahedronGeometry args={[0.5, skill.status === 'running' ? 2 : 0]} />
          <meshStandardMaterial 
            color={color} 
            emissive={color} 
            emissiveIntensity={skill.status === 'running' ? 2 : 0.2}
            wireframe={skill.status === 'idle'}
          />
        </mesh>

        {/* Dynamic connection line back to center */}
        <Line 
          points={[[0, 0, 0], [-position[0], -position[1] + 1.5, -position[2]]]} 
          color={color}
          lineWidth={skill.status === 'running' ? 2 : 0.5}
          dashed={skill.status !== 'running'}
          opacity={0.5}
          transparent
        />

        {/* HTML UI Label */}
        <Html position={[0, -1, 0]} center transform sprite zIndexRange={[100, 0]} distanceFactor={8}>
          <div className="flex flex-col items-center pointer-events-none select-none">
            <div className={`px-2 py-1 rounded bg-[#0f172a]/80 backdrop-blur border text-xs font-bold text-white uppercase tracking-wider
              ${skill.status === 'running' ? 'border-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'border-slate-700'}`}>
              {skill.name}
            </div>
            {skill.traits.length > 0 && (
              <div className="mt-1 flex gap-1">
                <span className="px-1 py-0.5 rounded bg-black/60 text-[8px] text-slate-300">
                  @{skill.traits[0]} {skill.traits.length > 1 && `+${skill.traits.length - 1}`}
                </span>
              </div>
            )}
          </div>
        </Html>
      </Float>
    </group>
  );
}

function CoordinatorObelisk({ active }: { active: boolean }) {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.2;
    }
  });

  return (
    <group position={[0, 1.5, 0]}>
      <Float speed={2} rotationIntensity={0} floatIntensity={1}>
        <mesh ref={meshRef}>
          <octahedronGeometry args={[1.2, 0]} />
          <meshStandardMaterial 
            color="#ec4899" 
            emissive="#a855f7" 
            emissiveIntensity={active ? 1.5 : 0.2}
            wireframe
          />
        </mesh>
        <Html position={[0, -1.8, 0]} center transform sprite distanceFactor={10}>
          <div className="pointer-events-none text-center">
            <div className="text-sm font-black text-fuchsia-400 uppercase tracking-widest drop-shadow-[0_0_8px_rgba(236,72,153,0.8)]">
              HoloClaw Base
            </div>
            <div className="text-[10px] text-fuchsia-300/70 uppercase">Coordinator</div>
          </div>
        </Html>
      </Float>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function HoloClaw3DDeck({ skills }: HoloClaw3DDeckProps) {
  const isEngineActive = skills.some((s) => s.status === 'running');

  // Distribute tentacles in a spatial ring/sphere layout
  const distributedPositions = useMemo(() => {
    const radius = 5;
    return skills.map((_, i) => {
      const angle = (i / skills.length) * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      // Slight y altitude variation based on index
      const y = Math.sin(i * 1.5) * 1.5;
      return [x, y, z] as [number, number, number];
    });
  }, [skills]);

  return (
    <div className="w-full h-full bg-[#050508] rounded-lg border border-studio-border overflow-hidden relative">
      
      {/* Engine Status Overlay */}
      <div className="absolute top-4 left-4 z-10 pointer-events-none">
        <div className="text-[10px] uppercase font-bold tracking-widest text-[#a855f7]/50 mb-1">Sector 1: HoloMesh Connect</div>
        <div className="flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${isEngineActive ? 'bg-fuchsia-500 animate-pulse' : 'bg-slate-700'}`} />
          <span className="text-xs text-slate-300">{isEngineActive ? 'Engine Connected' : 'Engine Idle'}</span>
        </div>
      </div>

      {/* R3F Canvas */}
      <Canvas camera={{ position: [0, 4, 10], fov: 45 }}>
        <fog attach="fog" args={['#050508', 5, 20]} />
        <ambientLight intensity={0.2} />
        <pointLight position={[0, 5, 0]} intensity={isEngineActive ? 2 : 0.5} color="#ec4899" />
        
        {/* Core Coordinator */}
        <CoordinatorObelisk active={isEngineActive} />

        {/* Render tentacles dynamically */}
        {skills.map((skill, i) => (
          <TentacleNode key={skill.name} skill={skill} position={distributedPositions[i] || [0, 0, 0]} />
        ))}

        {/* Spatial Grid Floor */}
        <gridHelper args={[30, 30, '#1e293b', '#0f172a']} position={[0, -2.5, 0]} />

        {/* Environment post processing/bloom can be added separately, handled by material emissive visually here */}
        <OrbitControls 
          enablePan={false} 
          minDistance={3} 
          maxDistance={15} 
          maxPolarAngle={Math.PI / 2 + 0.1} // Prevent looking completely under the floor
          autoRotate={!isEngineActive} 
          autoRotateSpeed={0.5}
        />
      </Canvas>
    </div>
  );
}
