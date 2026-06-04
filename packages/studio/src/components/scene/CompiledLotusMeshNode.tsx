'use client';

/**
 * CompiledLotusMeshNode — render a node whose material was compiled from `.holo`
 * data (I.007 closure, render-side wire).
 *
 * The R3FCompiler attaches a `CompiledMaterialSpec` to `props.__compiledMaterial`
 * for any `@botanical_lotus` node (see R3FCompiler.emitCompiledLotusMaterial). This
 * component reads that plain-data spec from props and builds the petal material with
 * r3f-renderer's PURE `buildCompiledMaterial` (physical PBR + spliced vein/profile/
 * SSS shader chunks + dynamic uniforms) — no hand-authored material setup.
 *
 * Note: it builds the material via the pure function and mounts with STUDIO's own
 * `useFrame`, rather than r3f-renderer's `CompiledTraitMesh` component. That
 * component's `useFrame` is bound to r3f-renderer's bundled @react-three/fiber
 * instance, which differs from studio's Canvas instance ("R3F: Hooks can only be
 * used within the Canvas component!"). Using the pure builder + studio's hook keeps
 * a single fiber instance. (Deduping fiber so CompiledTraitMesh itself works in
 * studio is a separate packaging follow-up.)
 *
 * The petal SILHOUETTE (a true petal mesh) is geometry-side and still lives in the
 * hand-authored LotusProgram.tsx; here we use a subdivided plane carrying the
 * `petalUv` + `veinPhase` attributes the compiled shader reads, so the full shader
 * (venation, profile gradient, backlit subsurface, curl-bend) runs and is visible.
 */
import { useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { R3FNode } from '@/types';
import { buildCompiledMaterial } from '@holoscript/r3f-renderer';

/** A subdivided plane carrying the petalUv (= uv) + veinPhase attributes the
 *  compiled lotus shader chunks read. Enough segments for the vertex curl-bend. */
function buildPetalGeometry(): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(1.1, 1.7, 24, 40);
  const uv = geo.getAttribute('uv');
  const count = uv.count;
  const petalUv = new Float32Array(count * 2);
  const veinPhase = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    petalUv[i * 2] = uv.getX(i);
    petalUv[i * 2 + 1] = uv.getY(i);
    veinPhase[i] = 0;
  }
  geo.setAttribute('petalUv', new THREE.BufferAttribute(petalUv, 2));
  geo.setAttribute('veinPhase', new THREE.BufferAttribute(veinPhase, 1));
  return geo;
}

export function CompiledLotusMeshNode({ node }: { node: R3FNode }) {
  const spec = node.props.__compiledMaterial as Parameters<typeof buildCompiledMaterial>[0];
  const { material, chunkHandle } = useMemo(() => buildCompiledMaterial(spec), [spec]);
  const geometry = useMemo(() => buildPetalGeometry(), []);

  useEffect(() => () => material.dispose(), [material]);

  // Drive the subsurface-pulse clock uniform so the petal isn't frozen.
  useFrame((state) => {
    chunkHandle?.setUniform('uLotusTime', state.clock.elapsedTime);
  });

  return (
    <mesh>
      <primitive object={geometry} attach="geometry" />
      <primitive object={material} attach="material" />
    </mesh>
  );
}
