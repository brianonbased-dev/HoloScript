/**
 * compiledMaterial — assemble a render material from compiled `.holo` data (I.007 assembly).
 *
 * The render-side consumer that ties three of the four closure primitives into one
 * MeshPhysicalMaterial: physical PBR props (pillar 4 emission), procedural detail
 * maps (pillar 3 registry), and custom shader chunks (pillar 2 onBeforeCompile). The
 * fourth primitive — per-frame trait behavior (RuntimeTraitHost) — wraps the mesh
 * that uses this material. Together they replace the hand-authored material setup in
 * LotusProgram.tsx with one driven entirely by compiled declarations.
 *
 * `buildCompiledMaterial` is GL-free at construction (three material + DataTexture
 * construct without a WebGL context), so it's unit-testable; `CompiledTraitMesh`
 * (tsx) is the thin component that adds geometry + the trait host.
 *
 * @cites I.007, plan §0.7, task_1780604509863_w7i9 (assembly)
 */
import * as THREE from 'three';
import { attachShaderChunks, type ShaderChunkSet, type ShaderChunkHandle } from './shaderChunks';
import { resolveProceduralTexture, type ProceduralTextureSpec } from './proceduralTextures';

/** Physical PBR props (mirror of the compiler's meshPhysicalMaterial emission). */
export interface CompiledPhysicalProps {
  color?: string;
  roughness?: number;
  metalness?: number;
  opacity?: number;
  transparent?: boolean;
  emissive?: string;
  emissiveIntensity?: number;
  ior?: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  transmission?: number;
  thickness?: number;
  sheen?: number;
  sheenColor?: string;
  sheenRoughness?: number;
  specularIntensity?: number;
  iridescence?: number;
}

/** A material fully declared by compiled `.holo` data. */
export interface CompiledMaterialSpec {
  physical?: CompiledPhysicalProps;
  /** Custom GLSL chunks spliced into the PBR shader (pillar 2). */
  shaderChunks?: ShaderChunkSet;
  /** Procedural detail maps, by material slot (pillar 3). */
  proceduralMaps?: {
    normalMap?: ProceduralTextureSpec;
    roughnessMap?: ProceduralTextureSpec;
    map?: ProceduralTextureSpec;
  };
}

export interface CompiledMaterialResult {
  material: THREE.MeshPhysicalMaterial;
  /** Present when shaderChunks were attached — drives injected uniforms per frame. */
  chunkHandle?: ShaderChunkHandle;
}

const SLOT_TO_PROP: Record<string, 'normalMap' | 'roughnessMap' | 'map'> = {
  normalMap: 'normalMap',
  roughnessMap: 'roughnessMap',
  map: 'map',
};

/**
 * Build a MeshPhysicalMaterial from compiled declarations, wiring procedural maps
 * (pillar 3) and shader chunks (pillar 4 → onBeforeCompile, PBR preserved). Pure
 * w.r.t. WebGL — constructs only (no GL context needed), so it's unit-testable.
 */
export function buildCompiledMaterial(spec: CompiledMaterialSpec): CompiledMaterialResult {
  const p = spec.physical ?? {};
  const material = new THREE.MeshPhysicalMaterial({
    ...(p.color !== undefined ? { color: new THREE.Color(p.color) } : {}),
    ...(p.roughness !== undefined ? { roughness: p.roughness } : {}),
    ...(p.metalness !== undefined ? { metalness: p.metalness } : {}),
    ...(p.opacity !== undefined ? { opacity: p.opacity } : {}),
    ...(p.transparent !== undefined ? { transparent: p.transparent } : {}),
    ...(p.emissive !== undefined ? { emissive: new THREE.Color(p.emissive) } : {}),
    ...(p.emissiveIntensity !== undefined ? { emissiveIntensity: p.emissiveIntensity } : {}),
    ...(p.ior !== undefined ? { ior: p.ior } : {}),
    ...(p.clearcoat !== undefined ? { clearcoat: p.clearcoat } : {}),
    ...(p.clearcoatRoughness !== undefined ? { clearcoatRoughness: p.clearcoatRoughness } : {}),
    ...(p.transmission !== undefined ? { transmission: p.transmission } : {}),
    ...(p.thickness !== undefined ? { thickness: p.thickness } : {}),
    ...(p.sheen !== undefined ? { sheen: p.sheen } : {}),
    ...(p.sheenColor !== undefined ? { sheenColor: new THREE.Color(p.sheenColor) } : {}),
    ...(p.sheenRoughness !== undefined ? { sheenRoughness: p.sheenRoughness } : {}),
    ...(p.specularIntensity !== undefined ? { specularIntensity: p.specularIntensity } : {}),
    ...(p.iridescence !== undefined ? { iridescence: p.iridescence } : {}),
  });

  // Procedural detail maps (pillar 3): resolve each declared slot to a DataTexture.
  if (spec.proceduralMaps) {
    for (const [slot, mapSpec] of Object.entries(spec.proceduralMaps)) {
      if (!mapSpec) continue;
      const prop = SLOT_TO_PROP[slot];
      if (!prop) continue;
      const tex = resolveProceduralTexture(mapSpec);
      if (tex) (material as unknown as Record<string, unknown>)[prop] = tex;
    }
  }

  // Custom shader chunks (pillar 2): PBR-preserving onBeforeCompile injection.
  let chunkHandle: ShaderChunkHandle | undefined;
  if (spec.shaderChunks && spec.shaderChunks.chunks.length > 0) {
    chunkHandle = attachShaderChunks(material, spec.shaderChunks);
  }

  return { material, chunkHandle };
}
