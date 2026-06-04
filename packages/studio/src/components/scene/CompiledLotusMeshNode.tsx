'use client';

/**
 * CompiledLotusMeshNode — render a node whose material was compiled from `.holo`
 * data (I.007 closure, render-side wire).
 *
 * The R3FCompiler attaches a `CompiledMaterialSpec` to `props.__compiledMaterial`
 * for any `@botanical_lotus` node (see R3FCompiler.emitCompiledLotusMaterial). This
 * component reads that plain-data spec from props and hands it to r3f-renderer's
 * `CompiledTraitMesh`, which builds the petal material (physical PBR + spliced vein/
 * profile/subsurface shader chunks + dynamic uniforms) AND ticks any trait runtime
 * each frame — no hand-authored material or bespoke useFrame.
 *
 * Uses the real `CompiledTraitMesh` component (its `useFrame` is now safe inside
 * studio's Canvas: @react-three/fiber is deduped to a single instance after pinning
 * @types/react + adding react-dom to r3f-renderer's peers — see [[wisdom_core-barrel-browser-unsafe]]).
 *
 * Both the material AND the petal MESH are compiled from `.holo`: R3FCompiler emits
 * the petal geometry as three-free typed-array data (props.__petalGeometry — real
 * broad-elliptic pointed-tip silhouette with petalUv + veinPhase attributes the
 * compiled shader reads); this component just wraps those arrays in a BufferGeometry.
 * No hand-authored geometry or material (cf. the external LotusProgram.tsx).
 */
import { useMemo } from 'react';
import * as THREE from 'three';
import type { R3FNode } from '@/types';
import { CompiledTraitMesh, createTraitContext } from '@holoscript/r3f-renderer';

/** Shape of the compiled petal geometry data emitted into props.__petalGeometry
 *  (mirror of core's LotusPetalGeometryData — plain typed arrays, no core import). */
interface CompiledPetalGeometry {
  positions: Float32Array;
  normals: Float32Array;
  petalUv: Float32Array;
  veinPhase: Float32Array;
  indices: Uint32Array;
}

/** Wrap the compiled three-free geometry data in a BufferGeometry. */
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
  const spec = props.__compiledMaterial as Parameters<typeof CompiledTraitMesh>[0]['material'];
  const uniformBindings = props.__uniformBindings as Record<string, string> | undefined;
  const petalGeometry = props.__petalGeometry as CompiledPetalGeometry;
  const context = useMemo(() => createTraitContext(), []);
  const geometry = useMemo(() => wrapCompiledGeometry(petalGeometry), [petalGeometry]);
  // traits=[] for the static slice: dynamic uniforms default to a fully-open,
  // full-bloom pose (devTime/growth/bloom = 1), so the petal renders at full open.
  const hsNode = useMemo(() => ({ id: node.id ?? 'lotus-petal' }), [node.id]);

  return (
    <CompiledTraitMesh
      node={hsNode as never}
      material={spec}
      context={context}
      uniformBindings={uniformBindings}
      position={props.position as [number, number, number] | undefined}
      rotation={props.rotation as [number, number, number] | undefined}
      scale={props.scale as number | [number, number, number] | undefined}
    >
      <primitive object={geometry} attach="geometry" />
    </CompiledTraitMesh>
  );
}
