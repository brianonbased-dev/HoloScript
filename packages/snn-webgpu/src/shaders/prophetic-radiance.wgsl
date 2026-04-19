// Prophetic Radiance Compute Shader
//
// Consumes the SNN spike buffer + per-probe positions and produces a
// packed RadianceProbe buffer the renderer can sample directly.
//
// "Prophetic" because the output is a *prediction* of indirect-light
// contribution per probe — not a traced result.  The SNN encodes the
// learned mapping (scene context) -> (per-probe radiance proposal).
//
// Layout (must match types.ts: RadianceProbe → packed as 8 f32):
//   [0..2] : rgb (linear, intensity-weighted)
//   [3]    : confidence (clamped to [0, 1])
//   [4..6] : world-space position (echoed back for renderer convenience)
//   [7]    : pad / reserved for temporal stability flag (Phase 3)

struct ProphecyParams {
    probe_count: u32,
    sun_dir_x: f32,
    sun_dir_y: f32,
    sun_dir_z: f32,
    sun_r: f32,
    sun_g: f32,
    sun_b: f32,
    confidence_floor: f32,
};

@group(0) @binding(0) var<uniform> params: ProphecyParams;

// Per-probe spike rates produced by the upstream SNN dispatch.
// Length: probe_count.  Range expected ~ [0, 1] after rate-decoding.
@group(0) @binding(1) var<storage, read> spike_rates: array<f32>;

// Probe positions in world space, packed as vec3<f32> (12 bytes/each).
// Length: probe_count * 3.
@group(0) @binding(2) var<storage, read> probe_positions: array<f32>;

// Optional per-probe albedo tint (RGB linear).  Length: probe_count * 3.
// Caller supplies all-ones if no tint desired.
@group(0) @binding(3) var<storage, read> probe_albedo: array<f32>;

// Output: packed RadianceProbe[].  Length: probe_count * 8.
@group(0) @binding(4) var<storage, read_write> probes_out: array<f32>;

const WORKGROUP_SIZE: u32 = 64u;

@compute @workgroup_size(64)
fn prophetic_radiance(@builtin(global_invocation_id) gid: vec3<u32>) {
    let idx = gid.x;
    if (idx >= params.probe_count) {
        return;
    }

    // Read inputs
    let rate = spike_rates[idx];

    let pos_x = probe_positions[idx * 3u + 0u];
    let pos_y = probe_positions[idx * 3u + 1u];
    let pos_z = probe_positions[idx * 3u + 2u];

    let alb_r = probe_albedo[idx * 3u + 0u];
    let alb_g = probe_albedo[idx * 3u + 1u];
    let alb_b = probe_albedo[idx * 3u + 2u];

    // Confidence = clamped spike rate.  A probe whose neuron never
    // fired gets 0; a saturated neuron gets 1.
    let confidence = clamp(rate, 0.0, 1.0);

    // Predicted radiance = sun_color * albedo * rate.  This is a
    // first-order proxy — the SNN is doing the heavy lifting in
    // `rate`, not here.  The shader stays a fixed-cost mixer.
    var rgb = vec3<f32>(
        params.sun_r * alb_r,
        params.sun_g * alb_g,
        params.sun_b * alb_b,
    ) * confidence;

    // Bias by sun direction so probes facing the sun get more.
    // We approximate facing as "above ground" for now (probes are
    // assumed roughly horizontal-up); Phase 3 adds per-probe normals.
    let facing = max(0.0, params.sun_dir_y);
    rgb = rgb * (0.4 + 0.6 * facing);

    // Drop probes below the confidence floor by zeroing their RGB.
    // The renderer will skip zero-RGB entries cheaply in the blend
    // step rather than re-checking confidence.
    if (confidence < params.confidence_floor) {
        rgb = vec3<f32>(0.0, 0.0, 0.0);
    }

    // Write packed output (8 f32 per probe).
    let base = idx * 8u;
    probes_out[base + 0u] = rgb.r;
    probes_out[base + 1u] = rgb.g;
    probes_out[base + 2u] = rgb.b;
    probes_out[base + 3u] = confidence;
    probes_out[base + 4u] = pos_x;
    probes_out[base + 5u] = pos_y;
    probes_out[base + 6u] = pos_z;
    probes_out[base + 7u] = 0.0; // reserved
}
