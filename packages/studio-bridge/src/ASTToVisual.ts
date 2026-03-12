/**
 * @holoscript/studio-bridge - AST to Visual Translator
 *
 * Translates HoloScript AST nodes (from @holoscript/core) into a visual node graph
 * compatible with @holoscript/visual. This is the "reverse" direction of the bridge:
 * from the compiler/parser AST to the visual editor representation.
 *
 * Translation Strategy:
 * 1. Walk the AST tree, identifying orb definitions, event handlers, and expressions
 * 2. Map each AST node to its visual equivalent using reverse translation rules
 * 3. Generate edges from AST relationships (handler flow, data references)
 * 4. Apply a layout algorithm to position the visual nodes
 * 5. Produce bridge mappings for round-trip fidelity
 */

import type {
  ASTNode,
  OrbNode,
  ASTToVisualResult,
  ASTToVisualOptions,
  BridgeMapping,
  BridgeDiagnostic,
  ASTNodeVisualRule,
  HoloNode,
  HoloEdge,
  VisualGraph,
  HoloNodeData,
  NodeCategory,
} from './types';
import { getBridgeNodeDefinition } from './nodeDefinitions';

// ============================================================================
// Default Options
// ============================================================================

const DEFAULT_OPTIONS: ASTToVisualOptions = {
  layout: 'auto',
  startX: 100,
  startY: 100,
  spacingX: 300,
  spacingY: 150,
  autoConnect: true,
  graphName: 'Imported Graph',
};

// ============================================================================
// AST-to-Visual Rule Registry
// ============================================================================

/**
 * Built-in rules mapping AST patterns to visual node creation
 */
const AST_VISUAL_RULES: ASTNodeVisualRule[] = [
  // Event handlers -> Event nodes
  {
    astTypePattern: 'on_click',
    visualType: 'on_click',
    category: 'event',
  },
  {
    astTypePattern: 'on_hover_enter',
    visualType: 'on_hover',
    category: 'event',
  },
  {
    astTypePattern: 'on_grab',
    visualType: 'on_grab',
    category: 'event',
  },
  {
    astTypePattern: 'on_tick',
    visualType: 'on_tick',
    category: 'event',
  },
  {
    astTypePattern: 'on_timer',
    visualType: 'on_timer',
    category: 'event',
  },
  {
    astTypePattern: 'on_collision_enter',
    visualType: 'on_collision',
    category: 'event',
  },
  {
    astTypePattern: 'on_trigger_enter',
    visualType: 'on_trigger',
    category: 'event',
  },

  // Actions
  {
    astTypePattern: 'audio.play',
    visualType: 'play_sound',
    category: 'action',
  },
  {
    astTypePattern: 'animation.play',
    visualType: 'play_animation',
    category: 'action',
  },
  {
    astTypePattern: 'assignment',
    visualType: 'set_property',
    category: 'action',
  },
  {
    astTypePattern: 'spawn',
    visualType: 'spawn',
    category: 'action',
  },
  {
    astTypePattern: 'destroy',
    visualType: 'destroy',
    category: 'action',
  },

  // Logic
  {
    astTypePattern: 'gate',
    visualType: 'if_else',
    category: 'logic',
  },
  {
    astTypePattern: 'comparison',
    visualType: 'compare',
    category: 'logic',
  },

  // Data
  {
    astTypePattern: 'literal',
    visualType: 'constant',
    category: 'data',
  },
  {
    astTypePattern: 'reference',
    visualType: 'get_property',
    category: 'data',
  },
];

const AST_RULE_MAP = new Map<string, ASTNodeVisualRule>(
  AST_VISUAL_RULES.map((rule) => [rule.astTypePattern, rule])
);

// ============================================================================
// AST to Visual Translator
// ============================================================================

export class ASTToVisual {
  private options: ASTToVisualOptions;
  private nodes: HoloNode[] = [];
  private edges: HoloEdge[] = [];
  private mappings: BridgeMapping[] = [];
  private diagnostics: BridgeDiagnostic[] = [];
  private unmappedNodes: ASTNode[] = [];
  private nodeIdCounter = 0;
  private edgeIdCounter = 0;
  private customRules: Map<string, ASTNodeVisualRule> = new Map();

  constructor(options: Partial<ASTToVisualOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Register a custom AST-to-Visual translation rule
   */
  public registerRule(rule: ASTNodeVisualRule): void {
    this.customRules.set(rule.astTypePattern, rule);
  }

  /**
   * Translate AST nodes to a visual graph
   */
  public translate(astNodes: ASTNode[]): ASTToVisualResult {
    this.reset();

    // Phase 1: Process each top-level AST node
    for (const node of astNodes) {
      this.processASTNode(node, '');
    }

    // Phase 2: Apply layout to position nodes
    this.applyLayout();

    // Phase 3: Build the visual graph
    const graph: VisualGraph = {
      nodes: this.nodes,
      edges: this.edges,
      metadata: {
        name: this.options.graphName,
        description: `Imported from HoloScript AST (${astNodes.length} root nodes)`,
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    };

    return {
      graph,
      mappings: this.mappings,
      diagnostics: this.diagnostics,
      unmappedNodes: this.unmappedNodes,
    };
  }

  /**
   * Translate HoloScript source code to a visual graph.
   * Parses the code using HoloScript patterns and converts to visual nodes.
   */
  public translateFromCode(code: string): ASTToVisualResult {
    const astNodes = this.parseCodeToAST(code);
    return this.translate(astNodes);
  }

  /**
   * Get the visual rule for an AST type
   */
  public getRule(astType: string): ASTNodeVisualRule | undefined {
    return this.customRules.get(astType) ?? AST_RULE_MAP.get(astType);
  }

  // ==========================================================================
  // Private: Reset
  // ==========================================================================

  private reset(): void {
    this.nodes = [];
    this.edges = [];
    this.mappings = [];
    this.diagnostics = [];
    this.unmappedNodes = [];
    this.nodeIdCounter = 0;
    this.edgeIdCounter = 0;
  }

  // ==========================================================================
  // Private: AST Processing
  // ==========================================================================

  private processASTNode(node: ASTNode, parentPath: string): string | null {
    const astPath = parentPath ? `${parentPath}.${node.type}` : node.type;

    // Handle OrbNode (root composition object)
    if (this.isOrbNode(node)) {
      return this.processOrbNode(node as OrbNode, astPath);
    }

    // Handle event handlers
    if (node.type === 'event-handler' && node.directives) {
      return this.processEventHandler(node, astPath);
    }

    // Handle actions
    if (node.type === 'action') {
      return this.processActionNode(node, astPath);
    }

    // Handle assignments
    if (node.type === 'assignment') {
      return this.processAssignmentNode(node, astPath);
    }

    // Handle gate/branching
    if (node.type === 'gate') {
      return this.processGateNode(node, astPath);
    }

    // Try generic rule matching
    const rule = this.getRule(node.type);
    if (rule) {
      return this.processRuleBasedNode(node, rule, astPath);
    }

    // Unmapped node
    this.unmappedNodes.push(node);
    this.diagnostics.push({
      severity: 'info',
      message: `AST node type "${node.type}" has no visual representation.`,
      astPath,
      code: 'BRIDGE_UNMAPPED_AST',
    });

    return null;
  }

  private isOrbNode(node: ASTNode): node is OrbNode {
    return node.type === 'orb' && 'name' in node;
  }

  private processOrbNode(orb: OrbNode, astPath: string): string | null {
    // Process traits from directives
    if (orb.directives) {
      for (const directive of orb.directives) {
        if (directive.type === 'trait') {
          // Traits may imply event nodes (e.g., @clickable -> on_click)
          const eventType = this.traitToEventType(String(directive.name || ''));
          if (eventType) {
            // Event node will be created when we process children/handlers
          }
        }
      }
    }

    // Process children (event handlers, nested objects)
    if (orb.children) {
      let prevNodeId: string | null = null;
      for (const child of orb.children) {
        const childId = this.processASTNode(child, astPath);
        if (childId && prevNodeId && this.options.autoConnect) {
          // Auto-connect sequential event handlers (optional)
        }
        prevNodeId = childId;
      }
    }

    // Process properties as constant data nodes
    if (orb.properties) {
      for (const [key, value] of Object.entries(orb.properties)) {
        if (value !== undefined && value !== null) {
          const nodeId = this.createVisualNode('constant', 'data', {
            label: key,
            properties: { type: typeof value, value },
          });

          this.mappings.push({
            id: `map_${nodeId}`,
            visualNodeId: nodeId,
            astPath: `${astPath}.properties.${key}`,
            relationship: 'direct',
          });
        }
      }
    }

    return null; // Orb is structural, not a single visual node
  }

  private processEventHandler(node: ASTNode, astPath: string): string | null {
    if (!node.directives || node.directives.length === 0) return null;

    const directive = node.directives[0];
    const hookName = String(directive.hook || directive.name || 'unknown');
    const eventType = this.handlerNameToEventType(hookName);

    // Create the event visual node
    const eventNodeId = this.createVisualNode(eventType, 'event', {
      label: this.formatLabel(eventType),
    });

    this.mappings.push({
      id: `map_${eventNodeId}`,
      visualNodeId: eventNodeId,
      astPath,
      relationship: 'direct',
    });

    // Process the handler body (if it contains AST nodes)
    if (Array.isArray(directive.body)) {
      let prevNodeId = eventNodeId;
      for (let i = 0; i < directive.body.length; i++) {
        const bodyNode = directive.body[i] as ASTNode;
        const childId = this.processASTNode(bodyNode, `${astPath}.body[${i}]`);
        if (childId && prevNodeId) {
          this.createEdge(prevNodeId, childId, 'flow', 'flow');
          prevNodeId = childId;
        }
      }
    }

    return eventNodeId;
  }

  private processActionNode(node: ASTNode, astPath: string): string | null {
    if (!node.directives || node.directives.length === 0) {
      // Simple action without directives (e.g., destroy)
      const nodeId = this.createVisualNode('destroy', 'action', {
        label: 'Destroy',
      });

      this.mappings.push({
        id: `map_${nodeId}`,
        visualNodeId: nodeId,
        astPath,
        relationship: 'direct',
      });

      return nodeId;
    }

    const directive = node.directives[0];
    const traitName = String(directive.name || '');
    const config = (directive.config || {}) as Record<string, unknown>;

    // Map directive trait names to visual node types
    let visualType = 'set_property';
    let properties: Record<string, unknown> = {};

    switch (traitName) {
      case 'audio':
        visualType = 'play_sound';
        properties = {
          url: config.url || 'sound.mp3',
          volume: config.volume ?? 1,
          loop: config.loop ?? false,
        };
        break;

      case 'animation':
        visualType = 'play_animation';
        properties = {
          animation: config.animation || 'default',
          duration: config.duration || 1000,
          loop: config.loop ?? false,
        };
        break;

      case 'spawn':
        visualType = 'spawn';
        properties = {
          template: config.template || 'default',
        };
        break;

      default:
        properties = config;
        break;
    }

    const nodeId = this.createVisualNode(visualType, 'action', {
      label: this.formatLabel(visualType),
      properties,
    });

    this.mappings.push({
      id: `map_${nodeId}`,
      visualNodeId: nodeId,
      astPath,
      relationship: 'direct',
    });

    return nodeId;
  }

  private processAssignmentNode(node: ASTNode, astPath: string): string | null {
    const directive = node.directives?.[0];
    const body = (directive?.body || {}) as Record<string, unknown>;

    let visualType = 'set_property';
    const properties: Record<string, unknown> = {
      property: body.property || 'color',
    };

    if (body.toggle) {
      visualType = 'toggle';
    }

    const nodeId = this.createVisualNode(visualType, 'action', {
      label: this.formatLabel(visualType),
      properties,
    });

    this.mappings.push({
      id: `map_${nodeId}`,
      visualNodeId: nodeId,
      astPath,
      relationship: 'direct',
    });

    return nodeId;
  }

  private processGateNode(node: ASTNode, astPath: string): string | null {
    const nodeId = this.createVisualNode('if_else', 'logic', {
      label: 'If/Else',
    });

    this.mappings.push({
      id: `map_${nodeId}`,
      visualNodeId: nodeId,
      astPath,
      relationship: 'direct',
    });

    // Process true and false paths from directives
    const directive = node.directives?.[0];
    if (directive?.body) {
      const bodyObj = directive.body as Record<string, unknown>;
      const { truePath, falsePath } = bodyObj as { truePath?: unknown[]; falsePath?: unknown[] };

      if (Array.isArray(truePath)) {
        let prevNodeId = nodeId;
        for (let i = 0; i < truePath.length; i++) {
          const childId = this.processASTNode(truePath[i] as ASTNode, `${astPath}.truePath[${i}]`);
          if (childId) {
            this.createEdge(prevNodeId, childId, i === 0 ? 'true' : 'flow', 'flow');
            prevNodeId = childId;
          }
        }
      }

      if (Array.isArray(falsePath)) {
        let prevNodeId = nodeId;
        for (let i = 0; i < falsePath.length; i++) {
          const childId = this.processASTNode(falsePath[i] as ASTNode, `${astPath}.falsePath[${i}]`);
          if (childId) {
            this.createEdge(prevNodeId, childId, i === 0 ? 'false' : 'flow', 'flow');
            prevNodeId = childId;
          }
        }
      }
    }

    return nodeId;
  }

  private processRuleBasedNode(node: ASTNode, rule: ASTNodeVisualRule, astPath: string): string | null {
    const nodeId = this.createVisualNode(rule.visualType, rule.category, {
      label: this.formatLabel(rule.visualType),
      properties: rule.defaultProperties || {},
    });

    this.mappings.push({
      id: `map_${nodeId}`,
      visualNodeId: nodeId,
      astPath,
      relationship: 'direct',
    });

    return nodeId;
  }

  // ==========================================================================
  // Private: Node & Edge Creation
  // ==========================================================================

  private createVisualNode(
    type: string,
    category: NodeCategory,
    overrides: {
      label?: string;
      properties?: Record<string, unknown>;
    } = {},
  ): string {
    const id = `bridge_node_${this.nodeIdCounter++}`;
    const definition = getBridgeNodeDefinition(type);

    const nodeData: HoloNodeData = {
      type,
      label: overrides.label || definition?.label || type,
      category,
      properties: {
        ...(definition?.properties?.reduce<Record<string, unknown>>((acc, prop) => {
          acc[prop.id] = prop.default ?? '';
          return acc;
        }, {}) ?? {}),
        ...(overrides.properties || {}),
      },
      inputs: definition?.inputs || [],
      outputs: definition?.outputs || [],
    };

    const node: HoloNode = {
      id,
      type: 'holoNode',
      position: { x: 0, y: 0 }, // Will be set by layout
      data: nodeData,
    };

    this.nodes.push(node);
    return id;
  }

  private createEdge(
    sourceId: string,
    targetId: string,
    sourceHandle: string,
    targetHandle: string,
  ): string {
    const id = `bridge_edge_${this.edgeIdCounter++}`;

    const edge: HoloEdge = {
      id,
      source: sourceId,
      target: targetId,
      sourceHandle,
      targetHandle,
      data: {
        sourcePort: sourceHandle,
        targetPort: targetHandle,
        flowType: 'flow',
      },
    };

    this.edges.push(edge);
    return id;
  }

  // ==========================================================================
  // Private: Layout
  // ==========================================================================

  private applyLayout(): void {
    switch (this.options.layout) {
      case 'grid':
        this.applyGridLayout();
        break;
      case 'tree':
        this.applyTreeLayout();
        break;
      case 'force-directed':
        this.applyForceDirectedLayout();
        break;
      case 'auto':
      default:
        this.applyAutoLayout();
        break;
    }
  }

  private applyAutoLayout(): void {
    // Group nodes by category for clean layout
    const eventNodes = this.nodes.filter((n) => n.data.category === 'event');
    const actionNodes = this.nodes.filter((n) => n.data.category === 'action');
    const logicNodes = this.nodes.filter((n) => n.data.category === 'logic');
    const dataNodes = this.nodes.filter((n) => n.data.category === 'data');

    const currentY = this.options.startY;

    // Events on the left
    this.layoutColumn(eventNodes, this.options.startX, currentY);

    // Actions in the middle
    this.layoutColumn(actionNodes, this.options.startX + this.options.spacingX, currentY);

    // Logic below actions
    this.layoutColumn(
      logicNodes,
      this.options.startX + this.options.spacingX,
      currentY + actionNodes.length * this.options.spacingY + this.options.spacingY,
    );

    // Data on the right
    this.layoutColumn(dataNodes, this.options.startX + this.options.spacingX * 2, currentY);
  }

  private applyGridLayout(): void {
    const columns = Math.ceil(Math.sqrt(this.nodes.length));
    for (let i = 0; i < this.nodes.length; i++) {
      const col = i % columns;
      const row = Math.floor(i / columns);
      this.nodes[i].position = {
        x: this.options.startX + col * this.options.spacingX,
        y: this.options.startY + row * this.options.spacingY,
      };
    }
  }

  private applyTreeLayout(): void {
    // Find root nodes (no incoming edges)
    const rootIds = new Set(this.nodes.map((n) => n.id));
    for (const edge of this.edges) {
      rootIds.delete(edge.target);
    }

    const visited = new Set<string>();
    let globalRow = 0;

    for (const node of this.nodes) {
      if (rootIds.has(node.id) && !visited.has(node.id)) {
        this.layoutTreeNode(node.id, 0, globalRow, visited);
        globalRow += this.countDescendants(node.id, new Set()) + 1;
      }
    }

    // Position any unvisited nodes
    for (const node of this.nodes) {
      if (!visited.has(node.id)) {
        node.position = {
          x: this.options.startX,
          y: this.options.startY + globalRow * this.options.spacingY,
        };
        globalRow++;
        visited.add(node.id);
      }
    }
  }

  private layoutTreeNode(nodeId: string, depth: number, row: number, visited: Set<string>): number {
    if (visited.has(nodeId)) return row;
    visited.add(nodeId);

    const node = this.nodes.find((n) => n.id === nodeId);
    if (!node) return row;

    node.position = {
      x: this.options.startX + depth * this.options.spacingX,
      y: this.options.startY + row * this.options.spacingY,
    };

    let currentRow = row;
    const childEdges = this.edges.filter((e) => e.source === nodeId);
    for (const edge of childEdges) {
      currentRow = this.layoutTreeNode(edge.target, depth + 1, currentRow + 1, visited);
    }

    return currentRow;
  }

  private countDescendants(nodeId: string, visited: Set<string>): number {
    if (visited.has(nodeId)) return 0;
    visited.add(nodeId);

    let count = 0;
    const childEdges = this.edges.filter((e) => e.source === nodeId);
    for (const edge of childEdges) {
      count += 1 + this.countDescendants(edge.target, visited);
    }
    return count;
  }

  private applyForceDirectedLayout(): void {
    // Simplified force-directed: start with grid, then iterate
    this.applyGridLayout();

    // Run a few iterations of force simulation
    const iterations = 50;
    const repulsion = 5000;
    const attraction = 0.01;

    for (let iter = 0; iter < iterations; iter++) {
      const forces = new Map<string, { fx: number; fy: number }>();

      for (const node of this.nodes) {
        forces.set(node.id, { fx: 0, fy: 0 });
      }

      // Repulsion between all node pairs
      for (let i = 0; i < this.nodes.length; i++) {
        for (let j = i + 1; j < this.nodes.length; j++) {
          const a = this.nodes[i];
          const b = this.nodes[j];
          const dx = a.position.x - b.position.x;
          const dy = a.position.y - b.position.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = repulsion / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;

          forces.get(a.id)!.fx += fx;
          forces.get(a.id)!.fy += fy;
          forces.get(b.id)!.fx -= fx;
          forces.get(b.id)!.fy -= fy;
        }
      }

      // Attraction along edges
      for (const edge of this.edges) {
        const source = this.nodes.find((n) => n.id === edge.source);
        const target = this.nodes.find((n) => n.id === edge.target);
        if (!source || !target) continue;

        const dx = target.position.x - source.position.x;
        const dy = target.position.y - source.position.y;
        const fx = dx * attraction;
        const fy = dy * attraction;

        forces.get(source.id)!.fx += fx;
        forces.get(source.id)!.fy += fy;
        forces.get(target.id)!.fx -= fx;
        forces.get(target.id)!.fy -= fy;
      }

      // Apply forces
      for (const node of this.nodes) {
        const f = forces.get(node.id)!;
        node.position = {
          x: node.position.x + f.fx * 0.1,
          y: node.position.y + f.fy * 0.1,
        };
      }
    }
  }

  private layoutColumn(nodes: HoloNode[], x: number, startY: number): void {
    for (let i = 0; i < nodes.length; i++) {
      nodes[i].position = {
        x,
        y: startY + i * this.options.spacingY,
      };
    }
  }

  // ==========================================================================
  // Private: Code Parsing (lightweight for round-trip)
  // ==========================================================================

  private parseCodeToAST(code: string): ASTNode[] {
    const lines = code.split('\n').map((l) => l.trim());
    const astNodes: ASTNode[] = [];
    let currentOrb: OrbNode | null = null;
    const traitList: string[] = [];
    const properties: Record<string, unknown> = {};
    const handlers: ASTNode[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Skip comments and empty lines
      if (!line || line.startsWith('//') || line.startsWith('#')) continue;

      // Detect orb declaration
      const orbMatch = line.match(/^orb\s+(\w+)\s*\{/);
      if (orbMatch) {
        currentOrb = {
          type: 'orb',
          name: orbMatch[1],
          properties: {},
          methods: [],
          children: [],
        };
        continue;
      }

      // Detect composition declaration
      const compMatch = line.match(/^composition\s+"([^"]+)"\s*\{/);
      if (compMatch) {
        currentOrb = {
          type: 'orb',
          name: compMatch[1],
          properties: {},
          methods: [],
          children: [],
        };
        continue;
      }

      // Detect traits
      const traitMatch = line.match(/^@(\w+)/);
      if (traitMatch && currentOrb) {
        traitList.push(traitMatch[1]);
        continue;
      }

      // Detect event handlers
      const handlerMatch = line.match(/^(on_\w+)\s*:\s*\{/);
      if (handlerMatch && currentOrb) {
        handlers.push({
          type: 'event-handler',
          directives: [{
            type: 'lifecycle',
            hook: handlerMatch[1],
            body: [],
          }],
        });
        continue;
      }

      // Detect property assignments
      const propMatch = line.match(/^(\w+)\s*:\s*(.+)$/);
      if (propMatch && currentOrb && !line.endsWith('{')) {
        const key = propMatch[1];
        const rawValue = propMatch[2].trim();
        properties[key] = this.parseCodeValue(rawValue);
        continue;
      }

      // Detect closing brace
      if (line === '}' && currentOrb) {
        currentOrb.properties = properties;
        currentOrb.directives = traitList.map((t) => ({
          type: 'trait' as const,
          name: t,
          config: {},
        }));
        currentOrb.children = handlers;
        astNodes.push(currentOrb);
        currentOrb = null;
      }
    }

    return astNodes;
  }

  private parseCodeValue(raw: string): unknown {
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    if (raw === 'null') return null;
    if (!isNaN(Number(raw))) return Number(raw);
    if (raw.startsWith('"') && raw.endsWith('"')) return raw.slice(1, -1);
    if (raw.startsWith("'") && raw.endsWith("'")) return raw.slice(1, -1);
    return raw;
  }

  // ==========================================================================
  // Private: Helpers
  // ==========================================================================

  private handlerNameToEventType(handlerName: string): string {
    const mapping: Record<string, string> = {
      on_click: 'on_click',
      on_hover_enter: 'on_hover',
      on_hover_exit: 'on_hover',
      on_grab: 'on_grab',
      on_release: 'on_grab',
      on_tick: 'on_tick',
      on_timer: 'on_timer',
      on_collision_enter: 'on_collision',
      on_collision_exit: 'on_collision',
      on_trigger_enter: 'on_trigger',
      on_trigger_exit: 'on_trigger',
    };
    return mapping[handlerName] || 'on_click';
  }

  private traitToEventType(traitName: string): string | null {
    const mapping: Record<string, string> = {
      clickable: 'on_click',
      hoverable: 'on_hover',
      grabbable: 'on_grab',
      collidable: 'on_collision',
    };
    return mapping[traitName] || null;
  }

  private formatLabel(type: string): string {
    return type
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

/**
 * Quick translation function: AST nodes to visual graph
 */
export function astToVisual(
  astNodes: ASTNode[],
  options?: Partial<ASTToVisualOptions>,
): ASTToVisualResult {
  const translator = new ASTToVisual(options);
  return translator.translate(astNodes);
}

/**
 * Quick translation function: HoloScript code to visual graph
 */
export function codeToVisual(
  code: string,
  options?: Partial<ASTToVisualOptions>,
): ASTToVisualResult {
  const translator = new ASTToVisual(options);
  return translator.translateFromCode(code);
}
