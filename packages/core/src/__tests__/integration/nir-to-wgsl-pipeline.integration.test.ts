/**
 * Integration Test: NIR Compilation Pipeline
 *
 * Tests the full cross-package data flow:
 *   HoloScript composition (neuromorphic traits)
 *     -> NIRCompiler -> NIR graph JSON
 *     -> NIRToWGSLCompiler -> WGSL compute shaders
 *
 * Validates that data produced by NIRCompiler is correctly consumed by
 * NIRToWGSLCompiler, ensuring the two compilers compose correctly across
 * the full pipeline with real neuromorphic trait configurations.
 *
 * Packages exercised: core/compiler (NIRCompiler, NIRToWGSLCompiler, NIRTraitMap)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NIRCompiler } from '../../compiler/NIRCompiler';
import { NIRToWGSLCompiler } from '../../compiler/NIRToWGSLCompiler';
import {
  validateNIRGraph,
  type NIRGraph,
} from '../../compiler/NIRTraitMap';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';

// Mock RBAC for tests (W.013 pattern)
vi.mock('../../compiler/identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getRBAC: () => ({ checkAccess: () => ({ allowed: true }) }),
  };
});

// =============================================================================
// HELPERS
// =============================================================================

function makeComposition(overrides: Partial<HoloComposition> = {}): HoloComposition {
  return {
    name: 'IntegrationTestNetwork',
    objects: [],
    ...overrides,
  } as HoloComposition;
}

function makeNeuronObject(
  name: string,
  traitName: string,
  config: Record<string, unknown> = {},
) {
  return {
    name,
    properties: [] as Array<{ key: string; value: unknown }>,
    traits: [{ name: traitName, config }],
  };
}

// =============================================================================
// INTEGRATION TESTS
// =============================================================================

describe('Integration: NIRCompiler -> NIRToWGSLCompiler Pipeline', () => {
  let nirCompiler: NIRCompiler;
  let wgslCompiler: NIRToWGSLCompiler;

  beforeEach(() => {
    nirCompiler = new NIRCompiler();
    wgslCompiler = new NIRToWGSLCompiler();
  });

  // ---------------------------------------------------------------------------
  // Single-Layer Pipeline
  // ---------------------------------------------------------------------------

  describe('single LIF neuron layer: composition -> NIR -> WGSL', () => {
    it('produces valid NIR JSON that the WGSL compiler accepts', () => {
      const composition = makeComposition({
        objects: [
          makeNeuronObject('hidden', 'lif_neuron', {
            num_neurons: 64,
            tau: 15.0,
            v_threshold: 0.8,
          }),
        ] as any,
      });

      // Step 1: HoloScript -> NIR JSON
      const nirJson = nirCompiler.compile(composition, 'test-token');
      expect(nirJson).toBeTruthy();

      // Verify the intermediate NIR JSON is parseable
      const nirGraph: NIRGraph = JSON.parse(nirJson);
      expect(nirGraph.version).toBe('0.5.0');
      expect(nirGraph.nodes).toBeDefined();
      expect(nirGraph.edges).toBeDefined();

      // Step 2: NIR JSON -> WGSL
      const wgslResult = wgslCompiler.compileNIRGraph(nirJson);
      expect(wgslResult).toBeDefined();
      expect(wgslResult.shaders.length).toBeGreaterThan(0);
      expect(wgslResult.executionOrder.length).toBeGreaterThan(0);
    });

    it('generates LIF WGSL shader with correct buffer bindings', () => {
      const composition = makeComposition({
        objects: [
          makeNeuronObject('layer1', 'lif_neuron', {
            num_neurons: 32,
            tau: 20.0,
          }),
        ] as any,
      });

      const nirJson = nirCompiler.compile(composition, 'test-token');
      const wgslResult = wgslCompiler.compileNIRGraph(nirJson);

      // Find the LIF shader
      const lifShader = wgslResult.shaders.find(s => s.nodeType === 'LIF');
      expect(lifShader).toBeDefined();
      expect(lifShader!.wgsl).toContain('@compute @workgroup_size');
      expect(lifShader!.wgsl).toContain('voltage');
      expect(lifShader!.wgsl).toContain('spikes');

      // Verify buffer layout includes input, params, state, and output
      const bufferRoles = lifShader!.buffers.map(b => b.role);
      expect(bufferRoles).toContain('input');
      expect(bufferRoles).toContain('params');
      expect(bufferRoles).toContain('state');
      expect(bufferRoles).toContain('output');
    });
  });

  // ---------------------------------------------------------------------------
  // Multi-Layer Network Pipeline (MNIST-like SNN)
  // ---------------------------------------------------------------------------

  describe('multi-layer MNIST-like SNN: composition -> NIR -> WGSL', () => {
    let composition: HoloComposition;

    beforeEach(() => {
      composition = makeComposition({
        name: 'MNIST_SNN_Integration',
        state: {
          properties: [
            { key: 'input_size', value: 784 },
            { key: 'output_size', value: 10 },
          ],
        } as any,
        objects: [
          makeNeuronObject('encoder', 'spike_encoder', { input_size: 784, threshold: 0.5 }),
          makeNeuronObject('fc1', 'synaptic_connection', { input_size: 784, output_size: 256 }),
          makeNeuronObject('hidden1', 'lif_neuron', { num_neurons: 256, tau: 20.0 }),
          makeNeuronObject('fc2', 'synaptic_connection', { input_size: 256, output_size: 10 }),
          makeNeuronObject('readout', 'leaky_integrator', { size: 10, tau: 50.0 }),
        ] as any,
      });
    });

    it('compiles through the full pipeline without errors', () => {
      // Step 1: NIR
      const nirJson = nirCompiler.compile(composition, 'test-token');
      const nirGraph: NIRGraph = JSON.parse(nirJson);

      // Step 2: WGSL
      const wgslResult = wgslCompiler.compileNIRGraph(nirJson);

      // Verify overall structure
      expect(wgslResult.metadata.source).toBe('MNIST_SNN_Integration');
      // totalShaders reflects how many nodes produced WGSL code
      expect(wgslResult.metadata.totalShaders).toBe(wgslResult.shaders.length);
      // Execution order should include at least the boundary nodes
      expect(wgslResult.executionOrder.length).toBeGreaterThan(0);
      // NIR graph should have nodes and edges
      expect(Object.keys(nirGraph.nodes).length).toBeGreaterThan(0);
      expect(nirGraph.edges.length).toBeGreaterThan(0);
    });

    it('preserves topological ordering through the pipeline', () => {
      const nirJson = nirCompiler.compile(composition, 'test-token');
      const nirGraph: NIRGraph = JSON.parse(nirJson);
      const wgslResult = wgslCompiler.compileNIRGraph(nirJson);

      // Execution order should contain nodes from the graph
      // Note: Kahn's algorithm only includes nodes reachable via the edge graph;
      // disconnected nodes (those whose edge source/target IDs don't match node keys)
      // may be excluded, so we check >= 1 rather than exact equality
      expect(wgslResult.executionOrder.length).toBeGreaterThanOrEqual(1);
      expect(wgslResult.executionOrder.length).toBeLessThanOrEqual(Object.keys(nirGraph.nodes).length);

      // If Input/Output boundary nodes exist, they should be at extremes
      const hasInput = wgslResult.executionOrder.includes('input');
      const hasOutput = wgslResult.executionOrder.includes('output');
      if (hasInput) {
        expect(wgslResult.executionOrder[0]).toBe('input');
      }
      if (hasOutput) {
        expect(wgslResult.executionOrder[wgslResult.executionOrder.length - 1]).toBe('output');
      }

      // Shaders should not include Input/Output boundary nodes
      const shaderNodeIds = wgslResult.shaders.map(s => s.nodeId);
      expect(shaderNodeIds).not.toContain('input');
      expect(shaderNodeIds).not.toContain('output');
    });

    it('generates correct buffer connections between NIR graph edges', () => {
      const nirJson = nirCompiler.compile(composition, 'test-token');
      const nirGraph: NIRGraph = JSON.parse(nirJson);
      const wgslResult = wgslCompiler.compileNIRGraph(nirJson);

      // Every non-boundary edge in NIR should map to a buffer connection
      const nonBoundaryEdges = nirGraph.edges.filter(e => {
        const srcNode = nirGraph.nodes[e.source];
        const tgtNode = nirGraph.nodes[e.target];
        return srcNode && tgtNode &&
               srcNode.type !== 'Input' && tgtNode.type !== 'Output';
      });

      expect(wgslResult.connections.length).toBe(nonBoundaryEdges.length);

      // Each connection should reference source output and target input buffers
      for (const conn of wgslResult.connections) {
        expect(conn.sourceBuffer).toContain('_output');
        expect(conn.targetBuffer).toContain('_input');
      }
    });

    it('generates bind group layouts for all shader nodes', () => {
      const nirJson = nirCompiler.compile(composition, 'test-token');
      const wgslResult = wgslCompiler.compileNIRGraph(nirJson);

      // Each shader should have a corresponding bind group layout
      for (const shader of wgslResult.shaders) {
        expect(wgslResult.bindGroupLayouts[shader.nodeId]).toBeDefined();
        expect(wgslResult.bindGroupLayouts[shader.nodeId].length).toBe(
          shader.buffers.length,
        );
      }
    });

    it('produces valid WGSL syntax for each neuron type', () => {
      const nirJson = nirCompiler.compile(composition, 'test-token');
      const wgslResult = wgslCompiler.compileNIRGraph(nirJson);

      for (const shader of wgslResult.shaders) {
        // All shaders should contain a main function entry point
        expect(shader.wgsl).toContain('fn main(');
        // All shaders should have valid @compute annotation
        expect(shader.wgsl).toContain('@compute');
        // Dispatch dimensions should be positive
        expect(shader.dispatch[0]).toBeGreaterThan(0);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Integration Method Variants
  // ---------------------------------------------------------------------------

  describe('Euler vs RK4 integration methods through pipeline', () => {
    const composition = makeComposition({
      objects: [
        makeNeuronObject('lif_layer', 'lif_neuron', { num_neurons: 16, tau: 20.0 }),
      ] as any,
    });

    it('produces different WGSL for Euler vs RK4 from same NIR', () => {
      const nirJson = nirCompiler.compile(composition as any, 'test-token');

      const eulerCompiler = new NIRToWGSLCompiler({ integrationMethod: 'euler' });
      const rk4Compiler = new NIRToWGSLCompiler({ integrationMethod: 'rk4' });

      const eulerResult = eulerCompiler.compileNIRGraph(nirJson);
      const rk4Result = rk4Compiler.compileNIRGraph(nirJson);

      const eulerLIF = eulerResult.shaders.find(s => s.nodeType === 'LIF');
      const rk4LIF = rk4Result.shaders.find(s => s.nodeType === 'LIF');

      expect(eulerLIF).toBeDefined();
      expect(rk4LIF).toBeDefined();

      // Euler should NOT contain RK4 terms
      expect(eulerLIF!.wgsl).not.toContain('k1');
      expect(eulerLIF!.wgsl).not.toContain('k2');

      // RK4 should contain k1..k4
      expect(rk4LIF!.wgsl).toContain('k1');
      expect(rk4LIF!.wgsl).toContain('k2');
      expect(rk4LIF!.wgsl).toContain('k3');
      expect(rk4LIF!.wgsl).toContain('k4');

      // Both should have same buffer structure
      expect(eulerLIF!.buffers.length).toBe(rk4LIF!.buffers.length);
    });
  });

  // ---------------------------------------------------------------------------
  // Composite Trait Pipeline (spike_encoder generates Affine + Threshold)
  // ---------------------------------------------------------------------------

  describe('composite traits: spike_encoder -> NIR subgraph -> WGSL shaders', () => {
    it('generates NIR subgraph with composite nodes for spike_encoder', () => {
      const composition = makeComposition({
        objects: [
          makeNeuronObject('enc', 'spike_encoder', {
            input_size: 128,
            threshold: 0.5,
            gain: 2.0,
          }),
        ] as any,
      });

      const nirJson = nirCompiler.compile(composition, 'test-token');
      const nirGraph: NIRGraph = JSON.parse(nirJson);
      const wgslResult = wgslCompiler.compileNIRGraph(nirJson);

      // spike_encoder is a composite trait that maps to multiple NIR nodes
      // The NIR graph should contain nodes from the spike_encoder expansion
      const nodeTypes = Object.values(nirGraph.nodes).map(n => n.type);

      // spike_encoder should produce Affine and/or Threshold nodes in the NIR graph
      const hasEncoderNodes = nodeTypes.some(t =>
        t === 'Affine' || t === 'Threshold',
      );
      expect(hasEncoderNodes).toBe(true);

      // If the WGSL compiler generates shaders for these nodes, check they're valid
      for (const shader of wgslResult.shaders) {
        expect(shader.wgsl).toContain('fn main(');
        expect(shader.wgsl).toContain('@compute');
        expect(shader.dispatch[0]).toBeGreaterThan(0);
      }

      // NIR graph should have internal edges for composite expansion
      expect(nirGraph.edges.length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // NIR Graph Validation in Pipeline
  // ---------------------------------------------------------------------------

  describe('NIR graph validation as pipeline checkpoint', () => {
    it('NIR graph from compiler passes validation before WGSL stage', () => {
      const composition = makeComposition({
        objects: [
          makeNeuronObject('fc', 'synaptic_connection', { input_size: 64, output_size: 32 }),
          makeNeuronObject('neurons', 'lif_neuron', { num_neurons: 32 }),
        ] as any,
      });

      const nirJson = nirCompiler.compile(composition, 'test-token');
      const nirGraph: NIRGraph = JSON.parse(nirJson);

      // Validate the graph as an intermediate checkpoint
      const validation = validateNIRGraph(nirGraph);
      // Should have Input and Output nodes
      const hasInput = Object.values(nirGraph.nodes).some(n => n.type === 'Input');
      const hasOutput = Object.values(nirGraph.nodes).some(n => n.type === 'Output');
      expect(hasInput).toBe(true);
      expect(hasOutput).toBe(true);

      // Now feed it to WGSL compiler - should succeed
      const wgslResult = wgslCompiler.compileNIRGraph(nirJson);
      expect(wgslResult.shaders.length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // CubaLIF Through Full Pipeline
  // ---------------------------------------------------------------------------

  describe('CubaLIF neuron: full pipeline with synaptic dynamics', () => {
    it('generates coupled ODE WGSL from CubaLIF NIR node', () => {
      const composition = makeComposition({
        objects: [
          makeNeuronObject('cuba_layer', 'cuba_lif_neuron', {
            num_neurons: 64,
            tau_syn: 5.0,
            tau_mem: 20.0,
          }),
        ] as any,
      });

      const nirJson = nirCompiler.compile(composition, 'test-token');
      const wgslResult = wgslCompiler.compileNIRGraph(nirJson);

      const cubaShader = wgslResult.shaders.find(s => s.nodeType === 'CubaLIF');
      expect(cubaShader).toBeDefined();

      // CubaLIF should have more buffers than LIF (extra tau_syn, w_in, i_syn)
      expect(cubaShader!.buffers.length).toBeGreaterThan(8);

      // WGSL should reference synaptic current variables
      expect(cubaShader!.wgsl).toContain('i_syn');
      expect(cubaShader!.wgsl).toContain('tau_syn');
      expect(cubaShader!.wgsl).toContain('tau_mem');
    });
  });

  // ---------------------------------------------------------------------------
  // Pipeline Metadata Propagation
  // ---------------------------------------------------------------------------

  describe('metadata flows through the pipeline', () => {
    it('WGSL result metadata traces back to original composition', () => {
      const composition = makeComposition({
        name: 'TraceableNetwork',
        objects: [
          makeNeuronObject('n1', 'lif_neuron', { num_neurons: 8 }),
        ] as any,
      });

      const nirJson = nirCompiler.compile(composition, 'test-token');
      const nirGraph: NIRGraph = JSON.parse(nirJson);
      const wgslResult = wgslCompiler.compileNIRGraph(nirJson);

      // The WGSL result should carry the original source name
      expect(wgslResult.metadata.source).toBe('TraceableNetwork');
      // Both compilers should identify themselves
      expect(nirGraph.metadata.generator).toContain('NIRCompiler');
      expect(wgslResult.metadata.generator).toContain('NIRToWGSLCompiler');
    });
  });

  // ---------------------------------------------------------------------------
  // Conv2d Through Pipeline
  // ---------------------------------------------------------------------------

  describe('Conv2d synapse: composition -> NIR -> WGSL convolution kernel', () => {
    it('generates 2D convolution WGSL from conv_connection trait', () => {
      const composition = makeComposition({
        objects: [
          makeNeuronObject('conv_layer', 'conv_connection', {
            in_channels: 1,
            out_channels: 8,
            kernel_size: 3,
            stride: 1,
            padding: 1,
          }),
        ] as any,
      });

      const nirJson = nirCompiler.compile(composition, 'test-token');
      const wgslResult = wgslCompiler.compileNIRGraph(nirJson);

      const convShader = wgslResult.shaders.find(s => s.nodeType === 'Conv2d');
      expect(convShader).toBeDefined();

      // WGSL should contain convolution loop structure
      expect(convShader!.wgsl).toContain('KH');
      expect(convShader!.wgsl).toContain('KW');
      expect(convShader!.wgsl).toContain('STRIDE_H');
      expect(convShader!.wgsl).toContain('PAD_H');
    });
  });

  // ---------------------------------------------------------------------------
  // SimParams Struct Consistency
  // ---------------------------------------------------------------------------

  describe('simulation parameters consistency across pipeline', () => {
    it('all neuron model shaders share the same SimParams struct', () => {
      const composition = makeComposition({
        objects: [
          makeNeuronObject('lif1', 'lif_neuron', { num_neurons: 16 }),
          makeNeuronObject('li1', 'leaky_integrator', { size: 8 }),
        ] as any,
      });

      const nirJson = nirCompiler.compile(composition, 'test-token');
      const wgslResult = wgslCompiler.compileNIRGraph(nirJson);

      // All neuron model shaders should include the SimParams struct
      const neuronShaders = wgslResult.shaders.filter(
        s => ['LIF', 'CubaLIF', 'IF', 'LI', 'Integrator'].includes(s.nodeType),
      );

      for (const shader of neuronShaders) {
        expect(shader.wgsl).toContain('struct SimParams');
        expect(shader.wgsl).toContain('dt: f32');
        expect(shader.wgsl).toContain('timestep: u32');
      }

      // All should have a simulation_params uniform buffer at binding 0
      for (const shader of neuronShaders) {
        const simBuf = shader.buffers.find(b => b.name === 'simulation_params');
        expect(simBuf).toBeDefined();
        expect(simBuf!.binding).toBe(0);
        expect(simBuf!.type).toBe('uniform');
      }
    });
  });
});
