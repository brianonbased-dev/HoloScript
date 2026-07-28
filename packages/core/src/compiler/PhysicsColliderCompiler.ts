// PhysicsColliderCompiler — a second sovereign compiler that consumes the SHARED
// geometry vocabulary and emits a physics-world descriptor. It is the concrete proof
// of the founder's "one shape, many domains" axis: a single `.holo` geometry
// declaration is turned into WGSL vertices by the WebGPU (render) target AND into
// collider shapes here — both reading the same geometry-registry primitive and the
// same geometry-purpose role. No duplicated shape logic; the registry is the SoT.
//
// Which objects become colliders:
//   • functional geometry with purpose `collision`      → a fixed collider
//   • functional geometry with purpose `trigger`        → a sensor collider
//   • any object carrying a `rigidbody`/`dynamic` trait → a dynamic-body collider
//     (even when it also renders — a visible physics object is both)
// Everything else (pure render surfaces) is skipped. Unlike the render path, physics
// KEEPS the object's rotation (render currently drops it), because orientation matters
// to a collider.
//
// Output: a `holoscript.physics.v1` JSON descriptor a Rapier-class engine can load.

import type {
  HoloComposition,
  HoloObjectDecl,
  HoloSpatialGroup,
  HoloTemplate,
  HoloValue,
} from '../parser/HoloCompositionTypes';
import { resolveGeometry } from './render-modules/geometry-registry';
import { resolveGeometryRole } from './render-modules/geometry-purpose';
import { resolveCollider, type ColliderDescriptor } from './render-modules/collider-extraction';

const DYNAMIC_TRAITS = new Set(['rigidbody', 'rigid_body', 'dynamic', 'physics_body']);
const KINEMATIC_TRAITS = new Set(['kinematic', 'kinematic_body']);
// Traits that opt a (possibly visible) object into having a collider at all.
const PHYSICS_TRAITS = new Set([
  'rigidbody',
  'rigid_body',
  'dynamic',
  'physics_body',
  'kinematic',
  'kinematic_body',
  'physics',
  'collider',
]);

export interface PhysicsCollider extends ColliderDescriptor {
  readonly id: string;
  /** 'fixed' | 'dynamic' | 'kinematic'. */
  readonly bodyType: 'fixed' | 'dynamic' | 'kinematic';
  /** Trigger volumes are sensors (report overlap, no solid response). */
  readonly isSensor: boolean;
  /** What the source geometry is FOR (render/collision/trigger/...). */
  readonly purpose: string;
  /** The `.holo` mesh/geometry name this collider came from. */
  readonly sourceGeometry: string;
  /** The shared canonical primitive (box/sphere/...) — same as the render target sees. */
  readonly primitive: string;
}

export interface PhysicsWorld {
  readonly format: 'holoscript.physics.v1';
  readonly source: string;
  readonly generator: 'PhysicsColliderCompiler';
  readonly colliderCount: number;
  readonly colliders: PhysicsCollider[];
}

export class PhysicsColliderCompiler {
  private templatesByName: Map<string, HoloTemplate> = new Map();

  /** Compile a composition to a physics-world descriptor (pretty JSON string). */
  compile(composition: HoloComposition): string {
    return JSON.stringify(this.compileToObject(composition), null, 2);
  }

  /** Compile to the structured descriptor (for programmatic use / tests). */
  compileToObject(composition: HoloComposition): PhysicsWorld {
    this.templatesByName = new Map(
      (composition.templates ?? []).map((t) => [t.name, t] as [string, HoloTemplate])
    );
    const colliders: PhysicsCollider[] = [];
    const walk = (objs: HoloObjectDecl[] | undefined, offset: number[]): void => {
      for (const obj of objs ?? []) {
        const c = this.colliderFor(obj, offset);
        if (c) colliders.push(c);
        if (obj.children) walk(obj.children, offset);
      }
    };
    walk(composition.objects, [0, 0, 0]);
    const walkGroup = (g: HoloSpatialGroup, parent: number[]): void => {
      const gp = g.properties?.find((p) => p.key === 'position')?.value;
      const [gx, gy, gz] = Array.isArray(gp) ? (gp as number[]) : [0, 0, 0];
      const off = [parent[0] + gx, parent[1] + gy, parent[2] + gz];
      walk(g.objects, off);
      for (const sub of g.groups ?? []) walkGroup(sub, off);
    };
    for (const g of composition.spatialGroups ?? []) walkGroup(g, [0, 0, 0]);

    return {
      format: 'holoscript.physics.v1',
      source: String(composition.name ?? 'composition'),
      generator: 'PhysicsColliderCompiler',
      colliderCount: colliders.length,
      colliders,
    };
  }

  private colliderFor(obj: HoloObjectDecl, offset: number[]): PhysicsCollider | null {
    const traitNames = (obj.traits ?? []).map((t) => String(t.name).toLowerCase());
    const role = resolveGeometryRole({
      purpose: this.findProp(obj, 'purpose'),
      visible: this.findProp(obj, 'visible'),
      traitNames,
    });
    const hasPhysicsTrait = traitNames.some((t) => PHYSICS_TRAITS.has(t));
    const isPhysics = role.purpose === 'collision' || role.purpose === 'trigger' || hasPhysicsTrait;
    if (!isPhysics) return null;

    const mesh = String(
      this.findProp(obj, 'geometry') ??
        this.findProp(obj, 'mesh') ??
        this.findProp(obj, 'type') ??
        'cube'
    );
    const primitive = resolveGeometry(mesh).kind;
    const pos = this.findProp(obj, 'position');
    const [px, py, pz] = Array.isArray(pos) ? (pos as number[]) : [0, 0, 0];
    const scale = this.findProp(obj, 'scale') ?? this.findProp(obj, 'size');
    const scaleArr = Array.isArray(scale)
      ? (scale as number[])
      : typeof scale === 'number'
        ? [scale, scale, scale]
        : [1, 1, 1];
    const rot = this.findProp(obj, 'rotation');
    const rotArr = Array.isArray(rot) ? (rot as number[]) : [0, 0, 0];

    const descriptor = resolveCollider(primitive, {
      position: [px + offset[0], py + offset[1], pz + offset[2]],
      scale: scaleArr,
      rotation: rotArr,
    });

    const bodyType: PhysicsCollider['bodyType'] = traitNames.some((t) => DYNAMIC_TRAITS.has(t))
      ? 'dynamic'
      : traitNames.some((t) => KINEMATIC_TRAITS.has(t))
        ? 'kinematic'
        : 'fixed';

    return {
      ...descriptor,
      id: String(obj.name ?? 'collider'),
      bodyType,
      isSensor: role.purpose === 'trigger',
      purpose: role.purpose,
      sourceGeometry: mesh,
      primitive,
    };
  }

  // Template-aware property read (mirrors WebGPUCompiler.findObjProp) so objects that
  // carry geometry/purpose/scale on a `using "Template"` resolve the same way.
  private findProp(obj: HoloObjectDecl, key: string): HoloValue | undefined {
    const own = obj.properties?.find((p) => p.key === key)?.value;
    if (own !== undefined) return own as HoloValue;
    if (obj.template) {
      const tpl = this.templatesByName.get(obj.template);
      const fromTemplate = tpl?.properties?.find((p) => p.key === key)?.value;
      if (fromTemplate !== undefined) return fromTemplate as HoloValue;
    }
    return undefined;
  }
}
