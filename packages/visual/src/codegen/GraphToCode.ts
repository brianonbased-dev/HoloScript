/**
 * HoloScript Visual - Graph to Code Converter
 *
 * Converts visual node graphs to HoloScript code (.hs, .hsplus, .holo).
 */

import type { HoloNode, HoloEdge, VisualGraph, CodeGenResult, CodeGenError } from '../types';
import { getNodeDefinition } from '../nodes/nodeRegistry';

/**
 * Code generation options
 */
export interface CodeGenOptions {
  format: 'hs' | 'hsplus' | 'holo';
  objectName: string;
  includeComments: boolean;
  indent: string;
}

/**
 * Default options
 */
const DEFAULT_OPTIONS: CodeGenOptions = {
  format: 'hsplus',
  objectName: 'generatedObject',
  includeComments: true,
  indent: '  ',
};

/**
 * Node execution context during code generation
 */
interface NodeContext {
  node: HoloNode;
  incomingEdges: HoloEdge[];
  outgoingEdges: HoloEdge[];
  processed: boolean;
  code: string;
}

/**
 * Graph to Code Converter
 */
export class GraphToCode {
  private nodes: Map<string, NodeContext> = new Map();
  private edges: HoloEdge[] = [];
  private errors: CodeGenError[] = [];
  private warnings: string[] = [];
  private options: CodeGenOptions;

  constructor(options: Partial<CodeGenOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Convert a visual graph to HoloScript code
   */
  public convert(graph: VisualGraph): CodeGenResult {
    this.reset();
    this.edges = graph.edges;

    // Build node contexts
    for (const node of graph.nodes) {
      this.nodes.set(node.id, {
        node,
        incomingEdges: graph.edges.filter((e) => e.target === node.id),
        outgoingEdges: graph.edges.filter((e) => e.source === node.id),
        processed: false,
        code: '',
      });
    }

    // Validate graph
    this.validateGraph();

    if (this.errors.length > 0) {
      return {
        code: '',
        format: this.options.format,
        errors: this.errors,
        warnings: this.warnings,
      };
    }

    // Generate code based on format
    let code: string;
    switch (this.options.format) {
      case 'holo':
        code = this.generateHolo(graph);
        break;
      case 'hs':
        code = this.generateHs(graph);
        break;
      case 'hsplus':
      default:
        code = this.generateHsPlus(graph);
        break;
    }

    return {
      code,
      format: this.options.format,
      errors: this.errors,
      warnings: this.warnings,
    };
  }

  /**
   * Reset internal state
   */
  private reset(): void {
    this.nodes.clear();
    this.edges = [];
    this.errors = [];
    this.warnings = [];
  }

  /**
   * Validate the graph structure
   */
  private validateGraph(): void {
    // Find event nodes (entry points)
    const eventNodes = Array.from(this.nodes.values()).filter(
      (ctx) => ctx.node.data.category === 'event'
    );

    if (eventNodes.length === 0) {
      this.warnings.push(
        'No event nodes found. The generated code will not have any behavior triggers.'
      );
    }

    // Check for disconnected nodes
    for (const [id, ctx] of this.nodes) {
      if (ctx.node.data.category !== 'event' && ctx.incomingEdges.length === 0) {
        this.warnings.push(
          `Node "${ctx.node.data.label}" (${id}) has no incoming connections and may be unreachable.`
        );
      }
    }

    // Check for unknown node types
    for (const [id, ctx] of this.nodes) {
      const def = getNodeDefinition(ctx.node.data.type);
      if (!def) {
        this.errors.push({
          nodeId: id,
          message: `Unknown node type: ${ctx.node.data.type}`,
          severity: 'error',
        });
      }
    }
  }

  /**
   * Generate .hsplus code
   */
  private generateHsPlus(graph: VisualGraph): string {
    const lines: string[] = [];
    const i = this.options.indent;

    if (this.options.includeComments) {
      lines.push(`// Generated from visual graph: ${graph.metadata.name}`);
      lines.push(`// Date: ${new Date().toISOString()}`);
      lines.push('');
    }

    // Generate the main object
    lines.push(`orb ${this.options.objectName} {`);

    // Collect traits from the graph
    const traits = this.collectTraits();
    for (const trait of traits) {
      lines.push(`${i}@${trait}`);
    }

    if (traits.length > 0) {
      lines.push('');
    }

    // Generate state from data nodes
    const state = this.collectState();
    for (const [name, value] of Object.entries(state)) {
      lines.push(`${i}${name}: ${this.formatValue(value)}`);
    }

    if (Object.keys(state).length > 0) {
      lines.push('');
    }

    // Generate event handlers
    const eventNodes = this.getEventNodes();
    for (const eventCtx of eventNodes) {
      const handlerCode = this.generateEventHandler(eventCtx);
      lines.push(...handlerCode.map((line) => `${i}${line}`));
      lines.push('');
    }

    lines.push('}');

    return lines.join('\n');
  }

  /**
   * Generate .hs code (simpler format)
   */
  private generateHs(graph: VisualGraph): string {
    const lines: string[] = [];
    const i = this.options.indent;

    if (this.options.includeComments) {
      lines.push(`# Generated from visual graph: ${graph.metadata.name}`);
      lines.push('');
    }

    lines.push(`orb ${this.options.objectName} {`);

    // Generate properties
    const state = this.collectState();
    for (const [name, value] of Object.entries(state)) {
      lines.push(`${i}${name}: ${this.formatValue(value)}`);
    }

    if (Object.keys(state).length > 0) {
      lines.push('');
    }

    // Generate event handlers (simplified)
    const eventNodes = this.getEventNodes();
    for (const eventCtx of eventNodes) {
      const handlerCode = this.generateEventHandler(eventCtx);
      lines.push(...handlerCode.map((line) => `${i}${line}`));
      lines.push('');
    }

    lines.push('}');

    return lines.join('\n');
  }

  /**
   * Generate .holo code
   */
  private generateHolo(graph: VisualGraph): string {
    const lines: string[] = [];
    const i = this.options.indent;

    lines.push(`composition "${graph.metadata.name}" {`);

    // Environment (placeholder)
    lines.push(`${i}environment {`);
    lines.push(`${i}${i}skybox: "default"`);
    lines.push(`${i}}`);
    lines.push('');

    // Generate the object
    lines.push(`${i}object "${this.options.objectName}" {`);

    // Traits and state
    const traits = this.collectTraits();
    const state = this.collectState();

    for (const trait of traits) {
      lines.push(`${i}${i}@${trait}`);
    }

    for (const [name, value] of Object.entries(state)) {
      lines.push(`${i}${i}${name}: ${this.formatValue(value)}`);
    }

    lines.push(`${i}}`);
    lines.push('');

    // Generate logic block
    lines.push(`${i}logic {`);

    const eventNodes = this.getEventNodes();
    for (const eventCtx of eventNodes) {
      const handlerCode = this.generateEventHandler(eventCtx);
      lines.push(...handlerCode.map((line) => `${i}${i}${line}`));
      lines.push('');
    }

    lines.push(`${i}}`);
    lines.push('}');

    return lines.join('\n');
  }

  /**
   * Collect traits based on the graph structure
   */
  private collectTraits(): string[] {
    const traits = new Set<string>();

    for (const [, ctx] of this.nodes) {
      switch (ctx.node.data.type) {
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
          traits.add('collidable');
          break;
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

  /**
   * Collect state from constant and data nodes
   */
  private collectState(): Record<string, any> {
    const state: Record<string, any> = {};

    for (const [, ctx] of this.nodes) {
      if (ctx.node.data.type === 'constant') {
        const props = ctx.node.data.properties;
        if (props.value !== undefined && props.value !== '') {
          // Use a generated name or property ID
          state[`const_${ctx.node.id.slice(-6)}`] = props.value;
        }
      }
    }

    return state;
  }

  /**
   * Get all event nodes (entry points)
   */
  private getEventNodes(): NodeContext[] {
    return Array.from(this.nodes.values()).filter((ctx) => ctx.node.data.category === 'event');
  }

  /**
   * Generate code for an event handler
   */
  private generateEventHandler(eventCtx: NodeContext): string[] {
    const lines: string[] = [];
    const eventType = eventCtx.node.data.type;

    // Map event type to handler name
    const handlerName = this.eventTypeToHandler(eventType);
    const handlerOutput = this.getEventOutput(eventType);

    lines.push(`${handlerName}: {`);

    // Follow the flow from this event
    const actionCode = this.generateFlowCode(eventCtx, handlerOutput, 1);
    lines.push(...actionCode);

    lines.push('}');

    return lines;
  }

  /**
   * Convert event type to handler name
   */
  private eventTypeToHandler(eventType: string): string {
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

  /**
   * Get the flow output port for an event type
   */
  private getEventOutput(eventType: string): string {
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

  /**
   * Generate code following the flow from a node
   */
  private generateFlowCode(ctx: NodeContext, outputPort: string, depth: number): string[] {
    const lines: string[] = [];
    const i = this.options.indent.repeat(depth);

    // Find edges from this output port
    const flowEdges = ctx.outgoingEdges.filter(
      (e) => e.sourceHandle === outputPort || (!e.sourceHandle && outputPort === 'flow')
    );

    for (const edge of flowEdges) {
      const nextCtx = this.nodes.get(edge.target);
      if (!nextCtx) continue;

      // Generate code for this action
      const actionCode = this.generateActionCode(nextCtx);
      lines.push(`${i}${actionCode}`);

      // Continue following the flow
      const nextFlowCode = this.generateFlowCode(nextCtx, 'flow', depth);
      lines.push(...nextFlowCode);
    }

    return lines;
  }

  /**
   * Generate code for an action node
   */
  private generateActionCode(ctx: NodeContext): string {
    const props = ctx.node.data.properties;

    switch (ctx.node.data.type) {
      case 'play_sound':
        return `audio.play("${props.url || 'sound.mp3'}")`;

      case 'play_animation':
        return `animation.play("${props.animation || 'default'}", { duration: ${props.duration || 1000} })`;

      case 'set_property':
        const value = this.resolveInputValue(ctx, 'value');
        return `this.${props.property || 'color'} = ${value}`;

      case 'toggle':
        return `this.${props.property || 'visible'} = !this.${props.property || 'visible'}`;

      case 'spawn':
        return `scene.spawn("${props.template || 'default'}")`;

      case 'destroy':
        return `this.destroy()`;

      case 'if_else':
        // This is handled specially in flow generation
        return `// if-else branch`;

      default:
        return `// ${ctx.node.data.label}`;
    }
  }

  /**
   * Resolve the value for an input port
   */
  private resolveInputValue(ctx: NodeContext, portId: string): string {
    const inputEdge = ctx.incomingEdges.find(
      (e) => e.targetHandle === portId || (!e.targetHandle && portId === 'value')
    );

    if (!inputEdge) {
      // Use property value if no connection
      const prop = ctx.node.data.properties[portId];
      return this.formatValue(prop);
    }

    // Find the source node
    const sourceCtx = this.nodes.get(inputEdge.source);
    if (!sourceCtx) {
      return 'null';
    }

    // Generate code to get the value from the source
    return this.generateDataNodeCode(sourceCtx, inputEdge.sourceHandle || 'value');
  }

  /**
   * Generate code for a data node
   */
  private generateDataNodeCode(ctx: NodeContext, _outputPort: string): string {
    const props = ctx.node.data.properties;

    switch (ctx.node.data.type) {
      case 'constant':
        return this.formatValue(props.value);

      case 'this':
        return 'this';

      case 'get_property':
        return `this.${props.property || 'position'}`;

      case 'random':
        const min = props.min ?? 0;
        const max = props.max ?? 1;
        return `random(${min}, ${max})`;

      case 'interpolate':
        return `lerp(${this.resolveInputValue(ctx, 'from')}, ${this.resolveInputValue(ctx, 'to')}, ${this.resolveInputValue(ctx, 't')})`;

      case 'vector3': {
        const arr = Array.isArray(props) ? props : null;
        const vx = arr ? arr[0] : (props.x ?? 0);
        const vy = arr ? arr[1] : (props.y ?? 0);
        const vz = arr ? arr[2] : (props.z ?? 0);
        return `[${vx}, ${vy}, ${vz}]`;
      }

      case 'math': {
        const a = this.resolveInputValue(ctx, 'a');
        const b = this.resolveInputValue(ctx, 'b');
        const op = props.operator || '+';
        return `(${a} ${op} ${b})`;
      }

            case 'compare':
        const left = this.resolveInputValue(ctx, 'a');
        const right = this.resolveInputValue(ctx, 'b');
        const cmpOp = props.operator || '==';
        return `(${left} ${cmpOp} ${right})`;

      case 'and':
        return `(${this.resolveInputValue(ctx, 'a')} && ${this.resolveInputValue(ctx, 'b')})`;

      case 'or':
        return `(${this.resolveInputValue(ctx, 'a')} || ${this.resolveInputValue(ctx, 'b')})`;

      case 'not':
        return `!${this.resolveInputValue(ctx, 'value')}`;

      default:
        return `/* ${ctx.node.data.label} */`;
    }
  }

  /**
   * Format a value for code output
   */
  private formatValue(value: unknown): string {
    if (value === undefined || value === null) {
      return 'null';
    }
    if (typeof value === 'string') {
      // Check if it's a color
      if (value.startsWith('#')) {
        return `"${value}"`;
      }
      // Check if it's a number as string
      if (!isNaN(Number(value))) {
        return value;
      }
      return `"${value}"`;
    }
    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }
    if (typeof value === 'number') {
      return String(value);
    }
    if (Array.isArray(value)) {
      return `[${value.map(this.formatValue.bind(this)).join(', ')}]`;
    }
    if (typeof value === 'object') {
      const entries = Object.entries(value)
        .map(([k, v]) => `${k}: ${this.formatValue(v)}`)
        .join(', ');
      return `{ ${entries} }`;
    }
    return String(value);
  }
}

/**
 * Quick conversion function
 */
export function graphToCode(graph: VisualGraph, options?: Partial<CodeGenOptions>): CodeGenResult {
  const converter = new GraphToCode(options);
  return converter.convert(graph);
}
