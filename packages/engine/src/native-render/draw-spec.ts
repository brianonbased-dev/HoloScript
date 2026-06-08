/**
 * draw-spec — pure-data scene extraction for the native render path (D.083, task 2h3s).
 *
 * The PRE-MORTEM verdict: `ECSWorld → IDrawCall[]` is NOT a connector — IDrawCall is
 * GPU-resource-bound (GPUBuffer vertex data, GPUBindGroup material) and requires a live
 * GPUDevice. So this module is deliberately the GPU-FREE half: it extracts pure data
 * (geometry kind + params, material values, model matrix) from the canonical engine VM
 * world. It is headless-unit-testable (no `navigator.gpu`, no Three.js) and is the only
 * part that belongs in CI. The GPU resource builder (DrawSpec[] + GPUDevice → IDrawCall[])
 * is a SEPARATE, additive, opt-in backend gated on a browser-run receipt — NOT here.
 *
 * Imports only the engine VM's own world/types — zero foreign-engine imports.
 */

import { ECSWorld, type TransformComponent, type GeometryComponent, type MaterialComponent } from '../vm/executor';
import { ComponentType, GeometryType } from '../vm/opcodes';

export type GeometryKind =
  | 'cube' | 'sphere' | 'cylinder' | 'plane' | 'cone' | 'torus' | 'capsule' | 'mesh' | 'unknown';

/** Pure-data material (no GPUBindGroup) — the GPU backend resolves this to a pipeline+bind group. */
export interface MaterialSpec {
  color: number;      // packed 0xRRGGBB
  metalness: number;
  roughness: number;
  emissive: number;
  opacity: number;
}

/** Pure-data draw specification. NO GPU resources — see module header. */
export interface DrawSpec {
  entityId: number;
  geometry: { kind: GeometryKind; params: Record<string, number> };
  material: MaterialSpec;
  /** Column-major 4x4 model matrix (TRS), 16 floats. */
  modelMatrix: Float32Array;
}

const GEOMETRY_KIND: Record<number, GeometryKind> = {
  [GeometryType.Cube]: 'cube',
  [GeometryType.Sphere]: 'sphere',
  [GeometryType.Cylinder]: 'cylinder',
  [GeometryType.Plane]: 'plane',
  [GeometryType.Cone]: 'cone',
  [GeometryType.Torus]: 'torus',
  [GeometryType.Capsule]: 'capsule',
  [GeometryType.Mesh]: 'mesh',
};

export function geometryKindFromType(type: number): GeometryKind {
  return GEOMETRY_KIND[type] ?? 'unknown';
}

/**
 * Compose a column-major 4x4 TRS matrix from position / rotation quaternion / scale.
 * Pure math — matches glMatrix fromRotationTranslationScale convention (WGSL column-major).
 */
export function composeTRS(
  t: { x: number; y: number; z: number },
  q: { x: number; y: number; z: number; w: number },
  s: { x: number; y: number; z: number },
): Float32Array {
  const { x, y, z, w } = q;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  const m = new Float32Array(16);
  m[0] = (1 - (yy + zz)) * s.x; m[1] = (xy + wz) * s.x;       m[2] = (xz - wy) * s.x;       m[3] = 0;
  m[4] = (xy - wz) * s.y;       m[5] = (1 - (xx + zz)) * s.y; m[6] = (yz + wx) * s.y;       m[7] = 0;
  m[8] = (xz + wy) * s.z;       m[9] = (yz - wx) * s.z;       m[10] = (1 - (xx + yy)) * s.z; m[11] = 0;
  m[12] = t.x; m[13] = t.y; m[14] = t.z; m[15] = 1;
  return m;
}

/**
 * Extract pure-data draw specs from the canonical engine VM world. Renderable = alive +
 * has Transform + Geometry + Material. Deterministic order by entity id. NO GPU, NO Three.
 */
export function extractDrawSpecs(world: ECSWorld): DrawSpec[] {
  const specs: DrawSpec[] = [];
  const entities = world.getAllEntities().filter((e) => e.alive).sort((a, b) => a.id - b.id);
  for (const e of entities) {
    const t = world.getComponent<TransformComponent>(e.id, ComponentType.Transform);
    const g = world.getComponent<GeometryComponent>(e.id, ComponentType.Geometry);
    const m = world.getComponent<MaterialComponent>(e.id, ComponentType.Material);
    if (!t || !g || !m) continue;
    specs.push({
      entityId: e.id,
      geometry: { kind: geometryKindFromType(g.type), params: { ...g.params } },
      material: { color: m.color, metalness: m.metalness, roughness: m.roughness, emissive: m.emissive, opacity: m.opacity },
      modelMatrix: composeTRS(
        { x: t.position[0], y: t.position[1], z: t.position[2] },
        { x: t.rotation[0], y: t.rotation[1], z: t.rotation[2], w: t.rotation[3] },
        { x: t.scale[0], y: t.scale[1], z: t.scale[2] },
      ),
    });
  }
  return specs;
}
