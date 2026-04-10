// =============================================================================
// LIF Neuron Update Kernel - RFC-0042 Section 6.1 PoC
// =============================================================================
//
// Leaky Integrate-and-Fire (LIF) neuron update for 1000 neurons.
// This is a standalone proof-of-concept compute shader that validates
// WebGPU can execute neuromorphic simulation within VR frame budgets.
//
// Model:
//   V[t+1] = V_rest + (V[t] - V_rest) * exp(-dt/tau) + I_syn[t]
//   if V[t+1] >= V_thresh => spike = 1, V = V_reset, refractory = T_ref
//   else spike = 0
//
// Buffer layout (SoA for coalesced GPU access):
//   binding 0: uniform LIFParams
//   binding 1: storage RW membrane_v  [N x f32]
//   binding 2: storage R  synaptic_in [N x f32]
//   binding 3: storage RW spikes      [N x u32] (1=fired, 0=silent)
//   binding 4: storage RW refractory  [N x f32]

struct LIFParams {
    tau: f32,            // Membrane time constant (ms) - default 20.0
    v_threshold: f32,    // Spike threshold (mV) - default -55.0
    v_reset: f32,        // Reset voltage (mV) - default -75.0
    v_rest: f32,         // Resting potential (mV) - default -65.0
    dt: f32,             // Timestep (ms) - default 1.0
    neuron_count: u32,   // Total neuron count
    _pad0: u32,
    _pad1: u32,
}

@group(0) @binding(0) var<uniform> params: LIFParams;
@group(0) @binding(1) var<storage, read_write> membrane_v: array<f32>;
@group(0) @binding(2) var<storage, read> synaptic_in: array<f32>;
@group(0) @binding(3) var<storage, read_write> spikes: array<u32>;
@group(0) @binding(4) var<storage, read_write> refractory: array<f32>;

@compute @workgroup_size(256)
fn lif_update(@builtin(global_invocation_id) gid: vec3<u32>) {
    let idx = gid.x;
    if (idx >= params.neuron_count) {
        return;
    }

    // Read current state
    var v = membrane_v[idx];
    let i_syn = synaptic_in[idx];
    var ref_timer = refractory[idx];

    // Refractory period check
    if (ref_timer > 0.0) {
        ref_timer = ref_timer - params.dt;
        refractory[idx] = max(ref_timer, 0.0);
        membrane_v[idx] = params.v_reset;
        spikes[idx] = 0u;
        return;
    }

    // Exponential decay factor
    let decay = exp(-params.dt / params.tau);

    // Leaky integration
    v = params.v_rest + (v - params.v_rest) * decay + i_syn;

    // Threshold check
    if (v >= params.v_threshold) {
        spikes[idx] = 1u;
        membrane_v[idx] = params.v_reset;
        refractory[idx] = 2.0; // 2ms refractory period
    } else {
        spikes[idx] = 0u;
        membrane_v[idx] = v;
    }
}
