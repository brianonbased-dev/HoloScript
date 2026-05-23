/**
 * JS-side signed-distance evaluator for SDFNode trees. This mirrors the
 * SDFRayMarchCompiler node shape but evaluates distances directly, so
 * conjecture probes can sample SDFs without compiling GLSL.
 */

export type SDFPrimitive =
  | 'sphere'
  | 'box'
  | 'rounded_box'
  | 'torus'
  | 'cylinder'
  | 'cone'
  | 'capsule'
  | 'ellipsoid'
  | 'plane'
  | 'hex_prism'
  | 'tri_prism'
  | 'octahedron'
  | 'pyramid'
  | 'link'
  | 'capped_torus'
  | 'round_cone'
  | 'vesica'
  | 'rhombus'
  | 'gyroid'
  | 'heart'
  | 'mandelbulb'
  | 'menger';

export type SDFCSGOperation =
  | 'union'
  | 'intersect'
  | 'difference'
  | 'subtract'
  | 'smooth_union'
  | 'smooth_intersect'
  | 'smooth_difference'
  | 'smooth_subtract';

export type SDFDomainOperation = 'repeat' | 'twist' | 'bend';

export type SDFPoint = readonly [number, number, number];

export interface SDFNode {
  type: 'primitive' | 'csg' | 'domain';
  primitive?: SDFPrimitive;
  params?: Readonly<Record<string, number>>;
  operation?: SDFCSGOperation | SDFDomainOperation;
  smoothness?: number;
  children?: ReadonlyArray<SDFNode>;
  translate?: SDFPoint;
  rotate?: SDFPoint;
  scale?: SDFPoint;
}

export interface SDFEvaluation {
  distance: number;
  point: SDFPoint;
  rootType: SDFNode['type'];
  primitive?: SDFPrimitive;
  operation?: SDFCSGOperation | SDFDomainOperation;
}

function finite(value: number, name: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`sdf.evaluator: ${name} must be finite`);
  }
  return value;
}

function param(params: Readonly<Record<string, number>> | undefined, name: string, fallback: number): number {
  return finite(params?.[name] ?? fallback, `params.${name}`);
}

function point(point: SDFPoint): [number, number, number] {
  if (point.length !== 3) {
    throw new Error('sdf.evaluator: point must contain exactly three coordinates');
  }
  return [
    finite(point[0], 'point.x'),
    finite(point[1], 'point.y'),
    finite(point[2], 'point.z'),
  ];
}

function length2(x: number, y: number): number {
  return Math.hypot(x, y);
}

function length3(x: number, y: number, z: number): number {
  return Math.hypot(x, y, z);
}

function dot2(ax: number, ay: number, bx: number, by: number): number {
  return ax * bx + ay * by;
}

function dot3(a: SDFPoint, b: SDFPoint): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sign(value: number): number {
  return value < 0 ? -1 : 1;
}

function glslMod(value: number, divisor: number): number {
  if (divisor === 0) return value;
  return value - divisor * Math.floor(value / divisor);
}

function absPoint(p: SDFPoint): [number, number, number] {
  return [Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2])];
}

function transformPoint(node: SDFNode, input: SDFPoint): [number, number, number] {
  let p = point(input);
  if (node.translate) {
    const t = point(node.translate);
    p = [p[0] - t[0], p[1] - t[1], p[2] - t[2]];
  }
  if (node.rotate) {
    const [rx, ry, rz] = point(node.rotate);
    if (rx !== 0) {
      const c = Math.cos(rx);
      const s = Math.sin(rx);
      p = [p[0], c * p[1] - s * p[2], s * p[1] + c * p[2]];
    }
    if (ry !== 0) {
      const c = Math.cos(ry);
      const s = Math.sin(ry);
      p = [c * p[0] - s * p[2], p[1], s * p[0] + c * p[2]];
    }
    if (rz !== 0) {
      const c = Math.cos(rz);
      const s = Math.sin(rz);
      p = [c * p[0] - s * p[1], s * p[0] + c * p[1], p[2]];
    }
  }
  if (node.scale) {
    const s = point(node.scale);
    if (s.some((value) => value === 0)) {
      throw new Error('sdf.evaluator: node.scale entries must be non-zero');
    }
    p = [p[0] / s[0], p[1] / s[1], p[2] / s[2]];
  }
  return p;
}

function scaleDistance(node: SDFNode, distance: number): number {
  if (!node.scale) return distance;
  const s = point(node.scale);
  return distance * Math.min(Math.abs(s[0]), Math.abs(s[1]), Math.abs(s[2]));
}

function boxDistance(p: SDFPoint, b: SDFPoint): number {
  const q = [Math.abs(p[0]) - b[0], Math.abs(p[1]) - b[1], Math.abs(p[2]) - b[2]] as const;
  const outside = length3(Math.max(q[0], 0), Math.max(q[1], 0), Math.max(q[2], 0));
  const inside = Math.min(Math.max(q[0], Math.max(q[1], q[2])), 0);
  return outside + inside;
}

function cylinderDistance(p: SDFPoint, height: number, radius: number): number {
  const dx = Math.abs(length2(p[0], p[2])) - radius;
  const dy = Math.abs(p[1]) - height;
  return Math.min(Math.max(dx, dy), 0) + length2(Math.max(dx, 0), Math.max(dy, 0));
}

function coneDistance(p: SDFPoint, c: readonly [number, number], height: number): number {
  const q = [height * (c[0] / c[1]), -height] as const;
  const w = [length2(p[0], p[2]), p[1]] as const;
  const qDot = dot2(q[0], q[1], q[0], q[1]);
  const aScale = qDot === 0 ? 0 : clamp(dot2(w[0], w[1], q[0], q[1]) / qDot, 0, 1);
  const a = [w[0] - q[0] * aScale, w[1] - q[1] * aScale] as const;
  const b = [w[0] - q[0] * clamp(w[0] / q[0], 0, 1), w[1] - q[1]] as const;
  const k = sign(q[1]);
  const d = Math.min(dot2(a[0], a[1], a[0], a[1]), dot2(b[0], b[1], b[0], b[1]));
  const s = Math.max(k * (w[0] * q[1] - w[1] * q[0]), k * (w[1] - q[1]));
  return Math.sqrt(d) * sign(s);
}

function capsuleDistance(p: SDFPoint, a: SDFPoint, b: SDFPoint, radius: number): number {
  const pa = [p[0] - a[0], p[1] - a[1], p[2] - a[2]] as const;
  const ba = [b[0] - a[0], b[1] - a[1], b[2] - a[2]] as const;
  const denom = dot3(ba, ba);
  const h = denom === 0 ? 0 : clamp(dot3(pa, ba) / denom, 0, 1);
  return length3(pa[0] - ba[0] * h, pa[1] - ba[1] * h, pa[2] - ba[2] * h) - radius;
}

function primitiveDistance(node: SDFNode, input: SDFPoint): number {
  if (!node.primitive) {
    throw new Error('sdf.evaluator: primitive node requires primitive');
  }
  const p = transformPoint(node, input);
  const params = node.params;
  let d: number;

  switch (node.primitive) {
    case 'sphere':
      d = length3(p[0], p[1], p[2]) - param(params, 'radius', 1);
      break;
    case 'box':
      d = boxDistance(p, [param(params, 'width', 1), param(params, 'height', 1), param(params, 'depth', 1)]);
      break;
    case 'rounded_box':
      d =
        boxDistance(p, [param(params, 'width', 1), param(params, 'height', 1), param(params, 'depth', 1)]) -
        param(params, 'radius', 0.1);
      break;
    case 'torus': {
      const qx = length2(p[0], p[2]) - param(params, 'majorRadius', 0.5);
      d = length2(qx, p[1]) - param(params, 'minorRadius', 0.15);
      break;
    }
    case 'cylinder':
      d = cylinderDistance(p, param(params, 'height', 1), param(params, 'radius', 0.5));
      break;
    case 'cone':
      d = coneDistance(
        p,
        [param(params, 'c0', 0.45), param(params, 'c1', 0.35)],
        param(params, 'height', 1)
      );
      break;
    case 'capsule': {
      const height = param(params, 'height', 0.5);
      d = capsuleDistance(p, [0, -height, 0], [0, height, 0], param(params, 'radius', 0.3));
      break;
    }
    case 'ellipsoid': {
      const rx = param(params, 'rx', param(params, 'radius', 1));
      const ry = param(params, 'ry', param(params, 'radius', 1));
      const rz = param(params, 'rz', param(params, 'radius', 1));
      const k0 = length3(p[0] / rx, p[1] / ry, p[2] / rz);
      const k1 = length3(p[0] / (rx * rx), p[1] / (ry * ry), p[2] / (rz * rz));
      d = k1 === 0 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
      break;
    }
    case 'plane': {
      const normal = [param(params, 'nx', 0), param(params, 'ny', 1), param(params, 'nz', 0)] as const;
      d = dot3(p, normal) + param(params, 'h', 0);
      break;
    }
    case 'hex_prism':
      d = hexPrismDistance(p, param(params, 'hx', 1), param(params, 'hy', 0.5));
      break;
    case 'tri_prism':
      d = triPrismDistance(p, param(params, 'hx', 1), param(params, 'hy', 0.5));
      break;
    case 'octahedron':
      d = octahedronDistance(p, param(params, 'size', 1));
      break;
    case 'pyramid':
      d = pyramidDistance(p, param(params, 'height', 1));
      break;
    case 'link':
      d = linkDistance(p, param(params, 'le', 0.25), param(params, 'r1', 0.4), param(params, 'r2', 0.1));
      break;
    case 'capped_torus':
      d = cappedTorusDistance(
        p,
        [param(params, 'scx', 0.8660254), param(params, 'scy', 0.5)],
        param(params, 'ra', 0.5),
        param(params, 'rb', 0.15)
      );
      break;
    case 'round_cone':
      d = roundConeDistance(p, param(params, 'r1', 0.4), param(params, 'r2', 0.2), param(params, 'height', 1));
      break;
    case 'vesica':
      d = vesicaDistance(p, param(params, 'a', 0.7), param(params, 'b', 0.3));
      break;
    case 'rhombus':
      d = rhombusDistance(
        p,
        param(params, 'la', 0.6),
        param(params, 'lb', 0.4),
        param(params, 'height', 0.2),
        param(params, 'radius', 0.05)
      );
      break;
    case 'gyroid':
      d = gyroidDistance(p, param(params, 'scale', 5), param(params, 'thickness', 0.03));
      break;
    case 'heart':
      d = heartDistance(p);
      break;
    case 'mandelbulb':
      d = mandelbulbDistance(p);
      break;
    case 'menger':
      d = mengerDistance(p, Math.min(4, Math.max(0, Math.floor(param(params, 'iterations', 3)))));
      break;
    default:
      throw new Error(`sdf.evaluator: unsupported primitive ${node.primitive satisfies never}`);
  }

  return scaleDistance(node, d);
}

function hexPrismDistance(input: SDFPoint, hx: number, hy: number): number {
  const k = [-0.8660254, 0.5, 0.57735] as const;
  let p = absPoint(input);
  const dot = k[0] * p[0] + k[1] * p[1];
  p = [p[0] - 2 * Math.min(dot, 0) * k[0], p[1] - 2 * Math.min(dot, 0) * k[1], p[2]];
  const clamped = clamp(p[0], -k[2] * hx, k[2] * hx);
  const dx = length2(p[0] - clamped, p[1] - hx) * sign(p[1] - hx);
  const dy = p[2] - hy;
  return Math.min(Math.max(dx, dy), 0) + length2(Math.max(dx, 0), Math.max(dy, 0));
}

function triPrismDistance(input: SDFPoint, hx: number, hy: number): number {
  const q = absPoint(input);
  return Math.max(q[2] - hy, Math.max(q[0] * 0.866025 + input[1] * 0.5, -input[1]) - hx * 0.5);
}

function octahedronDistance(input: SDFPoint, size: number): number {
  const p = absPoint(input);
  const m = p[0] + p[1] + p[2] - size;
  if (3 * p[0] >= m && 3 * p[1] >= m && 3 * p[2] >= m) return m * 0.57735027;
  const q =
    3 * p[0] < m
      ? p
      : 3 * p[1] < m
        ? ([p[1], p[2], p[0]] as const)
        : ([p[2], p[0], p[1]] as const);
  const k = clamp(0.5 * (q[2] - q[1] + size), 0, size);
  return length3(q[0], q[1] - size + k, q[2] - k);
}

function pyramidDistance(input: SDFPoint, height: number): number {
  let px = Math.abs(input[0]);
  let pz = Math.abs(input[2]);
  const py = input[1];
  if (pz > px) [px, pz] = [pz, px];
  px -= 0.5;
  pz -= 0.5;
  const m2 = height * height + 0.25;
  const q = [pz, height * py - 0.5 * px, height * px + 0.5 * py] as const;
  const s = Math.max(-q[0], 0);
  const t = clamp((q[1] - 0.5 * pz) / (m2 + 0.25), 0, 1);
  const a = m2 * (q[0] + s) * (q[0] + s) + q[1] * q[1];
  const b = m2 * (q[0] + 0.5 * t) * (q[0] + 0.5 * t) + (q[1] - m2 * t) * (q[1] - m2 * t);
  const d2 = Math.min(q[1], -q[0] * m2 - q[1] * 0.5) > 0 ? 0 : Math.min(a, b);
  return Math.sqrt((d2 + q[2] * q[2]) / m2) * sign(Math.max(q[2], -py));
}

function linkDistance(p: SDFPoint, le: number, r1: number, r2: number): number {
  const qy = Math.max(Math.abs(p[1]) - le, 0);
  return length2(length2(p[0], qy) - r1, p[2]) - r2;
}

function cappedTorusDistance(input: SDFPoint, sc: readonly [number, number], ra: number, rb: number): number {
  const p = [Math.abs(input[0]), input[1], input[2]] as const;
  const k = sc[1] * p[0] > sc[0] * p[1] ? dot2(p[0], p[1], sc[0], sc[1]) : length2(p[0], p[1]);
  return Math.sqrt(dot3(p, p) + ra * ra - 2 * ra * k) - rb;
}

function roundConeDistance(input: SDFPoint, r1: number, r2: number, height: number): number {
  const b = (r1 - r2) / height;
  const a = Math.sqrt(Math.max(0, 1 - b * b));
  const q = [length2(input[0], input[2]), input[1]] as const;
  const k = dot2(q[0], q[1], -b, a);
  if (k < 0) return length2(q[0], q[1]) - r1;
  if (k > a * height) return length2(q[0], q[1] - height) - r2;
  return dot2(q[0], q[1], a, b) - r1;
}

function vesicaDistance(input: SDFPoint, a: number, b: number): number {
  const p = [Math.abs(input[0]), input[1], input[2]] as const;
  const r = 0.5 * ((a * a) / b + b);
  const q = [length2(p[0], p[2]), p[1] - r + b] as const;
  return Math.max(q[1], length2(q[0], q[1]) - r);
}

function rhombusDistance(input: SDFPoint, la: number, lb: number, height: number, radius: number): number {
  const p = absPoint(input);
  const f = clamp((la * (la - 2 * p[0]) + lb * (lb - 2 * p[2])) / (la * la + lb * lb), -1, 1);
  const qx =
    length2(p[0] - 0.5 * la * (1 - f), p[2] - 0.5 * lb * (1 + f)) *
      sign(p[0] * lb + p[2] * la - la * lb) -
    radius;
  const qy = p[1] - height;
  return Math.min(Math.max(qx, qy), 0) + length2(Math.max(qx, 0), Math.max(qy, 0));
}

function gyroidDistance(p: SDFPoint, scale: number, thickness: number): number {
  const x = p[0] * scale;
  const y = p[1] * scale;
  const z = p[2] * scale;
  return Math.abs(Math.sin(x) * Math.cos(z) + Math.sin(y) * Math.cos(x) + Math.sin(z) * Math.cos(y)) / scale - thickness;
}

function heartDistance(input: SDFPoint): number {
  const x = Math.abs(input[0]);
  const y = input[1];
  if (y + x > 1) return length2(x - 0.25, y - 0.75) - Math.SQRT2 / 4;
  return Math.sqrt(Math.min(length2(0, y - 1) ** 2, length2(x - 0.5 * Math.max(x + y, 0), y - 0.5 * Math.max(x + y, 0)) ** 2)) * sign(x - y);
}

function mandelbulbDistance(input: SDFPoint): number {
  let w: [number, number, number] = point(input);
  let m = dot3(w, w);
  let dz = 1;
  for (let i = 0; i < 4; i++) {
    const r = Math.sqrt(m);
    if (r === 0) return 0;
    dz = 8 * Math.pow(m, 3.5) * dz + 1;
    const b = 8 * Math.acos(clamp(w[1] / r, -1, 1));
    const a = 8 * Math.atan2(w[0], w[2]);
    const pow = Math.pow(r, 8);
    w = [
      input[0] + pow * Math.sin(b) * Math.sin(a),
      input[1] + pow * Math.cos(b),
      input[2] + pow * Math.sin(b) * Math.cos(a),
    ];
    m = dot3(w, w);
    if (m > 256) break;
  }
  return 0.25 * Math.log(m) * Math.sqrt(m) / dz;
}

function mengerDistance(input: SDFPoint, iterations: number): number {
  let p: [number, number, number] = point(input);
  let d = boxDistance(p, [1, 1, 1]);
  let s = 1;
  for (let m = 0; m < iterations; m++) {
    const a = [
      glslMod(p[0] * s, 2) - 1,
      glslMod(p[1] * s, 2) - 1,
      glslMod(p[2] * s, 2) - 1,
    ] as const;
    s *= 3;
    const r = [Math.abs(1 - 3 * Math.abs(a[0])), Math.abs(1 - 3 * Math.abs(a[1])), Math.abs(1 - 3 * Math.abs(a[2]))] as const;
    const da = Math.max(r[0], r[1]);
    const db = Math.max(r[1], r[2]);
    const dc = Math.max(r[2], r[0]);
    const c = (Math.min(da, db, dc) - 1) / s;
    d = Math.max(d, c);
    p = [p[0], p[1], p[2]];
  }
  return d;
}

function smoothUnion(d1: number, d2: number, k: number): number {
  const h = clamp(0.5 + (0.5 * (d2 - d1)) / k, 0, 1);
  return d2 * (1 - h) + d1 * h - k * h * (1 - h);
}

function smoothIntersect(d1: number, d2: number, k: number): number {
  const h = clamp(0.5 - (0.5 * (d2 - d1)) / k, 0, 1);
  return d2 * (1 - h) + d1 * h + k * h * (1 - h);
}

function smoothDifference(d1: number, d2: number, k: number): number {
  const h = clamp(0.5 - (0.5 * (d2 + d1)) / k, 0, 1);
  return d1 * (1 - h) - d2 * h + k * h * (1 - h);
}

function domainPoint(node: SDFNode, input: SDFPoint): [number, number, number] {
  const p = point(input);
  const params = node.params;
  switch (node.operation) {
    case 'repeat': {
      const c = [param(params, 'cx', 2), param(params, 'cy', 2), param(params, 'cz', 2)] as const;
      return [
        glslMod(p[0] + 0.5 * c[0], c[0]) - 0.5 * c[0],
        glslMod(p[1] + 0.5 * c[1], c[1]) - 0.5 * c[1],
        glslMod(p[2] + 0.5 * c[2], c[2]) - 0.5 * c[2],
      ];
    }
    case 'twist': {
      const k = param(params, 'k', 1);
      const c = Math.cos(k * p[1]);
      const s = Math.sin(k * p[1]);
      return [c * p[0] - s * p[2], p[1], s * p[0] + c * p[2]];
    }
    case 'bend': {
      const k = param(params, 'k', 1);
      const c = Math.cos(k * p[0]);
      const s = Math.sin(k * p[0]);
      return [p[0], c * p[1] - s * p[2], s * p[1] + c * p[2]];
    }
    default:
      throw new Error(`sdf.evaluator: unsupported domain operation ${String(node.operation)}`);
  }
}

export function evaluateSDFNode(root: SDFNode, samplePoint: SDFPoint): number {
  if (root.type === 'primitive') return primitiveDistance(root, samplePoint);

  if (root.type === 'domain') {
    const child = root.children?.[0];
    if (!child) throw new Error('sdf.evaluator: domain node requires one child');
    return evaluateSDFNode(child, domainPoint(root, samplePoint));
  }

  if (root.type === 'csg') {
    const children = root.children ?? [];
    if (children.length < 2) {
      throw new Error('sdf.evaluator: csg node requires at least two children');
    }
    const op = root.operation as SDFCSGOperation | undefined;
    let distance = evaluateSDFNode(children[0]!, samplePoint);
    for (let i = 1; i < children.length; i++) {
      const next = evaluateSDFNode(children[i]!, samplePoint);
      const k = root.smoothness ?? 0.1;
      switch (op) {
        case 'union':
          distance = Math.min(distance, next);
          break;
        case 'intersect':
          distance = Math.max(distance, next);
          break;
        case 'difference':
        case 'subtract':
          distance = Math.max(distance, -next);
          break;
        case 'smooth_union':
          distance = smoothUnion(distance, next, k);
          break;
        case 'smooth_intersect':
          distance = smoothIntersect(distance, next, k);
          break;
        case 'smooth_difference':
        case 'smooth_subtract':
          distance = smoothDifference(distance, next, k);
          break;
        default:
          throw new Error(`sdf.evaluator: unsupported csg operation ${String(op)}`);
      }
    }
    return distance;
  }

  throw new Error(`sdf.evaluator: unsupported node type ${(root as SDFNode).type}`);
}

export class SDFPointEvaluator {
  constructor(readonly root: SDFNode) {}

  evaluate(samplePoint: SDFPoint): SDFEvaluation {
    return {
      distance: evaluateSDFNode(this.root, samplePoint),
      point: point(samplePoint),
      rootType: this.root.type,
      ...(this.root.primitive ? { primitive: this.root.primitive } : {}),
      ...(this.root.operation ? { operation: this.root.operation } : {}),
    };
  }

  sample(points: ReadonlyArray<SDFPoint>): ReadonlyArray<SDFEvaluation> {
    return points.map((samplePoint) => this.evaluate(samplePoint));
  }
}
