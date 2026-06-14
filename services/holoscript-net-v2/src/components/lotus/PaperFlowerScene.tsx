'use client';

/**
 * PaperFlowerScene — the 42-petal Fibonacci genesis sculpture (garden.seedable),
 * with each paper-bound petal's openness + tint driven by its REAL live
 * paper-audit health (deriveLotusHealth, baked in). The flower is an HONEST
 * instrument (F.037): 2 petals visibly WILT — TVCG "Trust by Construction"
 * (health 0.63, 3 failing pillars) and "Verifiable IK / IK Under Contract"
 * (retired) — because the papers earn it, not because anyone forced full bloom.
 *
 * Petal geometry is the REAL compiled botanical petal mesh; placement is the REAL
 * golden-angle spiral from the morphogenesis sim. Material is MeshStandardMaterial
 * keyed to the real per-petal palette (the documented runtime-safe fallback).
 */
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { BakedScene, BakedPaperPetal } from './bakedTypes';
import { bloomOpenness, bloomTint } from './bakedTypes';
import { usePetalGeometry } from './primitives';

const WILT_BROWN = new THREE.Color('#6b5a3a');

function petalMaterialColor(petal: BakedPaperPetal): THREE.Color {
  const base = new THREE.Color(petal.color);
  const bloom = petal.bloomHealth ?? petal.bloomAuthored;
  const { dim, brown } = bloomTint(bloom);
  base.multiplyScalar(dim);
  if (brown) base.lerp(WILT_BROWN, 0.55); // honest wilt: petal browns + dims
  return base;
}

function Petal({
  petal,
  geometry,
}: {
  petal: BakedPaperPetal;
  geometry: THREE.BufferGeometry;
}) {
  const ref = useRef<THREE.Group>(null);
  const material = useMemo(() => {
    const c = petalMaterialColor(petal);
    return new THREE.MeshStandardMaterial({
      color: c,
      roughness: 0.45,
      metalness: 0,
      side: THREE.DoubleSide,
      emissive: c.clone().multiplyScalar(petal.bloomHealth === 'wilted' ? 0.02 : 0.14),
      emissiveIntensity: petal.bloomHealth === 'wilted' ? 0.15 : 0.5,
    });
  }, [petal]);

  useEffect(() => () => material.dispose(), [material]);

  // Openness from REAL bloom: wilted/sealed petals stay near-closed (droop), full
  // petals splay outward. A wilt also droops downward (negative tilt).
  const open = bloomOpenness(petal.bloomHealth ?? petal.bloomAuthored);
  const wilted = petal.bloomHealth === 'wilted';
  const tilt = wilted ? -0.55 : THREE.MathUtils.lerp(-0.1, 0.95, open);
  const radius = petal.radius;

  // Gentle idle sway so the live flower breathes (no hand-authored clock — phase
  // is just elapsed time, so it stays deterministic per-frame).
  useFrame((state) => {
    const g = ref.current;
    if (!g) return;
    const sway = Math.sin(state.clock.elapsedTime * 0.6 + petal.index) * 0.02;
    g.rotation.x = tilt + sway;
  });

  return (
    <group rotation={[0, petal.angle, 0]}>
      <group position={[0, 0, radius]}>
        <group
          ref={ref}
          rotation={[tilt, 0, 0]}
        >
          <mesh
            geometry={geometry}
            material={material}
            scale={(petal.ring === 1 ? 0.85 : petal.ring === 2 ? 0.78 : 0.7) * petal.height * 1.1}
            castShadow
          />
        </group>
        {wilted && (
          <Html center distanceFactor={9} position={[0, 0.1, 0.1]} occlude>
            <div
              style={{
                fontSize: 9,
                whiteSpace: 'nowrap',
                color: '#ffd0a0',
                background: 'rgba(20,8,0,0.7)',
                border: '1px solid rgba(255,170,90,0.5)',
                borderRadius: 6,
                padding: '2px 6px',
                pointerEvents: 'none',
                transform: 'translateY(-14px)',
              }}
            >
              wilted · health {((petal.health ?? 0) * 100).toFixed(0)}%
            </div>
          </Html>
        )}
      </group>
    </group>
  );
}

export function PaperFlowerScene({ scene }: { scene: BakedScene }) {
  const geometry = usePetalGeometry(scene.petalGeometry);
  const center = (scene.center ?? {}) as {
    seedPod?: string;
    seedPodRim?: string;
    stamen?: string;
    stamenTip?: string;
    stamenCount?: number;
  };
  const stamenCount = Math.min(center.stamenCount ?? 40, 56);
  const stamens = useMemo(
    () =>
      Array.from({ length: stamenCount }, (_, i) => ({
        a: (i / stamenCount) * Math.PI * 2,
        lean: 0.2 + (i % 4) * 0.04,
        len: 0.18 + (i % 3) * 0.03,
      })),
    [stamenCount]
  );

  return (
    <group position={[0, 0.6, 0]} scale={0.42}>
      {/* Seed-pod center (the real receptacle palette). */}
      <mesh position={[0, 0, 0]} scale={[1, 0.7, 1]} castShadow>
        <sphereGeometry args={[0.6, 28, 20]} />
        <meshStandardMaterial color={center.seedPod ?? '#f4d74a'} roughness={0.6} />
      </mesh>
      {stamens.map((s, i) => (
        <group key={i} rotation={[0, s.a, 0]}>
          <group position={[0, 0, 0.5]} rotation={[-s.lean, 0, 0]}>
            <mesh position={[0, s.len / 2, 0]}>
              <cylinderGeometry args={[0.01, 0.014, s.len, 6]} />
              <meshStandardMaterial color={center.stamen ?? '#f59e0b'} roughness={0.5} />
            </mesh>
            <mesh position={[0, s.len, 0]}>
              <sphereGeometry args={[0.03, 8, 8]} />
              <meshStandardMaterial
                color={center.stamenTip ?? '#fff4bd'}
                emissive={center.stamenTip ?? '#fff4bd'}
                emissiveIntensity={0.3}
              />
            </mesh>
          </group>
        </group>
      ))}
      {geometry &&
        (scene.paperPetals ?? []).map((p) => <Petal key={p.index} petal={p} geometry={geometry} />)}
    </group>
  );
}
