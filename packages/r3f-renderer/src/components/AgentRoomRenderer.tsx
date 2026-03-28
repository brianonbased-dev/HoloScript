import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, RoundedBox, Float, Html } from '@react-three/drei';
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FurnitureItem {
  id: string;
  type: string;
  position: [number, number, number];
}

export interface AgentRoomRendererProps {
  /** Room dimensions [width, height, depth] */
  dimensions?: [number, number, number];
  /** Room name */
  roomName?: string;
  /** Environment preset */
  environment?: string;
  /** Furniture items */
  furniture?: FurnitureItem[];
  /** Current visitor count */
  visitorCount?: number;
  /** Max visitors */
  maxVisitors?: number;
  /** Primary theme color (hex) */
  themeColor?: string;
  /** Accent theme color (hex) */
  accentColor?: string;
  /** Surface material preset */
  surfaceMaterial?: 'matte' | 'glossy' | 'neon' | 'holographic' | 'glass';
  /** Owner name */
  ownerName?: string;
}

// ---------------------------------------------------------------------------
// Environment color palettes
// ---------------------------------------------------------------------------

const ENV_COLORS: Record<string, { floor: string; walls: string; ceiling: string; ambient: string }> = {
  default:  { floor: '#1a1b26', walls: '#111827', ceiling: '#0f172a', ambient: '#334155' },
  sunset:   { floor: '#2d1b2e', walls: '#1a0f1f', ceiling: '#0d0512', ambient: '#f97316' },
  ocean:    { floor: '#0c1929', walls: '#0a1628', ceiling: '#061018', ambient: '#0ea5e9' },
  forest:   { floor: '#0f1f0d', walls: '#0a1a0a', ceiling: '#061206', ambient: '#22c55e' },
  void:     { floor: '#050505', walls: '#030303', ceiling: '#010101', ambient: '#6366f1' },
  neon:     { floor: '#0d0d14', walls: '#0a0a0f', ceiling: '#050508', ambient: '#f0abfc' },
};

// ---------------------------------------------------------------------------
// Material factory
// ---------------------------------------------------------------------------

function useSurfaceMaterial(preset: string, color: string) {
  return useMemo(() => {
    const c = new THREE.Color(color);
    switch (preset) {
      case 'glossy':
        return { color: c, roughness: 0.1, metalness: 0.8, clearcoat: 1 };
      case 'neon':
        return { color: c, roughness: 0.3, metalness: 0.5, emissive: c, emissiveIntensity: 0.4 };
      case 'holographic':
        return { color: c, roughness: 0, metalness: 1, iridescence: 1, iridescenceIOR: 1.5 };
      case 'glass':
        return { color: c, roughness: 0, metalness: 0, transmission: 0.8, transparent: true, opacity: 0.3 };
      default: // matte
        return { color: c, roughness: 0.9, metalness: 0.1 };
    }
  }, [preset, color]);
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function AgentRoomRenderer({
  dimensions = [10, 4, 10],
  roomName = 'My Room',
  environment = 'default',
  furniture = [],
  visitorCount = 0,
  maxVisitors = 20,
  themeColor = '#6366f1',
  accentColor = '#a78bfa',
  surfaceMaterial = 'matte',
  ownerName = 'Agent',
}: AgentRoomRendererProps) {
  const groupRef = useRef<THREE.Group>(null);
  const [w, h, d] = dimensions;
  const env = ENV_COLORS[environment] || ENV_COLORS.default;
  const floorMat = useSurfaceMaterial(surfaceMaterial, env.floor);
  const wallMat = useSurfaceMaterial(surfaceMaterial, env.walls);

  return (
    <group ref={groupRef} name="agent-room">
      {/* Ambient light */}
      <ambientLight intensity={0.3} color={env.ambient} />
      <pointLight position={[0, h - 0.5, 0]} intensity={0.6} color={themeColor} distance={w * 1.5} />

      {/* Floor */}
      <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[w, d]} />
        <meshPhysicalMaterial {...floorMat} />
      </mesh>

      {/* Ceiling */}
      <mesh position={[0, h, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color={env.ceiling} roughness={0.95} />
      </mesh>

      {/* Back wall */}
      <mesh position={[0, h / 2, -d / 2]}>
        <planeGeometry args={[w, h]} />
        <meshPhysicalMaterial {...wallMat} />
      </mesh>

      {/* Left wall */}
      <mesh position={[-w / 2, h / 2, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[d, h]} />
        <meshPhysicalMaterial {...wallMat} />
      </mesh>

      {/* Right wall */}
      <mesh position={[w / 2, h / 2, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[d, h]} />
        <meshPhysicalMaterial {...wallMat} />
      </mesh>

      {/* Room name sign */}
      <Float speed={0.5} rotationIntensity={0} floatIntensity={0.1}>
        <Text
          position={[0, h - 0.6, -d / 2 + 0.1]}
          fontSize={0.4}
          color={themeColor}
          anchorX="center"
          anchorY="middle"
          maxWidth={w * 0.8}
        >
          {roomName}
        </Text>
      </Float>

      {/* Owner badge (below room name) */}
      <Text
        position={[0, h - 1.1, -d / 2 + 0.1]}
        fontSize={0.15}
        color={accentColor}
        anchorX="center"
      >
        {ownerName}&apos;s Space
      </Text>

      {/* Visitor counter */}
      <Html position={[w / 2 - 0.5, h - 0.3, -d / 2 + 0.1]} transform>
        <div style={{
          background: 'rgba(0,0,0,0.7)',
          color: visitorCount >= maxVisitors ? '#f87171' : '#06b6d4',
          padding: '2px 8px',
          borderRadius: '6px',
          fontSize: '11px',
          fontFamily: 'monospace',
          whiteSpace: 'nowrap',
        }}>
          {visitorCount}/{maxVisitors}
        </div>
      </Html>

      {/* Furniture */}
      {furniture.map((item) => (
        <FurniturePiece key={item.id} item={item} accentColor={accentColor} />
      ))}

      {/* Grid lines on floor for spatial reference */}
      <gridHelper args={[w, w, 0x333333, 0x222222]} position={[0, 0.01, 0]} />
    </group>
  );
}

// ---------------------------------------------------------------------------
// Furniture
// ---------------------------------------------------------------------------

const FURNITURE_SHAPES: Record<string, { size: [number, number, number]; color: string }> = {
  table:    { size: [1.5, 0.8, 0.8], color: '#4a3728' },
  chair:    { size: [0.5, 0.9, 0.5], color: '#374151' },
  shelf:    { size: [2, 1.5, 0.4], color: '#44403c' },
  lamp:     { size: [0.3, 1.2, 0.3], color: '#fbbf24' },
  plant:    { size: [0.4, 0.8, 0.4], color: '#16a34a' },
  screen:   { size: [1.6, 1, 0.05], color: '#1e40af' },
  generic:  { size: [0.8, 0.8, 0.8], color: '#6b7280' },
};

function FurniturePiece({ item, accentColor }: { item: FurnitureItem; accentColor: string }) {
  const shape = FURNITURE_SHAPES[item.type] || FURNITURE_SHAPES.generic;
  const [sx, sy, sz] = shape.size;
  const pos = item.position;

  return (
    <group position={[pos[0], pos[1] + sy / 2, pos[2]]}>
      <RoundedBox args={[sx, sy, sz]} radius={0.05} smoothness={2} castShadow>
        <meshPhysicalMaterial color={shape.color} roughness={0.6} metalness={0.2} />
      </RoundedBox>
      {/* Highlight ring on hover placeholder */}
      {item.type === 'lamp' && (
        <pointLight position={[0, sy / 2, 0]} intensity={0.4} color={accentColor} distance={3} />
      )}
    </group>
  );
}
