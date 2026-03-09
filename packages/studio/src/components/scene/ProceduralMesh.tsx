'use client';

/**
 * ProceduralMesh — R3F component that renders procedural geometry
 * (hull/metaball, spline tube, lofted membrane) using the shared
 * generators from @holoscript/core.
 *
 * Includes:
 * - Scale texture generation (canvas-based hexagonal scales)
 * - Keyframe animation support (useFrame pulsing)
 * - Fire ember particle system
 */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  generateSplineGeometry,
  generateHullGeometry,
  generateMembraneGeometry,
  type GeometryData,
  type BlobDef,
} from '@holoscript/core';

// =============================================================================
// ProceduralGeometry — generates BufferGeometry from procedural data
// =============================================================================

interface ProceduralMeshProps {
  type: 'hull' | 'spline' | 'membrane';
  blobs?: BlobDef[];
  resolution?: number;
  threshold?: number;
  points?: number[][];
  radii?: number[];
  anchors?: number[][];
  subdivisions?: number;
  bulge?: number;
}

function toBufferGeometry(data: GeometryData): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(data.uvs, 2));
  geo.setIndex(new THREE.BufferAttribute(data.indices, 1));
  geo.computeBoundingSphere();
  return geo;
}

export function ProceduralGeometryComponent({ type, ...props }: ProceduralMeshProps) {
  const geometry = useMemo(() => {
    let data: GeometryData;
    switch (type) {
      case 'hull':
        data = generateHullGeometry(
          props.blobs || [],
          props.resolution || 24,
          props.threshold || 1.0
        );
        break;
      case 'spline':
        data = generateSplineGeometry(props.points || [], props.radii || [0.1], 32, 12);
        break;
      case 'membrane':
        data = generateMembraneGeometry(
          props.anchors || [],
          props.subdivisions || 8,
          props.bulge || 0.15
        );
        break;
      default:
        return new THREE.BoxGeometry(1, 1, 1);
    }
    return toBufferGeometry(data);
  }, [
    type,
    props.blobs,
    props.points,
    props.radii,
    props.anchors,
    props.subdivisions,
    props.bulge,
    props.resolution,
    props.threshold,
  ]);

  return <primitive object={geometry} attach="geometry" />;
}

// =============================================================================
// Scale Texture — procedural canvas hexagonal scale pattern
// =============================================================================

let _cachedScaleTexture: THREE.CanvasTexture | null = null;

/** Generates a reusable hexagonal scale texture via Canvas 2D */
export function getScaleTexture(): THREE.CanvasTexture {
  if (_cachedScaleTexture) return _cachedScaleTexture;

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Fill background
  ctx.fillStyle = 'rgb(30,15,61)';
  ctx.fillRect(0, 0, size, size);

  const scaleSize = size / 12;
  const hexH = scaleSize;
  const hexW = scaleSize * Math.sqrt(3);

  // Seeded jitter for consistency
  let seed = 42;
  function seededRandom() {
    seed = (seed * 16807 + 0) % 2147483647;
    return (seed - 1) / 2147483646;
  }

  for (let row = -1; row < size / (hexH * 0.75) + 2; row++) {
    for (let col = -1; col < size / hexW + 2; col++) {
      const isOdd = Math.abs(row) % 2 === 1;
      const cx = col * hexW + (isOdd ? hexW * 0.5 : 0);
      const cy = row * hexH * 0.75;

      const jitter = (seededRandom() - 0.5) * 30;
      const r = Math.max(0, Math.min(255, Math.round(30 + jitter * 0.4)));
      const g = Math.max(0, Math.min(255, Math.round(15 + jitter * 0.3)));
      const b = Math.max(0, Math.min(255, Math.round(61 + jitter * 0.6)));

      // Draw hex
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 6;
        const px = cx + Math.cos(angle) * scaleSize * 0.47;
        const py = cy + Math.sin(angle) * scaleSize * 0.47;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fill();
      ctx.strokeStyle = 'rgb(20,12,40)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Specular dot
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, scaleSize * 0.1);
      grad.addColorStop(0, 'rgba(100,80,160,0.5)');
      grad.addColorStop(1, 'rgba(100,80,160,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, scaleSize * 0.1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  _cachedScaleTexture = tex;
  return tex;
}

// =============================================================================
// FireEmbers — instanced particle system for fire embers
// =============================================================================

const EMBER_COUNT = 60;

interface FireEmbersProps {
  position: [number, number, number];
}

export function FireEmbers({ position }: FireEmbersProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  // Initialize ember positions
  const embers = useMemo(() => {
    const data: {
      x: number;
      y: number;
      z: number;
      vx: number;
      vy: number;
      vz: number;
      life: number;
      speed: number;
    }[] = [];
    for (let i = 0; i < EMBER_COUNT; i++) {
      data.push({
        x: (Math.random() - 0.5) * 0.6,
        y: Math.random() * 0.5,
        z: Math.random() * 2.0,
        vx: (Math.random() - 0.5) * 0.02,
        vy: Math.random() * 0.03 + 0.01,
        vz: Math.random() * 0.05 + 0.03,
        life: Math.random(),
        speed: 0.5 + Math.random() * 1.5,
      });
    }
    return data;
  }, []);

  useFrame((state, delta) => {
    if (!meshRef.current) return;
    const t = state.clock.elapsedTime;

    for (let i = 0; i < EMBER_COUNT; i++) {
      const e = embers[i];
      e.life += delta * e.speed * 0.5;
      if (e.life > 1) {
        e.life = 0;
        e.x = (Math.random() - 0.5) * 0.4;
        e.y = (Math.random() - 0.5) * 0.3;
        e.z = 0;
      }

      const px = e.x + Math.sin(t * 3 + i) * 0.05 * e.life;
      const py = e.y + e.life * 0.8;
      const pz = e.z + e.life * 2.0;

      dummy.position.set(position[0] + px, position[1] + py, position[2] + pz);

      const s = (1 - e.life) * 0.03;
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, EMBER_COUNT]}>
      <sphereGeometry args={[1, 6, 6]} />
      <meshBasicMaterial color="#ff6600" transparent opacity={0.8} />
    </instancedMesh>
  );
}

// =============================================================================
// KeyframeAnimator — simple pulsing animation from keyframe data
// =============================================================================

interface KeyframeAnimatorProps {
  meshRef: React.RefObject<THREE.Mesh>;
  keyframes?: Record<string, any>;
}

export function useKeyframeAnimation(
  meshRef: React.RefObject<THREE.Mesh | THREE.Group | null>,
  keyframes?: Record<string, any>
) {
  useFrame((state) => {
    if (!meshRef.current || !keyframes) return;

    // Find the first keyframe set and animate scale
    const firstKey = Object.keys(keyframes)[0];
    if (!firstKey) return;

    const kf = keyframes[firstKey];
    const duration = (kf.duration || 1000) / 1000; // ms to seconds
    const t = (state.clock.elapsedTime % duration) / duration;

    // Simple sine-based interpolation for "breathe" effect
    if (firstKey.includes('breathe') || firstKey.includes('pulse') || firstKey.includes('Pulse')) {
      const breathe = 1 + Math.sin(t * Math.PI * 2) * 0.05;
    }
  });
}
