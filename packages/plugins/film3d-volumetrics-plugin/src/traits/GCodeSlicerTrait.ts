/** @gcode_slicer Trait — Volumetric extraction to GCode for 3D printing. @trait gcode_slicer */
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

const defaultConfig: GCodeSlicerConfig = {
  layerHeightMm: 0.2,
  infillPercent: 20,
  nozzleTempC: 210,
  bedTempC: 60,
  firstLayerNozzleBoostC: 10,
  adhesionLayerCount: 3,
  adhesionLayerHeightMm: 0.25,
  adhesionBrimMm: 2,
  printSpeedMmS: 50
};

function bbox2D(vertices: [number, number, number][]): { minX: number; maxX: number; minY: number; maxY: number } {
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

/** Bed adhesion layer Z offsets and per-layer nozzle targets. */
export function buildAdhesionLayerPlan(c: GCodeSlicerConfig): AdhesionLayerPlanEntry[] {
  const out: AdhesionLayerPlanEntry[] = [];
  let z = 0;
  for (let i = 0; i < c.adhesionLayerCount; i++) {
    const temp = c.nozzleTempC + (i === 0 ? c.firstLayerNozzleBoostC : Math.max(0, c.firstLayerNozzleBoostC - i * 3));
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
      [minX, minY, layerZMm]
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
    ...edge(ix0, iy1, ix0, iy0).slice(1)
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
    `M109 S${Math.round(c.nozzleTempC + c.firstLayerNozzleBoostC)} ; first layer nozzle (boosted)`
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
  lines.push(`; layerHeight=${c.layerHeightMm} infill=${c.infillPercent}% F=${c.printSpeedMmS}mm/s`);
  return lines.join('\n');
}

export function buildTraversalStackFromMesh(c: GCodeSlicerConfig, mesh: MeshSliceInput): TraversalLayerPlan[] {
  if (!mesh.verticesMm.length) return [];
  const plans: TraversalLayerPlan[] = [];
  const adhesion = buildAdhesionLayerPlan(c);
  for (const layer of adhesion) {
    plans.push({
      layerZMm: layer.zMm,
      pointsMm: buildInsetPerimeterTraversal(mesh.verticesMm, layer.zMm, c.adhesionBrimMm)
    });
  }
  let z = adhesion.length ? adhesion[adhesion.length - 1]!.zMm : 0;
  const topZ = z + c.layerHeightMm * 4;
  while (z < topZ - 1e-6) {
    z += c.layerHeightMm;
    plans.push({
      layerZMm: z,
      pointsMm: buildInsetPerimeterTraversal(mesh.verticesMm, z, c.adhesionBrimMm + c.layerHeightMm * 2)
    });
  }
  return plans;
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
        gcodePreamble: buildSemanticGCodePreamble(c, mesh.verticesMm.length ? mesh : undefined)
      };
      ctx.emit?.('gcode_slicer:ready', { semantic: { adhesionPlan, traversalLayers: traversal.length } });
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
        traversalLayers: s.traversal?.length ?? 0
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
        ctx.emit?.('gcode_slicer:mesh_bound', { vertexCount: verts.length, layers: s.traversal?.length ?? 0 });
      }

      if (e.type === 'gcode_slicer:slice' && !s.isSlicing) {
        s.isSlicing = true;
        s.progressPercent = 0;
        ctx.emit?.('gcode_slicer:started');

        const meshVol = s.mesh?.verticesMm.length
          ? bbox2D(s.mesh.verticesMm)
          : { minX: 0, maxX: 50, minY: 0, maxY: 50 };
        const xyArea = Math.max(1, meshVol.maxX - meshVol.minX) * Math.max(1, meshVol.maxY - meshVol.minY);
        const volumeEstimate = xyArea * (c.adhesionLayerCount * c.adhesionLayerHeightMm + c.layerHeightMm * 12);
        s.estimatedPrintTimeMs = (volumeEstimate / Math.max(0.01, c.printSpeedMmS * c.layerHeightMm)) * 1000;

        setTimeout(() => {
          s.isSlicing = false;
          s.progressPercent = 100;
          s.outputGCodePath = '/tmp/holoscript_output.gcode';
          const preamble = s.gcodePreamble ?? buildSemanticGCodePreamble(c, s.mesh);
          ctx.emit?.('gcode_slicer:completed', {
            path: s.outputGCodePath,
            estimatedTimeMs: s.estimatedPrintTimeMs,
            preamble,
            adhesionPlan: s.adhesionPlan,
            traversal: s.traversal
          });
        }, 1500);
      }
    }
  };
}
