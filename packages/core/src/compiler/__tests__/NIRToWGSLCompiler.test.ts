import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NIRToWGSLCompiler } from '../NIRToWGSLCompiler';
import type {
  NIRToWGSLResult,
  WGSLShaderUnit,
  WGSLBufferDefinition,
  WGSLBufferConnection,
} from '../NIRToWGSLCompiler';
import type { NIRGraph, NIRNode, NIREdge } from '../NIRTraitMap';

// Mock RBAC for tests (W.013 pattern)
vi.mock('../identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getRBAC: () => ({ checkAccess: () => ({ allowed: true }) }),
  };
});

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Build a minimal NIR graph with Input and Output boundary nodes.
 */
function makeGraph(overrides: Partial<NIRGraph> = {}): NIRGraph {
  return {
    version: '0.5.0',
    nodes: {
      input: { id: 'input', type: 'Input', params: { shape: [128] } },
      output: { id: 'output', type: 'Output', params: { shape: [128] } },
      ...(overrides.nodes || {}),
    },
    edges: overrides.edges || [],
    metadata: {
      source: 'TestNetwork',
      generator: 'test',
      targetPlatforms: ['loihi2'],
      generatedAt: new Date().toISOString(),
      ...(overrides.metadata || {}),
    },
  };
}

/**
 * Build a LIF neuron node with specified size.
 */
function makeLIFNode(id: string, size: number = 64): NIRNode {
  return {
    id,
    type: 'LIF',
    params: {
      tau: Array(size).fill(20.0),
      r: Array(size).fill(1.0),
      v_leak: Array(size).fill(0.0),
      v_threshold: Array(size).fill(1.0),
    },
    metadata: { source_trait: 'lif_neuron', num_neurons: size },
  };
}

/**
 * Build a CubaLIF neuron node.
 */
function makeCubaLIFNode(id: string, size: number = 32): NIRNode {
  return {
    id,
    type: 'CubaLIF',
    params: {
      tau_syn: Array(size).fill(5.0),
      tau_mem: Array(size).fill(20.0),
      r: Array(size).fill(1.0),
      v_leak: Array(size).fill(0.0),
      v_threshold: Array(size).fill(1.0),
      w_in: Array(size).fill(1.0),
    },
    metadata: { source_trait: 'cuba_lif_neuron', num_neurons: size },
  };
}

/**
 * Build an Affine node.
 */
function makeAffineNode(id: string, inputSize: number, outputSize: number): NIRNode {
  const weight: number[][] = [];
  for (let i = 0; i < outputSize; i++) {
    weight.push(Array(inputSize).fill(0.01));
  }
  return {
    id,
    type: 'Affine',
    params: {
      weight,
      bias: Array(outputSize).fill(0.0),
    },
    metadata: { source_trait: 'synaptic_connection' },
  };
}

/**
 * Build a Linear node.
 */
function makeLinearNode(id: string, inputSize: number, outputSize: number): NIRNode {
  const weight: number[][] = [];
  for (let i = 0; i < outputSize; i++) {
    weight.push(Array(inputSize).fill(0.01));
  }
  return {
    id,
    type: 'Linear',
    params: { weight },
    metadata: { source_trait: 'linear_connection' },
  };
}

/**
 * Build a Conv2d node.
 */
function makeConv2dNode(
  id: string,
  outChannels: number = 16,
  inChannels: number = 1,
  kernelSize: number = 3
): NIRNode {
  const weight: number[][][][] = [];
  for (let oc = 0; oc < outChannels; oc++) {
    const ochSlice: number[][][] = [];
    for (let ic = 0; ic < inChannels; ic++) {
      const icSlice: number[][] = [];
      for (let kh = 0; kh < kernelSize; kh++) {
        icSlice.push(Array(kernelSize).fill(0.01));
      }
      ochSlice.push(icSlice);
    }
    weight.push(ochSlice);
  }
  return {
    id,
    type: 'Conv2d',
    params: {
      weight,
      stride: [1, 1],
      padding: [0, 0],
      dilation: [1, 1],
      groups: 1,
    },
    metadata: { source_trait: 'conv_connection' },
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('NIRToWGSLCompiler', () => {
  let compiler: NIRToWGSLCompiler;

  beforeEach(() => {
    compiler = new NIRToWGSLCompiler();
  });

  // =========================================================================
  // Constructor / Options
  // =========================================================================

  describe('constructor and options', () => {
    it('uses default options', () => {
      const graph = makeGraph({
        nodes: {
          input: { id: 'input', type: 'Input', params: { shape: [64] } },
          lif: makeLIFNode('lif', 64),
          output: { id: 'output', type: 'Output', params: { shape: [64] } },
        },
        edges: [
          { source: 'input', target: 'lif' },
          { source: 'lif', target: 'output' },
        ],
      });
      const result = compiler.compileGraph(graph);

      expect(result.metadata.integrationMethod).toBe('euler');
      expect(result.metadata.dt).toBe(1.0);
      expect(result.metadata.workgroupSize).toBe(64);
      expect(result.metadata.generator).toContain('NIRToWGSLCompiler');
    });

    it('respects custom integration method', () => {
      const c = new NIRToWGSLCompiler({ integrationMethod: 'rk4' });
      const graph = makeGraph({
        nodes: {
          input: { id: 'input', type: 'Input', params: { shape: [16] } },
          lif: makeLIFNode('lif', 16),
          output: { id: 'output', type: 'Output', params: { shape: [16] } },
        },
        edges: [
          { source: 'input', target: 'lif' },
          { source: 'lif', target: 'output' },
        ],
      });
      const result = c.compileGraph(graph);

      expect(result.metadata.integrationMethod).toBe('rk4');
      const lifShader = result.shaders.find(s => s.nodeType === 'LIF');
      expect(lifShader).toBeDefined();
      expect(lifShader!.wgsl).toContain('RK4');
      expect(lifShader!.wgsl).toContain('lif_dvdt');
    });

    it('respects custom dt', () => {
      const c = new NIRToWGSLCompiler({ dt: 0.5 });
      const graph = makeGraph({
        nodes: {
          input: { id: 'input', type: 'Input', params: { shape: [8] } },
          lif: makeLIFNode('lif', 8),
          output: { id: 'output', type: 'Output', params: { shape: [8] } },
        },
        edges: [
          { source: 'input', target: 'lif' },
          { source: 'lif', target: 'output' },
        ],
      });
      const result = c.compileGraph(graph);

      expect(result.metadata.dt).toBe(0.5);
      const lifShader = result.shaders.find(s => s.nodeType === 'LIF');
      expect(lifShader!.wgsl).toContain('0.5');
    });

    it('respects custom workgroup size', () => {
      const c = new NIRToWGSLCompiler({ workgroupSize: 128 });
      const graph = makeGraph({
        nodes: {
          input: { id: 'input', type: 'Input', params: { shape: [128] } },
          lif: makeLIFNode('lif', 128),
          output: { id: 'output', type: 'Output', params: { shape: [128] } },
        },
        edges: [
          { source: 'input', target: 'lif' },
          { source: 'lif', target: 'output' },
        ],
      });
      const result = c.compileGraph(graph);

      const lifShader = result.shaders.find(s => s.nodeType === 'LIF');
      expect(lifShader!.wgsl).toContain('@workgroup_size(128)');
    });

    it('supports includeComments: false', () => {
      const c = new NIRToWGSLCompiler({ includeComments: false });
      const graph = makeGraph({
        nodes: {
          input: { id: 'input', type: 'Input', params: { shape: [8] } },
          lif: makeLIFNode('lif', 8),
          output: { id: 'output', type: 'Output', params: { shape: [8] } },
        },
        edges: [
          { source: 'input', target: 'lif' },
          { source: 'lif', target: 'output' },
        ],
      });
      const result = c.compileGraph(graph);
      const lifShader = result.shaders.find(s => s.nodeType === 'LIF');
      // Comments start with "// LIF Neuron"
      expect(lifShader!.wgsl).not.toContain('// LIF Neuron');
    });
  });

  // =========================================================================
  // compileNIRGraph (JSON string input)
  // =========================================================================

  describe('compileNIRGraph', () => {
    it('parses JSON and compiles', () => {
      const graph = makeGraph({
        nodes: {
          input: { id: 'input', type: 'Input', params: { shape: [8] } },
          lif: makeLIFNode('lif', 8),
          output: { id: 'output', type: 'Output', params: { shape: [8] } },
        },
        edges: [
          { source: 'input', target: 'lif' },
          { source: 'lif', target: 'output' },
        ],
      });
      const json = JSON.stringify(graph);
      const result = compiler.compileNIRGraph(json);

      expect(result.shaders.length).toBeGreaterThan(0);
      expect(result.metadata.source).toBe('TestNetwork');
    });

    it('throws compile() with clear error message', () => {
      expect(() => {
        compiler.compile({} as any, 'test-token');
      }).toThrow('compileNIRGraph');
    });
  });

  // =========================================================================
  // Structural: Boundary Nodes Skipped
  // =========================================================================

  describe('boundary node handling', () => {
    it('skips Input and Output nodes in shader generation', () => {
      const graph = makeGraph({
        nodes: {
          input: { id: 'input', type: 'Input', params: { shape: [64] } },
          lif: makeLIFNode('lif', 64),
          output: { id: 'output', type: 'Output', params: { shape: [64] } },
        },
        edges: [
          { source: 'input', target: 'lif' },
          { source: 'lif', target: 'output' },
        ],
      });
      const result = compiler.compileGraph(graph);

      // Should only generate shader for lif, not input/output
      expect(result.shaders.length).toBe(1);
      expect(result.shaders[0].nodeId).toBe('lif');
    });

    it('skips boundary edges in connections', () => {
      const graph = makeGraph({
        nodes: {
          input: { id: 'input', type: 'Input', params: { shape: [64] } },
          lif: makeLIFNode('lif', 64),
          output: { id: 'output', type: 'Output', params: { shape: [64] } },
        },
        edges: [
          { source: 'input', target: 'lif' },
          { source: 'lif', target: 'output' },
        ],
      });
      const result = compiler.compileGraph(graph);

      // Connections should not include Input -> lif or lif -> Output
      expect(result.connections.length).toBe(0);
    });
  });

  // =========================================================================
  // LIF Neuron Shader
  // =========================================================================

  describe('LIF neuron shader', () => {
    it('generates valid WGSL for LIF node (Euler)', () => {
      const node = makeLIFNode('hidden_lif', 64);
      const shader = compiler.generateShaderForNode(node);

      expect(shader).not.toBeNull();
      expect(shader!.nodeId).toBe('hidden_lif');
      expect(shader!.nodeType).toBe('LIF');
      expect(shader!.wgsl).toContain('@compute @workgroup_size(64)');
      expect(shader!.wgsl).toContain('fn main');
      expect(shader!.wgsl).toContain('Forward Euler');
      expect(shader!.wgsl).toContain('voltage');
      expect(shader!.wgsl).toContain('spikes');
      expect(shader!.wgsl).toContain('v_threshold');
    });

    it('generates RK4 kernel when configured', () => {
      const c = new NIRToWGSLCompiler({ integrationMethod: 'rk4' });
      const node = makeLIFNode('rk4_lif', 32);
      const shader = c.generateShaderForNode(node);

      expect(shader!.wgsl).toContain('RK4');
      expect(shader!.wgsl).toContain('lif_dvdt');
      expect(shader!.wgsl).toContain('k1');
      expect(shader!.wgsl).toContain('k2');
      expect(shader!.wgsl).toContain('k3');
      expect(shader!.wgsl).toContain('k4');
    });

    it('has correct buffer layout', () => {
      const node = makeLIFNode('lif_buffers', 64);
      const shader = compiler.generateShaderForNode(node);

      expect(shader!.buffers.length).toBe(8);

      const bufferNames = shader!.buffers.map(b => b.name);
      expect(bufferNames).toContain('simulation_params');
      expect(bufferNames).toContain('lif_buffers_input');
      expect(bufferNames).toContain('lif_buffers_tau');
      expect(bufferNames).toContain('lif_buffers_r');
      expect(bufferNames).toContain('lif_buffers_v_leak');
      expect(bufferNames).toContain('lif_buffers_v_threshold');
      expect(bufferNames).toContain('lif_buffers_voltage');
      expect(bufferNames).toContain('lif_buffers_output');

      // Check roles
      const stateBuffers = shader!.buffers.filter(b => b.role === 'state');
      expect(stateBuffers.length).toBe(1); // voltage
      const outputBuffers = shader!.buffers.filter(b => b.role === 'output');
      expect(outputBuffers.length).toBe(1); // spikes
    });

    it('computes correct dispatch dimensions', () => {
      const node = makeLIFNode('lif_dispatch', 200);
      const shader = compiler.generateShaderForNode(node);

      // 200 / 64 = 3.125, ceil = 4
      expect(shader!.dispatch).toEqual([4, 1, 1]);
    });

    it('includes spike detection and reset', () => {
      const node = makeLIFNode('lif_spike', 8);
      const shader = compiler.generateShaderForNode(node);

      expect(shader!.wgsl).toContain('v >= v_thr');
      expect(shader!.wgsl).toContain('spikes[idx] = 1u');
      expect(shader!.wgsl).toContain('spikes[idx] = 0u');
      expect(shader!.wgsl).toContain('0.0'); // reset voltage
    });

    it('respects custom reset voltage', () => {
      const c = new NIRToWGSLCompiler({ resetVoltage: -0.5 });
      const node = makeLIFNode('lif_reset', 8);
      const shader = c.generateShaderForNode(node);

      expect(shader!.wgsl).toContain('-0.5');
    });
  });

  // =========================================================================
  // CubaLIF Neuron Shader
  // =========================================================================

  describe('CubaLIF neuron shader', () => {
    it('generates valid WGSL for CubaLIF node (Euler)', () => {
      const node = makeCubaLIFNode('cuba', 32);
      const shader = compiler.generateShaderForNode(node);

      expect(shader).not.toBeNull();
      expect(shader!.nodeType).toBe('CubaLIF');
      expect(shader!.wgsl).toContain('tau_syn');
      expect(shader!.wgsl).toContain('tau_mem');
      expect(shader!.wgsl).toContain('i_syn');
      expect(shader!.wgsl).toContain('w_in');
      expect(shader!.wgsl).toContain('Synaptic current');
      expect(shader!.wgsl).toContain('Membrane voltage');
    });

    it('generates RK4 kernel for CubaLIF', () => {
      const c = new NIRToWGSLCompiler({ integrationMethod: 'rk4' });
      const node = makeCubaLIFNode('cuba_rk4', 16);
      const shader = c.generateShaderForNode(node);

      expect(shader!.wgsl).toContain('cuba_di_dt');
      expect(shader!.wgsl).toContain('cuba_dv_dt');
      expect(shader!.wgsl).toContain('ki1');
      expect(shader!.wgsl).toContain('kv1');
    });

    it('has correct buffer layout with synaptic state', () => {
      const node = makeCubaLIFNode('cuba_bufs', 32);
      const shader = compiler.generateShaderForNode(node);

      expect(shader!.buffers.length).toBe(11);

      // Should have both i_syn and voltage as state buffers
      const stateBuffers = shader!.buffers.filter(b => b.role === 'state');
      expect(stateBuffers.length).toBe(2); // i_syn + voltage
    });
  });

  // =========================================================================
  // IF Neuron Shader
  // =========================================================================

  describe('IF neuron shader', () => {
    it('generates valid WGSL for IF node', () => {
      const node: NIRNode = {
        id: 'if_neuron',
        type: 'IF',
        params: {
          r: Array(16).fill(1.0),
          v_threshold: Array(16).fill(1.0),
        },
      };
      const shader = compiler.generateShaderForNode(node);

      expect(shader).not.toBeNull();
      expect(shader!.nodeType).toBe('IF');
      expect(shader!.wgsl).toContain('Pure integration');
      expect(shader!.wgsl).not.toContain('tau'); // IF has no tau (no leak)
    });
  });

  // =========================================================================
  // LI (Leaky Integrator) Shader
  // =========================================================================

  describe('LI shader', () => {
    it('generates valid WGSL for LI node (no spiking)', () => {
      const node: NIRNode = {
        id: 'readout',
        type: 'LI',
        params: {
          tau: Array(10).fill(50.0),
          r: Array(10).fill(1.0),
          v_leak: Array(10).fill(0.0),
        },
      };
      const shader = compiler.generateShaderForNode(node);

      expect(shader).not.toBeNull();
      expect(shader!.nodeType).toBe('LI');
      expect(shader!.wgsl).toContain('Leaky integration (no spike)');
      expect(shader!.wgsl).toContain('output[idx] = v');
      // LI should NOT have spikes buffer
      expect(shader!.wgsl).not.toContain('spikes');
    });

    it('has float output (not u32 spikes)', () => {
      const node: NIRNode = {
        id: 'li_out',
        type: 'LI',
        params: {
          tau: Array(10).fill(20.0),
          r: Array(10).fill(1.0),
          v_leak: Array(10).fill(0.0),
        },
      };
      const shader = compiler.generateShaderForNode(node);

      const outputBuf = shader!.buffers.find(b => b.role === 'output');
      expect(outputBuf).toBeDefined();
      expect(outputBuf!.elementType).toBe('f32'); // not u32
    });
  });

  // =========================================================================
  // Integrator Shader
  // =========================================================================

  describe('Integrator shader', () => {
    it('generates valid WGSL for Integrator node', () => {
      const node: NIRNode = {
        id: 'accum',
        type: 'Integrator',
        params: { r: Array(8).fill(1.0) },
      };
      const shader = compiler.generateShaderForNode(node);

      expect(shader).not.toBeNull();
      expect(shader!.nodeType).toBe('Integrator');
      expect(shader!.wgsl).toContain('r[idx] * input[idx]');
    });
  });

  // =========================================================================
  // Affine Transform Shader
  // =========================================================================

  describe('Affine shader', () => {
    it('generates matrix-vector multiply with bias', () => {
      const node = makeAffineNode('fc1', 128, 64);
      const shader = compiler.generateShaderForNode(node);

      expect(shader).not.toBeNull();
      expect(shader!.nodeType).toBe('Affine');
      expect(shader!.wgsl).toContain('weight[row * INPUT_SIZE + col]');
      expect(shader!.wgsl).toContain('sum + bias[row]');
      expect(shader!.wgsl).toContain('INPUT_SIZE: u32 = 128u');
    });

    it('has correct buffer sizes', () => {
      const node = makeAffineNode('fc', 128, 64);
      const shader = compiler.generateShaderForNode(node);

      const inputBuf = shader!.buffers.find(b => b.name.includes('input'));
      const weightBuf = shader!.buffers.find(b => b.name.includes('weight'));
      const biasBuf = shader!.buffers.find(b => b.name.includes('bias'));
      const outputBuf = shader!.buffers.find(b => b.role === 'output');

      expect(inputBuf!.size).toBe(128);
      expect(weightBuf!.size).toBe(128 * 64); // outputSize * inputSize
      expect(biasBuf!.size).toBe(64);
      expect(outputBuf!.size).toBe(64);
    });
  });

  // =========================================================================
  // Linear Transform Shader
  // =========================================================================

  describe('Linear shader', () => {
    it('generates matrix-vector multiply without bias', () => {
      const node = makeLinearNode('linear1', 64, 32);
      const shader = compiler.generateShaderForNode(node);

      expect(shader).not.toBeNull();
      expect(shader!.nodeType).toBe('Linear');
      expect(shader!.wgsl).toContain('weight[row * INPUT_SIZE + col]');
      expect(shader!.wgsl).toContain('output[row] = sum');
      // Linear should NOT have bias
      expect(shader!.wgsl).not.toContain('bias');
    });

    it('has correct buffer layout (no bias buffer)', () => {
      const node = makeLinearNode('lin', 64, 32);
      const shader = compiler.generateShaderForNode(node);

      expect(shader!.buffers.length).toBe(3); // input, weight, output (no bias)
    });
  });

  // =========================================================================
  // Conv2d Shader
  // =========================================================================

  describe('Conv2d shader', () => {
    it('generates 2D convolution kernel', () => {
      const node = makeConv2dNode('conv', 16, 1, 3);
      const shader = compiler.generateShaderForNode(node);

      expect(shader).not.toBeNull();
      expect(shader!.nodeType).toBe('Conv2d');
      expect(shader!.wgsl).toContain('OUT_C: u32 = 16u');
      expect(shader!.wgsl).toContain('KH: u32 = 3u');
      expect(shader!.wgsl).toContain('KW: u32 = 3u');
      expect(shader!.wgsl).toContain('STRIDE_H');
      expect(shader!.wgsl).toContain('PAD_H');
    });

    it('handles padding in convolution', () => {
      const node: NIRNode = {
        id: 'conv_padded',
        type: 'Conv2d',
        params: {
          weight: [[[[0.01, 0.01, 0.01], [0.01, 0.01, 0.01], [0.01, 0.01, 0.01]]]],
          stride: [1, 1],
          padding: [1, 1],
          dilation: [1, 1],
          groups: 1,
        },
      };
      const shader = compiler.generateShaderForNode(node);

      expect(shader!.wgsl).toContain('PAD_H: u32 = 1u');
      expect(shader!.wgsl).toContain('PAD_W: u32 = 1u');
      expect(shader!.wgsl).toContain('ih < IN_H && iw < IN_W');
    });
  });

  // =========================================================================
  // Threshold Shader
  // =========================================================================

  describe('Threshold shader', () => {
    it('generates threshold comparison', () => {
      const node: NIRNode = {
        id: 'thresh',
        type: 'Threshold',
        params: { threshold: Array(100).fill(0.5) },
      };
      const shader = compiler.generateShaderForNode(node);

      expect(shader).not.toBeNull();
      expect(shader!.nodeType).toBe('Threshold');
      expect(shader!.wgsl).toContain('input[idx] >= threshold[idx]');
      expect(shader!.wgsl).toContain('output[idx] = 1.0');
      expect(shader!.wgsl).toContain('output[idx] = 0.0');
    });
  });

  // =========================================================================
  // Scale Shader
  // =========================================================================

  describe('Scale shader', () => {
    it('generates element-wise scaling', () => {
      const node: NIRNode = {
        id: 'scaler',
        type: 'Scale',
        params: { scale: Array(32).fill(0.5) },
      };
      const shader = compiler.generateShaderForNode(node);

      expect(shader).not.toBeNull();
      expect(shader!.nodeType).toBe('Scale');
      expect(shader!.wgsl).toContain('scale[idx] * input[idx]');
    });
  });

  // =========================================================================
  // Delay Shader
  // =========================================================================

  describe('Delay shader', () => {
    it('generates ring buffer delay', () => {
      const node: NIRNode = {
        id: 'delay_line',
        type: 'Delay',
        params: { delay: Array(16).fill(3.0) },
      };
      const shader = compiler.generateShaderForNode(node);

      expect(shader).not.toBeNull();
      expect(shader!.nodeType).toBe('Delay');
      expect(shader!.wgsl).toContain('ring_buffer');
      expect(shader!.wgsl).toContain('BUFFER_SIZE');
      expect(shader!.wgsl).toContain('write_pos');
      expect(shader!.wgsl).toContain('read_pos');
    });

    it('has ring buffer in buffers', () => {
      const node: NIRNode = {
        id: 'delay',
        type: 'Delay',
        params: { delay: Array(16).fill(1.0) },
      };
      const shader = compiler.generateShaderForNode(node);

      const ringBuf = shader!.buffers.find(b => b.name.includes('ring_buffer'));
      expect(ringBuf).toBeDefined();
      expect(ringBuf!.role).toBe('state');
      expect(ringBuf!.size).toBe(16 * 256); // size * buffer_depth
    });
  });

  // =========================================================================
  // Flatten Shader
  // =========================================================================

  describe('Flatten shader', () => {
    it('generates identity copy', () => {
      const node: NIRNode = {
        id: 'flat',
        type: 'Flatten',
        params: {
          input_type: { shape: [16, 7, 7] },
          start_dim: 0,
          end_dim: -1,
        },
      };
      const shader = compiler.generateShaderForNode(node);

      expect(shader).not.toBeNull();
      expect(shader!.nodeType).toBe('Flatten');
      expect(shader!.wgsl).toContain('output[idx] = input[idx]');

      // Total size should be 16 * 7 * 7 = 784
      const outputBuf = shader!.buffers.find(b => b.role === 'output');
      expect(outputBuf!.size).toBe(784);
    });
  });

  // =========================================================================
  // Pooling Shaders
  // =========================================================================

  describe('pooling shaders', () => {
    it('generates SumPooling', () => {
      const node: NIRNode = {
        id: 'pool',
        type: 'SumPooling',
        params: {
          kernel_size: [2, 2],
          stride: [2, 2],
          padding: [0, 0],
        },
      };
      const shader = compiler.generateShaderForNode(node);

      expect(shader).not.toBeNull();
      expect(shader!.nodeType).toBe('SumPooling');
      expect(shader!.wgsl).toContain('sum = sum + input[');
      expect(shader!.wgsl).toContain('KERNEL: u32 = 2u');
    });

    it('generates AvgPooling with division', () => {
      const node: NIRNode = {
        id: 'avg_pool',
        type: 'AvgPooling',
        params: {
          kernel_size: [2, 2],
          stride: [2, 2],
          padding: [0, 0],
        },
      };
      const shader = compiler.generateShaderForNode(node);

      expect(shader).not.toBeNull();
      expect(shader!.nodeType).toBe('AvgPooling');
      expect(shader!.wgsl).toContain('sum / KERNEL_AREA');
      expect(shader!.wgsl).toContain('KERNEL_AREA: f32 = 4.0');
    });
  });

  // =========================================================================
  // Unknown Node Types
  // =========================================================================

  describe('unsupported node types', () => {
    it('returns null for unknown node types', () => {
      const node: NIRNode = {
        id: 'unknown',
        type: 'NIRGraph' as any,
        params: {},
      };
      const shader = compiler.generateShaderForNode(node);
      expect(shader).toBeNull();
    });
  });

  // =========================================================================
  // Topological Sort / Execution Order
  // =========================================================================

  describe('topological sort', () => {
    it('produces correct execution order', () => {
      const graph = makeGraph({
        nodes: {
          input: { id: 'input', type: 'Input', params: { shape: [128] } },
          fc1: makeAffineNode('fc1', 128, 64),
          lif1: makeLIFNode('lif1', 64),
          fc2: makeAffineNode('fc2', 64, 10),
          output: { id: 'output', type: 'Output', params: { shape: [10] } },
        },
        edges: [
          { source: 'input', target: 'fc1' },
          { source: 'fc1', target: 'lif1' },
          { source: 'lif1', target: 'fc2' },
          { source: 'fc2', target: 'output' },
        ],
      });
      const result = compiler.compileGraph(graph);

      // Input should come first, output last
      const inputIdx = result.executionOrder.indexOf('input');
      const fc1Idx = result.executionOrder.indexOf('fc1');
      const lif1Idx = result.executionOrder.indexOf('lif1');
      const fc2Idx = result.executionOrder.indexOf('fc2');
      const outputIdx = result.executionOrder.indexOf('output');

      expect(inputIdx).toBeLessThan(fc1Idx);
      expect(fc1Idx).toBeLessThan(lif1Idx);
      expect(lif1Idx).toBeLessThan(fc2Idx);
      expect(fc2Idx).toBeLessThan(outputIdx);
    });
  });

  // =========================================================================
  // Graph Topology / Buffer Connections
  // =========================================================================

  describe('buffer connections', () => {
    it('maps edges to buffer connections', () => {
      const graph = makeGraph({
        nodes: {
          input: { id: 'input', type: 'Input', params: { shape: [128] } },
          fc1: makeAffineNode('fc1', 128, 64),
          lif1: makeLIFNode('lif1', 64),
          fc2: makeAffineNode('fc2', 64, 10),
          output: { id: 'output', type: 'Output', params: { shape: [10] } },
        },
        edges: [
          { source: 'input', target: 'fc1' },
          { source: 'fc1', target: 'lif1' },
          { source: 'lif1', target: 'fc2' },
          { source: 'fc2', target: 'output' },
        ],
      });
      const result = compiler.compileGraph(graph);

      // Should have connections for non-boundary edges
      // input -> fc1 (skipped, Input boundary)
      // fc1 -> lif1 (included)
      // lif1 -> fc2 (included)
      // fc2 -> output (skipped, Output boundary)
      expect(result.connections.length).toBe(2);

      const conn1 = result.connections.find(c => c.sourceNodeId === 'fc1');
      expect(conn1).toBeDefined();
      expect(conn1!.targetNodeId).toBe('lif1');
      expect(conn1!.sourceBuffer).toBe('fc1_output');
      expect(conn1!.targetBuffer).toBe('lif1_input');

      const conn2 = result.connections.find(c => c.sourceNodeId === 'lif1');
      expect(conn2).toBeDefined();
      expect(conn2!.targetNodeId).toBe('fc2');
    });
  });

  // =========================================================================
  // Bind Group Layouts
  // =========================================================================

  describe('bind group layouts', () => {
    it('generates bind group layouts when enabled', () => {
      const graph = makeGraph({
        nodes: {
          input: { id: 'input', type: 'Input', params: { shape: [64] } },
          lif: makeLIFNode('lif', 64),
          output: { id: 'output', type: 'Output', params: { shape: [64] } },
        },
        edges: [
          { source: 'input', target: 'lif' },
          { source: 'lif', target: 'output' },
        ],
      });
      const result = compiler.compileGraph(graph);

      expect(result.bindGroupLayouts['lif']).toBeDefined();
      expect(result.bindGroupLayouts['lif'].length).toBeGreaterThan(0);
    });

    it('does not generate layouts when disabled', () => {
      const c = new NIRToWGSLCompiler({ generateBindGroupLayouts: false });
      const graph = makeGraph({
        nodes: {
          input: { id: 'input', type: 'Input', params: { shape: [8] } },
          lif: makeLIFNode('lif', 8),
          output: { id: 'output', type: 'Output', params: { shape: [8] } },
        },
        edges: [
          { source: 'input', target: 'lif' },
          { source: 'lif', target: 'output' },
        ],
      });
      const result = c.compileGraph(graph);

      expect(Object.keys(result.bindGroupLayouts).length).toBe(0);
    });
  });

  // =========================================================================
  // Simulation Params
  // =========================================================================

  describe('simulation params', () => {
    it('includes simulation params buffer definition', () => {
      const graph = makeGraph({
        nodes: {
          input: { id: 'input', type: 'Input', params: { shape: [8] } },
          lif: makeLIFNode('lif', 8),
          output: { id: 'output', type: 'Output', params: { shape: [8] } },
        },
        edges: [
          { source: 'input', target: 'lif' },
          { source: 'lif', target: 'output' },
        ],
      });
      const result = compiler.compileGraph(graph);

      expect(result.simulationParams).toBeDefined();
      expect(result.simulationParams.type).toBe('uniform');
      expect(result.simulationParams.role).toBe('simulation');
      expect(result.simulationParams.elementType).toBe('SimParams');
    });

    it('generates SimParams struct in neuron shaders', () => {
      const node = makeLIFNode('lif_sim', 8);
      const shader = compiler.generateShaderForNode(node);

      expect(shader!.wgsl).toContain('struct SimParams');
      expect(shader!.wgsl).toContain('dt: f32');
      expect(shader!.wgsl).toContain('timestep: u32');
      expect(shader!.wgsl).toContain('total_steps: u32');
    });
  });

  // =========================================================================
  // Complete Multi-Layer SNN Compilation
  // =========================================================================

  describe('complete SNN compilation', () => {
    it('compiles a full encoder-hidden-decoder network', () => {
      const graph = makeGraph({
        nodes: {
          input: { id: 'input', type: 'Input', params: { shape: [784] } },
          enc_gain: makeAffineNode('enc_gain', 784, 784),
          enc_thresh: {
            id: 'enc_thresh',
            type: 'Threshold',
            params: { threshold: Array(784).fill(1.0) },
          },
          fc1: makeAffineNode('fc1', 784, 256),
          hidden1: makeLIFNode('hidden1', 256),
          fc2: makeAffineNode('fc2', 256, 10),
          readout: {
            id: 'readout',
            type: 'LI',
            params: {
              tau: Array(10).fill(50.0),
              r: Array(10).fill(1.0),
              v_leak: Array(10).fill(0.0),
            },
          },
          output: { id: 'output', type: 'Output', params: { shape: [10] } },
        },
        edges: [
          { source: 'input', target: 'enc_gain' },
          { source: 'enc_gain', target: 'enc_thresh' },
          { source: 'enc_thresh', target: 'fc1' },
          { source: 'fc1', target: 'hidden1' },
          { source: 'hidden1', target: 'fc2' },
          { source: 'fc2', target: 'readout' },
          { source: 'readout', target: 'output' },
        ],
      });

      const result = compiler.compileGraph(graph);

      // Should generate 6 shaders (all except Input/Output)
      expect(result.shaders.length).toBe(6);

      // Verify shader types
      const types = result.shaders.map(s => s.nodeType);
      expect(types).toContain('Affine');
      expect(types).toContain('Threshold');
      expect(types).toContain('LIF');
      expect(types).toContain('LI');

      // Should have inter-node connections
      expect(result.connections.length).toBe(5); // 7 edges - 2 boundary edges

      // Metadata should be populated
      expect(result.metadata.totalShaders).toBe(6);
      expect(result.metadata.totalConnections).toBe(5);
      expect(result.metadata.totalBuffers).toBeGreaterThan(0);
    });

    it('handles branching topology', () => {
      const graph = makeGraph({
        nodes: {
          input: { id: 'input', type: 'Input', params: { shape: [128] } },
          fc_a: makeAffineNode('fc_a', 128, 64),
          fc_b: makeAffineNode('fc_b', 128, 64),
          lif_a: makeLIFNode('lif_a', 64),
          lif_b: makeLIFNode('lif_b', 64),
          output: { id: 'output', type: 'Output', params: { shape: [64] } },
        },
        edges: [
          { source: 'input', target: 'fc_a' },
          { source: 'input', target: 'fc_b' },
          { source: 'fc_a', target: 'lif_a' },
          { source: 'fc_b', target: 'lif_b' },
          { source: 'lif_a', target: 'output' },
          { source: 'lif_b', target: 'output' },
        ],
      });

      const result = compiler.compileGraph(graph);

      // Should handle parallel branches
      expect(result.shaders.length).toBe(4); // fc_a, fc_b, lif_a, lif_b
      expect(result.connections.length).toBe(2); // fc_a->lif_a, fc_b->lif_b
    });
  });

  // =========================================================================
  // WGSL Validity Checks
  // =========================================================================

  describe('WGSL validity', () => {
    it('all generated shaders have @compute entry point', () => {
      const graph = makeGraph({
        nodes: {
          input: { id: 'input', type: 'Input', params: { shape: [64] } },
          fc: makeAffineNode('fc', 64, 32),
          lif: makeLIFNode('lif', 32),
          thresh: { id: 'thresh', type: 'Threshold', params: { threshold: Array(32).fill(1.0) } },
          scaler: { id: 'scaler', type: 'Scale', params: { scale: Array(32).fill(0.5) } },
          output: { id: 'output', type: 'Output', params: { shape: [32] } },
        },
        edges: [
          { source: 'input', target: 'fc' },
          { source: 'fc', target: 'lif' },
          { source: 'lif', target: 'thresh' },
          { source: 'thresh', target: 'scaler' },
          { source: 'scaler', target: 'output' },
        ],
      });
      const result = compiler.compileGraph(graph);

      for (const shader of result.shaders) {
        expect(shader.wgsl).toContain('@compute');
        expect(shader.wgsl).toContain('fn main');
        expect(shader.wgsl).toContain('@builtin(global_invocation_id)');
      }
    });

    it('all shaders have bounds checking', () => {
      const nodeTypes: NIRNode[] = [
        makeLIFNode('lif', 8),
        makeCubaLIFNode('cuba', 8),
        makeAffineNode('aff', 8, 4),
        makeLinearNode('lin', 8, 4),
        { id: 'thresh', type: 'Threshold', params: { threshold: Array(8).fill(1.0) } },
        { id: 'scale', type: 'Scale', params: { scale: Array(8).fill(1.0) } },
        { id: 'flat', type: 'Flatten', params: { input_type: { shape: [2, 4] }, start_dim: 0, end_dim: -1 } },
      ];

      for (const node of nodeTypes) {
        const shader = compiler.generateShaderForNode(node);
        expect(shader).not.toBeNull();
        // All shaders should have bounds check
        expect(shader!.wgsl).toMatch(/if \(.*>=.*\) \{ return; \}/);
      }
    });

    it('all shaders have proper binding declarations', () => {
      const node = makeLIFNode('test_bindings', 16);
      const shader = compiler.generateShaderForNode(node);

      // Check that binding numbers are sequential
      const bindingMatches = shader!.wgsl.matchAll(/@binding\((\d+)\)/g);
      const bindings = Array.from(bindingMatches).map(m => parseInt(m[1]));
      for (let i = 0; i < bindings.length; i++) {
        expect(bindings[i]).toBe(i);
      }
    });
  });

  // =========================================================================
  // Metadata
  // =========================================================================

  describe('compilation metadata', () => {
    it('includes all required metadata fields', () => {
      const graph = makeGraph({
        nodes: {
          input: { id: 'input', type: 'Input', params: { shape: [8] } },
          lif: makeLIFNode('lif', 8),
          output: { id: 'output', type: 'Output', params: { shape: [8] } },
        },
        edges: [
          { source: 'input', target: 'lif' },
          { source: 'lif', target: 'output' },
        ],
      });
      const result = compiler.compileGraph(graph);

      expect(result.metadata.source).toBe('TestNetwork');
      expect(result.metadata.generator).toContain('NIRToWGSLCompiler');
      expect(result.metadata.integrationMethod).toBe('euler');
      expect(result.metadata.dt).toBe(1.0);
      expect(result.metadata.workgroupSize).toBe(64);
      expect(result.metadata.totalShaders).toBe(1);
      expect(result.metadata.totalBuffers).toBeGreaterThan(0);
      expect(result.metadata.totalConnections).toBe(0);
      expect(result.metadata.generatedAt).toBeDefined();
    });
  });

  // =========================================================================
  // Edge Cases
  // =========================================================================

  describe('edge cases', () => {
    it('handles empty graph (only boundary nodes)', () => {
      const graph = makeGraph();
      const result = compiler.compileGraph(graph);

      expect(result.shaders.length).toBe(0);
      expect(result.connections.length).toBe(0);
      expect(result.executionOrder).toContain('input');
      expect(result.executionOrder).toContain('output');
    });

    it('handles disconnected nodes', () => {
      const graph = makeGraph({
        nodes: {
          input: { id: 'input', type: 'Input', params: { shape: [8] } },
          orphan: makeLIFNode('orphan', 8),
          output: { id: 'output', type: 'Output', params: { shape: [8] } },
        },
        edges: [], // No edges
      });
      const result = compiler.compileGraph(graph);

      // Orphan node should still get a shader
      expect(result.shaders.length).toBe(1);
      expect(result.shaders[0].nodeId).toBe('orphan');
      expect(result.connections.length).toBe(0);
    });

    it('handles single-element neuron layers', () => {
      const node = makeLIFNode('single', 1);
      const shader = compiler.generateShaderForNode(node);

      expect(shader).not.toBeNull();
      expect(shader!.dispatch).toEqual([1, 1, 1]); // ceil(1/64) = 1
    });

    it('handles large neuron layers', () => {
      const node = makeLIFNode('large', 10000);
      const shader = compiler.generateShaderForNode(node);

      expect(shader).not.toBeNull();
      // ceil(10000 / 64) = 157
      expect(shader!.dispatch).toEqual([157, 1, 1]);
    });

    it('handles edge with non-existent source node', () => {
      const graph = makeGraph({
        nodes: {
          input: { id: 'input', type: 'Input', params: { shape: [8] } },
          lif: makeLIFNode('lif', 8),
          output: { id: 'output', type: 'Output', params: { shape: [8] } },
        },
        edges: [
          { source: 'nonexistent', target: 'lif' },
          { source: 'lif', target: 'output' },
        ],
      });

      // Should not throw - the topological sort may not include lif because
      // its dependency 'nonexistent' never resolves, but compilation completes
      expect(() => compiler.compileGraph(graph)).not.toThrow();
      const result = compiler.compileGraph(graph);
      // The lif node may or may not appear in execution order depending on
      // how the sort handles missing dependencies - verify no crash
      expect(result.metadata.generator).toContain('NIRToWGSLCompiler');
    });
  });

  // =========================================================================
  // Integration: NIRCompiler -> NIRToWGSLCompiler
  // =========================================================================

  describe('end-to-end NIRCompiler -> NIRToWGSLCompiler integration', () => {
    it('compiles a hand-crafted NIR graph JSON to WGSL', () => {
      // Simulate what NIRCompiler.compile() would produce
      const nirGraph: NIRGraph = {
        version: '0.5.0',
        nodes: {
          input: { id: 'input', type: 'Input', params: { shape: [784] } },
          enc_gain: {
            id: 'enc_gain',
            type: 'Affine',
            params: {
              weight: Array(784).fill(null).map(() => {
                const row = Array(784).fill(0);
                // Diagonal identity * gain
                return row;
              }),
              bias: Array(784).fill(0),
            },
            metadata: { source_trait: 'spike_encoder', role: 'gain_scaling' },
          },
          enc_threshold: {
            id: 'enc_threshold',
            type: 'Threshold',
            params: { threshold: Array(784).fill(1.0) },
            metadata: { source_trait: 'spike_encoder', role: 'spike_generation' },
          },
          fc1: {
            id: 'fc1',
            type: 'Affine',
            params: {
              weight: Array(256).fill(null).map(() => Array(784).fill(0.01)),
              bias: Array(256).fill(0.0),
            },
            metadata: { source_trait: 'synaptic_connection' },
          },
          hidden1: {
            id: 'hidden1',
            type: 'LIF',
            params: {
              tau: Array(256).fill(20.0),
              r: Array(256).fill(1.0),
              v_leak: Array(256).fill(0.0),
              v_threshold: Array(256).fill(1.0),
            },
            metadata: { source_trait: 'lif_neuron' },
          },
          output: { id: 'output', type: 'Output', params: { shape: [256] } },
        },
        edges: [
          { source: 'input', target: 'enc_gain' },
          { source: 'enc_gain', target: 'enc_threshold' },
          { source: 'enc_threshold', target: 'fc1' },
          { source: 'fc1', target: 'hidden1' },
          { source: 'hidden1', target: 'output' },
        ],
        metadata: {
          source: 'MNIST_SNN',
          generator: 'HoloScript NIRCompiler v1.0.0',
          targetPlatforms: ['loihi2'],
          generatedAt: new Date().toISOString(),
        },
      };

      const nirJson = JSON.stringify(nirGraph);
      const result = compiler.compileNIRGraph(nirJson);

      // Should compile successfully
      expect(result.shaders.length).toBe(4); // enc_gain, enc_threshold, fc1, hidden1
      expect(result.metadata.source).toBe('MNIST_SNN');

      // Verify each shader type
      const shaderTypes = result.shaders.map(s => s.nodeType);
      expect(shaderTypes.filter(t => t === 'Affine').length).toBe(2);
      expect(shaderTypes).toContain('Threshold');
      expect(shaderTypes).toContain('LIF');

      // Verify execution order is valid
      const order = result.executionOrder;
      expect(order.indexOf('enc_gain')).toBeLessThan(order.indexOf('enc_threshold'));
      expect(order.indexOf('enc_threshold')).toBeLessThan(order.indexOf('fc1'));
      expect(order.indexOf('fc1')).toBeLessThan(order.indexOf('hidden1'));
    });
  });
});
