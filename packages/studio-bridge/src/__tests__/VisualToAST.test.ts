/**
 * Tests for VisualToAST translator
 */

import { describe, it, expect } from 'vitest';
import { VisualToAST, visualToAST } from '../VisualToAST';
import type { VisualGraph, HoloNode, HoloEdge } from '../types';

// ============================================================================
// Test Helpers
// ============================================================================

function createTestGraph(nodes: HoloNode[], edges: HoloEdge[] = []): VisualGraph {
  return {
    nodes,
    edges,
    metadata: {
      name: 'Test Graph',
      version: '1.0.0',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  };
}

function createNode(
  id: string,
  type: string,
  category: 'event' | 'action' | 'logic' | 'data',
  label: string,
  properties: Record<string, unknown> = {},
  inputs: Array<{ id: string; label: string; type: string }> = [],
  outputs: Array<{ id: string; label: string; type: string }> = [],
): HoloNode {
  return {
    id,
    type: 'holoNode',
    position: { x: 0, y: 0 },
    data: {
      type,
      label,
      category,
      properties,
      inputs: inputs as any,
      outputs: outputs as any,
    },
  };
}

function createEdge(
  id: string,
  source: string,
  target: string,
  sourceHandle?: string,
  targetHandle?: string,
): HoloEdge {
  return {
    id,
    source,
    target,
    sourceHandle: sourceHandle || null,
    targetHandle: targetHandle || null,
    data: {
      sourcePort: sourceHandle || 'flow',
      targetPort: targetHandle || 'flow',
      flowType: 'flow' as any,
    },
  } as any;
}

// ============================================================================
// Tests
// ============================================================================

describe('VisualToAST', () => {
  describe('constructor and options', () => {
    it('should create with default options', () => {
      const translator = new VisualToAST();
      expect(translator).toBeInstanceOf(VisualToAST);
    });

    it('should accept custom options', () => {
      const translator = new VisualToAST({
        format: 'holo',
        objectName: 'myOrb',
        includeComments: false,
      });
      expect(translator).toBeInstanceOf(VisualToAST);
    });
  });

  describe('empty graph translation', () => {
    it('should translate an empty graph to an orb with no handlers', () => {
      const graph = createTestGraph([]);
      const result = visualToAST(graph, { objectName: 'emptyOrb' });

      expect(result.ast).toHaveLength(1);
      expect(result.ast[0].type).toBe('orb');
      expect(result.code).toContain('orb emptyOrb');
      expect(result.format).toBe('hsplus');
    });

    it('should warn about missing event nodes', () => {
      const graph = createTestGraph([]);
      const result = visualToAST(graph);

      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({
          severity: 'warning',
          code: 'BRIDGE_NO_EVENTS',
        }),
      );
    });
  });

  describe('event node translation', () => {
    it('should translate on_click event to AST handler', () => {
      const nodes = [
        createNode('ev1', 'on_click', 'event', 'On Click', {}, [],
          [{ id: 'flow', label: 'Execute', type: 'flow' }]),
      ];
      const graph = createTestGraph(nodes);
      const result = visualToAST(graph);

      expect(result.code).toContain('@clickable');
      expect(result.code).toContain('on_click:');
      expect(result.mappings.length).toBeGreaterThan(0);
    });

    it('should translate on_hover event', () => {
      const nodes = [
        createNode('ev1', 'on_hover', 'event', 'On Hover', {}, [],
          [{ id: 'enter', label: 'On Enter', type: 'flow' }]),
      ];
      const graph = createTestGraph(nodes);
      const result = visualToAST(graph);

      expect(result.code).toContain('@hoverable');
      expect(result.code).toContain('on_hover_enter:');
    });

    it('should translate on_grab event', () => {
      const nodes = [
        createNode('ev1', 'on_grab', 'event', 'On Grab', {}, [],
          [{ id: 'grab', label: 'On Grab', type: 'flow' }]),
      ];
      const graph = createTestGraph(nodes);
      const result = visualToAST(graph);

      expect(result.code).toContain('@grabbable');
      expect(result.code).toContain('on_grab:');
    });

    it('should translate on_collision event with collidable trait', () => {
      const nodes = [
        createNode('ev1', 'on_collision', 'event', 'On Collision', {}, [],
          [{ id: 'enter', label: 'On Enter', type: 'flow' }]),
      ];
      const graph = createTestGraph(nodes);
      const result = visualToAST(graph);

      expect(result.code).toContain('@collidable');
      expect(result.code).toContain('on_collision_enter:');
    });

    it('should translate on_tick event', () => {
      const nodes = [
        createNode('ev1', 'on_tick', 'event', 'On Tick', {}, [],
          [{ id: 'flow', label: 'Execute', type: 'flow' }]),
      ];
      const graph = createTestGraph(nodes);
      const result = visualToAST(graph);

      expect(result.code).toContain('on_tick:');
    });
  });

  describe('event -> action chain translation', () => {
    it('should translate on_click -> play_sound chain', () => {
      const nodes = [
        createNode('ev1', 'on_click', 'event', 'On Click', {}, [],
          [{ id: 'flow', label: 'Execute', type: 'flow' }]),
        createNode('act1', 'play_sound', 'action', 'Play Sound',
          { url: 'click.mp3', volume: 0.8 },
          [{ id: 'flow', label: 'Execute', type: 'flow' }],
          [{ id: 'flow', label: 'Then', type: 'flow' }]),
      ];
      const edges = [createEdge('e1', 'ev1', 'act1', 'flow', 'flow')];
      const graph = createTestGraph(nodes, edges);
      const result = visualToAST(graph);

      expect(result.code).toContain('audio.play("click.mp3")');
      expect(result.ast).toHaveLength(1);
      expect(result.mappings.length).toBeGreaterThanOrEqual(2);
    });

    it('should translate on_click -> play_animation chain', () => {
      const nodes = [
        createNode('ev1', 'on_click', 'event', 'On Click', {}, [],
          [{ id: 'flow', label: 'Execute', type: 'flow' }]),
        createNode('act1', 'play_animation', 'action', 'Play Animation',
          { animation: 'spin', duration: 2000 },
          [{ id: 'flow', label: 'Execute', type: 'flow' }],
          [{ id: 'flow', label: 'Then', type: 'flow' }]),
      ];
      const edges = [createEdge('e1', 'ev1', 'act1', 'flow', 'flow')];
      const graph = createTestGraph(nodes, edges);
      const result = visualToAST(graph);

      expect(result.code).toContain('animation.play("spin"');
      expect(result.code).toContain('duration: 2000');
    });

    it('should translate set_property action', () => {
      const nodes = [
        createNode('ev1', 'on_click', 'event', 'On Click', {}, [],
          [{ id: 'flow', label: 'Execute', type: 'flow' }]),
        createNode('act1', 'set_property', 'action', 'Set Property',
          { property: 'color', value: '#ff0000' },
          [{ id: 'flow', label: 'Execute', type: 'flow' }, { id: 'value', label: 'Value', type: 'any' }],
          [{ id: 'flow', label: 'Then', type: 'flow' }]),
      ];
      const edges = [createEdge('e1', 'ev1', 'act1', 'flow', 'flow')];
      const graph = createTestGraph(nodes, edges);
      const result = visualToAST(graph);

      expect(result.code).toContain('this.color = "#ff0000"');
    });

    it('should translate toggle action', () => {
      const nodes = [
        createNode('ev1', 'on_click', 'event', 'On Click', {}, [],
          [{ id: 'flow', label: 'Execute', type: 'flow' }]),
        createNode('act1', 'toggle', 'action', 'Toggle',
          { property: 'visible' },
          [{ id: 'flow', label: 'Execute', type: 'flow' }],
          [{ id: 'flow', label: 'Then', type: 'flow' }]),
      ];
      const edges = [createEdge('e1', 'ev1', 'act1', 'flow', 'flow')];
      const graph = createTestGraph(nodes, edges);
      const result = visualToAST(graph);

      expect(result.code).toContain('this.visible = !this.visible');
    });

    it('should translate spawn action', () => {
      const nodes = [
        createNode('ev1', 'on_click', 'event', 'On Click', {}, [],
          [{ id: 'flow', label: 'Execute', type: 'flow' }]),
        createNode('act1', 'spawn', 'action', 'Spawn',
          { template: 'particle' },
          [{ id: 'flow', label: 'Execute', type: 'flow' }],
          [{ id: 'flow', label: 'Then', type: 'flow' }]),
      ];
      const edges = [createEdge('e1', 'ev1', 'act1', 'flow', 'flow')];
      const graph = createTestGraph(nodes, edges);
      const result = visualToAST(graph);

      expect(result.code).toContain('scene.spawn("particle")');
    });

    it('should translate destroy action', () => {
      const nodes = [
        createNode('ev1', 'on_click', 'event', 'On Click', {}, [],
          [{ id: 'flow', label: 'Execute', type: 'flow' }]),
        createNode('act1', 'destroy', 'action', 'Destroy', {},
          [{ id: 'flow', label: 'Execute', type: 'flow' }],
          [{ id: 'flow', label: 'Then', type: 'flow' }]),
      ];
      const edges = [createEdge('e1', 'ev1', 'act1', 'flow', 'flow')];
      const graph = createTestGraph(nodes, edges);
      const result = visualToAST(graph);

      expect(result.code).toContain('this.destroy()');
    });
  });

  describe('data node translation', () => {
    it('should translate constant nodes to state properties', () => {
      const nodes = [
        createNode('d1', 'constant', 'data', 'Constant',
          { type: 'number', value: 42 }),
      ];
      const graph = createTestGraph(nodes);
      const result = visualToAST(graph);

      expect(result.code).toContain('42');
    });
  });

  describe('trait inference', () => {
    it('should infer multiple traits from different event types', () => {
      const nodes = [
        createNode('ev1', 'on_click', 'event', 'On Click'),
        createNode('ev2', 'on_hover', 'event', 'On Hover'),
        createNode('ev3', 'on_grab', 'event', 'On Grab'),
      ];
      const graph = createTestGraph(nodes);
      const result = visualToAST(graph);

      expect(result.code).toContain('@clickable');
      expect(result.code).toContain('@hoverable');
      expect(result.code).toContain('@grabbable');
    });

    it('should infer animated trait from play_animation', () => {
      const nodes = [
        createNode('act1', 'play_animation', 'action', 'Play Animation',
          { animation: 'idle' }),
      ];
      const graph = createTestGraph(nodes);
      const result = visualToAST(graph);

      expect(result.code).toContain('@animated');
    });

    it('should deduplicate traits', () => {
      const nodes = [
        createNode('ev1', 'on_collision', 'event', 'On Collision'),
        createNode('ev2', 'on_trigger', 'event', 'On Trigger'),
      ];
      const graph = createTestGraph(nodes);
      const result = visualToAST(graph);

      // Both should map to @collidable, but only appear once
      const matches = result.code.match(/@collidable/g);
      expect(matches).toHaveLength(1);
    });
  });

  describe('code format output', () => {
    it('should generate hsplus format by default', () => {
      const graph = createTestGraph([
        createNode('ev1', 'on_click', 'event', 'On Click'),
      ]);
      const result = visualToAST(graph, { format: 'hsplus' });

      expect(result.format).toBe('hsplus');
      expect(result.code).toContain('orb');
    });

    it('should generate hs format', () => {
      const graph = createTestGraph([
        createNode('ev1', 'on_click', 'event', 'On Click'),
      ]);
      const result = visualToAST(graph, { format: 'hs' });

      expect(result.format).toBe('hs');
      expect(result.code).toContain('orb');
    });

    it('should generate holo format with composition wrapper', () => {
      const graph = createTestGraph([
        createNode('ev1', 'on_click', 'event', 'On Click'),
      ]);
      const result = visualToAST(graph, { format: 'holo' });

      expect(result.format).toBe('holo');
      expect(result.code).toContain('composition');
      expect(result.code).toContain('environment');
      expect(result.code).toContain('logic');
    });

    it('should include comments when enabled', () => {
      const graph = createTestGraph([]);
      const result = visualToAST(graph, { includeComments: true });

      expect(result.code).toContain('Generated by @holoscript/studio-bridge');
    });

    it('should omit comments when disabled', () => {
      const graph = createTestGraph([]);
      const result = visualToAST(graph, { includeComments: false });

      expect(result.code).not.toContain('Generated by');
    });

    it('should use custom object name', () => {
      const graph = createTestGraph([]);
      const result = visualToAST(graph, { objectName: 'mySpecialOrb' });

      expect(result.code).toContain('orb mySpecialOrb');
    });
  });

  describe('validation', () => {
    it('should detect disconnected action nodes', () => {
      const nodes = [
        createNode('act1', 'play_sound', 'action', 'Play Sound'),
      ];
      const graph = createTestGraph(nodes);
      const result = visualToAST(graph, { validate: true });

      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({
          code: 'BRIDGE_DISCONNECTED',
          visualNodeId: 'act1',
        }),
      );
    });

    it('should warn about unknown node types', () => {
      const nodes = [
        createNode('x1', 'unknown_type', 'action', 'Unknown'),
      ];
      const graph = createTestGraph(nodes);
      const result = visualToAST(graph, { validate: true });

      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({
          code: 'BRIDGE_UNKNOWN_TYPE',
        }),
      );
    });

    it('should skip validation when disabled', () => {
      const nodes = [
        createNode('x1', 'unknown_type', 'action', 'Unknown'),
      ];
      const graph = createTestGraph(nodes);
      const result = visualToAST(graph, { validate: false });

      const validationDiags = result.diagnostics.filter(
        (d) => d.code === 'BRIDGE_UNKNOWN_TYPE',
      );
      expect(validationDiags).toHaveLength(0);
    });
  });

  describe('source map generation', () => {
    it('should generate source map when enabled', () => {
      const nodes = [
        createNode('ev1', 'on_click', 'event', 'On Click', {}, [],
          [{ id: 'flow', label: 'Execute', type: 'flow' }]),
        createNode('act1', 'play_sound', 'action', 'Play Sound',
          { url: 'click.mp3' },
          [{ id: 'flow', label: 'Execute', type: 'flow' }],
          [{ id: 'flow', label: 'Then', type: 'flow' }]),
      ];
      const edges = [createEdge('e1', 'ev1', 'act1', 'flow', 'flow')];
      const graph = createTestGraph(nodes, edges);
      const result = visualToAST(graph, { generateSourceMap: true });

      expect(result.sourceMap).toBeDefined();
      expect(result.sourceMap!.version).toBe(1);
      expect(result.sourceMap!.entries.length).toBeGreaterThan(0);
    });

    it('should not generate source map when disabled', () => {
      const graph = createTestGraph([
        createNode('ev1', 'on_click', 'event', 'On Click'),
      ]);
      const result = visualToAST(graph, { generateSourceMap: false });

      expect(result.sourceMap).toBeUndefined();
    });
  });

  describe('bridge mappings', () => {
    it('should create mappings for event nodes', () => {
      const nodes = [
        createNode('ev1', 'on_click', 'event', 'On Click'),
      ];
      const graph = createTestGraph(nodes);
      const result = visualToAST(graph);

      const eventMapping = result.mappings.find((m) => m.visualNodeId === 'ev1');
      expect(eventMapping).toBeDefined();
      expect(eventMapping!.relationship).toBe('direct');
    });

    it('should create structural mapping for root orb', () => {
      const graph = createTestGraph([]);
      const result = visualToAST(graph);

      const rootMapping = result.mappings.find((m) => m.relationship === 'structural');
      expect(rootMapping).toBeDefined();
    });
  });

  describe('custom rules', () => {
    it('should accept and use custom translation rules', () => {
      const translator = new VisualToAST();
      translator.registerRule({
        visualType: 'custom_event',
        astType: 'event-handler',
        strategy: 'event-handler',
        category: 'event',
      });

      const rule = translator.getRule('custom_event');
      expect(rule).toBeDefined();
      expect(rule!.astType).toBe('event-handler');
    });

    it('should prefer custom rules over built-in ones', () => {
      const translator = new VisualToAST();
      translator.registerRule({
        visualType: 'on_click',
        astType: 'custom-handler',
        strategy: 'event-handler',
        category: 'event',
      });

      const rule = translator.getRule('on_click');
      expect(rule!.astType).toBe('custom-handler');
    });
  });
});
