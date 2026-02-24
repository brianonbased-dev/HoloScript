/**
 * BrittneyAvatarMesh — A stylised low-poly proxy for Brittney's VR presence.
 *
 * Until a proper glTF is available this uses procedural Three.js geometry
 * (layered capsules + spheres) that reads like a simplified humanoid bust.
 *
 * Props:
 *   isSpeaking — drives a jaw-scale animation
 */

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface BrittneyAvatarMeshProps {
  isSpeaking: boolean;
}

export function BrittneyAvatarMesh({ isSpeaking }: BrittneyAvatarMeshProps) {
  const headRef = useRef<THREE.Mesh>(null);
  const bodyRef = useRef<THREE.Mesh>(null);
  const jawRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const t = useRef(0);

  useFrame((_, delta) => {
    t.current += delta;

    // Idle head-bob
    if (headRef.current) {
      headRef.current.position.y = 0.14 + Math.sin(t.current * 1.8) * 0.005;
    }

    // Aura pulse
    if (glowRef.current) {
      const s = 1 + Math.sin(t.current * 2.5) * 0.04;
      glowRef.current.scale.setScalar(s);
      (glowRef.current.material as THREE.MeshBasicMaterial).opacity =
        0.08 + Math.sin(t.current * 2.5) * 0.04;
    }

    // Jaw open/close when speaking
    if (jawRef.current) {
      const target = isSpeaking ? 0.012 + Math.abs(Math.sin(t.current * 12)) * 0.015 : 0;
      jawRef.current.scale.y = THREE.MathUtils.lerp(jawRef.current.scale.y, target === 0 ? 1 : 1 + target * 4, 0.25);
    }
  });

  return (
    <group>
      {/* Aura glow sphere */}
      <mesh ref={glowRef} position={[0, 0.1, 0]}>
        <sphereGeometry args={[0.12, 16, 16]} />
        <meshBasicMaterial color="#6366f1" transparent opacity={0.1} depthWrite={false} side={THREE.BackSide} />
      </mesh>

      {/* Body / torso */}
      <mesh ref={bodyRef} position={[0, -0.04, 0]}>
        <capsuleGeometry args={[0.04, 0.09, 4, 8]} />
        <meshStandardMaterial color="#1e1e2e" roughness={0.6} metalness={0.3} />
      </mesh>

      {/* Neck */}
      <mesh position={[0, 0.07, 0]}>
        <capsuleGeometry args={[0.018, 0.025, 4, 6]} />
        <meshStandardMaterial color="#c4a882" roughness={0.8} />
      </mesh>

      {/* Head */}
      <mesh ref={headRef} position={[0, 0.14, 0]}>
        <sphereGeometry args={[0.055, 20, 20]} />
        <meshStandardMaterial color="#c4a882" roughness={0.7} />
      </mesh>

      {/* Eyes */}
      {[-0.02, 0.02].map((x, i) => (
        <mesh key={i} position={[x, 0.148, 0.048]}>
          <sphereGeometry args={[0.008, 8, 8]} />
          <meshStandardMaterial color="#1a1a2e" roughness={0.2} />
        </mesh>
      ))}

      {/* Iris glow */}
      {[-0.02, 0.02].map((x, i) => (
        <mesh key={`iris-${i}`} position={[x, 0.148, 0.052]}>
          <sphereGeometry args={[0.004, 6, 6]} />
          <meshBasicMaterial color="#818cf8" />
        </mesh>
      ))}

      {/* Jaw / mouth indicator */}
      <mesh ref={jawRef} position={[0, 0.127, 0.048]}>
        <boxGeometry args={[0.022, 0.004, 0.004]} />
        <meshBasicMaterial color="#6366f1" />
      </mesh>

      {/* Hair (sphere cap) */}
      <mesh position={[0, 0.168, -0.005]}>
        <sphereGeometry args={[0.057, 14, 14, 0, Math.PI * 2, 0, Math.PI * 0.48]} />
        <meshStandardMaterial color="#4a3728" roughness={0.9} side={THREE.FrontSide} />
      </mesh>

      {/* Accent glow ring at base */}
      <mesh position={[0, -0.09, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.045, 0.055, 32]} />
        <meshBasicMaterial color="#6366f1" transparent opacity={0.6} />
      </mesh>
    </group>
  );
}
