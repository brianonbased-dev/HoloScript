// Spike Encoding Compute Shader
//
// Converts continuous spatial data (positions, velocities, sensor readings)
// into spike trains using various encoding schemes:
//   1. Rate coding: firing probability proportional to input magnitude
//   2. Temporal coding: spike time inversely proportional to input magnitude
//   3. Delta coding: spikes on significant changes
//
// Input data is normalized to [0, 1] range before encoding.

struct EncodeParams {
    data_count: u32,     // Number of input data points
    time_window: u32,    // Number of time bins in the encoding window
    encoding_mode: u32,  // 0=rate, 1=temporal, 2=delta
    seed: u32,           // RNG seed for rate coding
    min_value: f32,      // Input range minimum (for normalization)
    max_value: f32,      // Input range maximum (for normalization)
    delta_threshold: f32,// Threshold for delta coding
    _pad0: u32,
};

@group(0) @binding(0) var<uniform> params: EncodeParams;

// Continuous input data: [data_count]
@group(0) @binding(1) var<storage, read> input_data: array<f32>;

// Previous input data (for delta coding): [data_count]
@group(0) @binding(2) var<storage, read_write> prev_data: array<f32>;

// Output spike train: [data_count * time_window]
// Row-major: spike_train[neuron * time_window + t]
@group(0) @binding(3) var<storage, read_write> spike_train: array<f32>;

// PCG-based pseudo-random number generator
fn pcg_hash(input: u32) -> u32 {
    var state = input * 747796405u + 2891336453u;
    var word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}

fn random_f32(seed: u32, idx: u32, t: u32) -> f32 {
    let hash = pcg_hash(seed ^ (idx * 1973u + t * 9277u + 1u));
    return f32(hash) / 4294967295.0;
}

// Normalize input value to [0, 1]
fn normalize(value: f32) -> f32 {
    let range = params.max_value - params.min_value;
    if (range < 0.0001) {
        return 0.5;
    }
    return clamp((value - params.min_value) / range, 0.0, 1.0);
}

// Rate coding: spike probability = normalized input value
@compute @workgroup_size(256)
fn encode_rate(@builtin(global_invocation_id) gid: vec3<u32>) {
    let idx = gid.x;
    if (idx >= params.data_count) {
        return;
    }

    let value = normalize(input_data[idx]);
    let base_offset = idx * params.time_window;

    // Generate spike train based on firing rate
    for (var t = 0u; t < params.time_window; t = t + 1u) {
        let r = random_f32(params.seed, idx, t);
        if (r < value) {
            spike_train[base_offset + t] = 1.0;
        } else {
            spike_train[base_offset + t] = 0.0;
        }
    }

    // Store for delta coding reference
    prev_data[idx] = input_data[idx];
}

// Temporal coding: earlier spike = stronger stimulus
// Spike at time t = floor((1.0 - normalized_value) * time_window)
@compute @workgroup_size(256)
fn encode_temporal(@builtin(global_invocation_id) gid: vec3<u32>) {
    let idx = gid.x;
    if (idx >= params.data_count) {
        return;
    }

    let value = normalize(input_data[idx]);
    let base_offset = idx * params.time_window;

    // Clear spike train
    for (var t = 0u; t < params.time_window; t = t + 1u) {
        spike_train[base_offset + t] = 0.0;
    }

    // Spike time: stronger input => earlier spike
    if (value > 0.01) {
        let spike_time = u32(floor((1.0 - value) * f32(params.time_window - 1u)));
        let clamped_t = min(spike_time, params.time_window - 1u);
        spike_train[base_offset + clamped_t] = 1.0;
    }

    prev_data[idx] = input_data[idx];
}

// Delta coding: spike only when input changes significantly
@compute @workgroup_size(256)
fn encode_delta(@builtin(global_invocation_id) gid: vec3<u32>) {
    let idx = gid.x;
    if (idx >= params.data_count) {
        return;
    }

    let current = input_data[idx];
    let previous = prev_data[idx];
    let delta = current - previous;
    let abs_delta = abs(delta);

    let base_offset = idx * params.time_window;

    // Clear spike train
    for (var t = 0u; t < params.time_window; t = t + 1u) {
        spike_train[base_offset + t] = 0.0;
    }

    // Emit spike if change exceeds threshold
    if (abs_delta >= params.delta_threshold) {
        // Positive spike for increase, use first half of time window
        // Negative spike (encoded as spike in second half) for decrease
        let magnitude = normalize(abs_delta);
        let spike_time = u32(floor((1.0 - magnitude) * f32(params.time_window / 2u)));

        if (delta > 0.0) {
            // ON spike (positive change)
            spike_train[base_offset + min(spike_time, params.time_window / 2u - 1u)] = 1.0;
        } else {
            // OFF spike (negative change)
            let off_offset = params.time_window / 2u;
            spike_train[base_offset + off_offset + min(spike_time, params.time_window / 2u - 1u)] = 1.0;
        }
    }

    prev_data[idx] = current;
}
