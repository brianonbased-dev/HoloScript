/**
 * Wait-Free Hierarchical Radix Sort - WebGPU Compute Shader
 *
 * Implements a 4-pass 8-bit LSD radix sort using Blelloch exclusive prefix sum.
 * Designed for sorting Gaussian splat indices by depth (back-to-front).
 *
 * Architecture:
 *   - 4 passes, each sorting 8 bits of a 32-bit key (LSD order: bits 0-7, 8-15, 16-23, 24-31)
 *   - Each pass: histogram -> Blelloch scan -> scatter
 *   - Wait-free: no global atomics, only workgroup-level shared memory with barriers
 *   - Hierarchical block scan for cross-workgroup prefix sums
 *
 * Key design decisions for cross-browser compatibility:
 *   - No subgroup operations (not supported in Safari/Firefox)
 *   - No global atomics (wait-free guarantee)
 *   - workgroup_size(256) fits all GPU vendors (NVIDIA, AMD, Apple, Qualcomm)
 *   - All shared memory fits within 16KB (WebGPU minimum guarantee)
 *
 * References:
 *   - Blelloch (1990): "Prefix Sums and Their Applications"
 *   - Merrill & Grimshaw (2010): "Revisiting Sorting on GPUs"
 *   - HoloScript W.035, G.030.01 (3.COMPRESS research)
 *
 * @version 1.0.0
 */

// =============================================================================
// Constants
// =============================================================================

const WORKGROUP_SIZE: u32 = 256u;
const RADIX_BITS: u32 = 8u;
const RADIX_SIZE: u32 = 256u;  // 2^8 = 256 buckets per pass
const ELEMENTS_PER_THREAD: u32 = 4u;
const BLOCK_SIZE: u32 = 1024u; // WORKGROUP_SIZE * ELEMENTS_PER_THREAD

// =============================================================================
// Uniforms
// =============================================================================

struct SortUniforms {
  totalCount: u32,     // Total number of splats to sort
  bitOffset: u32,      // Current bit offset (0, 8, 16, 24)
  blockCount: u32,     // Number of workgroup blocks
  _pad: u32,
};

@group(0) @binding(0) var<uniform> uniforms: SortUniforms;

// =============================================================================
// Storage Buffers
// =============================================================================

// Keys (depth values, 32-bit uint - quantized camera-space Z)
@group(0) @binding(1) var<storage, read> keysIn: array<u32>;
@group(0) @binding(2) var<storage, read_write> keysOut: array<u32>;

// Values (splat indices, 32-bit uint)
@group(0) @binding(3) var<storage, read> valuesIn: array<u32>;
@group(0) @binding(4) var<storage, read_write> valuesOut: array<u32>;

// Per-block histograms: blockCount * RADIX_SIZE
@group(0) @binding(5) var<storage, read_write> blockHistograms: array<u32>;

// Global prefix sums for each radix digit: RADIX_SIZE
@group(0) @binding(6) var<storage, read_write> globalPrefixes: array<u32>;

// =============================================================================
// Shared Memory
// =============================================================================

// Shared histogram for Blelloch scan (256 entries)
var<workgroup> sharedHist: array<u32, 256>;

// Shared scratch for local key/value staging
var<workgroup> sharedKeys: array<u32, 1024>;
var<workgroup> sharedVals: array<u32, 1024>;

// Shared local histogram for 256-way counting
var<workgroup> sharedLocalHist: array<atomic<u32>, 256>;

// =============================================================================
// Helper: Extract radix digit from key
// =============================================================================

fn extractDigit(key: u32, bitOffset: u32) -> u32 {
  return (key >> bitOffset) & 0xFFu;
}

// =============================================================================
// Pass 1: Build Per-Block Histograms
// =============================================================================

/**
 * Each workgroup processes BLOCK_SIZE elements, counting occurrences of each
 * 8-bit radix digit. Results written to blockHistograms[blockIdx * 256 + digit].
 *
 * This is wait-free: each workgroup writes only to its own histogram region.
 */
@compute @workgroup_size(256)
fn buildHistogram(
  @builtin(global_invocation_id) globalId: vec3<u32>,
  @builtin(local_invocation_id) localId: vec3<u32>,
  @builtin(workgroup_id) groupId: vec3<u32>,
) {
  let tid = localId.x;
  let blockIdx = groupId.x;
  let blockStart = blockIdx * BLOCK_SIZE;

  // Clear shared local histogram
  atomicStore(&sharedLocalHist[tid], 0u);
  workgroupBarrier();

  // Each thread counts ELEMENTS_PER_THREAD elements
  for (var i = 0u; i < ELEMENTS_PER_THREAD; i++) {
    let idx = blockStart + tid * ELEMENTS_PER_THREAD + i;
    if (idx < uniforms.totalCount) {
      let key = keysIn[idx];
      let digit = extractDigit(key, uniforms.bitOffset);
      atomicAdd(&sharedLocalHist[digit], 1u);
    }
  }

  workgroupBarrier();

  // Write shared histogram to global memory
  // Each thread writes one bucket value (256 threads, 256 buckets)
  let histValue = atomicLoad(&sharedLocalHist[tid]);
  blockHistograms[blockIdx * RADIX_SIZE + tid] = histValue;
}

// =============================================================================
// Pass 2: Blelloch Exclusive Prefix Sum (Hierarchical)
// =============================================================================

/**
 * Computes exclusive prefix sums across all block histograms for each radix digit.
 *
 * For each digit d (0..255):
 *   globalPrefixes[d] = sum of all blockHistograms[block * 256 + d] for block < blockCount
 *
 * This pass processes one radix digit per workgroup.
 * Each workgroup computes prefix sums across blocks for its assigned digit.
 *
 * Wait-free: uses Blelloch scan on shared memory with workgroup barriers only.
 */
@compute @workgroup_size(256)
fn blellochScan(
  @builtin(local_invocation_id) localId: vec3<u32>,
  @builtin(workgroup_id) groupId: vec3<u32>,
) {
  let tid = localId.x;
  let digit = groupId.x;  // One workgroup per radix digit

  // Load block histogram values for this digit into shared memory
  // If blockCount <= 256, each thread loads one value
  // For larger counts, we'd need multi-pass (rare for typical splat counts)
  if (tid < uniforms.blockCount) {
    sharedHist[tid] = blockHistograms[tid * RADIX_SIZE + digit];
  } else {
    sharedHist[tid] = 0u;
  }

  workgroupBarrier();

  // ---- Blelloch Up-Sweep (Reduce) Phase ----
  // Build partial sums bottom-up in a binary tree
  var offset = 1u;
  for (var d = WORKGROUP_SIZE >> 1u; d > 0u; d >>= 1u) {
    if (tid < d) {
      let ai = offset * (2u * tid + 1u) - 1u;
      let bi = offset * (2u * tid + 2u) - 1u;
      if (ai < WORKGROUP_SIZE && bi < WORKGROUP_SIZE) {
        sharedHist[bi] += sharedHist[ai];
      }
    }
    offset <<= 1u;
    workgroupBarrier();
  }

  // Store total sum and clear last element for exclusive scan
  if (tid == 0u) {
    // Total across all blocks for this digit
    globalPrefixes[digit] = sharedHist[WORKGROUP_SIZE - 1u];
    sharedHist[WORKGROUP_SIZE - 1u] = 0u;
  }

  workgroupBarrier();

  // ---- Blelloch Down-Sweep Phase ----
  // Propagate partial sums back down to produce exclusive prefix sums
  for (var d = 1u; d < WORKGROUP_SIZE; d <<= 1u) {
    offset >>= 1u;
    if (tid < d) {
      let ai = offset * (2u * tid + 1u) - 1u;
      let bi = offset * (2u * tid + 2u) - 1u;
      if (ai < WORKGROUP_SIZE && bi < WORKGROUP_SIZE) {
        let temp = sharedHist[ai];
        sharedHist[ai] = sharedHist[bi];
        sharedHist[bi] += temp;
      }
    }
    workgroupBarrier();
  }

  // Write back the exclusive prefix sum for each block
  if (tid < uniforms.blockCount) {
    blockHistograms[tid * RADIX_SIZE + digit] = sharedHist[tid];
  }
}

// =============================================================================
// Pass 2b: Global Prefix Sum over Digit Totals
// =============================================================================

/**
 * After blellochScan, globalPrefixes[d] contains the total count for digit d.
 * This pass computes an exclusive prefix sum over those totals to get the
 * global scatter offset for each digit.
 *
 * Single workgroup: 256 threads for 256 digits.
 */
@compute @workgroup_size(256)
fn globalPrefixScan(
  @builtin(local_invocation_id) localId: vec3<u32>,
) {
  let tid = localId.x;

  // Load digit totals into shared memory
  sharedHist[tid] = globalPrefixes[tid];

  workgroupBarrier();

  // ---- Blelloch Up-Sweep ----
  var offset = 1u;
  for (var d = WORKGROUP_SIZE >> 1u; d > 0u; d >>= 1u) {
    if (tid < d) {
      let ai = offset * (2u * tid + 1u) - 1u;
      let bi = offset * (2u * tid + 2u) - 1u;
      if (ai < WORKGROUP_SIZE && bi < WORKGROUP_SIZE) {
        sharedHist[bi] += sharedHist[ai];
      }
    }
    offset <<= 1u;
    workgroupBarrier();
  }

  // Clear last for exclusive scan
  if (tid == 0u) {
    sharedHist[WORKGROUP_SIZE - 1u] = 0u;
  }
  workgroupBarrier();

  // ---- Blelloch Down-Sweep ----
  for (var d = 1u; d < WORKGROUP_SIZE; d <<= 1u) {
    offset >>= 1u;
    if (tid < d) {
      let ai = offset * (2u * tid + 1u) - 1u;
      let bi = offset * (2u * tid + 2u) - 1u;
      if (ai < WORKGROUP_SIZE && bi < WORKGROUP_SIZE) {
        let temp = sharedHist[ai];
        sharedHist[ai] = sharedHist[bi];
        sharedHist[bi] += temp;
      }
    }
    workgroupBarrier();
  }

  // Write exclusive prefix sums back
  globalPrefixes[tid] = sharedHist[tid];
}

// =============================================================================
// Pass 3: Scatter (Reorder)
// =============================================================================

/**
 * Each workgroup scatters its BLOCK_SIZE elements to globally sorted positions.
 *
 * For element at local position i with digit d:
 *   globalDst = globalPrefixes[d]          // global offset for digit d
 *             + blockHistograms[block*256+d] // offset from prior blocks
 *             + localRank                    // rank within this block for digit d
 *
 * Wait-free: each element writes to a unique output position.
 */
@compute @workgroup_size(256)
fn scatter(
  @builtin(local_invocation_id) localId: vec3<u32>,
  @builtin(workgroup_id) groupId: vec3<u32>,
) {
  let tid = localId.x;
  let blockIdx = groupId.x;
  let blockStart = blockIdx * BLOCK_SIZE;

  // Clear shared local histogram for rank computation
  atomicStore(&sharedLocalHist[tid], 0u);
  workgroupBarrier();

  // Load elements into shared memory and compute local histograms
  var myKeys: array<u32, 4>;
  var myVals: array<u32, 4>;
  var myDigits: array<u32, 4>;

  for (var i = 0u; i < ELEMENTS_PER_THREAD; i++) {
    let idx = blockStart + tid * ELEMENTS_PER_THREAD + i;
    if (idx < uniforms.totalCount) {
      myKeys[i] = keysIn[idx];
      myVals[i] = valuesIn[idx];
      myDigits[i] = extractDigit(myKeys[i], uniforms.bitOffset);
    } else {
      myKeys[i] = 0xFFFFFFFFu;  // Sentinel: sorts to end
      myVals[i] = 0u;
      myDigits[i] = 255u;
    }
  }

  // Two-phase local ranking:
  // Phase 1: Count elements per digit in this block
  for (var i = 0u; i < ELEMENTS_PER_THREAD; i++) {
    let idx = blockStart + tid * ELEMENTS_PER_THREAD + i;
    if (idx < uniforms.totalCount) {
      atomicAdd(&sharedLocalHist[myDigits[i]], 1u);
    }
  }

  workgroupBarrier();

  // Phase 2: Each thread needs its rank within its digit bucket.
  // We use a serialized approach per-digit that's safe across all browsers.
  // Load histogram into non-atomic shared for prefix computation.
  let digitCount = atomicLoad(&sharedLocalHist[tid]);
  sharedHist[tid] = digitCount;

  workgroupBarrier();

  // Compute exclusive prefix sum of digit counts (local to this block)
  // This gives the starting offset within the block for each digit
  var blockDigitOffset = 0u;
  for (var d = 0u; d < tid; d++) {
    blockDigitOffset += sharedHist[d];
  }

  // Store the block-local prefix for digit tid
  sharedKeys[tid] = blockDigitOffset;

  workgroupBarrier();

  // Reset shared histogram for per-element ranking
  atomicStore(&sharedLocalHist[tid], 0u);

  workgroupBarrier();

  // Each thread scatters its elements
  for (var i = 0u; i < ELEMENTS_PER_THREAD; i++) {
    let idx = blockStart + tid * ELEMENTS_PER_THREAD + i;
    if (idx < uniforms.totalCount) {
      let digit = myDigits[i];

      // Get rank within this digit in this block (atomically increment)
      let localRank = atomicAdd(&sharedLocalHist[digit], 1u);

      // Compute global destination:
      // globalPrefixes[digit] + blockHistograms[blockIdx * 256 + digit] + localRank
      let globalOffset = globalPrefixes[digit];
      let blockOffset = blockHistograms[blockIdx * RADIX_SIZE + digit];
      let dst = globalOffset + blockOffset + localRank;

      if (dst < uniforms.totalCount) {
        keysOut[dst] = myKeys[i];
        valuesOut[dst] = myVals[i];
      }
    }
  }
}
