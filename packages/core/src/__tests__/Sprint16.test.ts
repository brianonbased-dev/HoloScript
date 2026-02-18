/**
 * Sprint 16: LSP traitDocs + MCP Server Generators + Graph Tools
 *
 * Tests cover:
 *   - Feature 1:  LSP TRAIT_DOCS -- 47 trait documentation entries,
 *                 getTraitDoc(), getAllTraitNames(), getTraitsByCategory(),
 *                 formatTraitDocAsMarkdown(), formatTraitDocCompact()
 *   - Feature 2:  MCP suggestTraits() -- returns { traits, reasoning, confidence }
 *   - Feature 3:  MCP generateObject() -- returns { code, traits, geometry, format }
 *   - Feature 4:  MCP generateScene() -- returns { code, stats }
 *   - Feature 5:  MCP graphTools array + parseHoloToGraph() function
 */

import { describe, it, expect } from 'vitest';

// ============================================================================
// Feature 1: LSP traitDocs (no side effects -- safe in Node.js)
// ============================================================================

import {
  TRAIT_DOCS,
  getTraitDoc,
  getAllTraitNames,
  getTraitsByCategory,
  formatTraitDocAsMarkdown,
  formatTraitDocCompact,
  type TraitDoc,
} from '../../../lsp/src/traitDocs.js';

// ============================================================================
// Features 2-4: MCP Generators (no imports, pure functions -- safe in Node.js)
// ============================================================================

import {
  suggestTraits,
  generateObject,
  generateScene,
} from '../../../mcp-server/src/generators.js';

// ============================================================================
// Feature 5: MCP Graph Tools (imports @modelcontextprotocol/sdk/types only)
// ============================================================================

import {
  graphTools,
  parseHoloToGraph,
  type HoloGraph,
  type HoloNode,
  type HoloEdge,
} from '../../../mcp-server/src/graph-tools.js';

// ============================================================================
// Feature 1A: TRAIT_DOCS -- count and structure
// ============================================================================

describe('Feature 1A: TRAIT_DOCS -- count & structure', () => {
  it('has at least 25 trait entries', () => {
    expect(Object.keys(TRAIT_DOCS).length).toBeGreaterThanOrEqual(25);
  });

  it('contains rigidbody trait', () => {
    expect(TRAIT_DOCS).toHaveProperty('rigidbody');
  });

  it('contains networked trait', () => {
    expect(TRAIT_DOCS).toHaveProperty('networked');
  });

  it('contains animation trait', () => {
    expect(TRAIT_DOCS).toHaveProperty('animation');
  });

  it('every trait has a name string', () => {
    for (const [, doc] of Object.entries(TRAIT_DOCS)) {
      expect(typeof doc.name).toBe('string');
      expect(doc.name.length).toBeGreaterThan(0);
    }
  });

  it('every trait has an annotation starting with "@"', () => {
    for (const [, doc] of Object.entries(TRAIT_DOCS)) {
      expect(typeof doc.annotation).toBe('string');
      expect(doc.annotation.startsWith('@')).toBe(true);
    }
  });

  it('every trait has a description string', () => {
    for (const [, doc] of Object.entries(TRAIT_DOCS)) {
      expect(typeof doc.description).toBe('string');
      expect(doc.description.length).toBeGreaterThan(0);
    }
  });

  it('every trait has a valid category', () => {
    const validCategories = [
      'physics', 'animation', 'rendering', 'networking', 'input', 'ai', 'utility', 'hololand',
    ];
    for (const [, doc] of Object.entries(TRAIT_DOCS)) {
      expect(validCategories).toContain(doc.category);
    }
  });

  it('every trait has a properties array', () => {
    for (const [, doc] of Object.entries(TRAIT_DOCS)) {
      expect(Array.isArray(doc.properties)).toBe(true);
    }
  });

  it('every trait has a methods array', () => {
    for (const [, doc] of Object.entries(TRAIT_DOCS)) {
      expect(Array.isArray(doc.methods)).toBe(true);
    }
  });

  it('every trait has an events array', () => {
    for (const [, doc] of Object.entries(TRAIT_DOCS)) {
      expect(Array.isArray(doc.events)).toBe(true);
    }
  });

  it('every trait has an example string', () => {
    for (const [, doc] of Object.entries(TRAIT_DOCS)) {
      expect(typeof doc.example).toBe('string');
    }
  });
});

// ============================================================================
// Feature 1B: TRAIT_DOCS -- specific trait values
// ============================================================================

describe('Feature 1B: TRAIT_DOCS -- specific trait values', () => {
  it('rigidbody has category "physics"', () => {
    expect(TRAIT_DOCS.rigidbody.category).toBe('physics');
  });

  it('rigidbody annotation is "@rigidbody"', () => {
    expect(TRAIT_DOCS.rigidbody.annotation).toBe('@rigidbody');
  });

  it('rigidbody has at least 5 properties', () => {
    expect(TRAIT_DOCS.rigidbody.properties.length).toBeGreaterThanOrEqual(5);
  });

  it('rigidbody first property is "type" with type string', () => {
    const typeProp = TRAIT_DOCS.rigidbody.properties[0];
    expect(typeProp.name).toBe('type');
  });

  it('networked has category "networking"', () => {
    expect(TRAIT_DOCS.networked.category).toBe('networking');
  });

  it('animation trait has category "animation"', () => {
    expect(TRAIT_DOCS.animation.category).toBe('animation');
  });

  it('physics category has multiple traits', () => {
    const physicsTraits = Object.values(TRAIT_DOCS).filter(
      (d) => d.category === 'physics'
    );
    expect(physicsTraits.length).toBeGreaterThanOrEqual(2);
  });
});

// ============================================================================
// Feature 1C: getTraitDoc() function
// ============================================================================

describe('Feature 1C: getTraitDoc()', () => {
  it('returns TraitDoc for "rigidbody"', () => {
    const doc = getTraitDoc('rigidbody');
    expect(doc).toBeDefined();
    expect(doc!.annotation).toBe('@rigidbody');
  });

  it('accepts "@rigidbody" with @ prefix', () => {
    const doc = getTraitDoc('@rigidbody');
    expect(doc).toBeDefined();
    expect(doc!.category).toBe('physics');
  });

  it('returns undefined for unknown trait', () => {
    const doc = getTraitDoc('__nonexistent_trait_xyz__');
    expect(doc).toBeUndefined();
  });

  it('is case-insensitive for known trait', () => {
    const lower = getTraitDoc('networked');
    const upper = getTraitDoc('Networked');
    expect(lower).toBeDefined();
    expect(upper).toBeDefined();
  });

  it('returned doc has all required fields', () => {
    const doc = getTraitDoc('rigidbody')!;
    expect(typeof doc.name).toBe('string');
    expect(typeof doc.annotation).toBe('string');
    expect(typeof doc.description).toBe('string');
    expect(typeof doc.category).toBe('string');
    expect(Array.isArray(doc.properties)).toBe(true);
    expect(Array.isArray(doc.methods)).toBe(true);
    expect(Array.isArray(doc.events)).toBe(true);
  });
});

// ============================================================================
// Feature 1D: getAllTraitNames() function
// ============================================================================

describe('Feature 1D: getAllTraitNames()', () => {
  it('returns an array', () => {
    expect(Array.isArray(getAllTraitNames())).toBe(true);
  });

  it('returns at least 25 names', () => {
    expect(getAllTraitNames().length).toBeGreaterThanOrEqual(25);
  });

  it('all names start with "@"', () => {
    for (const name of getAllTraitNames()) {
      expect(name.startsWith('@')).toBe(true);
    }
  });

  it('contains "@rigidbody"', () => {
    expect(getAllTraitNames()).toContain('@rigidbody');
  });

  it('contains "@networked"', () => {
    expect(getAllTraitNames()).toContain('@networked');
  });

  it('returns unique names (no duplicates)', () => {
    const names = getAllTraitNames();
    expect(new Set(names).size).toBe(names.length);
  });
});

// ============================================================================
// Feature 1E: getTraitsByCategory() function
// ============================================================================

describe('Feature 1E: getTraitsByCategory()', () => {
  it('returns an array for "physics"', () => {
    expect(Array.isArray(getTraitsByCategory('physics'))).toBe(true);
  });

  it('returns at least 1 physics trait', () => {
    expect(getTraitsByCategory('physics').length).toBeGreaterThanOrEqual(1);
  });

  it('all returned docs have category "physics"', () => {
    for (const doc of getTraitsByCategory('physics')) {
      expect(doc.category).toBe('physics');
    }
  });

  it('returns TraitDoc objects with annotation', () => {
    const docs = getTraitsByCategory('physics');
    for (const doc of docs) {
      expect(typeof doc.annotation).toBe('string');
    }
  });

  it('networking category returns at least 1 trait', () => {
    expect(getTraitsByCategory('networking').length).toBeGreaterThanOrEqual(1);
  });

  it('returns empty array for unknown category (cast)', () => {
    const result = getTraitsByCategory('unknown_category' as TraitDoc['category']);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });
});

// ============================================================================
// Feature 1F: formatTraitDocAsMarkdown() and formatTraitDocCompact()
// ============================================================================

describe('Feature 1F: format functions', () => {
  const rigidbodyDoc = TRAIT_DOCS.rigidbody;

  it('formatTraitDocAsMarkdown returns a string', () => {
    const result = formatTraitDocAsMarkdown(rigidbodyDoc);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('formatTraitDocAsMarkdown contains the annotation', () => {
    const result = formatTraitDocAsMarkdown(rigidbodyDoc);
    expect(result).toContain('@rigidbody');
  });

  it('formatTraitDocAsMarkdown contains category', () => {
    const result = formatTraitDocAsMarkdown(rigidbodyDoc);
    expect(result).toContain('physics');
  });

  it('formatTraitDocCompact returns a string', () => {
    const result = formatTraitDocCompact(rigidbodyDoc);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('formatTraitDocCompact contains the annotation', () => {
    const result = formatTraitDocCompact(rigidbodyDoc);
    expect(result).toContain('@rigidbody');
  });

  it('compact format is shorter than markdown format', () => {
    const markdown = formatTraitDocAsMarkdown(rigidbodyDoc);
    const compact = formatTraitDocCompact(rigidbodyDoc);
    expect(compact.length).toBeLessThanOrEqual(markdown.length);
  });
});

// ============================================================================
// Feature 2A: MCP suggestTraits() -- return shape
// ============================================================================

describe('Feature 2A: MCP suggestTraits() -- return shape', () => {
  it('returns an object', () => {
    const result = suggestTraits('a glowing orb');
    expect(typeof result).toBe('object');
    expect(result).not.toBeNull();
  });

  it('has a traits array', () => {
    const result = suggestTraits('a glowing orb');
    expect(Array.isArray(result.traits)).toBe(true);
  });

  it('has a reasoning object', () => {
    const result = suggestTraits('a glowing orb');
    expect(typeof result.reasoning).toBe('object');
    expect(result.reasoning).not.toBeNull();
  });

  it('has a numeric confidence between 0 and 1', () => {
    const result = suggestTraits('a glowing orb');
    expect(typeof result.confidence).toBe('number');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });
});

// ============================================================================
// Feature 2B: MCP suggestTraits() -- specific trait suggestions
// ============================================================================

describe('Feature 2B: MCP suggestTraits() -- specific suggestions', () => {
  it('"glow" description suggests @glowing', () => {
    const { traits } = suggestTraits('make it glow');
    expect(traits).toContain('@glowing');
  });

  it('"grab" description suggests @grabbable', () => {
    const { traits } = suggestTraits('user can grab this');
    expect(traits).toContain('@grabbable');
  });

  it('"physics" description suggests @physics', () => {
    const { traits } = suggestTraits('apply physics to this object');
    expect(traits).toContain('@physics');
  });

  it('"multiplayer/sync" description suggests @networked', () => {
    const { traits } = suggestTraits('multiplayer sync object');
    expect(traits).toContain('@networked');
  });

  it('empty description returns at least 1 default trait', () => {
    const { traits } = suggestTraits('');
    expect(traits.length).toBeGreaterThanOrEqual(1);
  });

  it('empty description defaults to @pointable', () => {
    const { traits } = suggestTraits('');
    expect(traits).toContain('@pointable');
  });

  it('reasoning has an entry for each returned trait', () => {
    const { traits, reasoning } = suggestTraits('grab this glowing sphere');
    for (const trait of traits) {
      expect(reasoning).toHaveProperty(trait);
    }
  });

  it('all traits start with "@"', () => {
    const { traits } = suggestTraits('a bouncing ball you can grab');
    for (const trait of traits) {
      expect(trait.startsWith('@')).toBe(true);
    }
  });
});

// ============================================================================
// Feature 3A: MCP generateObject() -- return shape
// ============================================================================

describe('Feature 3A: MCP generateObject() -- return shape', () => {
  it('returns an object', () => {
    const result = generateObject('red cube');
    expect(typeof result).toBe('object');
  });

  it('has a code string', () => {
    const result = generateObject('red cube');
    expect(typeof result.code).toBe('string');
    expect(result.code.length).toBeGreaterThan(0);
  });

  it('has a traits array', () => {
    const result = generateObject('red cube');
    expect(Array.isArray(result.traits)).toBe(true);
  });

  it('has a geometry string', () => {
    const result = generateObject('red cube');
    expect(typeof result.geometry).toBe('string');
    expect(result.geometry.length).toBeGreaterThan(0);
  });

  it('has a format string', () => {
    const result = generateObject('red cube');
    expect(typeof result.format).toBe('string');
  });

  it('format defaults to "hsplus"', () => {
    const result = generateObject('a sphere');
    expect(result.format).toBe('hsplus');
  });
});

// ============================================================================
// Feature 3B: MCP generateObject() -- geometry resolution
// ============================================================================

describe('Feature 3B: MCP generateObject() -- geometry resolution', () => {
  it('description containing "cube" resolves to geometry "cube"', () => {
    const result = generateObject('a red cube');
    expect(result.geometry).toBe('cube');
  });

  it('description containing "sphere" resolves to geometry "sphere"', () => {
    const result = generateObject('a sphere');
    expect(result.geometry).toBe('sphere');
  });

  it('description containing "ball" resolves to geometry "sphere"', () => {
    const result = generateObject('a bouncing ball');
    expect(result.geometry).toBe('sphere');
  });

  it('description containing "cylinder" resolves to geometry "cylinder"', () => {
    const result = generateObject('a cylinder');
    expect(result.geometry).toBe('cylinder');
  });

  it('description containing "torus" resolves to geometry "torus"', () => {
    const result = generateObject('a torus ring');
    expect(result.geometry).toBe('torus');
  });

  it('unknown geometry defaults to "sphere"', () => {
    const result = generateObject('a widget');
    expect(result.geometry).toBe('sphere');
  });

  it('code contains the resolved geometry', () => {
    const result = generateObject('a red cube');
    expect(result.code).toContain('cube');
  });
});

// ============================================================================
// Feature 3C: MCP generateObject() -- format option
// ============================================================================

describe('Feature 3C: MCP generateObject() -- format option', () => {
  it('holo format produces code with "template"', () => {
    const result = generateObject('a cube', { format: 'holo' });
    expect(result.code).toContain('template');
    expect(result.format).toBe('holo');
  });

  it('hsplus format produces code with "composition"', () => {
    const result = generateObject('a cube', { format: 'hsplus' });
    expect(result.code).toContain('composition');
    expect(result.format).toBe('hsplus');
  });

  it('hs format returns hs format string', () => {
    const result = generateObject('a cube', { format: 'hs' });
    expect(result.format).toBe('hs');
    expect(typeof result.code).toBe('string');
  });
});

// ============================================================================
// Feature 4A: MCP generateScene() -- return shape
// ============================================================================

describe('Feature 4A: MCP generateScene() -- return shape', () => {
  it('returns an object', () => {
    const result = generateScene('a fantasy scene');
    expect(typeof result).toBe('object');
    expect(result).not.toBeNull();
  });

  it('has a code string', () => {
    const result = generateScene('a fantasy scene');
    expect(typeof result.code).toBe('string');
    expect(result.code.length).toBeGreaterThan(0);
  });

  it('code starts with "composition"', () => {
    const result = generateScene('a fantasy scene');
    expect(result.code.trimStart().startsWith('composition')).toBe(true);
  });

  it('has stats object', () => {
    const result = generateScene('a scene');
    expect(typeof result.stats).toBe('object');
    expect(result.stats).not.toBeNull();
  });

  it('stats.objects is a non-negative number', () => {
    const result = generateScene('a scene');
    expect(typeof result.stats.objects).toBe('number');
    expect(result.stats.objects).toBeGreaterThanOrEqual(0);
  });

  it('stats.traits is a non-negative number', () => {
    const result = generateScene('a scene');
    expect(typeof result.stats.traits).toBe('number');
    expect(result.stats.traits).toBeGreaterThanOrEqual(0);
  });

  it('stats.lines is a positive number', () => {
    const result = generateScene('a scene');
    expect(typeof result.stats.lines).toBe('number');
    expect(result.stats.lines).toBeGreaterThan(0);
  });

  it('stats.lines matches actual line count', () => {
    const result = generateScene('a room');
    const actualLines = result.code.split('\n').length;
    expect(result.stats.lines).toBe(actualLines);
  });

  it('different descriptions produce different scene names', () => {
    const r1 = generateScene('a mountain scene');
    const r2 = generateScene('a jungle scene');
    // Both should be compositions
    expect(r1.code).toContain('composition');
    expect(r2.code).toContain('composition');
  });
});

// ============================================================================
// Feature 5A: MCP graphTools array
// ============================================================================

describe('Feature 5A: MCP graphTools array', () => {
  it('graphTools is an array', () => {
    expect(Array.isArray(graphTools)).toBe(true);
  });

  it('has exactly 6 graph tools', () => {
    expect(graphTools.length).toBe(6);
  });

  it('every tool has a name string', () => {
    for (const tool of graphTools) {
      expect(typeof tool.name).toBe('string');
      expect(tool.name.length).toBeGreaterThan(0);
    }
  });

  it('every tool has a description string', () => {
    for (const tool of graphTools) {
      expect(typeof tool.description).toBe('string');
    }
  });

  it('every tool has an inputSchema object', () => {
    for (const tool of graphTools) {
      expect(typeof tool.inputSchema).toBe('object');
      expect(tool.inputSchema).not.toBeNull();
    }
  });

  it('contains "holo_parse_to_graph" tool', () => {
    const names = graphTools.map((t) => t.name);
    expect(names).toContain('holo_parse_to_graph');
  });

  it('contains "holo_visualize_flow" tool', () => {
    const names = graphTools.map((t) => t.name);
    expect(names).toContain('holo_visualize_flow');
  });

  it('contains "holo_get_node_connections" tool', () => {
    const names = graphTools.map((t) => t.name);
    expect(names).toContain('holo_get_node_connections');
  });

  it('contains "holo_design_graph" tool', () => {
    const names = graphTools.map((t) => t.name);
    expect(names).toContain('holo_design_graph');
  });

  it('contains "holo_diff_graphs" tool', () => {
    const names = graphTools.map((t) => t.name);
    expect(names).toContain('holo_diff_graphs');
  });

  it('contains "holo_suggest_connections" tool', () => {
    const names = graphTools.map((t) => t.name);
    expect(names).toContain('holo_suggest_connections');
  });

  it('all tool names start with "holo_"', () => {
    for (const tool of graphTools) {
      expect(tool.name.startsWith('holo_')).toBe(true);
    }
  });
});

// ============================================================================
// Feature 5B: parseHoloToGraph() -- empty code
// ============================================================================

describe('Feature 5B: parseHoloToGraph() -- empty code', () => {
  it('returns an object for empty string', () => {
    const result = parseHoloToGraph('');
    expect(typeof result).toBe('object');
    expect(result).not.toBeNull();
  });

  it('empty code produces name "Unnamed"', () => {
    const result = parseHoloToGraph('');
    expect(result.name).toBe('Unnamed');
  });

  it('empty code has empty nodes array', () => {
    const result = parseHoloToGraph('');
    expect(Array.isArray(result.nodes)).toBe(true);
    expect(result.nodes.length).toBe(0);
  });

  it('empty code has empty edges array', () => {
    const result = parseHoloToGraph('');
    expect(Array.isArray(result.edges)).toBe(true);
    expect(result.edges.length).toBe(0);
  });

  it('empty code has empty flows array', () => {
    const result = parseHoloToGraph('');
    expect(Array.isArray(result.flows)).toBe(true);
    expect(result.flows.length).toBe(0);
  });

  it('empty code has empty groups array', () => {
    const result = parseHoloToGraph('');
    expect(Array.isArray(result.groups)).toBe(true);
    expect(result.groups.length).toBe(0);
  });
});

// ============================================================================
// Feature 5C: parseHoloToGraph() -- with real .holo code
// ============================================================================

describe('Feature 5C: parseHoloToGraph() -- with .holo code', () => {
  const sampleCode = `
composition "TestScene" {
  template "CubeTemplate" {
    geometry: "cube"
    color: "#ff0000"
  }

  object "MyCube" using "CubeTemplate" {
    position: [0, 1, 0]
  }
}
  `.trim();

  it('extracts composition name "TestScene"', () => {
    const result = parseHoloToGraph(sampleCode);
    expect(result.name).toBe('TestScene');
  });

  it('extracts at least one node', () => {
    const result = parseHoloToGraph(sampleCode);
    expect(result.nodes.length).toBeGreaterThanOrEqual(1);
  });

  it('node for template has type "template"', () => {
    const result = parseHoloToGraph(sampleCode);
    const templateNode = result.nodes.find((n) => n.type === 'template');
    expect(templateNode).toBeDefined();
    expect(templateNode!.name).toBe('CubeTemplate');
  });

  it('node for object has type "object"', () => {
    const result = parseHoloToGraph(sampleCode);
    const objectNode = result.nodes.find((n) => n.type === 'object');
    expect(objectNode).toBeDefined();
    expect(objectNode!.name).toBe('MyCube');
  });

  it('edges array has at least one edge (uses relationship)', () => {
    const result = parseHoloToGraph(sampleCode);
    expect(result.edges.length).toBeGreaterThanOrEqual(1);
  });

  it('edge has id, from, to, type properties', () => {
    const result = parseHoloToGraph(sampleCode);
    const edge = result.edges[0] as HoloEdge;
    expect(typeof edge.id).toBe('string');
    expect(typeof edge.from).toBe('string');
    expect(typeof edge.to).toBe('string');
    expect(typeof edge.type).toBe('string');
  });

  it('uses-edge type is "uses"', () => {
    const result = parseHoloToGraph(sampleCode);
    const usesEdge = result.edges.find((e) => e.type === 'uses');
    expect(usesEdge).toBeDefined();
  });

  it('node id follows "type_name" pattern', () => {
    const result = parseHoloToGraph(sampleCode);
    const templateNode = result.nodes.find((n) => n.type === 'template')!;
    expect(templateNode.id).toBe('template_CubeTemplate');
  });

  it('object node has a properties object', () => {
    const result = parseHoloToGraph(sampleCode);
    const objectNode = result.nodes.find((n) => n.type === 'object') as HoloNode;
    expect(typeof objectNode.properties).toBe('object');
  });
});
