/** @gcode_slicer Trait — Volumetric extraction to GCode for 3D printing. @trait gcode_slicer */
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

/**
 * Semantic @GCodeSlicer parameters (Studio / HS+ binding surface).
 * Maps volumetric → print planning: nozzle/bed thermal policy, adhesion stack, and XY traversal.
 */
export interface GCodeSemanticParams {
  /** Primary extruder / nozzle temperature (°C) — `M104 S` */
  nozzleTempC: number;
  /** Heated bed setpoint (°C) — `M140` / `M190` */
  bedTempC: number;
  /** Extra °C on the nozzle for the first adhesion layers */
  firstLayerNozzleBoostC: number;
  /** Count of slower / hotter adhesion layers above the bed */
  adhesionLayerCount: number;
  /** Layer height used for the adhesion raft stack (often ≥ normal layer height) */
  adhesionLayerHeightMm: number;
  /** Brim / raft outline inset from mesh XY bounds (mm) */
  adhesionBrimMm: number;
}

export interface GCodeSlicerConfig extends GCodeSemanticParams {
  layerHeightMm: number;
  infillPercent: number;
  printSpeedMmS: number;
  enableSupports: boolean;
  supportOverhangAngleDeg: number;
  supportInsetMm: number;
  /** Optional default output path for generated .gcode files. */
  outputGCodePath?: string;
}

export interface MeshSliceInput {
  /** Mesh vertices in millimeters (world or object space). */
  verticesMm: [number, number, number][];
  /** Optional triangle corner indices (multiple of 3). */
  indices?: number[];
}

export interface AdhesionLayerPlanEntry {
  layerIndex: number;
  zMm: number;
  nozzleTempC: number;
}

export interface TraversalLayerPlan {
  layerZMm: number;
  /** Tool-center polyline in mm (XY with implicit Z = layerZMm). */
  pointsMm: [number, number, number][];
  role?: 'adhesion' | 'model' | 'support';
  contourIndex?: number;
}

export interface PlanarSliceContour {
  layerZMm: number;
  pointsMm: [number, number, number][];
  closed: boolean;
}

export interface GCodeSlicerState {
  isSlicing: boolean;
  progressPercent: number;
  estimatedPrintTimeMs: number;
  outputGCodePath?: string;
  /** Last bound mesh + derived semantic plans */
  mesh?: MeshSliceInput;
  adhesionPlan?: AdhesionLayerPlanEntry[];
  traversal?: TraversalLayerPlan[];
  /** Short G-code preamble reflecting current semantic params */
  gcodePreamble?: string;
}

type GCodeWriteFile = (path: string, contents: string) => Promise<void> | void;

interface GCodeFileSystemCapability {
  writeFile?: GCodeWriteFile;
}

interface GCodeHostCapabilityContext {
  fileSystem?: GCodeFileSystemCapability;
  hostCapabilities?: {
    fileSystem?: GCodeFileSystemCapability;
  };
  outputGCodePath?: unknown;
  gcodeOutputPath?: unknown;
  writeFile?: unknown;
}

const defaultConfig: GCodeSlicerConfig = {
  layerHeightMm: 0.2,
  infillPercent: 20,
  nozzleTempC: 210,
  bedTempC: 60,
  firstLayerNozzleBoostC: 10,
  adhesionLayerCount: 3,
  adhesionLayerHeightMm: 0.25,
  adhesionBrimMm: 2,
  printSpeedMmS: 50,
  enableSupports: true,
  supportOverhangAngleDeg: 45,
  supportInsetMm: 1.2,
};

function bbox2D(vertices: [number, number, number][]): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
} {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of vertices) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  if (!Number.isFinite(minX)) {
    return { minX: 0, maxX: 10, minY: 0, maxY: 10 };
  }
  return { minX, maxX, minY, maxY };
}

interface BBox2D {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

interface BBox3D extends BBox2D {
  minZ: number;
  maxZ: number;
}

type Point3 = [number, number, number];
type Segment = [Point3, Point3];
type Triangle = [Point3, Point3, Point3];

function bbox3D(vertices: [number, number, number][]): BBox3D {
  const xy = bbox2D(vertices);
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [, , z] of vertices) {
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  if (!Number.isFinite(minZ)) return { ...xy, minZ: 0, maxZ: 0 };
  return { ...xy, minZ, maxZ };
}

function bboxFromPoints(points: [number, number, number][]): BBox2D {
  return bbox2D(points);
}

function rectPointsFromBox(box: BBox2D, z: number, inset = 0): [number, number, number][] {
  const minX = box.minX + inset;
  const maxX = box.maxX - inset;
  const minY = box.minY + inset;
  const maxY = box.maxY - inset;
  if (maxX <= minX || maxY <= minY) {
    return [
      [box.minX, box.minY, z],
      [box.maxX, box.minY, z],
      [box.maxX, box.maxY, z],
      [box.minX, box.maxY, z],
      [box.minX, box.minY, z],
    ];
  }
  return [
    [minX, minY, z],
    [maxX, minY, z],
    [maxX, maxY, z],
    [minX, maxY, z],
    [minX, minY, z],
  ];
}

function indexedTriangles(mesh: MeshSliceInput): Triangle[] {
  const triangles: Triangle[] = [];
  if (mesh.indices?.length) {
    for (let i = 0; i + 2 < mesh.indices.length; i += 3) {
      const a = mesh.verticesMm[mesh.indices[i]!];
      const b = mesh.verticesMm[mesh.indices[i + 1]!];
      const c = mesh.verticesMm[mesh.indices[i + 2]!];
      if (a && b && c) triangles.push([a, b, c]);
    }
    return triangles;
  }
  for (let i = 0; i + 2 < mesh.verticesMm.length; i += 3) {
    triangles.push([mesh.verticesMm[i]!, mesh.verticesMm[i + 1]!, mesh.verticesMm[i + 2]!]);
  }
  return triangles;
}

function pointKey(point: [number, number, number]): string {
  return `${point[0].toFixed(3)},${point[1].toFixed(3)},${point[2].toFixed(3)}`;
}

function uniquePoints(points: [number, number, number][]): [number, number, number][] {
  const out: [number, number, number][] = [];
  const seen = new Set<string>();
  for (const point of points) {
    const key = pointKey(point);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(point);
    }
  }
  return out;
}

function intersectTriangleAtZ(
  triangle: Triangle,
  z: number
): Segment | null {
  const points: [number, number, number][] = [];
  for (const [a, b] of [
    [triangle[0], triangle[1]],
    [triangle[1], triangle[2]],
    [triangle[2], triangle[0]],
  ] as Array<[[number, number, number], [number, number, number]]>) {
    const dz = b[2] - a[2];
    if (Math.abs(dz) < 1e-9) continue;
    const t = (z - a[2]) / dz;
    if (t < -1e-9 || t > 1 + 1e-9) continue;
    points.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, z]);
  }
  const unique = uniquePoints(points);
  return unique.length >= 2 ? [unique[0]!, unique[1]!] : null;
}

function chainSegmentsToContours(segments: Segment[], z: number): PlanarSliceContour[] {
  const unused = [...segments];
  const contours: PlanarSliceContour[] = [];
  while (unused.length > 0) {
    const seed = unused.shift()!;
    const points: [number, number, number][] = [seed[0], seed[1]];
    let grew = true;
    while (grew) {
      grew = false;
      for (let i = unused.length - 1; i >= 0; i -= 1) {
        const [a, b] = unused[i]!;
        const firstKey = pointKey(points[0]!);
        const lastKey = pointKey(points[points.length - 1]!);
        if (pointKey(a) === lastKey) {
          points.push(b);
        } else if (pointKey(b) === lastKey) {
          points.push(a);
        } else if (pointKey(a) === firstKey) {
          points.unshift(b);
        } else if (pointKey(b) === firstKey) {
          points.unshift(a);
        } else {
          continue;
        }
        unused.splice(i, 1);
        grew = true;
      }
    }
    const closed = points.length > 2 && pointKey(points[0]!) === pointKey(points[points.length - 1]!);
    contours.push({ layerZMm: z, pointsMm: closed ? points : [...points, points[0]!], closed });
  }
  return contours.filter((contour) => contour.pointsMm.length >= 3);
}

/** Bed adhesion layer Z offsets and per-layer nozzle targets. */
export function buildAdhesionLayerPlan(c: GCodeSlicerConfig): AdhesionLayerPlanEntry[] {
  const out: AdhesionLayerPlanEntry[] = [];
  let z = 0;
  for (let i = 0; i < c.adhesionLayerCount; i++) {
    const temp =
      c.nozzleTempC +
      (i === 0 ? c.firstLayerNozzleBoostC : Math.max(0, c.firstLayerNozzleBoostC - i * 3));
    out.push({ layerIndex: i, zMm: z + c.adhesionLayerHeightMm, nozzleTempC: Math.round(temp) });
    z += c.adhesionLayerHeightMm;
  }
  return out;
}

/**
 * Approximate traversal polyline for a layer: inset rectangle perimeter in XY at fixed Z.
 * Sufficient as a structural placeholder until full slice-to-path is wired.
 */
export function buildInsetPerimeterTraversal(
  verticesMm: [number, number, number][],
  layerZMm: number,
  insetMm: number,
  segmentsPerEdge = 8
): [number, number, number][] {
  const { minX, maxX, minY, maxY } = bbox2D(verticesMm);
  const ix0 = minX + insetMm;
  const ix1 = maxX - insetMm;
  const iy0 = minY + insetMm;
  const iy1 = maxY - insetMm;
  if (ix1 <= ix0 || iy1 <= iy0) {
    return [
      [minX, minY, layerZMm],
      [maxX, minY, layerZMm],
      [maxX, maxY, layerZMm],
      [minX, maxY, layerZMm],
      [minX, minY, layerZMm],
    ];
  }
  const edge = (x0: number, y0: number, x1: number, y1: number): [number, number, number][] => {
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= segmentsPerEdge; i++) {
      const t = i / segmentsPerEdge;
      pts.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, layerZMm]);
    }
    return pts;
  };
  return [
    ...edge(ix0, iy0, ix1, iy0),
    ...edge(ix1, iy0, ix1, iy1).slice(1),
    ...edge(ix1, iy1, ix0, iy1).slice(1),
    ...edge(ix0, iy1, ix0, iy0).slice(1),
  ];
}

/** G-code header: thermal + units + adhesion-aware first moves (semantic binding). */
export function buildSemanticGCodePreamble(c: GCodeSlicerConfig, mesh?: MeshSliceInput): string {
  const lines: string[] = [
    '; @GCodeSlicer — semantic preamble (HoloScript)',
    'G21 ; millimeters',
    'G90 ; absolute positioning',
    `M140 S${Math.round(c.bedTempC)} ; bed target`,
    `M104 S${Math.round(c.nozzleTempC)} ; nozzle standby → target`,
    `M190 S${Math.round(c.bedTempC)} ; wait for bed`,
    `M109 S${Math.round(c.nozzleTempC + c.firstLayerNozzleBoostC)} ; first layer nozzle (boosted)`,
  ];
  const adhesion = buildAdhesionLayerPlan(c);
  for (const layer of adhesion) {
    lines.push(
      `; adhesion layer ${layer.layerIndex} @ Z=${layer.zMm.toFixed(3)}mm T=${layer.nozzleTempC}°C`,
      `G0 Z${layer.zMm.toFixed(3)} F6000`
    );
  }
  if (mesh?.verticesMm?.length) {
    const bb = bbox2D(mesh.verticesMm);
    lines.push(
      `; mesh XY bounds X[${bb.minX.toFixed(2)},${bb.maxX.toFixed(2)}] Y[${bb.minY.toFixed(2)},${bb.maxY.toFixed(2)}]`,
      `; vertices=${mesh.verticesMm.length}`
    );
  }
  lines.push(
    `; layerHeight=${c.layerHeightMm} infill=${c.infillPercent}% F=${c.printSpeedMmS}mm/s`
  );
  return lines.join('\n');
}

export function buildPlanarSliceContoursFromMesh(
  mesh: MeshSliceInput,
  layerZMm: number
): PlanarSliceContour[] {
  const segments: Segment[] = [];
  for (const triangle of indexedTriangles(mesh)) {
    const segment = intersectTriangleAtZ(triangle, layerZMm);
    if (segment) segments.push(segment);
  }
  return chainSegmentsToContours(segments, layerZMm);
}

function overhangAllowanceMm(c: GCodeSlicerConfig): number {
  const radians = (Math.max(1, Math.min(89, c.supportOverhangAngleDeg)) * Math.PI) / 180;
  return Math.max(c.layerHeightMm, c.layerHeightMm / Math.tan(radians));
}

function isBoxSupported(box: BBox2D, lowerBoxes: BBox2D[], allowanceMm: number): boolean {
  return lowerBoxes.some(
    (lower) =>
      box.minX >= lower.minX - allowanceMm &&
      box.maxX <= lower.maxX + allowanceMm &&
      box.minY >= lower.minY - allowanceMm &&
      box.maxY <= lower.maxY + allowanceMm
  );
}

export function buildTraversalStackFromMesh(
  c: GCodeSlicerConfig,
  mesh: MeshSliceInput
): TraversalLayerPlan[] {
  if (!mesh.verticesMm.length) return [];
  const plans: TraversalLayerPlan[] = [];
  const meshBounds = bbox3D(mesh.verticesMm);
  const adhesion = buildAdhesionLayerPlan(c);
  for (const layer of adhesion) {
    plans.push({
      layerZMm: layer.zMm,
      pointsMm: buildInsetPerimeterTraversal(mesh.verticesMm, layer.zMm, c.adhesionBrimMm),
      role: 'adhesion',
    });
  }
  const triangleCount = indexedTriangles(mesh).length;
  const firstModelZ = Math.max(
    meshBounds.minZ + c.layerHeightMm,
    (adhesion.length ? adhesion[adhesion.length - 1]!.zMm : 0) + c.layerHeightMm
  );
  const topZ = Math.max(firstModelZ, meshBounds.maxZ);
  const allowance = overhangAllowanceMm(c);
  let previousModelBoxes: BBox2D[] = [];
  let contourIndex = 0;

  for (let z = firstModelZ; z <= topZ + 1e-6; z += c.layerHeightMm) {
    const contours =
      triangleCount > 0
        ? buildPlanarSliceContoursFromMesh(mesh, z)
        : [
            {
              layerZMm: z,
              pointsMm: buildInsetPerimeterTraversal(
                mesh.verticesMm,
                z,
                c.adhesionBrimMm + c.layerHeightMm * 2
              ),
              closed: true,
            },
          ];
    const modelContours = contours.length
      ? contours
      : [
          {
            layerZMm: z,
            pointsMm: buildInsetPerimeterTraversal(
              mesh.verticesMm,
              z,
              c.adhesionBrimMm + c.layerHeightMm * 2
            ),
            closed: true,
          },
        ];
    const currentBoxes = modelContours.map((contour) => bboxFromPoints(contour.pointsMm));

    if (c.enableSupports && previousModelBoxes.length > 0) {
      currentBoxes.forEach((box, index) => {
        if (!isBoxSupported(box, previousModelBoxes, allowance)) {
          plans.push({
            layerZMm: z,
            pointsMm: rectPointsFromBox(box, z, c.supportInsetMm),
            role: 'support',
            contourIndex: index,
          });
        }
      });
    }

    modelContours.forEach((contour) => {
      plans.push({
        layerZMm: z,
        pointsMm: contour.pointsMm,
        role: 'model',
        contourIndex,
      });
      contourIndex += 1;
    });
    previousModelBoxes = currentBoxes;
  }
  return plans;
}

function formatMm(value: number): string {
  return Number.isFinite(value) ? value.toFixed(3) : '0.000';
}

function segmentLengthMm(a: [number, number, number], b: [number, number, number]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function pickString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  return undefined;
}

function outputPathFromEvent(e: TraitEvent, c: GCodeSlicerConfig, ctx: TraitContext): string {
  const payload = e.payload ?? {};
  const host = ctx as TraitContext & GCodeHostCapabilityContext;
  const candidate =
    pickString(
      payload.outputGCodePath,
      payload.outputPath,
      payload.filePath,
      payload.path,
      c.outputGCodePath,
      host.outputGCodePath,
      host.gcodeOutputPath
    ) ?? join(tmpdir(), 'holoscript_output.gcode');
  return resolve(candidate);
}

export function serializeTraversalStackToGCode(
  c: GCodeSlicerConfig,
  traversal: TraversalLayerPlan[],
  preamble: string
): string {
  const feedRate = Math.max(1, Math.round(c.printSpeedMmS * 60));
  const travelFeedRate = Math.max(feedRate, 6000);
  const extrusionPerMm = Math.max(0.001, c.layerHeightMm * 0.045);
  const lines: string[] = [
    preamble.trimEnd(),
    '; traversal generated from HoloScript semantic layer plans',
    'M82 ; absolute extrusion',
    'G92 E0 ; reset extrusion distance',
  ];
  let extrusionMm = 0;

  for (let layerIndex = 0; layerIndex < traversal.length; layerIndex += 1) {
    const layer = traversal[layerIndex]!;
    const points = layer.pointsMm;
    if (points.length === 0) continue;
    const first = points[0]!;
    lines.push(
      `; layer ${layerIndex} Z=${formatMm(layer.layerZMm)} points=${points.length}`,
      `G0 Z${formatMm(layer.layerZMm)} F${travelFeedRate}`,
      `G0 X${formatMm(first[0])} Y${formatMm(first[1])} F${travelFeedRate}`
    );
    for (let i = 1; i < points.length; i += 1) {
      const prev = points[i - 1]!;
      const point = points[i]!;
      extrusionMm += segmentLengthMm(prev, point) * extrusionPerMm;
      lines.push(
        `G1 X${formatMm(point[0])} Y${formatMm(point[1])} Z${formatMm(point[2])} E${formatMm(
          extrusionMm
        )} F${feedRate}`
      );
    }
  }

  lines.push(
    '; end sequence',
    'M104 S0 ; turn off nozzle',
    'M140 S0 ; turn off bed',
    'G91 ; relative positioning',
    'G1 E-1 F1800 ; retract',
    'G90 ; absolute positioning',
    'G28 X Y ; home XY',
    'M84 ; disable motors'
  );
  return `${lines.join('\n')}\n`;
}

function getContextWriteFile(ctx?: TraitContext): GCodeWriteFile | undefined {
  const host = ctx as (TraitContext & GCodeHostCapabilityContext) | undefined;
  if (typeof host?.hostCapabilities?.fileSystem?.writeFile === 'function') {
    return host.hostCapabilities.fileSystem.writeFile;
  }
  if (typeof host?.fileSystem?.writeFile === 'function') {
    return host.fileSystem.writeFile;
  }
  if (typeof host?.writeFile === 'function') {
    return host.writeFile as GCodeWriteFile;
  }
  return undefined;
}

export async function writeGCodeFile(
  outputPath: string,
  contents: string,
  ctx?: TraitContext
): Promise<void> {
  const contextWriteFile = getContextWriteFile(ctx);
  if (contextWriteFile) {
    await contextWriteFile(outputPath, contents);
    return;
  }
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, contents, 'utf8');
}

function byteLength(value: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(value).byteLength;
  }
  return value.length;
}

export function createGCodeSlicerHandler(): TraitHandler<GCodeSlicerConfig> {
  return {
    name: 'gcode_slicer',
    defaultConfig,
    onAttach(n: HSPlusNode, c: GCodeSlicerConfig, ctx: TraitContext) {
      const mesh = (n.__gcodeMesh as MeshSliceInput | undefined) ?? { verticesMm: [] };
      const adhesionPlan = buildAdhesionLayerPlan(c);
      const traversal = mesh.verticesMm.length ? buildTraversalStackFromMesh(c, mesh) : [];
      n.__slicerState = {
        isSlicing: false,
        progressPercent: 0,
        estimatedPrintTimeMs: 0,
        mesh,
        adhesionPlan,
        traversal,
        gcodePreamble: buildSemanticGCodePreamble(c, mesh.verticesMm.length ? mesh : undefined),
      };
      ctx.emit?.('gcode_slicer:ready', {
        semantic: { adhesionPlan, traversalLayers: traversal.length },
      });
    },
    onDetach(n: HSPlusNode, _c: GCodeSlicerConfig, ctx: TraitContext) {
      delete n.__slicerState;
      delete n.__gcodeMesh;
      ctx.emit?.('gcode_slicer:removed');
    },
    onUpdate(n: HSPlusNode, c: GCodeSlicerConfig, ctx: TraitContext) {
      const s = n.__slicerState as GCodeSlicerState | undefined;
      if (!s) return;
      const mesh = s.mesh ?? { verticesMm: [] };
      s.adhesionPlan = buildAdhesionLayerPlan(c);
      s.traversal = mesh.verticesMm.length ? buildTraversalStackFromMesh(c, mesh) : [];
      s.gcodePreamble = buildSemanticGCodePreamble(c, mesh.verticesMm.length ? mesh : undefined);
      ctx.emit?.('gcode_slicer:semantic_updated', {
        adhesionPlan: s.adhesionPlan,
        traversalLayers: s.traversal?.length ?? 0,
      });
    },
    onEvent(n: HSPlusNode, c: GCodeSlicerConfig, ctx: TraitContext, e: TraitEvent) {
      const s = n.__slicerState as GCodeSlicerState | undefined;
      if (!s) return;

      if (e.type === 'gcode_slicer:bind_mesh' && e.payload?.verticesMm) {
        const verts = e.payload.verticesMm as [number, number, number][];
        const indices = e.payload.indices as number[] | undefined;
        const mesh: MeshSliceInput = { verticesMm: verts, indices };
        n.__gcodeMesh = mesh;
        s.mesh = mesh;
        s.adhesionPlan = buildAdhesionLayerPlan(c);
        s.traversal = buildTraversalStackFromMesh(c, mesh);
        s.gcodePreamble = buildSemanticGCodePreamble(c, mesh);
        ctx.emit?.('gcode_slicer:mesh_bound', {
          vertexCount: verts.length,
          layers: s.traversal?.length ?? 0,
        });
      }

      if (e.type === 'gcode_slicer:slice' && !s.isSlicing) {
        s.isSlicing = true;
        s.progressPercent = 0;
        ctx.emit?.('gcode_slicer:started');

        const meshVol = s.mesh?.verticesMm.length
          ? bbox2D(s.mesh.verticesMm)
          : { minX: 0, maxX: 50, minY: 0, maxY: 50 };
        const xyArea =
          Math.max(1, meshVol.maxX - meshVol.minX) * Math.max(1, meshVol.maxY - meshVol.minY);
        const volumeEstimate =
          xyArea * (c.adhesionLayerCount * c.adhesionLayerHeightMm + c.layerHeightMm * 12);
        s.estimatedPrintTimeMs =
          (volumeEstimate / Math.max(0.01, c.printSpeedMmS * c.layerHeightMm)) * 1000;

        const outputPath = outputPathFromEvent(e, c, ctx);
        const preamble = s.gcodePreamble ?? buildSemanticGCodePreamble(c, s.mesh);
        const traversal =
          s.traversal ?? (s.mesh?.verticesMm.length ? buildTraversalStackFromMesh(c, s.mesh) : []);
        const gcode = serializeTraversalStackToGCode(c, traversal, preamble);

        s.progressPercent = 75;
        void writeGCodeFile(outputPath, gcode, ctx)
          .then(() => {
            s.isSlicing = false;
            s.progressPercent = 100;
            s.outputGCodePath = outputPath;
            ctx.emit?.('gcode_slicer:completed', {
              path: s.outputGCodePath,
              lineCount: gcode.trimEnd().split('\n').length,
              gcodeBytes: byteLength(gcode),
              estimatedTimeMs: s.estimatedPrintTimeMs,
              preamble,
              adhesionPlan: s.adhesionPlan,
              traversal,
            });
          })
          .catch((err: unknown) => {
            s.isSlicing = false;
            s.progressPercent = 0;
            const message = err instanceof Error ? err.message : String(err);
            ctx.emit?.('gcode_slicer:failed', { path: outputPath, error: message });
          });
      }
    },
  };
}
