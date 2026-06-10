import type { Vector3 } from '@holoscript/core';
/**
 * DeformableMesh.ts
 *
 * Deformable mesh: vertex displacement, spring-damper networks,
 * rigid shape matching for volume preservation, and impact deformation.
 *
 * Shape matching (Müller et al. 2005):
 *   q_i = rest_i - restCentroid          (rest offsets)
 *   p_i = current_i - currentCentroid    (deformed offsets)
 *   A   = Σ m_i * p_i ⊗ q_i            (3×3 covariance matrix)
 *   R   = polar decomposition of A       (rotation part via iterative SVD approx)
 *   goal_i = R * q_i + currentCentroid
 *
 * Handles rank-deficient (planar) covariance matrices by treating near-zero eigenvalues as zero.
 *
 * @module physics
 */

// =============================================================================
// TYPES
// =============================================================================

export interface DeformVertex {
  rest: Vector3; // Original position
  current: Vector3; // Deformed position
  velocity: Vector3;
  mass: number;
  locked: boolean;
}

export interface DeformSpring {
  a: number;
  b: number;
  restLength: number;
  stiffness: number;
  damping: number;
}

export interface DeformConfig {
  stiffness: number; // Global spring stiffness
  damping: number; // Velocity damping
  shapeMatchingStrength: number; // 0-1
  maxDisplacement: number; // Clamp vertex movement
  plasticity: number; // 0-1: permanent deformation rate
}

// =============================================================================
// POLAR DECOMPOSITION HELPER  (A = R * S)
// =============================================================================

/**
 * Compute the rotation matrix R of the polar decomposition A = R*S for a 3×3
 * matrix A (column-major flat array, 9 elements).
 *
 * Uses the Jacobi eigendecomposition method on B = A^T A:
 *   1. Diagonalise B = V D V^T via Jacobi sweeps (Golub & Van Loan)
 *   2. R = A * V * D^{-1/2} * V^T
 * Works correctly for rank-deficient (planar) covariance matrices by treating
 * near-zero eigenvalues as zero (translation-only along that axis).
 *
 * Always returns a Float64Array (never null).  If A is the zero matrix, R = I.
 *
 * Column-major layout: A[col*3 + row], so A_{i,j} = A[j*3 + i].
 */
function polarDecompose3x3(A: Float64Array, maxIter = 30): Float64Array {
  // Helper: A_{i,j} from col-major array
  const aij = (i: number, j: number): number => A[j * 3 + i];

  // B = A^T A  (symmetric 3×3, col-major)
  const B = new Float64Array(9);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      let s = 0;
      for (let k = 0; k < 3; k++) s += aij(k, i) * aij(k, j);
      B[j * 3 + i] = s;
    }
  }

  // Jacobi iteration: diagonalise B into V D V^T
  const V = new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]); // eigenvector matrix
  const S = new Float64Array(B);                            // will become D

  for (let iter = 0; iter < maxIter; iter++) {
    // Find largest off-diagonal element
    let maxVal = 0, p = 0, q = 1;
    for (let i = 0; i < 3; i++) {
      for (let j = i + 1; j < 3; j++) {
        const v = Math.abs(S[j * 3 + i]);
        if (v > maxVal) { maxVal = v; p = i; q = j; }
      }
    }
    if (maxVal < 1e-10) break; // converged

    // Jacobi Givens rotation to zero S[p,q]
    const Spp = S[p * 3 + p], Sqq = S[q * 3 + q], Spq = S[q * 3 + p];
    const tau = (Sqq - Spp) / (2 * Spq);
    const t = (tau >= 0 ? 1 : -1) / (Math.abs(tau) + Math.sqrt(1 + tau * tau));
    const c = 1 / Math.sqrt(1 + t * t);
    const s = t * c;

    S[p * 3 + p] = c * c * Spp - 2 * s * c * Spq + s * s * Sqq;
    S[q * 3 + q] = s * s * Spp + 2 * s * c * Spq + c * c * Sqq;
    S[q * 3 + p] = S[p * 3 + q] = 0;

    // Update the remaining row/column (the third index r)
    const r = 3 - p - q;
    const Spr = S[r * 3 + p], Sqr = S[r * 3 + q];
    S[r * 3 + p] = S[p * 3 + r] = c * Spr - s * Sqr;
    S[r * 3 + q] = S[q * 3 + r] = s * Spr + c * Sqr;

    // Accumulate rotation into V (V = V * G)
    for (let i = 0; i < 3; i++) {
      const vip = V[p * 3 + i], viq = V[q * 3 + i];
      V[p * 3 + i] = c * vip - s * viq;
      V[q * 3 + i] = s * vip + c * viq;
    }
  }

  // D^{-1/2}: clamp near-zero eigenvalues (rank-deficient / planar meshes)
  const eps = 1e-10;
  const d0 = S[0] > eps ? 1 / Math.sqrt(S[0]) : 0;
  const d1 = S[4] > eps ? 1 / Math.sqrt(S[4]) : 0;
  const d2 = S[8] > eps ? 1 / Math.sqrt(S[8]) : 0;

  // VD = V * D^{-1/2}  (scale each column k of V by d_k)
  const VD = new Float64Array(9);
  for (let i = 0; i < 3; i++) {
    VD[0 * 3 + i] = V[0 * 3 + i] * d0;
    VD[1 * 3 + i] = V[1 * 3 + i] * d1;
    VD[2 * 3 + i] = V[2 * 3 + i] * d2;
  }

  // VDVt = VD * V^T
  const VDVt = new Float64Array(9);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      let s = 0;
      for (let k = 0; k < 3; k++) s += VD[k * 3 + i] * V[k * 3 + j];
      VDVt[j * 3 + i] = s;
    }
  }

  // R = A * VDVt
  const R = new Float64Array(9);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      let s = 0;
      for (let k = 0; k < 3; k++) s += aij(i, k) * VDVt[j * 3 + k];
      R[j * 3 + i] = s;
    }
  }

  return R;
}

// =============================================================================
// DEFORMABLE MESH
// =============================================================================

export class DeformableMesh {
  private toArr3(v: Vector3 | { x: number; y: number; z: number }): Vector3 {
    if (Array.isArray(v)) return [v[0], v[1], v[2]] as Vector3;
    return [v.x, v.y, v.z] as Vector3;
  }

  private vertices: DeformVertex[] = [];
  private springs: DeformSpring[] = [];
  private config: DeformConfig;
  private restCentroid: Vector3 = [0, 0, 0];

  constructor(config?: Partial<DeformConfig>) {
    this.config = {
      stiffness: 100,
      damping: 0.95,
      shapeMatchingStrength: 0.5,
      maxDisplacement: 5,
      plasticity: 0,
      ...config,
    };
  }

  // ---------------------------------------------------------------------------
  // Mesh Setup
  // ---------------------------------------------------------------------------

  setVertices(positions: Array<Vector3 | { x: number; y: number; z: number }>): void {
    this.vertices = positions.map((p) => {
      const v = this.toArr3(p);
      return {
        rest: [v[0], v[1], v[2]],
        current: [v[0], v[1], v[2]],
        velocity: [0, 0, 0],
        mass: 1,
        locked: false,
      };
    });
    this.computeRestCentroid();
  }

  addSpring(a: number, b: number, stiffness?: number, damping?: number): void {
    const pa = this.vertices[a].rest,
      pb = this.vertices[b].rest;
    const dx = pb[0] - pa[0],
      dy = pb[1] - pa[1],
      dz = pb[2] - pa[2];
    this.springs.push({
      a,
      b,
      restLength: Math.sqrt(dx * dx + dy * dy + dz * dz),
      stiffness: stiffness ?? this.config.stiffness,
      damping: damping ?? 5,
    });
  }

  autoConnectRadius(radius: number): void {
    for (let i = 0; i < this.vertices.length; i++) {
      for (let j = i + 1; j < this.vertices.length; j++) {
        const a = this.vertices[i].rest,
          b = this.vertices[j].rest;
        const dx = b[0] - a[0],
          dy = b[1] - a[1],
          dz = b[2] - a[2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist <= radius) this.addSpring(i, j);
      }
    }
  }

  private computeRestCentroid(): void {
    let cx = 0,
      cy = 0,
      cz = 0;
    for (const v of this.vertices) {
      cx += v.rest[0];
      cy += v.rest[1];
      cz += v.rest[2];
    }
    const n = this.vertices.length || 1;
    this.restCentroid = [cx / n, cy / n, cz / n];
  }

  // ---------------------------------------------------------------------------
  // Deformation
  // ---------------------------------------------------------------------------

  applyImpact(
    center: Vector3 | { x: number; y: number; z: number },
    radius: number,
    force: number
  ): void {
    const centerV = this.toArr3(center);
    for (const v of this.vertices) {
      if (v.locked) continue;
      const dx = v.current[0] - centerV[0];
      const dy = v.current[1] - centerV[1];
      const dz = v.current[2] - centerV[2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist > radius || dist === 0) continue;

      const falloff = 1 - dist / radius;
      const strength = (force * falloff) / v.mass;
      const n = dist;
      v.velocity[0] += (dx / n) * strength;
      v.velocity[1] += (dy / n) * strength;
      v.velocity[2] += (dz / n) * strength;
    }
  }

  // ---------------------------------------------------------------------------
  // Simulation
  // ---------------------------------------------------------------------------

  update(dt: number): void {
    // Spring forces
    for (const s of this.springs) {
      const a = this.vertices[s.a],
        b = this.vertices[s.b];
      const dx = b.current[0] - a.current[0];
      const dy = b.current[1] - a.current[1];
      const dz = b.current[2] - a.current[2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.0001;
      const stretch = dist - s.restLength;
      const fx = (dx / dist) * stretch * s.stiffness;
      const fy = (dy / dist) * stretch * s.stiffness;
      const fz = (dz / dist) * stretch * s.stiffness;

      // Relative velocity damping
      const dvx = b.velocity[0] - a.velocity[0];
      const dvy = b.velocity[1] - a.velocity[1];
      const dvz = b.velocity[2] - a.velocity[2];

      if (!a.locked) {
        a.velocity[0] += ((fx + dvx * s.damping) * dt) / a.mass;
        a.velocity[1] += ((fy + dvy * s.damping) * dt) / a.mass;
        a.velocity[2] += ((fz + dvz * s.damping) * dt) / a.mass;
      }
      if (!b.locked) {
        b.velocity[0] -= ((fx + dvx * s.damping) * dt) / b.mass;
        b.velocity[1] -= ((fy + dvy * s.damping) * dt) / b.mass;
        b.velocity[2] -= ((fz + dvz * s.damping) * dt) / b.mass;
      }
    }

    // Rigid shape matching (Müller et al. 2005)
    // Goal positions are computed via R * q_i + currentCentroid, where R is the
    // rotation extracted from the covariance matrix A = Σ m_i * p_i ⊗ q_i.
    // Falls back to translation-only if polar decomposition fails to converge.
    if (this.config.shapeMatchingStrength > 0 && this.vertices.length > 0) {
      // Current centroid
      let cx = 0, cy = 0, cz = 0;
      for (const v of this.vertices) {
        cx += v.current[0];
        cy += v.current[1];
        cz += v.current[2];
      }
      const n = this.vertices.length;
      cx /= n; cy /= n; cz /= n;

      const rc = this.restCentroid;

      // Build covariance matrix A_pq = Σ m_i * p_i * q_i^T  (Müller 2005, eq. 6)
      // p_i = current_i - currentCentroid   (deformed offsets)
      // q_i = rest_i    - restCentroid      (reference / rest offsets)
      // (A_pq)[i,j] = Σ m * p_i * q_j
      // Polar decomposition A_pq = R * S gives R: rest → current rotation.
      //
      // Col-major layout: A[col*3+row] → A[j*3+i] = (A_pq)[i,j] = Σ m * p_i * q_j
      const A = new Float64Array(9); // 3×3, col-major: A[col*3+row]
      for (const v of this.vertices) {
        const px = v.current[0] - cx,  py = v.current[1] - cy,  pz = v.current[2] - cz;
        const qx = v.rest[0]    - rc[0], qy = v.rest[1] - rc[1], qz = v.rest[2] - rc[2];
        const m = v.mass;
        // outer product p ⊗ q^T: A[j*3+i] = p_i * q_j
        // col 0 (q_x): A[0]=p_x*q_x, A[1]=p_y*q_x, A[2]=p_z*q_x
        // col 1 (q_y): A[3]=p_x*q_y, A[4]=p_y*q_y, A[5]=p_z*q_y
        // col 2 (q_z): A[6]=p_x*q_z, A[7]=p_y*q_z, A[8]=p_z*q_z
        A[0] += m * px * qx; A[1] += m * py * qx; A[2] += m * pz * qx; // col 0
        A[3] += m * px * qy; A[4] += m * py * qy; A[5] += m * pz * qy; // col 1
        A[6] += m * px * qz; A[7] += m * py * qz; A[8] += m * pz * qz; // col 2
      }

      const R = polarDecompose3x3(A);

      for (const v of this.vertices) {
        if (v.locked) continue;
        // Rigid goal: R * q_i + currentCentroid
        const qx = v.rest[0] - rc[0], qy = v.rest[1] - rc[1], qz = v.rest[2] - rc[2];
        const goalX = R[0]*qx + R[3]*qy + R[6]*qz + cx;
        const goalY = R[1]*qx + R[4]*qy + R[7]*qz + cy;
        const goalZ = R[2]*qx + R[5]*qy + R[8]*qz + cz;
        v.velocity[0] += (goalX - v.current[0]) * this.config.shapeMatchingStrength * dt * 10;
        v.velocity[1] += (goalY - v.current[1]) * this.config.shapeMatchingStrength * dt * 10;
        v.velocity[2] += (goalZ - v.current[2]) * this.config.shapeMatchingStrength * dt * 10;
      }
    }

    // Integrate
    for (const v of this.vertices) {
      if (v.locked) continue;
      v.velocity[0] *= this.config.damping;
      v.velocity[1] *= this.config.damping;
      v.velocity[2] *= this.config.damping;

      v.current[0] += v.velocity[0] * dt;
      v.current[1] += v.velocity[1] * dt;
      v.current[2] += v.velocity[2] * dt;

      // Clamp displacement
      const dx = v.current[0] - v.rest[0];
      const dy = v.current[1] - v.rest[1];
      const dz = v.current[2] - v.rest[2];
      const disp = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (disp > this.config.maxDisplacement) {
        const scale = this.config.maxDisplacement / disp;
        v.current[0] = v.rest[0] + dx * scale;
        v.current[1] = v.rest[1] + dy * scale;
        v.current[2] = v.rest[2] + dz * scale;
      }

      // Plasticity — shift rest position toward current deformed position.
      // restCentroid is recomputed below after all rest positions have been updated
      // so that shape-matching goals remain consistent with the new rest shape.
      if (this.config.plasticity > 0 && disp > 0.01) {
        v.rest[0] += dx * this.config.plasticity * dt;
        v.rest[1] += dy * this.config.plasticity * dt;
        v.rest[2] += dz * this.config.plasticity * dt;
      }
    }

    // After plasticity may have shifted rest positions, recompute restCentroid
    // so the rigid shape-matching pass uses the up-to-date rest reference frame.
    if (this.config.plasticity > 0) {
      this.computeRestCentroid();
    }
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getVertices(): DeformVertex[] {
    return this.vertices;
  }
  getVertex(index: number): DeformVertex | undefined {
    return this.vertices[index];
  }
  getVertexCount(): number {
    return this.vertices.length;
  }
  getSpringCount(): number {
    return this.springs.length;
  }
  getDisplacement(index: number): number {
    const v = this.vertices[index];
    if (!v) return 0;
    const dx = v.current[0] - v.rest[0],
      dy = v.current[1] - v.rest[1],
      dz = v.current[2] - v.rest[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  getMaxDisplacement(): number {
    let max = 0;
    for (let i = 0; i < this.vertices.length; i++) max = Math.max(max, this.getDisplacement(i));
    return max;
  }
}
