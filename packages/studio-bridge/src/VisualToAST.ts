/**
 * @holoscript/studio-bridge - Visual to AST Translator
 *
 * Translates a visual node graph (from @holoscript/visual) into HoloScript AST nodes
 * and generated code. This is the "forward" direction of the bridge: from the visual
 * editor representation to the compiler-ready AST.
 *
 * Translation Strategy:
 * 1. Topologically sort the graph (events first, then actions, then data)
 * 2. Map each visual node to its AST equivalent using translation rules
 * 3. Resolve edge connections into AST relationships (handlers, arguments, flow)
 * 4. Generate HoloScript code from the assembled AST
 * 5. Produce bridge mappings and source maps for round-trip fidelity
 */

import type {
  ASTNode,
  OrbNode,
  HoloNode,
  HoloEdge,
  VisualGraph,
  HoloNodeData,
  VisualToASTResult,
  VisualToASTOptions,
  BridgeMapping,
  BridgeDiagnostic,
  BridgeSourceMap,
  SourceMapEntry,
  SourceLocation,
  NodeTranslationRule,
} from './types';

// ============================================================================
// Default Options
// ============================================================================

const DEFAULT_OPTIONS: VisualToASTOptions = {
  format: 'hsplus',
  objectName: 'generatedObject',
  includeComments: true,
  indent: '  ',
  generateSourceMap: true,
  validate: true,
};

// ============================================================================
// Translation Rule Registry
// ============================================================================

/**
 * Built-in translation rules mapping visual node types to AST strategies
 */
const TRANSLATION_RULES: NodeTranslationRule[] = [
  // Event nodes -> event handlers in AST
  {
    visualType: 'on_click',
    astType: 'event-handler',
    strategy: 'event-handler',
    category: 'event',
  },
  {
    visualType: 'on_hover',
    astType: 'event-handler',
    strategy: 'event-handler',
    category: 'event',
  },
  { visualType: 'on_grab', astType: 'event-handler', strategy: 'event-handler', category: 'event' },
  { visualType: 'on_tick', astType: 'event-handler', strategy: 'event-handler', category: 'event' },
  {
    visualType: 'on_timer',
    astType: 'event-handler',
    strategy: 'event-handler',
    category: 'event',
  },
  {
    visualType: 'on_collision',
    astType: 'event-handler',
    strategy: 'event-handler',
    category: 'event',
  },
  {
    visualType: 'on_trigger',
    astType: 'event-handler',
    strategy: 'event-handler',
    category: 'event',
  },

  // Action nodes -> action statements in AST
  { visualType: 'play_sound', astType: 'action', strategy: 'action', category: 'action' },
  { visualType: 'play_animation', astType: 'action', strategy: 'action', category: 'action' },
  { visualType: 'set_property', astType: 'action', strategy: 'action', category: 'action' },
  { visualType: 'toggle', astType: 'action', strategy: 'action', category: 'action' },
  { visualType: 'spawn', astType: 'action', strategy: 'action', category: 'action' },
  { visualType: 'destroy', astType: 'action', strategy: 'action', category: 'action' },

  // Logic nodes -> control flow in AST
  { visualType: 'if_else', astType: 'gate', strategy: 'logic-branch', category: 'logic' },
  { visualType: 'switch', astType: 'gate', strategy: 'logic-branch', category: 'logic' },
  { visualType: 'and', astType: 'expression', strategy: 'logic-branch', category: 'logic' },
  { visualType: 'or', astType: 'expression', strategy: 'logic-branch', category: 'logic' },
  { visualType: 'not', astType: 'expression', strategy: 'logic-branch', category: 'logic' },
  { visualType: 'compare', astType: 'expression', strategy: 'logic-branch', category: 'logic' },
  { visualType: 'math', astType: 'expression', strategy: 'logic-branch', category: 'logic' },

  // Data nodes -> data declarations / expressions in AST
  { visualType: 'get_property', astType: 'expression', strategy: 'data-source', category: 'data' },
  { visualType: 'constant', astType: 'literal', strategy: 'data-source', category: 'data' },
  { visualType: 'random', astType: 'expression', strategy: 'data-source', category: 'data' },
  { visualType: 'interpolate', astType: 'expression', strategy: 'data-source', category: 'data' },
  { visualType: 'this', astType: 'reference', strategy: 'data-source', category: 'data' },
  { visualType: 'vector3', astType: 'expression', strategy: 'data-source', category: 'data' },
];

const RULE_MAP = new Map<string, NodeTranslationRule>(
  TRANSLATION_RULES.map((rule) => [rule.visualType, rule])
);

// ============================================================================
// Node Context (internal)
// ============================================================================

interface TranslationContext {
  node: HoloNode;
  data: HoloNodeData;
  rule: NodeTranslationRule | undefined;
  incomingEdges: HoloEdge[];
  outgoingEdges: HoloEdge[];
  astNodes: ASTNode[];
  codeLines: string[];
  sourceLocation?: SourceLocation;
  processed: boolean;
}

// ============================================================================
// Visual to AST Translator
// ============================================================================

export class VisualToAST {
  private options: VisualToASTOptions;
  private contexts: Map<string, TranslationContext> = new Map();
  private mappings: BridgeMapping[] = [];
  private diagnostics: BridgeDiagnostic[] = [];
  private sourceMapEntries: SourceMapEntry[] = [];
  private currentLine = 1;
  private customRules: Map<string, NodeTranslationRule> = new Map();

  constructor(options: Partial<VisualToASTOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Register a custom translation rule for a visual node type
   */
  public registerRule(rule: NodeTranslationRule): void {
    this.customRules.set(rule.visualType, rule);
  }

  /**
   * Translate a visual graph to AST and generated code
   */
  public translate(graph: VisualGraph): VisualToASTResult {
    this.reset();

    // Phase 1: Build translation contexts for all nodes
    this.buildContexts(graph);

    // Phase 2: Validate the graph (if enabled)
    if (this.options.validate) {
      this.validateGraph(graph);
    }

    // Phase 3: Translate nodes to AST
    const astNodes = this.translateNodes(graph);

    // Phase 4: Generate code
    const code = this.generateCode(graph, astNodes);

    // Phase 5: Build source map (if enabled)
    const sourceMap = this.options.generateSourceMap ? this.buildSourceMap() : undefined;

    return {
      ast: astNodes,
      code,
      format: this.options.format,
      mappings: this.mappings,
      diagnostics: this.diagnostics,
      sourceMap,
    };
  }

  /**
   * Get the translation rule for a visual node type
   */
  public getRule(visualType: string): NodeTranslationRule | undefined {
    return this.customRules.get(visualType) ?? RULE_MAP.get(visualType);
  }

  // ==========================================================================
  // Private: Context Building
  // ==========================================================================

  private reset(): void {
    this.contexts.clear();
    this.mappings = [];
    this.diagnostics = [];
    this.sourceMapEntries = [];
    this.currentLine = 1;
  }

  private buildContexts(graph: VisualGraph): void {
    for (const node of graph.nodes) {
      const rule = this.getRule(node.data.type);
      this.contexts.set(node.id, {
        node,
        data: node.data,
        rule,
        incomingEdges: graph.edges.filter((e) => e.target === node.id),
        outgoingEdges: graph.edges.filter((e) => e.source === node.id),
        astNodes: [],
        codeLines: [],
        processed: false,
      });
    }
  }

  // ==========================================================================
  // Private: Validation
  // ==========================================================================

  private validateGraph(graph: VisualGraph): void {
    // Check for event nodes
    const eventNodes = graph.nodes.filter((n) => n.data.category === 'event');
    if (eventNodes.length === 0) {
      this.diagnostics.push({
        severity: 'warning',
        message: 'No event nodes found. Generated code will have no behavior triggers.',
        code: 'BRIDGE_NO_EVENTS',
      });
    }

    // Check for unknown node types
    for (const node of graph.nodes) {
      const rule = this.getRule(node.data.type);
      if (!rule) {
        this.diagnostics.push({
          severity: 'warning',
          message: `Unknown visual node type: "${node.data.type}". Node will be translated as a comment.`,
          visualNodeId: node.id,
          code: 'BRIDGE_UNKNOWN_TYPE',
        });
      }
    }

    // Check for disconnected action nodes
    for (const node of graph.nodes) {
      if (node.data.category !== 'event' && node.data.category !== 'data') {
        const ctx = this.contexts.get(node.id);
        if (ctx && ctx.incomingEdges.length === 0) {
          this.diagnostics.push({
            severity: 'warning',
            message: `Node "${node.data.label}" has no incoming connections and may be unreachable.`,
            visualNodeId: node.id,
            code: 'BRIDGE_DISCONNECTED',
            suggestion: 'Connect this node to an event or another action node.',
          });
        }
      }
    }

    // Check for cycles in flow connections
    this.detectCycles(graph);
  }

  private detectCycles(graph: VisualGraph): void {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (nodeId: string): boolean => {
      visited.add(nodeId);
      recursionStack.add(nodeId);

      const ctx = this.contexts.get(nodeId);
      if (!ctx) return false;

      for (const edge of ctx.outgoingEdges) {
        if (!visited.has(edge.target)) {
          if (dfs(edge.target)) return true;
        } else if (recursionStack.has(edge.target)) {
          this.diagnostics.push({
            severity: 'error',
            message: `Cycle detected in flow graph involving node "${ctx.data.label}".`,
            visualNodeId: nodeId,
            code: 'BRIDGE_CYCLE',
            suggestion: 'Remove the backward edge to break the cycle.',
          });
          return true;
        }
      }

      recursionStack.delete(nodeId);
      return false;
    };

    for (const node of graph.nodes) {
      if (!visited.has(node.id)) {
        dfs(node.id);
      }
    }
  }

  // ==========================================================================
  // Private: AST Translation
  // ==========================================================================

  private translateNodes(graph: VisualGraph): ASTNode[] {
    const astNodes: ASTNode[] = [];

    // Collect traits from the graph
    const traits = this.collectTraits(graph);

    // Build the root OrbNode
    const orbNode: OrbNode = {
      type: 'orb',
      name: this.options.objectName,
      properties: this.collectProperties(graph),
      methods: [],
      children: [],
      directives: traits.map((trait) => ({
        type: 'trait' as const,
        name: trait,
        config: {},
      })),
    };

    // Translate event handlers
    const eventNodes = this.getNodesByCategory(graph, 'event');
    for (const eventNode of eventNodes) {
      const handlerAST = this.translateEventHandler(eventNode, graph);
      if (handlerAST) {
        orbNode.children = orbNode.children || [];
        orbNode.children.push(handlerAST);

        // Create mapping
        this.mappings.push({
          id: `map_${eventNode.id}`,
          visualNodeId: eventNode.id,
          astPath: `${this.options.objectName}.handlers.${eventNode.data.type}`,
          relationship: 'direct',
        });
      }
    }

    astNodes.push(orbNode);

    // Add structural mapping for the orb itself
    this.mappings.push({
      id: 'map_root',
      visualNodeId: '__root__',
      astPath: this.options.objectName,
      relationship: 'structural',
    });

    return astNodes;
  }

  private collectTraits(graph: VisualGraph): string[] {
    const traits = new Set<string>();

    for (const node of graph.nodes) {
      switch (node.data.type) {
        case 'on_click':
          traits.add('clickable');
          break;
        case 'on_hover':
          traits.add('hoverable');
          break;
        case 'on_grab':
          traits.add('grabbable');
          break;
        case 'on_collision':
        case 'on_trigger':
          traits.add('collidable');
          break;
        case 'play_animation':
          traits.add('animated');
          break;
      }
    }

    return Array.from(traits);
  }

  private collectProperties(graph: VisualGraph): Record<string, unknown> {
    const props: Record<string, unknown> = {};

    for (const node of graph.nodes) {
      if (node.data.type === 'constant') {
        const value = node.data.properties.value;
        if (value !== undefined && value !== '') {
          props[`const_${node.id.slice(-6)}`] = value;
        }
      }
    }

    return props;
  }

  private getNodesByCategory(graph: VisualGraph, category: string): HoloNode[] {
    return graph.nodes.filter((n) => n.data.category === category);
  }

  private translateEventHandler(eventNode: HoloNode, graph: VisualGraph): ASTNode | null {
    const ctx = this.contexts.get(eventNode.id);
    if (!ctx) return null;

    const handlerName = this.eventTypeToHandlerName(eventNode.data.type);
    const flowOutputPort = this.getEventFlowPort(eventNode.data.type);

    // Build the handler body by following the flow
    const body = this.translateFlow(ctx, flowOutputPort, graph);

    const handlerNode: ASTNode = {
      type: 'event-handler',
      id: eventNode.id,
      directives: [
        {
          type: 'lifecycle',
          hook: handlerName,
          body: body,
        },
      ],
    };

    return handlerNode;
  }

  private translateFlow(
    ctx: TranslationContext,
    outputPort: string,
    graph: VisualGraph
  ): ASTNode[] {
    const body: ASTNode[] = [];

    // Find edges from this output port
    const flowEdges = ctx.outgoingEdges.filter(
      (e) => e.sourceHandle === outputPort || (!e.sourceHandle && outputPort === 'flow')
    );

    for (const edge of flowEdges) {
      const nextCtx = this.contexts.get(edge.target);
      if (!nextCtx || nextCtx.processed) continue;

      nextCtx.processed = true;

      // Translate the action node to AST
      const actionAST = this.translateActionNode(nextCtx, graph);
      if (actionAST) {
        body.push(actionAST);

        // Create mapping
        this.mappings.push({
          id: `map_${nextCtx.node.id}`,
          visualNodeId: nextCtx.node.id,
          astPath: `${this.options.objectName}.handlers.${ctx.data.type}.body[${body.length - 1}]`,
          relationship: 'direct',
        });
      }

      // Continue following the flow
      const continuationAST = this.translateFlow(nextCtx, 'flow', graph);
      body.push(...continuationAST);
    }

    return body;
  }

  private translateActionNode(ctx: TranslationContext, graph: VisualGraph): ASTNode | null {
    const props = ctx.data.properties;
    const rule = ctx.rule;

    if (!rule) {
      return {
        type: 'comment',
        id: ctx.node.id,
      };
    }

    switch (ctx.data.type) {
      case 'play_sound':
        return {
          type: 'action',
          id: ctx.node.id,
          directives: [
            {
              type: 'trait',
              name: 'audio',
              config: {
                action: 'play',
                url: props.url || 'sound.mp3',
                volume: props.volume ?? 1,
                loop: props.loop ?? false,
              },
            },
          ],
        };

      case 'play_animation':
        return {
          type: 'action',
          id: ctx.node.id,
          directives: [
            {
              type: 'trait',
              name: 'animation',
              config: {
                action: 'play',
                animation: props.animation || 'default',
                duration: props.duration || 1000,
                loop: props.loop ?? false,
              },
            },
          ],
        };

      case 'set_property': {
        const value = this.resolveInputValue(ctx, 'value', graph);
        return {
          type: 'assignment',
          id: ctx.node.id,
          directives: [
            {
              type: 'state',
              body: {
                property: props.property || 'color',
                value,
              },
            },
          ],
        };
      }

      case 'toggle':
        return {
          type: 'assignment',
          id: ctx.node.id,
          directives: [
            {
              type: 'state',
              body: {
                property: props.property || 'visible',
                toggle: true,
              },
            },
          ],
        };

      case 'spawn':
        return {
          type: 'action',
          id: ctx.node.id,
          directives: [
            {
              type: 'trait',
              name: 'spawn',
              config: {
                template: props.template || 'default',
              },
            },
          ],
        };

      case 'destroy':
        return {
          type: 'action',
          id: ctx.node.id,
        };

      case 'if_else': {
        const condition = this.resolveInputValue(ctx, 'condition', graph);
        // Follow true and false branches
        const trueBranch = this.translateFlow(ctx, 'true', graph);
        const falseBranch = this.translateFlow(ctx, 'false', graph);

        return {
          type: 'gate',
          id: ctx.node.id,
          directives: [
            {
              type: 'state',
              body: {
                condition,
                truePath: trueBranch,
                falsePath: falseBranch,
              },
            },
          ],
        };
      }

      default:
        return {
          type: rule.astType,
          id: ctx.node.id,
        };
    }
  }

  private resolveInputValue(ctx: TranslationContext, portId: string, graph: VisualGraph): unknown {
    const inputEdge = ctx.incomingEdges.find(
      (e) => e.targetHandle === portId || (!e.targetHandle && portId === 'value')
    );

    if (!inputEdge) {
      // Use property value if no connection
      return ctx.data.properties[portId];
    }

    // Find the source node
    const sourceCtx = this.contexts.get(inputEdge.source);
    if (!sourceCtx) return null;

    return this.translateDataNode(sourceCtx, inputEdge.sourceHandle || 'value', graph);
  }

  private translateDataNode(
    ctx: TranslationContext,
    _outputPort: string,
    graph: VisualGraph
  ): unknown {
    const props = ctx.data.properties;

    switch (ctx.data.type) {
      case 'constant':
        return props.value;

      case 'this':
        return { __ref: 'this' };

      case 'get_property':
        return { __ref: `this.${props.property || 'position'}` };

      case 'random':
        return { __fn: 'random', args: [props.min ?? 0, props.max ?? 1] };

      case 'interpolate':
        return {
          __fn: 'lerp',
          args: [
            this.resolveInputValue(ctx, 'from', graph),
            this.resolveInputValue(ctx, 'to', graph),
            this.resolveInputValue(ctx, 't', graph),
          ],
        };

      case 'vector3':
        return [props.x ?? 0, props.y ?? 0, props.z ?? 0];

      case 'math': {
        const a = this.resolveInputValue(ctx, 'a', graph);
        const b = this.resolveInputValue(ctx, 'b', graph);
        return { __op: props.operator || '+', left: a, right: b };
      }

      case 'compare': {
        const left = this.resolveInputValue(ctx, 'a', graph);
        const right = this.resolveInputValue(ctx, 'b', graph);
        return { __op: props.operator || '==', left, right };
      }

      case 'and': {
        const a = this.resolveInputValue(ctx, 'a', graph);
        const b = this.resolveInputValue(ctx, 'b', graph);
        return { __op: '&&', left: a, right: b };
      }

      case 'or': {
        const a = this.resolveInputValue(ctx, 'a', graph);
        const b = this.resolveInputValue(ctx, 'b', graph);
        return { __op: '||', left: a, right: b };
      }

      case 'not':
        return { __op: '!', operand: this.resolveInputValue(ctx, 'value', graph) };

      default:
        return null;
    }
  }

  // ==========================================================================
  // Private: Code Generation
  // ==========================================================================

  private generateCode(graph: VisualGraph, astNodes: ASTNode[]): string {
    switch (this.options.format) {
      case 'holo':
        return this.generateHoloCode(graph, astNodes);
      case 'hs':
        return this.generateHsCode(graph, astNodes);
      case 'hsplus':
      default:
        return this.generateHsPlusCode(graph, astNodes);
    }
  }

  private generateHsPlusCode(graph: VisualGraph, _astNodes: ASTNode[]): string {
    const lines: string[] = [];
    const i = this.options.indent;

    if (this.options.includeComments) {
      this.emitLine(lines, `// Generated by @holoscript/studio-bridge`);
      this.emitLine(lines, `// Source: visual graph "${graph.metadata.name}"`);
      this.emitLine(lines, `// Date: ${new Date().toISOString()}`);
      this.emitLine(lines, '');
    }

    // Generate orb declaration
    this.emitLine(lines, `orb ${this.options.objectName} {`);

    // Traits
    const traits = this.collectTraits(graph);
    for (const trait of traits) {
      this.emitLine(lines, `${i}@${trait}`);
    }
    if (traits.length > 0) {
      this.emitLine(lines, '');
    }

    // State from data nodes
    const state = this.collectProperties(graph);
    for (const [name, value] of Object.entries(state)) {
      this.emitLine(lines, `${i}${name}: ${this.formatValue(value)}`);
    }
    if (Object.keys(state).length > 0) {
      this.emitLine(lines, '');
    }

    // Event handlers
    const eventNodes = this.getNodesByCategory(graph, 'event');
    for (const eventNode of eventNodes) {
      const handlerLines = this.generateEventHandlerCode(eventNode, graph, 1);
      for (const line of handlerLines) {
        this.emitLine(lines, `${i}${line}`);
      }
      this.emitLine(lines, '');
    }

    this.emitLine(lines, '}');

    return lines.join('\n');
  }

  private generateHsCode(graph: VisualGraph, _astNodes: ASTNode[]): string {
    const lines: string[] = [];
    const i = this.options.indent;

    if (this.options.includeComments) {
      this.emitLine(lines, `# Generated by @holoscript/studio-bridge`);
      this.emitLine(lines, `# Source: visual graph "${graph.metadata.name}"`);
      this.emitLine(lines, '');
    }

    this.emitLine(lines, `orb ${this.options.objectName} {`);

    const state = this.collectProperties(graph);
    for (const [name, value] of Object.entries(state)) {
      this.emitLine(lines, `${i}${name}: ${this.formatValue(value)}`);
    }
    if (Object.keys(state).length > 0) {
      this.emitLine(lines, '');
    }

    const eventNodes = this.getNodesByCategory(graph, 'event');
    for (const eventNode of eventNodes) {
      const handlerLines = this.generateEventHandlerCode(eventNode, graph, 1);
      for (const line of handlerLines) {
        this.emitLine(lines, `${i}${line}`);
      }
      this.emitLine(lines, '');
    }

    this.emitLine(lines, '}');

    return lines.join('\n');
  }

  private generateHoloCode(graph: VisualGraph, _astNodes: ASTNode[]): string {
    const lines: string[] = [];
    const i = this.options.indent;

    if (this.options.includeComments) {
      this.emitLine(lines, `// Generated by @holoscript/studio-bridge`);
      this.emitLine(lines, '');
    }

    this.emitLine(lines, `composition "${graph.metadata.name}" {`);

    // Environment block
    this.emitLine(lines, `${i}environment {`);
    this.emitLine(lines, `${i}${i}skybox: "default"`);
    this.emitLine(lines, `${i}}`);
    this.emitLine(lines, '');

    // Object block
    this.emitLine(lines, `${i}object "${this.options.objectName}" {`);

    const traits = this.collectTraits(graph);
    for (const trait of traits) {
      this.emitLine(lines, `${i}${i}@${trait}`);
    }

    const state = this.collectProperties(graph);
    for (const [name, value] of Object.entries(state)) {
      this.emitLine(lines, `${i}${i}${name}: ${this.formatValue(value)}`);
    }

    this.emitLine(lines, `${i}}`);
    this.emitLine(lines, '');

    // Logic block
    this.emitLine(lines, `${i}logic {`);

    const eventNodes = this.getNodesByCategory(graph, 'event');
    for (const eventNode of eventNodes) {
      const handlerLines = this.generateEventHandlerCode(eventNode, graph, 2);
      for (const line of handlerLines) {
        this.emitLine(lines, `${i}${i}${line}`);
      }
      this.emitLine(lines, '');
    }

    this.emitLine(lines, `${i}}`);
    this.emitLine(lines, '}');

    return lines.join('\n');
  }

  private generateEventHandlerCode(
    eventNode: HoloNode,
    graph: VisualGraph,
    depth: number
  ): string[] {
    const lines: string[] = [];
    const handlerName = this.eventTypeToHandlerName(eventNode.data.type);
    const flowPort = this.getEventFlowPort(eventNode.data.type);

    // Record source map entry
    if (this.options.generateSourceMap) {
      this.sourceMapEntries.push({
        generated: { line: this.currentLine, column: 0 },
        visualNodeId: eventNode.id,
        visualNodeType: eventNode.data.type,
      });
    }

    lines.push(`${handlerName}: {`);

    // Follow flow from event
    const ctx = this.contexts.get(eventNode.id);
    if (ctx) {
      const actionLines = this.generateFlowCode(ctx, flowPort, graph, depth + 1);
      lines.push(...actionLines);
    }

    lines.push('}');

    return lines;
  }

  private generateFlowCode(
    ctx: TranslationContext,
    outputPort: string,
    graph: VisualGraph,
    depth: number
  ): string[] {
    const lines: string[] = [];
    const indent = this.options.indent.repeat(depth);

    const flowEdges = ctx.outgoingEdges.filter(
      (e) => e.sourceHandle === outputPort || (!e.sourceHandle && outputPort === 'flow')
    );

    for (const edge of flowEdges) {
      const nextCtx = this.contexts.get(edge.target);
      if (!nextCtx) continue;

      // Record source map entry
      if (this.options.generateSourceMap) {
        this.sourceMapEntries.push({
          generated: { line: this.currentLine + lines.length, column: 0 },
          visualNodeId: nextCtx.node.id,
          visualNodeType: nextCtx.data.type,
        });
      }

      const actionCode = this.generateActionCode(nextCtx, graph);
      lines.push(`${indent}${actionCode}`);

      // Continue following the flow
      const nextFlowCode = this.generateFlowCode(nextCtx, 'flow', graph, depth);
      lines.push(...nextFlowCode);
    }

    return lines;
  }

  private generateActionCode(ctx: TranslationContext, graph: VisualGraph): string {
    const props = ctx.data.properties;

    switch (ctx.data.type) {
      case 'play_sound':
        return `audio.play("${props.url || 'sound.mp3'}")`;

      case 'play_animation':
        return `animation.play("${props.animation || 'default'}", { duration: ${props.duration || 1000} })`;

      case 'set_property': {
        const value = this.resolveAndFormatInputValue(ctx, 'value', graph);
        return `this.${props.property || 'color'} = ${value}`;
      }

      case 'toggle':
        return `this.${props.property || 'visible'} = !this.${props.property || 'visible'}`;

      case 'spawn':
        return `scene.spawn("${props.template || 'default'}")`;

      case 'destroy':
        return `this.destroy()`;

      case 'if_else':
        return `// if-else branch`;

      default:
        return `// ${ctx.data.label}`;
    }
  }

  private resolveAndFormatInputValue(
    ctx: TranslationContext,
    portId: string,
    graph: VisualGraph
  ): string {
    const inputEdge = ctx.incomingEdges.find(
      (e) => e.targetHandle === portId || (!e.targetHandle && portId === 'value')
    );

    if (!inputEdge) {
      return this.formatValue(ctx.data.properties[portId]);
    }

    const sourceCtx = this.contexts.get(inputEdge.source);
    if (!sourceCtx) return 'null';

    return this.generateDataNodeExpression(sourceCtx, inputEdge.sourceHandle || 'value', graph);
  }

  private generateDataNodeExpression(
    ctx: TranslationContext,
    _outputPort: string,
    graph: VisualGraph
  ): string {
    const props = ctx.data.properties;

    switch (ctx.data.type) {
      case 'constant':
        return this.formatValue(props.value);

      case 'this':
        return 'this';

      case 'get_property':
        return `this.${props.property || 'position'}`;

      case 'random':
        return `random(${props.min ?? 0}, ${props.max ?? 1})`;

      case 'interpolate':
        return `lerp(${this.resolveAndFormatInputValue(ctx, 'from', graph)}, ${this.resolveAndFormatInputValue(ctx, 'to', graph)}, ${this.resolveAndFormatInputValue(ctx, 't', graph)})`;

      case 'vector3':
        return `[${props.x ?? 0}, ${props.y ?? 0}, ${props.z ?? 0}]`;

      case 'math': {
        const a = this.resolveAndFormatInputValue(ctx, 'a', graph);
        const b = this.resolveAndFormatInputValue(ctx, 'b', graph);
        return `(${a} ${props.operator || '+'} ${b})`;
      }

      case 'compare': {
        const left = this.resolveAndFormatInputValue(ctx, 'a', graph);
        const right = this.resolveAndFormatInputValue(ctx, 'b', graph);
        return `(${left} ${props.operator || '=='} ${right})`;
      }

      case 'and':
        return `(${this.resolveAndFormatInputValue(ctx, 'a', graph)} && ${this.resolveAndFormatInputValue(ctx, 'b', graph)})`;

      case 'or':
        return `(${this.resolveAndFormatInputValue(ctx, 'a', graph)} || ${this.resolveAndFormatInputValue(ctx, 'b', graph)})`;

      case 'not':
        return `!${this.resolveAndFormatInputValue(ctx, 'value', graph)}`;

      default:
        return `/* ${ctx.data.label} */`;
    }
  }

  // ==========================================================================
  // Private: Helpers
  // ==========================================================================

  private eventTypeToHandlerName(eventType: string): string {
    const mapping: Record<string, string> = {
      on_click: 'on_click',
      on_hover: 'on_hover_enter',
      on_grab: 'on_grab',
      on_tick: 'on_tick',
      on_timer: 'on_timer',
      on_collision: 'on_collision_enter',
      on_trigger: 'on_trigger_enter',
    };
    return mapping[eventType] || eventType;
  }

  private getEventFlowPort(eventType: string): string {
    const mapping: Record<string, string> = {
      on_click: 'flow',
      on_hover: 'enter',
      on_grab: 'grab',
      on_tick: 'flow',
      on_timer: 'flow',
      on_collision: 'enter',
      on_trigger: 'enter',
    };
    return mapping[eventType] || 'flow';
  }

  private formatValue(value: unknown): string {
    if (value === undefined || value === null) return 'null';
    if (typeof value === 'string') {
      if (value.startsWith('#')) return `"${value}"`;
      if (!isNaN(Number(value))) return value;
      return `"${value}"`;
    }
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') return String(value);
    if (Array.isArray(value)) return `[${value.map((v) => this.formatValue(v)).join(', ')}]`;
    if (typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>)
        .map(([k, v]) => `${k}: ${this.formatValue(v)}`)
        .join(', ');
      return `{ ${entries} }`;
    }
    return String(value);
  }

  private emitLine(lines: string[], line: string): void {
    lines.push(line);
    this.currentLine++;
  }

  private buildSourceMap(): BridgeSourceMap {
    return {
      version: 1,
      file: `${this.options.objectName}.${this.options.format}`,
      entries: this.sourceMapEntries,
    };
  }
}

/**
 * Quick translation function
 */
export function visualToAST(
  graph: VisualGraph,
  options?: Partial<VisualToASTOptions>
): VisualToASTResult {
  const translator = new VisualToAST(options);
  return translator.translate(graph);
}
