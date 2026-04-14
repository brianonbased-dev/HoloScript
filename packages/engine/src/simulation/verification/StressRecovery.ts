/**
 * Superconvergent Patch Recovery (SPR) — Zienkiewicz & Zhu (1992)
 *
 * Recovers continuous, superconvergent nodal stresses from per-Gauss-point
 * stress data using least-squares polynomial fitting over element patches.
 *
 * For TET10 elements:
 *   - Gauss points are superconvergent sampling locations
 *   - Polynomial basis: P = [1, x, y, z, xy, xz, yz, x², y², z²] (10 terms)
 *   - Each patch = all elements sharing a node → ~4-20 Gauss points
 *   - Least-squares solve: A·a = b where A = Σ P(xg)·P(xg)��, b = Σ P(xg)·σ(xg)
 *   - Evaluate polynomial at the node: σ*(node) = P(x_node)ᵀ · a
 *
 * References:
 *   O.C. Zienkiewicz & J.Z. Zhu, "The superconvergent patch recovery and
 *   a posteriori error estimates", Int. J. Numer. Meth. Engng., 1992.
 */

// ── Types ───────────���───────────────────────────────────────────────────────

export interface SPRResult {
  /** Recovered nodal stress: nodeCount × 6 components [sxx,syy,szz,txy,tyz,txz] */
  nodalStress: Float64Array;
  /** Per-element error indicator η_e = ||σ* - σ_h||_e (if computed) */
  elementError?: Float64Array;
}

// ── Node-to-Element Adjacency ───────���───────────────────────────────────────

/**
 * Build inverse mapping: for each node, which elements contain it.
 * O(nodeCount + elementCount × nodesPerElement) construction.
 */
export function buildNodeToElements(
  tetrahedra: Uint32Array,
  nodeCount: number,
  nodesPerElement: number,
): Uint32Array[] {
  const adj: number[][] = Array.from({ length: nodeCount }, () => []);
  const elemCount = tetrahedra.length / nodesPerElement;
  for (let e = 0; e < elemCount; e++) {
    for (let i = 0; i < nodesPerElement; i++) {
      const node = tetrahedra[e * nodesPerElement + i];
      if (!adj[node].includes(e)) adj[node].push(e);
    }
  }
  return adj.map((a) => new Uint32Array(a));
}

// ── Polynomial Basis ───────────��────────────────────────────────────────────

/**
 * Evaluate quadratic polynomial basis at a 3D point.
 * P = [1, x, y, z, xy, xz, yz, x², y², z²]  (10 terms)
 *
 * For TET10 (quadratic elements), the 10-term basis matches the order
 * of the stress field, ensuring the recovery is at least as accurate as
 * the original FE solution (superconvergence at Gauss points).
 */
function quadraticBasis(x: number, y: number, z: number): Float64Array {
  return new Float64Array([1, x, y, z, x * y, x * z, y * z, x * x, y * y, z * z]);
}

/** Linear basis for TET4: P = [1, x, y, z] (4 terms) */
function linearBasis(x: number, y: number, z: number): Float64Array {
  return new Float64Array([1, x, y, z]);
}

// ── Core SPR Algorithm ─────���────────────────────────────────────────────────

/**
 * Solve the SPR normal equations for a single node's patch.
 *
 * Given m sampling points (Gauss points from patch elements) with
 * coordinates (x_g, y_g, z_g) and stress values σ_g (one component),
 * find polynomial coefficients a that minimize:
 *
 *   Σ_g [P(x_g)ᵀ · a - σ_g]²
 *
 * Normal equations: (Σ P·Pᵀ) · a = Σ P·σ
 *                       A     · a =   b
 *
 * @param samplingPoints Array of {x, y, z, stress} for one stress component
 * @param basisSize Number of polynomial terms (4 for linear, 10 for quadratic)
 * @param basisFn Function to evaluate the polynomial basis at a point
 * @returns Polynomial coefficients a (length = basisSize)
 */
function solvePatchLeastSquares(
  samplingPoints: Array<{ x: number; y: number; z: number; stress: number }>,
  basisSize: number,
  basisFn: (x: number, y: number, z: number) => Float64Array,
): Float64Array {
  const n = basisSize;
  const A = new Float64Array(n * n); // normal matrix
  const b = new Float64Array(n);     // right-hand side

  for (const pt of samplingPoints) {
    const P = basisFn(pt[0], pt[1], pt[2]);
    // Accumulate A = Σ P · Pᵀ
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        A[i * n + j] += P[i] * P[j];
      }
      b[i] += P[i] * pt.stress;
    }
  }

  // Solve A·a = b via Cholesky or direct inversion
  // A is symmetric positive semi-definite. Use regularized Cholesky.
  return solveSymmetricPositive(A, b, n);
}

/**
 * Solve A·x = b for symmetric positive definite A.
 * Uses Cholesky decomposition with Tikhonov regularization for
 * rank-deficient patches (e.g., boundary patches with few elements).
 */
function solveSymmetricPositive(A: Float64Array, b: Float64Array, n: number): Float64Array {
  // Regularize: A += εI where ε = 1e-12 * max(diag(A))
  let maxDiag = 0;
  for (let i = 0; i < n; i++) maxDiag = Math.max(maxDiag, Math.abs(A[i * n + i]));
  const eps = 1e-12 * Math.max(maxDiag, 1e-30);
  for (let i = 0; i < n; i++) A[i * n + i] += eps;

  // Cholesky: A = L·Lᵀ
  const L = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = A[i * n + j];
      for (let k = 0; k < j; k++) sum -= L[i * n + k] * L[j * n + k];
      if (i === j) {
        L[i * n + j] = sum > 0 ? Math.sqrt(sum) : 1e-15;
      } else {
        L[i * n + j] = sum / Math.max(L[j * n + j], 1e-30);
      }
    }
  }

  // Forward solve: L·y = b
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let sum = b[i];
    for (let j = 0; j < i; j++) sum -= L[i * n + j] * y[j];
    y[i] = sum / Math.max(L[i * n + i], 1e-30);
  }

  // Back solve: Lᵀ·x = y
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let sum = y[i];
    for (let j = i + 1; j < n; j++) sum -= L[j * n + i] * x[j];
    x[i] = sum / Math.max(L[i * n + i], 1e-30);
  }

  return x;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Perform SPR stress recovery for TET10 elements.
 *
 * @param tetrahedra Element connectivity (10 nodes per element)
 * @param vertices Node coordinates (x,y,z per node)
 * @param gaussPointStress Per-GP stress: (elemCount×4)×6 components
 * @param gaussPointCoords Per-GP coordinates: (elemCount×4)×3
 * @param nodeCount Total number of nodes
 * @returns SPRResult with continuous nodal stress field
 */
export function recoverNodalStressSPR(
  tetrahedra: Uint32Array,
  vertices: Float64Array | Float32Array,
  gaussPointStress: Float64Array,
  gaussPointCoords: Float64Array,
  nodeCount: number,
): SPRResult {
  const elemCount = tetrahedra.length / 10;
  const nodalStress = new Float64Array(nodeCount * 6);

  // Build node → element adjacency
  const nodeToElems = buildNodeToElements(tetrahedra, nodeCount, 10);

  // Quadratic basis for TET10 (10 terms)
  const basisSize = 10;
  const basisFn = quadraticBasis;

  // Process each node independently
  for (let node = 0; node < nodeCount; node++) {
    const patchElems = nodeToElems[node];
    if (patchElems.length === 0) continue;

    // Collect all Gauss points from patch elements
    const samplingPoints: Array<{ x: number; y: number; z: number; stress: number }>[] =
      Array.from({ length: 6 }, () => []);

    for (const elemIdx of patchElems) {
      for (let gp = 0; gp < 4; gp++) {
        const gpIdx = elemIdx * 4 + gp;
        const x = gaussPointCoords[gpIdx * 3];
        const y = gaussPointCoords[gpIdx * 3 + 1];
        const z = gaussPointCoords[gpIdx * 3 + 2];
        for (let comp = 0; comp < 6; comp++) {
          samplingPoints[comp].push({
            x, y, z,
            stress: gaussPointStress[gpIdx * 6 + comp],
          });
        }
      }
    }

    // Check if we have enough points for the polynomial fit.
    // Need at least basisSize points; if fewer, fall back to linear basis.
    const nPoints = samplingPoints[0].length;
    let actualBasisSize = basisSize;
    let actualBasisFn = basisFn;
    if (nPoints < basisSize) {
      // Fall back to linear basis (4 terms)
      actualBasisSize = 4;
      actualBasisFn = linearBasis;
      if (nPoints < 4) {
        // Not enough even for linear — just average the Gauss point stresses
        for (let comp = 0; comp < 6; comp++) {
          let sum = 0;
          for (const pt of samplingPoints[comp]) sum += pt.stress;
          nodalStress[node * 6 + comp] = sum / Math.max(nPoints, 1);
        }
        continue;
      }
    }

    // Solve for each stress component independently.
    // The A matrix is the same for all 6 components (same sampling locations),
    // so ideally we'd factor A once and solve 6 RHS. For simplicity, we
    // solve each independently — the Cholesky is O(n³) with n=10, negligible.
    const nodeX = vertices[node * 3];
    const nodeY = vertices[node * 3 + 1];
    const nodeZ = vertices[node * 3 + 2];
    const P_node = actualBasisFn(nodeX, nodeY, nodeZ);

    for (let comp = 0; comp < 6; comp++) {
      const coeffs = solvePatchLeastSquares(samplingPoints[comp], actualBasisSize, actualBasisFn);
      // Evaluate polynomial at node: σ*(node) = P(x_node)ᵀ · a
      let sigma = 0;
      for (let i = 0; i < actualBasisSize; i++) {
        sigma += P_node[i] * coeffs[i];
      }
      nodalStress[node * 6 + comp] = sigma;
    }
  }

  return { nodalStress };
}

/**
 * Compute nodal von Mises stress from SPR-recovered nodal Cauchy stress.
 * @param nodalStress nodeCount × 6 Cauchy components
 * @param nodeCount Number of nodes
 * @returns nodeCount × 1 von Mises values
 */
export function nodalVonMises(nodalStress: Float64Array, nodeCount: number): Float64Array {
  const vms = new Float64Array(nodeCount);
  for (let n = 0; n < nodeCount; n++) {
    const sxx = nodalStress[n * 6 + 0];
    const syy = nodalStress[n * 6 + 1];
    const szz = nodalStress[n * 6 + 2];
    const txy = nodalStress[n * 6 + 3];
    const tyz = nodalStress[n * 6 + 4];
    const txz = nodalStress[n * 6 + 5];
    vms[n] = Math.sqrt(
      sxx * sxx + syy * syy + szz * szz -
      sxx * syy - syy * szz - szz * sxx +
      3 * (txy * txy + tyz * tyz + txz * txz),
    );
  }
  return vms;
}
