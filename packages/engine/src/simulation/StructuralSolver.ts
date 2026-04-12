/**
 * StructuralSolver — Linear elastic FEM with tetrahedral elements.
 *
 * ## Mathematical Formulation
 *
 * **Governing equation** (static linear elasticity):
 *
 *   ∇·σ + b = 0  (equilibrium)
 *   σ = C:ε       (Hooke's law)
 *   ε = ½(∇u + ∇uᵀ)  (small strain)
 *
 * where:
 *   σ = Cauchy stress tensor [Pa]
 *   ε = infinitesimal strain tensor [-]
 *   u = displacement field [m]
 *   b = body force density [N/m³]
 *   C = 4th-order elasticity tensor (isotropic: parameterized by E, ν)
 *
 * **Weak form** (principle of virtual work):
 *   ∫_Ω ε(δu):C:ε(u) dΩ = ∫_Ω δu·b dΩ + ∫_Γ δu·t dΓ
 *
 * ## Element Formulation
 *
 * **Element type**: 4-node linear tetrahedron (TET4, constant strain).
 * **Shape functions**: N_i = a_i + b_i·x + c_i·y + d_i·z (linear).
 * **Strain-displacement matrix B**: Constant within each element (3 per node, 12 DOFs per tet).
 * **Element stiffness**: Kₑ = V · Bᵀ · D · B (single-point integration, exact for constant strain).
 *
 * **Material matrix D** (3D isotropic, Voigt notation):
 *   D = E/((1+ν)(1-2ν)) * [1-ν, ν, ν, 0, 0, 0; ν, 1-ν, ν, 0, 0, 0; ...]
 *
 * ## Assembly & Solution
 *
 * **Assembly**: Matrix-free approach. Element stiffness matrices are stored
 * and the global matrix-vector product K*x is computed by summing element
 * contributions (avoids assembling sparse K explicitly).
 *
 * **Solver**: Preconditioned Conjugate Gradient (PCG).
 * - Preconditioner: Jacobi (diagonal of K)
 * - Convergence: relative residual tolerance with absolute floor
 *
 * **Constraints**: 'fixed' and 'pinned' both constrain all 3 translational DOFs.
 * Note: Linear tetrahedra have no rotational DOFs, so pinned = fixed.
 *
 * ## Stress Recovery
 *
 * **Von Mises stress** (element-wise):
 *   σ_VM = √(½[(σ₁-σ₂)² + (σ₂-σ₃)² + (σ₃-σ₁)²])
 *
 * **Safety factor**: F_s = σ_yield / σ_VM (per element)
 *
 * ## Convergence Characteristics
 *
 * - Linear tets: O(h) for displacements, O(1) for stresses (constant strain)
 * - Mesh locking possible for near-incompressible materials (ν → 0.5)
 *
 * ## Known Limitations
 *
 * - Linear elasticity only (no plasticity, no geometric nonlinearity)
 * - No contact mechanics
 * - No dynamics (static equilibrium only)
 * - No beam/shell elements (solid tets only)
 * - Constant-strain elements underperform quadratic tets for bending
 *
 * ## References
 *
 * - Bathe, K.J., "Finite Element Procedures", Prentice Hall, 1996
 * - Hughes, T.J.R., "The Finite Element Method", Dover, 2000
 * - Zienkiewicz & Taylor, "The Finite Element Method", Vol. 1, 7th ed.
 *
 * @see ConvergenceControl — CG solver with Jacobi preconditioning
 * @see MaterialDatabase — E, ν, σ_yield lookup
 */

import { conjugateGradient, type ConvergenceResult } from './ConvergenceControl';
import { getMaterial, type StructuralMaterial } from './MaterialDatabase';
import {
  type Force,
  type Pressure,
  type Acceleration,
  acceleration,
} from './units/PhysicalQuantity';

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * For linear tetrahedral elements (which lack rotational degrees of freedom),
 * a 'pinned' constraint is mathematically identical to a 'fixed' constraint.
 * Both prevent all translational motion at the specified nodes.
 */
export type ConstraintType = 'fixed' | 'pinned';

export interface StructuralConstraint {
  id: string;
  type: ConstraintType;
  /** Node indices that are constrained */
  nodes: number[];
}

export type LoadType = 'gravity' | 'point' | 'distributed';

export interface StructuralLoad {
  id: string;
  type: LoadType;
  /** Force vector [fx, fy, fz] in N */
  force?: [Force, Force, Force];
  /** Acceleration [ax, ay, az] for gravity loads */
  acceleration?: [Acceleration, Acceleration, Acceleration];
  /** Node index for point loads */
  nodeIndex?: number;
  /** Tetrahedron face indices for distributed loads */
  surfaceElements?: number[];
  /** Pressure in Pa for distributed loads */
  pressure?: Pressure;
}

export interface StructuralConfig {
  /** Vertex positions: flat [x0,y0,z0, x1,y1,z1, ...] */
  vertices: Float32Array;
  /** Tetrahedral element connectivity: flat [n0,n1,n2,n3, ...] 4 per tet */
  tetrahedra: Uint32Array;
  /** Material name or direct properties */
  material: string | StructuralMaterial;
  constraints: StructuralConstraint[];
  loads: StructuralLoad[];
  /** Max CG iterations (default 1000) */
  maxIterations?: number;
  /** CG convergence tolerance (default 1e-8) */
  tolerance?: number;
}

export interface StructuralStats {
  nodeCount: number;
  elementCount: number;
  maxVonMises: number;
  minSafetyFactor: number;
  solveResult: ConvergenceResult | null;
  solveTimeMs: number;
}

// ── Solver ────────────────────────────────────────────────────────────────────

export class StructuralSolver {
  private config: StructuralConfig;
  private material: StructuralMaterial;
  private nodeCount: number;
  private elementCount: number;
  private dofCount: number; // 3 DOF per node

  private displacements: Float32Array;
  private forces: Float32Array;
  private vonMisesStress: Float32Array; // per-element
  private safetyFactors: Float32Array; // per-element
  private constrainedDofs: Set<number>;

  // Sparse stiffness: CSR-like via element assembly
  private elementStiffness: Float64Array[]; // 12×12 per element

  private solveResult: ConvergenceResult | null = null;
  private solveTimeMs = 0;

  constructor(config: StructuralConfig) {
    this.config = config;

    // Resolve material
    this.material =
      typeof config.material === 'string'
        ? (getMaterial(config.material) as StructuralMaterial)
        : config.material;

    this.nodeCount = config.vertices.length / 3;
    this.elementCount = config.tetrahedra.length / 4;
    this.dofCount = this.nodeCount * 3;

    this.displacements = new Float32Array(this.dofCount);
    this.forces = new Float32Array(this.dofCount);
    this.vonMisesStress = new Float32Array(this.elementCount);
    this.safetyFactors = new Float32Array(this.elementCount);
    this.elementStiffness = [];

    // Build constrained DOF set
    this.constrainedDofs = new Set<number>();
    for (const c of config.constraints) {
      for (const n of c.nodes) {
        if (c.type === 'fixed' || c.type === 'pinned') {
          // Note: Linear tetrahedral elements only have translational DOFs (3 per node, no rotational DOFs).
          // Therefore, 'pinned' and 'fixed' constraints are mathematically identical in this solver.
          this.constrainedDofs.add(n * 3);
          this.constrainedDofs.add(n * 3 + 1);
          this.constrainedDofs.add(n * 3 + 2);
        }
      }
    }

    // Assemble element stiffness matrices
    this.assembleStiffness();

    // Assemble force vector
    this.assembleForces();
  }

  /**
   * Solve the static equilibrium Ku = f.
   */
  solve(): ConvergenceResult {
    const t0 = performance.now();

    // Matrix-free K*x via element assembly
    const applyK = (x: Float32Array, out: Float32Array): void => {
      out.fill(0);
      const tets = this.config.tetrahedra;

      for (let e = 0; e < this.elementCount; e++) {
        const ke = this.elementStiffness[e];
        const nodes = [tets[e * 4], tets[e * 4 + 1], tets[e * 4 + 2], tets[e * 4 + 3]];

        // Gather element DOFs
        for (let a = 0; a < 4; a++) {
          for (let ai = 0; ai < 3; ai++) {
            const globalI = nodes[a] * 3 + ai;
            const localI = a * 3 + ai;

            let sum = 0;
            for (let b = 0; b < 4; b++) {
              for (let bi = 0; bi < 3; bi++) {
                const globalJ = nodes[b] * 3 + bi;
                const localJ = b * 3 + bi;
                sum += ke[localI * 12 + localJ] * x[globalJ];
              }
            }
            out[globalI] += sum;
          }
        }
      }

      // Enforce constraints via projection: constrained DOFs act as identity rows.
      // Combined with rhs[dof]=0, CG drives constrained displacements to zero.
      for (const dof of this.constrainedDofs) {
        out[dof] = x[dof];
      }
    };

    // Compute diagonal of K for Jacobi preconditioning
    const diagK = new Float32Array(this.dofCount);
    const tets = this.config.tetrahedra;
    for (let e = 0; e < this.elementCount; e++) {
      const ke = this.elementStiffness[e];
      const nodes = [tets[e * 4], tets[e * 4 + 1], tets[e * 4 + 2], tets[e * 4 + 3]];
      for (let a = 0; a < 4; a++) {
        for (let ai = 0; ai < 3; ai++) {
          const globalI = nodes[a] * 3 + ai;
          const localI = a * 3 + ai;
          diagK[globalI] += ke[localI * 12 + localI];
        }
      }
    }

    // Modify RHS and Preconditioner for constrained DOFs
    const rhs = new Float32Array(this.forces);
    for (const dof of this.constrainedDofs) {
      rhs[dof] = 0;
      diagK[dof] = 1.0; // identity for constrained rows
    }

    this.displacements.fill(0);

    this.solveResult = conjugateGradient(
      applyK,
      rhs,
      this.displacements,
      this.config.maxIterations ?? 1000,
      this.config.tolerance ?? 1e-8,
      diagK,
      1e-12
    );

    // Zero out constrained DOFs
    for (const dof of this.constrainedDofs) {
      this.displacements[dof] = 0;
    }

    // Recover stresses
    this.recoverStress();

    this.solveTimeMs = performance.now() - t0;
    return this.solveResult;
  }

  /**
   * Assemble element stiffness matrices using linear tetrahedral elements.
   * Ke = V * Bᵀ * D * B where B is the strain-displacement matrix.
   */
  private assembleStiffness(): void {
    const verts = this.config.vertices;
    const tets = this.config.tetrahedra;
    const { youngs_modulus: E, poisson_ratio: nu } = this.material;

    // Constitutive matrix D for 3D isotropic linear elasticity (6×6 Voigt)
    const lambda = (E * nu) / ((1 + nu) * (1 - 2 * nu));
    const mu = E / (2 * (1 + nu));
    const D = new Float64Array(36); // 6×6
    D[0] = D[7] = D[14] = lambda + 2 * mu;
    D[1] = D[2] = D[6] = D[8] = D[12] = D[13] = lambda;
    D[21] = D[28] = D[35] = mu;

    this.elementStiffness = new Array(this.elementCount);

    for (let e = 0; e < this.elementCount; e++) {
      const n0 = tets[e * 4], n1 = tets[e * 4 + 1];
      const n2 = tets[e * 4 + 2], n3 = tets[e * 4 + 3];

      // Vertex positions
      const x0 = verts[n0 * 3], y0 = verts[n0 * 3 + 1], z0 = verts[n0 * 3 + 2];
      const x1 = verts[n1 * 3], y1 = verts[n1 * 3 + 1], z1 = verts[n1 * 3 + 2];
      const x2 = verts[n2 * 3], y2 = verts[n2 * 3 + 1], z2 = verts[n2 * 3 + 2];
      const x3 = verts[n3 * 3], y3 = verts[n3 * 3 + 1], z3 = verts[n3 * 3 + 2];

      // Jacobian of isoparametric mapping
      const J = [
        x1 - x0, y1 - y0, z1 - z0,
        x2 - x0, y2 - y0, z2 - z0,
        x3 - x0, y3 - y0, z3 - z0,
      ];

      const detJ =
        J[0] * (J[4] * J[8] - J[5] * J[7]) -
        J[1] * (J[3] * J[8] - J[5] * J[6]) +
        J[2] * (J[3] * J[7] - J[4] * J[6]);

      const V = Math.abs(detJ) / 6; // tetrahedron volume

      if (V < 1e-20) {
        this.elementStiffness[e] = new Float64Array(144);
        continue;
      }

      // Inverse Jacobian
      const invDetJ = 1 / detJ;
      const Ji = [
        (J[4] * J[8] - J[5] * J[7]) * invDetJ,
        (J[2] * J[7] - J[1] * J[8]) * invDetJ,
        (J[1] * J[5] - J[2] * J[4]) * invDetJ,
        (J[5] * J[6] - J[3] * J[8]) * invDetJ,
        (J[0] * J[8] - J[2] * J[6]) * invDetJ,
        (J[2] * J[3] - J[0] * J[5]) * invDetJ,
        (J[3] * J[7] - J[4] * J[6]) * invDetJ,
        (J[1] * J[6] - J[0] * J[7]) * invDetJ,
        (J[0] * J[4] - J[1] * J[3]) * invDetJ,
      ];

      // Shape function gradients (constant in linear tet)
      // dN/dx for nodes 1,2,3 (node 0 is derived: dN0 = -sum of others)
      const dN = new Float64Array(12); // 4 nodes × 3 components
      dN[3] = Ji[0]; dN[4] = Ji[1]; dN[5] = Ji[2]; // node 1
      dN[6] = Ji[3]; dN[7] = Ji[4]; dN[8] = Ji[5]; // node 2
      dN[9] = Ji[6]; dN[10] = Ji[7]; dN[11] = Ji[8]; // node 3
      dN[0] = -(dN[3] + dN[6] + dN[9]);   // node 0
      dN[1] = -(dN[4] + dN[7] + dN[10]);
      dN[2] = -(dN[5] + dN[8] + dN[11]);

      // B matrix (6×12): strain = B * u
      const B = new Float64Array(72); // 6 rows × 12 cols
      for (let a = 0; a < 4; a++) {
        const dnx = dN[a * 3], dny = dN[a * 3 + 1], dnz = dN[a * 3 + 2];
        const col = a * 3;
        B[0 * 12 + col] = dnx;                          // εxx
        B[1 * 12 + col + 1] = dny;                      // εyy
        B[2 * 12 + col + 2] = dnz;                      // εzz
        B[3 * 12 + col] = dny; B[3 * 12 + col + 1] = dnx; // γxy
        B[4 * 12 + col + 1] = dnz; B[4 * 12 + col + 2] = dny; // γyz
        B[5 * 12 + col] = dnz; B[5 * 12 + col + 2] = dnx; // γxz
      }

      // Ke = V * Bᵀ * D * B (12×12)
      const ke = new Float64Array(144);
      // First compute DB = D * B (6×12)
      const DB = new Float64Array(72);
      for (let i = 0; i < 6; i++) {
        for (let j = 0; j < 12; j++) {
          let sum = 0;
          for (let k = 0; k < 6; k++) {
            sum += D[i * 6 + k] * B[k * 12 + j];
          }
          DB[i * 12 + j] = sum;
        }
      }
      // Then Ke = V * Bᵀ * DB
      for (let i = 0; i < 12; i++) {
        for (let j = 0; j < 12; j++) {
          let sum = 0;
          for (let k = 0; k < 6; k++) {
            sum += B[k * 12 + i] * DB[k * 12 + j];
          }
          ke[i * 12 + j] = V * sum;
        }
      }

      this.elementStiffness[e] = ke;
    }
  }

  /**
   * Assemble the global force vector from loads.
   */
  private assembleForces(): void {
    this.forces.fill(0);
    const { density } = this.material;

    for (const load of this.config.loads) {
      switch (load.type) {
        case 'gravity': {
          const [ax, ay, az] = load.acceleration ?? [acceleration(0), acceleration(-9.81), acceleration(0)];
          // Distribute gravity force to all nodes
          // For simplicity: lumped mass (element volume / 4 per node)
          const tets = this.config.tetrahedra;
          const verts = this.config.vertices;
          for (let e = 0; e < this.elementCount; e++) {
            const nodes = [tets[e * 4], tets[e * 4 + 1], tets[e * 4 + 2], tets[e * 4 + 3]];
            // Compute element volume
            const n0 = nodes[0], n1 = nodes[1], n2 = nodes[2], n3 = nodes[3];
            const dx1 = verts[n1 * 3] - verts[n0 * 3], dy1 = verts[n1 * 3 + 1] - verts[n0 * 3 + 1], dz1 = verts[n1 * 3 + 2] - verts[n0 * 3 + 2];
            const dx2 = verts[n2 * 3] - verts[n0 * 3], dy2 = verts[n2 * 3 + 1] - verts[n0 * 3 + 1], dz2 = verts[n2 * 3 + 2] - verts[n0 * 3 + 2];
            const dx3 = verts[n3 * 3] - verts[n0 * 3], dy3 = verts[n3 * 3 + 1] - verts[n0 * 3 + 1], dz3 = verts[n3 * 3 + 2] - verts[n0 * 3 + 2];
            const vol = Math.abs(
              dx1 * (dy2 * dz3 - dz2 * dy3) -
              dy1 * (dx2 * dz3 - dz2 * dx3) +
              dz1 * (dx2 * dy3 - dy2 * dx3)
            ) / 6;

            const massPerNode = (density * vol) / 4;
            for (const n of nodes) {
              this.forces[n * 3] += massPerNode * ax;
              this.forces[n * 3 + 1] += massPerNode * ay;
              this.forces[n * 3 + 2] += massPerNode * az;
            }
          }
          break;
        }
        case 'point': {
          if (load.nodeIndex !== undefined && load.force) {
            const n = load.nodeIndex;
            this.forces[n * 3] += load.force[0];
            this.forces[n * 3 + 1] += load.force[1];
            this.forces[n * 3 + 2] += load.force[2];
          }
          break;
        }
        case 'distributed': {
          // Pressure load on surface elements (simplified: uniform on triangle faces)
          if (load.surfaceElements && load.pressure) {
            for (const faceIdx of load.surfaceElements) {
              // Each surface element is a triangle face of a tet
              const tets = this.config.tetrahedra;
              const verts = this.config.vertices;
              const n0 = tets[faceIdx * 4], n1 = tets[faceIdx * 4 + 1], n2 = tets[faceIdx * 4 + 2];
              // Triangle area and normal
              const ax = verts[n1 * 3] - verts[n0 * 3], ay = verts[n1 * 3 + 1] - verts[n0 * 3 + 1], az = verts[n1 * 3 + 2] - verts[n0 * 3 + 2];
              const bx = verts[n2 * 3] - verts[n0 * 3], by = verts[n2 * 3 + 1] - verts[n0 * 3 + 1], bz = verts[n2 * 3 + 2] - verts[n0 * 3 + 2];
              const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
              const area = 0.5 * Math.sqrt(nx * nx + ny * ny + nz * nz);
              if (area < 1e-20) continue;
              const scale = (load.pressure * area) / (3 * Math.sqrt(nx * nx + ny * ny + nz * nz));
              for (const n of [n0, n1, n2]) {
                this.forces[n * 3] += scale * nx;
                this.forces[n * 3 + 1] += scale * ny;
                this.forces[n * 3 + 2] += scale * nz;
              }
            }
          }
          break;
        }
      }
    }
  }

  /**
   * Recover Von Mises stress from displacements.
   * σ = D * B * u → Von Mises = √(σxx²+σyy²+σzz²-σxx·σyy-σyy·σzz-σzz·σxx+3(τxy²+τyz²+τxz²))
   */
  private recoverStress(): void {
    const tets = this.config.tetrahedra;
    const verts = this.config.vertices;
    const { youngs_modulus: E, poisson_ratio: nu, yield_strength: Sy } = this.material;

    const lambda = (E * nu) / ((1 + nu) * (1 - 2 * nu));
    const mu = E / (2 * (1 + nu));
    const D = new Float64Array(36);
    D[0] = D[7] = D[14] = lambda + 2 * mu;
    D[1] = D[2] = D[6] = D[8] = D[12] = D[13] = lambda;
    D[21] = D[28] = D[35] = mu;

    for (let e = 0; e < this.elementCount; e++) {
      const n0 = tets[e * 4], n1 = tets[e * 4 + 1];
      const n2 = tets[e * 4 + 2], n3 = tets[e * 4 + 3];

      // Recompute B for this element (same as in assembleStiffness)
      const x0 = verts[n0 * 3], y0 = verts[n0 * 3 + 1], z0 = verts[n0 * 3 + 2];
      const J = [
        verts[n1 * 3] - x0, verts[n1 * 3 + 1] - y0, verts[n1 * 3 + 2] - z0,
        verts[n2 * 3] - x0, verts[n2 * 3 + 1] - y0, verts[n2 * 3 + 2] - z0,
        verts[n3 * 3] - x0, verts[n3 * 3 + 1] - y0, verts[n3 * 3 + 2] - z0,
      ];
      const detJ =
        J[0] * (J[4] * J[8] - J[5] * J[7]) -
        J[1] * (J[3] * J[8] - J[5] * J[6]) +
        J[2] * (J[3] * J[7] - J[4] * J[6]);

      if (Math.abs(detJ) < 1e-20) {
        this.vonMisesStress[e] = 0;
        this.safetyFactors[e] = Sy > 0 ? Infinity : 0;
        continue;
      }

      const invDetJ = 1 / detJ;
      const Ji = [
        (J[4] * J[8] - J[5] * J[7]) * invDetJ,
        (J[2] * J[7] - J[1] * J[8]) * invDetJ,
        (J[1] * J[5] - J[2] * J[4]) * invDetJ,
        (J[5] * J[6] - J[3] * J[8]) * invDetJ,
        (J[0] * J[8] - J[2] * J[6]) * invDetJ,
        (J[2] * J[3] - J[0] * J[5]) * invDetJ,
        (J[3] * J[7] - J[4] * J[6]) * invDetJ,
        (J[1] * J[6] - J[0] * J[7]) * invDetJ,
        (J[0] * J[4] - J[1] * J[3]) * invDetJ,
      ];

      const dN = new Float64Array(12);
      dN[3] = Ji[0]; dN[4] = Ji[1]; dN[5] = Ji[2];
      dN[6] = Ji[3]; dN[7] = Ji[4]; dN[8] = Ji[5];
      dN[9] = Ji[6]; dN[10] = Ji[7]; dN[11] = Ji[8];
      dN[0] = -(dN[3] + dN[6] + dN[9]);
      dN[1] = -(dN[4] + dN[7] + dN[10]);
      dN[2] = -(dN[5] + dN[8] + dN[11]);

      // Compute strain = B * u_e
      const nodes = [n0, n1, n2, n3];
      const strain = new Float64Array(6);
      for (let a = 0; a < 4; a++) {
        const dnx = dN[a * 3], dny = dN[a * 3 + 1], dnz = dN[a * 3 + 2];
        const ux = this.displacements[nodes[a] * 3];
        const uy = this.displacements[nodes[a] * 3 + 1];
        const uz = this.displacements[nodes[a] * 3 + 2];
        strain[0] += dnx * ux;           // εxx
        strain[1] += dny * uy;           // εyy
        strain[2] += dnz * uz;           // εzz
        strain[3] += dny * ux + dnx * uy; // γxy
        strain[4] += dnz * uy + dny * uz; // γyz
        strain[5] += dnz * ux + dnx * uz; // γxz
      }

      // Compute stress = D * strain
      const stress = new Float64Array(6);
      for (let i = 0; i < 6; i++) {
        for (let j = 0; j < 6; j++) {
          stress[i] += D[i * 6 + j] * strain[j];
        }
      }

      // Von Mises stress
      const sxx = stress[0], syy = stress[1], szz = stress[2];
      const txy = stress[3], tyz = stress[4], txz = stress[5];
      const vm = Math.sqrt(
        sxx * sxx + syy * syy + szz * szz -
        sxx * syy - syy * szz - szz * sxx +
        3 * (txy * txy + tyz * tyz + txz * txz)
      );

      this.vonMisesStress[e] = vm;
      this.safetyFactors[e] = Sy > 0 ? Sy / Math.max(vm, 1e-20) : Infinity;
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────

  getVonMisesStress(): Float32Array {
    return this.vonMisesStress;
  }

  getSafetyFactor(): Float32Array {
    return this.safetyFactors;
  }

  getDisplacements(): Float32Array {
    return this.displacements;
  }

  /** Update a load and re-solve */
  updateLoad(id: string, force: [number, number, number]): void {
    const load = this.config.loads.find((l) => l.id === id);
    if (load) {
      load.force = force;
      this.assembleForces();
    }
  }

  getStats(): StructuralStats {
    let maxVM = 0, minSF = Infinity;
    for (let e = 0; e < this.elementCount; e++) {
      if (this.vonMisesStress[e] > maxVM) maxVM = this.vonMisesStress[e];
      if (this.safetyFactors[e] < minSF) minSF = this.safetyFactors[e];
    }
    return {
      nodeCount: this.nodeCount,
      elementCount: this.elementCount,
      maxVonMises: maxVM,
      minSafetyFactor: minSF,
      solveResult: this.solveResult,
      solveTimeMs: this.solveTimeMs,
    };
  }

  dispose(): void {
    this.elementStiffness = [];
  }
}
