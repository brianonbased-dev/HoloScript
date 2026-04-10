'use client';

/**
 * PhysicsDebugOverlay — renders Rapier collider wireframes inside the R3F Canvas
 *
 * Shows bounding box lines for each registered physics body.
 * Only rendered when physicsStore.debugVisible is true.
 *
 * Uses R3F's <lineSegments> with BufferGeometry for efficient batch rendering.
 */

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { usePhysicsStore } from '@/lib/physicsStore';

export function PhysicsDebugOverlay() {
  const { world, debugVisible } = usePhysicsStore();
  const lineRef = useRef<THREE.LineSegments>(null);

  useFrame(() => {
    if (!world || !debugVisible || !lineRef.current) return;

    try {
      // Rapier's built-in debug render buffers
      const { vertices, colors } = world.debugRender();

      const geo = lineRef.current.geometry;
      geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    } catch {
      // Rapier WASM not yet loaded or world freed
    }
  });

  if (!debugVisible) return null;

  return (
    <lineSegments ref={lineRef}>
      <bufferGeometry />
      <lineBasicMaterial vertexColors transparent opacity={0.8} />
    </lineSegments>
  );
}
