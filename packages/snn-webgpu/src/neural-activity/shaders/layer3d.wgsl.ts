/**
 * WGSL shader for the 3D layer activation view.
 * Renders stacked layer planes with activation-based coloring and height displacement.
 */

export const layer3dVertexShader = /* wgsl */ `
struct Uniforms {
  viewProjection: mat4x4<f32>,
  layerIndex: f32,
  layerCount: f32,
  rows: f32,
  cols: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> activations: array<f32>;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) activation: f32,
  @location(1) layerNorm: f32,
}

@vertex
fn main(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) instanceIndex: u32) -> VertexOutput {
  var output: VertexOutput;

  let rows = u32(uniforms.rows);
  let cols = u32(uniforms.cols);
  let row = instanceIndex / cols;
  let col = instanceIndex % cols;

  let cellW = 2.0 / uniforms.cols;
  let cellH = 2.0 / uniforms.rows;

  var offsets = array<vec2<f32>, 6>(
    vec2<f32>(0.0, 0.0),
    vec2<f32>(1.0, 0.0),
    vec2<f32>(0.0, 1.0),
    vec2<f32>(1.0, 0.0),
    vec2<f32>(1.0, 1.0),
    vec2<f32>(0.0, 1.0),
  );

  let offset = offsets[vertexIndex % 6u];
  let x = -1.0 + f32(col) * cellW + offset.x * cellW;
  let z = -1.0 + f32(row) * cellH + offset.y * cellH;

  let act = activations[instanceIndex];
  let layerSpacing = 3.0 / max(uniforms.layerCount, 1.0);
  let y = (uniforms.layerIndex - uniforms.layerCount * 0.5) * layerSpacing + act * 0.5;

  let pos = vec4<f32>(x, y, z, 1.0);
  output.position = uniforms.viewProjection * pos;
  output.activation = act;
  output.layerNorm = uniforms.layerIndex / max(uniforms.layerCount - 1.0, 1.0);

  return output;
}
`;

export const layer3dFragmentShader = /* wgsl */ `
@fragment
fn main(@location(0) activation: f32, @location(1) layerNorm: f32) -> @location(0) vec4<f32> {
  // Blend from blue (low activation) to yellow (high activation)
  // Tint slightly by layer position for depth cue
  let r = activation * 0.9 + layerNorm * 0.1;
  let g = activation * 0.8 + (1.0 - layerNorm) * 0.1;
  let b = (1.0 - activation) * 0.7;
  let a = 0.7 + activation * 0.3;
  return vec4<f32>(r, g, b, a);
}
`;
