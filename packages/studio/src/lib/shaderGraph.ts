/**
 * Local stub barrel — re-exports ShaderGraph types from useShaderGraph.ts.
 *
 * The features/shader-editor/ folder imports from
 *   @holoscript/core/shader/graph/ShaderGraph  (sub-path not exported by core),
 * which we redirect here. Over time, swap the imports below for the real
 * core exports once they're available as named sub-path exports.
 */

export { ShaderGraph } from '@/hooks/useShaderGraph';
export type {
  IShaderNode,
  IShaderPort,
  IShaderConnection,
  ISerializedShaderGraph,
  ShaderNodeCategory,
  ShaderDataType,
} from '@/hooks/useShaderGraph';

// ── INodeTemplate (used by NodePalette) ───────────────────────────────────────

import type { ShaderNodeCategory } from '@/hooks/useShaderGraph';

export interface INodeTemplate {
  type: string;
  name: string;
  category: ShaderNodeCategory;
  description?: string;
  inputs: Array<{ name: string; type: string }>;
  outputs: Array<{ name: string; type: string }>;
}

export const NODE_TEMPLATES: Record<ShaderNodeCategory, INodeTemplate[]> = {
  input: [
    { type: 'UVInput', name: 'UV Coordinates', category: 'input', inputs: [], outputs: [{ name: 'uv', type: 'vec2' }] },
    { type: 'TimeInput', name: 'Time', category: 'input', inputs: [], outputs: [{ name: 'time', type: 'float' }] },
    { type: 'PositionInput', name: 'Position', category: 'input', inputs: [], outputs: [{ name: 'position', type: 'vec3' }] },
    { type: 'NormalInput', name: 'Normal', category: 'input', inputs: [], outputs: [{ name: 'normal', type: 'vec3' }] },
  ],
  output: [
    { type: 'FragOutput', name: 'Fragment Output', category: 'output', inputs: [{ name: 'color', type: 'vec4' }], outputs: [] },
    { type: 'VertOutput', name: 'Vertex Output', category: 'output', inputs: [{ name: 'gl_Position', type: 'vec4' }], outputs: [] },
  ],
  math: [
    { type: 'AddNode', name: 'Add', category: 'math', inputs: [{ name: 'a', type: 'float' }, { name: 'b', type: 'float' }], outputs: [{ name: 'result', type: 'float' }] },
    { type: 'MultiplyNode', name: 'Multiply', category: 'math', inputs: [{ name: 'a', type: 'float' }, { name: 'b', type: 'float' }], outputs: [{ name: 'result', type: 'float' }] },
    { type: 'SinNode', name: 'Sine', category: 'math', inputs: [{ name: 'x', type: 'float' }], outputs: [{ name: 'result', type: 'float' }] },
    { type: 'PowNode', name: 'Power', category: 'math', inputs: [{ name: 'base', type: 'float' }, { name: 'exp', type: 'float' }], outputs: [{ name: 'result', type: 'float' }] },
  ],
  vector: [
    { type: 'DotProduct', name: 'Dot Product', category: 'vector', inputs: [{ name: 'a', type: 'vec3' }, { name: 'b', type: 'vec3' }], outputs: [{ name: 'result', type: 'float' }] },
    { type: 'Normalize', name: 'Normalize', category: 'vector', inputs: [{ name: 'v', type: 'vec3' }], outputs: [{ name: 'result', type: 'vec3' }] },
    { type: 'Mix', name: 'Mix/Lerp', category: 'vector', inputs: [{ name: 'a', type: 'vec4' }, { name: 'b', type: 'vec4' }, { name: 't', type: 'float' }], outputs: [{ name: 'result', type: 'vec4' }] },
  ],
  color: [
    { type: 'ColorConstant', name: 'Color', category: 'color', inputs: [], outputs: [{ name: 'color', type: 'vec4' }] },
    { type: 'HsvToRgb', name: 'HSV to RGB', category: 'color', inputs: [{ name: 'hsv', type: 'vec3' }], outputs: [{ name: 'rgb', type: 'vec3' }] },
  ],
  texture: [
    { type: 'Texture2D', name: 'Texture 2D', category: 'texture', inputs: [{ name: 'uv', type: 'vec2' }], outputs: [{ name: 'color', type: 'vec4' }] },
    { type: 'Cubemap', name: 'Cubemap', category: 'texture', inputs: [{ name: 'dir', type: 'vec3' }], outputs: [{ name: 'color', type: 'vec4' }] },
  ],
  utility: [
    { type: 'Clamp', name: 'Clamp', category: 'utility', inputs: [{ name: 'x', type: 'float' }, { name: 'min', type: 'float' }, { name: 'max', type: 'float' }], outputs: [{ name: 'result', type: 'float' }] },
    { type: 'Remap', name: 'Remap', category: 'utility', inputs: [{ name: 'x', type: 'float' }], outputs: [{ name: 'result', type: 'float' }] },
  ],
  material: [
    { type: 'PBROutput', name: 'PBR Material', category: 'material', inputs: [{ name: 'albedo', type: 'vec3' }, { name: 'roughness', type: 'float' }, { name: 'metallic', type: 'float' }], outputs: [] },
  ],
  volumetric: [
    { type: 'FogNode', name: 'Fog', category: 'volumetric', inputs: [{ name: 'density', type: 'float' }], outputs: [{ name: 'alpha', type: 'float' }] },
  ],
  custom: [
    { type: 'CustomGLSL', name: 'Custom GLSL', category: 'custom', inputs: [{ name: 'input', type: 'vec4' }], outputs: [{ name: 'output', type: 'vec4' }] },
  ],
  procedural: [
    {
      type: 'NoiseNode',
      name: 'Noise (Hash)',
      category: 'procedural',
      description: 'Hash-based pseudo-random noise from UV coordinates',
      inputs: [{ name: 'uv', type: 'vec2' }, { name: 'scale', type: 'float' }],
      outputs: [{ name: 'noise', type: 'float' }],
    },
    {
      type: 'VoronoiNode',
      name: 'Voronoi',
      category: 'procedural',
      description: 'Cell noise — distance to nearest grid point',
      inputs: [{ name: 'uv', type: 'vec2' }, { name: 'scale', type: 'float' }],
      outputs: [{ name: 'distance', type: 'float' }],
    },
    {
      type: 'GradientNode',
      name: 'Gradient',
      category: 'procedural',
      description: 'Linear gradient blend between two colors along UV.y',
      inputs: [
        { name: 'uv', type: 'vec2' },
        { name: 'colorA', type: 'vec4' },
        { name: 'colorB', type: 'vec4' },
      ],
      outputs: [{ name: 'color', type: 'vec4' }],
    },
  ],
};

// ── ICompiledShader (used by features/shader-editor/) ─────────────────────────

export interface ICompiledShader {
  vertexCode: string;
  fragmentCode: string;
  uniforms: Array<{ name: string; type: string; value?: unknown; defaultValue?: number | number[] }>;
  textures: string[];
  warnings: string[];
  errors: string[];
}


