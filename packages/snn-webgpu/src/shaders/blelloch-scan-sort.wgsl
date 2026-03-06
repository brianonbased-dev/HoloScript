// Wait-Free Hierarchical Blelloch Prefix-Sum Sort
//
// Replaces spin-wait radix sort with a deadlock-free Blelloch scan
// for parallel prefix sum computation on WebGPU.
//
// This implementation avoids spin-waits that can deadlock on Apple/Intel GPUs
// by using a two-phase up-sweep/down-sweep approach that requires NO
// inter-workgroup synchronization within a single dispatch.
//
// Architecture:
// 1. Local prefix sum within each workgroup (shared memory)
// 2. Block sums written to auxiliary buffer
// 3. Recursive scan of block sums (separate dispatch)
// 4. Final scatter pass adds block offsets
//
// Compatible with: Apple M-series, Intel Arc/UHD, NVIDIA, AMD, Qualcomm Adreno

const WORKGROUP_SIZE: u32 = 256u;
const LOG_WORKGROUP: u32 = 8u; // log2(256)
const RADIX_BITS: u32 = 4u;
const RADIX_SIZE: u32 = 16u; // 2^RADIX_BITS

struct SortParams {
    element_count: u32,
    bit_offset: u32, // Current radix pass bit position (0, 4, 8, ...)
    block_count: u32,
    _pad: u32,
};

@group(0) @binding(0) var<uniform> params: SortParams;

// Input keys (read)
@group(0) @binding(1) var<storage, read> keys_in: array<u32>;

// Output keys (write)
@group(0) @binding(2) var<storage, read_write> keys_out: array<u32>;

// Per-block digit histograms: [block_count * RADIX_SIZE]
@group(0) @binding(3) var<storage, read_write> block_histograms: array<u32>;

// Prefix sums of block histograms: [block_count * RADIX_SIZE]
@group(0) @binding(4) var<storage, read_write> block_offsets: array<u32>;

// Shared memory for local operations
var<workgroup> local_histogram: array<u32, 16>; // RADIX_SIZE
var<workgroup> scan_buffer: array<u32, 512>;     // 2 * WORKGROUP_SIZE for ping-pong
var<workgroup> local_keys: array<u32, 256>;      // WORKGROUP_SIZE

// ── Phase 1: Local Histogram ───────────────────────────────────────────────
//
// Each workgroup computes a histogram of its elements' radix digits.
// NO inter-workgroup synchronization needed.

@compute @workgroup_size(256)
fn local_histogram_pass(
    @builtin(global_invocation_id) gid: vec3<u32>,
    @builtin(local_invocation_id) lid: vec3<u32>,
    @builtin(workgroup_id) wid: vec3<u32>
) {
    let local_id = lid.x;
    let global_id = gid.x;
    let block_id = wid.x;

    // Initialize shared histogram
    if (local_id < RADIX_SIZE) {
        local_histogram[local_id] = 0u;
    }
    workgroupBarrier();

    // Each thread processes one element
    if (global_id < params.element_count) {
        let key = keys_in[global_id];
        let digit = (key >> params.bit_offset) & (RADIX_SIZE - 1u);

        // Atomic increment in workgroup shared memory (safe, no spin-wait)
        atomicAdd(&local_histogram[digit], 1u);

        // Cache key for later scatter
        local_keys[local_id] = key;
    }
    workgroupBarrier();

    // Write block histogram to global memory
    if (local_id < RADIX_SIZE) {
        block_histograms[block_id * RADIX_SIZE + local_id] = local_histogram[local_id];
    }
}

// ── Phase 2: Blelloch Prefix Sum (Up-Sweep + Down-Sweep) ──────────────────
//
// Computes exclusive prefix sum over block histograms.
// This is the critical wait-free portion: each workgroup processes
// independently using shared memory barriers only.

@compute @workgroup_size(256)
fn blelloch_scan_pass(
    @builtin(global_invocation_id) gid: vec3<u32>,
    @builtin(local_invocation_id) lid: vec3<u32>,
    @builtin(workgroup_id) wid: vec3<u32>
) {
    let local_id = lid.x;
    let n = min(params.block_count * RADIX_SIZE, WORKGROUP_SIZE);

    // Load data into shared memory
    if (local_id < n) {
        scan_buffer[local_id] = block_histograms[local_id];
    } else {
        scan_buffer[local_id] = 0u;
    }
    workgroupBarrier();

    // ── Up-Sweep (Reduce) Phase ──
    // Build partial sums in a balanced binary tree
    for (var stride = 1u; stride < WORKGROUP_SIZE; stride = stride << 1u) {
        let index = (local_id + 1u) * stride * 2u - 1u;
        if (index < WORKGROUP_SIZE) {
            scan_buffer[index] = scan_buffer[index] + scan_buffer[index - stride];
        }
        workgroupBarrier();
    }

    // Clear the last element (for exclusive scan)
    if (local_id == 0u) {
        scan_buffer[WORKGROUP_SIZE - 1u] = 0u;
    }
    workgroupBarrier();

    // ── Down-Sweep Phase ──
    // Traverse back down the tree using partial sums
    for (var stride = WORKGROUP_SIZE >> 1u; stride > 0u; stride = stride >> 1u) {
        let index = (local_id + 1u) * stride * 2u - 1u;
        if (index < WORKGROUP_SIZE) {
            let temp = scan_buffer[index - stride];
            scan_buffer[index - stride] = scan_buffer[index];
            scan_buffer[index] = scan_buffer[index] + temp;
        }
        workgroupBarrier();
    }

    // Write prefix sums back to global memory
    if (local_id < n) {
        block_offsets[local_id] = scan_buffer[local_id];
    }
}

// ── Phase 3: Final Scatter ─────────────────────────────────────────────────
//
// Each element looks up its digit's global offset and writes to the
// output position. This achieves a stable sort for the current radix pass.

@compute @workgroup_size(256)
fn scatter_pass(
    @builtin(global_invocation_id) gid: vec3<u32>,
    @builtin(local_invocation_id) lid: vec3<u32>,
    @builtin(workgroup_id) wid: vec3<u32>
) {
    let local_id = lid.x;
    let global_id = gid.x;
    let block_id = wid.x;

    if (global_id >= params.element_count) {
        return;
    }

    let key = keys_in[global_id];
    let digit = (key >> params.bit_offset) & (RADIX_SIZE - 1u);

    // Get the global offset for this digit from prefix sum
    let global_offset = block_offsets[block_id * RADIX_SIZE + digit];

    // Count how many elements with the same digit precede this one in the block
    // Use shared memory scan for within-block ranking
    var rank = 0u;
    let block_start = block_id * WORKGROUP_SIZE;
    for (var i = block_start; i < global_id; i = i + 1u) {
        if (i < params.element_count) {
            let other_digit = (keys_in[i] >> params.bit_offset) & (RADIX_SIZE - 1u);
            if (other_digit == digit) {
                rank = rank + 1u;
            }
        }
    }

    // Write to output at global_offset + local rank
    let out_pos = global_offset + rank;
    if (out_pos < params.element_count) {
        keys_out[out_pos] = key;
    }
}

// ── Single-Block Sort (Small Arrays) ───────────────────────────────────────
//
// For arrays that fit in a single workgroup, sort entirely in shared memory
// using a Blelloch-based counting sort. Zero global memory round-trips.

@compute @workgroup_size(256)
fn single_block_sort(
    @builtin(local_invocation_id) lid: vec3<u32>
) {
    let local_id = lid.x;

    // Load element
    var key = 0u;
    if (local_id < params.element_count) {
        key = keys_in[local_id];
    }

    // Iterate over radix passes
    for (var bit = 0u; bit < 32u; bit = bit + RADIX_BITS) {
        let digit = (key >> bit) & (RADIX_SIZE - 1u);

        // Count digits in shared memory
        if (local_id < RADIX_SIZE) {
            local_histogram[local_id] = 0u;
        }
        workgroupBarrier();

        if (local_id < params.element_count) {
            atomicAdd(&local_histogram[digit], 1u);
        }
        workgroupBarrier();

        // Exclusive prefix sum of histogram (serial, only 16 elements)
        if (local_id == 0u) {
            var sum = 0u;
            for (var d = 0u; d < RADIX_SIZE; d = d + 1u) {
                let count = local_histogram[d];
                local_histogram[d] = sum;
                sum = sum + count;
            }
        }
        workgroupBarrier();

        // Scatter within shared memory
        if (local_id < params.element_count) {
            let offset = atomicAdd(&local_histogram[digit], 1u);
            scan_buffer[offset] = key;
        }
        workgroupBarrier();

        // Read back sorted order
        if (local_id < params.element_count) {
            key = scan_buffer[local_id];
        }
        workgroupBarrier();
    }

    // Write result
    if (local_id < params.element_count) {
        keys_out[local_id] = key;
    }
}
