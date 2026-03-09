/**
 * NodeGraphCompiler.ts
 *
 * Compiles a NodeGraph into HoloScript+ AST directives.
 * Translates visual logic graphs into executable runtime code.
 *
 * @module logic
 */

import { NodeGraph, LogicNode, LogicConnection } from './NodeGraph';

// =============================================================================
// TYPES
// =============================================================================

export interface CompiledDirective {
  type: 'lifecycle' | 'state' | 'event';
  name?: string;
  body?: Record<string, unknown>;
  handler?: string;
}

export interface CompilationResult {
  directives: CompiledDirective[];
  stateDeclarations: Record<string, unknown>;
  eventHandlers: Array<{ event: string; handler: string }>;
  warnings: string[];
  nodeCount: number;
  connectionCount: number;
}

// =============================================================================
// COMPILER
// =============================================================================

export class NodeGraphCompiler {
  /**
   * Compile a NodeGraph into HoloScript+ directives.
   */
  compile(graph: NodeGraph): CompilationResult {
    const warnings: string[] = [];
    const stateDeclarations: Record<string, unknown> = {};
    const eventHandlers: Array<{ event: string; handler: string }> = [];
    const directives: CompiledDirective[] = [];

    const nodes = graph.getNodes();
    const connections = graph.getConnections();

    // Pass 1: Extract state declarations from SetState/GetState nodes
    for (const node of nodes) {
      if (node.type === 'SetState' || node.type === 'GetState') {
        const key = String(node.data.key || this.getInputDefault(node, 'key') || '');
        if (key && !(key in stateDeclarations)) {
          stateDeclarations[key] =
            node.type === 'SetState' ? (node.data.initialValue ?? 0) : undefined;
        }
      }
    }

    // Emit state directive
    if (Object.keys(stateDeclarations).length > 0) {
      directives.push({
        type: 'state',
        body: stateDeclarations,
      });
    }

    // Pass 2: Extract event listeners from OnEvent nodes
    for (const node of nodes) {
      if (node.type === 'OnEvent') {
        const eventName = String(
          node.data.eventName || this.getInputDefault(node, 'eventName') || 'tick'
        );
        const downstream = this.traceDownstream(node.id, graph);
        const handlerCode = this.generateHandler(downstream, graph);

        eventHandlers.push({ event: eventName, handler: handlerCode });

        directives.push({
          type: 'lifecycle',
          name: `on_${eventName}`,
          handler: handlerCode,
        });
      }
    }

    // Pass 3: Generate update lifecycle for Timer nodes
    const timerNodes = nodes.filter((n) => n.type === 'Timer');
    if (timerNodes.length > 0) {
      const timerCode = timerNodes
        .map((t) => {
          const duration = t.data.duration || this.getInputDefault(t, 'duration') || 1;
          const loop = t.data.loop || this.getInputDefault(t, 'loop') || false;
          return `  // Timer ${t.id}: duration=${duration}, loop=${loop}`;
        })
        .join('\n');

      directives.push({
        type: 'lifecycle',
        name: 'on_update',
        handler: `function(delta) {\n${timerCode}\n}`,
      });
    }

    // Warnings for disconnected nodes
    for (const node of nodes) {
      const hasInputConnections = connections.some((c) => c.toNode === node.id);
      const hasOutputConnections = connections.some((c) => c.fromNode === node.id);

      if (!hasInputConnections && !hasOutputConnections && node.type !== 'OnEvent') {
        warnings.push(`Node "${node.id}" (${node.type}) is disconnected.`);
      }
    }

    return {
      directives,
      stateDeclarations,
      eventHandlers,
      warnings,
      nodeCount: nodes.length,
      connectionCount: connections.length,
    };
  }

  /**
   * Generate a HoloScript code snippet from a set of downstream nodes.
   */
  private generateHandler(nodeIds: string[], graph: NodeGraph): string {
    const lines: string[] = [];

    for (const nodeId of nodeIds) {
      const node = graph.getNode(nodeId);
      if (!node) continue;

      switch (node.type) {
        case 'SetState':
          lines.push(
            `  state.${node.data.key || 'value'} = ${JSON.stringify(node.data.value ?? 0)};`
          );
          break;
        case 'EmitEvent':
          lines.push(
            `  emit('${node.data.eventName || 'custom'}', ${JSON.stringify(node.data.payload ?? null)});`
          );
          break;
        case 'MathAdd':
          lines.push(`  // MathAdd: a + b`);
          break;
        case 'MathMultiply':
          lines.push(`  // MathMultiply: a * b`);
          break;
        case 'Branch':
          lines.push(`  // Branch: conditional logic`);
          break;
        default:
          lines.push(`  // ${node.type} (${node.id})`);
      }
    }

    return `function() {\n${lines.join('\n')}\n}`;
  }

  /**
   * Trace all downstream nodes from a given starting node (BFS).
   */
  private traceDownstream(startId: string, graph: NodeGraph): string[] {
    const visited = new Set<string>();
    const queue: string[] = [startId];
    const result: string[] = [];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      if (current !== startId) {
        result.push(current);
      }

      for (const conn of graph.getConnectionsFrom(current)) {
        if (!visited.has(conn.toNode)) {
          queue.push(conn.toNode);
        }
      }
    }

    return result;
  }

  /**
   * Get the default value for an input port.
   */
  private getInputDefault(node: LogicNode, portName: string): unknown {
    const port = node.inputs.find((p) => p.name === portName);
    return port?.defaultValue ?? null;
  }
}
