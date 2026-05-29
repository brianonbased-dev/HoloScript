// Trivial smoke kernel — every workgroup adds the global invocation index
// to its slot in a 4 KB f32 buffer. Just enough to verify pipeline
// compilation + dispatch + readback + timing across a real WebGPU adapter.

@group(0) @binding(0) var<storage, read_write> data: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i < arrayLength(&data)) {
    data[i] = data[i] + f32(i) * 0.5;
  }
}
