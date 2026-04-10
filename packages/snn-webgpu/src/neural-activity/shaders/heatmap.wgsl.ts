/**
 * WGSL shader for the membrane potential heatmap.
 * Renders a 2D grid of neuron membrane voltages as colored quads.
 */

export const heatmapVertexShader = /* wgsl */ `
struct Uniforms {
  gridRows: f32,
  gridCols: f32,
  canvasWidth: f32,
  canvasHeight: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> voltages: array<f32>;
@group(0) @binding(2) var<storage, read> colorMap: array<vec4<f32>>;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) color: vec4<f32>,
}

@vertex
fn main(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) instanceIndex: u32) -> VertexOutput {
  var output: VertexOutput;

  let rows = u32(uniforms.gridRows);
  let cols = u32(uniforms.gridCols);
  let row = instanceIndex / cols;
  let col = instanceIndex % cols;

  let cellW = 2.0 / uniforms.gridCols;
  let cellH = 2.0 / uniforms.gridRows;

  // Quad vertices (two triangles, 6 vertices per instance)
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
  let y = 1.0 - f32(row) * cellH - offset.y * cellH;

  output.position = vec4<f32>(x, y, 0.0, 1.0);

  // Map voltage to color via the color map LUT
  let voltage = voltages[instanceIndex];
  let colorIndex = u32(clamp(voltage, 0.0, 1.0) * 255.0);
  output.color = colorMap[colorIndex];

  return output;
}
`;

export const heatmapFragmentShader = /* wgsl */ `
@fragment
fn main(@location(0) color: vec4<f32>) -> @location(0) vec4<f32> {
  return color;
}
`;
