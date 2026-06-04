'use client';

/**
 * CompiledLotusMeshNode — render the full lotus POND SCENE compiled from `.holo`
 * (I.007 closure: material + petal mesh + phyllotaxis bloom + stem + water + pads,
 * all from the `@botanical_lotus` declaration).
 *
 * R3FCompiler emits, for a `@botanical_lotus` node:
 *   - props.__compiledMaterial — the petal material spec,
 *   - props.__petalGeometry    — the petal mesh (three-free typed arrays),
 *   - props.__petalPlacements  — per-petal golden-angle placements (the bloom),
 *   - props.__lotusScene       — stem height + water/leaf colours (the pond).
 *
 * The bloom is built once (one shared material + BufferGeometry, a mesh per
 * placement via nested azimuth/tilt groups) and lifted onto a stem that rises from
 * the water; lily pads float on the surface. No hand-authored geometry, material,
 * or layout — the whole pond scene assembles from compiled `.holo`.
 */
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { R3FNode } from '@/types';
import { buildCompiledMaterial } from '@holoscript/r3f-renderer';

interface CompiledPetalGeometry {
  positions: Float32Array;
  normals: Float32Array;
  petalUv: Float32Array;
  veinPhase: Float32Array;
  indices: Uint32Array;
}

interface LotusPetalPlacement {
  azimuth: number;
  tilt: number;
  radius: number;
  lift: number;
  ring: number;
}

interface LotusScene {
  stemHeight: number;
  colors: { water: string; leaf: string; leafDark: string };
}

function wrapCompiledGeometry(g: CompiledPetalGeometry): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(g.positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(g.normals, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(g.petalUv, 2));
  geo.setAttribute('petalUv', new THREE.BufferAttribute(g.petalUv, 2));
  geo.setAttribute('veinPhase', new THREE.BufferAttribute(g.veinPhase, 1));
  geo.setIndex(new THREE.BufferAttribute(g.indices, 1));
  return geo;
}

/** A few lily pads floating on the water (deterministic positions). */
const LILY_PADS: { pos: [number, number, number]; r: number; rot: number; dark: boolean }[] = [
  { pos: [2.4, 0.02, 1.1], r: 1.2, rot: 0.3, dark: false },
  { pos: [-2.7, 0.02, -0.6], r: 1.5, rot: 1.2, dark: true },
  { pos: [0.6, 0.02, -3.0], r: 1.0, rot: 2.5, dark: false },
  { pos: [-1.4, 0.02, 2.8], r: 1.1, rot: 3.6, dark: true },
];

export function CompiledLotusMeshNode({ node }: { node: R3FNode }) {
  const { props } = node;
  const spec = props.__compiledMaterial as Parameters<typeof buildCompiledMaterial>[0];
  const petalGeometry = props.__petalGeometry as CompiledPetalGeometry;
  const placements = (props.__petalPlacements as LotusPetalPlacement[] | undefined) ?? [];
  const scene = props.__lotusScene as LotusScene | undefined;
  const stemHeight = scene?.stemHeight ?? 0;
  const water = scene?.colors.water ?? '#07140f';
  const leaf = scene?.colors.leaf ?? '#235f4f';
  const leafDark = scene?.colors.leafDark ?? '#102f28';

  const { material, chunkHandle } = useMemo(() => {
    const built = buildCompiledMaterial(spec);
    built.material.side = THREE.DoubleSide; // cupped petals read from both sides
    return built;
  }, [spec]);
  const geometry = useMemo(() => wrapCompiledGeometry(petalGeometry), [petalGeometry]);

  useEffect(() => {
    return () => {
      material.dispose();
      geometry.dispose();
    };
  }, [material, geometry]);

  useFrame((state) => {
    chunkHandle?.setUniform('uLotusTime', state.clock.elapsedTime);
  });

  const petals: LotusPetalPlacement[] =
    placements.length > 0 ? placements : [{ azimuth: 0, tilt: 0, radius: 0, lift: 0, ring: 1 }];

  return (
    <group
      position={props.position as [number, number, number] | undefined}
      rotation={props.rotation as [number, number, number] | undefined}
      scale={props.scale as number | [number, number, number] | undefined}
    >
      {/* Water surface */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[26, 26]} />
        <meshStandardMaterial color={water} roughness={0.18} metalness={0.55} />
      </mesh>

      {/* Lily pads */}
      {LILY_PADS.map((pad, i) => (
        <mesh key={`pad-${i}`} position={pad.pos} rotation={[-Math.PI / 2, 0, pad.rot]}>
          <circleGeometry args={[pad.r, 40]} />
          <meshStandardMaterial color={pad.dark ? leafDark : leaf} roughness={0.85} side={THREE.DoubleSide} />
        </mesh>
      ))}

      {/* Stem rising from the water to the flower base */}
      <mesh position={[0, stemHeight / 2, 0]}>
        <cylinderGeometry args={[0.045, 0.06, stemHeight, 14]} />
        <meshStandardMaterial color={leafDark} roughness={0.7} />
      </mesh>

      {/* The bloom, lifted onto the stem */}
      <group position={[0, stemHeight, 0]} scale={1.8}>
        {petals.map((p, i) => (
          <group key={i} rotation={[0, p.azimuth, 0]}>
            <group position={[0, p.lift, p.radius]} rotation={[p.tilt, 0, 0]}>
              <mesh geometry={geometry} material={material} />
            </group>
          </group>
        ))}
      </group>
    </group>
  );
}
