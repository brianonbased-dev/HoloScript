'use client';

/**
 * primitives — reconstruct the stock geometry the HoloScript R3F renderer uses
 * (packages/r3f-renderer getGeometry) for the baked pond scaffold + symbolic
 * nodes, using ONLY three/R3F. Self-contained: no @holoscript/r3f-renderer at
 * runtime. Keeps the lily-pad notch + reflective water read of the real renderer.
 */
import { useMemo } from 'react';
import * as THREE from 'three';
import type { BakedGeometry, BakedPrimitive } from './bakedTypes';

/** Build a three BufferGeometry from a baked compiled petal mesh (real geometry). */
export function usePetalGeometry(g: BakedGeometry | undefined): THREE.BufferGeometry | null {
  return useMemo(() => {
    if (!g || g.positions.length === 0) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(g.positions, 3));
    if (g.normals.length) geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.normals, 3));
    if (g.uv.length) geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2));
    if (g.indices.length) geo.setIndex(g.indices);
    if (!g.normals.length) geo.computeVertexNormals();
    return geo;
  }, [g]);
}

/** Render a baked primitive (water/pad/stem/leaf/symbolic node) as a stock mesh. */
export function Primitive({ prim }: { prim: BakedPrimitive }) {
  const geometry = useMemo(() => renderGeometry(prim), [prim]);
  const emissiveIntensity =
    prim.emissiveIntensity !== undefined ? Math.min(prim.emissiveIntensity, 1.5) : 0;
  return (
    <mesh
      position={prim.position}
      rotation={prim.rotation}
      scale={prim.scale as [number, number, number] | number | undefined}
      castShadow
      receiveShadow
    >
      {geometry}
      <meshStandardMaterial
        color={prim.color ?? '#888888'}
        roughness={prim.roughness ?? 0.7}
        metalness={prim.reflective ? 0.6 : prim.metalness ?? 0}
        emissive={prim.emissive ?? '#000000'}
        emissiveIntensity={emissiveIntensity}
        side={prim.hsType === 'plane' || prim.hsType === 'circle' || prim.hsType === 'lilypad' ? THREE.DoubleSide : THREE.FrontSide}
      />
    </mesh>
  );
}

function num(v: number | undefined, fb: number): number {
  return typeof v === 'number' ? v : fb;
}

/** Mirror of r3f-renderer getGeometry for the hsTypes the baked scenes use. */
function renderGeometry(p: BakedPrimitive): React.ReactElement {
  switch (p.hsType) {
    case 'plane':
      return <planeGeometry args={[num(p.width, 1), num(p.height, 1)]} />;
    case 'cylinder':
      return (
        <cylinderGeometry
          args={[num(p.radiusTop, 0.05), num(p.radiusBottom, 0.05), num(p.height, 1), 24]}
        />
      );
    case 'circle':
    case 'disc':
      return <circleGeometry args={[num(p.radius, 1), 40]} />;
    case 'lilypad': {
      const notch = num(p.notchAngle, 0.55);
      return <circleGeometry args={[num(p.radius, 1), 56, notch / 2, Math.PI * 2 - notch]} />;
    }
    case 'cone':
    case 'pyramid':
      return <coneGeometry args={[num(p.radius, 0.5), num(p.height, 1), 16]} />;
    case 'sphere':
      return <sphereGeometry args={[num(p.radius, 0.5), 24, 18]} />;
    case 'cube':
    case 'box':
    default:
      return <boxGeometry args={[1, 1, 1]} />;
  }
}
