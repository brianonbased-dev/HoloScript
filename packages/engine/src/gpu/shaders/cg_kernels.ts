export const cgKernelsWGSL = `
/**
 * Conjugate Gradient Kernels — Sparse Linear Algebra on WebGPU
 */

struct SolverArgs {
  num_rows: u32,
  vector_width: u32,
  n: u32,
  alpha: f32,
};

@group(0) @binding(0) var<storage, read> csr_val: array<f32>;
@group(0) @binding(1) var<storage, read> csr_col: array<u32>;
@group(0) @binding(2) var<storage, read> csr_row: array<u32>;

@group(1) @binding(0) var<storage, read> vec_in: array<f32>;
@group(1) @binding(1) var<storage, read_write> vec_out: array<f32>;

@group(2) @binding(0) var<uniform> args: SolverArgs;

@group(3) @binding(0) var<storage, read_write> partial_sums: array<f32>;
@group(3) @binding(1) var<storage, read_write> scalar_result: array<f32>;

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

    if (row >= args.num_rows) {
        return;
    }

    let row_start = csr_row[row];
    let row_end = csr_row[row + 1];

    var sum: f32 = 0.0;
    for (var i = row_start + lane; i < row_end; i = i + threads_per_row) {
        sum += csr_val[i] * vec_in[csr_col[i]];
    }

    spmv_shared[tid] = sum;
    workgroupBarrier();

    for (var s = threads_per_row / 2u; s > 0u; s >>= 1u) {
        if (lane < s) {
            spmv_shared[tid] += spmv_shared[tid + s];
        }
        workgroupBarrier();
    }

    if (lane == 0u) {
        vec_out[row] = spmv_shared[tid];
    }
}

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

@compute @workgroup_size(256)
fn saxpy(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let idx = global_id.x;
    if (idx >= args.n) {
        return;
    }
    vec_out[idx] = args.alpha * vec_in[idx] + vec_out[idx];
}

@compute @workgroup_size(256)
fn p_update(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let idx = global_id.x;
    if (idx >= args.n) {
        return;
    }
    vec_out[idx] = vec_in[idx] + args.alpha * vec_out[idx];
}

@compute @workgroup_size(256)
fn vec_copy(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let idx = global_id.x;
    if (idx >= args.n) {
        return;
    }
    vec_out[idx] = vec_in[idx];
}

@compute @workgroup_size(256)
fn vec_zero(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let idx = global_id.x;
    if (idx >= args.n) {
        return;
    }
    vec_out[idx] = 0.0;
}

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
        dot_shared[tid] = vec_in[idx] * vec_out[idx];
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
`;
