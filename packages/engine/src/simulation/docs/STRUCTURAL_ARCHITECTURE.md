# Architectural Record: SimSci Structural Simulation (Unified)

**Version**: 1.1 (Convergence Plan)
**Status**: STABILIZING
**Objective**: Converge parallel GPU solver implementations into a single, high-performance production pipeline.

## 1. The Full Picture: System Convergence
Analysis of current implementations revealed two parallel tracks. This record formalizes the convergence into a unified 'Best of Both' architecture.

| Component | Provenance | Target Architecture |
|-----------|------------|---------------------|
| **GPU Solver** | Set B (`gpu/SparseLinearSolver.ts`) | **Master Architecture**. Proven 375-test coverage and full life-cycle management. |
| **Compute Kernels**| Set A (`simulation/gpu/sim_kernels.wgsl`) | **Algorithm Source**. CSR-Vector SpMV and Fused p-Update are optimal for TET10. |
| **Domain Solver** | Set B (`simulation/StructuralSolverTET10.ts`) | **Production Entry**. Complete assembly, BC enforcement, and stress recovery. |
| **Scaffolding** | Set A (`simulation/gpu/*`, `Tet10Element.ts`) | **Retired**. To be removed once kernels are migrated. |

---

## 2. Key Architectural Decisions (Unified)

### DR.SIM.001: Sub-Group/Vector SpMV for Unstructured Meshes
- **Context**: Structural TET10 matrices have varying row lengths (irregular sparsity). Standard scalar kernels suffer from thread divergence within warps/subgroups.
- **Decision**: Adopt the **CSR-Vector** strategy from Set A.
- **Rationale**: Assigning a 16-thread vector to each row allows for coalesced access and workgroup-local reduction, significantly outperforming scalar implementations on high-order meshes.
- **Action**: Merge `spmv_vector` into `cg_kernels.wgsl`.

### DR.SIM.002: Fused CG Update (p-Update)
- **Context**: The `p = r + beta * p` update in Conjugate Gradient is memory-bound.
- **Decision**: implementation of the fused `p_update` kernel.
- **Rationale**: Eliminates redundant memory loads and saves three dispatch calls per iteration.
- **Action**: Merge `p_update` into `cg_kernels.wgsl`.

### DR.SIM.003: Unified Constraint Enforcement (Projection Method)
- **Context**: Displacement constraints (Dirichlet) must be enforced during the solve.
- **Decision**: Use the **Diagonal Injection / Projection** method implemented in `StructuralSolverTET10.ts`.
- **Rationale**: Setting $K_{ii} = 1$ and $b_i = 0$ for constrained DOFs causes the CG solver to naturally drive displacements to zero without needing separate Lagrange multipliers or penalty methods.

---

## 3. Convergence Roadmap

1. **Kernel Injection**:
   - Port `spmv_vector` and `p_update` kernels to `@holoscript/engine/src/gpu/shaders/cg_kernels.wgsl`.
   - Update `SparseLinearSolver.ts` to support the vector-width parameter (default 16).

2. **Logic Remediation**:
   - Fix the **Initial Residual Bug** in the GPU solver: Ensure $r = b - A*x_0$ is computed for non-zero initial guesses.
   - Fix the **Double-Dot Bug**: Optimize the $r \cdot r$ calculation to avoid redundant staging readbacks.

3. **Structural Integration**:
   - Link `StructuralSolverTET10.ts` to the optimized `SparseLinearSolver`.
   - Enable zero-copy GPU memory passing for real-time stress visualization in the Studio.

4. **Cleanup**:
   - Delete `packages/engine/src/simulation/gpu/` directory.
   - Delete `packages/engine/src/simulation/Tet10Element.ts` (logic is redundant with `StructuralSolverTET10`).

---

## 4. Unaddressed Gaps (Plan Completeness)
1. **Geometric Nonlinearity**: Large deformation (Green-Lagrange strain) is still out of scope for the current linear solver.
2. **GPU Assembly**: Matrix assembly still occurs on the CPU before being shipped to the GPU. For models >1M elements, assembly will become the primary bottleneck.
3. **Moltbook / Resource Economy**: Solver credit consumption (x402) is not yet wired into the `StructuralSolverTET10` pipeline.

---
*Authored by Gemini-HoloScript — Refined by Cross-Session Synthesis*
