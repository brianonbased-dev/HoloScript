/**
 * 2D Structural Frame Solver — Direct Stiffness Method (DSM)
 *
 * Solves planar frame structures using the Euler-Bernoulli beam element
 * with axial, shear, and bending DOF (3 DOF per node: ux, uy, θz).
 *
 * Capabilities:
 *  - Arbitrary geometry (inclined members via coordinate transformation)
 *  - Concentrated nodal loads (Fx, Fy, Mz)
 *  - Uniform distributed loads (UDL) converted to equivalent nodal forces
 *  - Pinned, roller, and fixed supports (combination of DOF restraints)
 *  - Internal force recovery (axial N, shear V, moment M at member ends)
 *  - Utilisation check against AISC/Eurocode compact-section limit
 *  - CAEL-ready receipt builder
 *
 * Reference: McGuire, Gallagher, Ziemian, "Matrix Structural Analysis", 2nd ed.
 *
 * @version 1.0.0
 */

import {
  DOMAIN_SIMULATION_RECEIPT_SCHEMA,
  buildDomainSimulationReceipt,
  type DomainSimulationReceipt,
} from '@holoscript/core';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Node2D {
  id: string;
  /** X coordinate (m) */
  x: number;
  /** Y coordinate (m) */
  y: number;
}

export interface BeamElement {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  /** Elastic modulus (GPa) */
  elasticModulusGPa: number;
  /** Moment of inertia about strong axis (m⁴) */
  momentOfInertiaM4: number;
  /** Cross-sectional area (m²) */
  areaM2: number;
  /** Plastic section modulus (m³) — used for utilisation check */
  plasticModulusM3?: number;
  /** Yield strength (MPa) — used for utilisation check */
  yieldStrengthMPa?: number;
}

/** Nodal support: true = restrained, false/undefined = free */
export interface Support {
  nodeId: string;
  /** Restrain horizontal translation */
  ux?: boolean;
  /** Restrain vertical translation */
  uy?: boolean;
  /** Restrain rotation */
  theta?: boolean;
}

export interface NodalLoad {
  nodeId: string;
  /** Force in X direction (kN) */
  Fx?: number;
  /** Force in Y direction (kN) */
  Fy?: number;
  /** Moment about Z axis (kN·m, positive counter-clockwise) */
  Mz?: number;
}

export interface DistributedLoad {
  elementId: string;
  /** Uniform load intensity in local y direction (kN/m, positive pointing "down" in local frame) */
  w: number;
}

export interface Frame2DModel {
  id: string;
  nodes: Node2D[];
  elements: BeamElement[];
  supports: Support[];
  nodalLoads?: NodalLoad[];
  distributedLoads?: DistributedLoad[];
}

export interface NodeDisplacement {
  nodeId: string;
  /** Horizontal displacement (m) */
  ux: number;
  /** Vertical displacement (m) */
  uy: number;
  /** Rotation (rad) */
  theta: number;
}

export interface SupportReaction {
  nodeId: string;
  /** Horizontal reaction (kN) */
  Rx: number;
  /** Vertical reaction (kN) */
  Ry: number;
  /** Moment reaction (kN·m) */
  Mz: number;
}

export interface ElementForces {
  elementId: string;
  /** Axial force at start node (kN, positive = tension) */
  N_start: number;
  /** Shear force at start node (kN) */
  V_start: number;
  /** Bending moment at start node (kN·m) */
  M_start: number;
  /** Axial force at end node (kN, positive = tension) */
  N_end: number;
  /** Shear force at end node (kN) */
  V_end: number;
  /** Bending moment at end node (kN·m) */
  M_end: number;
  /** Utilisation ratio (0–1+, 1.0 = section capacity) */
  utilisationRatio: number;
}

export interface Frame2DValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface Frame2DResult {
  solverType: 'dsm-2d-frame';
  converged: boolean;
  nodeDisplacements: NodeDisplacement[];
  reactions: SupportReaction[];
  elementForces: ElementForces[];
  /** Maximum absolute nodal displacement (m) */
  maxDisplacementM: number;
  /** Maximum element utilisation ratio */
  maxUtilisationRatio: number;
  /** True if all utilisation ratios < 1.0 */
  structurallyAdequate: boolean;
}

export interface Frame2DReceiptOptions {
  runId?: string;
  createdAt?: string;
}

export interface Frame2DReceipt {
  schema: DomainSimulationReceipt['schema'];
  plugin: DomainSimulationReceipt['plugin'];
  pluginVersion: DomainSimulationReceipt['pluginVersion'];
  runId: DomainSimulationReceipt['runId'];
  createdAt: DomainSimulationReceipt['createdAt'];
  modelId: NonNullable<DomainSimulationReceipt['modelId']>;
  solverConfig: {
    solverType: 'dsm-2d-frame';
    nodeCount: number;
    elementCount: number;
    dofCount: number;
  };
  resultSummary: {
    converged: boolean;
    structurallyAdequate: boolean;
    maxDisplacementMm: number;
    maxUtilisationRatio: number;
  };
  cael: {
    version: 'cael.v1';
    event: 'civil_engineering.frame_analysis';
    solverType: 'civil-engineering.dsm-2d-frame';
  };
  acceptance: DomainSimulationReceipt['acceptance'];
  payloadHash: DomainSimulationReceipt['payloadHash'];
  hashAlgorithm: DomainSimulationReceipt['hashAlgorithm'];
}

// ─── Model validation ─────────────────────────────────────────────────────────

export function validateFrame2DModel(model: Frame2DModel): Frame2DValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  const nodeIds = new Set(model.nodes.map((n) => n.id));
  const elementIds = new Set(model.elements.map((e) => e.id));

  for (const node of model.nodes) {
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) {
      errors.push(`node ${node.id}: coordinates must be finite`);
    }
  }

  for (const elem of model.elements) {
    if (!nodeIds.has(elem.fromNodeId)) {
      errors.push(`element ${elem.id}: fromNodeId '${elem.fromNodeId}' not found`);
    }
    if (!nodeIds.has(elem.toNodeId)) {
      errors.push(`element ${elem.id}: toNodeId '${elem.toNodeId}' not found`);
    }
    if (elem.fromNodeId === elem.toNodeId) {
      errors.push(`element ${elem.id}: fromNodeId and toNodeId must differ`);
    }
    if (!Number.isFinite(elem.elasticModulusGPa) || elem.elasticModulusGPa <= 0) {
      errors.push(`element ${elem.id}: elasticModulusGPa must be positive`);
    }
    if (!Number.isFinite(elem.momentOfInertiaM4) || elem.momentOfInertiaM4 <= 0) {
      errors.push(`element ${elem.id}: momentOfInertiaM4 must be positive`);
    }
    if (!Number.isFinite(elem.areaM2) || elem.areaM2 <= 0) {
      errors.push(`element ${elem.id}: areaM2 must be positive`);
    }
  }

  for (const support of model.supports) {
    if (!nodeIds.has(support.nodeId)) {
      errors.push(`support at '${support.nodeId}': node not found`);
    }
    if (!support.ux && !support.uy && !support.theta) {
      warnings.push(`support at '${support.nodeId}': no DOF restrained — has no effect`);
    }
  }

  for (const load of model.nodalLoads ?? []) {
    if (!nodeIds.has(load.nodeId)) {
      errors.push(`nodal load at '${load.nodeId}': node not found`);
    }
  }

  for (const dl of model.distributedLoads ?? []) {
    if (!elementIds.has(dl.elementId)) {
      errors.push(`distributed load on '${dl.elementId}': element not found`);
    }
    if (!Number.isFinite(dl.w)) {
      errors.push(`distributed load on '${dl.elementId}': w must be finite`);
    }
  }

  // Minimum stability check: need enough supports to prevent rigid body motion
  const totalRestrainedDOF = model.supports.reduce(
    (sum, s) => sum + (s.ux ? 1 : 0) + (s.uy ? 1 : 0) + (s.theta ? 1 : 0),
    0,
  );
  if (totalRestrainedDOF < 3) {
    errors.push('insufficient supports: need at least 3 restrained DOF to prevent rigid body motion');
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ─── Matrix utilities ─────────────────────────────────────────────────────────

type Matrix = number[][];

function zeros(rows: number, cols: number): Matrix {
  return Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
}

function matMul(A: Matrix, B: Matrix): Matrix {
  const m = A.length;
  const n = B[0].length;
  const k = B.length;
  const C = zeros(m, n);
  for (let i = 0; i < m; i++)
    for (let j = 0; j < n; j++)
      for (let l = 0; l < k; l++)
        C[i][j] += A[i][l] * B[l][j];
  return C;
}

function transpose(A: Matrix): Matrix {
  const m = A.length;
  const n = A[0].length;
  const T = zeros(n, m);
  for (let i = 0; i < m; i++)
    for (let j = 0; j < n; j++)
      T[j][i] = A[i][j];
  return T;
}

/** Gauss elimination with partial pivoting — solves Ax = b in place */
function gaussSolve(A: Matrix, b: number[]): number[] {
  const n = b.length;
  const a = A.map((row) => [...row]);
  const rhs = [...b];

  for (let pivot = 0; pivot < n; pivot++) {
    // Partial pivot
    let bestRow = pivot;
    let bestAbs = Math.abs(a[pivot][pivot]);
    for (let row = pivot + 1; row < n; row++) {
      const v = Math.abs(a[row][pivot]);
      if (v > bestAbs) { bestAbs = v; bestRow = row; }
    }
    if (bestAbs < 1e-14) throw new Error('[frame2d] singular stiffness matrix — check boundary conditions');
    if (bestRow !== pivot) {
      [a[pivot], a[bestRow]] = [a[bestRow], a[pivot]];
      [rhs[pivot], rhs[bestRow]] = [rhs[bestRow], rhs[pivot]];
    }

    const pv = a[pivot][pivot];
    for (let col = pivot; col < n; col++) a[pivot][col] /= pv;
    rhs[pivot] /= pv;

    for (let row = 0; row < n; row++) {
      if (row === pivot) continue;
      const f = a[row][pivot];
      if (f === 0) continue;
      for (let col = pivot; col < n; col++) a[row][col] -= f * a[pivot][col];
      rhs[row] -= f * rhs[pivot];
    }
  }
  return rhs;
}

// ─── Element stiffness ────────────────────────────────────────────────────────

/**
 * 6×6 local element stiffness matrix for a 2D Euler-Bernoulli beam element.
 * DOF order: [u1, v1, θ1, u2, v2, θ2]
 *
 * @param E  Elastic modulus (kN/m²)
 * @param I  Moment of inertia (m⁴)
 * @param A  Cross-sectional area (m²)
 * @param L  Element length (m)
 */
function localStiffness(E: number, I: number, A: number, L: number): Matrix {
  const EA = E * A;
  const EI = E * I;
  const L2 = L * L;
  const L3 = L * L * L;

  return [
    [ EA/L,         0,          0,    -EA/L,         0,          0    ],
    [    0,  12*EI/L3,   6*EI/L2,        0, -12*EI/L3,   6*EI/L2   ],
    [    0,   6*EI/L2,    4*EI/L,        0,  -6*EI/L2,    2*EI/L   ],
    [-EA/L,         0,          0,     EA/L,         0,          0    ],
    [    0, -12*EI/L3,  -6*EI/L2,        0,  12*EI/L3,  -6*EI/L2   ],
    [    0,   6*EI/L2,    2*EI/L,        0,  -6*EI/L2,    4*EI/L   ],
  ];
}

/**
 * 6×6 transformation matrix T mapping local DOF to global DOF.
 * @param c  cos(α) where α = angle of element axis w.r.t. global X
 * @param s  sin(α)
 */
function transformMatrix(c: number, s: number): Matrix {
  return [
    [ c,  s,  0,  0,  0,  0 ],
    [-s,  c,  0,  0,  0,  0 ],
    [ 0,  0,  1,  0,  0,  0 ],
    [ 0,  0,  0,  c,  s,  0 ],
    [ 0,  0,  0, -s,  c,  0 ],
    [ 0,  0,  0,  0,  0,  1 ],
  ];
}

/** Global element stiffness: K_global = T^T * k_local * T */
function globalElementStiffness(elem: BeamElement, fromNode: Node2D, toNode: Node2D): Matrix {
  const dx = toNode.x - fromNode.x;
  const dy = toNode.y - fromNode.y;
  const L = Math.sqrt(dx * dx + dy * dy);
  if (L < 1e-10) throw new Error(`[frame2d] element ${elem.id} has zero length`);

  const c = dx / L;
  const s = dy / L;
  const E = elem.elasticModulusGPa * 1e6; // GPa → kN/m²
  const I = elem.momentOfInertiaM4;
  const A = elem.areaM2;

  const k_local = localStiffness(E, I, A, L);
  const T = transformMatrix(c, s);
  const Tt = transpose(T);
  return matMul(Tt, matMul(k_local, T));
}

// ─── Equivalent nodal forces for distributed loads ────────────────────────────

/**
 * Converts a UDL (w kN/m in local y) to equivalent global nodal forces.
 * Fixed-end forces for a fixed-fixed beam under UDL:
 *   Vy_A = Vy_B = wL/2  (in local y)
 *   Mz_A = +wL²/12, Mz_B = −wL²/12
 */
function equivalentNodalForces(
  dl: DistributedLoad,
  elem: BeamElement,
  fromNode: Node2D,
  toNode: Node2D,
): number[] /* 6-element global force vector */ {
  const dx = toNode.x - fromNode.x;
  const dy = toNode.y - fromNode.y;
  const L = Math.sqrt(dx * dx + dy * dy);
  const c = dx / L;
  const s = dy / L;
  const w = dl.w;

  // Fixed-end forces (local frame) for a fixed-fixed beam under downward UDL w:
  //   [0, wL/2, wL²/12, 0, wL/2, -wL²/12]  — these are the clamping REACTIONS.
  // The equivalent APPLIED nodal loads are the negatives (DSM sign convention):
  //   f_eq = −f_fef = [0, −wL/2, −wL²/12, 0, −wL/2, +wL²/12]
  const f_fef = [0, (w * L) / 2, (w * L * L) / 12, 0, (w * L) / 2, -(w * L * L) / 12];

  // Transform to global: f_eq_global = T^T * f_eq_local = −T^T * f_fef
  const T = transformMatrix(c, s);
  const Tt = transpose(T);
  return f_fef.map((_, i) => -Tt[i].reduce((sum, tij, j) => sum + tij * f_fef[j], 0));
}

// ─── Solver ───────────────────────────────────────────────────────────────────

export function solveFrame2D(model: Frame2DModel): Frame2DResult {
  const validation = validateFrame2DModel(model);
  if (!validation.valid) {
    throw new Error(`[frame2d] invalid model: ${validation.errors.join('; ')}`);
  }

  const nodeById = new Map(model.nodes.map((n) => [n.id, n]));
  const elemById = new Map(model.elements.map((e) => [e.id, e]));

  // DOF numbering: node i → [3i, 3i+1, 3i+2] = [ux, uy, θ]
  const nodeIndex = new Map(model.nodes.map((n, i) => [n.id, i]));
  const nDOF = model.nodes.length * 3;

  // Assemble global stiffness matrix
  const K = zeros(nDOF, nDOF);
  for (const elem of model.elements) {
    const fromNode = nodeById.get(elem.fromNodeId)!;
    const toNode   = nodeById.get(elem.toNodeId)!;
    const Ke = globalElementStiffness(elem, fromNode, toNode);
    const i0 = nodeIndex.get(elem.fromNodeId)! * 3;
    const i1 = nodeIndex.get(elem.toNodeId)! * 3;
    const dofs = [i0, i0+1, i0+2, i1, i1+1, i1+2];
    for (let r = 0; r < 6; r++)
      for (let c_ = 0; c_ < 6; c_++)
        K[dofs[r]][dofs[c_]] += Ke[r][c_];
  }

  // Assemble global force vector
  const F = new Array<number>(nDOF).fill(0);

  for (const load of model.nodalLoads ?? []) {
    const idx = nodeIndex.get(load.nodeId)! * 3;
    F[idx]     += load.Fx ?? 0;
    F[idx + 1] += load.Fy ?? 0;
    F[idx + 2] += load.Mz ?? 0;
  }

  for (const dl of model.distributedLoads ?? []) {
    const elem = elemById.get(dl.elementId)!;
    const fromNode = nodeById.get(elem.fromNodeId)!;
    const toNode   = nodeById.get(elem.toNodeId)!;
    const f_global = equivalentNodalForces(dl, elem, fromNode, toNode);
    const i0 = nodeIndex.get(elem.fromNodeId)! * 3;
    const i1 = nodeIndex.get(elem.toNodeId)! * 3;
    const dofs = [i0, i0+1, i0+2, i1, i1+1, i1+2];
    for (let r = 0; r < 6; r++) F[dofs[r]] += f_global[r];
  }

  // Apply boundary conditions via penalty method
  // Large penalty number makes constrained DOF effectively zero-displacement
  const PENALTY = 1e14;
  const restraints: boolean[] = new Array<boolean>(nDOF).fill(false);
  for (const support of model.supports) {
    const idx = nodeIndex.get(support.nodeId)! * 3;
    if (support.ux)    { K[idx][idx]         += PENALTY; restraints[idx]     = true; }
    if (support.uy)    { K[idx+1][idx+1]     += PENALTY; restraints[idx+1]   = true; }
    if (support.theta) { K[idx+2][idx+2]     += PENALTY; restraints[idx+2]   = true; }
  }

  // Solve K * u = F
  const u = gaussSolve(K, F);

  // Extract nodal displacements
  const nodeDisplacements: NodeDisplacement[] = model.nodes.map((node) => {
    const idx = nodeIndex.get(node.id)! * 3;
    return {
      nodeId: node.id,
      ux:    u[idx],
      uy:    u[idx + 1],
      theta: u[idx + 2],
    };
  });

  // Recover support reactions: R = K_orig * u − F  (at restrained DOFs)
  // We rebuild K without penalty for clean reaction recovery
  const K_clean = zeros(nDOF, nDOF);
  for (const elem of model.elements) {
    const fromNode = nodeById.get(elem.fromNodeId)!;
    const toNode   = nodeById.get(elem.toNodeId)!;
    const Ke = globalElementStiffness(elem, fromNode, toNode);
    const i0 = nodeIndex.get(elem.fromNodeId)! * 3;
    const i1 = nodeIndex.get(elem.toNodeId)! * 3;
    const dofs = [i0, i0+1, i0+2, i1, i1+1, i1+2];
    for (let r = 0; r < 6; r++)
      for (let c_ = 0; c_ < 6; c_++)
        K_clean[dofs[r]][dofs[c_]] += Ke[r][c_];
  }

  const reactions: SupportReaction[] = model.supports.map((support) => {
    const idx = nodeIndex.get(support.nodeId)! * 3;
    const Ku_row = (row: number) => K_clean[row].reduce((s, kij, j) => s + kij * u[j], 0);
    return {
      nodeId: support.nodeId,
      Rx: support.ux    ? Ku_row(idx)     - F[idx]     : 0,
      Ry: support.uy    ? Ku_row(idx + 1) - F[idx + 1] : 0,
      Mz: support.theta ? Ku_row(idx + 2) - F[idx + 2] : 0,
    };
  });

  // Recover element internal forces
  const elementForces: ElementForces[] = model.elements.map((elem) => {
    const fromNode = nodeById.get(elem.fromNodeId)!;
    const toNode   = nodeById.get(elem.toNodeId)!;
    const dx = toNode.x - fromNode.x;
    const dy = toNode.y - fromNode.y;
    const L = Math.sqrt(dx * dx + dy * dy);
    const c = dx / L;
    const s = dy / L;
    const E = elem.elasticModulusGPa * 1e6;
    const I = elem.momentOfInertiaM4;
    const A = elem.areaM2;

    const i0 = nodeIndex.get(elem.fromNodeId)! * 3;
    const i1 = nodeIndex.get(elem.toNodeId)! * 3;
    const u_global = [u[i0], u[i0+1], u[i0+2], u[i1], u[i1+1], u[i1+2]];

    // Transform to local: u_local = T * u_global
    const T = transformMatrix(c, s);
    const u_local = u_global.map((_, i) => T[i].reduce((sum, tij, j) => sum + tij * u_global[j], 0));

    const k_local = localStiffness(E, I, A, L);
    // f_local = k_local * u_local  (internal forces in local frame)
    const f_local = k_local.map((row) => row.reduce((sum, kij, j) => sum + kij * u_local[j], 0));

    // Recover true element internal forces under UDL:
    //   f_int = k * u_local + f_fef
    // Because we applied f_eq = −f_fef to the global load vector, the displacement
    // solution encodes only the "flexibility" part.  Adding back the fixed-end forces
    // (f_fef) reconstructs the physically correct shear/moment diagram.
    const dl = (model.distributedLoads ?? []).find((d) => d.elementId === elem.id);
    let f_local_adj = [...f_local];
    if (dl) {
      const f_fef_local = [0, (dl.w * L) / 2, (dl.w * L * L) / 12, 0, (dl.w * L) / 2, -(dl.w * L * L) / 12];
      f_local_adj = f_local.map((v, i) => v + f_fef_local[i]);
    }

    // Utilisation ratio: max(|M|) / Mp (plastic moment capacity)
    const Mmax = Math.max(Math.abs(f_local_adj[2]), Math.abs(f_local_adj[5]));
    let utilisationRatio = 0;
    if (elem.plasticModulusM3 && elem.yieldStrengthMPa) {
      const Mp = elem.plasticModulusM3 * elem.yieldStrengthMPa * 1000; // kN·m
      utilisationRatio = Mp > 0 ? Mmax / Mp : 0;
    }

    return {
      elementId: elem.id,
      N_start:  -f_local_adj[0],  // sign: tension positive convention
      V_start:  -f_local_adj[1],
      M_start:   f_local_adj[2],
      N_end:     f_local_adj[3],
      V_end:     f_local_adj[4],
      M_end:     f_local_adj[5],
      utilisationRatio,
    };
  });

  const maxDisplacementM = Math.max(
    ...nodeDisplacements.map((d) => Math.sqrt(d.ux ** 2 + d.uy ** 2)),
  );
  const maxUtilisationRatio = Math.max(0, ...elementForces.map((ef) => ef.utilisationRatio));

  return {
    solverType: 'dsm-2d-frame',
    converged: true,
    nodeDisplacements,
    reactions,
    elementForces,
    maxDisplacementM,
    maxUtilisationRatio,
    structurallyAdequate: maxUtilisationRatio < 1.0 || maxUtilisationRatio === 0,
  };
}

// ─── Receipt ──────────────────────────────────────────────────────────────────

export function buildFrame2DReceipt(
  model: Frame2DModel,
  result: Frame2DResult,
  options: Frame2DReceiptOptions = {},
): Frame2DReceipt {
  const violations: Array<{ criterion: string; message: string }> = [];

  if (!result.converged) {
    violations.push({ criterion: 'convergence', message: 'frame solver did not converge' });
  }
  if (!result.structurallyAdequate) {
    violations.push({
      criterion: 'utilisation',
      message: `max utilisation ratio ${result.maxUtilisationRatio.toFixed(3)} ≥ 1.0 (section overstressed)`,
    });
  }

  const receipt = buildDomainSimulationReceipt({
    plugin: 'civil-engineering' as const,
    pluginVersion: '1.0.0',
    runId: options.runId ?? `frame2d-${Date.now().toString(36)}`,
    createdAt: options.createdAt,
    modelId: model.id,
    solverConfig: {
      solverType: 'dsm-2d-frame',
      nodeCount: model.nodes.length,
      elementCount: model.elements.length,
      dofCount: model.nodes.length * 3,
    },
    resultSummary: {
      converged: result.converged,
      structurallyAdequate: result.structurallyAdequate,
      maxDisplacementMm: result.maxDisplacementM * 1000,
      maxUtilisationRatio: result.maxUtilisationRatio,
    },
    cael: {
      version: 'cael.v1',
      event: 'civil_engineering.frame_analysis',
      solverType: 'civil-engineering.dsm-2d-frame',
    },
    acceptance: { accepted: violations.length === 0, violations },
  });

  return receipt as Frame2DReceipt;
}

export const CIVIL_ENGINEERING_PLUGIN_VERSION = '1.0.0';
export const CIVIL_DOMAIN_SIMULATION_RECEIPT_SCHEMA = DOMAIN_SIMULATION_RECEIPT_SCHEMA;
