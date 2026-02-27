'use client';

/**
 * SketchStroke — renders a single 3D freehand stroke as a TubeGeometry.
 *
 * Points come from sketchStore. The tube radius = stroke.size.
 * Material switches between 4 brush styles: neon, chalk, ink, glow.
 */

import { useMemo } from 'react';
import * as THREE from 'three';
import type { Stroke } from '@/lib/sketchStore';

interface Props {
  stroke: Stroke;
}

function materialForBrush(
  color: string,
  style: Stroke['material']
): THREE.Material {
  const hex = new THREE.Color(color);

  switch (style) {
    case 'neon':
      return new THREE.MeshStandardMaterial({
        color: hex,
        emissive: hex,
        emissiveIntensity: 2.5,
        roughness: 0.1,
        metalness: 0.0,
      });
    case 'chalk':
      return new THREE.MeshStandardMaterial({
        color: hex,
        roughness: 0.95,
        metalness: 0.0,
      });
    case 'ink':
      return new THREE.MeshStandardMaterial({
        color: hex,
        roughness: 0.3,
        metalness: 0.0,
      });
    case 'glow':
      return new THREE.MeshBasicMaterial({
        color: hex,
        transparent: true,
        opacity: 0.75,
      });
    default:
      return new THREE.MeshStandardMaterial({ color: hex });
  }
}

export function SketchStroke({ stroke }: Props) {
  const { points, color, size, material: brushMat } = stroke;

  const tubeGeometry = useMemo(() => {
    if (points.length < 2) return null;
    const path = new THREE.CatmullRomCurve3(
      points.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
      false,
      'catmullrom',
      0.5
    );
    return new THREE.TubeGeometry(path, Math.max(points.length * 3, 12), size, 8, false);
  }, [points, size]);

  const mat = useMemo(
    () => materialForBrush(color, brushMat),
    [color, brushMat]
  );

  if (!tubeGeometry) return null;

  return <mesh geometry={tubeGeometry} material={mat} />;
}
