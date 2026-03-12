/**
 * shaderGraph.ts — Self-contained ShaderGraph class + utility types.
 *
 * Previously re-exported ShaderGraph from @holoscript/core, but that class is
 * not available in the patched dist. This file now provides the full
 * implementation used by:
 *   - features/shader-editor/ShaderEditorService
 *   - features/shader-editor/LivePreviewService
 *   - features/shader-editor/MaterialLibrary
 *   - features/shader-editor/UndoRedoSystem
 *   - hooks/useShaderGraph (Zustand store)
 */

// ──────────────────────────────────────────────────────────────────────────────
// Core types
// ──────────────────────────────────────────────────────────────────────────────

export type ShaderDataType = 'float' | 'vec2' | 'vec3' | 'vec4' | 'texture' | 'sampler' | 'bool' | 'int' | 'color';
export type ShaderNodeCategory = 'input' | 'output' | 'math' | 'vector' | 'color' | 'texture' | 'utility' | 'material' | 'volumetric' | 'custom' | 'procedural';

export interface IShaderPort {
  id?: string;               // Populated by createNode(); undefined in template registry
  name: string;
  type: ShaderDataType;
  direction?: 'in' | 'out'; // Populated by createNode(); undefined in template registry
  connected?: boolean;
  defaultValue?: unknown;
}

export interface IShaderNode {
  id: string;
  type: string;
  label: string;
  category: ShaderNodeCategory | string;
  position: { x: number; y: number };
  /** Unified port list (inputs + outputs with direction field) */
  ports: IShaderPort[];
  inputs: IShaderPort[];
  outputs: IShaderPort[];
  properties: Record<string, unknown>;
}

export interface IShaderConnection {
  id: string;
  fromNodeId: string;
  fromPort: string;
  toNodeId: string;
  toPort: string;
}

export interface ISerializedShaderGraph {
  id: string;
  name: string;
  description?: string;
  version: number;
  nodes: IShaderNode[];
  connections: IShaderConnection[];
  createdAt?: number;
  updatedAt?: number;
}

// ──────────────────────────────────────────────────────────────────────────────
// Node type registry — maps node type key → default port definitions
// ──────────────────────────────────────────────────────────────────────────────

const NODE_REGISTRY: Record<string, { label: string; inputs: IShaderPort[]; outputs: IShaderPort[] }> = {
  // Math
  constant_float: { label: 'Float', inputs: [], outputs: [{ name: 'value', type: 'float' }] },
  constant_color: { label: 'Color', inputs: [], outputs: [{ name: 'color', type: 'color' }] },
  constant_vec3: { label: 'Vec3', inputs: [], outputs: [{ name: 'value', type: 'vec3' }] },
  add: { label: 'Add', inputs: [{ name: 'a', type: 'float' }, { name: 'b', type: 'float' }], outputs: [{ name: 'result', type: 'float' }] },
  multiply: { label: 'Multiply', inputs: [{ name: 'a', type: 'float' }, { name: 'b', type: 'float' }], outputs: [{ name: 'result', type: 'float' }] },
  // Textures
  texture2d: { label: 'Texture 2D', inputs: [{ name: 'uv', type: 'vec2' }], outputs: [{ name: 'color', type: 'color' }] },
  // Outputs
  output_surface: {
    label: 'Surface Output',
    inputs: [
      { name: 'baseColor', type: 'color' },
      { name: 'roughness', type: 'float' },
      { name: 'metallic', type: 'float' },
      { name: 'normal', type: 'vec3' },
    ],
    outputs: [],
  },
  // Lighting
  fresnel: { label: 'Fresnel', inputs: [{ name: 'normal', type: 'vec3' }], outputs: [{ name: 'factor', type: 'float' }] },
  // Procedural
  noise: { label: 'Noise', inputs: [{ name: 'uv', type: 'vec2' }], outputs: [{ name: 'value', type: 'float' }] },
};

function getNodeDef(type: string) {
  return NODE_REGISTRY[type] ?? {
    label: type,
    inputs: [],
    outputs: [{ name: 'output', type: 'float' as ShaderDataType }],
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// ShaderGraph class
// ──────────────────────────────────────────────────────────────────────────────

export class ShaderGraph {
  id: string;
  name: string;
  description: string;
  version: number;
  nodes: Map<string, IShaderNode>;
  connections: IShaderConnection[];
  createdAt: number;
  updatedAt: number;

  constructor(name = 'Untitled Shader', description = '') {
    this.id = `sg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    this.name = name;
    this.description = description;
    this.version = 1;
    this.nodes = new Map();
    this.connections = [];
    this.createdAt = Date.now();
    this.updatedAt = Date.now();
  }

  // ── Node management ────────────────────────────────────────────────────────

  createNode(type: string, position: { x: number; y: number } = { x: 0, y: 0 }): IShaderNode {
    const def = getNodeDef(type);
    const category = (() => {
      for (const [cat, templates] of Object.entries(NODE_REGISTRY)) {
        if (templates.label === def.label || cat === type.toLowerCase()) return cat as ShaderNodeCategory;
      }
      // Try matching via NODE_TEMPLATES
      for (const [cat, tmplList] of Object.entries(NODE_TEMPLATES)) {
        if (tmplList.some((t) => t.type === type)) return cat as ShaderNodeCategory;
      }
      return 'custom' as ShaderNodeCategory;
    })();

    const inputs: IShaderPort[] = def.inputs.map((p) => ({
      id: `${type}-in-${p.name}`,
      name: p.name,
      type: p.type,
      direction: 'in' as const,
    }));
    const outputs: IShaderPort[] = def.outputs.map((p) => ({
      id: `${type}-out-${p.name}`,
      name: p.name,
      type: p.type,
      direction: 'out' as const,
    }));

    const node: IShaderNode = {
      id: `node-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      label: def.label,
      category,
      position,
      inputs,
      outputs,
      ports: [...inputs, ...outputs],
      properties: {},
    };
    this.nodes.set(node.id, node);
    this.version++;
    this.updatedAt = Date.now();
    return node;
  }

  /** Legacy addNode — accepts (type, x, y, params?) */
  addNode(type: string, x = 0, y = 0, params?: Record<string, unknown>): IShaderNode {
    const node = this.createNode(type, { x, y });
    if (params) Object.assign(node.properties, params);
    return node;
  }

  addCustomNode(node: IShaderNode): void {
    this.nodes.set(node.id, { ...node, ports: node.ports ?? [...(node.inputs ?? []), ...(node.outputs ?? [])] });
    this.version++;
    this.updatedAt = Date.now();
  }

  getNode(id: string): IShaderNode | undefined {
    return this.nodes.get(id);
  }

  getNodes(): IShaderNode[] {
    return Array.from(this.nodes.values());
  }

  removeNode(id: string): boolean {
    if (!this.nodes.has(id)) return false;
    this.nodes.delete(id);
    this.connections = this.connections.filter(
      (c) => c.fromNodeId !== id && c.toNodeId !== id
    );
    this.version++;
    this.updatedAt = Date.now();
    return true;
  }

  setNodePosition(id: string, x: number, y: number): void {
    const node = this.nodes.get(id);
    if (node) node.position = { x, y };
  }

  setNodeProperty(id: string, key: string, value: unknown): boolean {
    const node = this.nodes.get(id);
    if (!node) return false;
    node.properties[key] = value;
    this.version++;
    this.updatedAt = Date.now();
    return true;
  }

  getNodeProperty(id: string, key: string): unknown {
    return this.nodes.get(id)?.properties[key];
  }

  // ── Connection management ──────────────────────────────────────────────────

  connect(fromNodeId: string, fromPort: string, toNodeId: string, toPort: string): IShaderConnection | null {
    // Reject self-loops
    if (fromNodeId === toNodeId) return null;

    // Reject connections referencing nodes that don't exist
    if (!this.nodes.has(fromNodeId) || !this.nodes.has(toNodeId)) return null;

    // Reject cycles: check if toNodeId can already reach fromNodeId
    const wouldCycle = (start: string, target: string): boolean => {
      const visited = new Set<string>();
      const stack = [start];
      while (stack.length > 0) {
        const curr = stack.pop()!;
        if (curr === target) return true;
        if (visited.has(curr)) continue;
        visited.add(curr);
        for (const c of this.connections) {
          if (c.fromNodeId === curr) stack.push(c.toNodeId);
        }
      }
      return false;
    };
    if (wouldCycle(toNodeId, fromNodeId)) return null;

    // Prevent duplicate connections on same input port
    this.connections = this.connections.filter(
      (c) => !(c.toNodeId === toNodeId && c.toPort === toPort)
    );
    const conn: IShaderConnection = {
      id: `conn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      fromNodeId,
      fromPort,
      toNodeId,
      toPort,
    };
    this.connections.push(conn);
    this.version++;
    this.updatedAt = Date.now();
    return conn;
  }

  getConnections(): IShaderConnection[] {
    return [...this.connections];
  }

  getNodeConnections(nodeId: string): IShaderConnection[] {
    return this.connections.filter(
      (c) => c.fromNodeId === nodeId || c.toNodeId === nodeId
    );
  }

  disconnectPort(nodeId: string, portName: string): void {
    this.connections = this.connections.filter(
      (c) => !(c.toNodeId === nodeId && c.toPort === portName) &&
             !(c.fromNodeId === nodeId && c.fromPort === portName)
    );
    this.version++;
    this.updatedAt = Date.now();
  }

  // ── Compilation stub ───────────────────────────────────────────────────────

  compile(): { success: boolean; vertexCode: string; fragmentCode: string; uniforms: unknown[]; warnings: string[]; errors: string[] } {
    const hasOutput = Array.from(this.nodes.values()).some((n) => n.type === 'output_surface');
    if (!hasOutput && this.nodes.size > 0) {
      return { success: false, vertexCode: '', fragmentCode: '', uniforms: [], warnings: [], errors: ['No output node found'] };
    }
    return {
      success: true,
      vertexCode: 'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentCode: 'void main() { gl_FragColor = vec4(1.0, 0.5, 0.2, 1.0); }',
      uniforms: [],
      warnings: [],
      errors: [],
    };
  }

  // ── Serialization ──────────────────────────────────────────────────────────

  toJSON(): ISerializedShaderGraph {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      version: this.version,
      nodes: Array.from(this.nodes.values()),
      connections: [...this.connections],
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  serialize(): string {
    return JSON.stringify(this.toJSON());
  }

  static fromJSON(data: ISerializedShaderGraph): ShaderGraph {
    const graph = new ShaderGraph(data.name, data.description);
    graph.id = data.id;
    graph.version = data.version ?? 1;
    graph.createdAt = data.createdAt ?? Date.now();
    graph.updatedAt = data.updatedAt ?? Date.now();
    graph.nodes.clear();
    for (const n of data.nodes ?? []) {
      graph.nodes.set(n.id, { ...n });
    }
    graph.connections = [...(data.connections ?? [])];
    return graph;
  }

  static deserialize(json: string): ShaderGraph {
    return ShaderGraph.fromJSON(JSON.parse(json));
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Re-export types used by useShaderGraph hook
// ──────────────────────────────────────────────────────────────────────────────

export type ShaderNode = IShaderNode;
export type ShaderConnection = IShaderConnection;
export type CompiledShader = ReturnType<ShaderGraph['compile']>;

// ──────────────────────────────────────────────────────────────────────────────
// Node template registry (used by NodePalette)
// ──────────────────────────────────────────────────────────────────────────────

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
    { type: 'NoiseNode', name: 'Noise (Hash)', category: 'procedural', description: 'Hash-based pseudo-random noise from UV coordinates', inputs: [{ name: 'uv', type: 'vec2' }, { name: 'scale', type: 'float' }], outputs: [{ name: 'noise', type: 'float' }] },
    { type: 'VoronoiNode', name: 'Voronoi', category: 'procedural', description: 'Cell noise — distance to nearest grid point', inputs: [{ name: 'uv', type: 'vec2' }, { name: 'scale', type: 'float' }], outputs: [{ name: 'distance', type: 'float' }] },
    { type: 'GradientNode', name: 'Gradient', category: 'procedural', description: 'Linear gradient blend between two colors along UV.y', inputs: [{ name: 'uv', type: 'vec2' }, { name: 'colorA', type: 'vec4' }, { name: 'colorB', type: 'vec4' }], outputs: [{ name: 'color', type: 'vec4' }] },
  ],
};

// Legacy SHADER_NODES alias (matches what useShaderGraph expects from @holoscript/core SHADER_NODES)
export const SHADER_NODES: Record<string, INodeTemplate> = {};
for (const templates of Object.values(NODE_TEMPLATES)) {
  for (const t of templates) {
    SHADER_NODES[t.type] = t;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Compiled shader output (used by features/shader-editor/)
// ──────────────────────────────────────────────────────────────────────────────

export interface ICompiledShader {
  vertexCode: string;
  fragmentCode: string;
  uniforms: Array<{ name: string; type: string; value?: unknown; defaultValue?: number | number[] }>;
  textures: string[];
  warnings: string[];
  errors: string[];
}
