/**
 * NIR (Neuromorphic Intermediate Representation) Trait Mapping System
 *
 * Maps HoloScript neuromorphic traits to NIR computational primitives.
 * Used by NIRCompiler for trait-to-NIR-graph-node conversion.
 *
 * NIR Specification Reference:
 * - Paper: "Neuromorphic Intermediate Representation" (Nature Communications, 2025)
 * - GitHub: https://github.com/neuromorphs/NIR
 * - Docs: https://neuroir.org
 *
 * Supported Hardware Targets:
 * - Intel Loihi 2
 * - SpiNNaker 2
 * - SynSense Speck
 * - SynSense Xylo
 * - BrainScaleS-2
 *
 * @version 1.0.0
 */

// =============================================================================
// NIR PRIMITIVE TYPES
// =============================================================================

/**
 * All NIR computational primitive types as defined in the specification.
 *
 * Fundamental primitives:
 * - Affine, Linear, Conv1d, Conv2d: Stateless transformations
 * - Scale, Flatten, Delay, Threshold: Stateless operations
 * - Integrator, LI (Leaky Integrator): Stateful dynamics
 *
 * Higher-order composites:
 * - LIF (Leaky Integrate-and-Fire): LI + Threshold + Reset
 * - CubaLIF (Current-Based LIF): LI + Linear + LIF
 * - IF (Integrate-and-Fire): Integrator + Threshold + Reset
 *
 * Structural:
 * - NIRGraph: Subgraph container
 * - Input, Output: Graph boundary nodes
 * - SumPooling, AvgPooling: Spatial reduction
 */
export type NIRPrimitiveType =
  // Stateless transformations
  | 'Affine'
  | 'Linear'
  | 'Conv1d'
  | 'Conv2d'
  | 'Scale'
  | 'Flatten'
  // Temporal
  | 'Delay'
  // Threshold / spike
  | 'Threshold'
  // Stateful dynamics
  | 'Integrator'
  | 'LI'
  | 'LIF'
  | 'CubaLIF'
  | 'IF'
  // Pooling
  | 'SumPooling'
  | 'AvgPooling'
  // Structural
  | 'NIRGraph'
  | 'Input'
  | 'Output';

/**
 * Implementation level for NIR trait mappings.
 */
export type NIRTraitImplementationLevel =
  | 'full' // Generates complete NIR node with all parameters
  | 'partial' // Generates NIR node with defaults / TODOs
  | 'composite' // Generates multiple connected NIR nodes
  | 'comment' // Only generates documentation comment
  | 'unsupported'; // Not mappable to NIR

/**
 * Hardware platform compatibility for neuromorphic targets.
 */
export type NeuromorphicPlatform =
  | 'loihi2'
  | 'spinnaker2'
  | 'synsense_speck'
  | 'synsense_xylo'
  | 'brainscales2';

// =============================================================================
// NIR NODE PARAMETER TYPES
// =============================================================================

/**
 * Parameters for an NIR Affine node: y = W*x + b
 */
export interface NIRAffineParams {
  weight: number[][]; // Weight matrix W
  bias: number[]; // Bias vector b
}

/**
 * Parameters for an NIR Linear node: y = W*x
 */
export interface NIRLinearParams {
  weight: number[][]; // Weight matrix W
}

/**
 * Parameters for an NIR Convolution node.
 */
export interface NIRConvParams {
  weight: number[][][][]; // Convolution kernel
  stride: number[];
  padding: number[];
  dilation: number[];
  groups: number;
  bias?: number[];
}

/**
 * Parameters for an NIR Scale node: y = s*x
 */
export interface NIRScaleParams {
  scale: number[]; // Scaling factors
}

/**
 * Parameters for an NIR Flatten node.
 */
export interface NIRFlattenParams {
  input_type: { shape: number[] };
  start_dim: number;
  end_dim: number;
}

/**
 * Parameters for an NIR Delay node.
 */
export interface NIRDelayParams {
  delay: number[]; // Time delay per channel (tau)
}

/**
 * Parameters for an NIR Threshold (spike) node.
 */
export interface NIRThresholdParams {
  threshold: number[]; // Spike threshold (theta_thr)
}

/**
 * Parameters for an NIR Integrator node: dv/dt = R*i(t)
 */
export interface NIRIntegratorParams {
  r: number[]; // Resistance R
}

/**
 * Parameters for an NIR Leaky Integrator (LI) node.
 * Dynamics: tau * dv/dt = (v_leak - v) + R*i(t)
 */
export interface NIRLIParams {
  tau: number[]; // Time constant
  r: number[]; // Resistance
  v_leak: number[]; // Leak voltage
}

/**
 * Parameters for an NIR LIF (Leaky Integrate-and-Fire) node.
 * Composition: Reset + Threshold + LI
 */
export interface NIRLIFParams {
  tau: number[]; // Membrane time constant
  r: number[]; // Membrane resistance
  v_leak: number[]; // Leak potential
  v_threshold: number[]; // Spike threshold
}

/**
 * Parameters for an NIR CubaLIF (Current-Based LIF) node.
 * Composition: LI_syn + Linear + LIF_membrane
 */
export interface NIRCubaLIFParams {
  tau_syn: number[]; // Synaptic time constant
  tau_mem: number[]; // Membrane time constant
  r: number[]; // Membrane resistance
  v_leak: number[]; // Leak potential
  v_threshold: number[]; // Spike threshold
  w_in: number[]; // Input weights
}

/**
 * Parameters for an NIR IF (Integrate-and-Fire) node.
 * Composition: Reset + Threshold + Integrator
 */
export interface NIRIFParams {
  r: number[]; // Resistance
  v_threshold: number[]; // Spike threshold
}

/**
 * Union of all NIR parameter types.
 */
export type NIRNodeParams =
  | NIRAffineParams
  | NIRLinearParams
  | NIRConvParams
  | NIRScaleParams
  | NIRFlattenParams
  | NIRDelayParams
  | NIRThresholdParams
  | NIRIntegratorParams
  | NIRLIParams
  | NIRLIFParams
  | NIRCubaLIFParams
  | NIRIFParams
  | Record<string, unknown>;

// =============================================================================
// NIR GRAPH TYPES
// =============================================================================

/**
 * A single node in the NIR graph.
 */
export interface NIRNode {
  /** Unique identifier for this node */
  id: string;
  /** NIR primitive type */
  type: NIRPrimitiveType;
  /** Parameters for this primitive */
  params: NIRNodeParams;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * A directed edge in the NIR graph.
 * Edges are identity maps (no computation).
 * Multiple edges to the same input port are summed element-wise.
 */
export interface NIREdge {
  /** Source node ID */
  source: string;
  /** Source output port name (default: 'output') */
  sourcePort?: string;
  /** Target node ID */
  target: string;
  /** Target input port name (default: 'input') */
  targetPort?: string;
}

/**
 * Complete NIR graph representation.
 * Every graph has exactly one Input node and one Output node.
 */
export interface NIRGraph {
  /** Graph format version */
  version: string;
  /** Nodes dictionary (id -> node) */
  nodes: Record<string, NIRNode>;
  /** Directed edges between nodes */
  edges: NIREdge[];
  /** Graph-level metadata */
  metadata: {
    /** Source composition name */
    source: string;
    /** Generator version */
    generator: string;
    /** Target hardware platforms */
    targetPlatforms: NeuromorphicPlatform[];
    /** Timestamp */
    generatedAt: string;
    /** Additional metadata */
    [key: string]: unknown;
  };
}

// =============================================================================
// TRAIT MAPPING INTERFACE
// =============================================================================

/**
 * Maps a HoloScript trait to one or more NIR graph nodes.
 */
export interface NIRTraitMapping {
  /** HoloScript trait name */
  trait: string;
  /** Primary NIR primitive type */
  primaryNode: NIRPrimitiveType;
  /** All NIR node types generated by this trait */
  generatedNodes: NIRPrimitiveType[];
  /** Implementation completeness */
  level: NIRTraitImplementationLevel;
  /** Compatible hardware platforms */
  platforms: NeuromorphicPlatform[];
  /** Description of the mapping */
  description: string;
  /** Node generator function */
  generate: (
    nodeId: string,
    config: Record<string, unknown>
  ) => { nodes: NIRNode[]; edges: NIREdge[] };
}

// =============================================================================
// NEURON MODEL TRAITS
// =============================================================================

export const NEURON_TRAIT_MAP: Record<string, NIRTraitMapping> = {
  lif_neuron: {
    trait: 'lif_neuron',
    primaryNode: 'LIF',
    generatedNodes: ['LIF'],
    level: 'full',
    platforms: ['loihi2', 'spinnaker2', 'synsense_speck', 'synsense_xylo', 'brainscales2'],
    description:
      'Leaky Integrate-and-Fire neuron (tau*dv/dt = (v_leak - v) + R*i(t), spike when v >= theta)',
    generate: (nodeId, config) => {
      const numNeurons = Number(config.num_neurons ?? config.size ?? 128);
      const tau = Number(config.tau ?? config.time_constant ?? 20.0);
      const r = Number(config.r ?? config.resistance ?? 1.0);
      const vLeak = Number(config.v_leak ?? config.leak_potential ?? 0.0);
      const vThreshold = Number(config.v_threshold ?? config.threshold ?? 1.0);

      return {
        nodes: [
          {
            id: nodeId,
            type: 'LIF',
            params: {
              tau: Array(numNeurons).fill(tau),
              r: Array(numNeurons).fill(r),
              v_leak: Array(numNeurons).fill(vLeak),
              v_threshold: Array(numNeurons).fill(vThreshold),
            } as NIRLIFParams,
            metadata: { source_trait: 'lif_neuron', num_neurons: numNeurons },
          },
        ],
        edges: [],
      };
    },
  },

  cuba_lif_neuron: {
    trait: 'cuba_lif_neuron',
    primaryNode: 'CubaLIF',
    generatedNodes: ['CubaLIF'],
    level: 'full',
    platforms: ['loihi2', 'spinnaker2', 'synsense_xylo', 'brainscales2'],
    description: 'Current-Based LIF neuron with synaptic filtering (tau_syn, tau_mem dynamics)',
    generate: (nodeId, config) => {
      const numNeurons = Number(config.num_neurons ?? config.size ?? 128);
      const tauSyn = Number(config.tau_syn ?? config.synaptic_time_constant ?? 5.0);
      const tauMem = Number(config.tau_mem ?? config.membrane_time_constant ?? 20.0);
      const r = Number(config.r ?? config.resistance ?? 1.0);
      const vLeak = Number(config.v_leak ?? config.leak_potential ?? 0.0);
      const vThreshold = Number(config.v_threshold ?? config.threshold ?? 1.0);

      return {
        nodes: [
          {
            id: nodeId,
            type: 'CubaLIF',
            params: {
              tau_syn: Array(numNeurons).fill(tauSyn),
              tau_mem: Array(numNeurons).fill(tauMem),
              r: Array(numNeurons).fill(r),
              v_leak: Array(numNeurons).fill(vLeak),
              v_threshold: Array(numNeurons).fill(vThreshold),
              w_in: Array(numNeurons).fill(1.0),
            } as NIRCubaLIFParams,
            metadata: { source_trait: 'cuba_lif_neuron', num_neurons: numNeurons },
          },
        ],
        edges: [],
      };
    },
  },

  if_neuron: {
    trait: 'if_neuron',
    primaryNode: 'IF',
    generatedNodes: ['IF'],
    level: 'full',
    platforms: ['loihi2', 'spinnaker2', 'synsense_speck', 'synsense_xylo'],
    description: 'Integrate-and-Fire neuron (no leak): dv/dt = R*i(t), spike when v >= theta',
    generate: (nodeId, config) => {
      const numNeurons = Number(config.num_neurons ?? config.size ?? 128);
      const r = Number(config.r ?? config.resistance ?? 1.0);
      const vThreshold = Number(config.v_threshold ?? config.threshold ?? 1.0);

      return {
        nodes: [
          {
            id: nodeId,
            type: 'IF',
            params: {
              r: Array(numNeurons).fill(r),
              v_threshold: Array(numNeurons).fill(vThreshold),
            } as NIRIFParams,
            metadata: { source_trait: 'if_neuron', num_neurons: numNeurons },
          },
        ],
        edges: [],
      };
    },
  },

  leaky_integrator: {
    trait: 'leaky_integrator',
    primaryNode: 'LI',
    generatedNodes: ['LI'],
    level: 'full',
    platforms: ['loihi2', 'spinnaker2', 'brainscales2'],
    description: 'Leaky Integrator: tau*dv/dt = (v_leak - v) + R*i(t) (no spiking)',
    generate: (nodeId, config) => {
      const size = Number(config.size ?? 128);
      const tau = Number(config.tau ?? config.time_constant ?? 20.0);
      const r = Number(config.r ?? config.resistance ?? 1.0);
      const vLeak = Number(config.v_leak ?? 0.0);

      return {
        nodes: [
          {
            id: nodeId,
            type: 'LI',
            params: {
              tau: Array(size).fill(tau),
              r: Array(size).fill(r),
              v_leak: Array(size).fill(vLeak),
            } as NIRLIParams,
            metadata: { source_trait: 'leaky_integrator', size },
          },
        ],
        edges: [],
      };
    },
  },

  integrator: {
    trait: 'integrator',
    primaryNode: 'Integrator',
    generatedNodes: ['Integrator'],
    level: 'full',
    platforms: ['loihi2', 'spinnaker2', 'brainscales2'],
    description: 'Pure integrator: dv/dt = R*i(t)',
    generate: (nodeId, config) => {
      const size = Number(config.size ?? 128);
      const r = Number(config.r ?? config.resistance ?? 1.0);

      return {
        nodes: [
          {
            id: nodeId,
            type: 'Integrator',
            params: {
              r: Array(size).fill(r),
            } as NIRIntegratorParams,
            metadata: { source_trait: 'integrator', size },
          },
        ],
        edges: [],
      };
    },
  },
};

// =============================================================================
// SYNAPSE / CONNECTION TRAITS
// =============================================================================

export const SYNAPSE_TRAIT_MAP: Record<string, NIRTraitMapping> = {
  synaptic_connection: {
    trait: 'synaptic_connection',
    primaryNode: 'Affine',
    generatedNodes: ['Affine'],
    level: 'full',
    platforms: ['loihi2', 'spinnaker2', 'synsense_speck', 'synsense_xylo', 'brainscales2'],
    description: 'Weighted synaptic connection with optional bias: y = W*x + b',
    generate: (nodeId, config) => {
      const inputSize = Number(config.input_size ?? config.pre_size ?? 128);
      const outputSize = Number(config.output_size ?? config.post_size ?? 128);
      const weightInit = Number(config.weight_init ?? 0.01);
      const useBias = config.bias !== false;

      // Initialize weight matrix (random-like deterministic initialization)
      const weight: number[][] = [];
      for (let i = 0; i < outputSize; i++) {
        const row: number[] = [];
        for (let j = 0; j < inputSize; j++) {
          // Deterministic pseudo-random initialization based on position
          row.push(weightInit * Math.sin(i * inputSize + j + 1));
        }
        weight.push(row);
      }

      const bias = useBias ? Array(outputSize).fill(0.0) : undefined;

      const params: NIRAffineParams = bias ? { weight, bias } : { weight, bias: [] };

      return {
        nodes: [
          {
            id: nodeId,
            type: 'Affine',
            params,
            metadata: {
              source_trait: 'synaptic_connection',
              input_size: inputSize,
              output_size: outputSize,
            },
          },
        ],
        edges: [],
      };
    },
  },

  linear_connection: {
    trait: 'linear_connection',
    primaryNode: 'Linear',
    generatedNodes: ['Linear'],
    level: 'full',
    platforms: ['loihi2', 'spinnaker2', 'synsense_speck', 'synsense_xylo', 'brainscales2'],
    description: 'Linear synaptic connection (no bias): y = W*x',
    generate: (nodeId, config) => {
      const inputSize = Number(config.input_size ?? config.pre_size ?? 128);
      const outputSize = Number(config.output_size ?? config.post_size ?? 128);
      const weightInit = Number(config.weight_init ?? 0.01);

      const weight: number[][] = [];
      for (let i = 0; i < outputSize; i++) {
        const row: number[] = [];
        for (let j = 0; j < inputSize; j++) {
          row.push(weightInit * Math.sin(i * inputSize + j + 1));
        }
        weight.push(row);
      }

      return {
        nodes: [
          {
            id: nodeId,
            type: 'Linear',
            params: { weight } as NIRLinearParams,
            metadata: {
              source_trait: 'linear_connection',
              input_size: inputSize,
              output_size: outputSize,
            },
          },
        ],
        edges: [],
      };
    },
  },

  conv_connection: {
    trait: 'conv_connection',
    primaryNode: 'Conv2d',
    generatedNodes: ['Conv2d'],
    level: 'full',
    platforms: ['loihi2', 'spinnaker2'],
    description: 'Convolutional synaptic connection (2D convolution)',
    generate: (nodeId, config) => {
      const inChannels = Number(config.in_channels ?? 1);
      const outChannels = Number(config.out_channels ?? 32);
      const kernelSize = Number(config.kernel_size ?? 3);
      const stride = Number(config.stride ?? 1);
      const padding = Number(config.padding ?? 0);
      const dilation = Number(config.dilation ?? 1);
      const groups = Number(config.groups ?? 1);

      // Initialize convolution kernel [out_ch, in_ch/groups, kH, kW]
      const weight: number[][][][] = [];
      for (let oc = 0; oc < outChannels; oc++) {
        const ochSlice: number[][][] = [];
        for (let ic = 0; ic < inChannels / groups; ic++) {
          const icSlice: number[][] = [];
          for (let kh = 0; kh < kernelSize; kh++) {
            const row: number[] = [];
            for (let kw = 0; kw < kernelSize; kw++) {
              row.push(0.01 * Math.sin(oc * 1000 + ic * 100 + kh * 10 + kw + 1));
            }
            row.push(...[]); // no-op, just for clarity
            icSlice.push(row);
          }
          ochSlice.push(icSlice);
        }
        weight.push(ochSlice);
      }

      return {
        nodes: [
          {
            id: nodeId,
            type: 'Conv2d',
            params: {
              weight,
              stride: [stride, stride],
              padding: [padding, padding],
              dilation: [dilation, dilation],
              groups,
            } as NIRConvParams,
            metadata: {
              source_trait: 'conv_connection',
              in_channels: inChannels,
              out_channels: outChannels,
              kernel_size: kernelSize,
            },
          },
        ],
        edges: [],
      };
    },
  },
};

// =============================================================================
// ENCODING / DECODING TRAITS
// =============================================================================

export const ENCODING_TRAIT_MAP: Record<string, NIRTraitMapping> = {
  spike_encoder: {
    trait: 'spike_encoder',
    primaryNode: 'Threshold',
    generatedNodes: ['Affine', 'Threshold'],
    level: 'composite',
    platforms: ['loihi2', 'spinnaker2', 'synsense_speck', 'synsense_xylo', 'brainscales2'],
    description: 'Encodes continuous signals into spike trains via threshold crossing',
    generate: (nodeId, config) => {
      const inputSize = Number(config.input_size ?? config.size ?? 128);
      const threshold = Number(config.threshold ?? 1.0);
      const gain = Number(config.gain ?? 1.0);

      // Gain scaling (Affine: y = gain * x)
      const gainWeight: number[][] = [];
      for (let i = 0; i < inputSize; i++) {
        const row = Array(inputSize).fill(0);
        row[i] = gain;
        gainWeight.push(row);
      }

      return {
        nodes: [
          {
            id: `${nodeId}_gain`,
            type: 'Affine',
            params: {
              weight: gainWeight,
              bias: Array(inputSize).fill(0),
            } as NIRAffineParams,
            metadata: { source_trait: 'spike_encoder', role: 'gain_scaling' },
          },
          {
            id: `${nodeId}_threshold`,
            type: 'Threshold',
            params: {
              threshold: Array(inputSize).fill(threshold),
            } as NIRThresholdParams,
            metadata: { source_trait: 'spike_encoder', role: 'spike_generation' },
          },
        ],
        edges: [{ source: `${nodeId}_gain`, target: `${nodeId}_threshold` }],
      };
    },
  },

  rate_encoder: {
    trait: 'rate_encoder',
    primaryNode: 'LIF',
    generatedNodes: ['Affine', 'LIF'],
    level: 'composite',
    platforms: ['loihi2', 'spinnaker2', 'synsense_speck', 'synsense_xylo'],
    description: 'Rate coding: converts scalar values to spike rates via LIF neurons',
    generate: (nodeId, config) => {
      const inputSize = Number(config.input_size ?? config.size ?? 128);
      const tau = Number(config.tau ?? 10.0);
      const gain = Number(config.gain ?? 1.0);

      const gainWeight: number[][] = [];
      for (let i = 0; i < inputSize; i++) {
        const row = Array(inputSize).fill(0);
        row[i] = gain;
        gainWeight.push(row);
      }

      return {
        nodes: [
          {
            id: `${nodeId}_scale`,
            type: 'Affine',
            params: {
              weight: gainWeight,
              bias: Array(inputSize).fill(0),
            } as NIRAffineParams,
            metadata: { source_trait: 'rate_encoder', role: 'input_scaling' },
          },
          {
            id: `${nodeId}_lif`,
            type: 'LIF',
            params: {
              tau: Array(inputSize).fill(tau),
              r: Array(inputSize).fill(1.0),
              v_leak: Array(inputSize).fill(0.0),
              v_threshold: Array(inputSize).fill(1.0),
            } as NIRLIFParams,
            metadata: { source_trait: 'rate_encoder', role: 'rate_neuron' },
          },
        ],
        edges: [{ source: `${nodeId}_scale`, target: `${nodeId}_lif` }],
      };
    },
  },

  spike_decoder: {
    trait: 'spike_decoder',
    primaryNode: 'LI',
    generatedNodes: ['LI'],
    level: 'full',
    platforms: ['loihi2', 'spinnaker2', 'synsense_speck', 'synsense_xylo', 'brainscales2'],
    description: 'Decodes spike trains to continuous signals via leaky integration',
    generate: (nodeId, config) => {
      const outputSize = Number(config.output_size ?? config.size ?? 128);
      const tau = Number(config.tau ?? 20.0);

      return {
        nodes: [
          {
            id: nodeId,
            type: 'LI',
            params: {
              tau: Array(outputSize).fill(tau),
              r: Array(outputSize).fill(1.0),
              v_leak: Array(outputSize).fill(0.0),
            } as NIRLIParams,
            metadata: { source_trait: 'spike_decoder', output_size: outputSize },
          },
        ],
        edges: [],
      };
    },
  },
};

// =============================================================================
// NETWORK TOPOLOGY TRAITS
// =============================================================================

export const TOPOLOGY_TRAIT_MAP: Record<string, NIRTraitMapping> = {
  spike_delay: {
    trait: 'spike_delay',
    primaryNode: 'Delay',
    generatedNodes: ['Delay'],
    level: 'full',
    platforms: ['loihi2', 'spinnaker2'],
    description: 'Axonal delay: output(t) = input(t - tau)',
    generate: (nodeId, config) => {
      const size = Number(config.size ?? 128);
      const delay = Number(config.delay ?? config.tau ?? 1.0);

      return {
        nodes: [
          {
            id: nodeId,
            type: 'Delay',
            params: {
              delay: Array(size).fill(delay),
            } as NIRDelayParams,
            metadata: { source_trait: 'spike_delay', size },
          },
        ],
        edges: [],
      };
    },
  },

  spike_pooling: {
    trait: 'spike_pooling',
    primaryNode: 'SumPooling',
    generatedNodes: ['SumPooling'],
    level: 'full',
    platforms: ['loihi2', 'spinnaker2'],
    description: 'Spatial sum pooling for spike population reduction',
    generate: (nodeId, config) => {
      const kernelSize = Number(config.kernel_size ?? 2);

      return {
        nodes: [
          {
            id: nodeId,
            type: 'SumPooling',
            params: {
              kernel_size: [kernelSize, kernelSize],
              stride: [kernelSize, kernelSize],
              padding: [0, 0],
            },
            metadata: { source_trait: 'spike_pooling', kernel_size: kernelSize },
          },
        ],
        edges: [],
      };
    },
  },

  flatten: {
    trait: 'flatten',
    primaryNode: 'Flatten',
    generatedNodes: ['Flatten'],
    level: 'full',
    platforms: ['loihi2', 'spinnaker2', 'synsense_speck', 'synsense_xylo', 'brainscales2'],
    description: 'Flattens multi-dimensional spike tensors to 1D',
    generate: (nodeId, config) => {
      const inputShape = (config.input_shape as number[]) ?? [1, 28, 28];
      const startDim = Number(config.start_dim ?? 0);
      const endDim = Number(config.end_dim ?? -1);

      return {
        nodes: [
          {
            id: nodeId,
            type: 'Flatten',
            params: {
              input_type: { shape: inputShape },
              start_dim: startDim,
              end_dim: endDim,
            } as NIRFlattenParams,
            metadata: { source_trait: 'flatten', input_shape: inputShape },
          },
        ],
        edges: [],
      };
    },
  },

  scaling: {
    trait: 'scaling',
    primaryNode: 'Scale',
    generatedNodes: ['Scale'],
    level: 'full',
    platforms: ['loihi2', 'spinnaker2', 'synsense_speck', 'synsense_xylo', 'brainscales2'],
    description: 'Element-wise scaling: y = s * x',
    generate: (nodeId, config) => {
      const size = Number(config.size ?? 128);
      const scaleFactor = Number(config.scale ?? config.factor ?? 1.0);

      return {
        nodes: [
          {
            id: nodeId,
            type: 'Scale',
            params: {
              scale: Array(size).fill(scaleFactor),
            } as NIRScaleParams,
            metadata: { source_trait: 'scaling', size, scale_factor: scaleFactor },
          },
        ],
        edges: [],
      };
    },
  },
};

// =============================================================================
// COMBINED TRAIT MAP
// =============================================================================

export const NIR_TRAIT_MAP: Record<string, NIRTraitMapping> = {
  ...NEURON_TRAIT_MAP,
  ...SYNAPSE_TRAIT_MAP,
  ...ENCODING_TRAIT_MAP,
  ...TOPOLOGY_TRAIT_MAP,
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get NIR trait mapping for a given trait name.
 */
export function getNIRTraitMapping(traitName: string): NIRTraitMapping | undefined {
  return NIR_TRAIT_MAP[traitName];
}

/**
 * Generate NIR nodes and edges for a trait.
 */
export function generateNIRNodes(
  traitName: string,
  nodeId: string,
  config: Record<string, unknown>
): { nodes: NIRNode[]; edges: NIREdge[] } | null {
  const mapping = getNIRTraitMapping(traitName);
  if (!mapping) return null;
  return mapping.generate(nodeId, config);
}

/**
 * Get all traits compatible with a specific hardware platform.
 */
export function getTraitsForPlatform(platform: NeuromorphicPlatform): string[] {
  return Object.entries(NIR_TRAIT_MAP)
    .filter(([_, mapping]) => mapping.platforms.includes(platform))
    .map(([name]) => name);
}

/**
 * Get all supported neuromorphic trait names.
 */
export function listAllNIRTraits(): string[] {
  return Object.keys(NIR_TRAIT_MAP);
}

/**
 * Get traits grouped by implementation level.
 */
export function listNIRTraitsByLevel(level: NIRTraitImplementationLevel): string[] {
  return Object.entries(NIR_TRAIT_MAP)
    .filter(([_, mapping]) => mapping.level === level)
    .map(([name]) => name);
}

/**
 * Get all NIR primitive types used across all trait mappings.
 */
export function listAllNIRPrimitives(): NIRPrimitiveType[] {
  const primitives = new Set<NIRPrimitiveType>();
  for (const mapping of Object.values(NIR_TRAIT_MAP)) {
    for (const nodeType of mapping.generatedNodes) {
      primitives.add(nodeType);
    }
  }
  return Array.from(primitives);
}

/**
 * Validate that a NIR graph has proper Input and Output nodes.
 */
export function validateNIRGraph(graph: NIRGraph): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check for Input node
  const inputNodes = Object.values(graph.nodes).filter((n) => n.type === 'Input');
  if (inputNodes.length === 0) {
    errors.push('NIR graph must have exactly one Input node');
  } else if (inputNodes.length > 1) {
    errors.push(`NIR graph has ${inputNodes.length} Input nodes (expected 1)`);
  }

  // Check for Output node
  const outputNodes = Object.values(graph.nodes).filter((n) => n.type === 'Output');
  if (outputNodes.length === 0) {
    errors.push('NIR graph must have exactly one Output node');
  } else if (outputNodes.length > 1) {
    errors.push(`NIR graph has ${outputNodes.length} Output nodes (expected 1)`);
  }

  // Validate edges reference existing nodes
  for (const edge of graph.edges) {
    if (!graph.nodes[edge.source]) {
      errors.push(`Edge references non-existent source node: ${edge.source}`);
    }
    if (!graph.nodes[edge.target]) {
      errors.push(`Edge references non-existent target node: ${edge.target}`);
    }
  }

  // Check for orphaned nodes (no incoming or outgoing edges, excluding Input/Output)
  const connectedNodes = new Set<string>();
  for (const edge of graph.edges) {
    connectedNodes.add(edge.source);
    connectedNodes.add(edge.target);
  }
  for (const [id, node] of Object.entries(graph.nodes)) {
    if (node.type !== 'Input' && node.type !== 'Output' && !connectedNodes.has(id)) {
      errors.push(`Orphaned node with no edges: ${id} (type: ${node.type})`);
    }
  }

  return { valid: errors.length === 0, errors };
}
