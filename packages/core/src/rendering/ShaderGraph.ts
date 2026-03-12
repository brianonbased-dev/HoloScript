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

export interface ShaderPortRef {
  id: string;
  name: string;
  direction: 'in' | 'out';
  type: ShaderDataType;
}

export interface ShaderNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  overrides: Record<string, number | number[]>;
  category?: string;
  inputs?: ShaderPort[];
  outputs?: ShaderPort[];
  ports?: ShaderPortRef[];
  properties?: Record<string, unknown>;
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
  name: string;
  nodes: Map<string, ShaderNode> = new Map();
  connections: ShaderConnection[] = [];
  version = 0;
  readonly createdAt: number;
  updatedAt: number;
  private nodeDefs: Map<string, ShaderNodeDef> = new Map();

  constructor(id?: string, name?: string) {
    this.id = id ?? `shader_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    this.name = name ?? id ?? '';
    this.createdAt = Date.now();
    this.updatedAt = Date.now();
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
    const def = this.nodeDefs.get(type)!;
    const node: ShaderNode = {
      id: `sn_${_shaderNodeId++}`,
      type,
      position: { x, y },
      overrides,
      category: 'builtin',
      inputs: def.inputs,
      outputs: def.outputs,
      ports: [
        ...def.inputs.map((p) => ({ id: p.name, name: p.name, direction: 'in' as const, type: p.type })),
        ...def.outputs.map((p) => ({ id: p.name, name: p.name, direction: 'out' as const, type: p.type })),
      ],
      properties: {},
    };
    this.nodes.set(node.id, node);
    this.version++;
    return node;
  }

  createNode(type: string, position: { x: number; y: number }): ShaderNode | null {
    const def = this.nodeDefs.get(type);
    const inputs = def?.inputs ?? [];
    const outputs = def?.outputs ?? [];
    const node: ShaderNode = {
      id: `sn_${_shaderNodeId++}`,
      type,
      position: { x: position.x, y: position.y },
      overrides: {},
      category: def ? 'builtin' : 'custom',
      inputs,
      outputs,
      ports: [
        ...inputs.map((p) => ({ id: p.name, name: p.name, direction: 'in' as const, type: p.type })),
        ...outputs.map((p) => ({ id: p.name, name: p.name, direction: 'out' as const, type: p.type })),
      ],
      properties: {},
    };
    this.nodes.set(node.id, node);
    this.version++;
    return node;
  }

  /** Add a pre-built ShaderNode directly (used by undo/redo systems). */
  addCustomNode(node: ShaderNode): void {
    this.nodes.set(node.id, node);
    this.version++;
    this.updatedAt = Date.now();
  }

  removeNode(id: string): boolean {
    if (!this.nodes.delete(id)) return false;
    this.connections = this.connections.filter((c) => c.fromNode !== id && c.toNode !== id);
    this.version++;
    this.updatedAt = Date.now();
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

  setNodePosition(id: string, x: number, y: number): boolean {
    const node = this.nodes.get(id);
    if (!node) return false;
    node.position = { x, y };
    this.version++;
    return true;
  }

  setNodeProperty(id: string, key: string, value: unknown): boolean {
    const node = this.nodes.get(id);
    if (!node) return false;
    if (!node.properties) node.properties = {};
    node.properties[key] = value;
    this.version++;
    return true;
  }

  getNodeProperty(id: string, key: string): unknown {
    const node = this.nodes.get(id);
    return node?.properties?.[key];
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

    // Cycle detection: would adding fromNode→toNode create a cycle?
    if (this._wouldCreateCycle(fromNode, toNode)) return null;

    const conn: ShaderConnection = {
      id: `sc_${_shaderConnId++}`,
      fromNode,
      fromPort,
      toNode,
      toPort,
    };
    this.connections.push(conn);
    this.version++;
    this.updatedAt = Date.now();
    return conn;
  }

  /** Check if adding an edge from→to would create a cycle via DFS. */
  private _wouldCreateCycle(from: string, to: string): boolean {
    // If there's already a path from 'to' back to 'from', adding from→to creates a cycle.
    const visited = new Set<string>();
    const stack = [to];
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (current === from) return true;
      if (visited.has(current)) continue;
      visited.add(current);
      for (const conn of this.connections) {
        if (conn.fromNode === current) {
          stack.push(conn.toNode);
        }
      }
    }
    return false;
  }

  disconnectPort(nodeId: string, portId: string): void {
    this.connections = this.connections.filter(
      (c) =>
        !(
          (c.fromNode === nodeId && c.fromPort === portId) ||
          (c.toNode === nodeId && c.toPort === portId)
        )
    );
    this.version++;
  }

  getConnections(): ShaderConnection[] {
    return [...this.connections];
  }

  getNodeConnections(nodeId: string): ShaderConnection[] {
    return this.connections.filter((c) => c.fromNode === nodeId || c.toNode === nodeId);
  }

  // ---------------------------------------------------------------------------
  // Serialization
  // ---------------------------------------------------------------------------

  toJSON(): { name: string; id: string; nodes: [string, ShaderNode][]; connections: ShaderConnection[] } {
    return {
      name: this.name,
      id: this.id,
      nodes: [...this.nodes.entries()],
      connections: [...this.connections],
    };
  }

  static fromJSON(json: { name: string; id?: string; nodes: [string, ShaderNode][]; connections: ShaderConnection[] }): ShaderGraph {
    const graph = new ShaderGraph(json.name, json.id);
    for (const [key, node] of json.nodes) {
      graph.nodes.set(key, node);
    }
    graph.connections = [...json.connections];
    return graph;
  }

  serialize(): string {
    return JSON.stringify(this.toJSON());
  }

  static deserialize(str: string): ShaderGraph {
    return ShaderGraph.fromJSON(JSON.parse(str));
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
