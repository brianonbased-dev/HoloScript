struct TropicalActivationConfig {
  gain: f32,
  threshold: f32,
  count: u32,
  variant: u32,
}

@group(0) @binding(0) var<storage, read> input_values: array<f32>;
@group(0) @binding(1) var<storage, read_write> output_values: array<f32>;
@group(0) @binding(2) var<uniform> config: TropicalActivationConfig;

@compute @workgroup_size(256)
fn tropical_activate(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= config.count) {
    return;
  }

  let shifted = input_values[idx] - config.threshold;

  if (config.variant == 0u) {
    output_values[idx] = config.gain * max(0.0, shifted);
  } else {
    output_values[idx] = config.gain * min(0.0, shifted);
  }
}
