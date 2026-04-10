/**
 * Tests for node registry
 */

import { describe, it, expect } from 'vitest';
import {
  ALL_NODES,
  EVENT_NODES,
  ACTION_NODES,
  LOGIC_NODES,
  DATA_NODES,
  NODE_REGISTRY,
  getNodeDefinition,
  getNodesByCategory,
} from '../nodes/nodeRegistry';

describe('Node Registry', () => {
  describe('node definitions', () => {
    it('should have at least 20 nodes for MVP', () => {
      expect(ALL_NODES.length).toBeGreaterThanOrEqual(20);
    });

    it('should have event nodes', () => {
      expect(EVENT_NODES.length).toBeGreaterThan(0);
      EVENT_NODES.forEach((node) => {
        expect(node.category).toBe('event');
      });
    });

    it('should have action nodes', () => {
      expect(ACTION_NODES.length).toBeGreaterThan(0);
      ACTION_NODES.forEach((node) => {
        expect(node.category).toBe('action');
      });
    });

    it('should have logic nodes', () => {
      expect(LOGIC_NODES.length).toBeGreaterThan(0);
      LOGIC_NODES.forEach((node) => {
        expect(node.category).toBe('logic');
      });
    });

    it('should have data nodes', () => {
      expect(DATA_NODES.length).toBeGreaterThan(0);
      DATA_NODES.forEach((node) => {
        expect(node.category).toBe('data');
      });
    });

    it('should have unique node types', () => {
      const types = ALL_NODES.map((n) => n.type);
      const uniqueTypes = new Set(types);
      expect(uniqueTypes.size).toBe(types.length);
    });

    it('all nodes should have required properties', () => {
      ALL_NODES.forEach((node) => {
        expect(node.type).toBeTruthy();
        expect(node.label).toBeTruthy();
        expect(node.category).toBeTruthy();
        expect(node.description).toBeTruthy();
        expect(Array.isArray(node.inputs)).toBe(true);
        expect(Array.isArray(node.outputs)).toBe(true);
      });
    });
  });

  describe('getNodeDefinition', () => {
    it('should return node definition by type', () => {
      const node = getNodeDefinition('on_click');
      expect(node).toBeDefined();
      expect(node?.type).toBe('on_click');
      expect(node?.category).toBe('event');
    });

    it('should return undefined for unknown type', () => {
      const node = getNodeDefinition('unknown_node_type');
      expect(node).toBeUndefined();
    });
  });

  describe('getNodesByCategory', () => {
    it('should return all event nodes', () => {
      const events = getNodesByCategory('event');
      expect(events).toEqual(EVENT_NODES);
    });

    it('should return all action nodes', () => {
      const actions = getNodesByCategory('action');
      expect(actions).toEqual(ACTION_NODES);
    });

    it('should return all logic nodes', () => {
      const logic = getNodesByCategory('logic');
      expect(logic).toEqual(LOGIC_NODES);
    });

    it('should return all data nodes', () => {
      const data = getNodesByCategory('data');
      expect(data).toEqual(DATA_NODES);
    });

    it('should return empty array for unknown category', () => {
      const unknown = getNodesByCategory('unknown');
      expect(unknown).toEqual([]);
    });
  });

  describe('NODE_REGISTRY', () => {
    it('should be a Map', () => {
      expect(NODE_REGISTRY instanceof Map).toBe(true);
    });

    it('should contain all nodes', () => {
      expect(NODE_REGISTRY.size).toBe(ALL_NODES.length);
    });

    it('should allow lookup by type', () => {
      expect(NODE_REGISTRY.get('on_click')).toBeDefined();
      expect(NODE_REGISTRY.get('play_sound')).toBeDefined();
      expect(NODE_REGISTRY.get('if_else')).toBeDefined();
      expect(NODE_REGISTRY.get('constant')).toBeDefined();
    });
  });

  describe('event nodes specifics', () => {
    it('on_click should have flow output', () => {
      const node = getNodeDefinition('on_click');
      expect(node?.outputs.some((o) => o.type === 'flow')).toBe(true);
    });

    it('on_hover should have enter and exit outputs', () => {
      const node = getNodeDefinition('on_hover');
      expect(node?.outputs.some((o) => o.id === 'enter')).toBe(true);
      expect(node?.outputs.some((o) => o.id === 'exit')).toBe(true);
    });

    it('on_grab should have grab and release outputs', () => {
      const node = getNodeDefinition('on_grab');
      expect(node?.outputs.some((o) => o.id === 'grab')).toBe(true);
      expect(node?.outputs.some((o) => o.id === 'release')).toBe(true);
    });

    it('on_timer should have delay property', () => {
      const node = getNodeDefinition('on_timer');
      expect(node?.properties?.some((p) => p.id === 'delay')).toBe(true);
    });
  });

  describe('action nodes specifics', () => {
    it('play_sound should have url property', () => {
      const node = getNodeDefinition('play_sound');
      expect(node?.properties?.some((p) => p.id === 'url')).toBe(true);
    });

    it('play_animation should have animation property', () => {
      const node = getNodeDefinition('play_animation');
      expect(node?.properties?.some((p) => p.id === 'animation')).toBe(true);
    });

    it('set_property should have property name setting', () => {
      const node = getNodeDefinition('set_property');
      expect(node?.properties?.some((p) => p.id === 'property')).toBe(true);
    });
  });

  describe('logic nodes specifics', () => {
    it('compare should have operator options', () => {
      const node = getNodeDefinition('compare');
      const operatorProp = node?.properties?.find((p) => p.id === 'operator');
      expect(operatorProp?.options?.length).toBeGreaterThan(0);
    });

    it('math should have operator options', () => {
      const node = getNodeDefinition('math');
      const operatorProp = node?.properties?.find((p) => p.id === 'operator');
      expect(operatorProp?.options?.length).toBeGreaterThan(0);
    });

    it('if_else should have true and false outputs', () => {
      const node = getNodeDefinition('if_else');
      expect(node?.outputs.some((o) => o.id === 'true')).toBe(true);
      expect(node?.outputs.some((o) => o.id === 'false')).toBe(true);
    });
  });

  describe('data nodes specifics', () => {
    it('constant should have type selector', () => {
      const node = getNodeDefinition('constant');
      expect(node?.properties?.some((p) => p.id === 'type')).toBe(true);
    });

    it('random should have min and max properties', () => {
      const node = getNodeDefinition('random');
      expect(node?.properties?.some((p) => p.id === 'min')).toBe(true);
      expect(node?.properties?.some((p) => p.id === 'max')).toBe(true);
    });

    it('vector3 should have x, y, z properties', () => {
      const node = getNodeDefinition('vector3');
      expect(node?.properties?.some((p) => p.id === 'x')).toBe(true);
      expect(node?.properties?.some((p) => p.id === 'y')).toBe(true);
      expect(node?.properties?.some((p) => p.id === 'z')).toBe(true);
    });

    it('this should have no inputs', () => {
      const node = getNodeDefinition('this');
      expect(node?.inputs).toHaveLength(0);
    });
  });
});
