/**
 * Graph Grammar Rule System
 *
 * Exposes HoloScript composition rules as recursively expandable grammar nodes
 * for procedural world generation. Composition patterns become reusable
 * production rules that can generate entire scenes from seed grammars.
 *
 * Key concepts:
 * - GrammarNode: A node in the production graph (terminal or non-terminal)
 * - ProductionRule: Transforms a non-terminal into a subgraph of nodes
 * - GraphGrammar: Collection of rules with a start symbol
 * - Expansion: Recursive application of rules until all nodes are terminal
 *
 * Integration with HoloScript:
 * - Trait compositions (@turret = @physics + @ai_npc) map to production rules
 * - Templates become non-terminal symbols
 * - Objects become terminal symbols with trait attachments
 * - Spatial groups define constraint regions for placement
 *
 * @module grammar
 * @version 1.0.0
 */

// =============================================================================
// TYPES
// =============================================================================

/**
 * Node type in the grammar graph
 */
export enum NodeType {
  /** Non-terminal: can be expanded by production rules */
  NON_TERMINAL = 'non_terminal',

  /** Terminal: final output node (maps to HoloScript object) */
  TERMINAL = 'terminal',

  /** Spatial anchor: defines a position/region constraint */
  ANCHOR = 'anchor',

  /** Group: contains child nodes with layout rules */
  GROUP = 'group',
}

/**
 * A node in the grammar graph
 */
export interface GrammarNode {
  /** Unique node identifier */
  id: string;

  /** Node type */
  type: NodeType;

  /** Symbol name (e.g., 'Village', 'House', 'Tree') */
  symbol: string;

  /** Traits to attach (for terminal nodes) */
  traits: string[];

  /** Configuration for traits */
  config: Record<string, unknown>;

  /** Spatial transform */
  transform: NodeTransform;

  /** Child nodes (for GROUP type) */
  children: GrammarNode[];

  /** Tags for rule matching */
  tags: string[];

  /** Metadata */
  metadata: Record<string, unknown>;
}

/**
 * Spatial transform for grammar nodes
 */
export interface NodeTransform {
  /** Position (can be absolute or relative to parent) */
  position: { x: number; y: number; z: number };

  /** Rotation in degrees */
  rotation: { x: number; y: number; z: number };

  /** Scale */
  scale: { x: number; y: number; z: number };

  /** Position mode */
  positionMode: 'absolute' | 'relative' | 'random_in_bounds';

  /** Random bounds (for random_in_bounds mode) */
  bounds?: {
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
  };
}

/**
 * A production rule that transforms a non-terminal into a subgraph
 */
export interface ProductionRule {
  /** Rule identifier */
  id: string;

  /** Non-terminal symbol this rule expands */
  symbol: string;

  /** Probability weight for stochastic selection (0-1) */
  weight: number;

  /** Condition function for context-sensitive rules */
  condition?: (context: ExpansionContext) => boolean;

  /** Minimum depth to apply this rule */
  minDepth?: number;

  /** Maximum depth to apply this rule */
  maxDepth?: number;

  /** Production function: generates replacement nodes */
  produce: (node: GrammarNode, context: ExpansionContext) => GrammarNode[];

  /** Tags for rule categorization */
  tags: string[];
}

/**
 * Context passed during grammar expansion
 */
export interface ExpansionContext {
  /** Current recursion depth */
  depth: number;

  /** Maximum recursion depth */
  maxDepth: number;

  /** Random seed for deterministic generation */
  seed: number;

  /** Global state shared across expansion */
  state: Map<string, unknown>;

  /** Parent node chain (for context-sensitive rules) */
  parentChain: GrammarNode[];

  /** Total nodes generated so far */
  nodeCount: number;

  /** Maximum nodes allowed */
  maxNodes: number;

  /** Budget remaining per symbol type */
  symbolBudgets: Map<string, number>;
}

/**
 * Grammar expansion options
 */
export interface ExpansionOptions {
  /** Maximum recursion depth (default: 10) */
  maxDepth?: number;

  /** Maximum total nodes (default: 10000) */
  maxNodes?: number;

  /** Random seed for deterministic output */
  seed?: number;

  /** Per-symbol generation budgets */
  symbolBudgets?: Record<string, number>;

  /** Enable logging */
  verbose?: boolean;
}

/**
 * Result of grammar expansion
 */
export interface ExpansionResult {
  /** Root node of the generated scene graph */
  root: GrammarNode;

  /** Total nodes generated */
  nodeCount: number;

  /** Maximum depth reached */
  maxDepthReached: number;

  /** Rules applied (id, count) */
  rulesApplied: Map<string, number>;

  /** Unexpanded non-terminals (hit depth/budget limits) */
  unexpanded: string[];

  /** Generation time in ms */
  generationTimeMs: number;

  /** Random seed used */
  seed: number;
}

// =============================================================================
// SEEDED RANDOM
// =============================================================================

/**
 * Seeded pseudo-random number generator (mulberry32)
 */
class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed;
  }

  /** Generate float in [0, 1) */
  next(): number {
    this.state |= 0;
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Generate integer in [min, max] inclusive */
  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /** Generate float in [min, max) */
  float(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }

  /** Pick random element from array */
  pick<T>(array: T[]): T {
    return array[Math.floor(this.next() * array.length)];
  }

  /** Weighted random selection */
  weightedPick<T extends { weight: number }>(items: T[]): T {
    const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
    let random = this.next() * totalWeight;

    for (const item of items) {
      random -= item.weight;
      if (random <= 0) return item;
    }

    return items[items.length - 1];
  }
}

// =============================================================================
// GRAPH GRAMMAR ENGINE
// =============================================================================

/**
 * Graph Grammar
 *
 * Defines a set of production rules that can recursively expand
 * non-terminal symbols into scene graph fragments.
 *
 * @example
 * ```typescript
 * const grammar = new GraphGrammar('Village');
 *
 * grammar.addRule({
 *   id: 'village-layout',
 *   symbol: 'Village',
 *   weight: 1.0,
 *   produce: (node, ctx) => [
 *     createNonTerminal('TownSquare', { x: 0, y: 0, z: 0 }),
 *     createNonTerminal('HouseRow', { x: -20, y: 0, z: 0 }),
 *     createNonTerminal('HouseRow', { x: 20, y: 0, z: 0 }),
 *     createNonTerminal('Forest', { x: 0, y: 0, z: -50 }),
 *   ],
 *   tags: ['layout', 'village'],
 * });
 *
 * grammar.addRule({
 *   id: 'house-basic',
 *   symbol: 'House',
 *   weight: 0.7,
 *   produce: (node, ctx) => [
 *     createTerminal('house_mesh', ['collidable', 'visible'], { x: 0, y: 0, z: 0 }),
 *     createTerminal('door', ['grabbable', 'collidable'], { x: 0, y: 0, z: 2 }),
 *   ],
 *   tags: ['structure', 'house'],
 * });
 *
 * const result = grammar.expand({ maxDepth: 5, seed: 42 });
 * ```
 */
export class GraphGrammar {
  /** Start symbol for expansion */
  private startSymbol: string;

  /** Production rules indexed by symbol */
  private rules: Map<string, ProductionRule[]> = new Map();

  /** All registered rules */
  private allRules: ProductionRule[] = [];

  /** Expansion log */
  private log: string[] = [];

  constructor(startSymbol: string) {
    this.startSymbol = startSymbol;
  }

  /**
   * Add a production rule
   */
  addRule(rule: ProductionRule): void {
    if (!this.rules.has(rule.symbol)) {
      this.rules.set(rule.symbol, []);
    }
    this.rules.get(rule.symbol)!.push(rule);
    this.allRules.push(rule);
  }

  /**
   * Remove a production rule by ID
   */
  removeRule(ruleId: string): boolean {
    const rule = this.allRules.find((r) => r.id === ruleId);
    if (!rule) return false;

    this.allRules = this.allRules.filter((r) => r.id !== ruleId);
    const symbolRules = this.rules.get(rule.symbol);
    if (symbolRules) {
      this.rules.set(
        rule.symbol,
        symbolRules.filter((r) => r.id !== ruleId)
      );
    }
    return true;
  }

  /**
   * Get all rules for a symbol
   */
  getRulesForSymbol(symbol: string): ProductionRule[] {
    return this.rules.get(symbol) || [];
  }

  /**
   * Get all registered symbols
   */
  getSymbols(): string[] {
    return Array.from(this.rules.keys());
  }

  /**
   * Get total rule count
   */
  getRuleCount(): number {
    return this.allRules.length;
  }

  /**
   * Expand the grammar from the start symbol
   */
  expand(options: ExpansionOptions = {}): ExpansionResult {
    const startTime = Date.now();
    const seed = options.seed ?? Date.now();
    const rng = new SeededRandom(seed);
    this.log = [];

    const context: ExpansionContext = {
      depth: 0,
      maxDepth: options.maxDepth ?? 10,
      seed,
      state: new Map(),
      parentChain: [],
      nodeCount: 0,
      maxNodes: options.maxNodes ?? 10_000,
      symbolBudgets: new Map(Object.entries(options.symbolBudgets ?? {})),
    };

    const rulesApplied = new Map<string, number>();
    const unexpanded: string[] = [];

    // Create start node
    const startNode = createNonTerminal(this.startSymbol, { x: 0, y: 0, z: 0 });

    // Recursively expand
    const root = this.expandNode(
      startNode,
      context,
      rng,
      rulesApplied,
      unexpanded,
      options.verbose ?? false
    );

    return {
      root,
      nodeCount: context.nodeCount,
      maxDepthReached: this.getMaxDepth(root, 0),
      rulesApplied,
      unexpanded,
      generationTimeMs: Date.now() - startTime,
      seed,
    };
  }

  /**
   * Expand a single node recursively
   */
  private expandNode(
    node: GrammarNode,
    context: ExpansionContext,
    rng: SeededRandom,
    rulesApplied: Map<string, number>,
    unexpanded: string[],
    verbose: boolean
  ): GrammarNode {
    context.nodeCount++;

    // Check termination conditions
    if (node.type === NodeType.TERMINAL || node.type === NodeType.ANCHOR) {
      return node;
    }

    if (context.depth >= context.maxDepth) {
      if (verbose)
        this.log.push(`Depth limit reached for ${node.symbol} at depth ${context.depth}`);
      unexpanded.push(node.symbol);
      return this.convertToTerminal(node);
    }

    if (context.nodeCount >= context.maxNodes) {
      if (verbose) this.log.push(`Node limit reached for ${node.symbol}`);
      unexpanded.push(node.symbol);
      return this.convertToTerminal(node);
    }

    // Check symbol budget
    const budget = context.symbolBudgets.get(node.symbol);
    if (budget !== undefined && budget <= 0) {
      if (verbose) this.log.push(`Budget exhausted for ${node.symbol}`);
      unexpanded.push(node.symbol);
      return this.convertToTerminal(node);
    }

    // Find applicable rules
    const rules = this.getRulesForSymbol(node.symbol);
    if (rules.length === 0) {
      // No rules = treat as terminal
      return this.convertToTerminal(node);
    }

    // Filter by depth constraints and conditions
    const applicableRules = rules.filter((rule) => {
      if (rule.minDepth !== undefined && context.depth < rule.minDepth) return false;
      if (rule.maxDepth !== undefined && context.depth > rule.maxDepth) return false;
      if (rule.condition && !rule.condition(context)) return false;
      return true;
    });

    if (applicableRules.length === 0) {
      unexpanded.push(node.symbol);
      return this.convertToTerminal(node);
    }

    // Select rule (weighted random)
    const selectedRule = rng.weightedPick(applicableRules);
    rulesApplied.set(selectedRule.id, (rulesApplied.get(selectedRule.id) || 0) + 1);

    if (verbose)
      this.log.push(
        `Applied rule "${selectedRule.id}" to ${node.symbol} at depth ${context.depth}`
      );

    // Decrement budget
    if (budget !== undefined) {
      context.symbolBudgets.set(node.symbol, budget - 1);
    }

    // Produce child nodes
    const produced = selectedRule.produce(node, context);

    // Recursively expand produced nodes
    const expandedChildren: GrammarNode[] = [];
    for (const child of produced) {
      const childContext: ExpansionContext = {
        ...context,
        depth: context.depth + 1,
        parentChain: [...context.parentChain, node],
      };

      const expanded = this.expandNode(child, childContext, rng, rulesApplied, unexpanded, verbose);
      expandedChildren.push(expanded);
    }

    // Return as group node containing expanded children
    return {
      ...node,
      type: NodeType.GROUP,
      children: expandedChildren,
    };
  }

  /**
   * Convert a non-terminal to terminal when expansion stops
   */
  private convertToTerminal(node: GrammarNode): GrammarNode {
    return {
      ...node,
      type: NodeType.TERMINAL,
      children: [],
    };
  }

  /**
   * Get maximum depth of expanded tree
   */
  private getMaxDepth(node: GrammarNode, current: number): number {
    if (node.children.length === 0) return current;
    return Math.max(...node.children.map((child) => this.getMaxDepth(child, current + 1)));
  }

  /**
   * Get expansion log
   */
  getLog(): string[] {
    return [...this.log];
  }

  /**
   * Serialize grammar to JSON
   */
  serialize(): string {
    const data = {
      version: 1,
      startSymbol: this.startSymbol,
      rules: this.allRules.map((r) => ({
        id: r.id,
        symbol: r.symbol,
        weight: r.weight,
        minDepth: r.minDepth,
        maxDepth: r.maxDepth,
        tags: r.tags,
        // produce and condition are functions - not serializable
        // They must be re-registered from code
      })),
    };
    return JSON.stringify(data, null, 2);
  }
}

// =============================================================================
// NODE FACTORY FUNCTIONS
// =============================================================================

let nodeIdCounter = 0;

/**
 * Create a non-terminal grammar node
 */
export function createNonTerminal(
  symbol: string,
  position: { x: number; y: number; z: number },
  tags: string[] = []
): GrammarNode {
  return {
    id: `nt_${symbol}_${++nodeIdCounter}`,
    type: NodeType.NON_TERMINAL,
    symbol,
    traits: [],
    config: {},
    transform: {
      position,
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      positionMode: 'relative',
    },
    children: [],
    tags,
    metadata: {},
  };
}

/**
 * Create a terminal grammar node (maps to a HoloScript object)
 */
export function createTerminal(
  symbol: string,
  traits: string[],
  position: { x: number; y: number; z: number },
  config: Record<string, unknown> = {},
  tags: string[] = []
): GrammarNode {
  return {
    id: `t_${symbol}_${++nodeIdCounter}`,
    type: NodeType.TERMINAL,
    symbol,
    traits,
    config,
    transform: {
      position,
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      positionMode: 'relative',
    },
    children: [],
    tags,
    metadata: {},
  };
}

/**
 * Create a spatial anchor node
 */
export function createAnchor(
  name: string,
  position: { x: number; y: number; z: number },
  bounds?: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }
): GrammarNode {
  return {
    id: `anchor_${name}_${++nodeIdCounter}`,
    type: NodeType.ANCHOR,
    symbol: name,
    traits: [],
    config: {},
    transform: {
      position,
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      positionMode: bounds ? 'random_in_bounds' : 'absolute',
      bounds,
    },
    children: [],
    tags: ['anchor'],
    metadata: {},
  };
}

/**
 * Reset node ID counter (for testing)
 */
export function resetNodeIdCounter(): void {
  nodeIdCounter = 0;
}

// =============================================================================
// HOLOSCRIPT COMPOSITION MAPPING
// =============================================================================

/**
 * Convert a HoloScript trait composition expression to a production rule.
 *
 * Maps: @turret = @physics + @ai_npc + @targeting
 * To: A production rule that generates a terminal node with those traits
 */
export function compositionToRule(
  compositionName: string,
  traitNames: string[],
  weight: number = 1.0
): ProductionRule {
  return {
    id: `comp_${compositionName}`,
    symbol: compositionName,
    weight,
    tags: ['composition', ...traitNames],
    produce: (_node, _context) => {
      return [
        createTerminal(compositionName, traitNames, { x: 0, y: 0, z: 0 }, {}, [
          'composed',
          ...traitNames,
        ]),
      ];
    },
  };
}

/**
 * Convert a HoloScript template to a production rule.
 *
 * Templates define reusable object archetypes that expand into
 * terminal nodes with specific trait configurations.
 */
export function templateToRule(
  templateName: string,
  traits: string[],
  defaultConfig: Record<string, unknown> = {},
  weight: number = 1.0
): ProductionRule {
  return {
    id: `tmpl_${templateName}`,
    symbol: templateName,
    weight,
    tags: ['template', templateName],
    produce: (_node, _context) => {
      return [
        createTerminal(templateName, traits, { x: 0, y: 0, z: 0 }, defaultConfig, [
          'template-instance',
          templateName,
        ]),
      ];
    },
  };
}

// =============================================================================
// BUILT-IN GRAMMAR PRESETS
// =============================================================================

/**
 * Create a basic village grammar for procedural world generation
 */
export function createVillageGrammar(): GraphGrammar {
  const grammar = new GraphGrammar('Village');

  // Village -> TownSquare + Houses + Decoration
  grammar.addRule({
    id: 'village-layout',
    symbol: 'Village',
    weight: 1.0,
    tags: ['layout'],
    produce: (_node, ctx) => {
      const rng = new SeededRandom(ctx.seed + ctx.depth);
      const houseCount = rng.int(4, 8);
      const nodes: GrammarNode[] = [createNonTerminal('TownSquare', { x: 0, y: 0, z: 0 })];

      // Scatter houses in a circle around town square
      for (let i = 0; i < houseCount; i++) {
        const angle = (i / houseCount) * Math.PI * 2;
        const radius = rng.float(15, 30);
        nodes.push(
          createNonTerminal('House', {
            x: Math.cos(angle) * radius,
            y: 0,
            z: Math.sin(angle) * radius,
          })
        );
      }

      // Add trees
      const treeCount = rng.int(5, 15);
      for (let i = 0; i < treeCount; i++) {
        nodes.push(
          createNonTerminal('Tree', {
            x: rng.float(-50, 50),
            y: 0,
            z: rng.float(-50, 50),
          })
        );
      }

      return nodes;
    },
  });

  // TownSquare -> Fountain + Benches
  grammar.addRule({
    id: 'town-square',
    symbol: 'TownSquare',
    weight: 1.0,
    tags: ['structure'],
    produce: (_node, ctx) => {
      const rng = new SeededRandom(ctx.seed + ctx.depth + 100);
      const nodes: GrammarNode[] = [
        createTerminal('fountain', ['collidable', 'audio', 'visible'], { x: 0, y: 0, z: 0 }),
      ];

      const benchCount = rng.int(2, 6);
      for (let i = 0; i < benchCount; i++) {
        const angle = (i / benchCount) * Math.PI * 2;
        nodes.push(
          createTerminal('bench', ['collidable', 'visible'], {
            x: Math.cos(angle) * 5,
            y: 0,
            z: Math.sin(angle) * 5,
          })
        );
      }

      return nodes;
    },
  });

  // House -> Walls + Door + Roof
  grammar.addRule({
    id: 'house-basic',
    symbol: 'House',
    weight: 0.7,
    tags: ['structure', 'house'],
    produce: () => [
      createTerminal('house_walls', ['collidable', 'visible'], { x: 0, y: 0, z: 0 }),
      createTerminal('house_door', ['grabbable', 'collidable', 'visible'], { x: 0, y: 0, z: 3 }),
      createTerminal('house_roof', ['collidable', 'visible'], { x: 0, y: 3, z: 0 }),
    ],
  });

  // House -> Larger house variant
  grammar.addRule({
    id: 'house-large',
    symbol: 'House',
    weight: 0.3,
    tags: ['structure', 'house', 'large'],
    produce: () => [
      createTerminal(
        'house_large_walls',
        ['collidable', 'visible'],
        { x: 0, y: 0, z: 0 },
        { scale: 1.5 }
      ),
      createTerminal('house_large_door', ['grabbable', 'collidable', 'visible'], {
        x: 0,
        y: 0,
        z: 4.5,
      }),
      createTerminal('house_large_roof', ['collidable', 'visible'], { x: 0, y: 4.5, z: 0 }),
      createTerminal('chimney', ['visible', 'collidable'], { x: 2, y: 6, z: 0 }),
    ],
  });

  // Tree -> Simple tree terminal
  grammar.addRule({
    id: 'tree-simple',
    symbol: 'Tree',
    weight: 0.6,
    tags: ['nature', 'tree'],
    produce: (_node, ctx) => {
      const rng = new SeededRandom(ctx.seed + ctx.nodeCount);
      const scale = rng.float(0.5, 2.0);
      return [
        createTerminal(
          'tree',
          ['collidable', 'visible'],
          { x: 0, y: 0, z: 0 },
          { treeScale: scale }
        ),
      ];
    },
  });

  // Tree -> Large oak
  grammar.addRule({
    id: 'tree-oak',
    symbol: 'Tree',
    weight: 0.4,
    tags: ['nature', 'tree', 'oak'],
    produce: () => [
      createTerminal('oak_trunk', ['collidable', 'climbable', 'visible'], { x: 0, y: 0, z: 0 }),
      createTerminal('oak_canopy', ['visible'], { x: 0, y: 5, z: 0 }, { radius: 4 }),
    ],
  });

  return grammar;
}

/**
 * Create a dungeon grammar for procedural dungeon generation
 */
export function createDungeonGrammar(): GraphGrammar {
  const grammar = new GraphGrammar('Dungeon');

  grammar.addRule({
    id: 'dungeon-entrance',
    symbol: 'Dungeon',
    weight: 1.0,
    tags: ['dungeon', 'layout'],
    produce: (_node, ctx) => {
      const rng = new SeededRandom(ctx.seed);
      const roomCount = rng.int(3, 7);
      const nodes: GrammarNode[] = [createNonTerminal('Entrance', { x: 0, y: 0, z: 0 })];

      let z = -10;
      for (let i = 0; i < roomCount; i++) {
        nodes.push(createNonTerminal(rng.next() > 0.3 ? 'Room' : 'BossRoom', { x: 0, y: 0, z }));
        nodes.push(createTerminal('corridor', ['collidable', 'visible'], { x: 0, y: 0, z: z + 5 }));
        z -= 15;
      }

      return nodes;
    },
  });

  grammar.addRule({
    id: 'room-basic',
    symbol: 'Room',
    weight: 0.6,
    tags: ['dungeon', 'room'],
    produce: (_node, ctx) => {
      const rng = new SeededRandom(ctx.seed + ctx.depth);
      const nodes: GrammarNode[] = [
        createTerminal('room_floor', ['collidable', 'visible'], { x: 0, y: 0, z: 0 }),
        createTerminal('room_walls', ['collidable', 'visible'], { x: 0, y: 0, z: 0 }),
      ];

      // Random loot
      if (rng.next() > 0.5) {
        nodes.push(
          createTerminal('chest', ['grabbable', 'collidable', 'visible', 'inventory'], {
            x: rng.float(-3, 3),
            y: 0,
            z: rng.float(-3, 3),
          })
        );
      }

      // Random enemies
      if (rng.next() > 0.3) {
        nodes.push(
          createTerminal('enemy', ['health', 'damage', 'collidable', 'visible', 'respawnable'], {
            x: rng.float(-4, 4),
            y: 0,
            z: rng.float(-4, 4),
          })
        );
      }

      return nodes;
    },
  });

  grammar.addRule({
    id: 'room-treasure',
    symbol: 'Room',
    weight: 0.2,
    tags: ['dungeon', 'room', 'treasure'],
    produce: () => [
      createTerminal('room_floor', ['collidable', 'visible'], { x: 0, y: 0, z: 0 }),
      createTerminal('room_walls', ['collidable', 'visible'], { x: 0, y: 0, z: 0 }),
      createTerminal('treasure_chest', ['grabbable', 'collidable', 'visible', 'inventory'], {
        x: 0,
        y: 0,
        z: 0,
      }),
      createTerminal('gold_pile', ['visible', 'collidable'], { x: -2, y: 0, z: 1 }),
      createTerminal('gold_pile', ['visible', 'collidable'], { x: 2, y: 0, z: -1 }),
    ],
  });

  grammar.addRule({
    id: 'boss-room',
    symbol: 'BossRoom',
    weight: 1.0,
    maxDepth: 8,
    tags: ['dungeon', 'boss'],
    produce: () => [
      createTerminal(
        'boss_room_floor',
        ['collidable', 'visible'],
        { x: 0, y: 0, z: 0 },
        { scale: 2 }
      ),
      createTerminal(
        'boss_room_walls',
        ['collidable', 'visible'],
        { x: 0, y: 0, z: 0 },
        { scale: 2 }
      ),
      createTerminal(
        'boss',
        ['health', 'damage', 'collidable', 'visible'],
        { x: 0, y: 0, z: -5 },
        { maxHealth: 1000, baseDamage: 50 }
      ),
      createTerminal('boss_loot', ['grabbable', 'collidable', 'visible', 'equippable'], {
        x: 0,
        y: 1,
        z: -8,
      }),
    ],
  });

  grammar.addRule({
    id: 'entrance-gate',
    symbol: 'Entrance',
    weight: 1.0,
    tags: ['dungeon', 'entrance'],
    produce: () => [
      createTerminal('entrance_gate', ['collidable', 'visible'], { x: 0, y: 0, z: 0 }),
      createTerminal('entrance_torch_left', ['visible', 'audio'], { x: -3, y: 2, z: 0 }),
      createTerminal('entrance_torch_right', ['visible', 'audio'], { x: 3, y: 2, z: 0 }),
    ],
  });

  return grammar;
}
