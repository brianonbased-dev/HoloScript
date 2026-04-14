/**
 * NIR -> WGSL Compute Shader Compiler
 *
 * Compiles NIR (Neuromorphic Intermediate Representation) graph JSON into
 * WGSL compute shaders for GPU-based neuromorphic simulation via WebGPU.
 *
 * Neuron models are continuous-time ODEs discretized using configurable
 * integration methods (Forward Euler or 4th-order Runge-Kutta):
 *
 *   LIF:     tau * dv/dt = (v_leak - v) + R * i(t), spike when v >= theta
 *   CubaLIF: tau_syn * di_syn/dt = -i_syn + w_in * input
 *            tau_mem * dv/dt = (v_leak - v) + R * i_syn, spike when v >= theta
 *   IF:      dv/dt = R * i(t), spike when v >= theta
 *   LI:      tau * dv/dt = (v_leak - v) + R * i(t) (no spiking)
 *
 * Stateless transforms (Affine, Linear, Conv2d) execute as single-pass
 * compute dispatches: y = W*x + b.
 *
 * Graph topology (edges) maps to buffer connections between shader stages.
 * Each NIR node becomes a compute shader dispatch with dedicated input/output
 * storage buffers, connected via bind groups.
 *
 * References:
 *   - NIR Specification: https://neuroir.org/docs/
 *   - NIR Paper: Nature Communications (2025) DOI:10.1038/s41467-024-52259-9
 *   - WGSL Spec: https://www.w3.org/TR/WGSL/
 *   - WebGPU Compute: https://developer.chrome.com/docs/capabilities/web-apis/gpu-compute
 *
 * @version 1.0.0
 */

import { CompilerBase } from './CompilerBase';
import { ANSCapabilityPath, type ANSCapabilityPathValue } from '@holoscript/core-types/ans';
import type {
  NIRGraph,
  NIRNode,
  NIREdge,
  NIRPrimitiveType,
  NIRLIFParams,
  NIRCubaLIFParams,
  NIRIFParams,
  NIRLIParams,
  NIRIntegratorParams,
  NIRAffineParams,
  NIRLinearParams,
  NIRConvParams,
  NIRThresholdParams,
  NIRScaleParams,
  NIRFlattenParams,
  NIRDelayParams,
} from './NIRTraitMap';
import type { HoloComposition } from '../parser/HoloCompositionTypes';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Integration method for continuous-time ODE discretization.
 *
 * - 'euler': Forward Euler (1st order, fast, dt-sensitive)
 * - 'rk4': 4th-order Runge-Kutta (higher accuracy, 4x compute cost)
 */
export type IntegrationMethod = 'euler' | 'rk4';

/**
 * Compiler options for NIR-to-WGSL compilation.
 */
export interface NIRToWGSLCompilerOptions {
  /** Integration method for ODE discretization (default: 'euler') */
  integrationMethod?: IntegrationMethod;
  /** Simulation timestep in milliseconds (default: 1.0) */
  dt?: number;
  /** Workgroup size for compute dispatches (default: 64) */
  workgroupSize?: number;
  /** Include debug comments in generated WGSL (default: true) */
  includeComments?: boolean;
  /** Generate bind group layout metadata (default: true) */
  generateBindGroupLayouts?: boolean;
  /** Spike reset voltage after firing (default: 0.0) */
  resetVoltage?: number;
}

/**
 * A single WGSL compute shader with its buffer layout.
 */
export interface WGSLShaderUnit {
  /** Node ID this shader implements */
  nodeId: string;
  /** NIR primitive type */
  nodeType: NIRPrimitiveType;
  /** Generated WGSL compute shader source */
  wgsl: string;
  /** Buffer definitions for this shader's bind group */
  buffers: WGSLBufferDefinition[];
  /** Dispatch dimensions [x, y, z] */
  dispatch: [number, number, number];
}

/**
 * Buffer definition for bind group layout.
 */
export interface WGSLBufferDefinition {
  /** Binding index within the bind group */
  binding: number;
  /** Buffer name (for host-side identification) */
  name: string;
  /** WGSL buffer type */
  type: 'storage' | 'read-only-storage' | 'uniform';
  /** WGSL element type (e.g., 'f32', 'u32') */
  elementType: string;
  /** Total number of elements */
  size: number;
  /** Semantic role */
  role: 'input' | 'output' | 'state' | 'params' | 'simulation';
}

/**
 * Buffer connection between two shader stages.
 */
export interface WGSLBufferConnection {
  /** Source node ID */
  sourceNodeId: string;
  /** Source buffer name */
  sourceBuffer: string;
  /** Target node ID */
  targetNodeId: string;
  /** Target buffer name */
  targetBuffer: string;
}

/**
 * Complete compilation result.
 */
export interface NIRToWGSLResult {
  /** Individual shader units (one per NIR node) */
  shaders: WGSLShaderUnit[];
  /** Buffer connections between shader stages */
  connections: WGSLBufferConnection[];
  /** Execution order (topological sort of nodes) */
  executionOrder: string[];
  /** Simulation parameters buffer layout */
  simulationParams: WGSLBufferDefinition;
  /** Complete bind group layout metadata */
  bindGroupLayouts: Record<string, WGSLBufferDefinition[]>;
  /** Compilation metadata */
  metadata: {
    source: string;
    generator: string;
    integrationMethod: IntegrationMethod;
    dt: number;
    workgroupSize: number;
    totalShaders: number;
    totalBuffers: number;
    totalConnections: number;
    generatedAt: string;
  };
}

// =============================================================================
// COMPILER
// =============================================================================

export class NIRToWGSLCompiler extends CompilerBase {
  protected readonly compilerName = 'NIRToWGSLCompiler';

  protected override getRequiredCapability(): ANSCapabilityPathValue {
    // Uses the webgpu capability path since this generates WGSL for WebGPU
    return ANSCapabilityPath.WEBGPU;
  }

  private options: Required<NIRToWGSLCompilerOptions>;

  constructor(options: NIRToWGSLCompilerOptions = {}) {
    super();
    this.options = {
      integrationMethod: options.integrationMethod ?? 'euler',
      dt: options.dt ?? 1.0,
      workgroupSize: options.workgroupSize ?? 64,
      includeComments: options.includeComments ?? true,
      generateBindGroupLayouts: options.generateBindGroupLayouts ?? true,
      resetVoltage: options.resetVoltage ?? 0.0,
    };
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Compile a HoloComposition to WGSL via NIR.
   *
   * This is the CompilerBase interface method. For NIR-to-WGSL compilation,
   * prefer `compileNIRGraph()` which accepts a pre-built NIRGraph directly.
   *
   * This method expects the composition to have already been compiled to
   * NIR JSON via NIRCompiler, stored as a string in the composition's
   * first object's first property value.
   */
  compile(composition: HoloComposition, agentToken: string, outputPath?: string): string {
    this.validateCompilerAccess(agentToken, outputPath);

    // If the composition has been pre-compiled to NIR JSON, parse it
    // Otherwise, this is an error - the caller should use compileNIRGraph()
    throw new Error(
      'NIRToWGSLCompiler.compile() requires a pre-built NIR graph. ' +
        'Use compileNIRGraph(nirGraphJson) instead, or pipe through NIRCompiler first.'
    );
  }

  /**
   * Compile an NIR graph JSON string to WGSL compute shaders.
   *
   * @param nirGraphJson - JSON string output from NIRCompiler.compile()
   * @param agentToken - Agent authentication token
   * @returns Complete compilation result with shaders, buffers, and connections
   */
  compileNIRGraph(nirGraphJson: string, agentToken?: string): NIRToWGSLResult {
    if (agentToken) {
      this.validateCompilerAccess(agentToken);
    }

    const graph: NIRGraph = JSON.parse(nirGraphJson);
    return this.compileGraph(graph);
  }

  /**
   * Compile an NIR graph object to WGSL compute shaders.
   *
   * @param graph - NIRGraph object
   * @returns Complete compilation result
   */
  compileGraph(graph: NIRGraph): NIRToWGSLResult {
    const shaders: WGSLShaderUnit[] = [];
    const connections: WGSLBufferConnection[] = [];
    const bindGroupLayouts: Record<string, WGSLBufferDefinition[]> = {};

    // Step 1: Topological sort of nodes for execution order
    const executionOrder = this.topologicalSort(graph);

    // Step 2: Generate WGSL for each non-structural node
    for (const nodeId of executionOrder) {
      const node = graph.nodes[nodeId];
      if (!node) continue;

      // Skip structural boundary nodes (Input/Output)
      if (node.type === 'Input' || node.type === 'Output') continue;

      const shaderUnit = this.generateShaderForNode(node);
      if (shaderUnit) {
        shaders.push(shaderUnit);
        if (this.options.generateBindGroupLayouts) {
          bindGroupLayouts[nodeId] = shaderUnit.buffers;
        }
      }
    }

    // Step 3: Map edges to buffer connections
    for (const edge of graph.edges) {
      // Skip edges involving Input/Output boundary nodes
      const sourceNode = graph.nodes[edge.source];
      const targetNode = graph.nodes[edge.target];
      if (!sourceNode || !targetNode) continue;
      if (sourceNode.type === 'Input' || targetNode.type === 'Output') continue;

      connections.push({
        sourceNodeId: edge.source,
        sourceBuffer: `${edge.source}_output`,
        targetNodeId: edge.target,
        targetBuffer: `${edge.target}_input`,
      });
    }

    // Step 4: Build simulation params buffer
    const simulationParams: WGSLBufferDefinition = {
      binding: 0,
      name: 'simulation_params',
      type: 'uniform',
      elementType: 'SimParams',
      size: 1,
      role: 'simulation',
    };

    return {
      shaders,
      connections,
      executionOrder,
      simulationParams,
      bindGroupLayouts,
      metadata: {
        source: graph.metadata.source,
        generator: 'HoloScript NIRToWGSLCompiler v1.0.0',
        integrationMethod: this.options.integrationMethod,
        dt: this.options.dt,
        workgroupSize: this.options.workgroupSize,
        totalShaders: shaders.length,
        totalBuffers: shaders.reduce((acc, s) => acc + s.buffers.length, 0),
        totalConnections: connections.length,
        generatedAt: new Date().toISOString(),
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Topological Sort
  // ---------------------------------------------------------------------------

  /**
   * Topological sort of NIR graph nodes for execution ordering.
   * Uses Kahn's algorithm (BFS-based) for deterministic ordering.
   */
  private topologicalSort(graph: NIRGraph): string[] {
    const nodeIds = Object.keys(graph.nodes);
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    // Initialize
    for (const id of nodeIds) {
      inDegree.set(id, 0);
      adjacency.set(id, []);
    }

    // Build adjacency list and in-degree counts
    for (const edge of graph.edges) {
      if (adjacency.has(edge.source)) {
        adjacency.get(edge.source)!.push(edge.target);
      }
      if (inDegree.has(edge.target)) {
        inDegree.set(edge.target, inDegree.get(edge.target)! + 1);
      }
    }

    // BFS from nodes with in-degree 0
    const queue: string[] = [];
    for (const [id, degree] of inDegree) {
      if (degree === 0) {
        queue.push(id);
      }
    }

    const sorted: string[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      sorted.push(current);

      for (const neighbor of adjacency.get(current) || []) {
        const newDegree = inDegree.get(neighbor)! - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) {
          queue.push(neighbor);
        }
      }
    }

    return sorted;
  }

  // ---------------------------------------------------------------------------
  // Shader Generation (Per-Node)
  // ---------------------------------------------------------------------------

  /**
   * Generate a WGSL compute shader for a single NIR node.
   */
  generateShaderForNode(node: NIRNode): WGSLShaderUnit | null {
    switch (node.type) {
      case 'LIF':
        return this.generateLIFShader(node);
      case 'CubaLIF':
        return this.generateCubaLIFShader(node);
      case 'IF':
        return this.generateIFShader(node);
      case 'LI':
        return this.generateLIShader(node);
      case 'Integrator':
        return this.generateIntegratorShader(node);
      case 'Affine':
        return this.generateAffineShader(node);
      case 'Linear':
        return this.generateLinearShader(node);
      case 'Conv2d':
        return this.generateConv2dShader(node);
      case 'Threshold':
        return this.generateThresholdShader(node);
      case 'Scale':
        return this.generateScaleShader(node);
      case 'Delay':
        return this.generateDelayShader(node);
      case 'Flatten':
        return this.generateFlattenShader(node);
      case 'SumPooling':
        return this.generateSumPoolingShader(node);
      case 'AvgPooling':
        return this.generateAvgPoolingShader(node);
      default:
        return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Neuron Model Shaders
  // ---------------------------------------------------------------------------

  /**
   * Generate WGSL compute shader for LIF (Leaky Integrate-and-Fire) neuron.
   *
   * ODE: tau * dv/dt = (v_leak - v) + R * i(t)
   * Spike: when v >= v_threshold
   * Reset: v = resetVoltage after spike
   */
  private generateLIFShader(node: NIRNode): WGSLShaderUnit {
    const params = node.params as NIRLIFParams;
    const size = params.tau.length;
    const wgSize = this.options.workgroupSize;
    const dt = this.options.dt;
    const resetV = this.options.resetVoltage;

    const lines: string[] = [];
    const c = this.options.includeComments;

    if (c) {
      lines.push(`// LIF Neuron: ${this.escapeStringValue(node.id as string, 'TypeScript')}`);
      lines.push(`// ODE: tau * dv/dt = (v_leak - v) + R * i(t)`);
      lines.push(`// Spike: v >= v_threshold, Reset: v = ${resetV}`);
      lines.push(`// Integration: ${this.options.integrationMethod}, dt = ${dt}`);
      lines.push('');
    }

    lines.push(this.generateSimParamsStruct());
    lines.push('');
    lines.push(`@group(0) @binding(0) var<uniform> sim: SimParams;`);
    lines.push(`@group(0) @binding(1) var<storage, read> input: array<f32>;`);
    lines.push(`@group(0) @binding(2) var<storage, read> tau: array<f32>;`);
    lines.push(`@group(0) @binding(3) var<storage, read> r: array<f32>;`);
    lines.push(`@group(0) @binding(4) var<storage, read> v_leak: array<f32>;`);
    lines.push(`@group(0) @binding(5) var<storage, read> v_threshold: array<f32>;`);
    lines.push(`@group(0) @binding(6) var<storage, read_write> voltage: array<f32>;`);
    lines.push(`@group(0) @binding(7) var<storage, read_write> spikes: array<u32>;`);
    lines.push('');

    if (this.options.integrationMethod === 'euler') {
      lines.push(this.generateLIFEulerKernel(wgSize, dt, resetV));
    } else {
      lines.push(this.generateLIFRK4Kernel(wgSize, dt, resetV));
    }

    const buffers: WGSLBufferDefinition[] = [
      {
        binding: 0,
        name: 'simulation_params',
        type: 'uniform',
        elementType: 'SimParams',
        size: 1,
        role: 'simulation',
      },
      {
        binding: 1,
        name: `${this.escapeStringValue(node.id as string, 'TypeScript')}_input`,
        type: 'read-only-storage',
        elementType: 'f32',
        size,
        role: 'input',
      },
      {
        binding: 2,
        name: `${this.escapeStringValue(node.id as string, 'TypeScript')}_tau`,
        type: 'read-only-storage',
        elementType: 'f32',
        size,
        role: 'params',
      },
      {
        binding: 3,
        name: `${this.escapeStringValue(node.id as string, 'TypeScript')}_r`,
        type: 'read-only-storage',
        elementType: 'f32',
        size,
        role: 'params',
      },
      {
        binding: 4,
        name: `${this.escapeStringValue(node.id as string, 'TypeScript')}_v_leak`,
        type: 'read-only-storage',
        elementType: 'f32',
        size,
        role: 'params',
      },
      {
        binding: 5,
        name: `${this.escapeStringValue(node.id as string, 'TypeScript')}_v_threshold`,
        type: 'read-only-storage',
        elementType: 'f32',
        size,
        role: 'params',
      },
      {
        binding: 6,
        name: `${this.escapeStringValue(node.id as string, 'TypeScript')}_voltage`,
        type: 'storage',
        elementType: 'f32',
        size,
        role: 'state',
      },
      {
        binding: 7,
        name: `${this.escapeStringValue(node.id as string, 'TypeScript')}_output`,
        type: 'storage',
        elementType: 'u32',
        size,
        role: 'output',
      },
    ];

    return {
      nodeId: node.id,
      nodeType: 'LIF',
      wgsl: lines.join('\n'),
      buffers,
      dispatch: [Math.ceil(size / wgSize), 1, 1],
    };
  }

  private generateLIFEulerKernel(wgSize: number, dt: number, resetV: number): string {
    return [
      `@compute @workgroup_size(${wgSize})`,
      `fn main(@builtin(global_invocation_id) gid: vec3u) {`,
      `  let idx = gid[0];`,
      `  if (idx >= arrayLength(&voltage)) { return; }`,
      ``,
      `  let i_in = input[idx];`,
      `  let tau_val = tau[idx];`,
      `  let r_val = r[idx];`,
      `  let v_leak_val = v_leak[idx];`,
      `  let v_thr = v_threshold[idx];`,
      `  var v = voltage[idx];`,
      ``,
      `  // Forward Euler: dv = ((v_leak - v) + R * i) / tau * dt`,
      `  let dv = ((v_leak_val - v) + r_val * i_in) / tau_val * ${this.toF32(dt)};`,
      `  v = v + dv;`,
      ``,
      `  // Spike detection and reset`,
      `  if (v >= v_thr) {`,
      `    spikes[idx] = 1u;`,
      `    v = ${this.toF32(resetV)};`,
      `  } else {`,
      `    spikes[idx] = 0u;`,
      `  }`,
      ``,
      `  voltage[idx] = v;`,
      `}`,
    ].join('\n');
  }

  private generateLIFRK4Kernel(wgSize: number, dt: number, resetV: number): string {
    return [
      `// LIF dynamics: f(v) = ((v_leak - v) + R * i) / tau`,
      `fn lif_dvdt(v: f32, i_in: f32, tau_val: f32, r_val: f32, v_leak_val: f32) -> f32 {`,
      `  return ((v_leak_val - v) + r_val * i_in) / tau_val;`,
      `}`,
      ``,
      `@compute @workgroup_size(${wgSize})`,
      `fn main(@builtin(global_invocation_id) gid: vec3u) {`,
      `  let idx = gid[0];`,
      `  if (idx >= arrayLength(&voltage)) { return; }`,
      ``,
      `  let i_in = input[idx];`,
      `  let tau_val = tau[idx];`,
      `  let r_val = r[idx];`,
      `  let v_leak_val = v_leak[idx];`,
      `  let v_thr = v_threshold[idx];`,
      `  var v = voltage[idx];`,
      `  let h = ${this.toF32(dt)};`,
      ``,
      `  // RK4 integration`,
      `  let k1 = lif_dvdt(v, i_in, tau_val, r_val, v_leak_val);`,
      `  let k2 = lif_dvdt(v + h * 0.5 * k1, i_in, tau_val, r_val, v_leak_val);`,
      `  let k3 = lif_dvdt(v + h * 0.5 * k2, i_in, tau_val, r_val, v_leak_val);`,
      `  let k4 = lif_dvdt(v + h * k3, i_in, tau_val, r_val, v_leak_val);`,
      `  v = v + (h / 6.0) * (k1 + 2.0 * k2 + 2.0 * k3 + k4);`,
      ``,
      `  // Spike detection and reset`,
      `  if (v >= v_thr) {`,
      `    spikes[idx] = 1u;`,
      `    v = ${this.toF32(resetV)};`,
      `  } else {`,
      `    spikes[idx] = 0u;`,
      `  }`,
      ``,
      `  voltage[idx] = v;`,
      `}`,
    ].join('\n');
  }

  /**
   * Generate WGSL compute shader for CubaLIF (Current-Based LIF) neuron.
   *
   * Two coupled ODEs:
   *   tau_syn * di_syn/dt = -i_syn + w_in * input
   *   tau_mem * dv/dt = (v_leak - v) + R * i_syn
   *   Spike: v >= v_threshold, Reset: v = resetVoltage
   */
  private generateCubaLIFShader(node: NIRNode): WGSLShaderUnit {
    const params = node.params as NIRCubaLIFParams;
    const size = params.tau_syn.length;
    const wgSize = this.options.workgroupSize;
    const dt = this.options.dt;
    const resetV = this.options.resetVoltage;

    const lines: string[] = [];
    const c = this.options.includeComments;

    if (c) {
      lines.push(`// CubaLIF Neuron: ${this.escapeStringValue(node.id as string, 'TypeScript')}`);
      lines.push(`// Synaptic: tau_syn * di/dt = -i + w_in * input`);
      lines.push(`// Membrane: tau_mem * dv/dt = (v_leak - v) + R * i_syn`);
      lines.push(`// Integration: ${this.options.integrationMethod}, dt = ${dt}`);
      lines.push('');
    }

    lines.push(this.generateSimParamsStruct());
    lines.push('');
    lines.push(`@group(0) @binding(0) var<uniform> sim: SimParams;`);
    lines.push(`@group(0) @binding(1) var<storage, read> input: array<f32>;`);
    lines.push(`@group(0) @binding(2) var<storage, read> tau_syn: array<f32>;`);
    lines.push(`@group(0) @binding(3) var<storage, read> tau_mem: array<f32>;`);
    lines.push(`@group(0) @binding(4) var<storage, read> r: array<f32>;`);
    lines.push(`@group(0) @binding(5) var<storage, read> v_leak: array<f32>;`);
    lines.push(`@group(0) @binding(6) var<storage, read> v_threshold: array<f32>;`);
    lines.push(`@group(0) @binding(7) var<storage, read> w_in: array<f32>;`);
    lines.push(`@group(0) @binding(8) var<storage, read_write> i_syn: array<f32>;`);
    lines.push(`@group(0) @binding(9) var<storage, read_write> voltage: array<f32>;`);
    lines.push(`@group(0) @binding(10) var<storage, read_write> spikes: array<u32>;`);
    lines.push('');

    if (this.options.integrationMethod === 'euler') {
      lines.push(this.generateCubaLIFEulerKernel(wgSize, dt, resetV));
    } else {
      lines.push(this.generateCubaLIFRK4Kernel(wgSize, dt, resetV));
    }

    const buffers: WGSLBufferDefinition[] = [
      {
        binding: 0,
        name: 'simulation_params',
        type: 'uniform',
        elementType: 'SimParams',
        size: 1,
        role: 'simulation',
      },
      {
        binding: 1,
        name: `${this.escapeStringValue(node.id as string, 'TypeScript')}_input`,
        type: 'read-only-storage',
        elementType: 'f32',
        size,
        role: 'input',
      },
      {
        binding: 2,
        name: `${this.escapeStringValue(node.id as string, 'TypeScript')}_tau_syn`,
        type: 'read-only-storage',
        elementType: 'f32',
        size,
        role: 'params',
      },
      {
        binding: 3,
        name: `${this.escapeStringValue(node.id as string, 'TypeScript')}_tau_mem`,
        type: 'read-only-storage',
        elementType: 'f32',
        size,
        role: 'params',
      },
      {
        binding: 4,
        name: `${this.escapeStringValue(node.id as string, 'TypeScript')}_r`,
        type: 'read-only-storage',
        elementType: 'f32',
        size,
        role: 'params',
      },
      {
        binding: 5,
        name: `${this.escapeStringValue(node.id as string, 'TypeScript')}_v_leak`,
        type: 'read-only-storage',
        elementType: 'f32',
        size,
        role: 'params',
      },
      {
        binding: 6,
        name: `${this.escapeStringValue(node.id as string, 'TypeScript')}_v_threshold`,
        type: 'read-only-storage',
        elementType: 'f32',
        size,
        role: 'params',
      },
      {
        binding: 7,
        name: `${this.escapeStringValue(node.id as string, 'TypeScript')}_w_in`,
        type: 'read-only-storage',
        elementType: 'f32',
        size,
        role: 'params',
      },
      {
        binding: 8,
        name: `${this.escapeStringValue(node.id as string, 'TypeScript')}_i_syn`,
        type: 'storage',
        elementType: 'f32',
        size,
        role: 'state',
      },
      {
        binding: 9,
        name: `${this.escapeStringValue(node.id as string, 'TypeScript')}_voltage`,
        type: 'storage',
        elementType: 'f32',
        size,
        role: 'state',
      },
      {
        binding: 10,
        name: `${this.escapeStringValue(node.id as string, 'TypeScript')}_output`,
        type: 'storage',
        elementType: 'u32',
        size,
        role: 'output',
      },
    ];

    return {
      nodeId: node.id,
      nodeType: 'CubaLIF',
      wgsl: lines.join('\n'),
      buffers,
      dispatch: [Math.ceil(size / wgSize), 1, 1],
    };
  }

  private generateCubaLIFEulerKernel(wgSize: number, dt: number, resetV: number): string {
    return [
      `@compute @workgroup_size(${wgSize})`,
      `fn main(@builtin(global_invocation_id) gid: vec3u) {`,
      `  let idx = gid[0];`,
      `  if (idx >= arrayLength(&voltage)) { return; }`,
      ``,
      `  let x = input[idx];`,
      `  let ts = tau_syn[idx];`,
      `  let tm = tau_mem[idx];`,
      `  let r_val = r[idx];`,
      `  let v_leak_val = v_leak[idx];`,
      `  let v_thr = v_threshold[idx];`,
      `  let w = w_in[idx];`,
      `  var i_s = i_syn[idx];`,
      `  var v = voltage[idx];`,
      `  let h = ${this.toF32(dt)};`,
      ``,
      `  // Synaptic current: di/dt = (-i + w * x) / tau_syn`,
      `  let di = (-i_s + w * x) / ts * h;`,
      `  i_s = i_s + di;`,
      ``,
      `  // Membrane voltage: dv/dt = ((v_leak - v) + R * i_syn) / tau_mem`,
      `  let dv = ((v_leak_val - v) + r_val * i_s) / tm * h;`,
      `  v = v + dv;`,
      ``,
      `  // Spike detection and reset`,
      `  if (v >= v_thr) {`,
      `    spikes[idx] = 1u;`,
      `    v = ${this.toF32(resetV)};`,
      `  } else {`,
      `    spikes[idx] = 0u;`,
      `  }`,
      ``,
      `  i_syn[idx] = i_s;`,
      `  voltage[idx] = v;`,
      `}`,
    ].join('\n');
  }

  private generateCubaLIFRK4Kernel(wgSize: number, dt: number, resetV: number): string {
    return [
      `fn cuba_di_dt(i_s: f32, x: f32, w: f32, ts: f32) -> f32 {`,
      `  return (-i_s + w * x) / ts;`,
      `}`,
      ``,
      `fn cuba_dv_dt(v: f32, i_s: f32, r_val: f32, v_leak_val: f32, tm: f32) -> f32 {`,
      `  return ((v_leak_val - v) + r_val * i_s) / tm;`,
      `}`,
      ``,
      `@compute @workgroup_size(${wgSize})`,
      `fn main(@builtin(global_invocation_id) gid: vec3u) {`,
      `  let idx = gid[0];`,
      `  if (idx >= arrayLength(&voltage)) { return; }`,
      ``,
      `  let x = input[idx];`,
      `  let ts = tau_syn[idx];`,
      `  let tm = tau_mem[idx];`,
      `  let r_val = r[idx];`,
      `  let v_leak_val = v_leak[idx];`,
      `  let v_thr = v_threshold[idx];`,
      `  let w = w_in[idx];`,
      `  var i_s = i_syn[idx];`,
      `  var v = voltage[idx];`,
      `  let h = ${this.toF32(dt)};`,
      ``,
      `  // RK4 for synaptic current`,
      `  let ki1 = cuba_di_dt(i_s, x, w, ts);`,
      `  let ki2 = cuba_di_dt(i_s + h * 0.5 * ki1, x, w, ts);`,
      `  let ki3 = cuba_di_dt(i_s + h * 0.5 * ki2, x, w, ts);`,
      `  let ki4 = cuba_di_dt(i_s + h * ki3, x, w, ts);`,
      `  i_s = i_s + (h / 6.0) * (ki1 + 2.0 * ki2 + 2.0 * ki3 + ki4);`,
      ``,
      `  // RK4 for membrane voltage`,
      `  let kv1 = cuba_dv_dt(v, i_s, r_val, v_leak_val, tm);`,
      `  let kv2 = cuba_dv_dt(v + h * 0.5 * kv1, i_s, r_val, v_leak_val, tm);`,
      `  let kv3 = cuba_dv_dt(v + h * 0.5 * kv2, i_s, r_val, v_leak_val, tm);`,
      `  let kv4 = cuba_dv_dt(v + h * kv3, i_s, r_val, v_leak_val, tm);`,
      `  v = v + (h / 6.0) * (kv1 + 2.0 * kv2 + 2.0 * kv3 + kv4);`,
      ``,
      `  // Spike detection and reset`,
      `  if (v >= v_thr) {`,
      `    spikes[idx] = 1u;`,
      `    v = ${this.toF32(resetV)};`,
      `  } else {`,
      `    spikes[idx] = 0u;`,
      `  }`,
      ``,
      `  i_syn[idx] = i_s;`,
      `  voltage[idx] = v;`,
      `}`,
    ].join('\n');
  }

  /**
   * Generate WGSL compute shader for IF (Integrate-and-Fire) neuron.
   * ODE: dv/dt = R * i(t), spike when v >= theta
   */
  private generateIFShader(node: NIRNode): WGSLShaderUnit {
    const params = node.params as NIRIFParams;
    const size = params.r.length;
    const wgSize = this.options.workgroupSize;
    const dt = this.options.dt;
    const resetV = this.options.resetVoltage;

    const lines: string[] = [];
    if (this.options.includeComments) {
      lines.push(`// IF Neuron: ${this.escapeStringValue(node.id as string, 'TypeScript')}`);
      lines.push(`// ODE: dv/dt = R * i(t), spike when v >= theta`);
      lines.push('');
    }

    lines.push(this.generateSimParamsStruct());
    lines.push('');
    lines.push(`@group(0) @binding(0) var<uniform> sim: SimParams;`);
    lines.push(`@group(0) @binding(1) var<storage, read> input: array<f32>;`);
    lines.push(`@group(0) @binding(2) var<storage, read> r: array<f32>;`);
    lines.push(`@group(0) @binding(3) var<storage, read> v_threshold: array<f32>;`);
    lines.push(`@group(0) @binding(4) var<storage, read_write> voltage: array<f32>;`);
    lines.push(`@group(0) @binding(5) var<storage, read_write> spikes: array<u32>;`);
    lines.push('');
    lines.push(`@compute @workgroup_size(${wgSize})`);
    lines.push(`fn main(@builtin(global_invocation_id) gid: vec3u) {`);
    lines.push(`  let idx = gid[0];`);
    lines.push(`  if (idx >= arrayLength(&voltage)) { return; }`);
    lines.push('');
    lines.push(`  let i_in = input[idx];`);
    lines.push(`  let r_val = r[idx];`);
    lines.push(`  let v_thr = v_threshold[idx];`);
    lines.push(`  var v = voltage[idx];`);
    lines.push('');
    lines.push(`  // Pure integration: dv = R * i * dt`);
    lines.push(`  v = v + r_val * i_in * ${this.toF32(dt)};`);
    lines.push('');
    lines.push(`  if (v >= v_thr) {`);
    lines.push(`    spikes[idx] = 1u;`);
    lines.push(`    v = ${this.toF32(resetV)};`);
    lines.push(`  } else {`);
    lines.push(`    spikes[idx] = 0u;`);
    lines.push(`  }`);
    lines.push('');
    lines.push(`  voltage[idx] = v;`);
    lines.push(`}`);

    return {
      nodeId: node.id,
      nodeType: 'IF',
      wgsl: lines.join('\n'),
      buffers: [
        {
          binding: 0,
          name: 'simulation_params',
          type: 'uniform',
          elementType: 'SimParams',
          size: 1,
          role: 'simulation',
        },
        {
          binding: 1,
          name: `${this.escapeStringValue(node.id as string, 'TypeScript')}_input`,
          type: 'read-only-storage',
          elementType: 'f32',
          size,
          role: 'input',
        },
        {
          binding: 2,
          name: `${this.escapeStringValue(node.id as string, 'TypeScript')}_r`,
          type: 'read-only-storage',
          elementType: 'f32',
          size,
          role: 'params',
        },
        {
          binding: 3,
          name: `${this.escapeStringValue(node.id as string, 'TypeScript')}_v_threshold`,
          type: 'read-only-storage',
          elementType: 'f32',
          size,
          role: 'params',
        },
        {
          binding: 4,
          name: `${this.escapeStringValue(node.id as string, 'TypeScript')}_voltage`,
          type: 'storage',
          elementType: 'f32',
          size,
          role: 'state',
        },
        {
          binding: 5,
          name: `${this.escapeStringValue(node.id as string, 'TypeScript')}_output`,
          type: 'storage',
          elementType: 'u32',
          size,
          role: 'output',
        },
      ],
      dispatch: [Math.ceil(size / wgSize), 1, 1],
    };
  }

  /**
   * Generate WGSL compute shader for LI (Leaky Integrator).
   * ODE: tau * dv/dt = (v_leak - v) + R * i(t) (no spiking)
   */
  private generateLIShader(node: NIRNode): WGSLShaderUnit {
    const params = node.params as NIRLIParams;
    const size = params.tau.length;
    const wgSize = this.options.workgroupSize;
    const dt = this.options.dt;

    const lines: string[] = [];
    if (this.options.includeComments) {
      lines.push(
        `// LI (Leaky Integrator): ${this.escapeStringValue(node.id as string, 'TypeScript')}`
      );
      lines.push(`// ODE: tau * dv/dt = (v_leak - v) + R * i(t)`);
      lines.push('');
    }

    lines.push(this.generateSimParamsStruct());
    lines.push('');
    lines.push(`@group(0) @binding(0) var<uniform> sim: SimParams;`);
    lines.push(`@group(0) @binding(1) var<storage, read> input: array<f32>;`);
    lines.push(`@group(0) @binding(2) var<storage, read> tau: array<f32>;`);
    lines.push(`@group(0) @binding(3) var<storage, read> r: array<f32>;`);
    lines.push(`@group(0) @binding(4) var<storage, read> v_leak: array<f32>;`);
    lines.push(`@group(0) @binding(5) var<storage, read_write> voltage: array<f32>;`);
    lines.push(`@group(0) @binding(6) var<storage, read_write> output: array<f32>;`);
    lines.push('');
    lines.push(`@compute @workgroup_size(${wgSize})`);
    lines.push(`fn main(@builtin(global_invocation_id) gid: vec3u) {`);
    lines.push(`  let idx = gid[0];`);
    lines.push(`  if (idx >= arrayLength(&voltage)) { return; }`);
    lines.push('');
    lines.push(`  let i_in = input[idx];`);
    lines.push(`  let tau_val = tau[idx];`);
    lines.push(`  let r_val = r[idx];`);
    lines.push(`  let v_leak_val = v_leak[idx];`);
    lines.push(`  var v = voltage[idx];`);
    lines.push('');
    lines.push(`  // Leaky integration (no spike)`);
    lines.push(`  let dv = ((v_leak_val - v) + r_val * i_in) / tau_val * ${this.toF32(dt)};`);
    lines.push(`  v = v + dv;`);
    lines.push('');
    lines.push(`  voltage[idx] = v;`);
    lines.push(`  output[idx] = v;`);
    lines.push(`}`);

    return {
      nodeId: node.id,
      nodeType: 'LI',
      wgsl: lines.join('\n'),
      buffers: [
        {
          binding: 0,
          name: 'simulation_params',
          type: 'uniform',
          elementType: 'SimParams',
          size: 1,
          role: 'simulation',
        },
        {
          binding: 1,
          name: `${this.escapeStringValue(node.id as string, 'TypeScript')}_input`,
          type: 'read-only-storage',
          elementType: 'f32',
          size,
          role: 'input',
        },
        {
          binding: 2,
          name: `${this.escapeStringValue(node.id as string, 'TypeScript')}_tau`,
          type: 'read-only-storage',
          elementType: 'f32',
          size,
          role: 'params',
        },
        {
          binding: 3,
          name: `${this.escapeStringValue(node.id as string, 'TypeScript')}_r`,
          type: 'read-only-storage',
          elementType: 'f32',
          size,
          role: 'params',
        },
        {
          binding: 4,
          name: `${this.escapeStringValue(node.id as string, 'TypeScript')}_v_leak`,
          type: 'read-only-storage',
          elementType: 'f32',
          size,
          role: 'params',
        },
        {
          binding: 5,
          name: `${this.escapeStringValue(node.id as string, 'TypeScript')}_voltage`,
          type: 'storage',
          elementType: 'f32',
          size,
          role: 'state',
        },
        {
          binding: 6,
          name: `${this.escapeStringValue(node.id as string, 'TypeScript')}_output`,
          type: 'storage',
          elementType: 'f32',
          size,
          role: 'output',
        },
      ],
      dispatch: [Math.ceil(size / wgSize), 1, 1],
    };
  }

  /**
   * Generate WGSL compute shader for pure Integrator.
   * ODE: dv/dt = R * i(t)
   */
  private generateIntegratorShader(node: NIRNode): WGSLShaderUnit {
    const params = node.params as NIRIntegratorParams;
    const size = params.r.length;
    const wgSize = this.options.workgroupSize;
    const dt = this.options.dt;

    const lines: string[] = [];
    if (this.options.includeComments) {
      lines.push(`// Integrator: ${this.escapeStringValue(node.id as string, 'TypeScript')}`);
      lines.push(`// ODE: dv/dt = R * i(t)`);
      lines.push('');
    }

    lines.push(this.generateSimParamsStruct());
    lines.push('');
    lines.push(`@group(0) @binding(0) var<uniform> sim: SimParams;`);
    lines.push(`@group(0) @binding(1) var<storage, read> input: array<f32>;`);
    lines.push(`@group(0) @binding(2) var<storage, read> r: array<f32>;`);
    lines.push(`@group(0) @binding(3) var<storage, read_write> voltage: array<f32>;`);
    lines.push(`@group(0) @binding(4) var<storage, read_write> output: array<f32>;`);
    lines.push('');
    lines.push(`@compute @workgroup_size(${wgSize})`);
    lines.push(`fn main(@builtin(global_invocation_id) gid: vec3u) {`);
    lines.push(`  let idx = gid[0];`);
    lines.push(`  if (idx >= arrayLength(&voltage)) { return; }`);
    lines.push('');
    lines.push(`  var v = voltage[idx];`);
    lines.push(`  v = v + r[idx] * input[idx] * ${this.toF32(dt)};`);
    lines.push(`  voltage[idx] = v;`);
    lines.push(`  output[idx] = v;`);
    lines.push(`}`);

    return {
      nodeId: node.id,
      nodeType: 'Integrator',
      wgsl: lines.join('\n'),
      buffers: [
        {
          binding: 0,
          name: 'simulation_params',
          type: 'uniform',
          elementType: 'SimParams',
          size: 1,
          role: 'simulation',
        },
        {
          binding: 1,
          name: `${this.escapeStringValue(node.id as string, 'TypeScript')}_input`,
          type: 'read-only-storage',
          elementType: 'f32',
          size,
          role: 'input',
        },
        {
          binding: 2,
          name: `${this.escapeStringValue(node.id as string, 'TypeScript')}_r`,
          type: 'read-only-storage',
          elementType: 'f32',
          size,
          role: 'params',
        },
        {
          binding: 3,
          name: `${this.escapeStringValue(node.id as string, 'TypeScript')}_voltage`,
          type: 'storage',
          elementType: 'f32',
          size,
          role: 'state',
        },
        {
          binding: 4,
          name: `${this.escapeStringValue(node.id as string, 'TypeScript')}_output`,
          type: 'storage',
          elementType: 'f32',
          size,
          role: 'output',
        },
      ],
      dispatch: [Math.ceil(size / wgSize), 1, 1],
    };
  }

  // ---------------------------------------------------------------------------
  // Stateless Transform Shaders
  // ---------------------------------------------------------------------------

  /**
   * Generate WGSL compute shader for Affine transform: y = W*x + b
   */
  private generateAffineShader(node: NIRNode): WGSLShaderUnit {
    const params = node.params as NIRAffineParams;
    const outputSize = params.weight.length;
    const inputSize = params.weight[0]?.length ?? 0;
    const wgSize = this.options.workgroupSize;

    const lines: string[] = [];
    if (this.options.includeComments) {
      lines.push(`// Affine Transform: ${this.escapeStringValue(node.id as string, 'TypeScript')}`);
      lines.push(`// y = W * x + b (${outputSize} x ${inputSize})`);
      lines.push('');
    }

    lines.push(`@group(0) @binding(0) var<storage, read> input: array<f32>;`);
    lines.push(`@group(0) @binding(1) var<storage, read> weight: array<f32>;`);
    lines.push(`@group(0) @binding(2) var<storage, read> bias: array<f32>;`);
    lines.push(`@group(0) @binding(3) var<storage, read_write> output: array<f32>;`);
    lines.push('');
    lines.push(`const INPUT_SIZE: u32 = ${inputSize}u;`);
    lines.push('');
    lines.push(`@compute @workgroup_size(${wgSize})`);
    lines.push(`fn main(@builtin(global_invocation_id) gid: vec3u) {`);
    lines.push(`  let row = gid[0];`);
    lines.push(`  if (row >= arrayLength(&output)) { return; }`);
    lines.push('');
    lines.push(`  var sum: f32 = 0.0;`);
    lines.push(`  for (var col: u32 = 0u; col < INPUT_SIZE; col = col + 1u) {`);
    lines.push(`    sum = sum + weight[row * INPUT_SIZE + col] * input[col];`);
    lines.push(`  }`);
    lines.push(`  output[row] = sum + bias[row];`);
    lines.push(`}`);

    return {
      nodeId: node.id,
      nodeType: 'Affine',
      wgsl: lines.join('\n'),
      buffers: [
        {
          binding: 0,
          name: `${this.escapeStringValue(node.id as string, 'TypeScript')}_input`,
          type: 'read-only-storage',
          elementType: 'f32',
          size: inputSize,
          role: 'input',
        },
        {
          binding: 1,
          name: `${this.escapeStringValue(node.id as string, 'TypeScript')}_weight`,
          type: 'read-only-storage',
          elementType: 'f32',
          size: outputSize * inputSize,
          role: 'params',
        },
        {
          binding: 2,
          name: `${this.escapeStringValue(node.id as string, 'TypeScript')}_bias`,
          type: 'read-only-storage',
          elementType: 'f32',
          size: outputSize,
          role: 'params',
        },
        {
          binding: 3,
          name: `${this.escapeStringValue(node.id as string, 'TypeScript')}_output`,
          type: 'storage',
          elementType: 'f32',
          size: outputSize,
          role: 'output',
        },
      ],
      dispatch: [Math.ceil(outputSize / wgSize), 1, 1],
    };
  }

  /**
   * Generate WGSL compute shader for Linear transform: y = W*x
   */
  private generateLinearShader(node: NIRNode): WGSLShaderUnit {
    const params = node.params as NIRLinearParams;
    const outputSize = params.weight.length;
    const inputSize = params.weight[0]?.length ?? 0;
    const wgSize = this.options.workgroupSize;

    const lines: string[] = [];
    if (this.options.includeComments) {
      lines.push(`// Linear Transform: ${this.escapeStringValue(node.id as string, 'TypeScript')}`);
      lines.push(`// y = W * x (${outputSize} x ${inputSize})`);
      lines.push('');
    }

    lines.push(`@group(0) @binding(0) var<storage, read> input: array<f32>;`);
    lines.push(`@group(0) @binding(1) var<storage, read> weight: array<f32>;`);
    lines.push(`@group(0) @binding(2) var<storage, read_write> output: array<f32>;`);
    lines.push('');
    lines.push(`const INPUT_SIZE: u32 = ${inputSize}u;`);
    lines.push('');
    lines.push(`@compute @workgroup_size(${wgSize})`);
    lines.push(`fn main(@builtin(global_invocation_id) gid: vec3u) {`);
    lines.push(`  let row = gid[0];`);
    lines.push(`  if (row >= arrayLength(&output)) { return; }`);
    lines.push('');
    lines.push(`  var sum: f32 = 0.0;`);
    lines.push(`  for (var col: u32 = 0u; col < INPUT_SIZE; col = col + 1u) {`);
    lines.push(`    sum = sum + weight[row * INPUT_SIZE + col] * input[col];`);
    lines.push(`  }`);
    lines.push(`  output[row] = sum;`);
    lines.push(`}`);

    return {
      nodeId: node.id,
      nodeType: 'Linear',
      wgsl: lines.join('\n'),
      buffers: [
        {
          binding: 0,
          name: `${this.escapeStringValue(node.id as string, 'TypeScript')}_input`,
          type: 'read-only-storage',
          elementType: 'f32',
          size: inputSize,
          role: 'input',
        },
        {
          binding: 1,
          name: `${this.escapeStringValue(node.id as string, 'TypeScript')}_weight`,
          type: 'read-only-storage',
          elementType: 'f32',
          size: outputSize * inputSize,
          role: 'params',
        },
        {
          binding: 2,
          name: `${this.escapeStringValue(node.id as string, 'TypeScript')}_output`,
          type: 'storage',
          elementType: 'f32',
          size: outputSize,
          role: 'output',
        },
      ],
      dispatch: [Math.ceil(outputSize / wgSize), 1, 1],
    };
  }

  /**
   * Generate WGSL compute shader for Conv2d.
   * Performs 2D convolution over spatial dimensions.
   */
  private generateConv2dShader(node: NIRNode): WGSLShaderUnit {
    const params = node.params as NIRConvParams;
    const outChannels = params.weight.length;
    const inChannelsPerGroup = params.weight[0]?.length ?? 1;
    const kH = params.weight[0]?.[0]?.length ?? 3;
    const kW = params.weight[0]?.[0]?.[0]?.length ?? 3;
    const [strideH, strideW] = params.stride;
    const [padH, padW] = params.padding;
    const groups = params.groups;
    const wgSize = this.options.workgroupSize;

    // For buffer sizing, assume a default spatial dimension of 28x28
    // The actual dimension is provided at runtime via dispatch
    const spatialH = 28;
    const spatialW = 28;
    const outH = Math.floor((spatialH + 2 * padH - kH) / strideH) + 1;
    const outW = Math.floor((spatialW + 2 * padW - kW) / strideW) + 1;
    const totalOutputElements = outChannels * outH * outW;

    const lines: string[] = [];
    if (this.options.includeComments) {
      lines.push(`// Conv2d: ${this.escapeStringValue(node.id as string, 'TypeScript')}`);
      lines.push(`// Kernel: ${outChannels} x ${inChannelsPerGroup} x ${kH} x ${kW}`);
      lines.push(
        `// Stride: [${strideH}, ${strideW}], Padding: [${padH}, ${padW}], Groups: ${groups}`
      );
      lines.push('');
    }

    lines.push(`@group(0) @binding(0) var<storage, read> input: array<f32>;`);
    lines.push(`@group(0) @binding(1) var<storage, read> weight: array<f32>;`);
    lines.push(`@group(0) @binding(2) var<storage, read_write> output: array<f32>;`);
    lines.push('');
    lines.push(`const IN_C: u32 = ${inChannelsPerGroup * groups}u;`);
    lines.push(`const IN_C_PER_GROUP: u32 = ${inChannelsPerGroup}u;`);
    lines.push(`const OUT_C: u32 = ${outChannels}u;`);
    lines.push(`const KH: u32 = ${kH}u;`);
    lines.push(`const KW: u32 = ${kW}u;`);
    lines.push(`const STRIDE_H: u32 = ${strideH}u;`);
    lines.push(`const STRIDE_W: u32 = ${strideW}u;`);
    lines.push(`const PAD_H: u32 = ${padH}u;`);
    lines.push(`const PAD_W: u32 = ${padW}u;`);
    lines.push(`const GROUPS: u32 = ${groups}u;`);
    lines.push(`const IN_H: u32 = ${spatialH}u;`);
    lines.push(`const IN_W: u32 = ${spatialW}u;`);
    lines.push(`const OUT_H: u32 = ${outH}u;`);
    lines.push(`const OUT_W: u32 = ${outW}u;`);
    lines.push('');
    lines.push(`@compute @workgroup_size(${wgSize})`);
    lines.push(`fn main(@builtin(global_invocation_id) gid: vec3u) {`);
    lines.push(`  let global_idx = gid[0];`);
    lines.push(`  let total_out = OUT_C * OUT_H * OUT_W;`);
    lines.push(`  if (global_idx >= total_out) { return; }`);
    lines.push('');
    lines.push(`  let oc = global_idx / (OUT_H * OUT_W);`);
    lines.push(`  let spatial = global_idx % (OUT_H * OUT_W);`);
    lines.push(`  let oh = spatial / OUT_W;`);
    lines.push(`  let ow = spatial % OUT_W;`);
    lines.push('');
    lines.push(`  let group_id = oc / (OUT_C / GROUPS);`);
    lines.push(`  let ic_start = group_id * IN_C_PER_GROUP;`);
    lines.push('');
    lines.push(`  var sum: f32 = 0.0;`);
    lines.push(`  for (var ic: u32 = 0u; ic < IN_C_PER_GROUP; ic = ic + 1u) {`);
    lines.push(`    for (var kh: u32 = 0u; kh < KH; kh = kh + 1u) {`);
    lines.push(`      for (var kw: u32 = 0u; kw < KW; kw = kw + 1u) {`);
    lines.push(`        let ih = oh * STRIDE_H + kh - PAD_H;`);
    lines.push(`        let iw = ow * STRIDE_W + kw - PAD_W;`);
    lines.push(`        if (ih < IN_H && iw < IN_W) {`);
    lines.push(`          let in_idx = (ic_start + ic) * IN_H * IN_W + ih * IN_W + iw;`);
    lines.push(
      `          let w_idx = oc * IN_C_PER_GROUP * KH * KW + ic * KH * KW + kh * KW + kw;`
    );
    lines.push(`          sum = sum + input[in_idx] * weight[w_idx];`);
    lines.push(`        }`);
    lines.push(`      }`);
    lines.push(`    }`);
    lines.push(`  }`);
    lines.push(`  output[global_idx] = sum;`);
    lines.push(`}`);

    return {
      nodeId: node.id,
      nodeType: 'Conv2d',
      wgsl: lines.join('\n'),
      buffers: [
        {
          binding: 0,
          name: `${this.escapeStringValue(node.id as string, 'TypeScript')}_input`,
          type: 'read-only-storage',
          elementType: 'f32',
          size: inChannelsPerGroup * groups * spatialH * spatialW,
          role: 'input',
        },
        {
          binding: 1,
          name: `${this.escapeStringValue(node.id as string, 'TypeScript')}_weight`,
          type: 'read-only-storage',
          elementType: 'f32',
          size: outChannels * inChannelsPerGroup * kH * kW,
          role: 'params',
        },
        {
          binding: 2,
          name: `${this.escapeStringValue(node.id as string, 'TypeScript')}_output`,
          type: 'storage',
          elementType: 'f32',
          size: totalOutputElements,
          role: 'output',
        },
      ],
      dispatch: [Math.ceil(totalOutputElements / wgSize), 1, 1],
    };
  }

  // ---------------------------------------------------------------------------
  // Utility Shaders
  // ---------------------------------------------------------------------------

  /**
   * Generate WGSL compute shader for Threshold: spike when x >= theta
   */
  private generateThresholdShader(node: NIRNode): WGSLShaderUnit {
    const params = node.params as NIRThresholdParams;
    const size = params.threshold.length;
    const wgSize = this.options.workgroupSize;

    const lines: string[] = [];
    if (this.options.includeComments) {
      lines.push(`// Threshold: ${this.escapeStringValue(node.id as string, 'TypeScript')}`);
      lines.push(`// output = (input >= threshold) ? 1.0 : 0.0`);
      lines.push('');
    }

    lines.push(`@group(0) @binding(0) var<storage, read> input: array<f32>;`);
    lines.push(`@group(0) @binding(1) var<storage, read> threshold: array<f32>;`);
    lines.push(`@group(0) @binding(2) var<storage, read_write> output: array<f32>;`);
    lines.push('');
    lines.push(`@compute @workgroup_size(${wgSize})`);
    lines.push(`fn main(@builtin(global_invocation_id) gid: vec3u) {`);
    lines.push(`  let idx = gid[0];`);
    lines.push(`  if (idx >= arrayLength(&output)) { return; }`);
    lines.push('');
    lines.push(`  if (input[idx] >= threshold[idx]) {`);
    lines.push(`    output[idx] = 1.0;`);
    lines.push(`  } else {`);
    lines.push(`    output[idx] = 0.0;`);
    lines.push(`  }`);
    lines.push(`}`);

    return {
      nodeId: node.id,
      nodeType: 'Threshold',
      wgsl: lines.join('\n'),
      buffers: [
        {
          binding: 0,
          name: `${this.escapeStringValue(node.id as string, 'TypeScript')}_input`,
          type: 'read-only-storage',
          elementType: 'f32',
          size,
          role: 'input',
        },
        {
          binding: 1,
          name: `${this.escapeStringValue(node.id as string, 'TypeScript')}_threshold`,
          type: 'read-only-storage',
          elementType: 'f32',
          size,
          role: 'params',
        },
        {
          binding: 2,
          name: `${this.escapeStringValue(node.id as string, 'TypeScript')}_output`,
          type: 'storage',
          elementType: 'f32',
          size,
          role: 'output',
        },
      ],
      dispatch: [Math.ceil(size / wgSize), 1, 1],
    };
  }

  /**
   * Generate WGSL compute shader for Scale: y = s * x
   */
  private generateScaleShader(node: NIRNode): WGSLShaderUnit {
    const params = node.params as NIRScaleParams;
    const size = params.scale.length;
    const wgSize = this.options.workgroupSize;

    const lines: string[] = [];
    if (this.options.includeComments) {
      lines.push(`// Scale: ${this.escapeStringValue(node.id as string, 'TypeScript')}`);
      lines.push(`// y = scale * x`);
      lines.push('');
    }

    lines.push(`@group(0) @binding(0) var<storage, read> input: array<f32>;`);
    lines.push(`@group(0) @binding(1) var<storage, read> scale: array<f32>;`);
    lines.push(`@group(0) @binding(2) var<storage, read_write> output: array<f32>;`);
    lines.push('');
    lines.push(`@compute @workgroup_size(${wgSize})`);
    lines.push(`fn main(@builtin(global_invocation_id) gid: vec3u) {`);
    lines.push(`  let idx = gid[0];`);
    lines.push(`  if (idx >= arrayLength(&output)) { return; }`);
    lines.push(`  output[idx] = scale[idx] * input[idx];`);
    lines.push(`}`);

    return {
      nodeId: node.id,
      nodeType: 'Scale',
      wgsl: lines.join('\n'),
      buffers: [
        {
          binding: 0,
          name: `${this.escapeStringValue(node.id as string, 'TypeScript')}_input`,
          type: 'read-only-storage',
          elementType: 'f32',
          size,
          role: 'input',
        },
        {
          binding: 1,
          name: `${this.escapeStringValue(node.id as string, 'TypeScript')}_scale`,
          type: 'read-only-storage',
          elementType: 'f32',
          size,
          role: 'params',
        },
        {
          binding: 2,
          name: `${this.escapeStringValue(node.id as string, 'TypeScript')}_output`,
          type: 'storage',
          elementType: 'f32',
          size,
          role: 'output',
        },
      ],
      dispatch: [Math.ceil(size / wgSize), 1, 1],
    };
  }

  /**
   * Generate WGSL compute shader for Delay: output(t) = input(t - delay)
   */
  private generateDelayShader(node: NIRNode): WGSLShaderUnit {
    const params = node.params as NIRDelayParams;
    const size = params.delay.length;
    const wgSize = this.options.workgroupSize;

    const lines: string[] = [];
    if (this.options.includeComments) {
      lines.push(`// Delay: ${this.escapeStringValue(node.id as string, 'TypeScript')}`);
      lines.push(`// Ring buffer delay line`);
      lines.push('');
    }

    lines.push(this.generateSimParamsStruct());
    lines.push('');
    lines.push(`@group(0) @binding(0) var<uniform> sim: SimParams;`);
    lines.push(`@group(0) @binding(1) var<storage, read> input: array<f32>;`);
    lines.push(`@group(0) @binding(2) var<storage, read> delay_steps: array<u32>;`);
    lines.push(`@group(0) @binding(3) var<storage, read_write> ring_buffer: array<f32>;`);
    lines.push(`@group(0) @binding(4) var<storage, read_write> output: array<f32>;`);
    lines.push('');
    lines.push(`const BUFFER_SIZE: u32 = 256u;`);
    lines.push('');
    lines.push(`@compute @workgroup_size(${wgSize})`);
    lines.push(`fn main(@builtin(global_invocation_id) gid: vec3u) {`);
    lines.push(`  let idx = gid[0];`);
    lines.push(`  if (idx >= arrayLength(&output)) { return; }`);
    lines.push('');
    lines.push(`  let t = sim.timestep;`);
    lines.push(`  let d = delay_steps[idx];`);
    lines.push(`  let write_pos = (t % BUFFER_SIZE) * ${size}u + idx;`);
    lines.push(`  ring_buffer[write_pos] = input[idx];`);
    lines.push('');
    lines.push(`  let read_t = (t + BUFFER_SIZE - d) % BUFFER_SIZE;`);
    lines.push(`  let read_pos = read_t * ${size}u + idx;`);
    lines.push(`  output[idx] = ring_buffer[read_pos];`);
    lines.push(`}`);

    return {
      nodeId: node.id,
      nodeType: 'Delay',
      wgsl: lines.join('\n'),
      buffers: [
        {
          binding: 0,
          name: 'simulation_params',
          type: 'uniform',
          elementType: 'SimParams',
          size: 1,
          role: 'simulation',
        },
        {
          binding: 1,
          name: `${this.escapeStringValue(node.id as string, 'TypeScript')}_input`,
          type: 'read-only-storage',
          elementType: 'f32',
          size,
          role: 'input',
        },
        {
          binding: 2,
          name: `${this.escapeStringValue(node.id as string, 'TypeScript')}_delay_steps`,
          type: 'read-only-storage',
          elementType: 'u32',
          size,
          role: 'params',
        },
        {
          binding: 3,
          name: `${this.escapeStringValue(node.id as string, 'TypeScript')}_ring_buffer`,
          type: 'storage',
          elementType: 'f32',
          size: size * 256,
          role: 'state',
        },
        {
          binding: 4,
          name: `${this.escapeStringValue(node.id as string, 'TypeScript')}_output`,
          type: 'storage',
          elementType: 'f32',
          size,
          role: 'output',
        },
      ],
      dispatch: [Math.ceil(size / wgSize), 1, 1],
    };
  }

  /**
   * Generate WGSL compute shader for Flatten.
   * In GPU memory this is essentially a copy/index-remap operation.
   */
  private generateFlattenShader(node: NIRNode): WGSLShaderUnit {
    const params = node.params as NIRFlattenParams;
    const shape = params.input_type.shape;
    const totalSize = shape.reduce((a, b) => a * b, 1);
    const wgSize = this.options.workgroupSize;

    const lines: string[] = [];
    if (this.options.includeComments) {
      lines.push(`// Flatten: ${this.escapeStringValue(node.id as string, 'TypeScript')}`);
      lines.push(`// Input shape: [${shape.join(', ')}] -> flat [${totalSize}]`);
      lines.push('');
    }

    lines.push(`@group(0) @binding(0) var<storage, read> input: array<f32>;`);
    lines.push(`@group(0) @binding(1) var<storage, read_write> output: array<f32>;`);
    lines.push('');
    lines.push(`@compute @workgroup_size(${wgSize})`);
    lines.push(`fn main(@builtin(global_invocation_id) gid: vec3u) {`);
    lines.push(`  let idx = gid[0];`);
    lines.push(`  if (idx >= arrayLength(&output)) { return; }`);
    lines.push(`  output[idx] = input[idx];`);
    lines.push(`}`);

    return {
      nodeId: node.id,
      nodeType: 'Flatten',
      wgsl: lines.join('\n'),
      buffers: [
        {
          binding: 0,
          name: `${this.escapeStringValue(node.id as string, 'TypeScript')}_input`,
          type: 'read-only-storage',
          elementType: 'f32',
          size: totalSize,
          role: 'input',
        },
        {
          binding: 1,
          name: `${this.escapeStringValue(node.id as string, 'TypeScript')}_output`,
          type: 'storage',
          elementType: 'f32',
          size: totalSize,
          role: 'output',
        },
      ],
      dispatch: [Math.ceil(totalSize / wgSize), 1, 1],
    };
  }

  /**
   * Generate WGSL compute shader for SumPooling.
   */
  private generateSumPoolingShader(node: NIRNode): WGSLShaderUnit {
    const params = node.params as Record<string, unknown>;
    const kernelSize = (params.kernel_size as number[])?.[0] ?? 2;
    const wgSize = this.options.workgroupSize;
    // Assume 28x28 input, compute output size
    const inH = 28;
    const inW = 28;
    const outH = Math.floor(inH / kernelSize);
    const outW = Math.floor(inW / kernelSize);
    const totalOutput = outH * outW;

    const lines: string[] = [];
    if (this.options.includeComments) {
      lines.push(`// SumPooling: ${this.escapeStringValue(node.id as string, 'TypeScript')}`);
      lines.push(`// Kernel: ${kernelSize}x${kernelSize}`);
      lines.push('');
    }

    lines.push(`@group(0) @binding(0) var<storage, read> input: array<f32>;`);
    lines.push(`@group(0) @binding(1) var<storage, read_write> output: array<f32>;`);
    lines.push('');
    lines.push(`const IN_W: u32 = ${inW}u;`);
    lines.push(`const OUT_W: u32 = ${outW}u;`);
    lines.push(`const KERNEL: u32 = ${kernelSize}u;`);
    lines.push('');
    lines.push(`@compute @workgroup_size(${wgSize})`);
    lines.push(`fn main(@builtin(global_invocation_id) gid: vec3u) {`);
    lines.push(`  let idx = gid[0];`);
    lines.push(`  if (idx >= arrayLength(&output)) { return; }`);
    lines.push('');
    lines.push(`  let oh = idx / OUT_W;`);
    lines.push(`  let ow = idx % OUT_W;`);
    lines.push(`  var sum: f32 = 0.0;`);
    lines.push(`  for (var kh: u32 = 0u; kh < KERNEL; kh = kh + 1u) {`);
    lines.push(`    for (var kw: u32 = 0u; kw < KERNEL; kw = kw + 1u) {`);
    lines.push(`      let ih = oh * KERNEL + kh;`);
    lines.push(`      let iw = ow * KERNEL + kw;`);
    lines.push(`      sum = sum + input[ih * IN_W + iw];`);
    lines.push(`    }`);
    lines.push(`  }`);
    lines.push(`  output[idx] = sum;`);
    lines.push(`}`);

    return {
      nodeId: node.id,
      nodeType: 'SumPooling',
      wgsl: lines.join('\n'),
      buffers: [
        {
          binding: 0,
          name: `${this.escapeStringValue(node.id as string, 'TypeScript')}_input`,
          type: 'read-only-storage',
          elementType: 'f32',
          size: inH * inW,
          role: 'input',
        },
        {
          binding: 1,
          name: `${this.escapeStringValue(node.id as string, 'TypeScript')}_output`,
          type: 'storage',
          elementType: 'f32',
          size: totalOutput,
          role: 'output',
        },
      ],
      dispatch: [Math.ceil(totalOutput / wgSize), 1, 1],
    };
  }

  /**
   * Generate WGSL compute shader for AvgPooling.
   */
  private generateAvgPoolingShader(node: NIRNode): WGSLShaderUnit {
    const params = node.params as Record<string, unknown>;
    const kernelSize = (params.kernel_size as number[])?.[0] ?? 2;
    const wgSize = this.options.workgroupSize;
    const inH = 28;
    const inW = 28;
    const outH = Math.floor(inH / kernelSize);
    const outW = Math.floor(inW / kernelSize);
    const totalOutput = outH * outW;
    const kernelArea = kernelSize * kernelSize;

    const lines: string[] = [];
    if (this.options.includeComments) {
      lines.push(`// AvgPooling: ${this.escapeStringValue(node.id as string, 'TypeScript')}`);
      lines.push(`// Kernel: ${kernelSize}x${kernelSize}`);
      lines.push('');
    }

    lines.push(`@group(0) @binding(0) var<storage, read> input: array<f32>;`);
    lines.push(`@group(0) @binding(1) var<storage, read_write> output: array<f32>;`);
    lines.push('');
    lines.push(`const IN_W: u32 = ${inW}u;`);
    lines.push(`const OUT_W: u32 = ${outW}u;`);
    lines.push(`const KERNEL: u32 = ${kernelSize}u;`);
    lines.push(`const KERNEL_AREA: f32 = ${this.toF32(kernelArea)};`);
    lines.push('');
    lines.push(`@compute @workgroup_size(${wgSize})`);
    lines.push(`fn main(@builtin(global_invocation_id) gid: vec3u) {`);
    lines.push(`  let idx = gid[0];`);
    lines.push(`  if (idx >= arrayLength(&output)) { return; }`);
    lines.push('');
    lines.push(`  let oh = idx / OUT_W;`);
    lines.push(`  let ow = idx % OUT_W;`);
    lines.push(`  var sum: f32 = 0.0;`);
    lines.push(`  for (var kh: u32 = 0u; kh < KERNEL; kh = kh + 1u) {`);
    lines.push(`    for (var kw: u32 = 0u; kw < KERNEL; kw = kw + 1u) {`);
    lines.push(`      let ih = oh * KERNEL + kh;`);
    lines.push(`      let iw = ow * KERNEL + kw;`);
    lines.push(`      sum = sum + input[ih * IN_W + iw];`);
    lines.push(`    }`);
    lines.push(`  }`);
    lines.push(`  output[idx] = sum / KERNEL_AREA;`);
    lines.push(`}`);

    return {
      nodeId: node.id,
      nodeType: 'AvgPooling',
      wgsl: lines.join('\n'),
      buffers: [
        {
          binding: 0,
          name: `${this.escapeStringValue(node.id as string, 'TypeScript')}_input`,
          type: 'read-only-storage',
          elementType: 'f32',
          size: inH * inW,
          role: 'input',
        },
        {
          binding: 1,
          name: `${this.escapeStringValue(node.id as string, 'TypeScript')}_output`,
          type: 'storage',
          elementType: 'f32',
          size: totalOutput,
          role: 'output',
        },
      ],
      dispatch: [Math.ceil(totalOutput / wgSize), 1, 1],
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Generate the SimParams struct used by neuron model shaders.
   */
  private generateSimParamsStruct(): string {
    return [
      `struct SimParams {`,
      `  dt: f32,`,
      `  timestep: u32,`,
      `  total_steps: u32,`,
      `  _pad: u32,`,
      `};`,
    ].join('\n');
  }

  /**
   * Format a numeric value as a WGSL f32 literal.
   */
  private toF32(v: number): string {
    const s = v.toString();
    return s.includes('.') ? s : s + '.0';
  }
}

export default NIRToWGSLCompiler;
