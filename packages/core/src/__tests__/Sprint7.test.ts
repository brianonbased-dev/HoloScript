/**
 * Sprint 7 Acceptance Tests
 *
 * v3.16.0 — Visual scripting MVP, AI autocomplete, IntelliJ plugin
 *
 * Coverage:
 *   1. Visual node registry   (nodeRegistry.ts)        — 16 tests
 *   2. GraphToCode converter  (codegen/GraphToCode.ts) — 17 tests
 *   3. AI PromptBuilder       (lsp/ai/PromptBuilder.ts)— 13 tests
 *   4. IntelliJ plugin        (plugin manifest + files) — 7  tests
 *                                                Total: 53 tests
 */

import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { join } from 'path';

// ── Visual node registry ──────────────────────────────────────────────────────
import {
  ALL_NODES,
  EVENT_NODES,
  ACTION_NODES,
  LOGIC_NODES,
  DATA_NODES,
  NODE_REGISTRY,
  getNodeDefinition,
  getNodesByCategory,
} from '../../../visual/src/nodes/nodeRegistry.js';

// ── GraphToCode ───────────────────────────────────────────────────────────────
import { GraphToCode, graphToCode } from '../../../visual/src/codegen/GraphToCode.js';
import type { VisualGraph, HoloNode, HoloEdge } from '../../../visual/src/types.js';

// ── PromptBuilder (AI autocomplete) ──────────────────────────────────────────
import { PromptBuilder } from '../../../lsp/src/ai/PromptBuilder.js';
import type { CompletionContext } from '../../../lsp/src/ai/ContextGatherer.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeGraph(nodes: HoloNode[], edges: HoloEdge[] = []): VisualGraph {
  return {
    nodes,
    edges,
    metadata: {
      name: 'Test Graph',
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  };
}

function makeNode(
  id: string,
  type: string,
  category: 'event' | 'action' | 'logic' | 'data',
  label: string,
  properties: Record<string, unknown> = {},
  inputs: unknown[] = [],
  outputs: unknown[] = []
): HoloNode {
  return {
    id,
    type: 'holoNode',
    position: { x: 0, y: 0 },
    data: { type, label, category, properties, inputs, outputs } as HoloNode['data'],
  };
}

function makeCtx(overrides: Partial<CompletionContext> = {}): CompletionContext {
  return {
    type: 'trait',
    linePrefix: '  @',
    lineSuffix: '',
    fullLine: '  @',
    objectName: 'myObj',
    objectType: 'orb',
    existingTraits: ['@physics'],
    existingProperties: ['position'],
    surroundingLines: ['orb myObj {', '  @physics', '  @'],
    indentLevel: 1,
    line: 2,
    column: 3,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Visual node registry
// ─────────────────────────────────────────────────────────────────────────────

describe('Sprint 7 – Visual node registry', () => {
  it('ALL_NODES contains at least 20 node types', () => {
    expect(ALL_NODES.length).toBeGreaterThanOrEqual(20);
  });

  it('EVENT_NODES, ACTION_NODES, LOGIC_NODES, DATA_NODES are non-empty', () => {
    expect(EVENT_NODES.length).toBeGreaterThan(0);
    expect(ACTION_NODES.length).toBeGreaterThan(0);
    expect(LOGIC_NODES.length).toBeGreaterThan(0);
    expect(DATA_NODES.length).toBeGreaterThan(0);
  });

  it('EVENT_NODES contains on_click, on_hover, on_grab, on_tick, on_timer, on_collision, on_trigger', () => {
    const types = EVENT_NODES.map((n) => n.type);
    expect(types).toContain('on_click');
    expect(types).toContain('on_hover');
    expect(types).toContain('on_grab');
    expect(types).toContain('on_tick');
    expect(types).toContain('on_timer');
    expect(types).toContain('on_collision');
    expect(types).toContain('on_trigger');
  });

  it('ACTION_NODES contains play_sound, play_animation, set_property, toggle, spawn, destroy', () => {
    const types = ACTION_NODES.map((n) => n.type);
    expect(types).toContain('play_sound');
    expect(types).toContain('play_animation');
    expect(types).toContain('set_property');
    expect(types).toContain('toggle');
    expect(types).toContain('spawn');
    expect(types).toContain('destroy');
  });

  it('LOGIC_NODES contains if_else, switch, and, or, not, compare, math', () => {
    const types = LOGIC_NODES.map((n) => n.type);
    expect(types).toContain('if_else');
    expect(types).toContain('switch');
    expect(types).toContain('and');
    expect(types).toContain('or');
    expect(types).toContain('not');
    expect(types).toContain('compare');
    expect(types).toContain('math');
  });

  it('DATA_NODES contains get_property, constant, random, interpolate', () => {
    const types = DATA_NODES.map((n) => n.type);
    expect(types).toContain('get_property');
    expect(types).toContain('constant');
    expect(types).toContain('random');
    expect(types).toContain('interpolate');
  });

  it('every node has required fields: type, label, category, description, inputs, outputs', () => {
    for (const node of ALL_NODES) {
      expect(node.type, `${node.type}.type`).toBeTruthy();
      expect(node.label, `${node.type}.label`).toBeTruthy();
      expect(node.category, `${node.type}.category`).toBeTruthy();
      expect(node.description, `${node.type}.description`).toBeTruthy();
      expect(Array.isArray(node.inputs), `${node.type}.inputs`).toBe(true);
      expect(Array.isArray(node.outputs), `${node.type}.outputs`).toBe(true);
    }
  });

  it('NODE_REGISTRY size equals ALL_NODES.length', () => {
    expect(NODE_REGISTRY.size).toBe(ALL_NODES.length);
  });

  it('getNodeDefinition returns definition for known type', () => {
    const def = getNodeDefinition('on_click');
    expect(def).toBeDefined();
    expect(def!.category).toBe('event');
    expect(def!.label).toBe('On Click');
  });

  it('getNodeDefinition returns undefined for unknown type', () => {
    expect(getNodeDefinition('nonexistent_node')).toBeUndefined();
  });

  it('getNodesByCategory returns only nodes of that category', () => {
    const events = getNodesByCategory('event');
    expect(events.length).toBe(EVENT_NODES.length);
    expect(events.every((n) => n.category === 'event')).toBe(true);
  });

  it('event nodes have at least one output port', () => {
    for (const node of EVENT_NODES) {
      expect(node.outputs.length, `${node.type} outputs`).toBeGreaterThan(0);
    }
  });

  it('all categories have correct string values', () => {
    const categories = new Set(ALL_NODES.map((n) => n.category));
    expect(categories).toContain('event');
    expect(categories).toContain('action');
    expect(categories).toContain('logic');
    expect(categories).toContain('data');
  });

  it('on_timer node has delay and repeat properties', () => {
    const timer = getNodeDefinition('on_timer');
    expect(timer).toBeDefined();
    const propIds = timer!.properties!.map((p) => p.id);
    expect(propIds).toContain('delay');
    expect(propIds).toContain('repeat');
  });

  it('compare node has operator property with select options', () => {
    const compare = getNodeDefinition('compare');
    expect(compare).toBeDefined();
    const opProp = compare!.properties?.find((p) => p.id === 'operator');
    expect(opProp).toBeDefined();
    expect(opProp!.options).toBeDefined();
    expect(opProp!.options!.length).toBeGreaterThan(0);
  });

  it('math node has +, -, *, / operator options', () => {
    const math = getNodeDefinition('math');
    const opProp = math!.properties?.find((p) => p.id === 'operator');
    const values = opProp!.options!.map((o) => o.value);
    expect(values).toContain('+');
    expect(values).toContain('-');
    expect(values).toContain('*');
    expect(values).toContain('/');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. GraphToCode
// ─────────────────────────────────────────────────────────────────────────────

describe('Sprint 7 – GraphToCode converter', () => {
  it('empty graph generates an orb block', () => {
    const result = graphToCode(makeGraph([]), { objectName: 'emptyOrb' });
    expect(result.errors).toHaveLength(0);
    expect(result.code).toContain('orb emptyOrb');
  });

  it('warns when graph has no event nodes', () => {
    const result = graphToCode(makeGraph([]));
    expect(result.warnings.some((w) => w.includes('event nodes'))).toBe(true);
  });

  it('unknown node type adds an error', () => {
    const nodes = [makeNode('1', 'unknown_xyz', 'event', 'X')];
    const result = graphToCode(makeGraph(nodes));
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toContain('unknown_xyz');
  });

  it('on_click adds @clickable trait', () => {
    const nodes = [makeNode('1', 'on_click', 'event', 'On Click')];
    const result = graphToCode(makeGraph(nodes));
    expect(result.code).toContain('@clickable');
  });

  it('on_grab adds @grabbable trait', () => {
    const nodes = [makeNode('1', 'on_grab', 'event', 'On Grab')];
    const result = graphToCode(makeGraph(nodes));
    expect(result.code).toContain('@grabbable');
  });

  it('on_hover adds @hoverable trait', () => {
    const nodes = [makeNode('1', 'on_hover', 'event', 'On Hover')];
    const result = graphToCode(makeGraph(nodes));
    expect(result.code).toContain('@hoverable');
  });

  it('on_collision adds @collidable trait', () => {
    const nodes = [makeNode('1', 'on_collision', 'event', 'On Collision')];
    const result = graphToCode(makeGraph(nodes));
    expect(result.code).toContain('@collidable');
  });

  it('event → play_sound chain generates audio.play()', () => {
    const nodes = [
      makeNode(
        'e1',
        'on_click',
        'event',
        'On Click',
        {},
        [],
        [{ id: 'flow', label: 'Execute', type: 'flow' }]
      ),
      makeNode(
        'a1',
        'play_sound',
        'action',
        'Play Sound',
        { url: 'beep.mp3' },
        [{ id: 'flow' }],
        []
      ),
    ];
    const edges: HoloEdge[] = [
      {
        id: 'e1a1',
        source: 'e1',
        target: 'a1',
        sourceHandle: 'flow',
        targetHandle: 'flow',
      } as HoloEdge,
    ];
    const result = graphToCode(makeGraph(nodes, edges));
    expect(result.code).toContain('audio.play("beep.mp3")');
  });

  it('event → toggle chain generates this.x = !this.x', () => {
    const nodes = [
      makeNode('e1', 'on_click', 'event', 'On Click', {}, [], [{ id: 'flow' }]),
      makeNode('a1', 'toggle', 'action', 'Toggle', { property: 'visible' }, [{ id: 'flow' }], []),
    ];
    const edges: HoloEdge[] = [
      {
        id: 'e1a1',
        source: 'e1',
        target: 'a1',
        sourceHandle: 'flow',
        targetHandle: 'flow',
      } as HoloEdge,
    ];
    const result = graphToCode(makeGraph(nodes, edges));
    expect(result.code).toContain('this.visible = !this.visible');
  });

  it('event → spawn generates scene.spawn()', () => {
    const nodes = [
      makeNode('e1', 'on_click', 'event', 'On Click', {}, [], [{ id: 'flow' }]),
      makeNode('a1', 'spawn', 'action', 'Spawn', { template: 'Orb' }, [{ id: 'flow' }], []),
    ];
    const edges: HoloEdge[] = [
      {
        id: 'e1a1',
        source: 'e1',
        target: 'a1',
        sourceHandle: 'flow',
        targetHandle: 'flow',
      } as HoloEdge,
    ];
    const result = graphToCode(makeGraph(nodes, edges));
    expect(result.code).toContain('scene.spawn("Orb")');
  });

  it('event → destroy generates this.destroy()', () => {
    const nodes = [
      makeNode('e1', 'on_click', 'event', 'On Click', {}, [], [{ id: 'flow' }]),
      makeNode('a1', 'destroy', 'action', 'Destroy', {}, [{ id: 'flow' }], []),
    ];
    const edges: HoloEdge[] = [
      {
        id: 'e1a1',
        source: 'e1',
        target: 'a1',
        sourceHandle: 'flow',
        targetHandle: 'flow',
      } as HoloEdge,
    ];
    const result = graphToCode(makeGraph(nodes, edges));
    expect(result.code).toContain('this.destroy()');
  });

  it('format: hs produces # comment header', () => {
    const nodes = [makeNode('1', 'on_click', 'event', 'On Click')];
    const result = graphToCode(makeGraph(nodes), { format: 'hs' });
    expect(result.format).toBe('hs');
    expect(result.code).toContain('# Generated from');
  });

  it('format: holo produces composition block with environment and logic', () => {
    const nodes = [makeNode('1', 'on_click', 'event', 'On Click')];
    const result = graphToCode(makeGraph(nodes), { format: 'holo' });
    expect(result.format).toBe('holo');
    expect(result.code).toContain('composition');
    expect(result.code).toContain('environment');
    expect(result.code).toContain('logic');
  });

  it('includeComments: false omits the Generated from line', () => {
    const result = graphToCode(makeGraph([]), { includeComments: false });
    expect(result.code).not.toContain('Generated from');
  });

  it('vector3 data node generates [x, y, z]', () => {
    const node = makeNode('1', 'vector3', 'data', 'Vector3', { x: 1, y: 2, z: 3 });
    const converter = new GraphToCode();
    const ctx = { node, incomingEdges: [], outgoingEdges: [], processed: false, code: '' };
    const code = (converter as any).generateDataNodeCode(ctx, 'vector');
    expect(code).toBe('[1, 2, 3]');
  });

  it('random data node generates random(min, max)', () => {
    const node = makeNode('1', 'random', 'data', 'Random', { min: 5, max: 50 });
    const converter = new GraphToCode();
    const ctx = { node, incomingEdges: [], outgoingEdges: [], processed: false, code: '' };
    const code = (converter as any).generateDataNodeCode(ctx, 'value');
    expect(code).toContain('random(5, 50)');
  });

  it('this data node generates "this"', () => {
    const node = makeNode('1', 'this', 'data', 'This', {});
    const converter = new GraphToCode();
    const ctx = { node, incomingEdges: [], outgoingEdges: [], processed: false, code: '' };
    const code = (converter as any).generateDataNodeCode(ctx, 'object');
    expect(code).toBe('this');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. AI PromptBuilder
// ─────────────────────────────────────────────────────────────────────────────

describe('Sprint 7 – AI PromptBuilder', () => {
  const builder = new PromptBuilder();

  it('is instantiable', () => {
    expect(builder).toBeDefined();
  });

  it('buildTraitPrompt returns a non-empty string', () => {
    const p = builder.buildTraitPrompt(makeCtx());
    expect(typeof p).toBe('string');
    expect(p.length).toBeGreaterThan(50);
  });

  it('buildTraitPrompt contains HoloScript in system prompt', () => {
    expect(builder.buildTraitPrompt(makeCtx()).toLowerCase()).toContain('holoscript');
  });

  it('buildTraitPrompt lists existing traits', () => {
    const p = builder.buildTraitPrompt(makeCtx({ existingTraits: ['@collidable', '@animated'] }));
    expect(p).toMatch(/collidable|animated/);
  });

  it('buildTraitPrompt includes the object name', () => {
    const p = builder.buildTraitPrompt(makeCtx({ objectName: 'interactiveDoor' }));
    expect(p).toContain('interactiveDoor');
  });

  it('buildCodeGenPrompt includes the comment text', () => {
    const p = builder.buildCodeGenPrompt(
      makeCtx({ type: 'comment', comment: 'Create a spinning orb' })
    );
    expect(p).toContain('Create a spinning orb');
  });

  it('buildCodeGenPrompt returns non-empty string', () => {
    const p = builder.buildCodeGenPrompt(makeCtx({ comment: 'add physics' }));
    expect(p.length).toBeGreaterThan(0);
  });

  it('buildPropertyPrompt mentions existing properties', () => {
    const p = builder.buildPropertyPrompt(makeCtx({ existingProperties: ['rotation', 'scale'] }));
    expect(p).toMatch(/rotation|scale/);
  });

  it('buildEventPrompt includes trait-to-event mappings', () => {
    const p = builder.buildEventPrompt(makeCtx({ existingTraits: ['@grabbable'] }));
    expect(p.toLowerCase()).toMatch(/grab|release/);
  });

  it('buildGeneralPrompt returns a string', () => {
    const p = builder.buildGeneralPrompt(makeCtx({ type: 'general' }));
    expect(typeof p).toBe('string');
    expect(p.length).toBeGreaterThan(0);
  });

  it('buildTraitRecommendationPrompt returns a string mentioning object name', () => {
    const p = builder.buildTraitRecommendationPrompt(makeCtx({ objectName: 'spinningCube' }));
    expect(p).toContain('spinningCube');
  });

  it('buildErrorFixPrompt includes error message text', () => {
    const errCtx = { ...makeCtx(), errorMessage: 'Unknown: colr', errorLine: 2, errorColumn: 4 };
    const p = builder.buildErrorFixPrompt(errCtx, {
      message: 'Unknown property: colr',
      line: 2,
      column: 4,
    });
    expect(p).toMatch(/colr/);
  });

  it('all prompt methods tolerate minimal context without throwing', () => {
    const minimal: CompletionContext = {
      type: 'general',
      linePrefix: '',
      lineSuffix: '',
      fullLine: '',
      surroundingLines: [],
      indentLevel: 0,
      line: 0,
      column: 0,
    };
    expect(() => builder.buildTraitPrompt(minimal)).not.toThrow();
    expect(() => builder.buildPropertyPrompt(minimal)).not.toThrow();
    expect(() => builder.buildEventPrompt(minimal)).not.toThrow();
    expect(() => builder.buildGeneralPrompt(minimal)).not.toThrow();
    expect(() => builder.buildCodeGenPrompt(minimal)).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. IntelliJ plugin
// ─────────────────────────────────────────────────────────────────────────────
// NOTE: IntelliJ plugin (packages/intellij) was removed in v6.0.0
// These tests are permanently skipped as the plugin is no longer maintained
// VSCode extension is the primary IDE integration path

describe.skip('Sprint 7 – IntelliJ plugin (packages/intellij removed)', () => {
  // IntelliJ package removed — tests kept for archival purposes only
  // IDE integration now handled by @holoscript/lsp and vscode extension
});
