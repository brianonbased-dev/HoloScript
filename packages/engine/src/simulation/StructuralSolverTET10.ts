/**
 * StructuralSolverTET10 — Quadratic tetrahedral FEM with GPU-accelerated CG.
 *
 * ## Mathematical Formulation
 *
 * Same governing equations as TET4 (static linear elasticity: Ku = f),
 * but with 10-node quadratic tetrahedra that eliminate shear locking
 * and achieve O(h²) convergence for displacements.
 *
 * ## Element Formulation
 *
 * **Element type**: 10-node quadratic tetrahedron (TET10).
 * **Shape functions**: Quadratic in barycentric coordinates (L1, L2, L3, L4).
 *   Corner nodes (0-3):   Ni = Li(2Li - 1)
 *   Mid-edge nodes (4-9): Nij = 4·Li·Lj
 *
 * **Node numbering** (standard Zienkiewicz convention):
 *   0-3: corner vertices
 *   4: mid-edge 0→1,  5: mid-edge 1→2,  6: mid-edge 0→2
 *   7: mid-edge 0→3,  8: mid-edge 1→3,  9: mid-edge 2→3
 *
 * **Integration**: 4-point Gauss quadrature (exact for quadratic integrands).
 *   Points: (a,b,b), (b,a,b), (b,b,a), (b,b,b)
 *   where a = (5+3√5)/20 ≈ 0.5854102, b = (5-√5)/20 ≈ 0.1381966
 *   Weight per point: 1/4 (normalized to reference tet volume = 1/6)
 *
 * ## Assembly
 *
 * **Explicit CSR assembly**: Unlike the TET4 matrix-free approach, TET10
 * assembles the full global stiffness matrix in Compressed Sparse Row format.
 * This enables GPU-accelerated SpMV via `SparseLinearSolver`.
 *
 * **GPU path**: When a WebGPUContext is provided and available, the solve
 * routes through `SparseLinearSolver.solveCG()`. Otherwise falls back to
 * CPU-based preconditioned conjugate gradient.
 *
 * ## Stress Recovery
 *
 * Stresses are evaluated at each Gauss point (superconvergent locations)
 * and averaged per element, giving O(h²) stress accuracy vs O(1) for TET4.
 *
 * ## Convergence Characteristics
 *
 * - O(h²) for displacements (vs O(h) for TET4)
 * - O(h²) for stresses at superconvergent points (vs O(1) for TET4)
 * - No shear locking for bending-dominated problems
 * - Handles near-incompressible materials better than TET4
 *
 * ## References
 *
 * - Zienkiewicz & Taylor, "The Finite Element Method", Vol. 1, 7th ed., Ch. 10
 * - Bathe, K.J., "Finite Element Procedures", Prentice Hall, 1996, Ch. 5
 * - Hughes, T.J.R., "The Finite Element Method", Dover, 2000
 *
 * @see SparseLinearSolver — GPU CG solver consuming CSR matrices
 * @see StructuralSolver — TET4 predecessor (matrix-free, CPU only)
 */

import { conjugateGradient, type ConvergenceResult } from './ConvergenceControl';
import { getMaterial, type StructuralMaterial } from './MaterialDatabase';
import { SparseLinearSolver, type CSRMatrix } from '../gpu/SparseLinearSolver';
import { getGlobalWebGPUContext } from '../gpu/WebGPUContext';
import {
  type Force,
  type Pressure,
  type Acceleration,
  acceleration,
} from './units/PhysicalQuantity';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ConstraintType = 'fixed' | 'pinned' | 'roller';

export interface TET10Constraint {
  id: string;
  type: ConstraintType;
  /** Node indices that are constrained */
  nodes: number[];
  /**
   * For 'roller' type: which translational DOF axes to constrain.
   * 0 = U_x,  1 = U_y,  2 = U_z.
   * Omit (or pass all three) to behave like 'fixed'.
   */
  dofs?: (0 | 1 | 2)[];
}

export type LoadType = 'gravity' | 'point' | 'distributed';

export interface TET10Load {
  id: string;
  type: LoadType;
  /** Force vector [fx, fy, fz] in N */
  force?: [Force, Force, Force];
  /** Acceleration [ax, ay, az] for gravity loads */
  acceleration?: [Acceleration, Acceleration, Acceleration];
  /** Node index for point loads */
  nodeIndex?: number;
  /**
   * Surface references for distributed loads.
   * Backward compatible forms:
   * - element index (assumes local face 0)
   * - encoded face index: elementIndex * 4 + localFace
   */
  surfaceElements?: number[];
  /** Explicit face references (preferred) */
  surfaceFaces?: Array<{ elementIndex: number; localFace: 0 | 1 | 2 | 3 }>;
  /** Pressure in Pa for distributed loads */
  pressure?: Pressure;
}

export interface SurfaceMesh {
  /** Triangle positions: flat [x0,y0,z0, ...] — 3 verts per face */
  positions: Float32Array;
  /** Per-vertex scalar (interpolated from element scalars) */
  scalars: Float32Array;
  /** Per-vertex normals for lighting */
  normals: Float32Array;
  /** Volume node indices for zero-copy lookups */
  volumeNodeIndices: Uint32Array;
  /** Number of triangles */
  triangleCount: number;
}

export interface TET10Config {
  /** Vertex positions: flat [x0,y0,z0, x1,y1,z1, ...] — all 10 nodes per element */
  vertices: Float64Array | Float32Array;
  /** Element connectivity: flat [n0,...,n9, ...] — 10 nodes per element */
  tetrahedra: Uint32Array;
  /** Material name or direct properties */
  material: string | StructuralMaterial;
  constraints: TET10Constraint[];
  loads: TET10Load[];
  /** Max CG iterations (default 2000) */
  maxIterations?: number;
  /** CG convergence tolerance (default 1e-10) */
  tolerance?: number;
  /** Use GPU solver when available (default true) */
  useGPU?: boolean;
  /** Enable geometric nonlinearity (Newton-Raphson) */
  nonlinear?: boolean;
  /** Number of load steps for nonlinear analysis (default 5) */
  loadSteps?: number;
}

export interface TET10Stats {
  nodeCount: number;
  elementCount: number;
  dofCount: number;
  nnz: number;
  maxVonMises: number;
  minSafetyFactor: number;
  solveResult: ConvergenceResult | null;
  solveTimeMs: number;
  useGPU: boolean;
}

// ── Gauss Quadrature ──────────────────────────────────────────────────────────

/** 4-point Gauss quadrature for tetrahedra (exact for quadratic integrands). */
const GAUSS_A = (5 + 3 * Math.sqrt(5)) / 20; // ≈ 0.5854102
const GAUSS_B = (5 - Math.sqrt(5)) / 20;     // ≈ 0.1381966
const GAUSS_W = 0.25; // Each point's weight (sum = 1, × ref vol 1/6 applied later)

/** Gauss points in (ξ, η, ζ) natural coordinates */
const GAUSS_POINTS: [number, number, number][] = [
  [GAUSS_A, GAUSS_B, GAUSS_B],
  [GAUSS_B, GAUSS_A, GAUSS_B],
  [GAUSS_B, GAUSS_B, GAUSS_A],
  [GAUSS_B, GAUSS_B, GAUSS_B],
];

// ── Shape Functions ───────────────────────────────────────────────────────────

/**
 * Evaluate shape function gradients w.r.t. natural coordinates (ξ, η, ζ).
 * Returns 10×3 matrix (row-major): dN[i*3+j] = ∂Ni/∂{ξ,η,ζ}_j
 */
function shapeFunctionGradients(xi: number, eta: number, zeta: number): Float64Array {
  const L1 = 1 - xi - eta - zeta;
  const L2 = xi;
  const L3 = eta;
  const L4 = zeta;

  // dL/d{ξ,η,ζ}: L1 = 1-ξ-η-ζ → (-1,-1,-1)
  //               L2 = ξ       → (1,0,0)
  //               L3 = η       → (0,1,0)
  //               L4 = ζ       → (0,0,1)

  const dN = new Float64Array(30); // 10 nodes × 3 components

  // dN0/d{ξ,η,ζ} = d[L1(2L1-1)]/d... = (4L1-1) * dL1/d...
  dN[0] = -(4 * L1 - 1); dN[1] = -(4 * L1 - 1); dN[2] = -(4 * L1 - 1);

  // dN1/d{ξ,η,ζ} = (4L2-1) * dL2/d...
  dN[3] = 4 * L2 - 1; dN[4] = 0; dN[5] = 0;

  // dN2/d{ξ,η,ζ} = (4L3-1) * dL3/d...
  dN[6] = 0; dN[7] = 4 * L3 - 1; dN[8] = 0;

  // dN3/d{ξ,η,ζ} = (4L4-1) * dL4/d...
  dN[9] = 0; dN[10] = 0; dN[11] = 4 * L4 - 1;

  // dN4/d{ξ,η,ζ} = d[4L1L2]/d... = 4(L1·dL2 + L2·dL1)
  dN[12] = 4 * (L1 - L2); dN[13] = -4 * L2; dN[14] = -4 * L2;

  // dN5/d{ξ,η,ζ} = d[4L2L3]/d... = 4(L2·dL3 + L3·dL2)
  dN[15] = 4 * L3; dN[16] = 4 * L2; dN[17] = 0;

  // dN6/d{ξ,η,ζ} = d[4L1L3]/d... = 4(L1·dL3 + L3·dL1)
  dN[18] = -4 * L3; dN[19] = 4 * (L1 - L3); dN[20] = -4 * L3;

  // dN7/d{ξ,η,ζ} = d[4L1L4]/d... = 4(L1·dL4 + L4·dL1)
  dN[21] = -4 * L4; dN[22] = -4 * L4; dN[23] = 4 * (L1 - L4);

  // dN8/d{ξ,η,ζ} = d[4L2L4]/d... = 4(L2·dL4 + L4·dL2)
  dN[24] = 4 * L4; dN[25] = 0; dN[26] = 4 * L2;

  // dN9/d{ξ,η,ζ} = d[4L3L4]/d... = 4(L3·dL4 + L4·dL3)
  dN[27] = 0; dN[28] = 4 * L4; dN[29] = 4 * L3;

  return dN;
}

// Quadratic 6-node triangle shape functions (r,s with L1=1-r-s, L2=r, L3=s)
function tri6ShapeFunctions(r: number, s: number): Float64Array {
  const L1 = 1 - r - s;
  const L2 = r;
  const L3 = s;
  return new Float64Array([
    L1 * (2 * L1 - 1), // corner 1
    L2 * (2 * L2 - 1), // corner 2
    L3 * (2 * L3 - 1), // corner 3
    4 * L1 * L2,       // midside 12
    4 * L2 * L3,       // midside 23
    4 * L3 * L1,       // midside 31
  ]);
}

function tri6ShapeDerivatives(r: number, s: number): { dNdr: Float64Array; dNds: Float64Array } {
  const L1 = 1 - r - s;
  const L2 = r;
  const L3 = s;

  const dNdr = new Float64Array([
    -(4 * L1 - 1),
    4 * L2 - 1,
    0,
    4 * (L1 - L2),
    4 * L3,
    -4 * L3,
  ]);

  const dNds = new Float64Array([
    -(4 * L1 - 1),
    0,
    4 * L3 - 1,
    -4 * L2,
    4 * L2,
    4 * (L1 - L3),
  ]);

  return { dNdr, dNds };
}

const TRI_GAUSS_3: Array<{ r: number; s: number; w: number }> = [
  { r: 1 / 6, s: 1 / 6, w: 1 / 6 },
  { r: 2 / 3, s: 1 / 6, w: 1 / 6 },
  { r: 1 / 6, s: 2 / 3, w: 1 / 6 },
];

// ── CSR Builder ───────────────────────────────────────────────────────────────

/**
 * Build CSR sparsity pattern from element connectivity.
 * Each element has 10 nodes × 3 DOFs = 30 DOFs per element.
 * For 3-DOF blocks, we store entries for all (i,j) pairs within each element.
 */
function buildCSRPattern(
  nodeCount: number,
  elementCount: number,
  tetrahedra: Uint32Array,
): { rowPtr: Uint32Array; colInd: Uint32Array; dofToCSR: Map<number, Map<number, number>> } {
  const dofCount = nodeCount * 3;

  // Build adjacency: for each DOF, which other DOFs does it couple with?
  // Use node-level adjacency then expand to DOFs (more memory efficient)
  const nodeAdj = new Array<Set<number>>(nodeCount);
  for (let i = 0; i < nodeCount; i++) nodeAdj[i] = new Set();

  for (let e = 0; e < elementCount; e++) {
    const base = e * 10;
    for (let a = 0; a < 10; a++) {
      const na = tetrahedra[base + a];
      for (let b = 0; b < 10; b++) {
        const nb = tetrahedra[base + b];
        nodeAdj[na].add(nb);
      }
    }
  }

  // Build row_ptr: count nonzeros per DOF row
  // Each node-node coupling produces a 3×3 block of DOF couplings
  const rowPtr = new Uint32Array(dofCount + 1);
  for (let node = 0; node < nodeCount; node++) {
    const adjCount = nodeAdj[node].size; // number of adjacent nodes
    for (let d = 0; d < 3; d++) {
      rowPtr[node * 3 + d + 1] = adjCount * 3; // 3 DOFs per adjacent node
    }
  }

  // Prefix sum
  for (let i = 1; i <= dofCount; i++) {
    rowPtr[i] += rowPtr[i - 1];
  }

  const nnz = rowPtr[dofCount];
  const colInd = new Uint32Array(nnz);

  // Map for fast value insertion: dofToCSR[row][col] = index into val[]
  const dofToCSR = new Map<number, Map<number, number>>();

  // Fill colInd with sorted column indices
  for (let node = 0; node < nodeCount; node++) {
    const adjNodes = Array.from(nodeAdj[node]).sort((a, b) => a - b);

    for (let d = 0; d < 3; d++) {
      const row = node * 3 + d;
      const rowMap = new Map<number, number>();
      let offset = rowPtr[row];

      for (const adjNode of adjNodes) {
        for (let dd = 0; dd < 3; dd++) {
          const col = adjNode * 3 + dd;
          colInd[offset] = col;
          rowMap.set(col, offset);
          offset++;
        }
      }
      dofToCSR.set(row, rowMap);
    }
  }

  return { rowPtr, colInd, dofToCSR };
}

// ── Solver ────────────────────────────────────────────────────────────────────

export class StructuralSolverTET10 {
  private config: TET10Config;
  private material: StructuralMaterial;
  private maxIterations: number;
  private tolerance: number;
  private useGPU: boolean;
  private nonlinear: boolean;
  private loadSteps: number;
  private nodeCount: number;
  private elementCount: number;
  private dofCount: number;

  private referencePositions: Float64Array;
  private displacements: Float64Array;
  private externalForces: Float64Array;
  private vonMisesStress: Float64Array; // per-element (averaged over Gauss points)
  private cauchyStress: Float64Array; // per-element, 6 components: [sxx,syy,szz,txy,tyz,txz]
  private safetyFactors: Float64Array;

  /**
   * Per-Gauss-point stress data for SPR recovery.
   * Layout: elementCount × 4 Gauss points × 6 stress components = elementCount × 24.
   * Access: gaussPointStress[(e * 4 + gp) * 6 + component]
   * Preserved during recoverStress() instead of being discarded after averaging.
   */
  private gaussPointStress: Float64Array;
  /**
   * Physical (x,y,z) coordinates of each Gauss point.
   * Layout: elementCount × 4 × 3 = elementCount × 12.
   * Access: gaussPointCoords[(e * 4 + gp) * 3 + axis]
   * Needed by SPR to build the polynomial fitting problem.
   */
  private gaussPointCoords: Float64Array;
  private constrainedDofs: Set<number>;

  // Explicit CSR global stiffness matrix
  private csrRowPtr!: Uint32Array;
  private csrColInd!: Uint32Array;
  private csrVal!: Float64Array;
  private dofToCSR!: Map<number, Map<number, number>>;
  private nnz = 0;

  // Constitutive matrix D (6×6 Voigt, reused in stress recovery)
  private D: Float64Array;

  private solveResult: ConvergenceResult | null = null;
  private solveTimeMs = 0;

  /** Helper for 3x3 matrix inversion */
  private invert3x3(m: Float64Array): Float64Array {
    const det = m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
    if (Math.abs(det) < 1e-25) return new Float64Array(9);
    const invDet = 1 / det;
    return new Float64Array([
      (m[4] * m[8] - m[5] * m[7]) * invDet, (m[2] * m[7] - m[1] * m[8]) * invDet, (m[1] * m[5] - m[2] * m[4]) * invDet,
      (m[5] * m[6] - m[3] * m[8]) * invDet, (m[0] * m[8] - m[2] * m[6]) * invDet, (m[2] * m[3] - m[0] * m[5]) * invDet,
      (m[3] * m[7] - m[4] * m[6]) * invDet, (m[1] * m[6] - m[0] * m[7]) * invDet, (m[0] * m[4] - m[1] * m[3]) * invDet,
    ]);
  }

  private gpuDisplacementBuffer: GPUBuffer | null = null;
  private gpuSolver: SparseLinearSolver | null = null;

  private static readonly LOCAL_FACE_NODE_MAP: ReadonlyArray<readonly [number, number, number, number, number, number]> = [
    // Face opposite corner 3: (0,1,2) + mids (01,12,02)
    [0, 1, 2, 4, 5, 6],
    // Face opposite corner 2: (0,1,3) + mids (01,13,03)
    [0, 1, 3, 4, 8, 7],
    // Face opposite corner 1: (0,2,3) + mids (02,23,03)
    [0, 2, 3, 6, 9, 7],
    // Face opposite corner 0: (1,2,3) + mids (12,23,13)
    [1, 2, 3, 5, 9, 8],
  ];

  private decodeSurfaceReferences(load: TET10Load): Array<{ elementIndex: number; localFace: 0 | 1 | 2 | 3 }> {
    const refs: Array<{ elementIndex: number; localFace: 0 | 1 | 2 | 3 }> = [];

    if (load.surfaceFaces?.length) {
      for (const face of load.surfaceFaces) {
        if (face.elementIndex < 0 || face.elementIndex >= this.elementCount) continue;
        refs.push({ elementIndex: face.elementIndex, localFace: face.localFace });
      }
      return refs;
    }

    if (!load.surfaceElements?.length) return refs;

    for (const raw of load.surfaceElements) {
      if (!Number.isFinite(raw) || raw < 0) continue;

      const asInt = Math.floor(raw);

      // Backward compatibility: if raw is valid element index, assume face 0
      if (asInt < this.elementCount) {
        refs.push({ elementIndex: asInt, localFace: 0 });
        continue;
      }

      // Encoded face reference: elementIndex * 4 + localFace
      const elementIndex = Math.floor(asInt / 4);
      const localFace = (asInt % 4) as 0 | 1 | 2 | 3;
      if (elementIndex >= 0 && elementIndex < this.elementCount) {
        refs.push({ elementIndex, localFace });
      }
    }

    return refs;
  }

  private get stiffnessMatrix(): CSRMatrix {
    return {
      row_ptr: this.csrRowPtr,
      col_ind: this.csrColInd,
      val: new Float32Array(this.csrVal),
      num_rows: this.dofCount,
    };
  }

  constructor(config: TET10Config) {
    this.config = config;

    this.material =
      typeof config.material === 'string'
        ? (getMaterial(config.material) as StructuralMaterial)
        : config.material;

    this.maxIterations = config.maxIterations ?? 2000;
    this.tolerance = config.tolerance ?? 1e-10;
    this.useGPU = config.useGPU ?? true;
    this.nonlinear = config.nonlinear ?? false;
    this.loadSteps = config.loadSteps ?? 5;

    this.nodeCount = config.vertices.length / 3;
    this.elementCount = config.tetrahedra.length / 10;
    this.dofCount = this.nodeCount * 3;

    this.referencePositions = new Float64Array(config.vertices);
    this.displacements = new Float64Array(this.dofCount);
    this.externalForces = new Float64Array(this.dofCount);
    this.vonMisesStress = new Float64Array(this.elementCount);
    this.cauchyStress = new Float64Array(this.elementCount * 6);
    this.safetyFactors = new Float64Array(this.elementCount);
    this.gaussPointStress = new Float64Array(this.elementCount * 24); // 4 GP × 6 components
    this.gaussPointCoords = new Float64Array(this.elementCount * 12); // 4 GP × 3 coords

    // Build constitutive matrix D
    const { youngs_modulus: E, poisson_ratio: nu } = this.material;
    const lambda = (E * nu) / ((1 + nu) * (1 - 2 * nu));
    const mu = E / (2 * (1 + nu));
    this.D = new Float64Array(36);
    this.D[0] = this.D[7] = this.D[14] = lambda + 2 * mu;
    this.D[1] = this.D[2] = this.D[6] = this.D[8] = this.D[12] = this.D[13] = lambda;
    this.D[21] = this.D[28] = this.D[35] = mu;

    // Build constrained DOF set
    this.constrainedDofs = new Set<number>();
    for (const c of config.constraints) {
      for (const n of c.nodes) {
        if (c.type === 'roller') {
          const axes = c.dofs ?? [0, 1, 2];
          for (const d of axes) {
            this.constrainedDofs.add(n * 3 + d);
          }
        } else {
          // 'fixed' | 'pinned': constrain all 3 translational DOFs
          this.constrainedDofs.add(n * 3);
          this.constrainedDofs.add(n * 3 + 1);
          this.constrainedDofs.add(n * 3 + 2);
        }
      }
    }

    // Build CSR pattern and assemble stiffness
    this.assembleGlobalStiffness();

    // Assemble force vector
    this.assembleForces();
  }

  /**
   * Assemble the global stiffness matrix in CSR format.
   *
   * For each element:
   *   1. Evaluate shape function gradients at each Gauss point
   *   2. Compute Jacobian and its inverse
   *   3. Transform gradients to physical coordinates: dN/dx = J^{-1} · dN/dξ
   *   4. Build B matrix (6×30) and element stiffness Ke = Σ_gp (w · |J| · Bᵀ·D·B)
   *   5. Scatter Ke into the global CSR structure
   */
  private assembleGlobalStiffness(): void {
    const { rowPtr, colInd, dofToCSR } = buildCSRPattern(
      this.nodeCount, this.elementCount, this.config.tetrahedra,
    );

    this.csrRowPtr = rowPtr;
    this.csrColInd = colInd;
    this.dofToCSR = dofToCSR;
    this.nnz = rowPtr[this.dofCount];
    this.csrVal = new Float64Array(this.nnz);

    const verts = this.config.vertices;
    const tets = this.config.tetrahedra;
    const D = this.D;

    for (let e = 0; e < this.elementCount; e++) {
      const base = e * 10;

      // Element node coordinates (10 nodes × 3)
      const coords = new Float64Array(30);
      for (let a = 0; a < 10; a++) {
        const n = tets[base + a];
        coords[a * 3] = verts[n * 3];
        coords[a * 3 + 1] = verts[n * 3 + 1];
        coords[a * 3 + 2] = verts[n * 3 + 2];
      }

      // Element stiffness matrix (30×30)
      const ke = new Float64Array(900);

      // Gauss quadrature: sum over 4 integration points
      for (let gp = 0; gp < 4; gp++) {
        const [xi, eta, zeta] = GAUSS_POINTS[gp];

        // Shape function gradients w.r.t. natural coordinates (10×3)
        const dNnat = shapeFunctionGradients(xi, eta, zeta);

        // Jacobian J[i][j] = Σ_a (dNa/dξ_j · x_a_i)
        // J is 3×3: J[i*3+j] = Σ_a dNnat[a*3+j] * coords[a*3+i]
        const J = new Float64Array(9);
        for (let a = 0; a < 10; a++) {
          for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
              J[i * 3 + j] += dNnat[a * 3 + j] * coords[a * 3 + i];
            }
          }
        }

        // Determinant of J
        const detJ =
          J[0] * (J[4] * J[8] - J[5] * J[7]) -
          J[1] * (J[3] * J[8] - J[5] * J[6]) +
          J[2] * (J[3] * J[7] - J[4] * J[6]);

        if (Math.abs(detJ) < 1e-30) continue;

        // Inverse Jacobian
        const invDetJ = 1 / detJ;
        const Ji = new Float64Array(9);
        Ji[0] = (J[4] * J[8] - J[5] * J[7]) * invDetJ;
        Ji[1] = (J[2] * J[7] - J[1] * J[8]) * invDetJ;
        Ji[2] = (J[1] * J[5] - J[2] * J[4]) * invDetJ;
        Ji[3] = (J[5] * J[6] - J[3] * J[8]) * invDetJ;
        Ji[4] = (J[0] * J[8] - J[2] * J[6]) * invDetJ;
        Ji[5] = (J[2] * J[3] - J[0] * J[5]) * invDetJ;
        Ji[6] = (J[3] * J[7] - J[4] * J[6]) * invDetJ;
        Ji[7] = (J[1] * J[6] - J[0] * J[7]) * invDetJ;
        Ji[8] = (J[0] * J[4] - J[1] * J[3]) * invDetJ;

        // Physical gradients dN/dx = dN/dξ · J^{-1} (10×3)
        const dNphys = new Float64Array(30);
        for (let a = 0; a < 10; a++) {
          for (let i = 0; i < 3; i++) {
            let sum = 0;
            for (let j = 0; j < 3; j++) {
              sum += dNnat[a * 3 + j] * Ji[j * 3 + i];
            }
            dNphys[a * 3 + i] = sum;
          }
        }

        // B matrix (6×30): strain = B · u
        const B = new Float64Array(180); // 6 rows × 30 cols
        for (let a = 0; a < 10; a++) {
          const dnx = dNphys[a * 3], dny = dNphys[a * 3 + 1], dnz = dNphys[a * 3 + 2];
          const col = a * 3;
          B[0 * 30 + col] = dnx;                                     // εxx
          B[1 * 30 + col + 1] = dny;                                 // εyy
          B[2 * 30 + col + 2] = dnz;                                 // εzz
          B[3 * 30 + col] = dny; B[3 * 30 + col + 1] = dnx;         // γxy
          B[4 * 30 + col + 1] = dnz; B[4 * 30 + col + 2] = dny;     // γyz
          B[5 * 30 + col] = dnz; B[5 * 30 + col + 2] = dnx;         // γxz
        }

        // DB = D · B (6×30)
        const DB = new Float64Array(180);
        for (let i = 0; i < 6; i++) {
          for (let j = 0; j < 30; j++) {
            let sum = 0;
            for (let k = 0; k < 6; k++) {
              sum += D[i * 6 + k] * B[k * 30 + j];
            }
            DB[i * 30 + j] = sum;
          }
        }

        // Ke += w · |detJ| · (1/6) · Bᵀ · D · B
        // The factor 1/6 is the reference tet volume
        const weight = GAUSS_W * Math.abs(detJ) / 6;

        for (let i = 0; i < 30; i++) {
          for (let j = 0; j < 30; j++) {
            let sum = 0;
            for (let k = 0; k < 6; k++) {
              sum += B[k * 30 + i] * DB[k * 30 + j];
            }
            ke[i * 30 + j] += weight * sum;
          }
        }
      }

      // Scatter ke into global CSR
      for (let a = 0; a < 10; a++) {
        const na = tets[base + a];
        for (let ai = 0; ai < 3; ai++) {
          const globalI = na * 3 + ai;
          const localI = a * 3 + ai;
          const rowMap = dofToCSR.get(globalI)!;

          for (let b = 0; b < 10; b++) {
            const nb = tets[base + b];
            for (let bi = 0; bi < 3; bi++) {
              const globalJ = nb * 3 + bi;
              const localJ = b * 3 + bi;
              const csrIdx = rowMap.get(globalJ)!;
              this.csrVal[csrIdx] += ke[localI * 30 + localJ];
            }
          }
        }
      }
    }
  }

  /**
   * Assemble the global force vector from loads.
   * Uses shape functions for consistent force distribution.
   */
  private assembleForces(): void {
    this.externalForces.fill(0);
    const { density } = this.material;
    const tets = this.config.tetrahedra;
    const verts = this.config.vertices;

    for (const load of this.config.loads) {
      switch (load.type) {
        case 'gravity': {
          const [ax, ay, az] = load.acceleration ?? [acceleration(0), acceleration(-9.81), acceleration(0)];

          for (let e = 0; e < this.elementCount; e++) {
            const base = e * 10;

            // Compute element volume via Gauss quadrature
            let elemVol = 0;
            for (let gp = 0; gp < 4; gp++) {
              const [xi, eta, zeta] = GAUSS_POINTS[gp];
              const dNnat = shapeFunctionGradients(xi, eta, zeta);

              const J = new Float64Array(9);
              for (let a = 0; a < 10; a++) {
                const n = tets[base + a];
                for (let i = 0; i < 3; i++) {
                  for (let j = 0; j < 3; j++) {
                    J[i * 3 + j] += dNnat[a * 3 + j] * verts[n * 3 + i];
                  }
                }
              }

              const detJ =
                J[0] * (J[4] * J[8] - J[5] * J[7]) -
                J[1] * (J[3] * J[8] - J[5] * J[6]) +
                J[2] * (J[3] * J[7] - J[4] * J[6]);

              elemVol += GAUSS_W * Math.abs(detJ) / 6;
            }

            // Lumped mass: distribute volume equally to 10 nodes
            const massPerNode = (density * elemVol) / 10;
            for (let a = 0; a < 10; a++) {
              const n = tets[base + a];
              this.externalForces[n * 3] += massPerNode * ax;
              this.externalForces[n * 3 + 1] += massPerNode * ay;
              this.externalForces[n * 3 + 2] += massPerNode * az;
            }
          }
          break;
        }
        case 'point': {
          if (load.nodeIndex !== undefined && load.force) {
            const n = load.nodeIndex;
            this.externalForces[n * 3] += load.force[0];
            this.externalForces[n * 3 + 1] += load.force[1];
            this.externalForces[n * 3 + 2] += load.force[2];
          }
          break;
        }
        case 'distributed': {
          if (!load.pressure) break;

          const faceRefs = this.decodeSurfaceReferences(load);
          for (const { elementIndex, localFace } of faceRefs) {
            const elemBase = elementIndex * 10;
            const map = StructuralSolverTET10.LOCAL_FACE_NODE_MAP[localFace];

            const faceNodes = new Uint32Array(6);
            for (let i = 0; i < 6; i++) {
              faceNodes[i] = tets[elemBase + map[i]];
            }

            // Use corner nodes to determine outward orientation for this face
            const c0 = faceNodes[0], c1 = faceNodes[1], c2 = faceNodes[2];
            const oppCornerLocal = localFace === 0 ? 3 : localFace === 1 ? 2 : localFace === 2 ? 1 : 0;
            const opp = tets[elemBase + oppCornerLocal];

            const x0 = verts[c0 * 3], y0 = verts[c0 * 3 + 1], z0 = verts[c0 * 3 + 2];
            const x1 = verts[c1 * 3], y1 = verts[c1 * 3 + 1], z1 = verts[c1 * 3 + 2];
            const x2 = verts[c2 * 3], y2 = verts[c2 * 3 + 1], z2 = verts[c2 * 3 + 2];
            const xo = verts[opp * 3], yo = verts[opp * 3 + 1], zo = verts[opp * 3 + 2];

            const ex1 = x1 - x0, ey1 = y1 - y0, ez1 = z1 - z0;
            const ex2 = x2 - x0, ey2 = y2 - y0, ez2 = z2 - z0;
            let nx0 = ey1 * ez2 - ez1 * ey2;
            let ny0 = ez1 * ex2 - ex1 * ez2;
            let nz0 = ex1 * ey2 - ey1 * ex2;

            // If normal points toward opposite corner, flip to outward normal
            const dotOpp = nx0 * (xo - x0) + ny0 * (yo - y0) + nz0 * (zo - z0);
            const outwardSign = dotOpp > 0 ? -1 : 1;

            for (const gp of TRI_GAUSS_3) {
              const N = tri6ShapeFunctions(gp.r, gp.s);
              const { dNdr, dNds } = tri6ShapeDerivatives(gp.r, gp.s);

              let jrx = 0, jry = 0, jrz = 0;
              let jsx = 0, jsy = 0, jsz = 0;
              for (let a = 0; a < 6; a++) {
                const n = faceNodes[a];
                const x = verts[n * 3];
                const y = verts[n * 3 + 1];
                const z = verts[n * 3 + 2];
                jrx += dNdr[a] * x;
                jry += dNdr[a] * y;
                jrz += dNdr[a] * z;
                jsx += dNds[a] * x;
                jsy += dNds[a] * y;
                jsz += dNds[a] * z;
              }

              // Surface Jacobian vector (includes differential area scaling)
              let nx = jry * jsz - jrz * jsy;
              let ny = jrz * jsx - jrx * jsz;
              let nz = jrx * jsy - jry * jsx;

              nx *= outwardSign;
              ny *= outwardSign;
              nz *= outwardSign;

              for (let a = 0; a < 6; a++) {
                const node = faceNodes[a];
                const coeff = load.pressure * gp.w * N[a];
                this.externalForces[node * 3] += coeff * nx;
                this.externalForces[node * 3 + 1] += coeff * ny;
                this.externalForces[node * 3 + 2] += coeff * nz;
              }
            }
          }
          break;
        }
      }
    }
  }

  /**
   * Solve the nonlinear structural problem using Newton-Raphson iterations.
   *
   * Workflow (as per RESEARCH_NONLINEAR_NR.md):
   * 1. Loop through load increments
   * 2. Outer loop: re-assemble tangent stiffness K_T(u) and internal force f_int(u)
   * 3. Inner solve: K_T * delta_u = f_ext - f_int
   * 4. Update: u = u + delta_u
   * 5. Check convergence: ||f_ext - f_int|| < tol
   */
  public async solveNonlinear(): Promise<ConvergenceResult> {
    console.log(`Starting nonlinear solve: ${this.loadSteps} load steps...`);
    const startTime = performance.now();
    
    // Total external forces accumulated from loads
    this.assembleForces();
    const totalExtForce = new Float64Array(this.externalForces);
    
    // Start from zero displacements
    this.displacements.fill(0);

    const normResidual = (r: Float64Array): number => {
      let n = 0;
      for (let i = 0; i < this.dofCount; i++) {
        if (this.constrainedDofs.has(i)) continue;
        const v = r[i];
        n += v * v;
      }
      return Math.sqrt(n);
    };

    const normFree = (v: Float64Array): number => {
      let n = 0;
      for (let i = 0; i < this.dofCount; i++) {
        if (this.constrainedDofs.has(i)) continue;
        const x = v[i];
        n += x * x;
      }
      return Math.sqrt(n);
    };

    const computeResidual = (currentExtForce: Float64Array): { residual: Float64Array; norm: number } => {
      const f_int = this.assembleInternalForce();
      const residual = new Float64Array(this.dofCount);
      for (let i = 0; i < this.dofCount; i++) {
        if (this.constrainedDofs.has(i)) continue;
        residual[i] = currentExtForce[i] - f_int[i];
      }
      return { residual, norm: normResidual(residual) };
    };

    let totalIter = 0;
    let stepCounter = 0;
    let currentLoadFactor = 0;
    let increment = 1 / Math.max(1, this.loadSteps);
    const minIncrement = Math.max((1 / Math.max(1, this.loadSteps)) / 2048, 1e-6);

    while (currentLoadFactor < 1 - 1e-12) {
      stepCounter++;
      const trialLoadFactor = Math.min(1, currentLoadFactor + increment);
      console.log(`Load Step ${stepCounter} (Factor: ${trialLoadFactor.toFixed(4)}, Δ=${increment.toFixed(4)})`);

      const currentExtForce = new Float64Array(this.dofCount);
      for (let i = 0; i < this.dofCount; i++) currentExtForce[i] = totalExtForce[i] * trialLoadFactor;

      const uBeforeStep = new Float64Array(this.displacements);
      let converged = false;
      let previousResidualNorm = Number.POSITIVE_INFINITY;
      const explosionFactor = 8.0;

      for (let nrIter = 0; nrIter < 40; nrIter++) {
        this.assembleTangentStiffness();
        this.regularizeTangentStiffness();
        this.applyConstraintsToCSR();

        const { residual: r, norm: residNorm } = computeResidual(currentExtForce);
        console.log(`  NR Iter ${nrIter}: Residual Norm = ${residNorm.toExponential(4)}`);

        if (!Number.isFinite(residNorm)) {
          break;
        }

        if (nrIter > 0 && Number.isFinite(previousResidualNorm) && residNorm > previousResidualNorm * explosionFactor) {
          // Residual exploded; force adaptive substep retry.
          break;
        }

        previousResidualNorm = residNorm;

        if (residNorm < this.tolerance) {
          converged = true;
          break;
        }

        const solveResult = await this.solveLinearSystem(r);
        if (!solveResult.converged) {
          break;
        }

        // Backtracking line search on residual norm
        const uBase = new Float64Array(this.displacements);
        const baseNorm = residNorm;
        const baseUNorm = Math.max(normFree(uBase), 1e-12);
        let accepted = false;
        let alpha = 1.0;
        let acceptedUpdateNorm = Number.POSITIVE_INFINITY;

        for (let ls = 0; ls < 10; ls++) {
          const scaledStep = new Float64Array(this.dofCount);
          for (let i = 0; i < this.dofCount; i++) {
            scaledStep[i] = alpha * solveResult.solution[i];
            this.displacements[i] = uBase[i] + scaledStep[i];
          }

          const stepNorm = normFree(scaledStep);
          acceptedUpdateNorm = stepNorm / baseUNorm;

          const trial = computeResidual(currentExtForce);
          if (Number.isFinite(trial.norm) && trial.norm < baseNorm) {
            accepted = true;
            break;
          }

          alpha *= 0.5;
        }

        if (!accepted) {
          // Restore and force load-step reduction
          this.displacements.set(uBase);
          break;
        }

        // Secondary NR stopping criterion: relative displacement update norm
        if (acceptedUpdateNorm < 1e-8) {
          converged = true;
          break;
        }

        totalIter++;
      }

      if (converged) {
        currentLoadFactor = trialLoadFactor;
        if (increment < (1 / Math.max(1, this.loadSteps))) {
          increment = Math.min(1 / Math.max(1, this.loadSteps), increment * 1.5);
        }
        continue;
      }

      // Step failed: rollback and retry with smaller load increment
      this.displacements.set(uBeforeStep);
      increment *= 0.5;
      if (increment < minIncrement) {
        throw new Error(`Nonlinear solve failed to converge near load factor ${trialLoadFactor.toFixed(4)}`);
      }
      console.warn(`  Step failed. Retrying with smaller Δ=${increment.toFixed(6)}`);
    }
    
    this.solveTimeMs = performance.now() - startTime;
    return {
      converged: true,
      iterations: totalIter,
      residual: 0,
      maxChange: 0,
    } as ConvergenceResult;
  }

  /**
   * Assemble internal force vector f_int based on current displacements (Large Strain).
   * f_int = \int B^T * sigma dV
   */
  private assembleInternalForce(): Float64Array {
    const f_int = new Float64Array(this.dofCount);
    const tets = this.config.tetrahedra;
    const verts = this.config.vertices;
    const { youngs_modulus: E, poisson_ratio: nu } = this.material;

    const lambda = (E * nu) / ((1 + nu) * (1 - 2 * nu));
    const mu = E / (2 * (1 + nu));
    const D = new Float64Array(36);
    D[0] = D[7] = D[14] = lambda + 2 * mu;
    D[1] = D[2] = D[6] = D[8] = D[12] = D[13] = lambda;
    D[21] = D[28] = D[35] = mu;

    for (let e = 0; e < this.elementCount; e++) {
      const base = e * 10;
      const nodes = Array.from({ length: 10 }, (_, i) => tets[base + i]);

      for (let gp = 0; gp < 4; gp++) {
        const [xi, eta, zeta] = GAUSS_POINTS[gp];
        const dNnat = shapeFunctionGradients(xi, eta, zeta);

        const J = new Float64Array(9);
        for (let a = 0; a < 10; a++) {
          const n = nodes[a];
          for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
              J[i * 3 + j] += dNnat[a * 3 + j] * verts[n * 3 + i];
            }
          }
        }

        const detJ = J[0] * (J[4] * J[8] - J[5] * J[7]) - J[1] * (J[3] * J[8] - J[5] * J[6]) + J[2] * (J[3] * J[7] - J[4] * J[6]);
        const weight = GAUSS_W * Math.abs(detJ) / 6;
        const invJ = this.invert3x3(J);

        const dNdX = new Float64Array(30);
        for (let a = 0; a < 10; a++) {
          for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
              dNdX[a * 3 + i] += dNnat[a * 3 + j] * invJ[j * 3 + i];
            }
          }
        }

        const F = new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
        for (let a = 0; a < 10; a++) {
          const n = nodes[a];
          for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
              F[i * 3 + j] += this.displacements[n * 3 + i] * dNdX[a * 3 + j];
            }
          }
        }

        const E_gl = new Float64Array(9);
        for (let i = 0; i < 3; i++) {
          for (let j = 0; j < 3; j++) {
            let sum = 0;
            for (let k = 0; k < 3; k++) sum += F[k * 3 + i] * F[k * 3 + j];
            E_gl[i * 3 + j] = 0.5 * (sum - (i === j ? 1 : 0));
          }
        }

        const strainVoigt = new Float64Array([E_gl[0], E_gl[4], E_gl[8], 2 * E_gl[1], 2 * E_gl[5], 2 * E_gl[2]]);
        const stressVoigt = new Float64Array(6);
        for (let i = 0; i < 6; i++) {
          for (let j = 0; j < 6; j++) stressVoigt[i] += D[i * 6 + j] * strainVoigt[j];
        }

        const S = new Float64Array([
          stressVoigt[0], stressVoigt[3], stressVoigt[5],
          stressVoigt[3], stressVoigt[1], stressVoigt[4],
          stressVoigt[5], stressVoigt[4], stressVoigt[2],
        ]);

        const FS = new Float64Array(9);
        for (let i = 0; i < 3; i++) {
          for (let j = 0; j < 3; j++) {
            for (let k = 0; k < 3; k++) FS[i * 3 + j] += F[i * 3 + k] * S[k * 3 + j];
          }
        }

        for (let a = 0; a < 10; a++) {
          const n = nodes[a];
          for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
              f_int[n * 3 + i] += weight * FS[i * 3 + j] * dNdX[a * 3 + j];
            }
          }
        }
      }
    }
    return f_int;
  }

  /**
   * Assemble tangent stiffness matrix K_T = K_material + K_geometric.
   *
   * K_material: standard BᵀDB (same as linear, but B evaluated at deformed config)
   * K_geometric: accounts for stress stiffening/softening under large deformation
   *   K_G[ab] = δᵢⱼ Σ_gp (w · |J| · Σ_kl dNa/dXk · S_kl · dNb/dXl)
   */
  private assembleTangentStiffness(): void {
    // Re-assemble material stiffness at current deformed configuration
    this.assembleGlobalStiffness();

    // Add geometric stiffness contribution K_G from current stress state
    if (!this.nonlinear) return;

    const tets = this.config.tetrahedra;
    const verts = this.config.vertices;
    const { youngs_modulus: E, poisson_ratio: nu } = this.material;
    const lambda = (E * nu) / ((1 + nu) * (1 - 2 * nu));
    const mu = E / (2 * (1 + nu));

    for (let e = 0; e < this.elementCount; e++) {
      const base = e * 10;
      const nodes = Array.from({ length: 10 }, (_, i) => tets[base + i]);

      for (let gp = 0; gp < 4; gp++) {
        const [xi, eta, zeta] = GAUSS_POINTS[gp];
        const dNnat = shapeFunctionGradients(xi, eta, zeta);

        // Jacobian
        const J = new Float64Array(9);
        for (let a = 0; a < 10; a++) {
          const n = nodes[a];
          for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
              J[i * 3 + j] += dNnat[a * 3 + j] * verts[n * 3 + i];
            }
          }
        }

        const detJ = J[0] * (J[4] * J[8] - J[5] * J[7]) - J[1] * (J[3] * J[8] - J[5] * J[6]) + J[2] * (J[3] * J[7] - J[4] * J[6]);
        if (Math.abs(detJ) < 1e-30) continue;

        const Ji = this.invert3x3(J);
        const weight = GAUSS_W * Math.abs(detJ) / 6;

        // Physical gradients dN/dX
        const dNdX = new Float64Array(30);
        for (let a = 0; a < 10; a++) {
          for (let i = 0; i < 3; i++) {
            let sum = 0;
            for (let j = 0; j < 3; j++) sum += dNnat[a * 3 + j] * Ji[j * 3 + i];
            dNdX[a * 3 + i] = sum;
          }
        }

        // Compute 2nd Piola-Kirchhoff stress S from current displacements
        const F = new Float64Array(9);
        F[0] = 1; F[4] = 1; F[8] = 1; // identity
        for (let a = 0; a < 10; a++) {
          const n = nodes[a];
          for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
              F[i * 3 + j] += this.displacements[n * 3 + i] * dNdX[a * 3 + j];
            }
          }
        }

        // Green-Lagrange strain: E = 0.5(FᵀF - I)
        const Egl = new Float64Array(6); // Voigt
        Egl[0] = 0.5 * (F[0] * F[0] + F[3] * F[3] + F[6] * F[6] - 1);
        Egl[1] = 0.5 * (F[1] * F[1] + F[4] * F[4] + F[7] * F[7] - 1);
        Egl[2] = 0.5 * (F[2] * F[2] + F[5] * F[5] + F[8] * F[8] - 1);
        Egl[3] = F[0] * F[1] + F[3] * F[4] + F[6] * F[7];
        Egl[4] = F[1] * F[2] + F[4] * F[5] + F[7] * F[8];
        Egl[5] = F[0] * F[2] + F[3] * F[5] + F[6] * F[8];

        // S = D * E (St. Venant-Kirchhoff)
        const D = this.D;
        const S = new Float64Array(9);
        const Sv = new Float64Array(6);
        for (let i = 0; i < 6; i++) {
          for (let j = 0; j < 6; j++) Sv[i] += D[i * 6 + j] * Egl[j];
        }
        S[0] = Sv[0]; S[1] = Sv[3]; S[2] = Sv[5];
        S[3] = Sv[3]; S[4] = Sv[1]; S[5] = Sv[4];
        S[6] = Sv[5]; S[7] = Sv[4]; S[8] = Sv[2];

        // Add K_G: for each pair (a,b), K_G[3a+i, 3b+i] += Σ_kl dNa/dXk * S_kl * dNb/dXl
        for (let a = 0; a < 10; a++) {
          const na = nodes[a];
          const rowMap = this.dofToCSR.get(na * 3);
          if (!rowMap) continue;

          for (let b = 0; b < 10; b++) {
            const nb = nodes[b];

            // Scalar geometric stiffness: Σ_kl dNa/dXk * S_kl * dNb/dXl
            let kgScalar = 0;
            for (let k = 0; k < 3; k++) {
              for (let l = 0; l < 3; l++) {
                kgScalar += dNdX[a * 3 + k] * S[k * 3 + l] * dNdX[b * 3 + l];
              }
            }
            kgScalar *= weight;

            // Add to diagonal blocks (K_G only contributes to diagonal i==j)
            for (let d = 0; d < 3; d++) {
              const globalI = na * 3 + d;
              const globalJ = nb * 3 + d;
              const rm = this.dofToCSR.get(globalI);
              if (!rm) continue;
              const idx = rm.get(globalJ);
              if (idx !== undefined) {
                this.csrVal[idx] += kgScalar;
              }
            }
          }
        }
      }
    }
  }

  /**
   * Add a light diagonal regularization to unconstrained DOFs in tangent matrix
   * to reduce near-singular NR steps in early nonlinear iterations.
   */
  private regularizeTangentStiffness(): void {
    let maxDiag = 0;

    for (let row = 0; row < this.dofCount; row++) {
      const rowMap = this.dofToCSR.get(row);
      if (!rowMap) continue;
      const diagIdx = rowMap.get(row);
      if (diagIdx === undefined) continue;
      const d = Math.abs(this.csrVal[diagIdx]);
      if (Number.isFinite(d) && d > maxDiag) maxDiag = d;
    }

    if (maxDiag <= 0) return;

    const epsilon = Math.max(1e-9 * maxDiag, 1e-6);

    for (let row = 0; row < this.dofCount; row++) {
      if (this.constrainedDofs.has(row)) continue;
      const rowMap = this.dofToCSR.get(row);
      if (!rowMap) continue;
      const diagIdx = rowMap.get(row);
      if (diagIdx === undefined) continue;
      this.csrVal[diagIdx] += epsilon;
    }
  }

  /** Alias for backward compatibility with StructuralSolver interface */
  private assembleStiffness(): void {
    this.assembleGlobalStiffness();
  }

  /** Wrapper for linear solvers (CPU or GPU) */
  private async solveLinearSystem(rhs: Float64Array): Promise<{ converged: boolean; iterations: number; solution: Float64Array }> {
    if (this.useGPU) {
      const gpuResult = await this.solveGPU(rhs);
      if (gpuResult) {
        // Read back if needed by the NR loop, though ideally we'd stay on GPU
        const solution = await this.readbackGPUDisplacements();
        return {
          converged: gpuResult.converged,
          iterations: gpuResult.iterations,
          solution: solution,
        };
      }
    }
    
    // Matrix-free CG wrapper for the current global stiffness CSR matrix
    const applyA = (p: Float64Array, out: Float64Array) => {
      this.multiplyStiffness(p, out);
    };

    const x = new Float64Array(this.dofCount);
    const result = this.localConjugateGradient(applyA, rhs, x, this.maxIterations, this.tolerance);
    
    return {
      converged: result.converged,
      iterations: result.iterations,
      solution: result.solution,
    };
  }

  private async readbackGPUDisplacements(): Promise<Float64Array> {
    if (!this.gpuDisplacementBuffer || !this.gpuSolver) return new Float64Array(this.dofCount);
    const f32 = await this.gpuSolver.readback(this.gpuDisplacementBuffer, this.dofCount);
    return new Float64Array(f32);
  }

  private multiplyStiffness(x: Float64Array, out: Float64Array): void {
    out.fill(0);
    for (let i = 0; i < this.dofCount; i++) {
      for (let k = this.csrRowPtr[i]; k < this.csrRowPtr[i + 1]; k++) {
        out[i] += this.csrVal[k] * x[this.csrColInd[k]];
      }
    }
  }

  private localConjugateGradient(
    applyA: (x: Float64Array, out: Float64Array) => void,
    b: Float64Array,
    x: Float64Array,
    maxIter: number,
    tol: number,
  ): { converged: boolean; iterations: number; solution: Float64Array } {
    const n = b.length;
    const r = new Float64Array(n);
    const p = new Float64Array(n);
    const Ap = new Float64Array(n);
    
    applyA(x, Ap);
    for (let i = 0; i < n; i++) r[i] = b[i] - Ap[i];
    p.set(r);
    
    let rsold = this.dot(r, r);
    const bNorm = Math.sqrt(this.dot(b, b));

    if (!Number.isFinite(rsold)) {
      return { converged: false, iterations: 0, solution: x };
    }
    
    let iter = 0;
    for (iter = 0; iter < maxIter; iter++) {
      applyA(p, Ap);
      const denom = this.dot(p, Ap);
      if (!Number.isFinite(denom) || Math.abs(denom) < 1e-30) {
        return { converged: false, iterations: iter, solution: x };
      }

      const alpha = rsold / denom;
      if (!Number.isFinite(alpha)) {
        return { converged: false, iterations: iter, solution: x };
      }

      for (let i = 0; i < n; i++) {
        x[i] += alpha * p[i];
        r[i] -= alpha * Ap[i];
      }
      const rsnew = this.dot(r, r);
      if (!Number.isFinite(rsnew)) {
        return { converged: false, iterations: iter, solution: x };
      }
      if (Math.sqrt(rsnew) < Math.max(tol * bNorm, 1e-15)) break;
      for (let i = 0; i < n; i++) p[i] = r[i] + (rsnew / rsold) * p[i];
      rsold = rsnew;
    }
    
    return { converged: iter < maxIter, iterations: iter, solution: x };
  }

  private dot(a: Float64Array, b: Float64Array): number {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;
  }

  /** Internal GPU solve path using SparseLinearSolver */
  private async solveGPU(rhs: Float64Array): Promise<ConvergenceResult | null> {
    try {
      const context = getGlobalWebGPUContext();
      await context.initialize();
      if (!context.isSupported()) return null;

      if (!this.gpuSolver) {
        this.gpuSolver = new SparseLinearSolver(context);
        await this.gpuSolver.initialize();
      }

      const result = await this.gpuSolver.solveCGDirect(
        this.stiffnessMatrix,
        new Float32Array(rhs),
        new Float32Array(this.displacements),
        { 
          maxIterations: this.maxIterations, 
          toleranceSq: this.tolerance * this.tolerance,
          xExtraUsage: GPUBufferUsage.VERTEX // Crucial for zero-copy rendering
        }
      );

      if (this.gpuDisplacementBuffer) this.gpuDisplacementBuffer.destroy();
      this.gpuDisplacementBuffer = result.xBuffer;

      // Sync displacements for stress recovery
      const f32 = await this.gpuSolver.readback(this.gpuDisplacementBuffer, this.dofCount);
      this.displacements.set(f32);

      return {
        converged: result.converged,
        iterations: result.iterations,
        residual: Math.sqrt(result.residualNormSq),
        maxChange: 0,
      };
    } catch (err) {
      console.error('GPU Solve failed:', err);
      return null;
    }
  }

  public async solve(): Promise<ConvergenceResult> {
    if (this.nonlinear) return await this.solveNonlinear();
    const t0 = performance.now();

    // Apply constraints
    this.applyConstraintsToCSR();
    const rhs = new Float64Array(this.externalForces);
    for (const dof of this.constrainedDofs) rhs[dof] = 0;
    this.displacements.fill(0);

    // Try GPU path
    if (this.useGPU) {
      const gpuResult = await this.solveGPU(rhs);
      if (gpuResult) {
        this.solveResult = gpuResult;
        this.useGPU = true;
        this.recoverStress();
        this.solveTimeMs = performance.now() - t0;
        return this.solveResult;
      }
    }

    // CPU fallback
    this.solveResult = this.solveCPU(rhs);
    this.useGPU = false;
    this.recoverStress();
    this.solveTimeMs = performance.now() - t0;
    return this.solveResult;
  }

  /**
   * Synchronous CPU-only solve (for environments without WebGPU).
   */
  solveCPU(rhs?: Float64Array): ConvergenceResult {
    const t0 = performance.now();
    const needsSetup = !rhs;

    if (needsSetup) {
      this.applyConstraintsToCSR();
      rhs = new Float64Array(this.externalForces);
      for (const dof of this.constrainedDofs) {
        rhs[dof] = 0;
      }
      this.displacements.fill(0);
    }

    // Matrix-vector product using CSR
    const applyK = (x: Float32Array, out: Float32Array): void => {
      out.fill(0);
      for (let row = 0; row < this.dofCount; row++) {
        let sum = 0;
        const start = this.csrRowPtr[row];
        const end = this.csrRowPtr[row + 1];
        for (let idx = start; idx < end; idx++) {
          sum += this.csrVal[idx] * x[this.csrColInd[idx]];
        }
        out[row] = sum;
      }
    };

    // Extract diagonal for Jacobi preconditioning
    const diagK = new Float32Array(this.dofCount);
    for (let row = 0; row < this.dofCount; row++) {
      const start = this.csrRowPtr[row];
      const end = this.csrRowPtr[row + 1];
      for (let idx = start; idx < end; idx++) {
        if (this.csrColInd[idx] === row) {
          diagK[row] = this.csrVal[idx];
          break;
        }
      }
    }

    // Convert to Float32 for CPU CG (it uses Float32Array)
    const rhs32 = new Float32Array(rhs!);
    const x32 = new Float32Array(this.displacements);

    const result = conjugateGradient(
      applyK,
      rhs32,
      x32,
      this.config.maxIterations ?? 2000,
      this.config.tolerance ?? 1e-10,
      diagK,
      1e-14,
    );

    // Copy solution back to Float64
    for (let i = 0; i < this.dofCount; i++) {
      this.displacements[i] = x32[i];
    }

    if (needsSetup) {
      for (const dof of this.constrainedDofs) {
        this.displacements[dof] = 0;
      }
      this.recoverStress();
      this.solveTimeMs = performance.now() - t0;
      this.solveResult = result;
      this.useGPU = false;
    }

    return result;
  }

  /**

      // Note: we still read back for scalar fields (VM Stress) if needed,
      // but we can skip readback for displacements if the renderer uses this buffer.
      const solution = await solver.readback(gpuResult.xBuffer, this.dofCount);

      solver.destroy();

      // Copy solution to Float64
      for (let i = 0; i < this.dofCount; i++) {
        this.displacements[i] = solution[i];
      }

      return {
        converged: gpuResult.converged,
        iterations: gpuResult.iterations,
        residual: Math.sqrt(gpuResult.residualNormSq),
        maxChange: 0,
      };
    } catch {
      // GPU unavailable — fall through to CPU
      return null;
    }
  }

  /**
   * Apply Dirichlet constraints to the CSR matrix.
   * Constrained rows become identity rows (diagonal = 1, off-diagonals = 0).
   * Corresponding columns are also zeroed for symmetry preservation.
   */
  private applyConstraintsToCSR(): void {
    for (const dof of this.constrainedDofs) {
      // Zero out the entire row, set diagonal to 1
      const start = this.csrRowPtr[dof];
      const end = this.csrRowPtr[dof + 1];
      for (let idx = start; idx < end; idx++) {
        if (this.csrColInd[idx] === dof) {
          this.csrVal[idx] = 1.0;
        } else {
          this.csrVal[idx] = 0.0;
        }
      }

      // Zero out the corresponding column entries (for symmetry)
      // This is expensive for CSR — in production you'd use a flag array.
      // For correctness, we iterate affected rows.
      for (let row = 0; row < this.dofCount; row++) {
        if (this.constrainedDofs.has(row)) continue;
        const rowMap = this.dofToCSR.get(row);
        if (!rowMap) continue;
        const idx = rowMap.get(dof);
        if (idx !== undefined) {
          this.csrVal[idx] = 0.0;
        }
      }
    }
  }

  /**
   * Recover Von Mises stress per element, averaged over Gauss points.
   * Stresses at Gauss points are superconvergent for TET10.
   * Also stores per-Gauss-point stress and coordinates for SPR recovery.
   */
  private recoverStress(): void {
    const tets = this.config.tetrahedra;
    const verts = this.config.vertices;
    const D = this.D;
    const Sy = this.material.yield_strength;

    this.cauchyStress.fill(0);
    this.gaussPointStress.fill(0);
    this.gaussPointCoords.fill(0);

    for (let e = 0; e < this.elementCount; e++) {
      const base = e * 10;

      // Accumulate Von Mises over Gauss points
      let vmSum = 0;
      let gpCount = 0;

      for (let gp = 0; gp < 4; gp++) {
        const [xi, eta, zeta] = GAUSS_POINTS[gp];
        const dNnat = shapeFunctionGradients(xi, eta, zeta);

        // Jacobian
        const J = new Float64Array(9);
        for (let a = 0; a < 10; a++) {
          const n = tets[base + a];
          for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
              J[i * 3 + j] += dNnat[a * 3 + j] * verts[n * 3 + i];
            }
          }
        }

        const detJ =
          J[0] * (J[4] * J[8] - J[5] * J[7]) -
          J[1] * (J[3] * J[8] - J[5] * J[6]) +
          J[2] * (J[3] * J[7] - J[4] * J[6]);

        if (Math.abs(detJ) < 1e-30) continue;

        const invDetJ = 1 / detJ;
        const Ji = new Float64Array(9);
        Ji[0] = (J[4] * J[8] - J[5] * J[7]) * invDetJ;
        Ji[1] = (J[2] * J[7] - J[1] * J[8]) * invDetJ;
        Ji[2] = (J[1] * J[5] - J[2] * J[4]) * invDetJ;
        Ji[3] = (J[5] * J[6] - J[3] * J[8]) * invDetJ;
        Ji[4] = (J[0] * J[8] - J[2] * J[6]) * invDetJ;
        Ji[5] = (J[2] * J[3] - J[0] * J[5]) * invDetJ;
        Ji[6] = (J[3] * J[7] - J[4] * J[6]) * invDetJ;
        Ji[7] = (J[1] * J[6] - J[0] * J[7]) * invDetJ;
        Ji[8] = (J[0] * J[4] - J[1] * J[3]) * invDetJ;

        // Physical gradients
        const dNphys = new Float64Array(30);
        for (let a = 0; a < 10; a++) {
          for (let i = 0; i < 3; i++) {
            let sum = 0;
            for (let j = 0; j < 3; j++) {
              sum += dNnat[a * 3 + j] * Ji[j * 3 + i];
            }
            dNphys[a * 3 + i] = sum;
          }
        }

        // Compute strain = B · u at this Gauss point
        const strain = new Float64Array(6);
        for (let a = 0; a < 10; a++) {
          const n = tets[base + a];
          const dnx = dNphys[a * 3], dny = dNphys[a * 3 + 1], dnz = dNphys[a * 3 + 2];
          const ux = this.displacements[n * 3];
          const uy = this.displacements[n * 3 + 1];
          const uz = this.displacements[n * 3 + 2];
          strain[0] += dnx * ux;
          strain[1] += dny * uy;
          strain[2] += dnz * uz;
          strain[3] += dny * ux + dnx * uy;
          strain[4] += dnz * uy + dny * uz;
          strain[5] += dnz * ux + dnx * uz;
        }

        // Compute stress = D · strain
        const stress = new Float64Array(6);
        for (let i = 0; i < 6; i++) {
          for (let j = 0; j < 6; j++) {
            stress[i] += D[i * 6 + j] * strain[j];
          }
        }

        // Store per-Gauss-point stress for SPR recovery
        const gpIdx = e * 4 + gp;
        for (let c = 0; c < 6; c++) {
          this.gaussPointStress[gpIdx * 6 + c] = stress[c];
        }

        // Store physical coordinates of this Gauss point via TET10 shape functions.
        // N_i for 10-node tet: corner nodes = Li(2Li-1), midside = 4*Li*Lj
        const L1 = 1 - xi - eta - zeta, L2 = xi, L3 = eta, L4 = zeta;
        const Nvals = [
          L1 * (2 * L1 - 1), L2 * (2 * L2 - 1), L3 * (2 * L3 - 1), L4 * (2 * L4 - 1),
          4 * L1 * L2, 4 * L2 * L3, 4 * L1 * L3,
          4 * L1 * L4, 4 * L2 * L4, 4 * L3 * L4,
        ];
        let gpx = 0, gpy = 0, gpz = 0;
        for (let a = 0; a < 10; a++) {
          const n = tets[base + a];
          gpx += Nvals[a] * verts[n * 3];
          gpy += Nvals[a] * verts[n * 3 + 1];
          gpz += Nvals[a] * verts[n * 3 + 2];
        }
        this.gaussPointCoords[gpIdx * 3] = gpx;
        this.gaussPointCoords[gpIdx * 3 + 1] = gpy;
        this.gaussPointCoords[gpIdx * 3 + 2] = gpz;

        // Von Mises
        const sxx = stress[0], syy = stress[1], szz = stress[2];
        const txy = stress[3], tyz = stress[4], txz = stress[5];
        const vm = Math.sqrt(
          sxx * sxx + syy * syy + szz * szz -
          sxx * syy - syy * szz - szz * sxx +
          3 * (txy * txy + tyz * tyz + txz * txz),
        );

        vmSum += vm;
        gpCount++;

        // Accumulate Cauchy components for averaging
        this.cauchyStress[e * 6 + 0] += sxx;
        this.cauchyStress[e * 6 + 1] += syy;
        this.cauchyStress[e * 6 + 2] += szz;
        this.cauchyStress[e * 6 + 3] += txy;
        this.cauchyStress[e * 6 + 4] += tyz;
        this.cauchyStress[e * 6 + 5] += txz;
      }

      const avgVM = gpCount > 0 ? vmSum / gpCount : 0;
      this.vonMisesStress[e] = avgVM;
      if (gpCount > 0) {
        for (let c = 0; c < 6; c++) this.cauchyStress[e * 6 + c] /= gpCount;
      }
      this.safetyFactors[e] = Sy > 0 ? Sy / Math.max(avgVM, 1e-30) : Infinity;
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────

  getVonMisesStress(): Float64Array {
    return this.vonMisesStress;
  }

  /** Per-element Cauchy stress tensor averaged over Gauss points: [sxx,syy,szz,txy,tyz,txz] × elementCount */
  getCauchyStress(): Float64Array {
    return this.cauchyStress;
  }

  /**
   * Per-Gauss-point stress data for SPR recovery.
   * Layout: (elementCount × 4) × 6 components.
   * Access: result[(e * 4 + gp) * 6 + component]
   * Components: 0=sxx, 1=syy, 2=szz, 3=txy, 4=tyz, 5=txz
   */
  getGaussPointStress(): Float64Array {
    return this.gaussPointStress;
  }

  /**
   * Physical coordinates of each Gauss point.
   * Layout: (elementCount × 4) × 3.
   * Access: result[(e * 4 + gp) * 3 + axis]
   */
  getGaussPointCoords(): Float64Array {
    return this.gaussPointCoords;
  }

  getSafetyFactor(): Float64Array {
    return this.safetyFactors;
  }

  getDisplacements(): Float64Array {
    return this.displacements;
  }

  getExternalForces(): Float64Array {
    return this.externalForces;
  }

  getCSRMatrix(): CSRMatrix {
    return {
      val: new Float32Array(this.csrVal),
      col_ind: this.csrColInd,
      row_ptr: this.csrRowPtr,
      num_rows: this.dofCount,
    };
  }

  getStats(): TET10Stats {
    let maxVM = 0, minSF = Infinity;
    for (let e = 0; e < this.elementCount; e++) {
      if (this.vonMisesStress[e] > maxVM) maxVM = this.vonMisesStress[e];
      if (this.safetyFactors[e] < minSF) minSF = this.safetyFactors[e];
    }
    return {
      nodeCount: this.nodeCount,
      elementCount: this.elementCount,
      dofCount: this.dofCount,
      nnz: this.nnz,
      maxVonMises: maxVM,
      minSafetyFactor: minSF,
      solveResult: this.solveResult,
      solveTimeMs: this.solveTimeMs,
      useGPU: this.useGPU,
    };
  }

  getDisplacementBuffer(): GPUBuffer | null {
    return this.gpuDisplacementBuffer;
  }
 
  dispose(): void {
    this.csrVal = new Float64Array(0);
    this.dofToCSR.clear();
  }
}

// ── Mesh Generation Utility ───────────────────────────────────────────────────

/**
 * Convert a TET4 mesh to TET10 by inserting mid-edge nodes.
 * Takes flat vertex and tet arrays, returns new arrays with mid-edge nodes added.
 */
export function tet4ToTet10(
  vertices: Float64Array | Float32Array,
  tetrahedra: Uint32Array,
): { vertices: Float64Array; tetrahedra: Uint32Array } {
  const nodeCount = vertices.length / 3;
  const elemCount = tetrahedra.length / 4;

  // Track mid-edge nodes: edge key → node index
  const edgeMap = new Map<string, number>();
  const newVerts: number[] = Array.from(vertices);
  let nextNode = nodeCount;

  function edgeKey(a: number, b: number): string {
    return a < b ? `${a}_${b}` : `${b}_${a}`;
  }

  function getOrCreateMidNode(a: number, b: number): number {
    const key = edgeKey(a, b);
    let mid = edgeMap.get(key);
    if (mid !== undefined) return mid;

    mid = nextNode++;
    edgeMap.set(key, mid);

    // Midpoint coordinates
    newVerts.push(
      (vertices[a * 3] + vertices[b * 3]) / 2,
      (vertices[a * 3 + 1] + vertices[b * 3 + 1]) / 2,
      (vertices[a * 3 + 2] + vertices[b * 3 + 2]) / 2,
    );

    return mid;
  }

  const newTets: number[] = [];

  for (let e = 0; e < elemCount; e++) {
    const n0 = tetrahedra[e * 4], n1 = tetrahedra[e * 4 + 1];
    const n2 = tetrahedra[e * 4 + 2], n3 = tetrahedra[e * 4 + 3];

    // Mid-edge nodes (following our convention)
    const m01 = getOrCreateMidNode(n0, n1); // node 4
    const m12 = getOrCreateMidNode(n1, n2); // node 5
    const m02 = getOrCreateMidNode(n0, n2); // node 6
    const m03 = getOrCreateMidNode(n0, n3); // node 7
    const m13 = getOrCreateMidNode(n1, n3); // node 8
    const m23 = getOrCreateMidNode(n2, n3); // node 9

    newTets.push(n0, n1, n2, n3, m01, m12, m02, m03, m13, m23);
  }

  return {
    vertices: new Float64Array(newVerts),
    tetrahedra: new Uint32Array(newTets),
  };
}
