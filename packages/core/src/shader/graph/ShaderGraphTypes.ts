/**
 * Shader Graph Type Definitions
 *
 * Node-based visual shader programming system for HoloScript
 */

// ============================================================================
// Node Value Types
// ============================================================================

/**
 * Shader data types
 */
export type ShaderDataType =
  | 'float'
  | 'vec2'
  | 'vec3'
  | 'vec4'
  | 'mat2'
  | 'mat3'
  | 'mat4'
  | 'int'
  | 'ivec2'
  | 'ivec3'
  | 'ivec4'
  | 'bool'
  | 'sampler2D'
  | 'samplerCube';

/**
 * Type compatibility map for connections
 */
export const TYPE_SIZES: Record<ShaderDataType, number> = {
  float: 1,
  vec2: 2,
  vec3: 3,
  vec4: 4,
  mat2: 4,
  mat3: 9,
  mat4: 16,
  int: 1,
  ivec2: 2,
  ivec3: 3,
  ivec4: 4,
  bool: 1,
  sampler2D: 0,
  samplerCube: 0,
};

/**
 * Check if types are compatible for connection
 */
export function areTypesCompatible(from: ShaderDataType, to: ShaderDataType): boolean {
  // Same type always compatible
  if (from === to) return true;

  // Samplers only connect to same type
  if (from === 'sampler2D' || from === 'samplerCube') return false;
  if (to === 'sampler2D' || to === 'samplerCube') return false;

  // Float can promote to vec types
  if (from === 'float' && (to === 'vec2' || to === 'vec3' || to === 'vec4')) return true;

  // Int can promote to float types
  if (from === 'int' && to === 'float') return true;

  // Vec3 can connect to vec4 (with alpha = 1)
  if (from === 'vec3' && to === 'vec4') return true;

  // Vec4 can connect to vec3 (drops alpha)
  if (from === 'vec4' && to === 'vec3') return true;

  return false;
}

/**
 * Get type conversion code
 */
export function getTypeConversion(from: ShaderDataType, to: ShaderDataType, expr: string): string {
  if (from === to) return expr;

  // Float to vec
  if (from === 'float') {
    if (to === 'vec2') return `vec2<f32>(${expr})`;
    if (to === 'vec3') return `vec3<f32>(${expr})`;
    if (to === 'vec4') return `vec4<f32>(${expr})`;
  }

  // Int to float
  if (from === 'int' && to === 'float') return `f32(${expr})`;

  // Vec3 to vec4
  if (from === 'vec3' && to === 'vec4') return `vec4<f32>(${expr}, 1.0)`;

  // Vec4 to vec3
  if (from === 'vec4' && to === 'vec3') return `(${expr}).xyz`;

  return expr;
}

// ============================================================================
// Node Definitions
// ============================================================================

/**
 * Port direction
 */
export type PortDirection = 'input' | 'output';

/**
 * Node port definition
 */
export interface IShaderPort {
  /** Port identifier */
  id: string;
  /** Display name */
  name: string;
  /** Port direction */
  direction: PortDirection;
  /** Data type */
  type: ShaderDataType;
  /** Default value for inputs */
  defaultValue?: number | number[];
  /** Whether this port is required */
  required?: boolean;
  /** Connected port reference */
  connected?: {
    nodeId: string;
    portId: string;
  };
}

/**
 * Node categories
 */
export type NodeCategory =
  | 'input'
  | 'output'
  | 'math'
  | 'vector'
  | 'color'
  | 'texture'
  | 'utility'
  | 'material'
  | 'volumetric'
  | 'custom';

/**
 * Base shader node
 */
export interface IShaderNode {
  /** Unique node ID */
  id: string;
  /** Node type identifier */
  type: string;
  /** Display name */
  name: string;
  /** Category */
  category: NodeCategory;
  /** Input ports */
  inputs: IShaderPort[];
  /** Output ports */
  outputs: IShaderPort[];
  /** Position in graph editor */
  position: { x: number; y: number };
  /** Custom properties */
  properties?: Record<string, unknown>;
  /** Preview enabled */
  preview?: boolean;
}

/**
 * Connection between nodes
 */
export interface IShaderConnection {
  /** Connection ID */
  id: string;
  /** Source node ID */
  fromNode: string;
  /** Source port ID */
  fromPort: string;
  /** Target node ID */
  toNode: string;
  /** Target port ID */
  toPort: string;
}

/**
 * Complete shader graph
 */
export interface IShaderGraph {
  /** Graph ID */
  id: string;
  /** Graph name */
  name: string;
  /** Description */
  description?: string;
  /** All nodes */
  nodes: Map<string, IShaderNode>;
  /** All connections */
  connections: IShaderConnection[];
  /** Graph version */
  version: string;
  /** Metadata */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Node Templates
// ============================================================================

/**
 * Node template for creating new nodes
 */
export interface INodeTemplate {
  /** Node type identifier */
  type: string;
  /** Display name */
  name: string;
  /** Category */
  category: NodeCategory;
  /** Description */
  description: string;
  /** Input port definitions */
  inputs: Omit<IShaderPort, 'direction' | 'connected'>[];
  /** Output port definitions */
  outputs: Omit<IShaderPort, 'direction' | 'connected'>[];
  /** Default properties */
  defaultProperties?: Record<string, unknown>;
  /** WGSL code generator */
  generateCode: (node: IShaderNode, inputs: Record<string, string>) => string;
}

// ============================================================================
// Built-in Node Templates
// ============================================================================

/**
 * Input nodes
 */
export const INPUT_NODES: INodeTemplate[] = [
  {
    type: 'input_position',
    name: 'World Position',
    category: 'input',
    description: 'World space position',
    inputs: [],
    outputs: [{ id: 'position', name: 'Position', type: 'vec3' }],
    generateCode: () => 'in.worldPosition',
  },
  {
    type: 'input_normal',
    name: 'World Normal',
    category: 'input',
    description: 'World space normal',
    inputs: [],
    outputs: [{ id: 'normal', name: 'Normal', type: 'vec3' }],
    generateCode: () => 'in.worldNormal',
  },
  {
    type: 'input_uv',
    name: 'UV Coordinates',
    category: 'input',
    description: 'Texture coordinates',
    inputs: [],
    outputs: [{ id: 'uv', name: 'UV', type: 'vec2' }],
    generateCode: () => 'in.uv',
  },
  {
    type: 'input_time',
    name: 'Time',
    category: 'input',
    description: 'Scene time in seconds',
    inputs: [],
    outputs: [{ id: 'time', name: 'Time', type: 'float' }],
    generateCode: () => 'scene.time',
  },
  {
    type: 'input_camera_position',
    name: 'Camera Position',
    category: 'input',
    description: 'Camera world position',
    inputs: [],
    outputs: [{ id: 'position', name: 'Position', type: 'vec3' }],
    generateCode: () => 'camera.position',
  },
  {
    type: 'input_view_direction',
    name: 'View Direction',
    category: 'input',
    description: 'Direction from surface to camera',
    inputs: [],
    outputs: [{ id: 'direction', name: 'Direction', type: 'vec3' }],
    generateCode: () => 'normalize(camera.position - in.worldPosition)',
  },
  {
    type: 'constant_float',
    name: 'Float',
    category: 'input',
    description: 'Constant float value',
    inputs: [],
    outputs: [{ id: 'value', name: 'Value', type: 'float' }],
    defaultProperties: { value: 0 },
    generateCode: (node) => `${node.properties?.value ?? 0}`,
  },
  {
    type: 'constant_vec2',
    name: 'Vector2',
    category: 'input',
    description: 'Constant vec2 value',
    inputs: [],
    outputs: [{ id: 'value', name: 'Value', type: 'vec2' }],
    defaultProperties: { x: 0, y: 0 },
    generateCode: (node) => {
      const x = node.properties?.x ?? 0;
      const y = node.properties?.y ?? 0;
      return `vec2<f32>(${x}, ${y})`;
    },
  },
  {
    type: 'constant_vec3',
    name: 'Vector3',
    category: 'input',
    description: 'Constant vec3 value',
    inputs: [],
    outputs: [{ id: 'value', name: 'Value', type: 'vec3' }],
    defaultProperties: { x: 0, y: 0, z: 0 },
    generateCode: (node) => {
      const x = node.properties?.x ?? 0;
      const y = node.properties?.y ?? 0;
      const z = node.properties?.z ?? 0;
      return `vec3<f32>(${x}, ${y}, ${z})`;
    },
  },
  {
    type: 'constant_color',
    name: 'Color',
    category: 'input',
    description: 'Constant color value',
    inputs: [],
    outputs: [{ id: 'color', name: 'Color', type: 'vec4' }],
    defaultProperties: { r: 1, g: 1, b: 1, a: 1 },
    generateCode: (node) => {
      const r = node.properties?.r ?? 1;
      const g = node.properties?.g ?? 1;
      const b = node.properties?.b ?? 1;
      const a = node.properties?.a ?? 1;
      return `vec4<f32>(${r}, ${g}, ${b}, ${a})`;
    },
  },
];

/**
 * Math nodes
 */
export const MATH_NODES: INodeTemplate[] = [
  {
    type: 'math_add',
    name: 'Add',
    category: 'math',
    description: 'Add two values',
    inputs: [
      { id: 'a', name: 'A', type: 'float', defaultValue: 0 },
      { id: 'b', name: 'B', type: 'float', defaultValue: 0 },
    ],
    outputs: [{ id: 'result', name: 'Result', type: 'float' }],
    generateCode: (_, inputs) => `(${inputs.a} + ${inputs.b})`,
  },
  {
    type: 'math_subtract',
    name: 'Subtract',
    category: 'math',
    description: 'Subtract two values',
    inputs: [
      { id: 'a', name: 'A', type: 'float', defaultValue: 0 },
      { id: 'b', name: 'B', type: 'float', defaultValue: 0 },
    ],
    outputs: [{ id: 'result', name: 'Result', type: 'float' }],
    generateCode: (_, inputs) => `(${inputs.a} - ${inputs.b})`,
  },
  {
    type: 'math_multiply',
    name: 'Multiply',
    category: 'math',
    description: 'Multiply two values',
    inputs: [
      { id: 'a', name: 'A', type: 'float', defaultValue: 1 },
      { id: 'b', name: 'B', type: 'float', defaultValue: 1 },
    ],
    outputs: [{ id: 'result', name: 'Result', type: 'float' }],
    generateCode: (_, inputs) => `(${inputs.a} * ${inputs.b})`,
  },
  {
    type: 'math_divide',
    name: 'Divide',
    category: 'math',
    description: 'Divide two values',
    inputs: [
      { id: 'a', name: 'A', type: 'float', defaultValue: 1 },
      { id: 'b', name: 'B', type: 'float', defaultValue: 1 },
    ],
    outputs: [{ id: 'result', name: 'Result', type: 'float' }],
    generateCode: (_, inputs) => `(${inputs.a} / max(${inputs.b}, 0.0001))`,
  },
  {
    type: 'math_power',
    name: 'Power',
    category: 'math',
    description: 'Raise to power',
    inputs: [
      { id: 'base', name: 'Base', type: 'float', defaultValue: 2 },
      { id: 'exp', name: 'Exponent', type: 'float', defaultValue: 2 },
    ],
    outputs: [{ id: 'result', name: 'Result', type: 'float' }],
    generateCode: (_, inputs) => `pow(${inputs.base}, ${inputs.exp})`,
  },
  {
    type: 'math_sqrt',
    name: 'Square Root',
    category: 'math',
    description: 'Square root',
    inputs: [{ id: 'value', name: 'Value', type: 'float', defaultValue: 1 }],
    outputs: [{ id: 'result', name: 'Result', type: 'float' }],
    generateCode: (_, inputs) => `sqrt(max(${inputs.value}, 0.0))`,
  },
  {
    type: 'math_abs',
    name: 'Absolute',
    category: 'math',
    description: 'Absolute value',
    inputs: [{ id: 'value', name: 'Value', type: 'float', defaultValue: 0 }],
    outputs: [{ id: 'result', name: 'Result', type: 'float' }],
    generateCode: (_, inputs) => `abs(${inputs.value})`,
  },
  {
    type: 'math_negate',
    name: 'Negate',
    category: 'math',
    description: 'Negate value',
    inputs: [{ id: 'value', name: 'Value', type: 'float', defaultValue: 0 }],
    outputs: [{ id: 'result', name: 'Result', type: 'float' }],
    generateCode: (_, inputs) => `(-${inputs.value})`,
  },
  {
    type: 'math_min',
    name: 'Minimum',
    category: 'math',
    description: 'Minimum of two values',
    inputs: [
      { id: 'a', name: 'A', type: 'float', defaultValue: 0 },
      { id: 'b', name: 'B', type: 'float', defaultValue: 0 },
    ],
    outputs: [{ id: 'result', name: 'Result', type: 'float' }],
    generateCode: (_, inputs) => `min(${inputs.a}, ${inputs.b})`,
  },
  {
    type: 'math_max',
    name: 'Maximum',
    category: 'math',
    description: 'Maximum of two values',
    inputs: [
      { id: 'a', name: 'A', type: 'float', defaultValue: 0 },
      { id: 'b', name: 'B', type: 'float', defaultValue: 0 },
    ],
    outputs: [{ id: 'result', name: 'Result', type: 'float' }],
    generateCode: (_, inputs) => `max(${inputs.a}, ${inputs.b})`,
  },
  {
    type: 'math_clamp',
    name: 'Clamp',
    category: 'math',
    description: 'Clamp value between min and max',
    inputs: [
      { id: 'value', name: 'Value', type: 'float', defaultValue: 0 },
      { id: 'min', name: 'Min', type: 'float', defaultValue: 0 },
      { id: 'max', name: 'Max', type: 'float', defaultValue: 1 },
    ],
    outputs: [{ id: 'result', name: 'Result', type: 'float' }],
    generateCode: (_, inputs) => `clamp(${inputs.value}, ${inputs.min}, ${inputs.max})`,
  },
  {
    type: 'math_saturate',
    name: 'Saturate',
    category: 'math',
    description: 'Clamp between 0 and 1',
    inputs: [{ id: 'value', name: 'Value', type: 'float', defaultValue: 0 }],
    outputs: [{ id: 'result', name: 'Result', type: 'float' }],
    generateCode: (_, inputs) => `saturate(${inputs.value})`,
  },
  {
    type: 'math_lerp',
    name: 'Lerp',
    category: 'math',
    description: 'Linear interpolation',
    inputs: [
      { id: 'a', name: 'A', type: 'float', defaultValue: 0 },
      { id: 'b', name: 'B', type: 'float', defaultValue: 1 },
      { id: 't', name: 'T', type: 'float', defaultValue: 0.5 },
    ],
    outputs: [{ id: 'result', name: 'Result', type: 'float' }],
    generateCode: (_, inputs) => `mix(${inputs.a}, ${inputs.b}, ${inputs.t})`,
  },
  {
    type: 'math_smoothstep',
    name: 'Smoothstep',
    category: 'math',
    description: 'Smooth Hermite interpolation',
    inputs: [
      { id: 'edge0', name: 'Edge0', type: 'float', defaultValue: 0 },
      { id: 'edge1', name: 'Edge1', type: 'float', defaultValue: 1 },
      { id: 'x', name: 'X', type: 'float', defaultValue: 0.5 },
    ],
    outputs: [{ id: 'result', name: 'Result', type: 'float' }],
    generateCode: (_, inputs) => `smoothstep(${inputs.edge0}, ${inputs.edge1}, ${inputs.x})`,
  },
  {
    type: 'math_step',
    name: 'Step',
    category: 'math',
    description: 'Step function',
    inputs: [
      { id: 'edge', name: 'Edge', type: 'float', defaultValue: 0.5 },
      { id: 'x', name: 'X', type: 'float', defaultValue: 0 },
    ],
    outputs: [{ id: 'result', name: 'Result', type: 'float' }],
    generateCode: (_, inputs) => `step(${inputs.edge}, ${inputs.x})`,
  },
  {
    type: 'math_fract',
    name: 'Fraction',
    category: 'math',
    description: 'Fractional part',
    inputs: [{ id: 'value', name: 'Value', type: 'float', defaultValue: 0 }],
    outputs: [{ id: 'result', name: 'Result', type: 'float' }],
    generateCode: (_, inputs) => `fract(${inputs.value})`,
  },
  {
    type: 'math_floor',
    name: 'Floor',
    category: 'math',
    description: 'Floor value',
    inputs: [{ id: 'value', name: 'Value', type: 'float', defaultValue: 0 }],
    outputs: [{ id: 'result', name: 'Result', type: 'float' }],
    generateCode: (_, inputs) => `floor(${inputs.value})`,
  },
  {
    type: 'math_ceil',
    name: 'Ceiling',
    category: 'math',
    description: 'Ceiling value',
    inputs: [{ id: 'value', name: 'Value', type: 'float', defaultValue: 0 }],
    outputs: [{ id: 'result', name: 'Result', type: 'float' }],
    generateCode: (_, inputs) => `ceil(${inputs.value})`,
  },
  {
    type: 'math_round',
    name: 'Round',
    category: 'math',
    description: 'Round value',
    inputs: [{ id: 'value', name: 'Value', type: 'float', defaultValue: 0 }],
    outputs: [{ id: 'result', name: 'Result', type: 'float' }],
    generateCode: (_, inputs) => `round(${inputs.value})`,
  },
  {
    type: 'math_mod',
    name: 'Modulo',
    category: 'math',
    description: 'Modulo operation',
    inputs: [
      { id: 'a', name: 'A', type: 'float', defaultValue: 0 },
      { id: 'b', name: 'B', type: 'float', defaultValue: 1 },
    ],
    outputs: [{ id: 'result', name: 'Result', type: 'float' }],
    generateCode: (_, inputs) => `(${inputs.a} % ${inputs.b})`,
  },
];

/**
 * Trigonometry nodes
 */
export const TRIG_NODES: INodeTemplate[] = [
  {
    type: 'trig_sin',
    name: 'Sine',
    category: 'math',
    description: 'Sine function',
    inputs: [{ id: 'angle', name: 'Angle', type: 'float', defaultValue: 0 }],
    outputs: [{ id: 'result', name: 'Result', type: 'float' }],
    generateCode: (_, inputs) => `sin(${inputs.angle})`,
  },
  {
    type: 'trig_cos',
    name: 'Cosine',
    category: 'math',
    description: 'Cosine function',
    inputs: [{ id: 'angle', name: 'Angle', type: 'float', defaultValue: 0 }],
    outputs: [{ id: 'result', name: 'Result', type: 'float' }],
    generateCode: (_, inputs) => `cos(${inputs.angle})`,
  },
  {
    type: 'trig_tan',
    name: 'Tangent',
    category: 'math',
    description: 'Tangent function',
    inputs: [{ id: 'angle', name: 'Angle', type: 'float', defaultValue: 0 }],
    outputs: [{ id: 'result', name: 'Result', type: 'float' }],
    generateCode: (_, inputs) => `tan(${inputs.angle})`,
  },
  {
    type: 'trig_asin',
    name: 'Arcsine',
    category: 'math',
    description: 'Arcsine function',
    inputs: [{ id: 'value', name: 'Value', type: 'float', defaultValue: 0 }],
    outputs: [{ id: 'result', name: 'Result', type: 'float' }],
    generateCode: (_, inputs) => `asin(${inputs.value})`,
  },
  {
    type: 'trig_acos',
    name: 'Arccosine',
    category: 'math',
    description: 'Arccosine function',
    inputs: [{ id: 'value', name: 'Value', type: 'float', defaultValue: 0 }],
    outputs: [{ id: 'result', name: 'Result', type: 'float' }],
    generateCode: (_, inputs) => `acos(${inputs.value})`,
  },
  {
    type: 'trig_atan',
    name: 'Arctangent',
    category: 'math',
    description: 'Arctangent function',
    inputs: [{ id: 'value', name: 'Value', type: 'float', defaultValue: 0 }],
    outputs: [{ id: 'result', name: 'Result', type: 'float' }],
    generateCode: (_, inputs) => `atan(${inputs.value})`,
  },
  {
    type: 'trig_atan2',
    name: 'Arctangent2',
    category: 'math',
    description: 'Two-argument arctangent',
    inputs: [
      { id: 'y', name: 'Y', type: 'float', defaultValue: 0 },
      { id: 'x', name: 'X', type: 'float', defaultValue: 1 },
    ],
    outputs: [{ id: 'result', name: 'Result', type: 'float' }],
    generateCode: (_, inputs) => `atan2(${inputs.y}, ${inputs.x})`,
  },
  {
    type: 'trig_radians',
    name: 'Degrees to Radians',
    category: 'math',
    description: 'Convert degrees to radians',
    inputs: [{ id: 'degrees', name: 'Degrees', type: 'float', defaultValue: 0 }],
    outputs: [{ id: 'result', name: 'Radians', type: 'float' }],
    generateCode: (_, inputs) => `radians(${inputs.degrees})`,
  },
  {
    type: 'trig_degrees',
    name: 'Radians to Degrees',
    category: 'math',
    description: 'Convert radians to degrees',
    inputs: [{ id: 'radians', name: 'Radians', type: 'float', defaultValue: 0 }],
    outputs: [{ id: 'result', name: 'Degrees', type: 'float' }],
    generateCode: (_, inputs) => `degrees(${inputs.radians})`,
  },
];

/**
 * Vector nodes
 */
export const VECTOR_NODES: INodeTemplate[] = [
  {
    type: 'vector_make_vec2',
    name: 'Make Vec2',
    category: 'vector',
    description: 'Create vec2 from components',
    inputs: [
      { id: 'x', name: 'X', type: 'float', defaultValue: 0 },
      { id: 'y', name: 'Y', type: 'float', defaultValue: 0 },
    ],
    outputs: [{ id: 'vector', name: 'Vector', type: 'vec2' }],
    generateCode: (_, inputs) => `vec2<f32>(${inputs.x}, ${inputs.y})`,
  },
  {
    type: 'vector_make_vec3',
    name: 'Make Vec3',
    category: 'vector',
    description: 'Create vec3 from components',
    inputs: [
      { id: 'x', name: 'X', type: 'float', defaultValue: 0 },
      { id: 'y', name: 'Y', type: 'float', defaultValue: 0 },
      { id: 'z', name: 'Z', type: 'float', defaultValue: 0 },
    ],
    outputs: [{ id: 'vector', name: 'Vector', type: 'vec3' }],
    generateCode: (_, inputs) => `vec3<f32>(${inputs.x}, ${inputs.y}, ${inputs.z})`,
  },
  {
    type: 'vector_make_vec4',
    name: 'Make Vec4',
    category: 'vector',
    description: 'Create vec4 from components',
    inputs: [
      { id: 'x', name: 'X', type: 'float', defaultValue: 0 },
      { id: 'y', name: 'Y', type: 'float', defaultValue: 0 },
      { id: 'z', name: 'Z', type: 'float', defaultValue: 0 },
      { id: 'w', name: 'W', type: 'float', defaultValue: 1 },
    ],
    outputs: [{ id: 'vector', name: 'Vector', type: 'vec4' }],
    generateCode: (_, inputs) => `vec4<f32>(${inputs.x}, ${inputs.y}, ${inputs.z}, ${inputs.w})`,
  },
  {
    type: 'vector_split_vec2',
    name: 'Split Vec2',
    category: 'vector',
    description: 'Split vec2 into components',
    inputs: [{ id: 'vector', name: 'Vector', type: 'vec2', defaultValue: [0, 0] }],
    outputs: [
      { id: 'x', name: 'X', type: 'float' },
      { id: 'y', name: 'Y', type: 'float' },
    ],
    generateCode: (_, inputs) => inputs.vector,
  },
  {
    type: 'vector_split_vec3',
    name: 'Split Vec3',
    category: 'vector',
    description: 'Split vec3 into components',
    inputs: [{ id: 'vector', name: 'Vector', type: 'vec3', defaultValue: [0, 0, 0] }],
    outputs: [
      { id: 'x', name: 'X', type: 'float' },
      { id: 'y', name: 'Y', type: 'float' },
      { id: 'z', name: 'Z', type: 'float' },
    ],
    generateCode: (_, inputs) => inputs.vector,
  },
  {
    type: 'vector_split_vec4',
    name: 'Split Vec4',
    category: 'vector',
    description: 'Split vec4 into components',
    inputs: [{ id: 'vector', name: 'Vector', type: 'vec4', defaultValue: [0, 0, 0, 1] }],
    outputs: [
      { id: 'x', name: 'X', type: 'float' },
      { id: 'y', name: 'Y', type: 'float' },
      { id: 'z', name: 'Z', type: 'float' },
      { id: 'w', name: 'W', type: 'float' },
    ],
    generateCode: (_, inputs) => inputs.vector,
  },
  {
    type: 'vector_normalize',
    name: 'Normalize',
    category: 'vector',
    description: 'Normalize vector',
    inputs: [{ id: 'vector', name: 'Vector', type: 'vec3', defaultValue: [1, 0, 0] }],
    outputs: [{ id: 'result', name: 'Result', type: 'vec3' }],
    generateCode: (_, inputs) => `normalize(${inputs.vector})`,
  },
  {
    type: 'vector_length',
    name: 'Length',
    category: 'vector',
    description: 'Vector length',
    inputs: [{ id: 'vector', name: 'Vector', type: 'vec3', defaultValue: [0, 0, 0] }],
    outputs: [{ id: 'length', name: 'Length', type: 'float' }],
    generateCode: (_, inputs) => `length(${inputs.vector})`,
  },
  {
    type: 'vector_distance',
    name: 'Distance',
    category: 'vector',
    description: 'Distance between vectors',
    inputs: [
      { id: 'a', name: 'A', type: 'vec3', defaultValue: [0, 0, 0] },
      { id: 'b', name: 'B', type: 'vec3', defaultValue: [0, 0, 0] },
    ],
    outputs: [{ id: 'distance', name: 'Distance', type: 'float' }],
    generateCode: (_, inputs) => `distance(${inputs.a}, ${inputs.b})`,
  },
  {
    type: 'vector_dot',
    name: 'Dot Product',
    category: 'vector',
    description: 'Dot product',
    inputs: [
      { id: 'a', name: 'A', type: 'vec3', defaultValue: [1, 0, 0] },
      { id: 'b', name: 'B', type: 'vec3', defaultValue: [1, 0, 0] },
    ],
    outputs: [{ id: 'result', name: 'Result', type: 'float' }],
    generateCode: (_, inputs) => `dot(${inputs.a}, ${inputs.b})`,
  },
  {
    type: 'vector_cross',
    name: 'Cross Product',
    category: 'vector',
    description: 'Cross product',
    inputs: [
      { id: 'a', name: 'A', type: 'vec3', defaultValue: [1, 0, 0] },
      { id: 'b', name: 'B', type: 'vec3', defaultValue: [0, 1, 0] },
    ],
    outputs: [{ id: 'result', name: 'Result', type: 'vec3' }],
    generateCode: (_, inputs) => `cross(${inputs.a}, ${inputs.b})`,
  },
  {
    type: 'vector_reflect',
    name: 'Reflect',
    category: 'vector',
    description: 'Reflect vector',
    inputs: [
      { id: 'incident', name: 'Incident', type: 'vec3', defaultValue: [1, 0, 0] },
      { id: 'normal', name: 'Normal', type: 'vec3', defaultValue: [0, 1, 0] },
    ],
    outputs: [{ id: 'result', name: 'Result', type: 'vec3' }],
    generateCode: (_, inputs) => `reflect(${inputs.incident}, ${inputs.normal})`,
  },
  {
    type: 'vector_refract',
    name: 'Refract',
    category: 'vector',
    description: 'Refract vector',
    inputs: [
      { id: 'incident', name: 'Incident', type: 'vec3', defaultValue: [1, 0, 0] },
      { id: 'normal', name: 'Normal', type: 'vec3', defaultValue: [0, 1, 0] },
      { id: 'eta', name: 'Eta', type: 'float', defaultValue: 1.0 },
    ],
    outputs: [{ id: 'result', name: 'Result', type: 'vec3' }],
    generateCode: (_, inputs) => `refract(${inputs.incident}, ${inputs.normal}, ${inputs.eta})`,
  },
];

/**
 * Color nodes
 */
export const COLOR_NODES: INodeTemplate[] = [
  {
    type: 'color_blend',
    name: 'Blend',
    category: 'color',
    description: 'Blend two colors',
    inputs: [
      { id: 'a', name: 'A', type: 'vec4', defaultValue: [0, 0, 0, 1] },
      { id: 'b', name: 'B', type: 'vec4', defaultValue: [1, 1, 1, 1] },
      { id: 'factor', name: 'Factor', type: 'float', defaultValue: 0.5 },
    ],
    outputs: [{ id: 'result', name: 'Result', type: 'vec4' }],
    generateCode: (_, inputs) => `mix(${inputs.a}, ${inputs.b}, ${inputs.factor})`,
  },
  {
    type: 'color_hue_shift',
    name: 'Hue Shift',
    category: 'color',
    description: 'Shift hue of color',
    inputs: [
      { id: 'color', name: 'Color', type: 'vec3', defaultValue: [1, 0, 0] },
      { id: 'shift', name: 'Shift', type: 'float', defaultValue: 0 },
    ],
    outputs: [{ id: 'result', name: 'Result', type: 'vec3' }],
    generateCode: (_, inputs) => `hueShift(${inputs.color}, ${inputs.shift})`,
  },
  {
    type: 'color_saturation',
    name: 'Saturation',
    category: 'color',
    description: 'Adjust color saturation',
    inputs: [
      { id: 'color', name: 'Color', type: 'vec3', defaultValue: [1, 0.5, 0.5] },
      { id: 'saturation', name: 'Saturation', type: 'float', defaultValue: 1 },
    ],
    outputs: [{ id: 'result', name: 'Result', type: 'vec3' }],
    generateCode: (_, inputs) => {
      return `mix(vec3<f32>(dot(${inputs.color}, vec3<f32>(0.299, 0.587, 0.114))), ${inputs.color}, ${inputs.saturation})`;
    },
  },
  {
    type: 'color_brightness',
    name: 'Brightness',
    category: 'color',
    description: 'Adjust color brightness',
    inputs: [
      { id: 'color', name: 'Color', type: 'vec3', defaultValue: [0.5, 0.5, 0.5] },
      { id: 'brightness', name: 'Brightness', type: 'float', defaultValue: 1 },
    ],
    outputs: [{ id: 'result', name: 'Result', type: 'vec3' }],
    generateCode: (_, inputs) => `(${inputs.color} * ${inputs.brightness})`,
  },
  {
    type: 'color_contrast',
    name: 'Contrast',
    category: 'color',
    description: 'Adjust color contrast',
    inputs: [
      { id: 'color', name: 'Color', type: 'vec3', defaultValue: [0.5, 0.5, 0.5] },
      { id: 'contrast', name: 'Contrast', type: 'float', defaultValue: 1 },
    ],
    outputs: [{ id: 'result', name: 'Result', type: 'vec3' }],
    generateCode: (_, inputs) =>
      `((${inputs.color} - vec3<f32>(0.5)) * ${inputs.contrast} + vec3<f32>(0.5))`,
  },
  {
    type: 'color_invert',
    name: 'Invert',
    category: 'color',
    description: 'Invert color',
    inputs: [{ id: 'color', name: 'Color', type: 'vec3', defaultValue: [0.5, 0.5, 0.5] }],
    outputs: [{ id: 'result', name: 'Result', type: 'vec3' }],
    generateCode: (_, inputs) => `(vec3<f32>(1.0) - ${inputs.color})`,
  },
  {
    type: 'color_grayscale',
    name: 'Grayscale',
    category: 'color',
    description: 'Convert to grayscale',
    inputs: [{ id: 'color', name: 'Color', type: 'vec3', defaultValue: [1, 0, 0] }],
    outputs: [{ id: 'result', name: 'Gray', type: 'float' }],
    generateCode: (_, inputs) => `dot(${inputs.color}, vec3<f32>(0.299, 0.587, 0.114))`,
  },
];

/**
 * Texture nodes
 */
export const TEXTURE_NODES: INodeTemplate[] = [
  {
    type: 'texture_sample',
    name: 'Sample Texture',
    category: 'texture',
    description: 'Sample a 2D texture',
    inputs: [
      { id: 'texture', name: 'Texture', type: 'sampler2D' },
      { id: 'uv', name: 'UV', type: 'vec2', defaultValue: [0, 0] },
    ],
    outputs: [{ id: 'color', name: 'Color', type: 'vec4' }],
    generateCode: (node, inputs) => {
      const textureId = node.properties?.textureId ?? 'defaultTexture';
      return `textureSample(${textureId}, ${textureId}Sampler, ${inputs.uv})`;
    },
  },
  {
    type: 'texture_sample_level',
    name: 'Sample Texture Level',
    category: 'texture',
    description: 'Sample texture at specific mip level',
    inputs: [
      { id: 'texture', name: 'Texture', type: 'sampler2D' },
      { id: 'uv', name: 'UV', type: 'vec2', defaultValue: [0, 0] },
      { id: 'level', name: 'Level', type: 'float', defaultValue: 0 },
    ],
    outputs: [{ id: 'color', name: 'Color', type: 'vec4' }],
    generateCode: (node, inputs) => {
      const textureId = node.properties?.textureId ?? 'defaultTexture';
      return `textureSampleLevel(${textureId}, ${textureId}Sampler, ${inputs.uv}, ${inputs.level})`;
    },
  },
  {
    type: 'texture_tiling_offset',
    name: 'Tiling and Offset',
    category: 'texture',
    description: 'Apply tiling and offset to UVs',
    inputs: [
      { id: 'uv', name: 'UV', type: 'vec2', defaultValue: [0, 0] },
      { id: 'tiling', name: 'Tiling', type: 'vec2', defaultValue: [1, 1] },
      { id: 'offset', name: 'Offset', type: 'vec2', defaultValue: [0, 0] },
    ],
    outputs: [{ id: 'result', name: 'Result', type: 'vec2' }],
    generateCode: (_, inputs) => `(${inputs.uv} * ${inputs.tiling} + ${inputs.offset})`,
  },
];

/**
 * Utility nodes
 */
export const UTILITY_NODES: INodeTemplate[] = [
  {
    type: 'utility_fresnel',
    name: 'Fresnel',
    category: 'utility',
    description: 'Fresnel effect',
    inputs: [
      { id: 'normal', name: 'Normal', type: 'vec3', defaultValue: [0, 1, 0] },
      { id: 'viewDir', name: 'View Dir', type: 'vec3', defaultValue: [0, 0, 1] },
      { id: 'power', name: 'Power', type: 'float', defaultValue: 5 },
    ],
    outputs: [{ id: 'result', name: 'Result', type: 'float' }],
    generateCode: (_, inputs) =>
      `pow(1.0 - saturate(dot(${inputs.normal}, ${inputs.viewDir})), ${inputs.power})`,
  },
  {
    type: 'utility_noise_simple',
    name: 'Simple Noise',
    category: 'utility',
    description: 'Simple value noise',
    inputs: [{ id: 'uv', name: 'UV', type: 'vec2', defaultValue: [0, 0] }],
    outputs: [{ id: 'noise', name: 'Noise', type: 'float' }],
    generateCode: (_, inputs) => `simpleNoise(${inputs.uv})`,
  },
  {
    type: 'utility_gradient_noise',
    name: 'Gradient Noise',
    category: 'utility',
    description: 'Perlin-like gradient noise',
    inputs: [{ id: 'uv', name: 'UV', type: 'vec2', defaultValue: [0, 0] }],
    outputs: [{ id: 'noise', name: 'Noise', type: 'float' }],
    generateCode: (_, inputs) => `gradientNoise(${inputs.uv})`,
  },
  {
    type: 'utility_voronoi',
    name: 'Voronoi',
    category: 'utility',
    description: 'Voronoi noise',
    inputs: [
      { id: 'uv', name: 'UV', type: 'vec2', defaultValue: [0, 0] },
      { id: 'scale', name: 'Scale', type: 'float', defaultValue: 5 },
    ],
    outputs: [
      { id: 'cells', name: 'Cells', type: 'float' },
      { id: 'distance', name: 'Distance', type: 'float' },
    ],
    generateCode: (_, inputs) => `voronoi(${inputs.uv} * ${inputs.scale})`,
  },
  {
    type: 'utility_remap',
    name: 'Remap',
    category: 'utility',
    description: 'Remap value from one range to another',
    inputs: [
      { id: 'value', name: 'Value', type: 'float', defaultValue: 0 },
      { id: 'inMin', name: 'In Min', type: 'float', defaultValue: 0 },
      { id: 'inMax', name: 'In Max', type: 'float', defaultValue: 1 },
      { id: 'outMin', name: 'Out Min', type: 'float', defaultValue: 0 },
      { id: 'outMax', name: 'Out Max', type: 'float', defaultValue: 1 },
    ],
    outputs: [{ id: 'result', name: 'Result', type: 'float' }],
    generateCode: (_, inputs) => {
      return `(${inputs.outMin} + (${inputs.value} - ${inputs.inMin}) * (${inputs.outMax} - ${inputs.outMin}) / (${inputs.inMax} - ${inputs.inMin}))`;
    },
  },
  {
    type: 'utility_if',
    name: 'Branch',
    category: 'utility',
    description: 'Conditional selection',
    inputs: [
      { id: 'condition', name: 'Condition', type: 'float', defaultValue: 0 },
      { id: 'true', name: 'True', type: 'float', defaultValue: 1 },
      { id: 'false', name: 'False', type: 'float', defaultValue: 0 },
    ],
    outputs: [{ id: 'result', name: 'Result', type: 'float' }],
    generateCode: (_, inputs) =>
      `select(${inputs.false}, ${inputs.true}, ${inputs.condition} > 0.5)`,
  },
  {
    type: 'utility_compare',
    name: 'Compare',
    category: 'utility',
    description: 'Compare two values',
    inputs: [
      { id: 'a', name: 'A', type: 'float', defaultValue: 0 },
      { id: 'b', name: 'B', type: 'float', defaultValue: 0 },
    ],
    outputs: [
      { id: 'equal', name: 'A == B', type: 'float' },
      { id: 'less', name: 'A < B', type: 'float' },
      { id: 'greater', name: 'A > B', type: 'float' },
    ],
    generateCode: (_, inputs) => `compareValues(${inputs.a}, ${inputs.b})`,
  },
];

/**
 * Advanced material nodes — exotic optics, animation, weathering
 */
export const ADVANCED_MATERIAL_NODES: INodeTemplate[] = [
  {
    type: 'blackbody',
    name: 'Blackbody Radiation',
    category: 'material',
    description: 'Convert temperature (Kelvin) to emission color via Planck approximation',
    inputs: [
      { id: 'temperature', name: 'Temperature K', type: 'float', defaultValue: 5500 },
      { id: 'intensity', name: 'Intensity', type: 'float', defaultValue: 1 },
    ],
    outputs: [{ id: 'color', name: 'Color', type: 'vec3' }],
    generateCode: (_, inputs) => `blackbodyColor(${inputs.temperature}, ${inputs.intensity})`,
  },
  {
    type: 'sparkle',
    name: 'Sparkle / Glitter',
    category: 'material',
    description: 'Stochastic micro-facet flashing for glitter, metallic paint, mica',
    inputs: [
      { id: 'uv', name: 'UV', type: 'vec2', defaultValue: [0, 0] },
      { id: 'density', name: 'Density', type: 'float', defaultValue: 50 },
      { id: 'size', name: 'Size', type: 'float', defaultValue: 0.02 },
      { id: 'intensity', name: 'Intensity', type: 'float', defaultValue: 1 },
      { id: 'viewDir', name: 'View Dir', type: 'vec3', defaultValue: [0, 0, 1] },
      { id: 'normal', name: 'Normal', type: 'vec3', defaultValue: [0, 0, 1] },
    ],
    outputs: [
      { id: 'flash', name: 'Flash', type: 'float' },
      { id: 'color', name: 'Color', type: 'vec3' },
    ],
    generateCode: (_, inputs) =>
      `sparkleFlash(${inputs.uv}, ${inputs.density}, ${inputs.size}, ${inputs.intensity}, ${inputs.viewDir}, ${inputs.normal})`,
  },
  {
    type: 'animated_pattern',
    name: 'Animated Pattern',
    category: 'material',
    description: 'Time-varying surface patterns: ripple, flicker, pulse, flow, wave, noise',
    inputs: [
      { id: 'uv', name: 'UV', type: 'vec2', defaultValue: [0, 0] },
      { id: 'time', name: 'Time', type: 'float', defaultValue: 0 },
      { id: 'patternType', name: 'Pattern (0-7)', type: 'float', defaultValue: 0 },
      { id: 'speed', name: 'Speed', type: 'float', defaultValue: 1 },
      { id: 'amplitude', name: 'Amplitude', type: 'float', defaultValue: 1 },
      { id: 'scale', name: 'Scale', type: 'float', defaultValue: 1 },
    ],
    outputs: [
      { id: 'value', name: 'Value', type: 'float' },
      { id: 'offset', name: 'UV Offset', type: 'vec2' },
    ],
    generateCode: (_, inputs) =>
      `animatedPattern(${inputs.uv}, ${inputs.time}, ${inputs.patternType}, ${inputs.speed}, ${inputs.amplitude}, ${inputs.scale})`,
  },
  {
    type: 'weathering',
    name: 'Weathering',
    category: 'material',
    description: 'Procedural surface degradation: rust, moss, crack, peel, patina, frost',
    inputs: [
      { id: 'uv', name: 'UV', type: 'vec2', defaultValue: [0, 0] },
      { id: 'progress', name: 'Progress', type: 'float', defaultValue: 0 },
      { id: 'weatherType', name: 'Type (0-9)', type: 'float', defaultValue: 0 },
      { id: 'seed', name: 'Seed', type: 'float', defaultValue: 42 },
      { id: 'baseColor', name: 'Base Color', type: 'vec3', defaultValue: [1, 1, 1] },
    ],
    outputs: [
      { id: 'color', name: 'Weathered Color', type: 'vec3' },
      { id: 'mask', name: 'Mask', type: 'float' },
      { id: 'roughnessMod', name: 'Roughness Mod', type: 'float' },
    ],
    generateCode: (_, inputs) =>
      `weatheringSurface(${inputs.uv}, ${inputs.progress}, ${inputs.weatherType}, ${inputs.seed}, ${inputs.baseColor})`,
  },
  {
    type: 'dual_layer_blend',
    name: 'Dual Layer Blend',
    category: 'material',
    description: 'Blend two material layers (paint over rust, moss over stone, snow on branches)',
    inputs: [
      { id: 'baseColor', name: 'Base Color', type: 'vec3', defaultValue: [0.5, 0.5, 0.5] },
      { id: 'baseRoughness', name: 'Base Rough', type: 'float', defaultValue: 0.5 },
      { id: 'baseMetallic', name: 'Base Metal', type: 'float', defaultValue: 0 },
      { id: 'topColor', name: 'Top Color', type: 'vec3', defaultValue: [1, 1, 1] },
      { id: 'topRoughness', name: 'Top Rough', type: 'float', defaultValue: 0.5 },
      { id: 'topMetallic', name: 'Top Metal', type: 'float', defaultValue: 0 },
      { id: 'blendFactor', name: 'Blend', type: 'float', defaultValue: 0.5 },
      { id: 'blendMode', name: 'Mode (0-3)', type: 'float', defaultValue: 0 },
      { id: 'normal', name: 'Normal', type: 'vec3', defaultValue: [0, 0, 1] },
      { id: 'uv', name: 'UV', type: 'vec2', defaultValue: [0, 0] },
    ],
    outputs: [
      { id: 'color', name: 'Color', type: 'vec3' },
      { id: 'roughness', name: 'Roughness', type: 'float' },
      { id: 'metallic', name: 'Metallic', type: 'float' },
    ],
    generateCode: (_, inputs) =>
      `dualLayerBlend(${inputs.baseColor}, ${inputs.baseRoughness}, ${inputs.baseMetallic}, ${inputs.topColor}, ${inputs.topRoughness}, ${inputs.topMetallic}, ${inputs.blendFactor}, ${inputs.blendMode}, ${inputs.normal}, ${inputs.uv})`,
  },
  {
    type: 'fluorescence',
    name: 'Fluorescence',
    category: 'material',
    description: 'UV-reactive emission: absorb short wavelengths, emit longer ones',
    inputs: [
      { id: 'lightColor', name: 'Light Color', type: 'vec3', defaultValue: [1, 1, 1] },
      { id: 'excitationColor', name: 'Excitation', type: 'vec3', defaultValue: [0.2, 0, 0.5] },
      { id: 'emissionColor', name: 'Emission', type: 'vec3', defaultValue: [0, 1, 0] },
      { id: 'intensity', name: 'Intensity', type: 'float', defaultValue: 1 },
    ],
    outputs: [{ id: 'emission', name: 'Emission', type: 'vec3' }],
    generateCode: (_, inputs) =>
      `fluorescenceEmit(${inputs.lightColor}, ${inputs.excitationColor}, ${inputs.emissionColor}, ${inputs.intensity})`,
  },
  {
    type: 'retroreflection',
    name: 'Retroreflection',
    category: 'material',
    description: 'Light bounces back toward source (road signs, safety vests, cat eyes)',
    inputs: [
      { id: 'viewDir', name: 'View Dir', type: 'vec3', defaultValue: [0, 0, 1] },
      { id: 'lightDir', name: 'Light Dir', type: 'vec3', defaultValue: [0, 1, 0] },
      { id: 'normal', name: 'Normal', type: 'vec3', defaultValue: [0, 0, 1] },
      { id: 'intensity', name: 'Intensity', type: 'float', defaultValue: 1 },
    ],
    outputs: [{ id: 'reflectance', name: 'Reflectance', type: 'float' }],
    generateCode: (_, inputs) =>
      `retroReflect(${inputs.viewDir}, ${inputs.lightDir}, ${inputs.normal}, ${inputs.intensity})`,
  },
];

/**
 * Volumetric material nodes — ray marching, 3D noise, scattering
 */
export const VOLUMETRIC_NODES: INodeTemplate[] = [
  {
    type: 'volume_density',
    name: 'Volume Density',
    category: 'volumetric',
    description: 'Sample/generate volume density at a 3D position',
    inputs: [
      { id: 'position', name: 'Position', type: 'vec3', defaultValue: [0, 0, 0] },
      { id: 'baseDensity', name: 'Base Density', type: 'float', defaultValue: 0.5 },
      { id: 'noiseScale', name: 'Noise Scale', type: 'float', defaultValue: 4 },
      { id: 'noiseOctaves', name: 'Octaves', type: 'float', defaultValue: 4 },
      { id: 'time', name: 'Time', type: 'float', defaultValue: 0 },
    ],
    outputs: [{ id: 'density', name: 'Density', type: 'float' }],
    generateCode: (_, inputs) =>
      `volumeDensity(${inputs.position}, ${inputs.baseDensity}, ${inputs.noiseScale}, ${inputs.noiseOctaves}, ${inputs.time})`,
  },
  {
    type: 'volume_noise_3d',
    name: '3D FBM Noise',
    category: 'volumetric',
    description: 'Fractal Brownian motion noise in 3D for volumetric density',
    inputs: [
      { id: 'position', name: 'Position', type: 'vec3', defaultValue: [0, 0, 0] },
      { id: 'octaves', name: 'Octaves', type: 'float', defaultValue: 4 },
      { id: 'lacunarity', name: 'Lacunarity', type: 'float', defaultValue: 2 },
      { id: 'gain', name: 'Gain', type: 'float', defaultValue: 0.5 },
    ],
    outputs: [{ id: 'noise', name: 'Noise', type: 'float' }],
    generateCode: (_, inputs) =>
      `fbmNoise3D(${inputs.position}, i32(${inputs.octaves}), ${inputs.lacunarity}, ${inputs.gain})`,
  },
  {
    type: 'volume_curl_noise',
    name: 'Curl Noise 3D',
    category: 'volumetric',
    description: 'Divergence-free curl noise for smoke/fire turbulence',
    inputs: [
      { id: 'position', name: 'Position', type: 'vec3', defaultValue: [0, 0, 0] },
      { id: 'scale', name: 'Scale', type: 'float', defaultValue: 1 },
    ],
    outputs: [{ id: 'curl', name: 'Curl', type: 'vec3' }],
    generateCode: (_, inputs) => `curlNoise3D(${inputs.position} * ${inputs.scale})`,
  },
  {
    type: 'volume_scatter',
    name: 'Volume Scattering',
    category: 'volumetric',
    description: 'Beer-Lambert absorption + Henyey-Greenstein phase function',
    inputs: [
      { id: 'density', name: 'Density', type: 'float', defaultValue: 0.5 },
      { id: 'scattering', name: 'Scattering', type: 'float', defaultValue: 0.5 },
      { id: 'absorption', name: 'Absorption', type: 'float', defaultValue: 0.1 },
      { id: 'stepLength', name: 'Step Length', type: 'float', defaultValue: 0.1 },
      { id: 'lightDir', name: 'Light Dir', type: 'vec3', defaultValue: [0, 1, 0] },
      { id: 'viewDir', name: 'View Dir', type: 'vec3', defaultValue: [0, 0, 1] },
      { id: 'anisotropy', name: 'Phase Aniso', type: 'float', defaultValue: 0.3 },
    ],
    outputs: [
      { id: 'transmittance', name: 'Transmittance', type: 'float' },
      { id: 'inScatter', name: 'In-Scatter', type: 'float' },
    ],
    generateCode: (_, inputs) =>
      `volumeScatter(${inputs.density}, ${inputs.scattering}, ${inputs.absorption}, ${inputs.stepLength}, ${inputs.lightDir}, ${inputs.viewDir}, ${inputs.anisotropy})`,
  },
  {
    type: 'volume_emission',
    name: 'Volume Emission',
    category: 'volumetric',
    description: 'Self-luminous volume contribution (fire, neon gas, aurora)',
    inputs: [
      { id: 'density', name: 'Density', type: 'float', defaultValue: 0.5 },
      { id: 'emissionColor', name: 'Emission Color', type: 'vec3', defaultValue: [1, 0.5, 0] },
      { id: 'intensity', name: 'Intensity', type: 'float', defaultValue: 1 },
      { id: 'temperature', name: 'Temperature K', type: 'float', defaultValue: 0 },
    ],
    outputs: [{ id: 'emission', name: 'Emission', type: 'vec3' }],
    generateCode: (_, inputs) =>
      `volumeEmission(${inputs.density}, ${inputs.emissionColor}, ${inputs.intensity}, ${inputs.temperature})`,
  },
  {
    type: 'volume_height_fog',
    name: 'Height Fog',
    category: 'volumetric',
    description: 'Height-attenuated fog density with exponential falloff',
    inputs: [
      { id: 'position', name: 'Position', type: 'vec3', defaultValue: [0, 0, 0] },
      { id: 'groundLevel', name: 'Ground Y', type: 'float', defaultValue: 0 },
      { id: 'density', name: 'Density', type: 'float', defaultValue: 0.5 },
      { id: 'falloff', name: 'Falloff', type: 'float', defaultValue: 2 },
    ],
    outputs: [{ id: 'density', name: 'Density', type: 'float' }],
    generateCode: (_, inputs) =>
      `heightFogDensity(${inputs.position}, ${inputs.groundLevel}, ${inputs.density}, ${inputs.falloff})`,
  },
  {
    type: 'volume_fire_density',
    name: 'Fire Density',
    category: 'volumetric',
    description: 'Fire-specific density: buoyancy, turbulence, temperature → emission',
    inputs: [
      { id: 'position', name: 'Position', type: 'vec3', defaultValue: [0, 0, 0] },
      { id: 'time', name: 'Time', type: 'float', defaultValue: 0 },
      { id: 'turbulence', name: 'Turbulence', type: 'float', defaultValue: 0.5 },
      { id: 'riseSpeed', name: 'Rise Speed', type: 'float', defaultValue: 1 },
      { id: 'scale', name: 'Scale', type: 'float', defaultValue: 2 },
    ],
    outputs: [
      { id: 'density', name: 'Density', type: 'float' },
      { id: 'temperature', name: 'Temperature', type: 'float' },
    ],
    generateCode: (_, inputs) =>
      `fireDensity(${inputs.position}, ${inputs.time}, ${inputs.turbulence}, ${inputs.riseSpeed}, ${inputs.scale})`,
  },
];

/**
 * Output nodes
 */
export const OUTPUT_NODES: INodeTemplate[] = [
  {
    type: 'output_surface',
    name: 'Surface Output',
    category: 'output',
    description: 'PBR surface output with SSS, sheen, anisotropy, clearcoat, iridescence',
    inputs: [
      { id: 'baseColor', name: 'Base Color', type: 'vec3', defaultValue: [1, 1, 1] },
      { id: 'metallic', name: 'Metallic', type: 'float', defaultValue: 0 },
      { id: 'roughness', name: 'Roughness', type: 'float', defaultValue: 0.5 },
      { id: 'normal', name: 'Normal', type: 'vec3', defaultValue: [0, 0, 1] },
      { id: 'emission', name: 'Emission', type: 'vec3', defaultValue: [0, 0, 0] },
      { id: 'alpha', name: 'Alpha', type: 'float', defaultValue: 1 },
      { id: 'ao', name: 'AO', type: 'float', defaultValue: 1 },
      // Advanced PBR
      { id: 'sheenColor', name: 'Sheen Color', type: 'vec3', defaultValue: [0, 0, 0] },
      { id: 'sheenRoughness', name: 'Sheen Roughness', type: 'float', defaultValue: 0 },
      { id: 'subsurfaceThickness', name: 'SSS Thickness', type: 'float', defaultValue: 0 },
      { id: 'subsurfaceColor', name: 'SSS Color', type: 'vec3', defaultValue: [1, 1, 1] },
      { id: 'anisotropy', name: 'Anisotropy', type: 'float', defaultValue: 0 },
      { id: 'anisotropyRotation', name: 'Aniso Rotation', type: 'float', defaultValue: 0 },
      { id: 'clearcoat', name: 'Clearcoat', type: 'float', defaultValue: 0 },
      { id: 'clearcoatRoughness', name: 'Clearcoat Rough', type: 'float', defaultValue: 0 },
      { id: 'iridescence', name: 'Iridescence', type: 'float', defaultValue: 0 },
      // Exotic optics
      { id: 'sparkleIntensity', name: 'Sparkle', type: 'float', defaultValue: 0 },
      { id: 'sparkleDensity', name: 'Sparkle Density', type: 'float', defaultValue: 0 },
      { id: 'fluorescenceColor', name: 'Fluorescence', type: 'vec3', defaultValue: [0, 0, 0] },
      { id: 'fluorescenceIntensity', name: 'Fluor Intensity', type: 'float', defaultValue: 0 },
      { id: 'blackbodyTemp', name: 'Blackbody K', type: 'float', defaultValue: 0 },
      { id: 'retroreflection', name: 'Retroreflect', type: 'float', defaultValue: 0 },
    ],
    outputs: [],
    generateCode: (_, inputs) => {
      return `SurfaceOutput(
        ${inputs.baseColor},
        ${inputs.metallic},
        ${inputs.roughness},
        ${inputs.normal},
        ${inputs.emission},
        ${inputs.alpha},
        ${inputs.ao},
        ${inputs.sheenColor},
        ${inputs.sheenRoughness},
        ${inputs.subsurfaceThickness},
        ${inputs.subsurfaceColor},
        ${inputs.anisotropy},
        ${inputs.anisotropyRotation},
        ${inputs.clearcoat},
        ${inputs.clearcoatRoughness},
        ${inputs.iridescence},
        ${inputs.sparkleIntensity},
        ${inputs.sparkleDensity},
        ${inputs.fluorescenceColor},
        ${inputs.fluorescenceIntensity},
        ${inputs.blackbodyTemp},
        ${inputs.retroreflection}
      )`;
    },
  },
  {
    type: 'output_unlit',
    name: 'Unlit Output',
    category: 'output',
    description: 'Unlit color output',
    inputs: [{ id: 'color', name: 'Color', type: 'vec4', defaultValue: [1, 1, 1, 1] }],
    outputs: [],
    generateCode: (_, inputs) => `${inputs.color}`,
  },
  {
    type: 'output_vertex_offset',
    name: 'Vertex Offset',
    category: 'output',
    description: 'Vertex position offset',
    inputs: [{ id: 'offset', name: 'Offset', type: 'vec3', defaultValue: [0, 0, 0] }],
    outputs: [],
    generateCode: (_, inputs) => inputs.offset,
  },
  {
    type: 'output_volume',
    name: 'Volume Output',
    category: 'output',
    description: 'Volumetric output — ray-marched density, color, emission, scattering',
    inputs: [
      { id: 'density', name: 'Density', type: 'float', defaultValue: 0.5 },
      { id: 'color', name: 'Color', type: 'vec3', defaultValue: [1, 1, 1] },
      { id: 'emission', name: 'Emission', type: 'vec3', defaultValue: [0, 0, 0] },
      { id: 'scattering', name: 'Scattering', type: 'float', defaultValue: 0.5 },
      { id: 'absorption', name: 'Absorption', type: 'float', defaultValue: 0.1 },
      { id: 'steps', name: 'Steps', type: 'float', defaultValue: 64 },
      { id: 'maxDistance', name: 'Max Dist', type: 'float', defaultValue: 10 },
    ],
    outputs: [],
    generateCode: (_, inputs) => {
      return `VolumeOutput(
        ${inputs.density},
        ${inputs.color},
        ${inputs.emission},
        ${inputs.scattering},
        ${inputs.absorption},
        ${inputs.steps},
        ${inputs.maxDistance}
      )`;
    },
  },
];

/**
 * Screen-space, caustics, and displacement nodes
 */
export const SCREEN_SPACE_NODES: INodeTemplate[] = [
  {
    type: 'caustics',
    name: 'Caustics',
    category: 'material',
    description: 'Underwater caustic light patterns from refracted light',
    inputs: [
      { id: 'position', name: 'Position', type: 'vec3', defaultValue: [0, 0, 0] },
      { id: 'time', name: 'Time', type: 'float', defaultValue: 0 },
      { id: 'scale', name: 'Scale', type: 'float', defaultValue: 1 },
      { id: 'speed', name: 'Speed', type: 'float', defaultValue: 1 },
      { id: 'intensity', name: 'Intensity', type: 'float', defaultValue: 1 },
      { id: 'color', name: 'Color', type: 'vec3', defaultValue: [0.2, 0.5, 0.8] },
    ],
    outputs: [
      { id: 'caustic', name: 'Caustic', type: 'vec3' },
      { id: 'mask', name: 'Mask', type: 'float' },
    ],
    generateCode: (_, inputs) =>
      `causticPattern(${inputs.position}, ${inputs.time}, ${inputs.scale}, ${inputs.speed}, ${inputs.intensity}, ${inputs.color})`,
  },
  {
    type: 'displacement_map',
    name: 'Displacement Map',
    category: 'material',
    description: 'Vertex displacement from height/normal map',
    inputs: [
      { id: 'position', name: 'Position', type: 'vec3', defaultValue: [0, 0, 0] },
      { id: 'normal', name: 'Normal', type: 'vec3', defaultValue: [0, 1, 0] },
      { id: 'height', name: 'Height', type: 'float', defaultValue: 0 },
      { id: 'strength', name: 'Strength', type: 'float', defaultValue: 1 },
      { id: 'midLevel', name: 'Mid Level', type: 'float', defaultValue: 0.5 },
    ],
    outputs: [{ id: 'displaced', name: 'Displaced', type: 'vec3' }],
    generateCode: (_, inputs) =>
      `displacementMap(${inputs.position}, ${inputs.normal}, ${inputs.height}, ${inputs.strength}, ${inputs.midLevel})`,
  },
  {
    type: 'parallax_occlusion',
    name: 'Parallax Occlusion',
    category: 'material',
    description: 'Parallax occlusion mapping for depth illusion without extra geometry',
    inputs: [
      { id: 'uv', name: 'UV', type: 'vec2', defaultValue: [0, 0] },
      { id: 'viewDir', name: 'View Dir', type: 'vec3', defaultValue: [0, 0, 1] },
      { id: 'heightScale', name: 'Height Scale', type: 'float', defaultValue: 0.05 },
      { id: 'numLayers', name: 'Layers', type: 'float', defaultValue: 32 },
    ],
    outputs: [
      { id: 'adjustedUV', name: 'Adjusted UV', type: 'vec2' },
      { id: 'depth', name: 'Depth', type: 'float' },
    ],
    generateCode: (_, inputs) =>
      `parallaxOcclusionMap(${inputs.uv}, ${inputs.viewDir}, ${inputs.heightScale}, ${inputs.numLayers})`,
  },
  {
    type: 'screen_space_reflection',
    name: 'Screen Space Reflection',
    category: 'material',
    description: 'SSR — ray-marched reflections in screen space',
    inputs: [
      { id: 'uv', name: 'UV', type: 'vec2', defaultValue: [0, 0] },
      { id: 'normal', name: 'Normal', type: 'vec3', defaultValue: [0, 1, 0] },
      { id: 'viewDir', name: 'View Dir', type: 'vec3', defaultValue: [0, 0, 1] },
      { id: 'roughness', name: 'Roughness', type: 'float', defaultValue: 0.1 },
      { id: 'maxSteps', name: 'Max Steps', type: 'float', defaultValue: 64 },
      { id: 'stepSize', name: 'Step Size', type: 'float', defaultValue: 0.1 },
    ],
    outputs: [
      { id: 'reflection', name: 'Reflection', type: 'vec3' },
      { id: 'hitMask', name: 'Hit Mask', type: 'float' },
    ],
    generateCode: (_, inputs) =>
      `screenSpaceReflect(${inputs.uv}, ${inputs.normal}, ${inputs.viewDir}, ${inputs.roughness}, ${inputs.maxSteps}, ${inputs.stepSize})`,
  },
  {
    type: 'screen_space_gi',
    name: 'Screen Space GI',
    category: 'material',
    description: 'Approximate global illumination from screen-space data',
    inputs: [
      { id: 'uv', name: 'UV', type: 'vec2', defaultValue: [0, 0] },
      { id: 'normal', name: 'Normal', type: 'vec3', defaultValue: [0, 1, 0] },
      { id: 'radius', name: 'Radius', type: 'float', defaultValue: 1 },
      { id: 'samples', name: 'Samples', type: 'float', defaultValue: 16 },
      { id: 'bounceIntensity', name: 'Bounce', type: 'float', defaultValue: 1 },
    ],
    outputs: [{ id: 'indirectLight', name: 'Indirect', type: 'vec3' }],
    generateCode: (_, inputs) =>
      `screenSpaceGI(${inputs.uv}, ${inputs.normal}, ${inputs.radius}, ${inputs.samples}, ${inputs.bounceIntensity})`,
  },
  {
    type: 'water_surface',
    name: 'Water Surface',
    category: 'material',
    description: 'Combined water surface effect with waves, refraction, foam, and caustics',
    inputs: [
      { id: 'position', name: 'Position', type: 'vec3', defaultValue: [0, 0, 0] },
      { id: 'time', name: 'Time', type: 'float', defaultValue: 0 },
      { id: 'waveScale', name: 'Wave Scale', type: 'float', defaultValue: 1 },
      { id: 'waveSpeed', name: 'Wave Speed', type: 'float', defaultValue: 1 },
      { id: 'depth', name: 'Water Depth', type: 'float', defaultValue: 5 },
      { id: 'foamThreshold', name: 'Foam Thresh', type: 'float', defaultValue: 0.7 },
    ],
    outputs: [
      { id: 'displacement', name: 'Displacement', type: 'vec3' },
      { id: 'normal', name: 'Normal', type: 'vec3' },
      { id: 'foam', name: 'Foam', type: 'float' },
      { id: 'caustic', name: 'Caustic', type: 'float' },
    ],
    generateCode: (_, inputs) =>
      `waterSurface(${inputs.position}, ${inputs.time}, ${inputs.waveScale}, ${inputs.waveSpeed}, ${inputs.depth}, ${inputs.foamThreshold})`,
  },
  {
    type: 'caustics_refractive',
    name: 'Refractive Caustics',
    category: 'material',
    description: 'Chromatic refractive caustics with RGB dispersion for prismatic light patterns',
    inputs: [
      { id: 'position', name: 'Position', type: 'vec3', defaultValue: [0, 0, 0] },
      { id: 'time', name: 'Time', type: 'float', defaultValue: 0 },
      { id: 'scale', name: 'Scale', type: 'float', defaultValue: 1 },
      { id: 'speed', name: 'Speed', type: 'float', defaultValue: 1 },
      { id: 'intensity', name: 'Intensity', type: 'float', defaultValue: 1 },
      { id: 'dispersion', name: 'Dispersion', type: 'float', defaultValue: 0.05 },
    ],
    outputs: [
      { id: 'caustic', name: 'Caustic', type: 'vec3' },
      { id: 'mask', name: 'Mask', type: 'float' },
    ],
    generateCode: (_, inputs) =>
      `causticChromatic(${inputs.position}, ${inputs.time}, ${inputs.scale}, ${inputs.speed}, ${inputs.intensity}, ${inputs.dispersion})`,
  },
  {
    type: 'displacement_enhanced',
    name: 'Enhanced Displacement',
    category: 'material',
    description: 'Displacement with reconstructed normal and optional anisotropic weighting',
    inputs: [
      { id: 'position', name: 'Position', type: 'vec3', defaultValue: [0, 0, 0] },
      { id: 'normal', name: 'Normal', type: 'vec3', defaultValue: [0, 1, 0] },
      { id: 'tangent', name: 'Tangent', type: 'vec3', defaultValue: [1, 0, 0] },
      { id: 'height', name: 'Height', type: 'float', defaultValue: 0 },
      { id: 'strength', name: 'Strength', type: 'float', defaultValue: 1 },
      { id: 'anisotropy', name: 'Anisotropy', type: 'float', defaultValue: 0 },
      { id: 'midLevel', name: 'Mid Level', type: 'float', defaultValue: 0.5 },
    ],
    outputs: [
      { id: 'displaced', name: 'Displaced', type: 'vec3' },
      { id: 'reconstructedNormal', name: 'Normal', type: 'vec3' },
    ],
    generateCode: (_, inputs) =>
      `anisotropicDisplacement(${inputs.position}, ${inputs.normal}, ${inputs.tangent}, ${inputs.height}, ${inputs.strength}, ${inputs.anisotropy}, ${inputs.midLevel})`,
  },
  {
    type: 'underwater_foam',
    name: 'Underwater Foam',
    category: 'material',
    description: 'Procedural underwater foam patches driven by turbulence',
    inputs: [
      { id: 'position', name: 'Position', type: 'vec3', defaultValue: [0, 0, 0] },
      { id: 'time', name: 'Time', type: 'float', defaultValue: 0 },
      { id: 'scale', name: 'Scale', type: 'float', defaultValue: 1 },
      { id: 'threshold', name: 'Threshold', type: 'float', defaultValue: 0.6 },
    ],
    outputs: [{ id: 'foam', name: 'Foam', type: 'float' }],
    generateCode: (_, inputs) =>
      `underwaterFoam(${inputs.position}, ${inputs.time}, ${inputs.scale}, ${inputs.threshold})`,
  },
];

/**
 * All built-in node templates
 */
export const ALL_NODE_TEMPLATES: INodeTemplate[] = [
  ...INPUT_NODES,
  ...MATH_NODES,
  ...TRIG_NODES,
  ...VECTOR_NODES,
  ...COLOR_NODES,
  ...TEXTURE_NODES,
  ...UTILITY_NODES,
  ...ADVANCED_MATERIAL_NODES,
  ...VOLUMETRIC_NODES,
  ...SCREEN_SPACE_NODES,
  ...OUTPUT_NODES,
];

/**
 * Get node template by type
 */
export function getNodeTemplate(type: string): INodeTemplate | undefined {
  return ALL_NODE_TEMPLATES.find((t) => t.type === type);
}

// ============================================================================
// Compilation Types
// ============================================================================

/**
 * Compiled shader output
 */
export interface ICompiledShader {
  /** Vertex shader code */
  vertexCode: string;
  /** Fragment shader code */
  fragmentCode: string;
  /** Required uniforms */
  uniforms: IShaderUniform[];
  /** Required textures */
  textures: IShaderTexture[];
  /** Compilation warnings */
  warnings: string[];
  /** Compilation errors */
  errors: string[];
}

/**
 * Shader uniform
 */
export interface IShaderUniform {
  name: string;
  type: ShaderDataType;
  defaultValue?: number | number[];
}

/**
 * Shader texture
 */
export interface IShaderTexture {
  name: string;
  type: 'texture_2d' | 'texture_cube';
  binding: number;
}

/**
 * Compilation options
 */
export interface ICompileOptions {
  /** Target shader format */
  target: 'wgsl' | 'glsl' | 'hlsl';
  /** Enable optimizations */
  optimize?: boolean;
  /** Include debug info */
  debug?: boolean;
  /** Custom defines */
  defines?: Record<string, string>;
}
