/**
 * GraphCompiler — Compile node graph to executable sequence
 *
 * @version 1.0.0
 */

import { NodeGraph, type GraphNode } from './NodeGraph';
import { NodeLibrary } from './NodeLibrary';

export interface CompiledStep {
  nodeId: string;
  nodeType: string;
  inputs: Record<
    string,
    { source: 'wire' | 'default'; value: unknown; wireFrom?: string; wireFromPort?: string }
  >;
  outputs: Record<string, unknown>;
  order: number;
}

export interface CompilationResult {
  steps: CompiledStep[];
  warnings: string[];
  errors: string[];
  optimized: boolean;
}

export class GraphCompiler {
  private optimizationPasses: string[] = ['dead-node', 'constant-fold'];
  private readonly nodeLibrary = new NodeLibrary();

  /**
   * Compile a graph to an ordered sequence of steps
   */
  compile(graph: NodeGraph): CompilationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (graph.hasCycle()) {
      errors.push('Graph contains a cycle — cannot compile');
      return { steps: [], warnings, errors, optimized: false };
    }

    const order = graph.getTopologicalOrder();
    if (order.length === 0 && graph.getNodeCount() > 0) {
      errors.push('Topological sort failed');
      return { steps: [], warnings, errors, optimized: false };
    }

    const nodeOutputs = new Map<string, Record<string, unknown>>();
    const steps: CompiledStep[] = order.map((nodeId, idx) => {
      const node = graph.getNode(nodeId)!;
      const inputs: Record<
        string,
        { source: 'wire' | 'default'; value: unknown; wireFrom?: string; wireFromPort?: string }
      > = {};

      for (const port of node.ports) {
        if (port.direction === 'input') {
          const wires = graph
            .getWiresForNode(nodeId)
            .filter((w) => w.toNodeId === nodeId && w.toPortId === port.id);
          if (wires.length > 0) {
            const wire = wires[0];
            const sourceOutputs = nodeOutputs.get(wire.fromNodeId) ?? {};
            inputs[port.id] = {
              source: 'wire',
              value: Object.prototype.hasOwnProperty.call(sourceOutputs, wire.fromPortId)
                ? sourceOutputs[wire.fromPortId]
                : null,
              wireFrom: wire.fromNodeId,
              wireFromPort: wire.fromPortId,
            };
          } else {
            inputs[port.id] = { source: 'default', value: port.defaultValue };
          }
        }
      }

      const outputs = this.evaluateNode(node, inputs, warnings);
      nodeOutputs.set(nodeId, outputs);

      return { nodeId, nodeType: node.type, inputs, outputs, order: idx };
    });

    // Simple optimization: warn about unconnected outputs
    for (const node of graph.getAllNodes()) {
      const outputPorts = node.ports.filter((p) => p.direction === 'output');
      for (const port of outputPorts) {
        const wires = graph.getWiresForNode(node.id).filter((w) => w.fromPortId === port.id);
        if (wires.length === 0) {
          warnings.push(`Node "${node.label}" output "${port.name}" is unconnected`);
        }
      }
    }

    return { steps, warnings, errors, optimized: this.optimizationPasses.length > 0 };
  }

  /**
   * Validate a graph without compiling
   */
  validate(graph: NodeGraph): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (graph.hasCycle()) errors.push('Graph contains a cycle');
    if (graph.getNodeCount() === 0) errors.push('Graph is empty');
    return { valid: errors.length === 0, errors };
  }

  getOptimizationPasses(): string[] {
    return [...this.optimizationPasses];
  }
  setOptimizationPasses(passes: string[]): void {
    this.optimizationPasses = passes;
  }

  private evaluateNode(
    node: GraphNode,
    inputs: CompiledStep['inputs'],
    warnings: string[]
  ): Record<string, unknown> {
    const definition = this.nodeLibrary.get(node.type);
    if (!definition?.evaluate) {
      return {};
    }

    const inputValues = Object.fromEntries(
      Object.entries(inputs).map(([portId, input]) => [portId, input.value])
    );

    try {
      return definition.evaluate(inputValues);
    } catch (error) {
      warnings.push(
        `Node "${node.label}" evaluator failed: ${error instanceof Error ? error.message : String(error)}`
      );
      return {};
    }
  }
}
