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
  center?: {
    seedPod: string;
    seedPodRim: string;
    stamen: string;
    stamenTip: string;
    stamenCount: number;
  };
}

/** Per-ring size + colour grading: inner petals small + pale, outer large + deep. */
const RING_SCALE: Record<number, number> = { 1: 0.72, 2: 0.86, 3: 1.0 };
const RING_TINT: Record<number, number> = { 1: 1.15, 2: 1.0, 3: 0.78 };

/** Clone a compiled material spec with every colour uniform scaled by `factor`
 *  (>1 lightens toward white, <1 deepens) so each ring gets its own tone. */
function tintSpec(spec: Parameters<typeof buildCompiledMaterial>[0], factor: number) {
  if (factor === 1 || !spec?.shaderChunks?.uniforms) return spec;
  const grade = (v: unknown): unknown => {
    if (!Array.isArray(v) || v.length !== 3) return v;
    return v.map((c: number) =>
      factor >= 1 ? Math.min(1, c + (1 - c) * (factor - 1)) : Math.max(0, c * factor)
    );
  };
  const uniforms: Record<string, { value: unknown }> = {};
  for (const [k, u] of Object.entries(spec.shaderChunks.uniforms)) {
    uniforms[k] = /Color/i.test(k) ? { value: grade((u as { value: unknown }).value) } : u;
  }
  return { ...spec, shaderChunks: { ...spec.shaderChunks, uniforms } };
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

  // One material per ring (size + colour graded: inner pale, outer deep).
  const ringMats = useMemo(() => {
    const make = (factor: number) => {
      const built = buildCompiledMaterial(tintSpec(spec, factor));
      built.material.side = THREE.DoubleSide; // cupped petals read from both sides
      return built;
    };
    return { 1: make(RING_TINT[1]), 2: make(RING_TINT[2]), 3: make(RING_TINT[3]) } as Record<
      number,
      ReturnType<typeof buildCompiledMaterial>
    >;
  }, [spec]);
  const geometry = useMemo(() => wrapCompiledGeometry(petalGeometry), [petalGeometry]);

  useEffect(() => {
    return () => {
      for (const m of Object.values(ringMats)) m.material.dispose();
      geometry.dispose();
    };
  }, [ringMats, geometry]);

  useFrame((state) => {
    for (const m of Object.values(ringMats)) m.chunkHandle?.setUniform('uLotusTime', state.clock.elapsedTime);
  });

  const petals: LotusPetalPlacement[] =
    placements.length > 0 ? placements : [{ azimuth: 0, tilt: 0, radius: 0, lift: 0, ring: 1 }];

  // Stamen ring around the seed pod — count from the profile.
  const center = scene?.center;
  const stamens = useMemo(() => {
    const n = center?.stamenCount ?? 0;
    return Array.from({ length: n }, (_, i) => ({
      azimuth: (i / Math.max(1, n)) * Math.PI * 2,
      lean: 0.18 + (i % 4) * 0.04,
      len: 0.26 + (i % 3) * 0.03,
    }));
  }, [center?.stamenCount]);

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
              <mesh
                geometry={geometry}
                material={(ringMats[p.ring] ?? ringMats[3]).material}
                scale={RING_SCALE[p.ring] ?? 1}
              />
            </group>
          </group>
        ))}

        {/* Flower centre: seed pod (receptacle) + stamen ring */}
        {center && (
          <group position={[0, 0.42, 0]}>
            <mesh>
              <cylinderGeometry args={[0.22, 0.15, 0.16, 28]} />
              <meshStandardMaterial color={center.seedPod} roughness={0.6} />
            </mesh>
            <mesh position={[0, 0.085, 0]}>
              <cylinderGeometry args={[0.225, 0.215, 0.03, 28]} />
              <meshStandardMaterial color={center.seedPodRim} roughness={0.5} />
            </mesh>
            {stamens.map((s, i) => (
              <group key={`st-${i}`} rotation={[0, s.azimuth, 0]}>
                <group position={[0, -0.02, 0.2]} rotation={[-s.lean, 0, 0]}>
                  <mesh position={[0, s.len / 2, 0]}>
                    <cylinderGeometry args={[0.006, 0.009, s.len, 6]} />
                    <meshStandardMaterial color={center.stamen} roughness={0.5} />
                  </mesh>
                  <mesh position={[0, s.len + 0.01, 0]}>
                    <sphereGeometry args={[0.016, 8, 8]} />
                    <meshStandardMaterial
                      color={center.stamenTip}
                      emissive={center.stamenTip}
                      emissiveIntensity={0.25}
                      roughness={0.4}
                    />
                  </mesh>
                </group>
              </group>
            ))}
          </group>
        )}
      </group>
    </group>
  );
}
