// Hierarchical LIF + Shared-Memory Synaptic Current Shaders
//
// Paper-2 (SNN NeurIPS) §5.4 future work:
//   "Scaling to 10^6 neurons via hierarchical workgroup decomposition
//    and shared memory tiling."
//
// This shader provides two compute entry points:
//
//   lif_step_partitioned:
//     Each thread handles NEURONS_PER_THREAD=4 neurons, reducing the
//     dispatch count by 4× compared to the baseline lif_step. For N=10^6
//     neurons: ceil(1M / (256 * 4)) = 977 workgroups vs 3907 baseline.
//
//   synaptic_current_shared_tiled:
//     Uses var<workgroup> shared memory to cache a tile of pre-synaptic
//     spikes. All 256 threads cooperatively fill the tile, then each
//     thread accumulates against the cached spikes for its post neuron.
//     Reduces global memory reads of pre_spikes from O(N_pre × N_post)
//     to O(N_pre × N_post / TILE_SIZE) by reusing cached values.

// ── Shared parameter struct ───────────────────────────────────────────────

struct LIFParams {
    tau: f32,
    v_threshold: f32,
    v_reset: f32,
    v_rest: f32,
    dt: f32,
    neuron_count: u32,
    _pad0: u32,
    _pad1: u32,
};

struct SynapticParams {
    pre_count: u32,
    post_count: u32,
    learning_rate: f32,
    _pad: u32,
};

// ── Constants ─────────────────────────────────────────────────────────────

// Each thread in lif_step_partitioned handles this many neurons.
const NEURONS_PER_THREAD: u32 = 4u;

// Workgroup size for all entry points.
const WORKGROUP_SIZE: u32 = 256u;

// Pre-spike tile size for shared memory caching (must equal WORKGROUP_SIZE).
const TILE_SIZE: u32 = 256u;

const REFRACTORY_PERIOD: f32 = 2.0;

// ── lif_step_partitioned ─────────────────────────────────────────────────
//
// Hierarchical LIF step: each thread handles NEURONS_PER_THREAD contiguous
// neurons. Dispatch: ceil(neuron_count / (WORKGROUP_SIZE * NEURONS_PER_THREAD))

@group(0) @binding(0) var<uniform> lif_params: LIFParams;
@group(0) @binding(1) var<storage, read_write> membrane_v: array<f32>;
@group(0) @binding(2) var<storage, read> synaptic_input: array<f32>;
@group(0) @binding(3) var<storage, read_write> spikes: array<f32>;
@group(0) @binding(4) var<storage, read_write> refractory: array<f32>;

@compute @workgroup_size(256)
fn lif_step_partitioned(@builtin(global_invocation_id) gid: vec3<u32>) {
    let base_idx = gid.x * NEURONS_PER_THREAD;
    let decay = exp(-lif_params.dt / lif_params.tau);

    for (var offset: u32 = 0u; offset < NEURONS_PER_THREAD; offset = offset + 1u) {
        let i = base_idx + offset;
        if (i >= lif_params.neuron_count) {
            return;
        }

        var v = membrane_v[i];
        let i_syn = synaptic_input[i];
        var ref_timer = refractory[i];

        if (ref_timer > 0.0) {
            ref_timer = ref_timer - lif_params.dt;
            refractory[i] = max(ref_timer, 0.0);
            membrane_v[i] = lif_params.v_reset;
            spikes[i] = 0.0;
            continue;
        }

        // LIF integration: V(t+1) = V_rest + (V(t) - V_rest)*decay + I_syn
        v = lif_params.v_rest + (v - lif_params.v_rest) * decay + i_syn;

        if (v >= lif_params.v_threshold) {
            spikes[i] = 1.0;
            membrane_v[i] = lif_params.v_reset;
            refractory[i] = REFRACTORY_PERIOD;
        } else {
            spikes[i] = 0.0;
            membrane_v[i] = v;
        }
    }
}

// ── synaptic_current_shared_tiled ─────────────────────────────────────────
//
// Shared-memory tiled synaptic current computation.
//
// Each workgroup (256 threads) cooperatively loads TILE_SIZE=256 pre-synaptic
// spikes into workgroup shared memory, then all 256 threads accumulate
// contributions from that tile for their own post neuron.
//
// Bind group layout (same as compute_synaptic_current):
//   0 = SynapticParams (uniform)
//   1 = weights (storage, read)         [post_count × pre_count f32]
//   2 = pre_spikes (storage, read)      [pre_count f32]
//   3 = post_currents (storage, rw)     [post_count f32]
//
// Dispatch: ceil(post_count / WORKGROUP_SIZE)

@group(0) @binding(0) var<uniform> syn_params: SynapticParams;
@group(0) @binding(1) var<storage, read> weights: array<f32>;
@group(0) @binding(2) var<storage, read> pre_spikes: array<f32>;
@group(0) @binding(3) var<storage, read_write> post_currents: array<f32>;

// Workgroup shared memory: one tile of pre-synaptic spikes.
// Accessed by all threads in the workgroup simultaneously — eliminates
// repeated global reads of the same spike values across post-neuron rows.
var<workgroup> shared_pre_spikes: array<f32, TILE_SIZE>;

@compute @workgroup_size(256)
fn synaptic_current_shared_tiled(
    @builtin(global_invocation_id) gid: vec3<u32>,
    @builtin(local_invocation_id) lid: vec3<u32>
) {
    let post_j = gid.x;
    var current: f32 = 0.0;

    let num_tiles: u32 = (syn_params.pre_count + TILE_SIZE - 1u) / TILE_SIZE;

    for (var tile: u32 = 0u; tile < num_tiles; tile = tile + 1u) {
        let pre_global = tile * TILE_SIZE + lid.x;

        // All 256 threads collaboratively fill the shared spike cache.
        // Thread lid.x loads the pre neuron at index (tile * 256 + lid.x).
        shared_pre_spikes[lid.x] = select(
            0.0,
            pre_spikes[pre_global],
            pre_global < syn_params.pre_count
        );

        // Synchronise: every thread must see the fully populated tile.
        workgroupBarrier();

        // Each thread accumulates contributions from this tile for its post neuron.
        if (post_j < syn_params.post_count) {
            let tile_start = tile * TILE_SIZE;
            let row_offset = post_j * syn_params.pre_count;
            let tile_len: u32 = min(TILE_SIZE, syn_params.pre_count - tile_start);

            for (var k: u32 = 0u; k < tile_len; k = k + 1u) {
                if (shared_pre_spikes[k] > 0.5) {
                    current = current + weights[row_offset + tile_start + k];
                }
            }
        }

        // Barrier before reusing shared memory for the next tile.
        workgroupBarrier();
    }

    if (post_j < syn_params.post_count) {
        post_currents[post_j] = current;
    }
}
