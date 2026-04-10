import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { OrbData } from '../types';
import * as THREE from 'three';

interface OrbProps {
  orb: OrbData;
  onSelect?: (orbId: string) => void;
  isSelected?: boolean;
  timeScale?: number;
  julianDate?: number;
}

export const Orb = ({ orb, onSelect, isSelected, timeScale = 1, julianDate = 0 }: OrbProps) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const groupRef = useRef<THREE.Group>(null);
  const color = orb.hologram?.color || '#00ffff';
  const size = orb.hologram?.size || 1;
  const isCube = orb.hologram?.shape === 'cube';

  useFrame((state, delta) => {
    if (groupRef.current) {
      // Smooth interpolation to target position
      const targetPos = new THREE.Vector3(orb.position.x, orb.position.y, orb.position.z);
      groupRef.current.position.lerp(targetPos, 0.1);
    }

    if (meshRef.current) {
      // Planetary Rotation (Spin) - Absolute Sync to Julian Date
      // rotationPeriod is in days. julianDate is in days.
      // Total full rotations = julianDate / rotationPeriod
      // Total radians = (julianDate / rotationPeriod) * 2 * PI
      const rotationPeriod = orb.properties?.rotationPeriod || 1; // Default 1 day
      meshRef.current.rotation.y = (julianDate * 2 * Math.PI) / rotationPeriod;
    }
  });

  return (
    <group ref={groupRef}>
      <mesh
        ref={meshRef}
        onClick={(e) => {
          e.stopPropagation();
          onSelect?.(orb.id);
        }}
        onPointerOver={() => (document.body.style.cursor = 'pointer')}
        onPointerOut={() => (document.body.style.cursor = 'auto')}
      >
        {isCube ? (
          <boxGeometry args={[size, size, size]} />
        ) : (
          <sphereGeometry args={[size, 32, 32]} />
        )}
        <meshStandardMaterial
          color={color}
          emissive={orb.hologram?.glow || isSelected ? color : '#000000'}
          emissiveIntensity={isSelected ? 1 : 0.5}
          transparent
          opacity={0.8}
        />
      </mesh>

      {/* Selection Halo */}
      {isSelected && (
        <mesh rotation-x={Math.PI / 2}>
          <ringGeometry args={[size * 1.2, size * 1.3, 32]} />
          <meshBasicMaterial color={color} transparent opacity={0.5} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Label */}
      <Html distanceFactor={10}>
        <div
          style={{
            color: 'white',
            background: 'rgba(0,0,0,0.5)',
            padding: '2px 5px',
            borderRadius: '4px',
            fontSize: '12px',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {orb.name}
          {orb.traits && orb.traits.length > 0 && (
            <span style={{ fontSize: '10px', color: '#aaa', display: 'block' }}>
              [{orb.traits.join(', ')}]
            </span>
          )}
        </div>
      </Html>
    </group>
  );
};
