/**
 * SDFRayMarchCompiler — Signed Distance Function Ray Marching Compiler
 *
 * Maps HoloScript `geometry:` values to Quilez SDF functions and compiles
 * CSG trees into GLSL ray marching shaders. For mathematical/organic shapes
 * that can't be expressed as triangle meshes efficiently.
 *
 * 22 SDF primitives, 6 CSG operations, 3 domain operations.
 *
 * Named SDFRayMarchCompiler to distinguish from the existing SDFCompiler
 * which handles Gazebo Simulation Description Format export.
 *
 * @see HS-GEO-3: SDF Ray Marching
 * @see W.239: SDF compiler → GLSL fragment shader
 * @see G.CHAR.005: SDF for organic shapes in sculpt stage
 */

// =============================================================================
// Types
// =============================================================================

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

export type CSGOperation =
  | 'union'
  | 'intersect'
  | 'difference'
  | 'subtract'
  | 'smooth_union'
  | 'smooth_intersect'
  | 'smooth_difference'
  | 'smooth_subtract';

export type DomainOperation = 'repeat' | 'twist' | 'bend';

export interface SDFNode {
  type: 'primitive' | 'csg' | 'domain';
  primitive?: SDFPrimitive;
  params?: Record<string, number>;
  operation?: CSGOperation | DomainOperation;
  smoothness?: number;
  children?: SDFNode[];
  translate?: [number, number, number];
  rotate?: [number, number, number];
  scale?: [number, number, number];
}

export interface SDFCompileResult {
  fragmentShader: string;
  vertexShader: string;
  uniformDeclarations: string[];
  primitiveCount: number;
  maxMarchSteps: number;
}

// =============================================================================
// GLSL SDF Library (Inigo Quilez primitives)
// =============================================================================

const SDF_PRIMITIVES: Record<SDFPrimitive, string> = {
  sphere: `float sdSphere(vec3 p, float r) { return length(p) - r; }`,
  box: `float sdBox(vec3 p, vec3 b) { vec3 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q[0], max(q[1], q[2])), 0.0); }`,
  rounded_box: `float sdRoundBox(vec3 p, vec3 b, float r) { vec3 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q[0], max(q[1], q[2])), 0.0) - r; }`,
  torus: `float sdTorus(vec3 p, vec2 t) { vec2 q = vec2(length(p.xz) - t[0], p[1]); return length(q) - t[1]; }`,
  cylinder: `float sdCylinder(vec3 p, float h, float r) { vec2 d = abs(vec2(length(p.xz), p[1])) - vec2(r, h); return min(max(d[0], d[1]), 0.0) + length(max(d, 0.0)); }`,
  cone: `float sdCone(vec3 p, vec2 c, float h) { vec2 q = h * vec2(c[0] / c[1], -1.0); vec2 w = vec2(length(p.xz), p[1]); vec2 a = w - q * clamp(dot(w, q) / dot(q, q), 0.0, 1.0); vec2 b = w - q * vec2(clamp(w[0] / q[0], 0.0, 1.0), 1.0); float k = sign(q[1]); float d = min(dot(a, a), dot(b, b)); float s = max(k * (w[0] * q[1] - w[1] * q[0]), k * (w[1] - q[1])); return sqrt(d) * sign(s); }`,
  capsule: `float sdCapsule(vec3 p, vec3 a, vec3 b, float r) { vec3 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h) - r; }`,
  ellipsoid: `float sdEllipsoid(vec3 p, vec3 r) { float k0 = length(p / r); float k1 = length(p / (r * r)); return k0 * (k0 - 1.0) / k1; }`,
  plane: `float sdPlane(vec3 p, vec3 n, float h) { return dot(p, n) + h; }`,
  hex_prism: `float sdHexPrism(vec3 p, vec2 h) { vec3 k = vec3(-0.8660254, 0.5, 0.57735); p = abs(p); p.xy -= 2.0 * min(dot(k.xy, p.xy), 0.0) * k.xy; vec2 d = vec2(length(p.xy - vec2(clamp(p[0], -k[2] * h[0], k[2] * h[0]), h[0])) * sign(p[1] - h[0]), p[2] - h[1]); return min(max(d[0], d[1]), 0.0) + length(max(d, 0.0)); }`,
  tri_prism: `float sdTriPrism(vec3 p, vec2 h) { vec3 q = abs(p); return max(q[2] - h[1], max(q[0] * 0.866025 + p[1] * 0.5, -p[1]) - h[0] * 0.5); }`,
  octahedron: `float sdOctahedron(vec3 p, float s) { p = abs(p); float m = p[0] + p[1] + p[2] - s; vec3 q; if (3.0 * p[0] < m) q = p.xyz; else if (3.0 * p[1] < m) q = p.yzx; else if (3.0 * p[2] < m) q = p.zxy; else return m * 0.57735027; float k = clamp(0.5 * (q[2] - q[1] + s), 0.0, s); return length(vec3(q[0], q[1] - s + k, q[2] - k)); }`,
  pyramid: `float sdPyramid(vec3 p, float h) { float m2 = h * h + 0.25; p.xz = abs(p.xz); p.xz = (p[2] > p[0]) ? p.zx : p.xz; p.xz -= 0.5; vec3 q = vec3(p[2], h * p[1] - 0.5 * p[0], h * p[0] + 0.5 * p[1]); float s = max(-q[0], 0.0); float t = clamp((q[1] - 0.5 * p[2]) / (m2 + 0.25), 0.0, 1.0); float a = m2 * (q[0] + s) * (q[0] + s) + q[1] * q[1]; float b = m2 * (q[0] + 0.5 * t) * (q[0] + 0.5 * t) + (q[1] - m2 * t) * (q[1] - m2 * t); float d2 = min(q[1], -q[0] * m2 - q[1] * 0.5) > 0.0 ? 0.0 : min(a, b); return sqrt((d2 + q[2] * q[2]) / m2) * sign(max(q[2], -p[1])); }`,
  link: `float sdLink(vec3 p, float le, float r1, float r2) { vec3 q = vec3(p[0], max(abs(p[1]) - le, 0.0), p[2]); return length(vec2(length(q.xy) - r1, q[2])) - r2; }`,
  capped_torus: `float sdCappedTorus(vec3 p, vec2 sc, float ra, float rb) { p[0] = abs(p[0]); float k = (sc[1] * p[0] > sc[0] * p[1]) ? dot(p.xy, sc) : length(p.xy); return sqrt(dot(p, p) + ra * ra - 2.0 * ra * k) - rb; }`,
  round_cone: `float sdRoundCone(vec3 p, float r1, float r2, float h) { float b = (r1 - r2) / h; float a = sqrt(1.0 - b * b); vec2 q = vec2(length(p.xz), p[1]); float k = dot(q, vec2(-b, a)); if (k < 0.0) return length(q) - r1; if (k > a * h) return length(q - vec2(0.0, h)) - r2; return dot(q, vec2(a, b)) - r1; }`,
  vesica: `float sdVesica(vec3 p, float a, float b) { p = abs(p); float r = 0.5 * (a * a / b + b); vec2 q = vec2(length(p.xz), p[1] - r + b); float d = max(q[1], length(q) - r); return d; }`,
  rhombus: `float sdRhombus(vec3 p, float la, float lb, float h, float ra) { p = abs(p); vec2 b = vec2(la, lb); float f = clamp((dot(b, b - 2.0 * p.xz)) / dot(b, b), -1.0, 1.0); vec2 q = vec2(length(p.xz - 0.5 * b * vec2(1.0 - f, 1.0 + f)) * sign(p[0] * b[1] + p[2] * b[0] - b[0] * b[1]) - ra, p[1] - h); return min(max(q[0], q[1]), 0.0) + length(max(q, 0.0)); }`,
  gyroid: `float sdGyroid(vec3 p, float scale, float thickness) { p *= scale; return abs(dot(sin(p), cos(p.zxy))) / scale - thickness; }`,
  heart: `float sdHeart(vec3 p) { p[0] = abs(p[0]); if (p[1] + p[0] > 1.0) return sqrt(dot(p.xy - vec2(0.25, 0.75), p.xy - vec2(0.25, 0.75))) - sqrt(2.0) / 4.0; return sqrt(min(dot(p.xy - vec2(0.0, 1.0), p.xy - vec2(0.0, 1.0)), dot(p.xy - 0.5 * max(p[0] + p[1], 0.0), p.xy - 0.5 * max(p[0] + p[1], 0.0)))) * sign(p[0] - p[1]); }`,
  mandelbulb: `float sdMandelbulb(vec3 p) { vec3 w = p; float m = dot(w, w); float dz = 1.0; for (int i = 0; i < 4; i++) { dz = 8.0 * pow(m, 3.5) * dz + 1.0; float r = length(w); float b = 8.0 * acos(w[1] / r); float a = 8.0 * atan(w[0], w[2]); w = p + pow(r, 8.0) * vec3(sin(b) * sin(a), cos(b), sin(b) * cos(a)); m = dot(w, w); if (m > 256.0) break; } return 0.25 * log(m) * sqrt(m) / dz; }`,
  menger: `float sdMenger(vec3 p, int iterations) { float d = sdBox(p, vec3(1.0)); float s = 1.0; for (int m = 0; m < 4; m++) { if (m >= iterations) break; vec3 a = mod(p * s, 2.0) - 1.0; s *= 3.0; vec3 r = abs(1.0 - 3.0 * abs(a)); float da = max(r[0], r[1]); float db = max(r[1], r[2]); float dc = max(r[2], r[0]); float c = (min(da, min(db, dc)) - 1.0) / s; d = max(d, c); } return d; }`,
};

const CSG_OPERATIONS: Record<CSGOperation, string> = {
  union: `float opUnion(float d1, float d2) { return min(d1, d2); }`,
  intersect: `float opIntersect(float d1, float d2) { return max(d1, d2); }`,
  difference: `float opDifference(float d1, float d2) { return max(d1, -d2); }`,
  subtract: `float opSubtract(float d1, float d2) { return max(d1, -d2); }`,
  smooth_union: `float opSmoothUnion(float d1, float d2, float k) { float h = clamp(0.5 + 0.5 * (d2 - d1) / k, 0.0, 1.0); return mix(d2, d1, h) - k * h * (1.0 - h); }`,
  smooth_intersect: `float opSmoothIntersect(float d1, float d2, float k) { float h = clamp(0.5 - 0.5 * (d2 - d1) / k, 0.0, 1.0); return mix(d2, d1, h) + k * h * (1.0 - h); }`,
  smooth_difference: `float opSmoothDifference(float d1, float d2, float k) { float h = clamp(0.5 - 0.5 * (d2 + d1) / k, 0.0, 1.0); return mix(d1, -d2, h) + k * h * (1.0 - h); }`,
  smooth_subtract: `float opSmoothSubtract(float d1, float d2, float k) { float h = clamp(0.5 - 0.5 * (d2 + d1) / k, 0.0, 1.0); return mix(d1, -d2, h) + k * h * (1.0 - h); }`,
};

const DOMAIN_OPERATIONS: Record<DomainOperation, string> = {
  repeat: `vec3 opRepeat(vec3 p, vec3 c) { return mod(p + 0.5 * c, c) - 0.5 * c; }`,
  twist: `vec3 opTwist(vec3 p, float k) { float c = cos(k * p[1]); float s = sin(k * p[1]); mat2 m = mat2(c, -s, s, c); return vec3(m * p.xz, p[1]); }`,
  bend: `vec3 opBend(vec3 p, float k) { float c = cos(k * p[0]); float s = sin(k * p[0]); mat2 m = mat2(c, -s, s, c); return vec3(p[0], m * p.yz); }`,
};

// =============================================================================
// Compiler
// =============================================================================

function collectPrimitives(node: SDFNode, set: Set<SDFPrimitive>): void {
  if (node.type === 'primitive' && node.primitive) {
    set.add(node.primitive);
  }
  if (node.children) {
    for (const child of node.children) {
      collectPrimitives(child, set);
    }
  }
}

function collectCSG(node: SDFNode, set: Set<CSGOperation>): void {
  if (node.type === 'csg' && node.operation) {
    set.add(node.operation as CSGOperation);
  }
  if (node.children) {
    for (const child of node.children) {
      collectCSG(child, set);
    }
  }
}

function collectDomain(node: SDFNode, set: Set<DomainOperation>): void {
  if (node.type === 'domain' && node.operation) {
    set.add(node.operation as DomainOperation);
  }
  if (node.children) {
    for (const child of node.children) {
      collectDomain(child, set);
    }
  }
}

let _nodeCounter = 0;

function compileNode(node: SDFNode): string {
  const id = _nodeCounter++;

  if (node.type === 'primitive' && node.primitive) {
    const p = `p${id}`;
    let lines = `  vec3 ${p} = p;\n`;

    if (node.translate) {
      lines += `  ${p} -= vec3(${node.translate.join(', ')});\n`;
    }
    if (node.rotate) {
      const [rx, ry, rz] = node.rotate;
      if (rx !== 0)
        lines += `  ${p}.yz = mat2(cos(${rx.toFixed(4)}), -sin(${rx.toFixed(4)}), sin(${rx.toFixed(4)}), cos(${rx.toFixed(4)})) * ${p}.yz;\n`;
      if (ry !== 0)
        lines += `  ${p}.xz = mat2(cos(${ry.toFixed(4)}), -sin(${ry.toFixed(4)}), sin(${ry.toFixed(4)}), cos(${ry.toFixed(4)})) * ${p}.xz;\n`;
      if (rz !== 0)
        lines += `  ${p}.xy = mat2(cos(${rz.toFixed(4)}), -sin(${rz.toFixed(4)}), sin(${rz.toFixed(4)}), cos(${rz.toFixed(4)})) * ${p}.xy;\n`;
    }
    if (node.scale) {
      lines += `  ${p} /= vec3(${node.scale.join(', ')});\n`;
    }

    const params = node.params || {};
    switch (node.primitive) {
      case 'sphere':
        lines += `  float d${id} = sdSphere(${p}, ${(params.radius || 1.0).toFixed(4)});\n`;
        break;
      case 'box':
        lines += `  float d${id} = sdBox(${p}, vec3(${(params.width || 1).toFixed(4)}, ${(params.height || 1).toFixed(4)}, ${(params.depth || 1).toFixed(4)}));\n`;
        break;
      case 'torus':
        lines += `  float d${id} = sdTorus(${p}, vec2(${(params.majorRadius || 0.5).toFixed(4)}, ${(params.minorRadius || 0.15).toFixed(4)}));\n`;
        break;
      case 'cylinder':
        lines += `  float d${id} = sdCylinder(${p}, ${(params.height || 1).toFixed(4)}, ${(params.radius || 0.5).toFixed(4)});\n`;
        break;
      case 'capsule':
        lines += `  float d${id} = sdCapsule(${p}, vec3(0.0, -${(params.height || 0.5).toFixed(4)}, 0.0), vec3(0.0, ${(params.height || 0.5).toFixed(4)}, 0.0), ${(params.radius || 0.3).toFixed(4)});\n`;
        break;
      case 'gyroid':
        lines += `  float d${id} = sdGyroid(${p}, ${(params.scale || 5).toFixed(4)}, ${(params.thickness || 0.03).toFixed(4)});\n`;
        break;
      case 'mandelbulb':
        lines += `  float d${id} = sdMandelbulb(${p});\n`;
        break;
      case 'rounded_box': {
        const w = (params.width ?? 1).toFixed(4);
        const h = (params.height ?? 1).toFixed(4);
        const d = (params.depth ?? 1).toFixed(4);
        const r = (params.radius ?? 0.1).toFixed(4);
        lines += `  float d${id} = sdRoundBox(${p}, vec3(${w}, ${h}, ${d}), ${r});\n`;
        break;
      }
      case 'cone': {
        const c0 = (params.c0 ?? 0.45).toFixed(4);
        const c1 = (params.c1 ?? 0.35).toFixed(4);
        const ch = (params.height ?? 1).toFixed(4);
        lines += `  float d${id} = sdCone(${p}, vec2(${c0}, ${c1}), ${ch});\n`;
        break;
      }
      case 'ellipsoid': {
        const rx = (params.rx ?? params.radius ?? 1).toFixed(4);
        const ry = (params.ry ?? params.radius ?? 1).toFixed(4);
        const rz = (params.rz ?? params.radius ?? 1).toFixed(4);
        lines += `  float d${id} = sdEllipsoid(${p}, vec3(${rx}, ${ry}, ${rz}));\n`;
        break;
      }
      case 'plane': {
        const nx = (params.nx ?? 0).toFixed(4);
        const ny = (params.ny ?? 1).toFixed(4);
        const nz = (params.nz ?? 0).toFixed(4);
        const h = (params.h ?? 0).toFixed(4);
        lines += `  float d${id} = sdPlane(${p}, vec3(${nx}, ${ny}, ${nz}), ${h});\n`;
        break;
      }
      case 'hex_prism': {
        const hx = (params.hx ?? 1).toFixed(4);
        const hy = (params.hy ?? 0.5).toFixed(4);
        lines += `  float d${id} = sdHexPrism(${p}, vec2(${hx}, ${hy}));\n`;
        break;
      }
      case 'octahedron': {
        const s = (params.size ?? 1).toFixed(4);
        lines += `  float d${id} = sdOctahedron(${p}, ${s});\n`;
        break;
      }
      case 'pyramid': {
        const ph = (params.height ?? 1).toFixed(4);
        lines += `  float d${id} = sdPyramid(${p}, ${ph});\n`;
        break;
      }
      case 'link': {
        const le = (params.le ?? 0.25).toFixed(4);
        const r1 = (params.r1 ?? 0.4).toFixed(4);
        const r2 = (params.r2 ?? 0.1).toFixed(4);
        lines += `  float d${id} = sdLink(${p}, ${le}, ${r1}, ${r2});\n`;
        break;
      }
      case 'menger':
        lines += `  float d${id} = sdMenger(${p}, ${Math.min(4, Math.max(0, Math.floor(params.iterations ?? 3)))});\n`;
        break;
      default:
        lines += `  float d${id} = sdSphere(${p}, 1.0);\n`;
    }

    if (node.scale) {
      lines += `  d${id} *= min(${node.scale[0].toFixed(4)}, min(${node.scale[1].toFixed(4)}, ${node.scale[2].toFixed(4)}));\n`;
    }

    return lines;
  }

  if (node.type === 'domain' && node.children && node.children.length > 0) {
    const op = node.operation as DomainOperation;
    const params = node.params || {};
    let lines = '';

    if (op === 'repeat') {
      lines += `  p = opRepeat(p, vec3(${(params.cx || 2).toFixed(4)}, ${(params.cy || 2).toFixed(4)}, ${(params.cz || 2).toFixed(4)}));\n`;
    } else if (op === 'twist') {
      lines += `  p = opTwist(p, ${(params.k || 1).toFixed(4)});\n`;
    } else if (op === 'bend') {
      lines += `  p = opBend(p, ${(params.k || 1).toFixed(4)});\n`;
    }

    lines += compileNode(node.children[0]);
    return lines;
  }

  if (node.type === 'csg' && node.children && node.children.length >= 2) {
    const op = node.operation as CSGOperation;
    let lines = '';

    lines += compileNode(node.children[0]!);
    let accId = _nodeCounter - 1;

    for (let i = 1; i < node.children.length; i++) {
      lines += compileNode(node.children[i]!);
      const secondId = _nodeCounter - 1;
      const resultId = _nodeCounter++;

      const isSmooth = op.startsWith('smooth_');
      const k = (node.smoothness || 0.1).toFixed(4);

      if (isSmooth) {
        const fnName =
          op === 'smooth_union'
            ? 'opSmoothUnion'
            : op === 'smooth_intersect'
              ? 'opSmoothIntersect'
              : op === 'smooth_subtract'
                ? 'opSmoothSubtract'
                : 'opSmoothDifference';
        lines += `  float d${resultId} = ${fnName}(d${accId}, d${secondId}, ${k});\n`;
      } else {
        const fnName =
          op === 'union'
            ? 'opUnion'
            : op === 'intersect'
              ? 'opIntersect'
              : op === 'subtract'
                ? 'opSubtract'
                : 'opDifference';
        lines += `  float d${resultId} = ${fnName}(d${accId}, d${secondId});\n`;
      }
      accId = resultId;
    }

    return lines;
  }

  return `  float d${id} = 1e10;\n`;
}

/**
 * Compile an SDFNode tree into a complete GLSL ray marching shader pair.
 */
export function compileSDFScene(
  root: SDFNode,
  maxSteps = 128,
  maxDist = 100.0,
  epsilon = 0.001
): SDFCompileResult {
  _nodeCounter = 0;

  const usedPrimitives = new Set<SDFPrimitive>();
  const usedCSG = new Set<CSGOperation>();
  const usedDomain = new Set<DomainOperation>();

  collectPrimitives(root, usedPrimitives);
  collectCSG(root, usedCSG);
  collectDomain(root, usedDomain);

  const fnLib: string[] = [];
  for (const prim of usedPrimitives) {
    if (SDF_PRIMITIVES[prim]) fnLib.push(SDF_PRIMITIVES[prim]);
  }
  for (const op of usedCSG) {
    if (CSG_OPERATIONS[op]) fnLib.push(CSG_OPERATIONS[op]);
  }
  for (const op of usedDomain) {
    if (DOMAIN_OPERATIONS[op]) fnLib.push(DOMAIN_OPERATIONS[op]);
  }

  const sceneBody = compileNode(root);
  const lastD = `d${_nodeCounter - 1}`;

  const fragmentShader = /* glsl */ `
#extension GL_OES_standard_derivatives : enable
precision highp float;

uniform float uTime;
uniform vec2 uResolution;
uniform vec3 uCameraPosition;
uniform mat4 uCameraMatrix;

${fnLib.join('\n\n')}

float scene(vec3 p) {
${sceneBody}
  return ${lastD};
}

vec3 calcNormal(vec3 p) {
  // Analytic normal via screen-space derivatives (faster WebGPU scaling)
  return normalize(cross(dFdx(p), dFdy(p)));
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution[1];

  vec3 ro = uCameraPosition;
  vec3 rd = normalize(vec3(uv, 1.0));
  rd = (uCameraMatrix * vec4(rd, 0.0)).xyz;

  float t = 0.0;
  float d;
  for (int i = 0; i < ${maxSteps}; i++) {
    d = scene(ro + rd * t);
    if (d < ${epsilon.toFixed(6)} || t > ${maxDist.toFixed(1)}) break;
    t += d;
  }

  if (t < ${maxDist.toFixed(1)}) {
    vec3 p = ro + rd * t;
    vec3 n = calcNormal(p);
    // Invert normal if facing away from camera due to screen space derivative winding
    if (dot(rd, n) > 0.0) n = -n;
    
    vec3 lightDir = normalize(vec3(0.5, 1.0, 0.3));
    float diff = max(dot(n, lightDir), 0.0);
    float amb = 0.15;
    vec3 color = vec3(0.7, 0.75, 0.8) * (diff + amb);
    gl_FragColor = vec4(color, 1.0);
  } else {
    gl_FragColor = vec4(0.05, 0.05, 0.1, 1.0);
  }
}
`;

  const vertexShader = /* glsl */ `
void main() {
  gl_Position = vec4(position, 1.0);
}
`;

  return {
    fragmentShader,
    vertexShader,
    uniformDeclarations: ['uTime', 'uResolution', 'uCameraPosition', 'uCameraMatrix'],
    primitiveCount: usedPrimitives.size,
    maxMarchSteps: maxSteps,
  };
}

/**
 * Create a default SDF scene for testing.
 */
export function createDefaultSDFScene(): SDFNode {
  return {
    type: 'csg',
    operation: 'smooth_union',
    smoothness: 0.3,
    children: [
      {
        type: 'primitive',
        primitive: 'sphere',
        params: { radius: 1.0 },
      },
      {
        type: 'primitive',
        primitive: 'box',
        params: { width: 0.7, height: 0.7, depth: 0.7 },
        translate: [1.2, 0, 0],
      },
      {
        type: 'primitive',
        primitive: 'torus',
        params: { majorRadius: 0.8, minorRadius: 0.2 },
        translate: [0, 1.5, 0],
        rotate: [Math.PI / 4, 0, 0],
      },
    ],
  };
}
