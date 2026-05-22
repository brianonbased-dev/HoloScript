/**
 * Conjugate Gradient Kernels — Sparse Linear Algebra on WebGPU
 *
 * Unified bind group layout:
 *   group(0): CSR matrix (SpMV only)
 *   group(1): Vectors (vec_in read, vec_out read_write)
 *   group(2): SolverArgs uniform
 *   group(3): Reduction workspace (dot/final_reduce only)
 *
 * Each entry point references only the groups it needs.
 * With layout:'auto', each pipeline gets a layout derived from
 * only the bindings its entry point actually accesses.
 */

// ── Shared Types ─────────────────────────────────────────────────────

struct SolverArgs {
  num_rows: u32,
  vector_width: u32,
  n: u32,
  alpha: f32,
};

// ── Group 0: CSR Matrix ──────────────────────────────────────────────

@group(0) @binding(0) var<storage, read> csr_val: array<f32>;
@group(0) @binding(1) var<storage, read> csr_col: array<u32>;
@group(0) @binding(2) var<storage, read> csr_row: array<u32>;

// ── Group 1: Vectors ─────────────────────────────────────────────────

@group(1) @binding(0) var<storage, read> vec_in: array<f32>;
@group(1) @binding(1) var<storage, read_write> vec_out: array<f32>;

// ── Group 2: Solver Arguments ────────────────────────────────────────

@group(2) @binding(0) var<uniform> args: SolverArgs;
@group(2) @binding(1) var<storage, read> dot_vec_b: array<f32>;

// ── Group 3: Reduction Workspace ─────────────────────────────────────

@group(3) @binding(0) var<storage, read_write> partial_sums: array<f32>;
@group(3) @binding(1) var<storage, read_write> scalar_result: array<f32>;

// ── Group 2 (cont): on-device scalar workspace ──────────────────────
// Used by divide_scalar and the *_buf kernels to compute/consume alpha & beta
// on the GPU (no per-iteration CPU readback). layout:'auto' binds per entry point.
@group(2) @binding(2) var<storage, read> scal_num: array<f32>;
@group(2) @binding(3) var<storage, read> scal_den: array<f32>;
@group(2) @binding(4) var<storage, read_write> scal_out: array<f32>;

// ═════════════════════════════════════════════════════════════════════
// 1. SpMV — CSR-Vector (multi-thread per row)
//    Assigns vector_width threads per row for irregular TET10 sparsity.
//    Uses: groups 0, 1, 2
// ═════════════════════════════════════════════════════════════════════

var<workgroup> spmv_shared: array<f32, 256>;

@compute @workgroup_size(256)
fn spmv_vector(
    @builtin(global_invocation_id) global_id: vec3<u32>,
    @builtin(local_invocation_id) local_id: vec3<u32>
) {
    let tid = local_id.x;
    let gid = global_id.x;
    let threads_per_row = args.vector_width;
    let row = gid / threads_per_row;
    let lane = gid % threads_per_row;

    var sum: f32 = 0.0;
    if (row < args.num_rows) {
        let row_start = csr_row[row];
        let row_end = csr_row[row + 1];

        for (var i = row_start + lane; i < row_end; i = i + threads_per_row) {
            sum += csr_val[i] * vec_in[csr_col[i]];
        }
    }

    spmv_shared[tid] = sum;
    workgroupBarrier();

    for (var s = threads_per_row / 2u; s > 0u; s >>= 1u) {
        if (lane < s) {
            spmv_shared[tid] += spmv_shared[tid + s];
        }
        workgroupBarrier();
    }

    if (row < args.num_rows && lane == 0u) {
        vec_out[row] = spmv_shared[tid];
    }
}

// Legacy scalar SpMV (1 thread per row, for small/regular matrices)
// Uses: groups 0, 1, 2
@compute @workgroup_size(64)
fn spmv(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let row = global_id.x;
    if (row >= args.num_rows) {
        return;
    }

    let row_start = csr_row[row];
    let row_end = csr_row[row + 1];

    var sum: f32 = 0.0;
    for (var i = row_start; i < row_end; i = i + 1u) {
        sum += csr_val[i] * vec_in[csr_col[i]];
    }

    vec_out[row] = sum;
}

// ═════════════════════════════════════════════════════════════════════
// 2. SAXPY: vec_out = alpha * vec_in + vec_out
//    Uses: groups 1, 2
// ═════════════════════════════════════════════════════════════════════

@compute @workgroup_size(256)
fn saxpy(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let idx = global_id.x;
    if (idx >= args.n) {
        return;
    }
    vec_out[idx] = args.alpha * vec_in[idx] + vec_out[idx];
}

// ═════════════════════════════════════════════════════════════════════
// 3. Fused CG Update: p = r + beta * p
//    vec_in = r (read), vec_out = p (read_write), args.alpha = beta
//    Uses: groups 1, 2
// ═════════════════════════════════════════════════════════════════════

@compute @workgroup_size(256)
fn p_update(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let idx = global_id.x;
    if (idx >= args.n) {
        return;
    }
    vec_out[idx] = vec_in[idx] + args.alpha * vec_out[idx];
}

// ═════════════════════════════════════════════════════════════════════
// 4. Vector Copy: vec_out = vec_in
//    Uses: groups 1, 2
// ═════════════════════════════════════════════════════════════════════

@compute @workgroup_size(256)
fn vec_copy(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let idx = global_id.x;
    if (idx >= args.n) {
        return;
    }
    vec_out[idx] = vec_in[idx];
}

// ═════════════════════════════════════════════════════════════════════
// 5. Vector Zero: vec_out = 0
//    Uses: groups 1 (binding 1 only), 2
// ═════════════════════════════════════════════════════════════════════

@compute @workgroup_size(256)
fn vec_zero(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let idx = global_id.x;
    if (idx >= args.n) {
        return;
    }
    vec_out[idx] = 0.0;
}

// ═════════════════════════════════════════════════════════════════════
// 6. Dot Product — Phase 1: per-workgroup partial sums
//    result[wg_id] = sum of vec_in[i] * vec_out[i] for this workgroup
//    Uses: groups 1, 2, 3 (binding 0)
// ═════════════════════════════════════════════════════════════════════

var<workgroup> dot_shared: array<f32, 256>;

@compute @workgroup_size(256)
fn dot_product(
    @builtin(global_invocation_id) global_id: vec3<u32>,
    @builtin(local_invocation_id) local_id: vec3<u32>,
    @builtin(workgroup_id) workgroup_id: vec3<u32>
) {
    let idx = global_id.x;
    let tid = local_id.x;

    if (idx < args.n) {
        dot_shared[tid] = vec_in[idx] * dot_vec_b[idx];
    } else {
        dot_shared[tid] = 0.0;
    }

    workgroupBarrier();

    for (var s = 128u; s > 0u; s >>= 1u) {
        if (tid < s) {
            dot_shared[tid] += dot_shared[tid + s];
        }
        workgroupBarrier();
    }

    if (tid == 0u) {
        partial_sums[workgroup_id.x] = dot_shared[0];
    }
}

// ═════════════════════════════════════════════════════════════════════
// 7. Final Reduce — Phase 2: sum partial_sums → scalar_result[0]
//    args.n = number of partial sums to reduce
//    Uses: groups 2, 3 (bindings 0 and 1)
// ═════════════════════════════════════════════════════════════════════

var<workgroup> reduce_shared: array<f32, 256>;

@compute @workgroup_size(256)
fn final_reduce(@builtin(local_invocation_id) local_id: vec3<u32>) {
    let tid = local_id.x;
    let count = args.n;

    var acc: f32 = 0.0;
    var i = tid;
    loop {
        if (i >= count) {
            break;
        }
        acc += partial_sums[i];
        i += 256u;
    }
    reduce_shared[tid] = acc;

    workgroupBarrier();

    for (var s = 128u; s > 0u; s >>= 1u) {
        if (tid < s) {
            reduce_shared[tid] += reduce_shared[tid + s];
        }
        workgroupBarrier();
    }

    if (tid == 0u) {
        scalar_result[0] = reduce_shared[0];
    }
}

// ═════════════════════════════════════════════════════════════════════
// 8. Jacobi preconditioner — extract inverse diagonal (M⁻¹ = 1/diag(A))
// ═════════════════════════════════════════════════════════════════════

@compute @workgroup_size(256)
fn extract_inv_diagonal(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let row = global_id.x;
    if (row >= args.num_rows) { return; }
    let row_start = csr_row[row];
    let row_end = csr_row[row + 1];
    var diag: f32 = 0.0;
    for (var i = row_start; i < row_end; i = i + 1u) {
        if (csr_col[i] == row) { diag = csr_val[i]; }
    }
    if (abs(diag) > 1e-30) { vec_out[row] = 1.0 / diag; } else { vec_out[row] = 1.0; }
}

// ═════════════════════════════════════════════════════════════════════
// 9. Apply preconditioner — z = M⁻¹ ∘ r  (vec_in=r, dot_vec_b=invDiag, vec_out=z)
// ═════════════════════════════════════════════════════════════════════

@compute @workgroup_size(256)
fn apply_precond(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let idx = global_id.x;
    if (idx >= args.n) { return; }
    vec_out[idx] = vec_in[idx] * dot_vec_b[idx];
}

// ═════════════════════════════════════════════════════════════════════
// 10. Scalar divide — scal_out[0] = scal_num[0] / (scal_den[0] + eps)
// ═════════════════════════════════════════════════════════════════════

@compute @workgroup_size(1)
fn divide_scalar() {
    let den = scal_den[0];
    var inv: f32 = 0.0;
    if (abs(den) > 1e-30) { inv = scal_num[0] / den; }
    scal_out[0] = inv;
}

// ═════════════════════════════════════════════════════════════════════
// 11-13. SAXPY / p-update with scalar from buffer (scal_num[0])
// ═════════════════════════════════════════════════════════════════════

@compute @workgroup_size(256)
fn saxpy_buf(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let idx = global_id.x;
    if (idx >= args.n) { return; }
    vec_out[idx] = scal_num[0] * vec_in[idx] + vec_out[idx];
}

@compute @workgroup_size(256)
fn saxpy_neg_buf(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let idx = global_id.x;
    if (idx >= args.n) { return; }
    vec_out[idx] = -scal_num[0] * vec_in[idx] + vec_out[idx];
}

@compute @workgroup_size(256)
fn p_update_buf(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let idx = global_id.x;
    if (idx >= args.n) { return; }
    vec_out[idx] = vec_in[idx] + scal_num[0] * vec_out[idx];
}
