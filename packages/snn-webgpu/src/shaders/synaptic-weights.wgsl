// Synaptic Weight Matrix Multiplication Compute Shader
//
// Computes I_syn[j] = sum_i( W[j,i] * spike[i] ) for all post-synaptic neurons j.
// This is a sparse-friendly matrix-vector product: spike vectors are binary (0/1),
// so we can skip zero-valued multiplications.
//
// Layout: W is stored row-major, where row j = weights FROM all pre-synaptic neurons TO neuron j.
// Weight matrix is [post_count x pre_count].

struct SynapticParams {
    pre_count: u32,      // Number of pre-synaptic neurons (columns)
    post_count: u32,     // Number of post-synaptic neurons (rows)
    learning_rate: f32,  // STDP learning rate
    _pad0: u32,
};

@group(0) @binding(0) var<uniform> params: SynapticParams;

// Weight matrix: [post_count * pre_count] row-major
@group(0) @binding(1) var<storage, read_write> weights: array<f32>;

// Pre-synaptic spikes (binary): [pre_count]
@group(0) @binding(2) var<storage, read> pre_spikes: array<f32>;

// Output: post-synaptic currents: [post_count]
@group(0) @binding(3) var<storage, read_write> post_currents: array<f32>;

// Post-synaptic spikes (for STDP): [post_count]
@group(0) @binding(4) var<storage, read> post_spikes: array<f32>;

const TILE_SIZE: u32 = 256u;

// Main synaptic current computation: I_post[j] = sum( W[j,i] * spike_pre[i] )
@compute @workgroup_size(256)
fn compute_synaptic_current(@builtin(global_invocation_id) gid: vec3<u32>) {
    let j = gid.x;  // post-synaptic neuron index
    if (j >= params.post_count) {
        return;
    }

    var current: f32 = 0.0;
    let row_offset = j * params.pre_count;

    // Accumulate weighted pre-synaptic spikes
    for (var i = 0u; i < params.pre_count; i = i + 1u) {
        let spike = pre_spikes[i];
        // Skip if no spike (optimization for sparse spike trains)
        if (spike > 0.5) {
            current = current + weights[row_offset + i];
        }
    }

    post_currents[j] = current;
}

// Tiled version for better memory coalescing on large networks
@compute @workgroup_size(256)
fn compute_synaptic_current_tiled(
    @builtin(global_invocation_id) gid: vec3<u32>,
    @builtin(local_invocation_id) lid: vec3<u32>,
    @builtin(workgroup_id) wid: vec3<u32>
) {
    let j = gid.x;
    if (j >= params.post_count) {
        return;
    }

    var current: f32 = 0.0;
    let row_offset = j * params.pre_count;

    // Process pre-synaptic neurons in tiles for cache efficiency
    let num_tiles = (params.pre_count + TILE_SIZE - 1u) / TILE_SIZE;

    for (var tile = 0u; tile < num_tiles; tile = tile + 1u) {
        let tile_start = tile * TILE_SIZE;
        let tile_end = min(tile_start + TILE_SIZE, params.pre_count);

        for (var i = tile_start; i < tile_end; i = i + 1u) {
            let spike = pre_spikes[i];
            if (spike > 0.5) {
                current = current + weights[row_offset + i];
            }
        }
    }

    post_currents[j] = current;
}

// STDP (Spike-Timing-Dependent Plasticity) weight update
// dW = lr * (pre_spike * post_spike - post_spike * pre_spike * alpha)
// Simplified Hebbian: if both pre and post spike, strengthen; else weaken slightly
@compute @workgroup_size(256)
fn stdp_weight_update(@builtin(global_invocation_id) gid: vec3<u32>) {
    let j = gid.x;  // post-synaptic neuron
    if (j >= params.post_count) {
        return;
    }

    let post_spike = post_spikes[j];
    let row_offset = j * params.pre_count;
    let lr = params.learning_rate;

    for (var i = 0u; i < params.pre_count; i = i + 1u) {
        let pre_spike = pre_spikes[i];
        let w = weights[row_offset + i];

        // Hebbian: strengthen if both spike
        var dw: f32 = 0.0;
        if (pre_spike > 0.5 && post_spike > 0.5) {
            // LTP (Long-Term Potentiation)
            dw = lr * (1.0 - w);  // Soft-bounded towards 1.0
        } else if (pre_spike > 0.5 && post_spike < 0.5) {
            // LTD (Long-Term Depression)
            dw = -lr * 0.5 * w;   // Soft-bounded towards 0.0
        }

        // Clamp weights to [0, 1]
        weights[row_offset + i] = clamp(w + dw, 0.0, 1.0);
    }
}
