# Research: Geometric Nonlinearity & Newton-Raphson Roadmap

## 1. Problem Definition: Large Deformation
Current `StructuralSolverTET10` assumes small strains (linear elasticity). For large displacements/rotations, the relationship between displacement and strain becomes nonlinear (Green-Lagrange strain), and the equilibrium equation $R(u) = f_{ext} - f_{int}(u) = 0$ must be solved iteratively.

### Formula: Green-Lagrange Strain
$E = \frac{1}{2}(F^T F - I)$, where $F = I + \nabla u$ is the deformation gradient.

---

## 2. Solution Strategy: Newton-Raphson (NR)
We solve the nonlinear system using successive linearizations.

### Iteration Loop
For each load increment $\Delta f$:
1.  **Initialize**: $u_{i=0} = u_{prev}$
2.  **Compute Internal Force**: $f_{int}(u_i) = \int B(u_i)^T \sigma(u_i) dV$
3.  **Compute Tangent Stiffness**: $K_T(u_i) = \frac{\partial f_{int}}{\partial u} = K_{material} + K_{geometric}$
4.  **Solve**: $K_T \Delta u = f_{ext} - f_{int}(u_i)$
5.  **Update**: $u_{i+1} = u_i + \Delta u$
6.  **Convergence Check**: $\|R\| < \epsilon$

---

## 3. GPU Acceleration Requirements

### A. GPU Matrix Assembly (Phase 2)
The tangent stiffness $K_T$ and internal force $f_{int}$ must be recalculated every NR iteration. CPU assembly is too slow for real-time interaction.
- **Goal**: Implement a compute shader that iterates over elements and assembles directly into a GPU-side CSR or Block-Compressed matrix.
- **Challenge**: Race conditions during atomic addition into global matrix.
- **Strategy**: Use "Atomic-Free" assembly where each thread handles a row and sums contributions from connected elements.

### B. Linear Inner Solve (Phase 1 - DONE)
The `SparseLinearSolver.ts` stabilized in Phase 1 provides the underlying CG solver for Step 4 of the NR loop.

---

## 4. Implementation Steps

1.  **Nonlinear State Storage**:
    - Add `referencePositions: Float64Array` to `StructuralSolver`.
    - Track `currentPositions = referencePositions + displacements`.

2.  **Internal Force Kernel**:
    - Implement a WGSL kernel to compute $f_{int}$ per node.
    - Requires 4-point Gauss quadrature for TET10.

3.  **Tangent Stiffness Assembly**:
    - Port element-level stiffness logic to WGSL.
    - Implement the sparse assembly shader.

4.  **NR Loop Orchestration**:
    - Update `StructuralSolverTET10.solveGPU` to loop until convergence.
    - Implement line-search or arc-length methods if snap-through/buckling is expected.

---

## 5. V&V Targets
- **Large Deflection of a Beam**: Verify against analytical solutions for Tip Deflection $> 10\%$ of beam length.
- **Snap-through Buckling**: Verify NR stability on shallow arches.
