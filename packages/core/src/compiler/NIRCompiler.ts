/**
 * HoloScript -> NIR (Neuromorphic Intermediate Representation) Compiler
 *
 * Generates NIR graph format from HoloScript compositions containing
 * neuromorphic traits (LIF_Neuron, SynapticConnection, SpikeEncoder, etc.).
 *
 * NIR is a unified instruction set for interoperable brain-inspired computing
 * that connects to:
 *   - Intel Loihi 2
 *   - SpiNNaker 2
 *   - SynSense Speck / Xylo
 *   - BrainScaleS-2
 *
 * Maps:
 *   - Composition -> NIR Graph
 *   - Objects with neuron traits -> NIR neuron nodes (LIF, CubaLIF, IF, LI)
 *   - Objects with synapse traits -> NIR connection nodes (Affine, Linear, Conv2d)
 *   - Objects with encoder traits -> NIR encoding subgraphs (Threshold + Affine)
 *   - Object hierarchy -> NIR edges (directed signal flow)
 *   - Templates -> Reusable NIR subgraph patterns
 *
 * Output: JSON serialization of NIR graph (compatible with nir.read()/nir.write())
 *
 * Specification: https://neuroir.org/docs/
 * Paper: Nature Communications (2025) DOI:10.1038/s41467-024-52259-9
 * Repository: https://github.com/neuromorphs/NIR
 *
 * @version 1.0.0
 */

import { CompilerBase } from './CompilerBase';
import { ANSCapabilityPath, type ANSCapabilityPathValue } from './identity/ANSNamespace';
import type {
  HoloComposition,
  HoloObjectDecl,
  HoloTemplate,
  HoloState,
} from '../parser/HoloCompositionTypes';
import {
  type NIRGraph,
  type NIRNode,
  type NIREdge,
  type NeuromorphicPlatform,
  NIR_TRAIT_MAP,
  getNIRTraitMapping,
  validateNIRGraph,
} from './NIRTraitMap';

// =============================================================================
// COMPILER OPTIONS
// =============================================================================

export interface NIRCompilerOptions {
  /** Target neuromorphic platforms (default: all) */
  targetPlatforms?: NeuromorphicPlatform[];
  /** Include metadata comments in output (default: true) */
  includeMetadata?: boolean;
  /** Validate graph structure (default: true) */
  validateGraph?: boolean;
  /** Pretty-print JSON output (default: true) */
  prettyPrint?: boolean;
  /** Default neuron size when not specified (default: 128) */
  defaultNeuronSize?: number;
  /** Auto-generate Input/Output nodes (default: true) */
  autoGenerateBoundaryNodes?: boolean;
  /** Auto-connect objects based on declaration order (default: true) */
  autoConnect?: boolean;
}

// =============================================================================
// NIR COMPILER
// =============================================================================

export class NIRCompiler extends CompilerBase {
  protected readonly compilerName = 'NIRCompiler';

  protected override getRequiredCapability(): ANSCapabilityPathValue {
    return ANSCapabilityPath.NIR;
  }

  private options: Required<NIRCompilerOptions>;

  constructor(options: NIRCompilerOptions = {}) {
    super();
    this.options = {
      targetPlatforms: options.targetPlatforms ?? [
        'loihi2', 'spinnaker2', 'synsense_speck', 'synsense_xylo', 'brainscales2',
      ],
      includeMetadata: options.includeMetadata ?? true,
      validateGraph: options.validateGraph ?? true,
      prettyPrint: options.prettyPrint ?? true,
      defaultNeuronSize: options.defaultNeuronSize ?? 128,
      autoGenerateBoundaryNodes: options.autoGenerateBoundaryNodes ?? true,
      autoConnect: options.autoConnect ?? true,
    };
  }

  /**
   * Compile a HoloScript composition to NIR graph JSON.
   */
  compile(composition: HoloComposition, agentToken: string, outputPath?: string): string {
    this.validateCompilerAccess(agentToken, outputPath);

    const graph = this.buildNIRGraph(composition);

    // Validate if enabled
    if (this.options.validateGraph) {
      const validation = validateNIRGraph(graph);
      if (!validation.valid) {
        // Add validation warnings to metadata instead of throwing
        graph.metadata.validationWarnings = validation.errors;
      }
    }

    return this.options.prettyPrint
      ? JSON.stringify(graph, null, 2)
      : JSON.stringify(graph);
  }

  /**
   * Build the NIR graph from a HoloScript composition.
   */
  private buildNIRGraph(composition: HoloComposition): NIRGraph {
    const nodes: Record<string, NIRNode> = {};
    const edges: NIREdge[] = [];

    // Track node insertion order for auto-connect
    const neuronNodeIds: string[] = [];
    const connectionNodeIds: string[] = [];
    const encoderNodeIds: string[] = [];
    const decoderNodeIds: string[] = [];

    // Add Input node
    if (this.options.autoGenerateBoundaryNodes) {
      const inputSize = this.inferInputSize(composition);
      nodes['input'] = {
        id: 'input',
        type: 'Input',
        params: { shape: [inputSize] },
        metadata: { role: 'graph_input' },
      };
    }

    // Process templates to identify reusable patterns
    const templateMap = new Map<string, HoloTemplate>();
    if (composition.templates) {
      for (const template of composition.templates) {
        templateMap.set(template.name, template);
      }
    }

    // Process objects - convert neuromorphic traits to NIR nodes
    if (composition.objects) {
      for (const obj of composition.objects) {
        const result = this.processObject(obj, templateMap);
        for (const node of result.nodes) {
          nodes[node.id] = node;

          // Categorize nodes for auto-connect
          if (this.isNeuronNode(node)) {
            neuronNodeIds.push(node.id);
          } else if (this.isConnectionNode(node)) {
            connectionNodeIds.push(node.id);
          } else if (this.isEncoderNode(node)) {
            encoderNodeIds.push(node.id);
          } else if (this.isDecoderNode(node)) {
            decoderNodeIds.push(node.id);
          }
        }
        edges.push(...result.edges);
      }
    }

    // Process state for potential parameter overrides
    if (composition.state) {
      this.applyStateOverrides(nodes, composition.state);
    }

    // Auto-connect sequential layers if enabled
    if (this.options.autoConnect) {
      const autoEdges = this.autoConnectLayers(
        nodes,
        encoderNodeIds,
        connectionNodeIds,
        neuronNodeIds,
        decoderNodeIds
      );
      edges.push(...autoEdges);
    }

    // Add Output node
    if (this.options.autoGenerateBoundaryNodes) {
      const outputSize = this.inferOutputSize(composition, nodes);
      nodes['output'] = {
        id: 'output',
        type: 'Output',
        params: { shape: [outputSize] },
        metadata: { role: 'graph_output' },
      };

      // Connect input to first encoder or first connection
      const firstEncoderId = encoderNodeIds[0];
      const firstConnectionId = connectionNodeIds[0];
      if (firstEncoderId) {
        // Find the first sub-node of the encoder
        const firstSubNode = this.findFirstSubNode(firstEncoderId, nodes);
        edges.push({ source: 'input', target: firstSubNode });
      } else if (firstConnectionId) {
        const firstSubNode = this.findFirstSubNode(firstConnectionId, nodes);
        edges.push({ source: 'input', target: firstSubNode });
      }

      // Connect last decoder or last neuron to output
      const lastDecoderId = decoderNodeIds[decoderNodeIds.length - 1];
      const lastNeuronId = neuronNodeIds[neuronNodeIds.length - 1];
      if (lastDecoderId) {
        edges.push({ source: lastDecoderId, target: 'output' });
      } else if (lastNeuronId) {
        edges.push({ source: lastNeuronId, target: 'output' });
      }
    }

    return {
      version: '0.5.0',
      nodes,
      edges,
      metadata: {
        source: composition.name,
        generator: 'HoloScript NIRCompiler v1.0.0',
        targetPlatforms: this.options.targetPlatforms,
        generatedAt: new Date().toISOString(),
        totalNodes: Object.keys(nodes).length,
        totalEdges: edges.length,
        neuromorphicTraitsUsed: this.collectUsedTraits(nodes),
      },
    };
  }

  /**
   * Process a single HoloScript object declaration into NIR nodes.
   */
  private processObject(
    obj: HoloObjectDecl,
    templateMap: Map<string, HoloTemplate>
  ): { nodes: NIRNode[]; edges: NIREdge[] } {
    const allNodes: NIRNode[] = [];
    const allEdges: NIREdge[] = [];

    // Collect traits from the object and its template
    const traits = this.collectTraits(obj, templateMap);

    // Process each trait
    for (const trait of traits) {
      const traitName = typeof trait === 'string' ? trait : trait.name;
      const traitConfig = typeof trait === 'string' ? {} : (trait.config || {});

      // Merge object properties into trait config
      const config = { ...traitConfig };
      for (const prop of obj.properties) {
        if (!(prop.key in config) && prop.value !== null && prop.value !== undefined) {
          config[prop.key] = prop.value as unknown;
        }
      }

      // Apply default neuron size if not specified
      if (!config.size && !config.num_neurons && !config.input_size && !config.output_size) {
        config.size = this.options.defaultNeuronSize;
      }

      const mapping = getNIRTraitMapping(traitName);
      if (mapping) {
        // Check platform compatibility
        const compatible = mapping.platforms.some(
          p => this.options.targetPlatforms.includes(p)
        );
        if (!compatible) continue;

        const nodeId = this.sanitizeNodeId(obj.name);
        const result = mapping.generate(nodeId, config);
        allNodes.push(...result.nodes);
        allEdges.push(...result.edges);
      }
    }

    return { nodes: allNodes, edges: allEdges };
  }

  /**
   * Collect all traits from an object and its template.
   */
  private collectTraits(
    obj: HoloObjectDecl,
    templateMap: Map<string, HoloTemplate>
  ): Array<string | { name: string; config: Record<string, unknown> }> {
    const traits: Array<string | { name: string; config: Record<string, unknown> }> = [];

    // Add template traits first
    if (obj.template && templateMap.has(obj.template)) {
      const template = templateMap.get(obj.template)!;
      if (template.traits) {
        for (const t of template.traits) {
          if (typeof t === 'string') {
            traits.push(t);
          } else {
            traits.push({ name: t.name, config: (t.config || {}) as Record<string, unknown> });
          }
        }
      }
    }

    // Add object's own traits (override template traits)
    if (obj.traits) {
      for (const t of obj.traits) {
        if (typeof t === 'string') {
          traits.push(t);
        } else {
          traits.push({ name: t.name, config: (t.config || {}) as Record<string, unknown> });
        }
      }
    }

    return traits;
  }

  /**
   * Apply state properties as parameter overrides to NIR nodes.
   */
  private applyStateOverrides(nodes: Record<string, NIRNode>, state: HoloState): void {
    for (const prop of state.properties) {
      // Pattern: node_name.param_name = value
      const parts = prop.key.split('.');
      if (parts.length === 2) {
        const [nodeName, paramName] = parts;
        const nodeId = this.sanitizeNodeId(nodeName);
        if (nodes[nodeId]) {
          (nodes[nodeId].params as Record<string, unknown>)[paramName] = prop.value;
        }
      }
    }
  }

  /**
   * Auto-connect layers in a sequential fashion.
   *
   * Connection order: encoder -> [connection -> neuron]+ -> decoder
   * This creates a feedforward spiking neural network topology.
   */
  private autoConnectLayers(
    nodes: Record<string, NIRNode>,
    encoderIds: string[],
    connectionIds: string[],
    neuronIds: string[],
    decoderIds: string[]
  ): NIREdge[] {
    const edges: NIREdge[] = [];

    // Build the ordered sequence of layers
    const orderedLayers: string[] = [];

    // Encoders first
    for (const id of encoderIds) {
      // Find the last sub-node of composite encoders
      const lastSubNode = this.findLastSubNode(id, nodes);
      orderedLayers.push(lastSubNode);
    }

    // Interleave connections and neurons
    const maxLen = Math.max(connectionIds.length, neuronIds.length);
    for (let i = 0; i < maxLen; i++) {
      if (i < connectionIds.length) {
        orderedLayers.push(connectionIds[i]);
      }
      if (i < neuronIds.length) {
        orderedLayers.push(neuronIds[i]);
      }
    }

    // Decoders last
    orderedLayers.push(...decoderIds);

    // Connect sequential pairs
    for (let i = 0; i < orderedLayers.length - 1; i++) {
      const sourceId = orderedLayers[i];
      const targetId = orderedLayers[i + 1];

      // Only add edge if both nodes exist and edge doesn't already exist
      if (nodes[sourceId] && nodes[targetId]) {
        const edgeExists = edges.some(
          e => e.source === sourceId && e.target === targetId
        );
        if (!edgeExists) {
          edges.push({ source: sourceId, target: targetId });
        }
      }
    }

    return edges;
  }

  /**
   * Find the first sub-node of a composite node (e.g., spike_encoder_gain).
   */
  private findFirstSubNode(baseId: string, nodes: Record<string, NIRNode>): string {
    // Check if there are sub-nodes with common prefixes
    const subNodeIds = Object.keys(nodes).filter(id => id.startsWith(baseId + '_'));
    if (subNodeIds.length > 0) {
      return subNodeIds[0];
    }
    return baseId;
  }

  /**
   * Find the last sub-node of a composite node.
   */
  private findLastSubNode(baseId: string, nodes: Record<string, NIRNode>): string {
    const subNodeIds = Object.keys(nodes).filter(id => id.startsWith(baseId + '_'));
    if (subNodeIds.length > 0) {
      return subNodeIds[subNodeIds.length - 1];
    }
    return baseId;
  }

  /**
   * Check if a node is a neuron model node.
   */
  private isNeuronNode(node: NIRNode): boolean {
    return ['LIF', 'CubaLIF', 'IF', 'LI', 'Integrator'].includes(node.type);
  }

  /**
   * Check if a node is a connection/synapse node.
   */
  private isConnectionNode(node: NIRNode): boolean {
    return ['Affine', 'Linear', 'Conv1d', 'Conv2d'].includes(node.type);
  }

  /**
   * Check if a node is an encoder node.
   */
  private isEncoderNode(node: NIRNode): boolean {
    return node.metadata?.source_trait === 'spike_encoder' ||
           node.metadata?.source_trait === 'rate_encoder';
  }

  /**
   * Check if a node is a decoder node.
   */
  private isDecoderNode(node: NIRNode): boolean {
    return node.metadata?.source_trait === 'spike_decoder';
  }

  /**
   * Infer input size from composition state or default.
   */
  private inferInputSize(composition: HoloComposition): number {
    if (composition.state) {
      const inputProp = composition.state.properties.find(
        p => p.key === 'input_size' || p.key === 'inputSize'
      );
      if (inputProp && typeof inputProp.value === 'number') {
        return inputProp.value;
      }
    }
    return this.options.defaultNeuronSize;
  }

  /**
   * Infer output size from the last neuron layer or composition state.
   */
  private inferOutputSize(
    composition: HoloComposition,
    nodes: Record<string, NIRNode>
  ): number {
    // Check state for explicit output_size
    if (composition.state) {
      const outputProp = composition.state.properties.find(
        p => p.key === 'output_size' || p.key === 'outputSize'
      );
      if (outputProp && typeof outputProp.value === 'number') {
        return outputProp.value;
      }
    }

    // Try to infer from the last neuron node
    const neuronNodes = Object.values(nodes).filter(n => this.isNeuronNode(n));
    if (neuronNodes.length > 0) {
      const lastNeuron = neuronNodes[neuronNodes.length - 1];
      const params = lastNeuron.params as Record<string, unknown>;
      if (Array.isArray(params.tau)) return (params.tau as number[]).length;
      if (Array.isArray(params.r)) return (params.r as number[]).length;
      if (Array.isArray(params.v_threshold)) return (params.v_threshold as number[]).length;
    }

    return this.options.defaultNeuronSize;
  }

  /**
   * Collect all neuromorphic trait names used in the graph.
   */
  private collectUsedTraits(nodes: Record<string, NIRNode>): string[] {
    const traits = new Set<string>();
    for (const node of Object.values(nodes)) {
      if (node.metadata?.source_trait && typeof node.metadata.source_trait === 'string') {
        traits.add(node.metadata.source_trait);
      }
    }
    return Array.from(traits);
  }

  /**
   * Sanitize a node ID for NIR graph compatibility.
   */
  private sanitizeNodeId(name: string): string {
    return name
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/_+/g, '_')
      .toLowerCase();
  }
}

export default NIRCompiler;
