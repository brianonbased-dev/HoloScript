// Shared ray-trace scene extraction — consumed by BOTH the GPU path tracer
// (PathTracerCompiler → Rust wgpu compute) and the CPU path tracer (CpuPathTracer,
// the no-GPU fallback). One extraction, so the GPU and CPU backends render the SAME
// scene and can't drift. Turns the .holo's objects into path-traceable analytic
// primitives via the shared geometry-registry + geometry-purpose vocabulary.

import type {
  HoloComposition,
  HoloObjectDecl,
  HoloSpatialGroup,
  HoloValue,
  HoloTemplate,
} from '../../parser/HoloCompositionTypes';
import { resolveGeometry } from './geometry-registry';
import { resolveGeometryRole } from './geometry-purpose';
import { resolveSkyboxColor } from './skybox-registry';

export interface RayPrim {
  kind: 0 | 1; // 0 = sphere, 1 = box (AABB)
  a: [number, number, number, number]; // sphere: center.xyz, radius.w | box: min.xyz
  b: [number, number, number, number]; // box: max.xyz
  albedo: [number, number, number];
  emissive: [number, number, number];
}

export interface RayCamera {
  eye: [number, number, number];
  fwd: [number, number, number];
  right: [number, number, number];
  up: [number, number, number];
  tanf: number;
  aspect: number;
  nprims: number;
}

export interface RayScene {
  prims: RayPrim[];
  camera: RayCamera;
  sky: [number, number, number];
}

export function extractRaytraceScene(
  composition: HoloComposition,
  opts: { width: number; height: number }
): RayScene {
  const templates = new Map<string, HoloTemplate>(
    (composition.templates ?? []).map((t) => [t.name, t] as [string, HoloTemplate])
  );
  const findProp = (obj: HoloObjectDecl, key: string): HoloValue | undefined => {
    const own = obj.properties?.find((p) => p.key === key)?.value;
    if (own !== undefined) return own as HoloValue;
    if (obj.template) {
      const tpl = templates.get(obj.template);
      const fromT = tpl?.properties?.find((p) => p.key === key)?.value;
      if (fromT !== undefined) return fromT as HoloValue;
    }
    return undefined;
  };
  const vec3 = (v: unknown, fb: [number, number, number]): [number, number, number] =>
    Array.isArray(v) && v.length >= 3 ? [Number(v[0]), Number(v[1]), Number(v[2])] : fb;
  const scaleOf = (obj: HoloObjectDecl): [number, number, number] => {
    const s = findProp(obj, 'scale') ?? findProp(obj, 'size');
    if (Array.isArray(s) && s.length >= 3) return [Number(s[0]), Number(s[1]), Number(s[2])];
    if (typeof s === 'number') return [s, s, s];
    return [1, 1, 1];
  };
  const hex = (h: string): [number, number, number] => {
    const s = h.slice(1);
    return [
      Number((parseInt(s.substring(0, 2), 16) / 255).toFixed(4)),
      Number((parseInt(s.substring(2, 4), 16) / 255).toFixed(4)),
      Number((parseInt(s.substring(4, 6), 16) / 255).toFixed(4)),
    ];
  };
  const colorOf = (obj: HoloObjectDecl): [number, number, number] => {
    const c = findProp(obj, 'color');
    return typeof c === 'string' && c.startsWith('#') ? hex(c) : [0.75, 0.75, 0.75];
  };
  const emissiveOf = (obj: HoloObjectDecl): [number, number, number] => {
    const e = findProp(obj, 'emissive');
    if (typeof e === 'string' && e.startsWith('#')) {
      const c = hex(e);
      const k = Number(findProp(obj, 'emissiveIntensity') ?? 6);
      return [c[0] * k, c[1] * k, c[2] * k];
    }
    return [0, 0, 0];
  };

  const prims: RayPrim[] = [];
  const add = (obj: HoloObjectDecl, off: number[]) => {
    const role = resolveGeometryRole({
      purpose: findProp(obj, 'purpose'),
      visible: findProp(obj, 'visible'),
      traitNames: (obj.traits ?? []).map((t) => t.name),
    });
    if (role.visible) {
      const mesh = String(
        findProp(obj, 'geometry') ?? findProp(obj, 'mesh') ?? findProp(obj, 'type') ?? 'cube'
      );
      const kind = resolveGeometry(mesh).kind;
      const pos = vec3(findProp(obj, 'position'), [0, 0, 0]);
      const p = [pos[0] + off[0], pos[1] + off[1], pos[2] + off[2]];
      const s = scaleOf(obj);
      const albedo = colorOf(obj);
      const emissive = emissiveOf(obj);
      if (kind === 'sphere' || kind === 'torus') {
        const r = 0.5 * Math.max(s[0], s[1], s[2]);
        prims.push({ kind: 0, a: [p[0], p[1], p[2], r], b: [0, 0, 0, 0], albedo, emissive });
      } else {
        const hy = kind === 'plane' ? 0.02 : Math.abs(s[1]) * 0.5;
        const hx = Math.abs(s[0]) * 0.5;
        const hz = Math.abs(s[2]) * 0.5;
        prims.push({
          kind: 1,
          a: [p[0] - hx, p[1] - hy, p[2] - hz, 0],
          b: [p[0] + hx, p[1] + hy, p[2] + hz, 0],
          albedo,
          emissive,
        });
      }
    }
    if (obj.children) for (const c of obj.children) add(c, off);
  };
  for (const o of composition.objects ?? []) add(o, [0, 0, 0]);
  const scenes = (composition as unknown as { scenes?: Array<{ objects?: HoloObjectDecl[] }> })
    .scenes;
  for (const s of scenes ?? []) for (const o of s.objects ?? []) add(o, [0, 0, 0]);
  const walk = (g: HoloSpatialGroup, parent: number[]) => {
    const gp = g.properties?.find((pp) => pp.key === 'position')?.value;
    const [gx, gy, gz] = Array.isArray(gp) ? (gp as number[]) : [0, 0, 0];
    const o2 = [parent[0] + gx, parent[1] + gy, parent[2] + gz];
    for (const o of g.objects ?? []) add(o, o2);
    for (const sub of g.groups ?? []) walk(sub, o2);
  };
  for (const g of composition.spatialGroups ?? []) walk(g, [0, 0, 0]);

  const camera = buildCamera(prims, opts.width, opts.height);
  const sky = skyColor(composition, hex);
  return { prims, camera, sky };
}

function buildCamera(prims: RayPrim[], width: number, height: number): RayCamera {
  const centers = prims.map((p) =>
    p.kind === 0
      ? [p.a[0], p.a[1], p.a[2]]
      : [(p.a[0] + p.b[0]) / 2, (p.a[1] + p.b[1]) / 2, (p.a[2] + p.b[2]) / 2]
  );
  let eye = [4, 3, 8];
  let target = [0, 0, 0];
  const fov = 55;
  if (centers.length > 0) {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const c of centers)
      for (let i = 0; i < 3; i++) {
        min[i] = Math.min(min[i], c[i]);
        max[i] = Math.max(max[i], c[i]);
      }
    const center = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
    let radius = 1;
    for (const c of centers)
      radius = Math.max(
        radius,
        Math.hypot(c[0] - center[0], c[1] - center[1], c[2] - center[2]) + 1.5
      );
    const dist = (radius / Math.sin((fov * Math.PI) / 180 / 2)) * 1.15;
    const dl = Math.hypot(0.2, 0.35, 1);
    eye = [
      center[0] + (0.2 / dl) * dist,
      center[1] + (0.35 / dl) * dist,
      center[2] + (1 / dl) * dist,
    ];
    target = center;
  }
  const norm = (a: number[]): [number, number, number] => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  };
  const cross = (a: number[], b: number[]): number[] => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const f = norm([target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]]);
  const right = norm(cross(f, [0, 1, 0]));
  const up = norm(cross(right, f));
  return {
    eye: eye as [number, number, number],
    fwd: f,
    right,
    up,
    tanf: Math.tan((fov * Math.PI) / 180 / 2),
    aspect: width / height,
    nprims: prims.length,
  };
}

function skyColor(
  composition: HoloComposition,
  hex: (h: string) => [number, number, number]
): [number, number, number] {
  const env = composition.environment;
  const props: Record<string, unknown> = {};
  for (const p of env?.properties ?? []) props[p.key] = p.value;
  const bg = props.background || props.skybox || '#0a0e14';
  const c = typeof bg === 'string' && bg.startsWith('#') ? hex(bg) : resolveSkyboxColor(String(bg));
  return [c[0] * 0.6 + 0.02, c[1] * 0.6 + 0.03, c[2] * 0.6 + 0.05];
}
