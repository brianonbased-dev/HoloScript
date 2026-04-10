// =============================================================================
// Spike Propagation Kernel - RFC-0042 Section 6.3 PoC
// =============================================================================
//
// Propagates spikes from pre-synaptic neurons to post-synaptic neurons
// through a weight matrix. Uses fixed-point atomic accumulation because
// WGSL lacks atomic f32 operations.
//
// For N pre-synaptic and M post-synaptic neurons:
//   For each post neuron j:
//     I_syn[j] = sum(spikes[i] * weights[i * M + j]) for all pre neurons i
//
// This kernel dispatches one workgroup per post-synaptic neuron and
// accumulates weighted spikes using atomicAdd on fixed-point integers.
//
// Fixed-point scale: multiply f32 weights by FIXED_POINT_SCALE (1000),
// accumulate as i32, then divide back in the output shader.

struct PropagationParams {
    pre_count: u32,      // Number of pre-synaptic neurons
    post_count: u32,     // Number of post-synaptic neurons
    fixed_scale: f32,    // Fixed-point scale factor (default: 1000.0)
    _pad: u32,
}

@group(0) @binding(0) var<uniform> params: PropagationParams;

// Pre-synaptic spike flags: 1u = spike, 0u = no spike
@group(0) @binding(1) var<storage, read> pre_spikes: array<u32>;

// Weight matrix: pre_count x post_count (row-major, pre neuron = row)
@group(0) @binding(2) var<storage, read> weights: array<f32>;

// Output: accumulated synaptic input for each post-synaptic neuron (fixed-point i32)
@group(0) @binding(3) var<storage, read_write> post_input_fixed: array<atomic<i32>>;

// Output: final float synaptic input (written after accumulation)
@group(0) @binding(4) var<storage, read_write> post_input: array<f32>;

// Phase 1: Accumulate weighted spikes (fixed-point atomic)
@compute @workgroup_size(256)
fn propagate_spikes(@builtin(global_invocation_id) gid: vec3<u32>) {
    let pre_idx = gid.x;
    if (pre_idx >= params.pre_count) {
        return;
    }

    // Skip if this pre-synaptic neuron didn't fire
    if (pre_spikes[pre_idx] == 0u) {
        return;
    }

    // This neuron spiked - propagate to all post-synaptic neurons
    let row_offset = pre_idx * params.post_count;
    for (var post_idx = 0u; post_idx < params.post_count; post_idx = post_idx + 1u) {
        let w = weights[row_offset + post_idx];
        let fixed_w = i32(w * params.fixed_scale);
        if (fixed_w != 0) {
            atomicAdd(&post_input_fixed[post_idx], fixed_w);
        }
    }
}

// Phase 2: Convert fixed-point accumulator to float
@compute @workgroup_size(256)
fn convert_fixed_to_float(@builtin(global_invocation_id) gid: vec3<u32>) {
    let idx = gid.x;
    if (idx >= params.post_count) {
        return;
    }

    let fixed_val = atomicLoad(&post_input_fixed[idx]);
    post_input[idx] = f32(fixed_val) / params.fixed_scale;

    // Reset accumulator for next timestep
    atomicStore(&post_input_fixed[idx], 0);
}
