'use client';

/**
 * petalMaterial — reconstruct the REAL subsurface lotus-petal material at runtime
 * from baked compiled data, using ONLY three.js (no @holoscript/core, no
 * @holoscript/r3f-renderer — the Railway deploy contract).
 *
 * The petals are photoreal because they keep three's full MeshPhysicalMaterial PBR
 * pipeline (transmission / thickness / sheen / ior) AND inject the trait's custom
 * GLSL — petal profile gradient, venation, and BACKLIT subsurface scatter — at
 * `#include <…>` splice points via `material.onBeforeCompile`. The GLSL strings,
 * the per-color/SSS uniforms, and the PBR props all come from the baked scene JSON
 * (baked by core's `buildLotusPetalMaterialSpec`), so this file reproduces the exact
 * hand-tuned petal shader without ever importing core. Mirrors r3f-renderer's
 * `buildCompiledMaterial` + `attachShaderChunks`, inlined to the runtime-safe subset.
 *
 * @cites I.007 (shader-chunk injection pillar), F.099 (show the rendered artifact)
 */
import * as THREE from 'three';
import type { BakedPetalMaterial, BakedGeometry } from './bakedTypes';
import { buildBotanicalNormalTexture, buildBotanicalRoughnessTexture } from './lotusTextures';

/** A live handle to drive injected uniforms per frame after the GPU program compiles. */
export interface PetalShaderHandle {
  /** Updated each frame from useFrame; no-op until onBeforeCompile has fired once. */
  shader: { uniforms: Record<string, { value: unknown }> } | null;
}

export interface BuiltPetalMaterial {
  material: THREE.MeshPhysicalMaterial;
  handle: PetalShaderHandle;
  dispose(): void;
}

/** Apply a baked uniform value (scalar or vec3) to a three uniform slot. */
function applyUniform(slot: { value: unknown }, val: number | number[]): void {
  if (typeof val === 'number') {
    slot.value = val;
  } else if (Array.isArray(val) && val.length === 3) {
    const cur = slot.value;
    if (cur instanceof THREE.Vector3) cur.set(val[0], val[1], val[2]);
    else slot.value = new THREE.Vector3(val[0], val[1], val[2]);
  } else {
    slot.value = val;
  }
}

/**
 * Build the photoreal petal material from the baked compiled spec. Wires:
 *  - MeshPhysicalMaterial PBR (transmission/thickness/sheen/ior — real translucency),
 *  - the procedural vein normal map + waxy roughness map (regenerated client-side),
 *  - the custom GLSL chunks via onBeforeCompile (PBR preserved → subsurface glow).
 *
 * `tint` optionally re-colors the petal palette uniforms (used by the paper flower so
 * each paper-bound petal keeps its own per-petal color while sharing the shader).
 */
export function buildPetalMaterial(
  spec: BakedPetalMaterial,
  opts: {
    /** Override the base petal color (sets material.color + uLotusBaseColor). */
    baseColor?: THREE.Color;
    /** Multiply the rim/mid palette so wilt/dim reads honestly (1 = unchanged). */
    dim?: number;
    /** Disable transmission for far/perf budgets (kept true by default). */
    transmission?: boolean;
    /** Side; petals are thin so DoubleSide reads correctly. */
    side?: THREE.Side;
  } = {}
): BuiltPetalMaterial {
  const p = spec.physical;
  const material = new THREE.MeshPhysicalMaterial({
    color: opts.baseColor ?? new THREE.Color((p.color as string) ?? '#fff1f6'),
    roughness: (p.roughness as number) ?? 0.72,
    metalness: (p.metalness as number) ?? 0,
    transparent: true,
    opacity: 1,
    transmission: opts.transmission === false ? 0 : ((p.transmission as number) ?? 0.68),
    thickness: (p.thickness as number) ?? 0.36,
    ior: (p.ior as number) ?? 1.36,
    sheen: (p.sheen as number) ?? 0.5,
    sheenColor: new THREE.Color((p.sheenColor as string) ?? '#ffe8f2'),
    sheenRoughness: (p.sheenRoughness as number) ?? 0.42,
    // A faint waxy clearcoat + iridescence reads as the lotus's dewy cuticle.
    clearcoat: 0.18,
    clearcoatRoughness: 0.55,
    iridescence: 0.12,
    iridescenceIOR: 1.3,
    side: opts.side ?? THREE.DoubleSide,
    // attenuation tints the light that transmits THROUGH the petal — warm pink core.
    attenuationColor: new THREE.Color('#ff7ab8'),
    attenuationDistance: 0.9,
  });

  // Procedural detail maps (vein normal + waxy roughness), regenerated client-side
  // from the baked seeds — pixel-identical to core's generators.
  const disposables: THREE.Texture[] = [];
  if (spec.textures?.normal) {
    const nt = buildBotanicalNormalTexture(spec.textures.normal);
    material.normalMap = nt;
    material.normalScale = new THREE.Vector2(0.7, 0.7);
    disposables.push(nt);
  }
  if (spec.textures?.roughness) {
    const rt = buildBotanicalRoughnessTexture(spec.textures.roughness);
    material.roughnessMap = rt;
    disposables.push(rt);
  }

  // Resolve baked uniforms, honoring optional per-petal tint overrides.
  const dim = opts.dim ?? 1;
  const uniforms = { ...spec.uniforms };
  if (opts.baseColor) {
    uniforms.uLotusBaseColor = [opts.baseColor.r, opts.baseColor.g, opts.baseColor.b];
  }
  if (dim !== 1) {
    for (const key of ['uLotusMidColor', 'uLotusRimColor', 'uLotusBaseColor'] as const) {
      const v = uniforms[key];
      if (Array.isArray(v)) uniforms[key] = v.map((c) => c * dim);
    }
  }

  const handle: PetalShaderHandle = { shader: null };

  // PBR-preserving chunk injection (the I.007 capability): splice each baked chunk
  // after its `#include <name>` and register the petal uniforms. A chunk whose
  // splice point is absent is SKIPPED, never corrupting the shader.
  material.onBeforeCompile = (shader) => {
    for (const [name, val] of Object.entries(uniforms)) {
      if (!(name in shader.uniforms)) shader.uniforms[name] = { value: null };
      applyUniform(shader.uniforms[name], val);
    }
    for (const chunk of spec.chunks) {
      const token = `#include <${chunk.include}>`;
      const key = chunk.stage === 'vertex' ? 'vertexShader' : 'fragmentShader';
      const src = shader[key];
      if (!src.includes(token)) continue;
      shader[key] = src.replace(token, `${token}\n${chunk.code}`);
    }
    handle.shader = shader as unknown as PetalShaderHandle['shader'];
  };
  material.needsUpdate = true;

  return {
    material,
    handle,
    dispose() {
      for (const t of disposables) t.dispose();
      material.dispose();
    },
  };
}

/**
 * Build the petal BufferGeometry from baked compiled data, including the custom
 * `petalUv` + `veinPhase` attributes the shader's curl/vein chunks read. (The stock
 * `usePetalGeometry` drops veinPhase; the photoreal shader needs it.)
 */
export function buildPetalGeometry(g: BakedGeometry | undefined): THREE.BufferGeometry | null {
  if (!g || g.positions.length === 0) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(g.positions, 3));
  if (g.normals.length) geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.normals, 3));
  if (g.uv.length) {
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2));
    // The shader reads a dedicated `petalUv` attribute (it must NOT be remapped by
    // three's uv transforms). Alias the same data into petalUv.
    geo.setAttribute('petalUv', new THREE.Float32BufferAttribute(g.uv.slice(), 2));
  }
  if (g.veinPhase && g.veinPhase.length) {
    geo.setAttribute('veinPhase', new THREE.Float32BufferAttribute(g.veinPhase, 1));
  } else {
    // No baked phase → uniform phase 0 (shader still runs; veins are unstaggered).
    const n = g.positions.length / 3;
    geo.setAttribute('veinPhase', new THREE.Float32BufferAttribute(new Float32Array(n), 1));
  }
  if (g.indices.length) geo.setIndex(g.indices);
  if (!g.normals.length) geo.computeVertexNormals();
  return geo;
}
