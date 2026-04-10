// Spike Decoding Compute Shader
//
// Converts spike trains back into continuous values for downstream use.
// Decoding schemes:
//   1. Rate decoding: count spikes / time_window => normalized value
//   2. Temporal decoding: earliest spike time => value (earlier = higher)
//   3. Population decoding: weighted sum across neuron population
//   4. First-spike decoding: only uses the first spike's timing

struct DecodeParams {
    neuron_count: u32,    // Number of neurons to decode
    time_window: u32,     // Number of time bins in spike train
    decoding_mode: u32,   // 0=rate, 1=temporal, 2=population, 3=first-spike
    population_size: u32, // Neurons per population (for population coding)
    output_min: f32,      // Output range minimum
    output_max: f32,      // Output range maximum
    _pad0: u32,
    _pad1: u32,
};

@group(0) @binding(0) var<uniform> params: DecodeParams;

// Input spike trains: [neuron_count * time_window]
@group(0) @binding(1) var<storage, read> spike_train: array<f32>;

// Decoded output values: [neuron_count] (or [neuron_count / population_size] for population)
@group(0) @binding(2) var<storage, read_write> output_data: array<f32>;

// Population tuning curves (preferred values): [neuron_count] (for population decoding)
@group(0) @binding(3) var<storage, read> tuning_curves: array<f32>;

fn denormalize(value: f32) -> f32 {
    return params.output_min + value * (params.output_max - params.output_min);
}

// Rate decoding: output = spike_count / time_window
@compute @workgroup_size(256)
fn decode_rate(@builtin(global_invocation_id) gid: vec3<u32>) {
    let idx = gid.x;
    if (idx >= params.neuron_count) {
        return;
    }

    let base_offset = idx * params.time_window;
    var spike_count: f32 = 0.0;

    for (var t = 0u; t < params.time_window; t = t + 1u) {
        spike_count = spike_count + spike_train[base_offset + t];
    }

    let rate = spike_count / f32(params.time_window);
    output_data[idx] = denormalize(rate);
}

// Temporal decoding: find earliest spike, earlier = higher value
@compute @workgroup_size(256)
fn decode_temporal(@builtin(global_invocation_id) gid: vec3<u32>) {
    let idx = gid.x;
    if (idx >= params.neuron_count) {
        return;
    }

    let base_offset = idx * params.time_window;
    var first_spike_time: i32 = -1;

    for (var t = 0u; t < params.time_window; t = t + 1u) {
        if (spike_train[base_offset + t] > 0.5 && first_spike_time < 0) {
            first_spike_time = i32(t);
        }
    }

    if (first_spike_time < 0) {
        // No spike => minimum value
        output_data[idx] = params.output_min;
    } else {
        // Earlier spike => higher value
        let normalized = 1.0 - f32(first_spike_time) / f32(params.time_window - 1u);
        output_data[idx] = denormalize(normalized);
    }
}

// Population decoding: weighted average of preferred values by firing rates
// Groups of `population_size` neurons encode a single value
@compute @workgroup_size(256)
fn decode_population(@builtin(global_invocation_id) gid: vec3<u32>) {
    let pop_idx = gid.x;
    let num_populations = params.neuron_count / params.population_size;
    if (pop_idx >= num_populations) {
        return;
    }

    let pop_start = pop_idx * params.population_size;
    var weighted_sum: f32 = 0.0;
    var total_rate: f32 = 0.0;

    for (var n = 0u; n < params.population_size; n = n + 1u) {
        let neuron_idx = pop_start + n;
        let base_offset = neuron_idx * params.time_window;

        // Compute firing rate for this neuron
        var spike_count: f32 = 0.0;
        for (var t = 0u; t < params.time_window; t = t + 1u) {
            spike_count = spike_count + spike_train[base_offset + t];
        }
        let rate = spike_count / f32(params.time_window);

        // Weight by preferred value from tuning curve
        weighted_sum = weighted_sum + rate * tuning_curves[neuron_idx];
        total_rate = total_rate + rate;
    }

    if (total_rate > 0.001) {
        output_data[pop_idx] = denormalize(weighted_sum / total_rate);
    } else {
        // No activity => neutral value
        output_data[pop_idx] = denormalize(0.5);
    }
}

// First-spike decoding: uses only first spike across population
// The neuron that fires first determines the decoded value (WTA - Winner Takes All)
@compute @workgroup_size(256)
fn decode_first_spike(@builtin(global_invocation_id) gid: vec3<u32>) {
    let pop_idx = gid.x;
    let num_populations = params.neuron_count / params.population_size;
    if (pop_idx >= num_populations) {
        return;
    }

    let pop_start = pop_idx * params.population_size;
    var earliest_time: u32 = params.time_window;
    var winner_neuron: u32 = 0u;

    for (var n = 0u; n < params.population_size; n = n + 1u) {
        let neuron_idx = pop_start + n;
        let base_offset = neuron_idx * params.time_window;

        for (var t = 0u; t < params.time_window; t = t + 1u) {
            if (spike_train[base_offset + t] > 0.5 && t < earliest_time) {
                earliest_time = t;
                winner_neuron = neuron_idx;
                break;
            }
        }
    }

    if (earliest_time < params.time_window) {
        output_data[pop_idx] = tuning_curves[winner_neuron];
    } else {
        output_data[pop_idx] = denormalize(0.5);
    }
}
