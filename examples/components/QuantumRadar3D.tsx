'use client';

import React, { useRef, useState, useEffect, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  Points,
  PointMaterial,
  Float,
  Text,
  Line,
  Sphere,
  MeshDistortMaterial,
} from '@react-three/drei';
import * as THREE from 'three';
import { SpatialEvent } from '@/services/master-portal/core/MeshSpatialOrchestrator';

/**
 * Quantum Radar 3D Component
 *
 * Visualizes the agent network in a holographic 3D space.
 * Agents are represented as nodes, messages as pulses.
 */

function AgentNode({
  id,
  position,
  isCouncil,
  status,
}: {
  id: string;
  position: [number, number, number];
  isCouncil: boolean;
  status: string;
}) {
  const mesh = useRef<THREE.Mesh>(null!);
  const [hovered, setHover] = useState(false);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    mesh.current.position.y = position[1] + Math.sin(t * 2 + position[0]) * 2;
    mesh.current.rotation.x = t * (isCouncil ? 0.5 : 0.2);
    mesh.current.rotation.y = t * (isCouncil ? 0.3 : 0.1);
  });

  return (
    <group position={position}>
      <mesh ref={mesh} onPointerOver={() => setHover(true)} onPointerOut={() => setHover(false)}>
        <octahedronGeometry args={[isCouncil ? 4 : 2, 0]} />
        <MeshDistortMaterial
          color={isCouncil ? '#00ffff' : '#00aaff'}
          speed={isCouncil ? 4 : 2}
          distort={0.4}
          radius={1}
          emissive={isCouncil ? '#00ffff' : '#00aaff'}
          emissiveIntensity={hovered ? 2 : 0.5}
          wireframe
        />
      </mesh>
      <Text
        position={[0, -6, 0]}
        fontSize={3}
        color="white"
        anchorX="center"
        anchorY="middle"
        font="/fonts/Inter-Bold.ttf" // Fallback to system font if unavailable
      >
        {id.split('-')[0].toUpperCase()}
      </Text>
      {isCouncil && (
        <Sphere args={[8, 16, 16]}>
          <meshBasicMaterial color="#00ffff" wireframe transparent opacity={0.1} />
        </Sphere>
      )}
    </group>
  );
}

function Pulse({
  start,
  end,
  intensity,
}: {
  start: [number, number, number];
  end: [number, number, number];
  intensity: number;
}) {
  const lineRef = useRef<THREE.Line>(null!);
  const [prog, setProg] = useState(0);

  useFrame((_state, delta) => {
    setProg((v) => (v + delta * 2) % 1);
  });

  const curve = useMemo(() => {
    return new THREE.CatmullRomCurve3([
      new THREE.Vector3(...start),
      new THREE.Vector3(
        (start[0] + end[0]) / 2,
        (start[1] + end[1]) / 2 + 10,
        (start[2] + end[2]) / 2
      ),
      new THREE.Vector3(...end),
    ]);
  }, [start, end]);

  return (
    <group>
      <Line
        points={curve.getPoints(50)}
        color="#00ffff"
        lineWidth={0.5}
        transparent
        opacity={0.2}
      />
      <mesh position={curve.getPoint(prog)}>
        <sphereGeometry args={[0.5 * intensity, 8, 8]} />
        <meshBasicMaterial color="#00ffff" />
      </mesh>
    </group>
  );
}

function Scene() {
  const [agents, setAgents] = useState<any[]>([]);
  const [pulses, setPulses] = useState<any[]>([]);

  // Initial council agents (Static for now, could be dynamic from API)
  useEffect(() => {
    const council = [
      { id: 'ceo-agent', position: [0, 0, 0], isCouncil: true },
      { id: 'builder-agent', position: [30, 10, 20], isCouncil: true },
      { id: 'futurist-agent', position: [-30, -10, 20], isCouncil: true },
      { id: 'vision-agent', position: [0, 20, -30], isCouncil: true },
    ];
    setAgents(council);
  }, []);

  // Poll for spatial events
  useEffect(() => {
    const fetchSpatialEvents = async () => {
      try {
        const res = await fetch('/api/mesh/spatial', {
          method: 'GET',
          headers: { accept: 'application/json' },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.events && Array.isArray(data.events)) {
            // Filter for new events or just take last 20
            // In a real implementation, we would use a lastId cursor
            const newPulses = data.events.slice(-20).map((event: SpatialEvent) => {
              // Map event to pulse
              // We need positions.
              // If event.position is provided, use it.
              // We need start/end positions in 3D space.
              // Start = source agent position?
              // End = target agent position?
              // Since we don't have all agent positions dynamically mapped yet, we use the event position as end?

              // Simplification: Source 0,0,0 (CEO) to Event Position
              const startPos = [0, 0, 0];
              const endPos = event.position
                ? [event.position.x, event.position.y, event.position.z]
                : [10, 10, 10];

              return {
                id: event.id,
                start: startPos,
                end: endPos,
                intensity: event.intensity,
              };
            });
            setPulses(newPulses);
          }
        }
      } catch (e) {
        // Silent fail for polling
      }
    };

    const intervalId = setInterval(fetchSpatialEvents, 1000);
    return () => clearInterval(intervalId);
  }, []);

  return (
    <>
      <ambientLight intensity={0.2} />
      <pointLight position={[100, 100, 100]} intensity={1} color="#00ffff" />
      <Float speed={1.5} rotationIntensity={0.5} floatIntensity={0.5}>
        {agents.map((agent) => (
          <AgentNode
            key={agent.id}
            id={agent.id}
            position={agent.agentPosition || agent.position}
            isCouncil={agent.isCouncil}
            status="healthy"
          />
        ))}
      </Float>
      {pulses.map((pulse: any) => (
        <Pulse key={pulse.id} start={pulse.start} end={pulse.end} intensity={pulse.intensity} />
      ))}
    </>
  );
}

export default function QuantumRadar3D() {
  return (
    <div className="w-full h-full bg-slate-950 min-h-[500px] border border-cyan-500/20 rounded-lg overflow-hidden shadow-[0_0_50px_rgba(0,255,255,0.1)] relative">
      <div className="absolute top-4 left-4 z-10">
        <h3 className="text-cyan-400 font-mono text-xs tracking-widest uppercase">
          Meta-Mesh Quantum Radar
        </h3>
        <p className="text-slate-500 font-mono text-[10px]">REAL-TIME CONSCIOUSNESS TELEMETRY</p>
      </div>
      <Canvas camera={{ position: [0, 50, 100], fov: 45 }}>
        <Scene />
        <fog attach="fog" args={['#020617', 50, 200]} />
      </Canvas>
    </div>
  );
}
