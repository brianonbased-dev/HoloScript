'use client';

/**
 * CompiledLotusMeshNode — render the full lotus bloom compiled from `.holo` data
 * (I.007 closure: material + petal mesh + phyllotaxis arrangement all from the
 * declaration).
 *
 * R3FCompiler emits, for a `@botanical_lotus` node:
 *   - props.__compiledMaterial — the petal material spec,
 *   - props.__petalGeometry    — the petal mesh (three-free typed arrays),
 *   - props.__petalPlacements  — per-petal golden-angle placements (the bloom).
 *
 * Builds ONE material + ONE BufferGeometry (shared across all petals) and renders a
 * mesh per placement via nested groups (azimuth around Y → tilt around X → outward
 * base offset) — unambiguous orientation, no Euler-order guessing. Double-sided so
 * the cup reads from inside and out. No hand-authored geometry, material, or layout.
 *
 * Fiber is deduped (commit bcfbea6a9) so r3f-renderer's pure buildCompiledMaterial +
 * studio's own useFrame share one instance. Falls back to a single petal at origin
 * if no placements were emitted.
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

export function CompiledLotusMeshNode({ node }: { node: R3FNode }) {
  const { props } = node;
  const spec = props.__compiledMaterial as Parameters<typeof buildCompiledMaterial>[0];
  const petalGeometry = props.__petalGeometry as CompiledPetalGeometry;
  const placements = (props.__petalPlacements as LotusPetalPlacement[] | undefined) ?? [];

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

  // Drive the subsurface-pulse clock uniform once for the whole (shared-material) bloom.
  useFrame((state) => {
    chunkHandle?.setUniform('uLotusTime', state.clock.elapsedTime);
  });

  // Fallback: one petal at origin if the compiler emitted no placements.
  const petals: LotusPetalPlacement[] =
    placements.length > 0 ? placements : [{ azimuth: 0, tilt: 0, radius: 0, lift: 0, ring: 1 }];

  return (
    <group
      position={props.position as [number, number, number] | undefined}
      rotation={props.rotation as [number, number, number] | undefined}
      scale={(props.scale as number | [number, number, number] | undefined) ?? 1.8}
    >
      {petals.map((p, i) => (
        <group key={i} rotation={[0, p.azimuth, 0]}>
          <group position={[0, p.lift, p.radius]} rotation={[p.tilt, 0, 0]}>
            <mesh geometry={geometry} material={material} />
          </group>
        </group>
      ))}
    </group>
  );
}
