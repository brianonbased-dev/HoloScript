/**
 * HoloScript Graph Understanding Tools
 *
 * Migrated from Hololand/Brittney MCP to HoloScript MCP (free tier).
 * These tools help AI agents understand .holo files as visual graphs.
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { SemanticSceneGraph, HoloScriptCompiler } from '@holoscript/core';
import {
  holoMapToolDefinitions,
  handleHoloMapTool,
  handleHoloMapPaperIngestProbe,
} from './holomap-mcp-tools';

// =============================================================================
// TYPES FOR GRAPH REPRESENTATION
// =============================================================================

export interface HoloNode {
  id: string;
  name: string;
  type:
    | 'template'
    | 'object'
    | 'orb'
    | 'building'
    | 'npc'
    | 'collectible'
    | 'group'
    | 'environment';
  position?: [number, number, number];
  properties: Record<string, unknown>;
  state?: Record<string, unknown>;
  actions?: string[];
  traits?: string[];
}

export interface HoloEdge {
  id: string;
  from: string;
  to: string;
  type: 'uses' | 'triggers' | 'contains' | 'references' | 'flow';
  event?: string;
  action?: string;
  label?: string;
}

export interface HoloFlow {
  trigger: string;
  event: string;
  actions: Array<{
    target: string;
    action: string;
    args?: unknown[];
  }>;
}

export interface HoloGraph {
  name: string;
  nodes: HoloNode[];
  edges: HoloEdge[];
  flows: HoloFlow[];
  groups: Array<{
    id: string;
    name: string;
    children: string[];
  }>;
}

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

export const graphTools: Tool[] = [
  {
    name: 'holo_parse_to_graph',
    description: `Parse a .holo file and return its graph representation. This helps you understand the visual structure:
- **Nodes**: All objects, templates, orbs, NPCs, etc.
- **Edges**: Connections between nodes (uses, triggers, contains)
- **Flows**: Event-to-action chains (what happens when X occurs)
- **Groups**: Spatial groupings of nodes

Use this to "see" the architecture before modifying code.`,
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'HoloScript code to parse into a graph',
        },
      },
      required: ['code'],
    },
  },

  {
    name: 'holo_semantic_scene_graph',
    description: `Parse a .holo file and return its W3C-compliant JSON-LD Semantic Scene Graph representation.
This leverages the new Pillar 2 Architectural Semantic Understanding.
Output is suitable for Linked Data / Knowledge Graph ingestion, SEO-optimized 3D indexing, and AI reasoning.`,
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'HoloScript code to compile to a semantic scene graph',
        },
      },
      required: ['code'],
    },
  },

  {
    name: 'holo_visualize_flow',
    description: `Visualize the event/action flow in a .holo file as ASCII diagram. Returns something like:
\`\`\`
[User] ──wave──→ [Goblin_A] ──throw_rock()──→ [Rock] ──hit──→ [User]
                     ↓
               [Goblin_B] ──throw_rock()──→ [Rock]
\`\`\`
This helps you understand the control flow and data flow in the scene.`,
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'HoloScript code to visualize',
        },
        focus: {
          type: 'string',
          description: 'Focus on a specific node or event (optional)',
        },
      },
      required: ['code'],
    },
  },

  {
    name: 'holo_get_node_connections',
    description: `Get all connections for a specific node in a .holo file. Returns:
- What this node **receives** (incoming events/triggers)
- What this node **sends** (outgoing actions/events)
- What **contains** this node (parent groups)
- What this node **contains** (children)
- What **template** this node uses`,
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'HoloScript code to analyze',
        },
        nodeName: {
          type: 'string',
          description: 'Name of the node to inspect (e.g., "Goblin_A", "Player")',
        },
      },
      required: ['code', 'nodeName'],
    },
  },

  {
    name: 'holo_design_graph',
    description: `Given a natural language description, design the graph structure BEFORE writing code. Returns:
- Suggested nodes and their types
- Connections between nodes
- Event flows
- Recommended spatial groupings

Use this to plan your .holo file as a visual architecture first.`,
    inputSchema: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description: 'What you want to create (e.g., "A shop with NPCs that sell items")',
        },
        constraints: {
          type: 'object',
          description: 'Optional constraints (maxNodes, requiredTypes, etc.)',
        },
      },
      required: ['description'],
    },
  },

  {
    name: 'holo_diff_graphs',
    description: `Compare two .holo files as graphs and show what changed:
- Added/removed nodes
- Changed connections
- Modified flows
- New/removed groups

Helps understand the impact of changes.`,
    inputSchema: {
      type: 'object',
      properties: {
        before: {
          type: 'string',
          description: 'Original HoloScript code',
        },
        after: {
          type: 'string',
          description: 'Modified HoloScript code',
        },
      },
      required: ['before', 'after'],
    },
  },

  {
    name: 'holo_suggest_connections',
    description: `Given existing nodes in a .holo file, suggest potential connections and flows you might want to add. For example:
- "Player and Enemy exist but have no interaction - add combat flow?"
- "Collectibles exist but no collection event - add on_interact?"`,
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'Current HoloScript code to analyze',
        },
        intent: {
          type: 'string',
          description: 'What kind of behavior you want (optional)',
        },
      },
      required: ['code'],
    },
  },

  {
    name: 'holo_generate_semantic_scene_graph',
    description: `Generate a W3C-compliant JSON-LD Semantic Scene Graph from a .holo composition.
This bridges Pillar 2 (Architectural semantic understanding) by converting AST into Linked Data.`,
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'HoloScript code to convert to JSON-LD',
        },
        baseURI: {
          type: 'string',
          description: 'Optional Base URI for generated @id properties (e.g., "urn:holoscript:")',
        },
      },
      required: ['code'],
    },
  },

  ...holoMapToolDefinitions,
];

// =============================================================================
// PARSER - Extract graph from .holo code
// =============================================================================

export function parseHoloToGraph(code: string): HoloGraph {
  const graph: HoloGraph = {
    name: '',
    nodes: [],
    edges: [],
    flows: [],
    groups: [],
  };

  const compositionMatch = code.match(/composition\s+"([^"]+)"/);
  const worldMatch = code.match(/world\s+(\w+)/);
  graph.name = compositionMatch?.[1] || worldMatch?.[1] || 'Unnamed';

  // Extract templates
  const templateRegex = /template\s+"(\w+)"\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/g;
  let match;
  while ((match = templateRegex.exec(code)) !== null) {
    const name = match[1];
    const body = match[2];

    const node: HoloNode = {
      id: `template_${name}`,
      name,
      type: 'template',
      properties: {},
      state: extractState(body),
      actions: extractActions(body),
    };
    graph.nodes.push(node);
  }

  // Extract objects
  const objectRegex = /object\s+"(\w+)"(?:\s+using\s+"(\w+)")?\s*\{([^}]+)\}/g;
  while ((match = objectRegex.exec(code)) !== null) {
    const name = match[1];
    const template = match[2];
    const body = match[3];

    const node: HoloNode = {
      id: `object_${name}`,
      name,
      type: 'object',
      position: extractPosition(body),
      properties: extractProperties(body),
      traits: extractTraits(body),
    };
    graph.nodes.push(node);

    if (template) {
      graph.edges.push({
        id: `edge_${name}_uses_${template}`,
        from: `object_${name}`,
        to: `template_${template}`,
        type: 'uses',
        label: 'uses',
      });
    }
  }

  // Extract orbs
  const orbRegex = /orb\s+(\w+)\s*\{([^}]+)\}/g;
  while ((match = orbRegex.exec(code)) !== null) {
    const name = match[1];
    const body = match[2];

    const node: HoloNode = {
      id: `orb_${name}`,
      name,
      type: determineOrbType(body),
      position: extractPosition(body),
      properties: extractProperties(body),
      traits: extractTraits(body),
    };
    graph.nodes.push(node);
  }

  // Extract buildings
  const buildingRegex = /building\s+(\w+)\s*\{([^}]+)\}/g;
  while ((match = buildingRegex.exec(code)) !== null) {
    const name = match[1];
    const body = match[2];

    graph.nodes.push({
      id: `building_${name}`,
      name,
      type: 'building',
      position: extractPosition(body),
      properties: extractProperties(body),
    });
  }

  // Extract spatial groups
  const groupRegex = /spatial_group\s+"(\w+)"\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/g;
  while ((match = groupRegex.exec(code)) !== null) {
    const groupName = match[1];
    const groupBody = match[2];

    const childObjects: string[] = [];
    const childObjRegex = /object\s+"(\w+)"/g;
    let childMatch;
    while ((childMatch = childObjRegex.exec(groupBody)) !== null) {
      childObjects.push(`object_${childMatch[1]}`);
    }

    graph.groups.push({
      id: `group_${groupName}`,
      name: groupName,
      children: childObjects,
    });

    for (const childId of childObjects) {
      graph.edges.push({
        id: `edge_${groupName}_contains_${childId}`,
        from: `group_${groupName}`,
        to: childId,
        type: 'contains',
      });
    }
  }

  // Extract flows from logic blocks
  const logicRegex = /logic\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/g;
  while ((match = logicRegex.exec(code)) !== null) {
    const logicBody = match[1];
    extractFlows(logicBody, graph);
  }

  return graph;
}

// Helper functions
function extractState(body: string): Record<string, unknown> {
  const stateMatch = body.match(/state\s*\{([^}]+)\}/);
  if (!stateMatch) return {};

  const state: Record<string, unknown> = {};
  const propRegex = /(\w+):\s*([^,\n}]+)/g;
  let match;
  while ((match = propRegex.exec(stateMatch[1])) !== null) {
    state[match[1]] = parseValue(match[2].trim());
  }
  return state;
}

function extractActions(body: string): string[] {
  const actions: string[] = [];
  const actionRegex = /action\s+(\w+)/g;
  let match;
  while ((match = actionRegex.exec(body)) !== null) {
    actions.push(match[1]);
  }
  return actions;
}

function extractPosition(body: string): [number, number, number] | undefined {
  const posMatch = body.match(/position:\s*\[([^\]]+)\]/);
  if (!posMatch) return undefined;
  const parts = posMatch[1].split(',').map((p) => parseFloat(p.trim()));
  return parts.length >= 3 ? [parts[0], parts[1], parts[2]] : undefined;
}

function extractProperties(body: string): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  const propRegex = /(\w+):\s*([^,\n}]+)/g;
  let match;
  while ((match = propRegex.exec(body)) !== null) {
    const key = match[1];
    if (!['position', 'state', 'action', 'on_interact', 'traits'].includes(key)) {
      props[key] = parseValue(match[2].trim());
    }
  }
  return props;
}

function extractTraits(body: string): string[] {
  const traitsMatch = body.match(/traits:\s*\[([^\]]+)\]/);
  if (!traitsMatch) return [];
  return traitsMatch[1]
    .split(',')
    .map((t) => t.trim().replace(/["']/g, ''))
    .filter(Boolean);
}

function determineOrbType(body: string): HoloNode['type'] {
  if (body.includes('talkable') || body.includes('NPC')) return 'npc';
  if (body.includes('collectible')) return 'collectible';
  return 'orb';
}

function parseValue(value: string): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value.startsWith('"') || value.startsWith("'")) return value.slice(1, -1);
  if (value.startsWith('[')) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  const num = parseFloat(value);
  return isNaN(num) ? value : num;
}

function extractFlows(logicBody: string, graph: HoloGraph): void {
  const eventRegex = /on_(\w+)(?:\("([^"]+)"\))?\s*\{([^}]+)\}/g;
  let match;
  while ((match = eventRegex.exec(logicBody)) !== null) {
    const eventType = match[1];
    const eventTarget = match[2] || 'any';
    const eventBody = match[3];

    const flow: HoloFlow = {
      trigger: eventTarget,
      event: `on_${eventType}`,
      actions: [],
    };

    const actionCallRegex = /(\w+)\.(\w+)\(([^)]*)\)/g;
    let actionMatch;
    while ((actionMatch = actionCallRegex.exec(eventBody)) !== null) {
      flow.actions.push({
        target: actionMatch[1],
        action: actionMatch[2],
        args: actionMatch[3] ? actionMatch[3].split(',').map((a) => a.trim()) : [],
      });

      graph.edges.push({
        id: `flow_${eventType}_${actionMatch[1]}_${actionMatch[2]}`,
        from: eventTarget === 'any' ? 'event' : `object_${eventTarget}`,
        to: `object_${actionMatch[1]}`,
        type: 'triggers',
        event: `on_${eventType}`,
        action: actionMatch[2],
      });
    }

    graph.flows.push(flow);
  }

  // Extract every() periodic events
  const everyRegex = /every\((\d+)\)\s*\{([^}]+)\}/g;
  while ((match = everyRegex.exec(logicBody)) !== null) {
    const interval = match[1];
    const body = match[2];

    const flow: HoloFlow = {
      trigger: 'timer',
      event: `every_${interval}ms`,
      actions: [],
    };

    const actionCallRegex = /(\w+)\.(\w+)\(([^)]*)\)/g;
    let actionMatch;
    while ((actionMatch = actionCallRegex.exec(body)) !== null) {
      flow.actions.push({
        target: actionMatch[1],
        action: actionMatch[2],
      });
    }

    graph.flows.push(flow);
  }
}

// =============================================================================
// VISUALIZATION - ASCII diagrams of flow
// =============================================================================

export function visualizeFlow(graph: HoloGraph, focus?: string): string {
  const lines: string[] = [];

  lines.push(`=== ${graph.name} Flow Diagram ===\n`);

  const nodesByType = new Map<string, HoloNode[]>();
  for (const node of graph.nodes) {
    const type = node.type;
    if (!nodesByType.has(type)) nodesByType.set(type, []);
    nodesByType.get(type)!.push(node);
  }

  lines.push('NODES:');
  for (const [type, nodes] of nodesByType) {
    lines.push(`  ${type.toUpperCase()}:`);
    for (const node of nodes) {
      const pos = node.position ? ` @ [${node.position.join(', ')}]` : '';
      const traits = node.traits?.length ? ` [${node.traits.join(', ')}]` : '';
      lines.push(`    [${node.name}]${pos}${traits}`);
    }
  }

  lines.push('\nFLOWS:');
  for (const flow of graph.flows) {
    if (
      focus &&
      !flow.trigger.includes(focus) &&
      !flow.actions.some((a) => a.target.includes(focus))
    ) {
      continue;
    }

    lines.push(`  ${flow.event}:`);
    const actionsStr = flow.actions.map((a) => `${a.target}.${a.action}()`).join(' -> ');
    lines.push(`    [${flow.trigger}] --- ${flow.event} ---> ${actionsStr}`);
  }

  if (graph.groups.length > 0) {
    lines.push('\nGROUPS:');
    for (const group of graph.groups) {
      lines.push(`  ${group.name}:`);
      lines.push(
        `    +-- ${group.children.map((c) => c.replace(/^(object|orb)_/, '')).join(', ')}`
      );
    }
  }

  return lines.join('\n');
}

// =============================================================================
// NODE CONNECTIONS
// =============================================================================

export function getNodeConnections(
  graph: HoloGraph,
  nodeName: string
): {
  receives: Array<{ from: string; event: string }>;
  sends: Array<{ to: string; action: string }>;
  parent?: string;
  children: string[];
  uses?: string;
} {
  const nodeId =
    graph.nodes.find((n) => n.name === nodeName)?.id || `object_${nodeName}` || `orb_${nodeName}`;

  const result = {
    receives: [] as Array<{ from: string; event: string }>,
    sends: [] as Array<{ to: string; action: string }>,
    parent: undefined as string | undefined,
    children: [] as string[],
    uses: undefined as string | undefined,
  };

  for (const edge of graph.edges) {
    if (edge.to === nodeId) {
      if (edge.type === 'triggers') {
        result.receives.push({ from: edge.from, event: edge.event || 'unknown' });
      } else if (edge.type === 'contains') {
        result.parent = edge.from;
      }
    }

    if (edge.from === nodeId) {
      if (edge.type === 'triggers') {
        result.sends.push({ to: edge.to, action: edge.action || 'unknown' });
      } else if (edge.type === 'uses') {
        result.uses = edge.to.replace('template_', '');
      } else if (edge.type === 'contains') {
        result.children.push(edge.to);
      }
    }
  }

  return result;
}

// =============================================================================
// GRAPH DESIGN from description
// =============================================================================

export function designGraphFromDescription(description: string): {
  suggestedNodes: Array<{ name: string; type: string; purpose: string }>;
  suggestedEdges: Array<{ from: string; to: string; type: string; why: string }>;
  suggestedFlows: Array<{ trigger: string; actions: string[]; why: string }>;
  holoStructure: string;
} {
  const desc = description.toLowerCase();
  const nodes: Array<{ name: string; type: string; purpose: string }> = [];
  const edges: Array<{ from: string; to: string; type: string; why: string }> = [];
  const flows: Array<{ trigger: string; actions: string[]; why: string }> = [];

  if (desc.includes('shop') || desc.includes('store') || desc.includes('merchant')) {
    nodes.push({ name: 'ShopKeeper', type: 'npc', purpose: 'Sells items to player' });
    nodes.push({ name: 'ShopUI', type: 'ui', purpose: 'Shows inventory for sale' });
    flows.push({
      trigger: 'on_interact(ShopKeeper)',
      actions: ['ShopUI.show()', 'ShopKeeper.greet()'],
      why: 'Player interacts with shop keeper to open shop',
    });
  }

  if (desc.includes('enemy') || desc.includes('combat') || desc.includes('fight')) {
    nodes.push({ name: 'Enemy', type: 'template', purpose: 'Hostile entity with health/attack' });
    nodes.push({ name: 'Player', type: 'object', purpose: 'User-controlled character' });
    edges.push({ from: 'Enemy', to: 'Player', type: 'targets', why: 'Enemy attacks player' });
    flows.push({
      trigger: 'every(2000)',
      actions: ['Enemy.attack(Player)'],
      why: 'Periodic enemy attacks',
    });
  }

  if (desc.includes('collect') || desc.includes('pickup') || desc.includes('item')) {
    nodes.push({ name: 'Collectible', type: 'template', purpose: 'Item that can be picked up' });
    flows.push({
      trigger: 'on_interact',
      actions: ['this.collect()', 'Player.addToInventory(this)'],
      why: 'Player picks up item',
    });
  }

  if (desc.includes('door') || desc.includes('portal') || desc.includes('teleport')) {
    nodes.push({ name: 'Portal', type: 'orb', purpose: 'Teleports to another location' });
    flows.push({
      trigger: 'on_enter(Portal)',
      actions: ['Player.teleportTo(Portal.destination)'],
      why: 'Player enters portal and teleports',
    });
  }

  if (desc.includes('npc') || desc.includes('character') || desc.includes('talk')) {
    nodes.push({ name: 'NPC', type: 'npc', purpose: 'Non-player character for dialogue' });
    flows.push({
      trigger: 'on_interact(NPC)',
      actions: ['DialogueUI.show(NPC.dialogue)'],
      why: 'Player talks to NPC',
    });
  }

  const holoStructure = generateHoloStructure(nodes, edges, flows);

  return { suggestedNodes: nodes, suggestedEdges: edges, suggestedFlows: flows, holoStructure };
}

function generateHoloStructure(
  nodes: Array<{ name: string; type: string; purpose: string }>,
  _edges: Array<{ from: string; to: string; type: string; why: string }>,
  flows: Array<{ trigger: string; actions: string[]; why: string }>
): string {
  const lines: string[] = [];
  lines.push('composition "Generated" {');
  lines.push('');

  const templates = nodes.filter((n) => n.type === 'template');
  for (const t of templates) {
    lines.push(`  // ${t.purpose}`);
    lines.push(`  template "${t.name}" {`);
    lines.push('    state { }');
    lines.push('    action example() { }');
    lines.push('  }');
    lines.push('');
  }

  lines.push('  spatial_group "Main" {');
  const objects = nodes.filter((n) => n.type !== 'template' && n.type !== 'ui');
  for (const o of objects) {
    lines.push(`    // ${o.purpose}`);
    if (templates.find((t) => t.name === o.type || o.type === 'object')) {
      lines.push(`    object "${o.name}" using "${o.type}" {`);
    } else {
      lines.push(`    orb ${o.name} {`);
    }
    lines.push('      position: [0, 0, 0]');
    lines.push('    }');
  }
  lines.push('  }');
  lines.push('');

  if (flows.length > 0) {
    lines.push('  logic {');
    for (const f of flows) {
      lines.push(`    // ${f.why}`);
      lines.push(`    ${f.trigger} {`);
      for (const a of f.actions) {
        lines.push(`      ${a}`);
      }
      lines.push('    }');
    }
    lines.push('  }');
  }

  lines.push('}');
  return lines.join('\n');
}

// =============================================================================
// TOOL HANDLER
// =============================================================================

export async function handleGraphTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case 'holo_map_paper_ingest_probe':
      return handleHoloMapPaperIngestProbe(args);

    case 'holo_reconstruct_from_video':
    case 'holo_reconstruct_step':
    case 'holo_reconstruct_anchor':
    case 'holo_reconstruct_export':
      return handleHoloMapTool(name, args)!;

    case 'holo_semantic_scene_graph': {
      const code = args.code as string;
      if (!code) throw new Error('code is required');

      try {
        const ast = (HoloScriptCompiler as any).parse(code);
        const jsonld = SemanticSceneGraph.generateObject(ast, { includeMetadata: true });
        return {
          sceneGraph: jsonld,
          summary: `Successfully generated W3C-compliant JSON-LD Semantic Scene Graph for ${ast.name}`,
        };
      } catch (err: unknown) {
        throw new Error(
          `Failed to generate Semantic Scene Graph: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    case 'holo_parse_to_graph': {
      const code = args.code as string;
      if (!code) throw new Error('code is required');

      const graph = parseHoloToGraph(code);
      return {
        name: graph.name,
        nodeCount: graph.nodes.length,
        edgeCount: graph.edges.length,
        flowCount: graph.flows.length,
        groupCount: graph.groups.length,
        nodes: graph.nodes,
        edges: graph.edges,
        flows: graph.flows,
        groups: graph.groups,
      };
    }

    case 'holo_visualize_flow': {
      const code = args.code as string;
      const focus = args.focus as string | undefined;
      const graph = parseHoloToGraph(code);
      return visualizeFlow(graph, focus);
    }

    case 'holo_get_node_connections': {
      const code = args.code as string;
      const nodeName = args.nodeName as string;
      const graph = parseHoloToGraph(code);
      return getNodeConnections(graph, nodeName);
    }

    case 'holo_design_graph': {
      const description = args.description as string;
      return designGraphFromDescription(description);
    }

    case 'holo_diff_graphs': {
      const before = args.before as string;
      const after = args.after as string;

      const graphBefore = parseHoloToGraph(before);
      const graphAfter = parseHoloToGraph(after);

      const beforeNodeIds = new Set(graphBefore.nodes.map((n) => n.id));
      const afterNodeIds = new Set(graphAfter.nodes.map((n) => n.id));

      return {
        addedNodes: graphAfter.nodes.filter((n) => !beforeNodeIds.has(n.id)),
        removedNodes: graphBefore.nodes.filter((n) => !afterNodeIds.has(n.id)),
        addedEdges: graphAfter.edges.filter(
          (e) => !new Set(graphBefore.edges.map((be) => be.id)).has(e.id)
        ),
        removedEdges: graphBefore.edges.filter(
          (e) => !new Set(graphAfter.edges.map((ae) => ae.id)).has(e.id)
        ),
        flowsBefore: graphBefore.flows.length,
        flowsAfter: graphAfter.flows.length,
      };
    }

    case 'holo_suggest_connections': {
      const code = args.code as string;
      const intent = args.intent as string | undefined;
      const graph = parseHoloToGraph(code);
      const suggestions: string[] = [];

      const connectedNodeIds = new Set([
        ...graph.edges.map((e) => e.from),
        ...graph.edges.map((e) => e.to),
      ]);

      for (const node of graph.nodes) {
        if (!connectedNodeIds.has(node.id) && node.type !== 'template') {
          suggestions.push(`"${node.name}" has no connections - consider adding interaction`);
        }
      }

      const hasPlayer = graph.nodes.some((n) => n.name.toLowerCase().includes('player'));
      const hasEnemy = graph.nodes.some((n) => n.name.toLowerCase().includes('enemy'));
      const hasCollectible = graph.nodes.some((n) => n.traits?.includes('collectible'));

      if (hasPlayer && hasEnemy) {
        const hasCombatFlow = graph.flows.some(
          (f) => f.event.includes('attack') || f.actions.some((a) => a.action.includes('attack'))
        );
        if (!hasCombatFlow) {
          suggestions.push('Player and Enemy exist but no combat flow - add attack interactions?');
        }
      }

      if (hasCollectible) {
        const hasCollectFlow = graph.flows.some(
          (f) => f.event.includes('interact') || f.event.includes('collect')
        );
        if (!hasCollectFlow) {
          suggestions.push(
            'Collectibles exist but no collection logic - add on_interact handlers?'
          );
        }
      }

      if (intent) {
        suggestions.push(
          `Based on intent "${intent}": consider adding flows that connect existing nodes.`
        );
      }

      return {
        suggestions,
        stats: {
          nodes: graph.nodes.length,
          connections: graph.edges.length,
          flows: graph.flows.length,
        },
      };
    }

    default:
      throw new Error(`Unknown graph tool: ${name}`);
  }
}
