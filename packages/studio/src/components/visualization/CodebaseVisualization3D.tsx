'use client';

import React, { useMemo, useState, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html, Stars } from '@react-three/drei';
import * as THREE from 'three';
import { CodebaseVisualizationData, VisNode } from './CodebaseVisualizationPanel';

// ─── Color Palette ─────────────────────────────────────────────────────────────

const COMMUNITY_COLORS = [
  '#6366f1', // indigo
  '#22d3ee', // cyan
  '#34d399', // emerald
  '#fbbf24', // amber
  '#f87171', // red
  '#a78bfa', // violet
  '#38bdf8', // sky
  '#4ade80', // green
  '#fb923c', // orange
  '#e879f9', // fuchsia
  '#2dd4bf', // teal
  '#94a3b8', // slate
];

function getCommunityColor(c: number): string {
  return COMMUNITY_COLORS[Math.abs(c) % COMMUNITY_COLORS.length];
}

// ─── 3D Layout Algorithm (Sphere of Spheres) ──────────────────────────────────

interface Node3D {
  id: string;
  label: string;
  community: number;
  position: THREE.Vector3;
  color: string;
  radius: number;
}

function compute3DLayout(data: CodebaseVisualizationData): {
  nodes: Node3D[];
  edgePositions: Float32Array;
  edgeColors: Float32Array;
} {
  const groups = new Map<number, VisNode[]>();
  for (const n of data.nodes) {
    if (!groups.has(n.community)) groups.set(n.community, []);
    groups.get(n.community)!.push(n);
  }

  const communityIds = Array.from(groups.keys());
  const nodes3D: Node3D[] = [];
  const nodeMap = new Map<string, Node3D>();

  // Macro layout: Distributed communities on a sphere
  const macroRadius = 15;
  const phi = Math.PI * (3 - Math.sqrt(5)); // golden angle

  communityIds.forEach((cId, i) => {
    // Generate evenly spaced points on a sphere for communities using Fibonacci lattice
    const y = 1 - (i / (communityIds.length - 1 || 1)) * 2; // y goes from 1 to -1
    const radiusAtY = Math.sqrt(1 - y * y);
    const theta = phi * i;

    const groupCenter = new THREE.Vector3(
      Math.cos(theta) * radiusAtY * macroRadius,
      y * macroRadius,
      Math.sin(theta) * radiusAtY * macroRadius
    );

    const members = groups.get(cId)!;
    // Micro layout: Files around their community center
    const microRadius = Math.max(2, Math.min(6, members.length * 0.5));
    
    members.forEach((node, j) => {
      // Fibonacci lattice on a micro level
      const my = 1 - (j / (members.length - 1 || 1)) * 2;
      const mRAtY = Math.sqrt(1 - my * my);
      const mTheta = phi * j;

      const localPos = new THREE.Vector3(
        Math.cos(mTheta) * mRAtY * microRadius,
        my * microRadius,
        Math.sin(mTheta) * mRAtY * microRadius
      );
      
      // Jitter slightly for visual chaos
      localPos.add(new THREE.Vector3(
        (Math.random() - 0.5) * 1.5,
        (Math.random() - 0.5) * 1.5,
        (Math.random() - 0.5) * 1.5
      ));

      const finalPos = groupCenter.clone().add(localPos);
      const scale = Math.min(1.2, Math.max(0.2, 0.1 + node.degree * 0.05));

      const n3d = {
        id: node.id,
        label: node.label,
        community: node.community,
        position: finalPos,
        color: getCommunityColor(node.community),
        radius: scale,
      };

      nodes3D.push(n3d);
      nodeMap.set(node.id, n3d);
    });
  });

  // Build Edge Buffer
  const validEdges = data.edges.filter(e => nodeMap.has(e.source) && nodeMap.has(e.target));
  const edgePositions = new Float32Array(validEdges.length * 6); // 2 vertices per line, 3 coords
  const edgeColors = new Float32Array(validEdges.length * 6); // rgb per vertex

  const colorHelper = new THREE.Color();

  validEdges.forEach((edge, idx) => {
    const s = nodeMap.get(edge.source)!;
    const t = nodeMap.get(edge.target)!;

    // Line start
    edgePositions[idx * 6] = s.position.x;
    edgePositions[idx * 6 + 1] = s.position.y;
    edgePositions[idx * 6 + 2] = s.position.z;

    // Line end
    edgePositions[idx * 6 + 3] = t.position.x;
    edgePositions[idx * 6 + 4] = t.position.y;
    edgePositions[idx * 6 + 5] = t.position.z;

    // Mix colors slightly
    colorHelper.set(s.color).lerp(new THREE.Color(0xffffff), 0.5);
    edgeColors[idx * 6] = colorHelper.r;
    edgeColors[idx * 6 + 1] = colorHelper.g;
    edgeColors[idx * 6 + 2] = colorHelper.b;

    colorHelper.set(t.color).lerp(new THREE.Color(0xffffff), 0.5);
    edgeColors[idx * 6 + 3] = colorHelper.r;
    edgeColors[idx * 6 + 4] = colorHelper.g;
    edgeColors[idx * 6 + 5] = colorHelper.b;
  });

  return { nodes: nodes3D, edgePositions, edgeColors };
}

// ─── 3D Visualizer Scene ──────────────────────────────────────────────────────

function UniverseGraph({ 
  data, onNodeClick 
}: { 
  data: CodebaseVisualizationData;
  onNodeClick?: (id: string) => void;
}) {
  const { nodes, edgePositions, edgeColors } = useMemo(() => compute3DLayout(data), [data]);
  const groupRef = useRef<THREE.Group>(null);
  const [hoveredNode, setHoveredNode] = useState<Node3D | null>(null);

  useFrame((_, delta) => {
    if (groupRef.current && !hoveredNode) {
      groupRef.current.rotation.y += delta * 0.05; // Slow ambient spin
    }
  });

  return (
    <group ref={groupRef}>
      {/* Node Spheres */}
      {nodes.map(node => (
        <mesh 
          key={node.id} 
          position={node.position}
          onClick={(e) => {
            e.stopPropagation();
            onNodeClick?.(node.id);
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            setHoveredNode(node);
            document.body.style.cursor = 'pointer';
          }}
          onPointerOut={(e) => {
            setHoveredNode(null);
            document.body.style.cursor = 'auto';
          }}
        >
          <sphereGeometry args={[node.radius, 16, 16]} />
          <meshStandardMaterial 
            color={node.color} 
            emissive={node.color} 
            emissiveIntensity={hoveredNode?.id === node.id ? 2 : 0.5} 
            roughness={0.2} 
            metalness={0.8}
          />
        </mesh>
      ))}

      {/* Force Connections */}
      {edgePositions.length > 0 && (
        <lineSegments>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[edgePositions, 3]}
            />
            <bufferAttribute
              attach="attributes-color"
              args={[edgeColors, 3]}
            />
          </bufferGeometry>
          <lineBasicMaterial vertexColors transparent opacity={0.25} />
        </lineSegments>
      )}

      {/* Hover Label */}
      {hoveredNode && (
        <Html position={hoveredNode.position} center zIndexRange={[100, 0]} pointerEvents="none">
          <div className="rounded-lg bg-black/80 backdrop-blur-md px-3 py-1.5 border border-studio-border whitespace-nowrap shadow-xl">
            <div className="text-white font-bold text-xs">{hoveredNode.label}</div>
            <div className="text-[10px] text-white/50 tracking-wider">COMMUNITY {hoveredNode.community}</div>
          </div>
        </Html>
      )}
    </group>
  );
}

// ─── Main Component Wrapper ───────────────────────────────────────────────────

interface CodebaseVisualization3DProps {
  data: CodebaseVisualizationData;
  onNodeClick?: (nodeId: string) => void;
}

export const CodebaseVisualization3D: React.FC<CodebaseVisualization3DProps> = ({
  data,
  onNodeClick,
}) => {
  const communityIds = useMemo(
    () => Array.from(new Set(data.nodes.map((n) => n.community))).sort((a, b) => a - b),
    [data]
  );

  return (
    <div className="flex flex-col h-full bg-[#050508] text-slate-200 select-none relative" data-testid="codebase-visualization-3d">
      <div className="absolute top-0 left-0 right-0 z-10 p-3 border-b border-studio-border/30 bg-black/40 backdrop-blur-md flex justify-between items-center">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-100 flex items-center gap-2">
          <span className="text-indigo-400">◈</span> 3D Codebase Mesh
        </h3>
        <span className="text-xs text-slate-400">
          {data.stats.totalFiles} files · {communityIds.length} clusters
        </span>
      </div>

      <div className="flex-1 w-full h-full relative">
        <Canvas camera={{ position: [0, 0, 35], fov: 60 }} performance={{ min: 0.5 }}>
          <color attach="background" args={['#050508']} />
          <ambientLight intensity={0.4} />
          <pointLight position={[50, 50, 50]} intensity={1} color="#ffffff" />
          <pointLight position={[-50, -50, -50]} intensity={0.5} color="#8a00d4" />
          
          <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
          
          <UniverseGraph data={data} onNodeClick={onNodeClick} />
          <OrbitControls 
            makeDefault 
            enableDamping 
            dampingFactor={0.05} 
            minDistance={10} 
            maxDistance={80} 
            autoRotate={false}
          />
        </Canvas>
      </div>

      <div className="absolute bottom-0 left-0 right-0 z-10 p-2 border-t border-studio-border/30 bg-black/40 backdrop-blur-md flex flex-wrap gap-2 text-xs">
        {communityIds.map((cId) => (
          <div key={cId} className="flex items-center gap-1 text-[10px] uppercase text-slate-400">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: getCommunityColor(cId), boxShadow: `0 0 8px ${getCommunityColor(cId)}` }}
            />
            {cId}
          </div>
        ))}
      </div>
    </div>
  );
};
