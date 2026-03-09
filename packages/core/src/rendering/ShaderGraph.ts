/**
 * ShaderGraph.ts
 *
 * Node-based shader composition: connects material properties
 * through a DAG of shader nodes, generates uniform declarations,
 * and outputs combined shader code.
 *
 * @module rendering
 */

// =============================================================================
// TYPES
// =============================================================================

export type ShaderDataType =
  | 'float'
  | 'vec2'
  | 'vec3'
  | 'vec4'
  | 'mat4'
  | 'sampler2D'
  | 'bool'
  | 'int';

export interface ShaderPort {
  name: string;
  type: ShaderDataType;
  defaultValue?: number | number[];
}

export interface ShaderNodeDef {
  type: string;
  inputs: ShaderPort[];
  outputs: ShaderPort[];
  code: string; // GLSL snippet with {{input_name}} / {{output_name}} placeholders
}

export interface ShaderNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  overrides: Record<string, number | number[]>;
}

export interface ShaderConnection {
  id: string;
  fromNode: string;
  fromPort: string;
  toNode: string;
  toPort: string;
}

export interface ShaderUniform {
  name: string;
  type: ShaderDataType;
  value: number | number[];
}

export interface CompiledShader {
  vertexCode: string;
  fragmentCode: string;
  uniforms: ShaderUniform[];
  nodeCount: number;
  connectionCount: number;
}

// =============================================================================
// BUILT-IN SHADER NODES
// =============================================================================

export const SHADER_NODES: Record<string, ShaderNodeDef> = {
  Color: {
    type: 'Color',
    inputs: [{ name: 'color', type: 'vec4', defaultValue: [1, 1, 1, 1] }],
    outputs: [
      { name: 'rgba', type: 'vec4' },
      { name: 'rgb', type: 'vec3' },
    ],
    code: 'vec4 {{rgba}} = {{color}}; vec3 {{rgb}} = {{color}}.xyz;',
  },
  Texture: {
    type: 'Texture',
    inputs: [
      { name: 'uv', type: 'vec2', defaultValue: [0, 0] },
      { name: 'sampler', type: 'sampler2D' },
    ],
    outputs: [
      { name: 'color', type: 'vec4' },
      { name: 'r', type: 'float' },
    ],
    code: 'vec4 {{color}} = texture2D({{sampler}}, {{uv}}); float {{r}} = {{color}}.r;',
  },
  Multiply: {
    type: 'Multiply',
    inputs: [
      { name: 'a', type: 'vec4', defaultValue: [1, 1, 1, 1] },
      { name: 'b', type: 'vec4', defaultValue: [1, 1, 1, 1] },
    ],
    outputs: [{ name: 'result', type: 'vec4' }],
    code: 'vec4 {{result}} = {{a}} * {{b}};',
  },
  Lerp: {
    type: 'Lerp',
    inputs: [
      { name: 'a', type: 'vec4', defaultValue: [0, 0, 0, 1] },
      { name: 'b', type: 'vec4', defaultValue: [1, 1, 1, 1] },
      { name: 't', type: 'float', defaultValue: 0.5 },
    ],
    outputs: [{ name: 'result', type: 'vec4' }],
    code: 'vec4 {{result}} = mix({{a}}, {{b}}, {{t}});',
  },
  Fresnel: {
    type: 'Fresnel',
    inputs: [
      { name: 'power', type: 'float', defaultValue: 2 },
      { name: 'normal', type: 'vec3', defaultValue: [0, 1, 0] },
      { name: 'viewDir', type: 'vec3', defaultValue: [0, 0, 1] },
    ],
    outputs: [{ name: 'factor', type: 'float' }],
    code: 'float {{factor}} = pow(1.0 - max(dot({{normal}}, {{viewDir}}), 0.0), {{power}});',
  },
  Time: {
    type: 'Time',
    inputs: [],
    outputs: [
      { name: 'time', type: 'float' },
      { name: 'sinTime', type: 'float' },
    ],
    code: 'float {{time}} = u_time; float {{sinTime}} = sin(u_time);',
  },
  Output: {
    type: 'Output',
    inputs: [
      { name: 'albedo', type: 'vec4', defaultValue: [1, 1, 1, 1] },
      { name: 'normal', type: 'vec3', defaultValue: [0, 0, 1] },
      { name: 'metallic', type: 'float', defaultValue: 0 },
      { name: 'roughness', type: 'float', defaultValue: 0.5 },
      { name: 'emission', type: 'vec3', defaultValue: [0, 0, 0] },
    ],
    outputs: [],
    code: 'gl_FragColor = {{albedo}};',
  },
};

// =============================================================================
// SHADER GRAPH
// =============================================================================

let _shaderNodeId = 0;
let _shaderConnId = 0;

export class ShaderGraph {
  readonly id: string;
  private nodes: Map<string, ShaderNode> = new Map();
  private connections: ShaderConnection[] = [];
  private nodeDefs: Map<string, ShaderNodeDef> = new Map();

  constructor(id?: string) {
    this.id = id ?? `shader_${Date.now()}`;
    for (const [type, def] of Object.entries(SHADER_NODES)) {
      this.nodeDefs.set(type, def);
    }
  }

  // ---------------------------------------------------------------------------
  // Node Management
  // ---------------------------------------------------------------------------

  addNode(
    type: string,
    x = 0,
    y = 0,
    overrides: Record<string, number | number[]> = {}
  ): ShaderNode | null {
    if (!this.nodeDefs.has(type)) return null;
    const node: ShaderNode = { id: `sn_${_shaderNodeId++}`, type, position: { x, y }, overrides };
    this.nodes.set(node.id, node);
    return node;
  }

  removeNode(id: string): boolean {
    if (!this.nodes.delete(id)) return false;
    this.connections = this.connections.filter((c) => c.fromNode !== id && c.toNode !== id);
    return true;
  }

  getNode(id: string): ShaderNode | undefined {
    return this.nodes.get(id);
  }
  getNodes(): ShaderNode[] {
    return [...this.nodes.values()];
  }
  getNodeCount(): number {
    return this.nodes.size;
  }

  // ---------------------------------------------------------------------------
  // Connections
  // ---------------------------------------------------------------------------

  connect(
    fromNode: string,
    fromPort: string,
    toNode: string,
    toPort: string
  ): ShaderConnection | null {
    if (!this.nodes.has(fromNode) || !this.nodes.has(toNode)) return null;
    if (fromNode === toNode) return null;

    const conn: ShaderConnection = {
      id: `sc_${_shaderConnId++}`,
      fromNode,
      fromPort,
      toNode,
      toPort,
    };
    this.connections.push(conn);
    return conn;
  }

  getConnections(): ShaderConnection[] {
    return [...this.connections];
  }

  // ---------------------------------------------------------------------------
  // Compilation
  // ---------------------------------------------------------------------------

  compile(): CompiledShader {
    const uniforms: ShaderUniform[] = [];
    const fragmentLines: string[] = [];

    // Topological sort
    const sorted = this.topoSort();

    for (const nodeId of sorted) {
      const node = this.nodes.get(nodeId)!;
      const def = this.nodeDefs.get(node.type);
      if (!def) continue;

      let code = def.code;

      // Replace input placeholders with connected outputs or defaults
      for (const input of def.inputs) {
        const conn = this.connections.find((c) => c.toNode === nodeId && c.toPort === input.name);
        if (conn) {
          const varName = `${conn.fromNode}_${conn.fromPort}`;
          code = code.replace(new RegExp(`\\{\\{${input.name}\\}\\}`, 'g'), varName);
        } else {
          // Use override or default
          const val = node.overrides[input.name] ?? input.defaultValue;
          if (val !== undefined) {
            const uniformName = `u_${nodeId}_${input.name}`;
            uniforms.push({ name: uniformName, type: input.type, value: val as number | number[] });
            code = code.replace(new RegExp(`\\{\\{${input.name}\\}\\}`, 'g'), uniformName);
          }
        }
      }

      // Replace output placeholders with variable names
      for (const output of def.outputs) {
        const varName = `${nodeId}_${output.name}`;
        code = code.replace(new RegExp(`\\{\\{${output.name}\\}\\}`, 'g'), varName);
      }

      fragmentLines.push(code);
    }

    return {
      vertexCode: this.generateVertexShader(),
      fragmentCode: `void main() {\n  ${fragmentLines.join('\n  ')}\n}`,
      uniforms,
      nodeCount: this.nodes.size,
      connectionCount: this.connections.length,
    };
  }

  private generateVertexShader(): string {
    return [
      'attribute vec3 a_position;',
      'attribute vec2 a_uv;',
      'uniform mat4 u_mvp;',
      'varying vec2 v_uv;',
      'void main() {',
      '  v_uv = a_uv;',
      '  gl_Position = u_mvp * vec4(a_position, 1.0);',
      '}',
    ].join('\n');
  }

  private topoSort(): string[] {
    const inDegree = new Map<string, number>();
    const adj = new Map<string, Set<string>>();
    for (const id of this.nodes.keys()) {
      inDegree.set(id, 0);
      adj.set(id, new Set());
    }
    for (const c of this.connections) {
      adj.get(c.fromNode)?.add(c.toNode);
      inDegree.set(c.toNode, (inDegree.get(c.toNode) ?? 0) + 1);
    }
    const queue: string[] = [];
    for (const [id, deg] of inDegree) if (deg === 0) queue.push(id);
    const sorted: string[] = [];
    while (queue.length) {
      const cur = queue.shift()!;
      sorted.push(cur);
      for (const n of adj.get(cur) ?? []) {
        const d = (inDegree.get(n) ?? 0) - 1;
        inDegree.set(n, d);
        if (d === 0) queue.push(n);
      }
    }
    return sorted;
  }
}
