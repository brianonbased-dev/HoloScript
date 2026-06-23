import * as THREE from 'three';
import type { R3FNode } from '@holoscript/core';
import { getMaterialProps } from './materialUtils';

/**
 * buildScatterMesh — builds ONE THREE.InstancedMesh from a compiled `scatter`
 * R3FNode (produced by SceneIRCompiler.compileProceduralScatterNode from a
 * `.holo`/`.hsplus` scatter/procedural domain block). Before the scatter path
 * existed, those blocks parsed into the IR but were silently dropped, so dense
 * worlds rendered only their hand-listed objects.
 *
 * This is a PLAIN .ts helper, NOT a `.tsx` render surface, by design: it lives in
 * the compile-target runtime (the thing `.holo` compiles INTO) without growing the
 * frozen hand-authored render-surface pile (D.095/D.096/W.715). The grandfathered
 * renderers (R3FNodeRenderer, ImmersiveViewer) host the result via `<primitive>`.
 *
 * Node contract:
 *   node.props = {
 *     transforms: number[][]   // each [x, y, z, rotationY, scale]
 *     count, sourceMesh, hsType ('box' fallback for .glb v1), color?, roughness?,
 *     metalness?, emissive?
 *   }
 */

function geometryFromHsType(hsType: string, size: number): THREE.BufferGeometry {
  const s = size || 1;
  switch (hsType) {
    case 'sphere':
      return new THREE.SphereGeometry(s * 0.5, 24, 16);
    case 'cone':
      return new THREE.ConeGeometry(s * 0.5, s, 20);
    case 'cylinder':
      return new THREE.CylinderGeometry(s * 0.5, s * 0.5, s, 20);
    case 'capsule':
      return new THREE.CapsuleGeometry(s * 0.4, s * 0.6, 6, 12);
    case 'plane':
      return new THREE.PlaneGeometry(s, s);
    case 'torus':
      return new THREE.TorusGeometry(s * 0.5, s * 0.2, 12, 24);
    case 'tetrahedron':
      return new THREE.TetrahedronGeometry(s * 0.6);
    case 'box':
    default:
      return new THREE.BoxGeometry(s, s, s);
  }
}

function standardMaterialFromNode(node: R3FNode): THREE.MeshStandardMaterial {
  const mp = getMaterialProps(node) as Record<string, unknown>;
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 });
  if (typeof mp.color === 'string' || typeof mp.color === 'number') {
    mat.color = new THREE.Color(mp.color as THREE.ColorRepresentation);
  }
  if (typeof mp.roughness === 'number') mat.roughness = mp.roughness;
  if (typeof mp.metalness === 'number') mat.metalness = mp.metalness;
  if (typeof mp.emissive === 'string' || typeof mp.emissive === 'number') {
    mat.emissive = new THREE.Color(mp.emissive as THREE.ColorRepresentation);
  }
  if (typeof mp.emissiveIntensity === 'number') mat.emissiveIntensity = mp.emissiveIntensity;
  if (typeof mp.opacity === 'number' && mp.opacity < 1) {
    mat.opacity = mp.opacity;
    mat.transparent = true;
  }
  return mat;
}

export function buildScatterMesh(node: R3FNode): THREE.InstancedMesh | null {
  const props = (node.props ?? {}) as Record<string, unknown>;
  const transforms = (props.transforms as number[][] | undefined) ?? [];
  if (transforms.length === 0) return null;
  const hsType = (props.hsType as string) || (props.sourceMesh as string) || 'box';
  const size = (props.size as number | undefined) ?? 1;

  const mesh = new THREE.InstancedMesh(
    geometryFromHsType(hsType, size),
    standardMaterialFromNode(node),
    transforms.length
  );
  mesh.name = node.id ?? 'scatter';
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const dummy = new THREE.Object3D();
  for (let i = 0; i < transforms.length; i++) {
    const t = transforms[i];
    dummy.position.set(t[0] ?? 0, t[1] ?? 0, t[2] ?? 0);
    dummy.rotation.set(0, t[3] ?? 0, 0);
    const sc = t[4] ?? 1;
    dummy.scale.set(sc, sc, sc);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}
