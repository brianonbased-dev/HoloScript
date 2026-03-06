// Leaky Integrate-and-Fire (LIF) Neuron Compute Shader
// Processes membrane potential updates for N neurons per dispatch.
//
// Model:  V[t+1] = V[t] * decay + I_syn[t]
//         if V[t+1] >= V_thresh => spike=1, V[t+1] = V_reset
//         else spike=0
//
// decay = exp(-dt / tau)

struct LIFParams {
    tau: f32,            // Membrane time constant (ms)
    v_threshold: f32,    // Spike threshold voltage (mV)
    v_reset: f32,        // Reset voltage after spike (mV)
    v_rest: f32,         // Resting membrane potential (mV)
    dt: f32,             // Timestep (ms)
    neuron_count: u32,   // Total neuron count
    _pad0: u32,
    _pad1: u32,
};

@group(0) @binding(0) var<uniform> params: LIFParams;

// Membrane potentials: read/write per neuron
@group(0) @binding(1) var<storage, read_write> membrane_v: array<f32>;

// Synaptic input currents (computed by weight shader): read-only
@group(0) @binding(2) var<storage, read> synaptic_input: array<f32>;

// Output spike flags: 1.0 = spiked, 0.0 = no spike
@group(0) @binding(3) var<storage, read_write> spikes: array<f32>;

// Refractory period counter (timesteps remaining)
@group(0) @binding(4) var<storage, read_write> refractory: array<f32>;

const WORKGROUP_SIZE: u32 = 256u;
const REFRACTORY_PERIOD: f32 = 2.0; // ms

@compute @workgroup_size(256)
fn lif_step(@builtin(global_invocation_id) gid: vec3<u32>) {
    let idx = gid.x;
    if (idx >= params.neuron_count) {
        return;
    }

    let i = idx;

    // Read current state
    var v = membrane_v[i];
    let i_syn = synaptic_input[i];
    var ref_timer = refractory[i];

    // Compute exponential decay factor: exp(-dt/tau)
    let decay = exp(-params.dt / params.tau);

    // Check refractory period
    if (ref_timer > 0.0) {
        // Neuron is in refractory period - clamp to reset
        ref_timer = ref_timer - params.dt;
        refractory[i] = max(ref_timer, 0.0);
        membrane_v[i] = params.v_reset;
        spikes[i] = 0.0;
        return;
    }

    // Leaky integration step
    // V(t+1) = V_rest + (V(t) - V_rest) * decay + I_syn
    v = params.v_rest + (v - params.v_rest) * decay + i_syn;

    // Threshold check
    if (v >= params.v_threshold) {
        // Spike!
        spikes[i] = 1.0;
        membrane_v[i] = params.v_reset;
        refractory[i] = REFRACTORY_PERIOD;
    } else {
        spikes[i] = 0.0;
        membrane_v[i] = v;
    }
}

// Variant: batch update for multiple timesteps within a single dispatch
// Useful for offline simulation where latency matters less than throughput.
@compute @workgroup_size(256)
fn lif_step_batch(@builtin(global_invocation_id) gid: vec3<u32>) {
    let idx = gid.x;
    if (idx >= params.neuron_count) {
        return;
    }

    let i = idx;
    var v = membrane_v[i];
    let i_syn = synaptic_input[i];
    var ref_timer = refractory[i];
    let decay = exp(-params.dt / params.tau);

    // Process 4 sub-steps per dispatch for higher temporal resolution
    for (var step = 0u; step < 4u; step = step + 1u) {
        if (ref_timer > 0.0) {
            ref_timer = ref_timer - params.dt;
            v = params.v_reset;
        } else {
            v = params.v_rest + (v - params.v_rest) * decay + i_syn * 0.25;

            if (v >= params.v_threshold) {
                spikes[i] = 1.0;
                v = params.v_reset;
                ref_timer = REFRACTORY_PERIOD;
            }
        }
    }

    membrane_v[i] = v;
    refractory[i] = max(ref_timer, 0.0);
}
