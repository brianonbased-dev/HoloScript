/**
 * WGSL shader for the spike raster plot.
 * Renders each spike event as a small point/dot on a time-vs-neuron grid.
 */

export const rasterVertexShader = /* wgsl */ `
struct Uniforms {
  timeWindowStart: f32,
  timeWindowEnd: f32,
  neuronCount: f32,
  pointSize: f32,
}

struct SpikeData {
  neuronIndex: f32,
  timestampMs: f32,
  populationIndex: f32,
  _pad: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> spikes: array<SpikeData>;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) color: vec4<f32>,
}

@vertex
fn main(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) instanceIndex: u32) -> VertexOutput {
  var output: VertexOutput;

  let spike = spikes[instanceIndex];
  let timeDuration = uniforms.timeWindowEnd - uniforms.timeWindowStart;
  let normalizedTime = (spike.timestampMs - uniforms.timeWindowStart) / timeDuration;
  let normalizedNeuron = spike.neuronIndex / uniforms.neuronCount;

  // Map to clip space: time on X, neuron on Y
  let x = normalizedTime * 2.0 - 1.0;
  let y = 1.0 - normalizedNeuron * 2.0;

  // Small quad for each spike point
  let halfSize = uniforms.pointSize / 1000.0;
  var offsets = array<vec2<f32>, 6>(
    vec2<f32>(-halfSize, -halfSize),
    vec2<f32>( halfSize, -halfSize),
    vec2<f32>(-halfSize,  halfSize),
    vec2<f32>( halfSize, -halfSize),
    vec2<f32>( halfSize,  halfSize),
    vec2<f32>(-halfSize,  halfSize),
  );

  let offset = offsets[vertexIndex % 6u];
  output.position = vec4<f32>(x + offset.x, y + offset.y, 0.0, 1.0);

  // Color by population index
  let popColors = array<vec4<f32>, 4>(
    vec4<f32>(0.12, 0.47, 0.71, 1.0), // blue
    vec4<f32>(1.0, 0.50, 0.05, 1.0),  // orange
    vec4<f32>(0.17, 0.63, 0.17, 1.0), // green
    vec4<f32>(0.84, 0.15, 0.16, 1.0), // red
  );
  let popIdx = u32(spike.populationIndex) % 4u;
  output.color = popColors[popIdx];

  return output;
}
`;

export const rasterFragmentShader = /* wgsl */ `
@fragment
fn main(@location(0) color: vec4<f32>) -> @location(0) vec4<f32> {
  return color;
}
`;
