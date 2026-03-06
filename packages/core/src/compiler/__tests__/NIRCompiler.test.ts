import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NIRCompiler } from '../NIRCompiler';
import {
  NIR_TRAIT_MAP,
  getNIRTraitMapping,
  generateNIRNodes,
  getTraitsForPlatform,
  listAllNIRTraits,
  listNIRTraitsByLevel,
  listAllNIRPrimitives,
  validateNIRGraph,
  type NIRGraph,
  type NIRNode,
} from '../NIRTraitMap';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';

// Mock RBAC for tests (W.013 pattern)
vi.mock('../identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getRBAC: () => ({ checkAccess: () => ({ allowed: true }) }),
  };
});

// Helper to build a minimal composition
function makeComposition(overrides: Partial<HoloComposition> = {}): HoloComposition {
  return {
    name: 'TestNetwork',
    objects: [],
    ...overrides,
  } as HoloComposition;
}

// Helper to create a neuromorphic object
function makeNeuronObject(
  name: string,
  traitName: string,
  config: Record<string, unknown> = {},
  properties: Array<{ key: string; value: unknown }> = []
) {
  return {
    name,
    properties: properties.map(p => ({ key: p.key, value: p.value })),
    traits: [{ name: traitName, config }],
  };
}

describe('NIRCompiler', () => {
  let compiler: NIRCompiler;

  beforeEach(() => {
    compiler = new NIRCompiler();
  });

  // =========================================================================
  // Constructor / Options
  // =========================================================================

  describe('constructor and options', () => {
    it('uses default options', () => {
      const comp = makeComposition({
        objects: [makeNeuronObject('neuron1', 'lif_neuron')] as any,
      });
      const result = JSON.parse(compiler.compile(comp, 'test-token'));
      expect(result.version).toBe('0.5.0');
      expect(result.metadata.generator).toContain('NIRCompiler');
      expect(result.metadata.targetPlatforms).toHaveLength(5);
    });

    it('respects custom target platforms', () => {
      const c = new NIRCompiler({ targetPlatforms: ['loihi2', 'spinnaker2'] });
      const comp = makeComposition({
        objects: [makeNeuronObject('neuron1', 'lif_neuron')] as any,
      });
      const result = JSON.parse(c.compile(comp, 'test-token'));
      expect(result.metadata.targetPlatforms).toEqual(['loihi2', 'spinnaker2']);
    });

    it('respects custom default neuron size', () => {
      const c = new NIRCompiler({ defaultNeuronSize: 256 });
      const comp = makeComposition({
        objects: [makeNeuronObject('neuron1', 'lif_neuron')] as any,
      });
      const result = JSON.parse(c.compile(comp, 'test-token'));
      const lifNode = Object.values(result.nodes).find(
        (n: any) => n.type === 'LIF'
      ) as any;
      expect(lifNode).toBeDefined();
      expect(lifNode.params.tau).toHaveLength(256);
    });

    it('supports prettyPrint: false', () => {
      const c = new NIRCompiler({ prettyPrint: false });
      const comp = makeComposition({
        objects: [makeNeuronObject('neuron1', 'lif_neuron')] as any,
      });
      const json = c.compile(comp, 'test-token');
      expect(json.includes('\n')).toBe(false);
    });
  });

  // =========================================================================
  // Minimal Compilation
  // =========================================================================

  describe('minimal compilation', () => {
    it('compiles empty composition to valid JSON', () => {
      const json = compiler.compile(makeComposition(), 'test-token');
      const parsed = JSON.parse(json);
      expect(parsed.version).toBeDefined();
      expect(parsed.nodes).toBeDefined();
      expect(parsed.edges).toBeDefined();
      expect(parsed.metadata).toBeDefined();
    });

    it('generates Input and Output boundary nodes', () => {
      const result = JSON.parse(compiler.compile(makeComposition(), 'test-token'));
      expect(result.nodes['input']).toBeDefined();
      expect(result.nodes['input'].type).toBe('Input');
      expect(result.nodes['output']).toBeDefined();
      expect(result.nodes['output'].type).toBe('Output');
    });

    it('can disable boundary node generation', () => {
      const c = new NIRCompiler({ autoGenerateBoundaryNodes: false });
      const result = JSON.parse(c.compile(makeComposition(), 'test-token'));
      expect(result.nodes['input']).toBeUndefined();
      expect(result.nodes['output']).toBeUndefined();
    });

    it('includes source name in metadata', () => {
      const result = JSON.parse(
        compiler.compile(makeComposition({ name: 'MyBrain' }), 'test-token')
      );
      expect(result.metadata.source).toBe('MyBrain');
    });

    it('includes generation timestamp', () => {
      const result = JSON.parse(compiler.compile(makeComposition(), 'test-token'));
      expect(result.metadata.generatedAt).toBeDefined();
      // Verify it's a valid ISO date string
      expect(() => new Date(result.metadata.generatedAt)).not.toThrow();
    });
  });

  // =========================================================================
  // Neuron Model Compilation
  // =========================================================================

  describe('neuron models', () => {
    it('compiles LIF neuron trait', () => {
      const comp = makeComposition({
        objects: [
          makeNeuronObject('hidden_layer', 'lif_neuron', {
            num_neurons: 64,
            tau: 15.0,
            v_threshold: 0.8,
          }),
        ] as any,
      });
      const result = JSON.parse(compiler.compile(comp, 'test-token'));
      const lifNode = Object.values(result.nodes).find(
        (n: any) => n.type === 'LIF'
      ) as any;

      expect(lifNode).toBeDefined();
      expect(lifNode.type).toBe('LIF');
      expect(lifNode.params.tau).toHaveLength(64);
      expect(lifNode.params.tau[0]).toBe(15.0);
      expect(lifNode.params.v_threshold[0]).toBe(0.8);
      expect(lifNode.params.v_leak).toHaveLength(64);
      expect(lifNode.params.r).toHaveLength(64);
    });

    it('compiles CubaLIF neuron trait', () => {
      const comp = makeComposition({
        objects: [
          makeNeuronObject('layer1', 'cuba_lif_neuron', {
            num_neurons: 32,
            tau_syn: 5.0,
            tau_mem: 20.0,
          }),
        ] as any,
      });
      const result = JSON.parse(compiler.compile(comp, 'test-token'));
      const cubaNode = Object.values(result.nodes).find(
        (n: any) => n.type === 'CubaLIF'
      ) as any;

      expect(cubaNode).toBeDefined();
      expect(cubaNode.params.tau_syn).toHaveLength(32);
      expect(cubaNode.params.tau_syn[0]).toBe(5.0);
      expect(cubaNode.params.tau_mem[0]).toBe(20.0);
      expect(cubaNode.params.w_in).toHaveLength(32);
    });

    it('compiles IF neuron trait', () => {
      const comp = makeComposition({
        objects: [
          makeNeuronObject('integrators', 'if_neuron', {
            num_neurons: 16,
            v_threshold: 2.0,
          }),
        ] as any,
      });
      const result = JSON.parse(compiler.compile(comp, 'test-token'));
      const ifNode = Object.values(result.nodes).find(
        (n: any) => n.type === 'IF'
      ) as any;

      expect(ifNode).toBeDefined();
      expect(ifNode.params.r).toHaveLength(16);
      expect(ifNode.params.v_threshold[0]).toBe(2.0);
    });

    it('compiles leaky integrator trait', () => {
      const comp = makeComposition({
        objects: [
          makeNeuronObject('readout', 'leaky_integrator', { size: 10, tau: 50.0 }),
        ] as any,
      });
      const result = JSON.parse(compiler.compile(comp, 'test-token'));
      const liNode = Object.values(result.nodes).find(
        (n: any) => n.type === 'LI'
      ) as any;

      expect(liNode).toBeDefined();
      expect(liNode.params.tau).toHaveLength(10);
      expect(liNode.params.tau[0]).toBe(50.0);
    });

    it('compiles integrator trait', () => {
      const comp = makeComposition({
        objects: [
          makeNeuronObject('accum', 'integrator', { size: 8 }),
        ] as any,
      });
      const result = JSON.parse(compiler.compile(comp, 'test-token'));
      const intNode = Object.values(result.nodes).find(
        (n: any) => n.type === 'Integrator'
      ) as any;

      expect(intNode).toBeDefined();
      expect(intNode.params.r).toHaveLength(8);
    });

    it('uses default neuron size when not specified', () => {
      const comp = makeComposition({
        objects: [makeNeuronObject('layer', 'lif_neuron')] as any,
      });
      const result = JSON.parse(compiler.compile(comp, 'test-token'));
      const lifNode = Object.values(result.nodes).find(
        (n: any) => n.type === 'LIF'
      ) as any;
      expect(lifNode.params.tau).toHaveLength(128); // default
    });
  });

  // =========================================================================
  // Synapse / Connection Compilation
  // =========================================================================

  describe('synaptic connections', () => {
    it('compiles synaptic_connection (Affine)', () => {
      const comp = makeComposition({
        objects: [
          makeNeuronObject('syn1', 'synaptic_connection', {
            input_size: 64,
            output_size: 32,
          }),
        ] as any,
      });
      const result = JSON.parse(compiler.compile(comp, 'test-token'));
      const affineNode = Object.values(result.nodes).find(
        (n: any) => n.type === 'Affine'
      ) as any;

      expect(affineNode).toBeDefined();
      expect(affineNode.params.weight).toHaveLength(32); // output_size rows
      expect(affineNode.params.weight[0]).toHaveLength(64); // input_size cols
      expect(affineNode.params.bias).toHaveLength(32);
    });

    it('compiles linear_connection (Linear)', () => {
      const comp = makeComposition({
        objects: [
          makeNeuronObject('fc', 'linear_connection', {
            input_size: 128,
            output_size: 64,
          }),
        ] as any,
      });
      const result = JSON.parse(compiler.compile(comp, 'test-token'));
      const linearNode = Object.values(result.nodes).find(
        (n: any) => n.type === 'Linear'
      ) as any;

      expect(linearNode).toBeDefined();
      expect(linearNode.params.weight).toHaveLength(64);
      expect(linearNode.params.weight[0]).toHaveLength(128);
    });

    it('compiles conv_connection (Conv2d)', () => {
      const comp = makeComposition({
        objects: [
          makeNeuronObject('conv_layer', 'conv_connection', {
            in_channels: 1,
            out_channels: 16,
            kernel_size: 3,
            stride: 1,
            padding: 1,
          }),
        ] as any,
      });
      const result = JSON.parse(compiler.compile(comp, 'test-token'));
      const convNode = Object.values(result.nodes).find(
        (n: any) => n.type === 'Conv2d'
      ) as any;

      expect(convNode).toBeDefined();
      expect(convNode.params.weight).toHaveLength(16); // out_channels
      expect(convNode.params.weight[0]).toHaveLength(1); // in_channels / groups
      expect(convNode.params.weight[0][0]).toHaveLength(3); // kernel_size
      expect(convNode.params.stride).toEqual([1, 1]);
      expect(convNode.params.padding).toEqual([1, 1]);
    });
  });

  // =========================================================================
  // Encoder / Decoder Compilation
  // =========================================================================

  describe('encoders and decoders', () => {
    it('compiles spike_encoder (composite: Affine + Threshold)', () => {
      const comp = makeComposition({
        objects: [
          makeNeuronObject('encoder', 'spike_encoder', {
            input_size: 784,
            threshold: 0.5,
            gain: 2.0,
          }),
        ] as any,
      });
      const result = JSON.parse(compiler.compile(comp, 'test-token'));

      // Should generate both gain (Affine) and threshold nodes
      const gainNode = Object.values(result.nodes).find(
        (n: any) => n.id?.includes('gain')
      ) as any;
      const threshNode = Object.values(result.nodes).find(
        (n: any) => n.type === 'Threshold'
      ) as any;

      expect(gainNode).toBeDefined();
      expect(gainNode.type).toBe('Affine');
      expect(threshNode).toBeDefined();
      expect(threshNode.params.threshold[0]).toBe(0.5);

      // Should have internal edge connecting gain -> threshold
      const internalEdge = result.edges.find(
        (e: any) => e.source.includes('gain') && e.target.includes('threshold')
      );
      expect(internalEdge).toBeDefined();
    });

    it('compiles rate_encoder (composite: Affine + LIF)', () => {
      const comp = makeComposition({
        objects: [
          makeNeuronObject('rate_enc', 'rate_encoder', { input_size: 128, tau: 5.0 }),
        ] as any,
      });
      const result = JSON.parse(compiler.compile(comp, 'test-token'));

      const scaleNode = Object.values(result.nodes).find(
        (n: any) => n.id?.includes('scale')
      ) as any;
      const lifNode = Object.values(result.nodes).find(
        (n: any) => n.type === 'LIF' && n.id?.includes('lif')
      ) as any;

      expect(scaleNode).toBeDefined();
      expect(lifNode).toBeDefined();
    });

    it('compiles spike_decoder (LI)', () => {
      const comp = makeComposition({
        objects: [
          makeNeuronObject('decoder', 'spike_decoder', { output_size: 10, tau: 30.0 }),
        ] as any,
      });
      const result = JSON.parse(compiler.compile(comp, 'test-token'));

      const liNode = Object.values(result.nodes).find(
        (n: any) => n.type === 'LI' && n.metadata?.source_trait === 'spike_decoder'
      ) as any;

      expect(liNode).toBeDefined();
      expect(liNode.params.tau).toHaveLength(10);
      expect(liNode.params.tau[0]).toBe(30.0);
    });
  });

  // =========================================================================
  // Topology Traits
  // =========================================================================

  describe('topology traits', () => {
    it('compiles spike_delay', () => {
      const comp = makeComposition({
        objects: [
          makeNeuronObject('delay_line', 'spike_delay', { size: 64, delay: 3.0 }),
        ] as any,
      });
      const result = JSON.parse(compiler.compile(comp, 'test-token'));
      const delayNode = Object.values(result.nodes).find(
        (n: any) => n.type === 'Delay'
      ) as any;

      expect(delayNode).toBeDefined();
      expect(delayNode.params.delay).toHaveLength(64);
      expect(delayNode.params.delay[0]).toBe(3.0);
    });

    it('compiles spike_pooling (SumPooling)', () => {
      const comp = makeComposition({
        objects: [
          makeNeuronObject('pool', 'spike_pooling', { kernel_size: 4 }),
        ] as any,
      });
      const result = JSON.parse(compiler.compile(comp, 'test-token'));
      const poolNode = Object.values(result.nodes).find(
        (n: any) => n.type === 'SumPooling'
      ) as any;

      expect(poolNode).toBeDefined();
      expect(poolNode.params.kernel_size).toEqual([4, 4]);
    });

    it('compiles flatten', () => {
      const comp = makeComposition({
        objects: [
          makeNeuronObject('flat', 'flatten', { input_shape: [16, 7, 7] }),
        ] as any,
      });
      const result = JSON.parse(compiler.compile(comp, 'test-token'));
      const flatNode = Object.values(result.nodes).find(
        (n: any) => n.type === 'Flatten'
      ) as any;

      expect(flatNode).toBeDefined();
      expect(flatNode.params.input_type.shape).toEqual([16, 7, 7]);
    });

    it('compiles scaling', () => {
      const comp = makeComposition({
        objects: [
          makeNeuronObject('scale', 'scaling', { size: 32, scale: 0.5 }),
        ] as any,
      });
      const result = JSON.parse(compiler.compile(comp, 'test-token'));
      const scaleNode = Object.values(result.nodes).find(
        (n: any) => n.type === 'Scale'
      ) as any;

      expect(scaleNode).toBeDefined();
      expect(scaleNode.params.scale).toHaveLength(32);
      expect(scaleNode.params.scale[0]).toBe(0.5);
    });
  });

  // =========================================================================
  // Multi-Layer Network
  // =========================================================================

  describe('multi-layer network', () => {
    it('compiles a complete SNN with encoder, hidden layers, and decoder', () => {
      const comp = makeComposition({
        name: 'MNIST_SNN',
        state: {
          properties: [
            { key: 'input_size', value: 784 },
            { key: 'output_size', value: 10 },
          ],
        } as any,
        objects: [
          makeNeuronObject('enc', 'spike_encoder', { input_size: 784 }),
          makeNeuronObject('fc1', 'synaptic_connection', { input_size: 784, output_size: 256 }),
          makeNeuronObject('hidden1', 'lif_neuron', { num_neurons: 256 }),
          makeNeuronObject('fc2', 'synaptic_connection', { input_size: 256, output_size: 128 }),
          makeNeuronObject('hidden2', 'lif_neuron', { num_neurons: 128 }),
          makeNeuronObject('fc3', 'synaptic_connection', { input_size: 128, output_size: 10 }),
          makeNeuronObject('readout', 'leaky_integrator', { size: 10, tau: 50.0 }),
        ] as any,
      });

      const result = JSON.parse(compiler.compile(comp, 'test-token'));

      // Should have Input, Output, plus all intermediate nodes
      expect(result.nodes['input']).toBeDefined();
      expect(result.nodes['output']).toBeDefined();

      // Count node types
      const nodeTypes = Object.values(result.nodes).map((n: any) => n.type);
      expect(nodeTypes.filter(t => t === 'LIF').length).toBe(2);
      expect(nodeTypes.filter(t => t === 'Affine').length).toBeGreaterThanOrEqual(3);
      expect(nodeTypes.filter(t => t === 'LI').length).toBeGreaterThanOrEqual(1);

      // Should have edges connecting layers
      expect(result.edges.length).toBeGreaterThan(0);

      // Input size and output size should be reflected
      expect(result.nodes['input'].params.shape).toEqual([784]);
      expect(result.nodes['output'].params.shape).toEqual([10]);

      // Metadata should track used traits
      expect(result.metadata.neuromorphicTraitsUsed).toContain('lif_neuron');
      expect(result.metadata.neuromorphicTraitsUsed).toContain('synaptic_connection');
    });

    it('auto-connects layers sequentially', () => {
      const comp = makeComposition({
        objects: [
          makeNeuronObject('conn1', 'linear_connection', { input_size: 128, output_size: 64 }),
          makeNeuronObject('layer1', 'lif_neuron', { num_neurons: 64 }),
          makeNeuronObject('conn2', 'linear_connection', { input_size: 64, output_size: 32 }),
          makeNeuronObject('layer2', 'lif_neuron', { num_neurons: 32 }),
        ] as any,
      });

      const result = JSON.parse(compiler.compile(comp, 'test-token'));

      // Verify sequential connectivity exists
      expect(result.edges.length).toBeGreaterThan(0);

      // Input should connect to first connection
      const inputEdge = result.edges.find((e: any) => e.source === 'input');
      expect(inputEdge).toBeDefined();

      // Last neuron should connect to output
      const outputEdge = result.edges.find((e: any) => e.target === 'output');
      expect(outputEdge).toBeDefined();
    });

    it('disables auto-connect when option is false', () => {
      const c = new NIRCompiler({ autoConnect: false, autoGenerateBoundaryNodes: false });
      const comp = makeComposition({
        objects: [
          makeNeuronObject('layer1', 'lif_neuron', { num_neurons: 64 }),
          makeNeuronObject('layer2', 'lif_neuron', { num_neurons: 32 }),
        ] as any,
      });

      const result = JSON.parse(c.compile(comp, 'test-token'));
      // With no auto-connect and no boundary nodes, should have no auto-generated edges
      expect(result.edges.length).toBe(0);
    });
  });

  // =========================================================================
  // Template Support
  // =========================================================================

  describe('template support', () => {
    it('inherits traits from template', () => {
      const comp = makeComposition({
        templates: [
          {
            name: 'SpikingLayer',
            traits: [{ name: 'lif_neuron', config: { tau: 10.0, v_threshold: 0.5 } }],
          },
        ] as any,
        objects: [
          {
            name: 'hidden',
            template: 'SpikingLayer',
            properties: [{ key: 'num_neurons', value: 128 }],
            traits: [],
          },
        ] as any,
      });

      const result = JSON.parse(compiler.compile(comp, 'test-token'));
      const lifNode = Object.values(result.nodes).find(
        (n: any) => n.type === 'LIF'
      ) as any;

      expect(lifNode).toBeDefined();
      expect(lifNode.params.tau[0]).toBe(10.0);
      expect(lifNode.params.v_threshold[0]).toBe(0.5);
    });
  });

  // =========================================================================
  // Platform Filtering
  // =========================================================================

  describe('platform filtering', () => {
    it('filters out traits incompatible with target platforms', () => {
      // Conv2d only supports loihi2, spinnaker2
      const c = new NIRCompiler({ targetPlatforms: ['synsense_speck'] });
      const comp = makeComposition({
        objects: [
          makeNeuronObject('conv', 'conv_connection', { in_channels: 1, out_channels: 8 }),
          makeNeuronObject('lif', 'lif_neuron', { num_neurons: 32 }),
        ] as any,
      });

      const result = JSON.parse(c.compile(comp, 'test-token'));
      // Conv2d should be excluded since synsense_speck is not in its platforms
      const convNodes = Object.values(result.nodes).filter(
        (n: any) => n.type === 'Conv2d'
      );
      expect(convNodes.length).toBe(0);
      // LIF should still be present (it supports synsense_speck)
      const lifNodes = Object.values(result.nodes).filter(
        (n: any) => n.type === 'LIF'
      );
      expect(lifNodes.length).toBe(1);
    });
  });

  // =========================================================================
  // State Overrides
  // =========================================================================

  describe('state overrides', () => {
    it('infers input/output sizes from state', () => {
      const comp = makeComposition({
        state: {
          properties: [
            { key: 'input_size', value: 784 },
            { key: 'output_size', value: 10 },
          ],
        } as any,
        objects: [
          makeNeuronObject('layer', 'lif_neuron', { num_neurons: 64 }),
        ] as any,
      });

      const result = JSON.parse(compiler.compile(comp, 'test-token'));
      expect(result.nodes['input'].params.shape).toEqual([784]);
      expect(result.nodes['output'].params.shape).toEqual([10]);
    });
  });

  // =========================================================================
  // Node ID Sanitization
  // =========================================================================

  describe('node ID sanitization', () => {
    it('sanitizes special characters in node IDs', () => {
      const comp = makeComposition({
        objects: [
          makeNeuronObject('my layer!@#$%', 'lif_neuron', { num_neurons: 16 }),
        ] as any,
      });

      const result = JSON.parse(compiler.compile(comp, 'test-token'));
      const nodeIds = Object.keys(result.nodes);
      const lifNodeId = nodeIds.find(id => id !== 'input' && id !== 'output');
      expect(lifNodeId).toMatch(/^[a-z0-9_]+$/);
    });
  });

  // =========================================================================
  // Graph Validation
  // =========================================================================

  describe('graph validation', () => {
    it('includes validation warnings for invalid graphs', () => {
      // A graph with no objects but boundary nodes should be valid
      const result = JSON.parse(compiler.compile(makeComposition(), 'test-token'));
      // If there are warnings, they should be in metadata
      if (result.metadata.validationWarnings) {
        expect(Array.isArray(result.metadata.validationWarnings)).toBe(true);
      }
    });

    it('does not validate when validation is disabled', () => {
      const c = new NIRCompiler({ validateGraph: false });
      const result = JSON.parse(c.compile(makeComposition(), 'test-token'));
      expect(result.metadata.validationWarnings).toBeUndefined();
    });
  });
});

// =============================================================================
// NIRTraitMap Tests
// =============================================================================

describe('NIRTraitMap', () => {
  describe('getNIRTraitMapping', () => {
    it('returns mapping for known traits', () => {
      expect(getNIRTraitMapping('lif_neuron')).toBeDefined();
      expect(getNIRTraitMapping('cuba_lif_neuron')).toBeDefined();
      expect(getNIRTraitMapping('if_neuron')).toBeDefined();
      expect(getNIRTraitMapping('synaptic_connection')).toBeDefined();
      expect(getNIRTraitMapping('spike_encoder')).toBeDefined();
      expect(getNIRTraitMapping('spike_decoder')).toBeDefined();
    });

    it('returns undefined for unknown traits', () => {
      expect(getNIRTraitMapping('grabbable')).toBeUndefined();
      expect(getNIRTraitMapping('physics')).toBeUndefined();
      expect(getNIRTraitMapping('nonexistent')).toBeUndefined();
    });
  });

  describe('generateNIRNodes', () => {
    it('generates LIF nodes with correct parameters', () => {
      const result = generateNIRNodes('lif_neuron', 'test_lif', {
        num_neurons: 32,
        tau: 10.0,
        v_threshold: 1.5,
      });

      expect(result).not.toBeNull();
      expect(result!.nodes).toHaveLength(1);
      expect(result!.nodes[0].type).toBe('LIF');
      expect((result!.nodes[0].params as any).tau).toHaveLength(32);
      expect((result!.nodes[0].params as any).tau[0]).toBe(10.0);
      expect((result!.nodes[0].params as any).v_threshold[0]).toBe(1.5);
    });

    it('generates composite nodes for spike_encoder', () => {
      const result = generateNIRNodes('spike_encoder', 'enc', {
        input_size: 100,
        threshold: 0.8,
        gain: 3.0,
      });

      expect(result).not.toBeNull();
      expect(result!.nodes).toHaveLength(2);
      expect(result!.edges).toHaveLength(1);
      expect(result!.nodes.map(n => n.type)).toContain('Affine');
      expect(result!.nodes.map(n => n.type)).toContain('Threshold');
    });

    it('returns null for unknown traits', () => {
      expect(generateNIRNodes('unknown_trait', 'test', {})).toBeNull();
    });
  });

  describe('getTraitsForPlatform', () => {
    it('returns traits for Loihi 2', () => {
      const traits = getTraitsForPlatform('loihi2');
      expect(traits).toContain('lif_neuron');
      expect(traits).toContain('cuba_lif_neuron');
      expect(traits).toContain('synaptic_connection');
      expect(traits).toContain('spike_encoder');
      expect(traits).toContain('conv_connection');
    });

    it('returns traits for SynSense Speck', () => {
      const traits = getTraitsForPlatform('synsense_speck');
      expect(traits).toContain('lif_neuron');
      expect(traits).toContain('spike_encoder');
      // Conv2d should NOT be supported on Speck
      expect(traits).not.toContain('conv_connection');
    });

    it('returns different trait sets for different platforms', () => {
      const loihiTraits = getTraitsForPlatform('loihi2');
      const speckTraits = getTraitsForPlatform('synsense_speck');
      // Loihi2 should support more traits than Speck
      expect(loihiTraits.length).toBeGreaterThanOrEqual(speckTraits.length);
    });
  });

  describe('listAllNIRTraits', () => {
    it('returns all registered traits', () => {
      const traits = listAllNIRTraits();
      expect(traits.length).toBeGreaterThanOrEqual(15);
      expect(traits).toContain('lif_neuron');
      expect(traits).toContain('synaptic_connection');
      expect(traits).toContain('spike_encoder');
      expect(traits).toContain('spike_delay');
    });
  });

  describe('listNIRTraitsByLevel', () => {
    it('returns full implementation traits', () => {
      const fullTraits = listNIRTraitsByLevel('full');
      expect(fullTraits).toContain('lif_neuron');
      expect(fullTraits).toContain('if_neuron');
      expect(fullTraits).toContain('synaptic_connection');
      expect(fullTraits).toContain('spike_decoder');
    });

    it('returns composite implementation traits', () => {
      const compositeTraits = listNIRTraitsByLevel('composite');
      expect(compositeTraits).toContain('spike_encoder');
      expect(compositeTraits).toContain('rate_encoder');
    });
  });

  describe('listAllNIRPrimitives', () => {
    it('returns all NIR primitive types used in mappings', () => {
      const primitives = listAllNIRPrimitives();
      expect(primitives).toContain('LIF');
      expect(primitives).toContain('CubaLIF');
      expect(primitives).toContain('IF');
      expect(primitives).toContain('Affine');
      expect(primitives).toContain('Linear');
      expect(primitives).toContain('Conv2d');
      expect(primitives).toContain('Threshold');
      expect(primitives).toContain('LI');
      expect(primitives).toContain('Delay');
      expect(primitives).toContain('SumPooling');
      expect(primitives).toContain('Flatten');
      expect(primitives).toContain('Scale');
    });
  });

  describe('validateNIRGraph', () => {
    it('validates a correct graph', () => {
      const graph: NIRGraph = {
        version: '0.5.0',
        nodes: {
          input: { id: 'input', type: 'Input', params: { shape: [128] } },
          lif: { id: 'lif', type: 'LIF', params: { tau: [10], r: [1], v_leak: [0], v_threshold: [1] } },
          output: { id: 'output', type: 'Output', params: { shape: [128] } },
        },
        edges: [
          { source: 'input', target: 'lif' },
          { source: 'lif', target: 'output' },
        ],
        metadata: {
          source: 'test',
          generator: 'test',
          targetPlatforms: ['loihi2'],
          generatedAt: new Date().toISOString(),
        },
      };

      const result = validateNIRGraph(graph);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('detects missing Input node', () => {
      const graph: NIRGraph = {
        version: '0.5.0',
        nodes: {
          lif: { id: 'lif', type: 'LIF', params: {} },
          output: { id: 'output', type: 'Output', params: {} },
        },
        edges: [{ source: 'lif', target: 'output' }],
        metadata: { source: 'test', generator: 'test', targetPlatforms: [], generatedAt: '' },
      };

      const result = validateNIRGraph(graph);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Input'))).toBe(true);
    });

    it('detects missing Output node', () => {
      const graph: NIRGraph = {
        version: '0.5.0',
        nodes: {
          input: { id: 'input', type: 'Input', params: {} },
          lif: { id: 'lif', type: 'LIF', params: {} },
        },
        edges: [{ source: 'input', target: 'lif' }],
        metadata: { source: 'test', generator: 'test', targetPlatforms: [], generatedAt: '' },
      };

      const result = validateNIRGraph(graph);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Output'))).toBe(true);
    });

    it('detects edges referencing non-existent nodes', () => {
      const graph: NIRGraph = {
        version: '0.5.0',
        nodes: {
          input: { id: 'input', type: 'Input', params: {} },
          output: { id: 'output', type: 'Output', params: {} },
        },
        edges: [{ source: 'input', target: 'nonexistent' }],
        metadata: { source: 'test', generator: 'test', targetPlatforms: [], generatedAt: '' },
      };

      const result = validateNIRGraph(graph);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('nonexistent'))).toBe(true);
    });

    it('detects orphaned nodes', () => {
      const graph: NIRGraph = {
        version: '0.5.0',
        nodes: {
          input: { id: 'input', type: 'Input', params: {} },
          orphan: { id: 'orphan', type: 'LIF', params: {} },
          output: { id: 'output', type: 'Output', params: {} },
        },
        edges: [],
        metadata: { source: 'test', generator: 'test', targetPlatforms: [], generatedAt: '' },
      };

      const result = validateNIRGraph(graph);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Orphaned'))).toBe(true);
    });
  });
});

// =============================================================================
// NIR Trait Coverage Summary
// =============================================================================

describe('NIR trait coverage', () => {
  it('covers all expected neuron model traits', () => {
    const expectedNeuronTraits = [
      'lif_neuron',
      'cuba_lif_neuron',
      'if_neuron',
      'leaky_integrator',
      'integrator',
    ];
    for (const trait of expectedNeuronTraits) {
      expect(NIR_TRAIT_MAP[trait]).toBeDefined();
      expect(NIR_TRAIT_MAP[trait].description).toBeTruthy();
    }
  });

  it('covers all expected synapse traits', () => {
    const expectedSynapseTraits = [
      'synaptic_connection',
      'linear_connection',
      'conv_connection',
    ];
    for (const trait of expectedSynapseTraits) {
      expect(NIR_TRAIT_MAP[trait]).toBeDefined();
    }
  });

  it('covers all expected encoding traits', () => {
    const expectedEncodingTraits = [
      'spike_encoder',
      'rate_encoder',
      'spike_decoder',
    ];
    for (const trait of expectedEncodingTraits) {
      expect(NIR_TRAIT_MAP[trait]).toBeDefined();
    }
  });

  it('covers all expected topology traits', () => {
    const expectedTopologyTraits = [
      'spike_delay',
      'spike_pooling',
      'flatten',
      'scaling',
    ];
    for (const trait of expectedTopologyTraits) {
      expect(NIR_TRAIT_MAP[trait]).toBeDefined();
    }
  });

  it('all traits have at least one compatible platform', () => {
    for (const [name, mapping] of Object.entries(NIR_TRAIT_MAP)) {
      expect(mapping.platforms.length).toBeGreaterThan(0);
    }
  });

  it('all traits produce valid NIR nodes', () => {
    for (const [name, mapping] of Object.entries(NIR_TRAIT_MAP)) {
      const result = mapping.generate('test_node', {});
      expect(result.nodes.length).toBeGreaterThan(0);
      for (const node of result.nodes) {
        expect(node.id).toBeTruthy();
        expect(node.type).toBeTruthy();
        expect(node.params).toBeDefined();
      }
    }
  });
});
