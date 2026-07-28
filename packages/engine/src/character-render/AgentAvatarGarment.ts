/**
 * AgentAvatarGarment — sovereign procedural clothing for native skinned characters.
 *
 * The first operative preset is `stormglass_hooded_tunic`: a faceless cowl, tapered
 * craftfolk tunic, articulated sleeves, and detachable family mantles authored through
 * `@clothing`. Geometry is pure data, carries UVs plus cloth-dynamic weights, is skinned to
 * the existing humanoid palette, and has an authored radial-detail channel so `@lod` can
 * produce genuinely different meshes without an external DCC.
 */

import { HUMANOID_BONE_NAMES } from '../character/HumanoidSkeleton';
import { computeBindWorld } from './AgentAvatarMesh';
import {
  getSovereignMantleCatalogEntry,
  type SovereignMantleGeometryProfile,
  type SovereignMantleStyle,
} from './AgentAvatarMantleCatalog';
import { getTranslation, type Vec3 } from './skin-math';

export type SovereignGarmentStyle = 'stormglass_hooded_tunic';
export type { SovereignMantleStyle } from './AgentAvatarMantleCatalog';

export interface GarmentMeshPart {
  positions: Float32Array<ArrayBuffer>;
  normals: Float32Array<ArrayBuffer>;
  tangents: Float32Array<ArrayBuffer>;
  /** Two floats/vertex. Garment and mantle surfaces are texture-addressable without a DCC. */
  uvs: Float32Array<ArrayBuffer>;
  indices: Uint32Array<ArrayBuffer>;
  jointIndices: Uint32Array<ArrayBuffer>;
  jointWeights: Float32Array<ArrayBuffer>;
  /** 0 = pinned to rest pose, 1 = fully simulated by the deterministic cloth solver. */
  clothWeights: Float32Array<ArrayBuffer>;
  vertexCount: number;
}

export interface AgentAvatarGarmentData {
  cloth: GarmentMeshPart;
  visor: GarmentMeshPart;
  mantle: GarmentMeshPart;
}

export interface AgentAvatarGarmentOptions {
  style: SovereignGarmentStyle;
  buildScale?: number;
  heightScale?: number;
  /** Authored radial tessellation. Clamped to 6..32; intended LOD values are 24/14/8. */
  radialSegments?: number;
  /** Optional public/story mantle. Omission is the detachable neutral-body state. */
  mantleStyle?: SovereignMantleStyle;
}

interface MeshAccum {
  positions: number[];
  normals: number[];
  tangents: number[];
  uvs: number[];
  indices: number[];
  jointIndices: number[];
  jointWeights: number[];
  clothWeights: number[];
}

interface LoftRing {
  y: number;
  rx: number;
  rz: number;
  bone: string;
  centerZ?: number;
  /** Per-ring cloth mobility. Interpolated only by topology; 0 pins, 1 moves freely. */
  clothWeight?: number;
}

const BONE_INDEX = new Map<string, number>(HUMANOID_BONE_NAMES.map((name, index) => [name, index]));
const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const add = (a: Vec3, b: Vec3): Vec3 => v(a.x + b.x, a.y + b.y, a.z + b.z);
const sub = (a: Vec3, b: Vec3): Vec3 => v(a.x - b.x, a.y - b.y, a.z - b.z);
const scale = (a: Vec3, amount: number): Vec3 => v(a.x * amount, a.y * amount, a.z * amount);
const cross = (a: Vec3, b: Vec3): Vec3 =>
  v(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
const normalize = (a: Vec3): Vec3 => {
  const length = Math.hypot(a.x, a.y, a.z) || 1;
  return v(a.x / length, a.y / length, a.z / length);
};

function accum(): MeshAccum {
  return {
    positions: [],
    normals: [],
    tangents: [],
    uvs: [],
    indices: [],
    jointIndices: [],
    jointWeights: [],
    clothWeights: [],
  };
}

function finish(source: MeshAccum, heightScale: number): GarmentMeshPart {
  const positions = new Float32Array(source.positions);
  if (heightScale !== 1) {
    for (let index = 0; index < positions.length; index += 1) {
      positions[index] *= heightScale;
    }
  }
  return {
    positions,
    normals: new Float32Array(source.normals),
    tangents: new Float32Array(source.tangents),
    uvs: new Float32Array(source.uvs),
    indices: new Uint32Array(source.indices),
    jointIndices: new Uint32Array(source.jointIndices),
    jointWeights: new Float32Array(source.jointWeights),
    clothWeights: new Float32Array(source.clothWeights),
    vertexCount: source.positions.length / 3,
  };
}

function pushLoft(target: MeshAccum, rings: LoftRing[], segments: number): void {
  const base = target.positions.length / 3;
  for (let ringIndex = 0; ringIndex < rings.length; ringIndex += 1) {
    const ring = rings[ringIndex];
    const jointIndex = BONE_INDEX.get(ring.bone) ?? 0;
    for (let segment = 0; segment < segments; segment += 1) {
      const angle = (segment / segments) * Math.PI * 2;
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      target.positions.push(cosine * ring.rx, ring.y, (ring.centerZ ?? 0) + sine * ring.rz);
      const normal = normalize(
        v(cosine / Math.max(ring.rx, 1e-4), 0, sine / Math.max(ring.rz, 1e-4))
      );
      target.normals.push(normal.x, normal.y, normal.z);
      target.tangents.push(-sine, 0, cosine, 0);
      target.uvs.push(segment / segments, ringIndex / Math.max(rings.length - 1, 1));
      target.jointIndices.push(jointIndex);
      target.jointWeights.push(1);
      target.clothWeights.push(ring.clothWeight ?? 0);
    }
  }

  for (let ring = 0; ring < rings.length - 1; ring += 1) {
    const lower = base + ring * segments;
    const upper = lower + segments;
    for (let segment = 0; segment < segments; segment += 1) {
      const next = (segment + 1) % segments;
      target.indices.push(
        lower + segment,
        upper + segment,
        upper + next,
        lower + segment,
        upper + next,
        lower + next
      );
    }
  }
}

function pushTube(
  target: MeshAccum,
  start: Vec3,
  end: Vec3,
  startRadius: number,
  endRadius: number,
  bone: string,
  segments: number,
  startClothWeight = 0,
  endClothWeight = 0
): void {
  const axis = normalize(sub(end, start));
  const helper = Math.abs(axis.y) > 0.92 ? v(1, 0, 0) : v(0, 1, 0);
  const right = normalize(cross(helper, axis));
  const up = normalize(cross(axis, right));
  const base = target.positions.length / 3;
  const jointIndex = BONE_INDEX.get(bone) ?? 0;

  const rows = [
    [start, startRadius, startClothWeight],
    [end, endRadius, endClothWeight],
  ] as Array<[Vec3, number, number]>;
  for (let row = 0; row < rows.length; row += 1) {
    const [center, radius, clothWeight] = rows[row];
    for (let segment = 0; segment < segments; segment += 1) {
      const angle = (segment / segments) * Math.PI * 2;
      const radial = add(scale(right, Math.cos(angle)), scale(up, Math.sin(angle)));
      const point = add(center, scale(radial, radius));
      target.positions.push(point.x, point.y, point.z);
      target.normals.push(radial.x, radial.y, radial.z);
      target.tangents.push(axis.x, axis.y, axis.z, 0);
      target.uvs.push(segment / segments, row);
      target.jointIndices.push(jointIndex);
      target.jointWeights.push(1);
      target.clothWeights.push(clothWeight);
    }
  }

  for (let segment = 0; segment < segments; segment += 1) {
    const next = (segment + 1) % segments;
    target.indices.push(
      base + segment,
      base + segments + segment,
      base + segments + next,
      base + segment,
      base + segments + next,
      base + next
    );
  }
}

function pushVisor(target: MeshAccum, segments: number, buildScale: number): void {
  const jointIndex = BONE_INDEX.get('head') ?? 0;
  const base = target.positions.length / 3;
  const center = v(0, 1.66, 0.19 * buildScale);
  const radiusX = 0.098 * buildScale;
  const radiusY = 0.125 * buildScale;
  target.positions.push(center.x, center.y, center.z);
  target.normals.push(0, 0, 1);
  target.tangents.push(1, 0, 0, 0);
  target.uvs.push(0.5, 0.5);
  target.jointIndices.push(jointIndex);
  target.jointWeights.push(1);
  target.clothWeights.push(0);

  for (let segment = 0; segment < segments; segment += 1) {
    const angle = (segment / segments) * Math.PI * 2;
    target.positions.push(
      center.x + Math.cos(angle) * radiusX,
      center.y + Math.sin(angle) * radiusY,
      center.z
    );
    target.normals.push(0, 0, 1);
    target.tangents.push(1, 0, 0, 0);
    target.uvs.push(0.5 + Math.cos(angle) * 0.5, 0.5 + Math.sin(angle) * 0.5);
    target.jointIndices.push(jointIndex);
    target.jointWeights.push(1);
    target.clothWeights.push(0);
  }
  for (let segment = 0; segment < segments; segment += 1) {
    const next = (segment + 1) % segments;
    target.indices.push(base, base + 1 + segment, base + 1 + next);
  }
}

/**
 * A shoulder-pinned, front-readable mantle panel. The repeating UV field carries the family
 * pattern; the lower rows are mobile while the shoulder seam stays pinned.
 */
function pushMantlePanel(
  target: MeshAccum,
  buildScale: number,
  segments: number,
  profile: Readonly<SovereignMantleGeometryProfile>
): void {
  const columns = Math.max(6, Math.min(16, Math.round(segments / 2)));
  const rows = 7;
  const base = target.positions.length / 3;
  const jointIndex = BONE_INDEX.get('spine2') ?? 0;
  for (let row = 0; row < rows; row += 1) {
    const v01 = row / (rows - 1);
    const clothWeight = Math.pow(v01, 1.35);
    for (let column = 0; column <= columns; column += 1) {
      const u01 = column / columns;
      const centerArc = Math.sin(u01 * Math.PI) ** 2;
      const edgeArc = Math.abs(u01 * 2 - 1) ** 1.6;
      const y =
        1.42 -
        v01 * profile.length -
        v01 * centerArc * profile.centerDrop -
        v01 * edgeArc * profile.edgeDrop +
        (1 - v01) * centerArc * profile.shoulderCenterRise +
        (u01 - 0.5) * v01 * profile.verticalSkew;
      const midContour = Math.sin(v01 * Math.PI);
      const halfWidth =
        (profile.shoulderHalfWidth * (1 - v01) + profile.hemHalfWidth * v01) *
        (1 + profile.midWidthFactor * midContour) *
        buildScale;
      const x = (u01 * 2 - 1) * halfWidth + profile.lateralSkew * v01 * buildScale;
      const z =
        (0.19 +
          profile.zCurve * Math.cos((u01 - 0.5) * Math.PI) +
          profile.zWave * Math.sin(u01 * Math.PI * 2) * v01) *
        buildScale;
      target.positions.push(x, y, z);
      target.normals.push(0, 0, 1);
      target.tangents.push(1, 0, 0, 0);
      target.uvs.push(u01, v01);
      target.jointIndices.push(jointIndex);
      target.jointWeights.push(1);
      target.clothWeights.push(clothWeight);
    }
  }
  const stride = columns + 1;
  for (let row = 0; row < rows - 1; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const a = base + row * stride + column;
      const b = a + stride;
      target.indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
}

/**
 * Build the authored Stormglass garment. Detail is topology, not a metadata-only LOD hint:
 * changing radialSegments changes vertex/index counts and the GPU-uploaded surface.
 */
export function buildAgentAvatarGarment(
  options: AgentAvatarGarmentOptions
): AgentAvatarGarmentData {
  const buildScale = options.buildScale ?? 1;
  const heightScale = options.heightScale ?? 1;
  const segments = Math.max(6, Math.min(32, Math.round(options.radialSegments ?? 24)));
  const cloth = accum();
  const visor = accum();
  const mantle = accum();

  // Tapered craftfolk tunic: broad grounded hem, narrow waist, protective shoulder cowl.
  pushLoft(
    cloth,
    [
      { y: 0.08, rx: 0.31 * buildScale, rz: 0.22 * buildScale, bone: 'hips', clothWeight: 1 },
      { y: 0.38, rx: 0.28 * buildScale, rz: 0.2 * buildScale, bone: 'hips', clothWeight: 0.82 },
      { y: 0.62, rx: 0.245 * buildScale, rz: 0.175 * buildScale, bone: 'hips', clothWeight: 0.62 },
      { y: 0.82, rx: 0.2 * buildScale, rz: 0.145 * buildScale, bone: 'spine', clothWeight: 0.42 },
      { y: 1.04, rx: 0.19 * buildScale, rz: 0.14 * buildScale, bone: 'spine1', clothWeight: 0.22 },
      { y: 1.24, rx: 0.225 * buildScale, rz: 0.15 * buildScale, bone: 'spine2', clothWeight: 0.08 },
      { y: 1.36, rx: 0.285 * buildScale, rz: 0.17 * buildScale, bone: 'spine2', clothWeight: 0 },
      { y: 1.43, rx: 0.325 * buildScale, rz: 0.18 * buildScale, bone: 'spine2', clothWeight: 0 },
    ],
    segments
  );

  // Closed faceless hood. The dark visor sits just forward of this shell.
  pushLoft(
    cloth,
    [
      { y: 1.38, rx: 0.215 * buildScale, rz: 0.17 * buildScale, bone: 'neck' },
      { y: 1.5, rx: 0.175 * buildScale, rz: 0.16 * buildScale, bone: 'head' },
      { y: 1.66, rx: 0.17 * buildScale, rz: 0.16 * buildScale, bone: 'head' },
      { y: 1.8, rx: 0.12 * buildScale, rz: 0.125 * buildScale, bone: 'head' },
      { y: 1.88, rx: 0.025 * buildScale, rz: 0.045 * buildScale, bone: 'head' },
    ],
    segments
  );

  // Sleeves follow the upper/forearm bones; hands remain visible as the shared body material.
  const bind = computeBindWorld();
  for (const side of ['left', 'right'] as const) {
    const upper = getTranslation(bind.get(`${side}_upper_arm`)!);
    const elbow = getTranslation(bind.get(`${side}_forearm`)!);
    const hand = getTranslation(bind.get(`${side}_hand`)!);
    pushTube(
      cloth,
      upper,
      elbow,
      0.11 * buildScale,
      0.068 * buildScale,
      `${side}_upper_arm`,
      segments,
      0,
      0.2
    );
    pushTube(
      cloth,
      elbow,
      hand,
      0.067 * buildScale,
      0.052 * buildScale,
      `${side}_forearm`,
      segments,
      0.2,
      0.62
    );
  }

  pushVisor(visor, segments, buildScale);
  if (options.mantleStyle) {
    pushMantlePanel(
      mantle,
      buildScale,
      segments,
      getSovereignMantleCatalogEntry(options.mantleStyle).geometry
    );
  }
  return {
    cloth: finish(cloth, heightScale),
    visor: finish(visor, heightScale),
    mantle: finish(mantle, heightScale),
  };
}
