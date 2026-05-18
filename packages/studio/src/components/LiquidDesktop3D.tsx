'use client';

import React, { useRef, useEffect, Suspense } from 'react';
import { Canvas, useFrame, useThree, ThreeEvent } from '@react-three/fiber';
import { PerspectiveCamera, Html } from '@react-three/drei';
import * as THREE from 'three';

/**
 * LiquidDesktop3D — 3D stationary "fish tank" view for HoloShell.
 * 
 * Replaces the previous flat 2D desktop with true depth-layered 3D:
 * - Fixed perspective camera (stationary user, like looking into a tank).
 * - Objects have real Z depth.
 * - Device tilt / pointer produces parallax on a root group.
 * - Touch/click performs depth raycast (selects the first object along the ray).
 * - Volumetric hints for fire/water/bubbles (placeholder for now, can be upgraded to shader).
 *
 * This directly fulfills the P2 task "HoloShell: 3D stationary view — LiquidDesktop depth upgrade".
 */

interface LiquidDesktop3DProps {
  children?: React.ReactNode; // the actual desktop icons, windows, agents, etc.
  onObjectSelect?: (id: string | null, point: THREE.Vector3) => void;
  reaction?: number; // 0-1 intensity for environmental feedback (floor/bubbles react to actions)
}

function TiltParallaxGroup({ children }: { children: React.ReactNode }) {
  const groupRef = useRef<THREE.Group>(null!);
  const { gl } = useThree();

  useEffect(() => {
    const handleOrientation = (event: DeviceOrientationEvent) => {
      if (!groupRef.current) return;
      const beta = (event.beta || 0) * (Math.PI / 180) * 0.6;   // pitch
      const gamma = (event.gamma || 0) * (Math.PI / 180) * 0.6; // roll

      groupRef.current.rotation.x = THREE.MathUtils.lerp(
        groupRef.current.rotation.x,
        beta * 0.25,
        0.1
      );
      groupRef.current.rotation.y = THREE.MathUtils.lerp(
        groupRef.current.rotation.y,
        gamma * 0.25,
        0.1
      );
    };

    // Fallback for desktop: mouse/pointer tilt
    const handlePointer = (e: PointerEvent) => {
      if (!groupRef.current) return;
      const rect = gl.domElement.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      const ny = ((e.clientY - rect.top) / rect.height - 0.5) * 2;

      groupRef.current.rotation.y = THREE.MathUtils.lerp(
        groupRef.current.rotation.y,
        nx * 0.15,
        0.12
      );
      groupRef.current.rotation.x = THREE.MathUtils.lerp(
        groupRef.current.rotation.x,
        -ny * 0.12,
        0.12
      );
    };

    window.addEventListener('deviceorientation', handleOrientation as any);
    window.addEventListener('pointermove', handlePointer);

    return () => {
      window.removeEventListener('deviceorientation', handleOrientation as any);
      window.removeEventListener('pointermove', handlePointer);
    };
  }, [gl]);

  return <group ref={groupRef}>{children}</group>;
}

function DepthRaycaster({ onSelect }: { onSelect: (id: string | null, point: THREE.Vector3) => void }) {
  const { camera, scene, raycaster, pointer } = useThree();

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObjects(scene.children, true);

    if (intersects.length > 0) {
      const first = intersects[0];
      const userData = (first.object as any).userData;
      const id = userData?.id || userData?.objectId || null;
      onSelect(id, first.point);
    } else {
      onSelect(null, new THREE.Vector3());
    }
  };

  return (
    <mesh onClick={handleClick} visible={false}>
      <planeGeometry args={[1000, 1000]} />
      <meshBasicMaterial transparent opacity={0} />
    </mesh>
  );
}

export function LiquidDesktop3D({ children, onObjectSelect, reaction }: LiquidDesktop3DProps) {
  const handleSelect = (id: string | null, point: THREE.Vector3) => {
    onObjectSelect?.(id, point);
  };

  return (
    <div className="w-full h-full relative" style={{ background: 'linear-gradient(#0a0f1a, #05080f)' }}>
      <Canvas
        camera={{ position: [0, 0, 18], fov: 48, near: 0.1, far: 200 }}
        style={{ background: 'transparent' }}
        gl={{ 
          alpha: true, 
          antialias: true, 
          preserveDrawingBuffer: true,
          powerPreference: 'high-performance'
        }}
      >
        <Suspense fallback={null}>
          {/* Fixed perspective camera — user never moves, the world has depth */}
          <PerspectiveCamera makeDefault position={[0, 0, 18]} fov={48} />

          {/* Ambient + key lighting for depth */}
          <ambientLight intensity={0.35} />
          <directionalLight position={[-8, 12, 6]} intensity={0.9} castShadow />
          <pointLight position={[6, -4, -10]} intensity={0.6} color="#a5b4fc" />

          {/* 3D HoloShell Desktop Environment — the "fish tank" world */}
          <TiltParallaxGroup>
            {/* Desktop "water/floor" at real depth — reacts to actions (environmental feedback P2) */}
            <mesh position={[0, -5.5, -2]} rotation={[-Math.PI * 0.42, 0, 0]}>
              <planeGeometry args={[42, 28]} />
              <meshPhongMaterial 
                color="#1a2a4a" 
                shininess={80} 
                transparent 
                opacity={0.65 - (reaction ?? 0) * 0.35} // clearer when reaction high (Brittney acted)
              />
            </mesh>

            {/* Low-poly "desk" furniture elements at different depths for true 3D feel */}
            <mesh position={[-9, -3.8, -4]}>
              <boxGeometry args={[6, 0.6, 4]} />
              <meshPhongMaterial color="#334155" shininess={20} />
            </mesh>
            <mesh position={[11, -3.2, -1]}>
              <boxGeometry args={[5, 0.5, 3.5]} />
              <meshPhongMaterial color="#475569" shininess={15} />
            </mesh>

            {/* Subtle "bubble/leaf" particles as instanced hints (react to Brittney actions — environmental feedback P2) */}
            {Array.from({ length: Math.max(4, Math.floor(18 * (1 - (reaction ?? 0) * 0.7))) }).map((_, i) => (
              <mesh
                key={i}
                position={[
                  (i % 6 - 2.5) * 3.2 + (i % 3) * 0.4,
                  -2.5 - (i % 4) * 0.8,
                  -3 - Math.floor(i / 6) * 1.5,
                ]}
              >
                <sphereGeometry args={[0.18 + (i % 3) * 0.06]} />
                <meshBasicMaterial color="#64748b" transparent opacity={0.35 + (i % 2) * 0.15} />
              </mesh>
            ))}

            {/* The actual desktop content (agents, windows, etc.) lives at real Z depths inside this group */}
            {children}
          </TiltParallaxGroup>

          {/* Invisible large plane for depth raycasting (touch/click with depth) */}
          <DepthRaycaster onSelect={handleSelect} />

          {/* Very subtle fog for depth cueing */}
          <fog attach="fog" args={['#05080f', 22, 65]} />
        </Suspense>
      </Canvas>

      {/* Optional 2D overlay HUD that stays screen-space (taskbar, notifications, etc.) */}
      <div className="absolute inset-0 pointer-events-none z-10">
        {/* HoloShell can render its 2D chrome here if needed */}
      </div>
    </div>
  );
}

export default LiquidDesktop3D;