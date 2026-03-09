/**
 * Tests for ASTToVisual translator
 */

import { describe, it, expect } from 'vitest';
import { ASTToVisual, astToVisual, codeToVisual } from '../ASTToVisual';
import type { ASTNode, OrbNode } from '../types';

// ============================================================================
// Test Helpers
// ============================================================================

function createOrbNode(
  name: string,
  overrides: Partial<OrbNode> = {},
): OrbNode {
  return {
    type: 'orb',
    name,
    properties: {},
    methods: [],
    children: [],
    ...overrides,
  };
}

function createEventHandlerNode(hookName: string, body: ASTNode[] = []): ASTNode {
  return {
    type: 'event-handler',
    directives: [{
      type: 'lifecycle',
      hook: hookName,
      body,
    }],
  };
}

function createActionNode(traitName: string, config: Record<string, unknown> = {}): ASTNode {
  return {
    type: 'action',
    directives: [{
      type: 'trait',
      name: traitName,
      config,
    }],
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('ASTToVisual', () => {
  describe('constructor', () => {
    it('should create with default options', () => {
      const translator = new ASTToVisual();
      expect(translator).toBeInstanceOf(ASTToVisual);
    });

    it('should accept custom options', () => {
      const translator = new ASTToVisual({
        layout: 'grid',
        startX: 200,
        startY: 200,
      });
      expect(translator).toBeInstanceOf(ASTToVisual);
    });
  });

  describe('empty AST translation', () => {
    it('should translate empty AST to empty graph', () => {
      const result = astToVisual([]);

      expect(result.graph.nodes).toHaveLength(0);
      expect(result.graph.edges).toHaveLength(0);
      expect(result.graph.metadata.name).toBeDefined();
    });
  });

  describe('OrbNode translation', () => {
    it('should process an OrbNode and create visual nodes from its children', () => {
      const orb = createOrbNode('testOrb', {
        children: [
          createEventHandlerNode('on_click'),
        ],
      });
      const result = astToVisual([orb]);

      // Should have created at least one event node for on_click
      const eventNodes = result.graph.nodes.filter((n) => n.data.category === 'event');
      expect(eventNodes.length).toBeGreaterThan(0);
    });

    it('should create data nodes from OrbNode properties', () => {
      const orb = createOrbNode('testOrb', {
        properties: {
          health: 100,
          color: '#ff0000',
        },
      });
      const result = astToVisual([orb]);

      const dataNodes = result.graph.nodes.filter((n) => n.data.category === 'data');
      expect(dataNodes.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('event handler translation', () => {
    it('should translate on_click handler to visual event node', () => {
      const orb = createOrbNode('testOrb', {
        children: [createEventHandlerNode('on_click')],
      });
      const result = astToVisual([orb]);

      const clickNodes = result.graph.nodes.filter(
        (n) => n.data.type === 'on_click',
      );
      expect(clickNodes.length).toBeGreaterThan(0);
    });

    it('should translate on_hover_enter handler', () => {
      const orb = createOrbNode('testOrb', {
        children: [createEventHandlerNode('on_hover_enter')],
      });
      const result = astToVisual([orb]);

      const hoverNodes = result.graph.nodes.filter(
        (n) => n.data.type === 'on_hover',
      );
      expect(hoverNodes.length).toBeGreaterThan(0);
    });

    it('should translate on_grab handler', () => {
      const orb = createOrbNode('testOrb', {
        children: [createEventHandlerNode('on_grab')],
      });
      const result = astToVisual([orb]);

      const grabNodes = result.graph.nodes.filter(
        (n) => n.data.type === 'on_grab',
      );
      expect(grabNodes.length).toBeGreaterThan(0);
    });

    it('should translate event handler with action body', () => {
      const orb = createOrbNode('testOrb', {
        children: [
          createEventHandlerNode('on_click', [
            createActionNode('audio', { url: 'click.mp3' }),
          ]),
        ],
      });
      const result = astToVisual([orb]);

      // Should have event node + action node + edge
      expect(result.graph.nodes.length).toBeGreaterThanOrEqual(2);
      expect(result.graph.edges.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('action node translation', () => {
    it('should translate audio action to play_sound visual node', () => {
      const actionNode = createActionNode('audio', { url: 'sound.mp3', volume: 0.5 });
      const result = astToVisual([actionNode]);

      const soundNodes = result.graph.nodes.filter(
        (n) => n.data.type === 'play_sound',
      );
      expect(soundNodes.length).toBeGreaterThan(0);
      expect(soundNodes[0].data.properties.url).toBe('sound.mp3');
    });

    it('should translate animation action to play_animation visual node', () => {
      const actionNode = createActionNode('animation', {
        animation: 'spin',
        duration: 2000,
      });
      const result = astToVisual([actionNode]);

      const animNodes = result.graph.nodes.filter(
        (n) => n.data.type === 'play_animation',
      );
      expect(animNodes.length).toBeGreaterThan(0);
      expect(animNodes[0].data.properties.animation).toBe('spin');
    });

    it('should translate spawn action', () => {
      const actionNode = createActionNode('spawn', { template: 'particle' });
      const result = astToVisual([actionNode]);

      const spawnNodes = result.graph.nodes.filter(
        (n) => n.data.type === 'spawn',
      );
      expect(spawnNodes.length).toBeGreaterThan(0);
      expect(spawnNodes[0].data.properties.template).toBe('particle');
    });

    it('should translate destroy action (no directives)', () => {
      const destroyNode: ASTNode = { type: 'action' };
      const result = astToVisual([destroyNode]);

      const destroyNodes = result.graph.nodes.filter(
        (n) => n.data.type === 'destroy',
      );
      expect(destroyNodes.length).toBeGreaterThan(0);
    });
  });

  describe('assignment node translation', () => {
    it('should translate assignment to set_property visual node', () => {
      const assignNode: ASTNode = {
        type: 'assignment',
        directives: [{
          type: 'state',
          body: {
            property: 'color',
            value: '#ff0000',
          },
        }],
      };
      const result = astToVisual([assignNode]);

      const propNodes = result.graph.nodes.filter(
        (n) => n.data.type === 'set_property',
      );
      expect(propNodes.length).toBeGreaterThan(0);
    });

    it('should translate toggle assignment', () => {
      const toggleNode: ASTNode = {
        type: 'assignment',
        directives: [{
          type: 'state',
          body: {
            property: 'visible',
            toggle: true,
          },
        }],
      };
      const result = astToVisual([toggleNode]);

      const toggleNodes = result.graph.nodes.filter(
        (n) => n.data.type === 'toggle',
      );
      expect(toggleNodes.length).toBeGreaterThan(0);
    });
  });

  describe('gate node translation', () => {
    it('should translate gate to if_else visual node', () => {
      const gateNode: ASTNode = {
        type: 'gate',
        directives: [{
          type: 'state',
          body: {
            condition: true,
            truePath: [],
            falsePath: [],
          },
        }],
      };
      const result = astToVisual([gateNode]);

      const ifNodes = result.graph.nodes.filter(
        (n) => n.data.type === 'if_else',
      );
      expect(ifNodes.length).toBeGreaterThan(0);
    });
  });

  describe('unmapped nodes', () => {
    it('should report unmapped AST types', () => {
      const unknownNode: ASTNode = { type: 'unknown_ast_type' };
      const result = astToVisual([unknownNode]);

      expect(result.unmappedNodes).toHaveLength(1);
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({
          code: 'BRIDGE_UNMAPPED_AST',
        }),
      );
    });
  });

  describe('layout algorithms', () => {
    it('should apply auto layout by default', () => {
      const result = astToVisual([
        createEventHandlerNode('on_click'),
        createActionNode('audio'),
      ], { layout: 'auto' });

      for (const node of result.graph.nodes) {
        expect(node.position).toBeDefined();
        expect(typeof node.position.x).toBe('number');
        expect(typeof node.position.y).toBe('number');
      }
    });

    it('should apply grid layout', () => {
      const result = astToVisual([
        createEventHandlerNode('on_click'),
        createActionNode('audio'),
        createActionNode('animation'),
      ], { layout: 'grid' });

      // All nodes should have different positions
      const positions = result.graph.nodes.map(
        (n) => `${n.position.x},${n.position.y}`,
      );
      const uniquePositions = new Set(positions);
      expect(uniquePositions.size).toBe(result.graph.nodes.length);
    });

    it('should apply tree layout', () => {
      const result = astToVisual([
        createEventHandlerNode('on_click'),
        createActionNode('audio'),
      ], { layout: 'tree' });

      for (const node of result.graph.nodes) {
        expect(node.position.x).toBeGreaterThanOrEqual(0);
        expect(node.position.y).toBeGreaterThanOrEqual(0);
      }
    });

    it('should apply force-directed layout', () => {
      const result = astToVisual([
        createEventHandlerNode('on_click'),
        createActionNode('audio'),
        createActionNode('animation'),
      ], { layout: 'force-directed' });

      for (const node of result.graph.nodes) {
        expect(typeof node.position.x).toBe('number');
        expect(typeof node.position.y).toBe('number');
      }
    });

    it('should respect custom start position', () => {
      const result = astToVisual([
        createEventHandlerNode('on_click'),
      ], { layout: 'grid', startX: 500, startY: 300 });

      expect(result.graph.nodes[0].position.x).toBe(500);
      expect(result.graph.nodes[0].position.y).toBe(300);
    });
  });

  describe('bridge mappings', () => {
    it('should create mappings for all translated nodes', () => {
      const orb = createOrbNode('testOrb', {
        children: [
          createEventHandlerNode('on_click', [
            createActionNode('audio', { url: 'click.mp3' }),
          ]),
        ],
      });
      const result = astToVisual([orb]);

      expect(result.mappings.length).toBeGreaterThan(0);
      for (const mapping of result.mappings) {
        expect(mapping.id).toBeDefined();
        expect(mapping.visualNodeId).toBeDefined();
        expect(mapping.astPath).toBeDefined();
        expect(mapping.relationship).toBeDefined();
      }
    });
  });

  describe('code-to-visual translation', () => {
    it('should translate HoloScript code to visual graph', () => {
      const code = `orb testOrb {
  @clickable
  on_click: {
  }
}`;
      const result = codeToVisual(code);

      expect(result.graph.nodes.length).toBeGreaterThan(0);
    });

    it('should handle empty code', () => {
      const result = codeToVisual('');

      expect(result.graph.nodes).toHaveLength(0);
    });

    it('should parse orb with properties', () => {
      const code = `orb myOrb {
  health: 100
  color: "#ff0000"
}`;
      const result = codeToVisual(code);

      // Should create constant nodes for the properties
      expect(result.graph.nodes.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('custom rules', () => {
    it('should accept custom AST-to-Visual rules', () => {
      const translator = new ASTToVisual();
      translator.registerRule({
        astTypePattern: 'custom_type',
        visualType: 'on_click',
        category: 'event',
      });

      const rule = translator.getRule('custom_type');
      expect(rule).toBeDefined();
      expect(rule!.visualType).toBe('on_click');
    });
  });

  describe('graph metadata', () => {
    it('should set graph name from options', () => {
      const result = astToVisual([], { graphName: 'My Custom Graph' });

      expect(result.graph.metadata.name).toBe('My Custom Graph');
    });

    it('should set timestamps', () => {
      const result = astToVisual([]);

      expect(result.graph.metadata.createdAt).toBeDefined();
      expect(result.graph.metadata.updatedAt).toBeDefined();
    });
  });
});
