/**
 * NodeGraphCompiler.ts
 *
 * Compiles a NodeGraph into HoloScript+ AST directives.
 * Translates visual logic graphs into executable runtime code.
 *
 * @module logic
 */

import {
  BUILT_IN_NODE_TYPES,
  type NodeGraph,
  type LogicNode,
  type LogicConnection,
  type PortDefinition,
} from './NodeGraph';

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
        const handlerCode = this.generateHandler(node, downstream, graph);

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
  private generateHandler(eventNode: LogicNode, nodeIds: string[], graph: NodeGraph): string {
    const lines: string[] = [
      '  const __nodeOutputs = Object.create(null);',
      `  __nodeOutputs[${this.toLiteral(eventNode.id)}] = { triggered: true, payload };`,
    ];

    for (const nodeId of this.orderNodeIds(nodeIds, graph)) {
      const node = graph.getNode(nodeId);
      if (!node) continue;

      lines.push(...this.emitNodeEvaluation(node, graph));
    }

    return `function(payload = null) {\n${lines.join('\n')}\n}`;
  }

  /**
   * Emit code for a single node using the same input defaults and connected
   * output override order as NodeGraph.evaluate().
   */
  private emitNodeEvaluation(node: LogicNode, graph: NodeGraph): string[] {
    const inputExpressions = this.buildInputExpressions(node, graph);
    const inputsVar = this.variableName('__inputs', node.id);
    const outputsVar = this.variableName('__outputs', node.id);
    const lines: string[] = [`  const ${inputsVar} = {`];

    for (const [portName, expression] of Object.entries(inputExpressions)) {
      lines.push(`    ${JSON.stringify(portName)}: ${expression},`);
    }
    lines.push('  };');

    switch (node.type) {
      case 'MathAdd':
        lines.push(
          `  const ${outputsVar} = { result: (Number(${inputsVar}["a"]) || 0) + (Number(${inputsVar}["b"]) || 0) };`
        );
        break;
      case 'MathMultiply':
        lines.push(
          `  const ${outputsVar} = { result: (Number(${inputsVar}["a"]) || 0) * (Number(${inputsVar}["b"]) || 1) };`
        );
        break;
      case 'Branch':
        lines.push(
          `  const ${outputsVar} = { result: ${inputsVar}["condition"] ? ${inputsVar}["ifTrue"] : ${inputsVar}["ifFalse"] };`
        );
        break;
      case 'SetState':
        lines.push(...this.emitSetState(node, inputsVar, outputsVar, graph));
        break;
      case 'GetState':
        lines.push(
          `  const ${outputsVar} = { value: state[String(${inputsVar}["key"])] ?? null };`
        );
        break;
      case 'EmitEvent':
        lines.push(...this.emitEvent(node, inputsVar, outputsVar, graph));
        break;
      default:
        lines.push(
          `  // ${node.type} (${node.id}) handler scaffold; no executable compiler mapping yet.`
        );
        lines.push(`  const ${outputsVar} = {};`);
    }

    lines.push(`  __nodeOutputs[${this.toLiteral(node.id)}] = ${outputsVar};`);
    return lines;
  }

  private emitSetState(
    node: LogicNode,
    inputsVar: string,
    outputsVar: string,
    graph: NodeGraph
  ): string[] {
    const lines: string[] = [];
    const staticKey = this.getStaticInputValue(node, 'key', graph);

    if (typeof staticKey === 'string' && staticKey.length > 0) {
      lines.push(`  state${this.propertySuffix(staticKey)} = ${inputsVar}["value"];`);
    } else {
      const keyVar = this.variableName('__stateKey', node.id);
      lines.push(`  const ${keyVar} = String(${inputsVar}["key"]);`);
      lines.push(`  if (${keyVar}) state[${keyVar}] = ${inputsVar}["value"];`);
    }

    lines.push(`  const ${outputsVar} = { value: ${inputsVar}["value"] };`);
    return lines;
  }

  private emitEvent(
    node: LogicNode,
    inputsVar: string,
    outputsVar: string,
    graph: NodeGraph
  ): string[] {
    const staticEventName = this.getStaticInputValue(node, 'eventName', graph);
    const eventNameExpression =
      typeof staticEventName === 'string'
        ? this.toSingleQuotedLiteral(staticEventName)
        : `String(${inputsVar}["eventName"])`;

    return [
      `  if (${inputsVar}["trigger"]) {`,
      `    emit(${eventNameExpression}, ${inputsVar}["payload"]);`,
      '  }',
      `  const ${outputsVar} = {};`,
    ];
  }

  private buildInputExpressions(node: LogicNode, graph: NodeGraph): Record<string, string> {
    const expressions: Record<string, string> = {};

    for (const port of this.getInputPorts(node)) {
      expressions[port.name] = this.defaultInputExpression(node, port);
    }

    for (const connection of this.getConnectionsTo(graph, node.id)) {
      const fallback = expressions[connection.toPort] ?? 'undefined';
      const sourceOutputs = `__nodeOutputs[${this.toLiteral(connection.fromNode)}]`;
      expressions[connection.toPort] =
        `(${sourceOutputs} && ${this.toLiteral(connection.fromPort)} in ${sourceOutputs} ? ` +
        `${sourceOutputs}[${this.toLiteral(connection.fromPort)}] : ${fallback})`;
    }

    return expressions;
  }

  private defaultInputExpression(node: LogicNode, port: PortDefinition): string {
    if (Object.prototype.hasOwnProperty.call(node.data, port.name)) {
      return this.toLiteral(node.data[port.name]);
    }
    return this.toLiteral(port.defaultValue ?? null);
  }

  private getStaticInputValue(
    node: LogicNode,
    portName: string,
    graph: NodeGraph
  ): unknown | undefined {
    const hasIncoming = this.getConnectionsTo(graph, node.id).some(
      (conn) => conn.toPort === portName
    );
    if (hasIncoming) return undefined;

    if (Object.prototype.hasOwnProperty.call(node.data, portName)) {
      return node.data[portName];
    }

    return this.getInputPorts(node).find((port) => port.name === portName)?.defaultValue;
  }

  private getInputPorts(node: LogicNode): PortDefinition[] {
    const byName = new Map<string, PortDefinition>();

    for (const port of BUILT_IN_NODE_TYPES[node.type]?.inputs ?? []) {
      byName.set(port.name, port);
    }
    for (const port of node.inputs) {
      byName.set(port.name, port);
    }

    return Array.from(byName.values());
  }

  private orderNodeIds(nodeIds: string[], graph: NodeGraph): string[] {
    const requested = new Set(nodeIds);

    try {
      const sorted = graph.topologicalSort?.();
      if (Array.isArray(sorted)) {
        return sorted.filter((nodeId) => requested.has(nodeId));
      }
    } catch {
      // Keep compilation available for partial editor graphs; validation still
      // catches cyclic executable graphs through NodeGraph.evaluate().
    }

    return nodeIds;
  }

  private getConnectionsTo(graph: NodeGraph, nodeId: string): LogicConnection[] {
    if (typeof graph.getConnectionsTo === 'function') {
      return graph.getConnectionsTo(nodeId);
    }
    return graph.getConnections().filter((conn) => conn.toNode === nodeId);
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
    const port = this.getInputPorts(node).find((p) => p.name === portName);
    return port?.defaultValue ?? null;
  }

  private variableName(prefix: string, id: string): string {
    return `${prefix}_${id.replace(/[^a-zA-Z0-9_$]/g, '_')}`;
  }

  private propertySuffix(name: string): string {
    return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name) ? `.${name}` : `[${this.toLiteral(name)}]`;
  }

  private toLiteral(value: unknown): string {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? 'undefined' : serialized;
  }

  private toSingleQuotedLiteral(value: string): string {
    return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  }
}
