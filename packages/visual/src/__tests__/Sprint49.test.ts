/**
 * Sprint 49 — @holoscript/visual acceptance tests
 * Covers: CATEGORY_COLORS, NodeCategory, PortType, EVENT_NODES structure
 *
 * NOTE: React/ReactFlow are not needed — we only test pure data constants.
 *       The store and React components are excluded here.
 */
import { describe, it, expect } from 'vitest';
import { CATEGORY_COLORS } from '../types';
import { EVENT_NODES } from '../nodes/nodeRegistry';
import type { NodeCategory, PortType } from '../types';

// ═══════════════════════════════════════════════
// CATEGORY_COLORS
// ═══════════════════════════════════════════════
describe('CATEGORY_COLORS', () => {
  it('is defined', () => {
    expect(CATEGORY_COLORS).toBeDefined();
  });

  it('has all four NodeCategory keys', () => {
    const expected: NodeCategory[] = ['event', 'action', 'logic', 'data'];
    for (const key of expected) {
      expect(CATEGORY_COLORS).toHaveProperty(key);
    }
  });

  it('event color is a valid hex string', () => {
    expect(CATEGORY_COLORS.event).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('action color is a valid hex string', () => {
    expect(CATEGORY_COLORS.action).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('logic color is a valid hex string', () => {
    expect(CATEGORY_COLORS.logic).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('data color is a valid hex string', () => {
    expect(CATEGORY_COLORS.data).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('event is green (#22c55e)', () => {
    expect(CATEGORY_COLORS.event).toBe('#22c55e');
  });

  it('action is blue (#3b82f6)', () => {
    expect(CATEGORY_COLORS.action).toBe('#3b82f6');
  });

  it('logic is yellow (#eab308)', () => {
    expect(CATEGORY_COLORS.logic).toBe('#eab308');
  });

  it('data is purple (#a855f7)', () => {
    expect(CATEGORY_COLORS.data).toBe('#a855f7');
  });
});

// ═══════════════════════════════════════════════
// EVENT_NODES — array shape
// ═══════════════════════════════════════════════
describe('EVENT_NODES', () => {
  it('is defined and is an array', () => {
    expect(Array.isArray(EVENT_NODES)).toBe(true);
  });

  it('has at least 4 event nodes', () => {
    expect(EVENT_NODES.length).toBeGreaterThanOrEqual(4);
  });

  it('every node has a non-empty type string', () => {
    for (const node of EVENT_NODES) {
      expect(typeof node.type).toBe('string');
      expect(node.type.length).toBeGreaterThan(0);
    }
  });

  it('every node has a non-empty label string', () => {
    for (const node of EVENT_NODES) {
      expect(typeof node.label).toBe('string');
      expect(node.label.length).toBeGreaterThan(0);
    }
  });

  it('every node has category = "event"', () => {
    for (const node of EVENT_NODES) {
      expect(node.category).toBe('event');
    }
  });

  it('every node has a non-empty description', () => {
    for (const node of EVENT_NODES) {
      expect(typeof node.description).toBe('string');
      expect(node.description.length).toBeGreaterThan(0);
    }
  });

  it('every node has inputs array', () => {
    for (const node of EVENT_NODES) {
      expect(Array.isArray(node.inputs)).toBe(true);
    }
  });

  it('event nodes have empty inputs (they are triggers)', () => {
    for (const node of EVENT_NODES) {
      expect(node.inputs).toHaveLength(0);
    }
  });

  it('every node has outputs array with at least one port', () => {
    for (const node of EVENT_NODES) {
      expect(Array.isArray(node.outputs)).toBe(true);
      expect(node.outputs.length).toBeGreaterThan(0);
    }
  });

  it('all output ports have id and label strings', () => {
    for (const node of EVENT_NODES) {
      for (const port of node.outputs) {
        expect(typeof port.id).toBe('string');
        expect(port.id.length).toBeGreaterThan(0);
        expect(typeof port.label).toBe('string');
        expect(port.label.length).toBeGreaterThan(0);
      }
    }
  });

  it('all output port types are valid PortType values', () => {
    const validTypes: PortType[] = [
      'flow',
      'string',
      'number',
      'boolean',
      'any',
      'object',
      'array',
    ];
    for (const node of EVENT_NODES) {
      for (const port of node.outputs) {
        expect(validTypes).toContain(port.type);
      }
    }
  });

  it('all types in EVENT_NODES are unique', () => {
    const types = EVENT_NODES.map((n) => n.type);
    expect(new Set(types).size).toBe(types.length);
  });
});

// ═══════════════════════════════════════════════
// EVENT_NODES — spot-checks
// ═══════════════════════════════════════════════
describe('EVENT_NODES spot-checks', () => {
  it('includes on_click node', () => {
    const node = EVENT_NODES.find((n) => n.type === 'on_click');
    expect(node).toBeDefined();
    expect(node!.label).toBe('On Click');
    expect(node!.icon).toBeDefined();
  });

  it('on_click has a "flow" output port', () => {
    const node = EVENT_NODES.find((n) => n.type === 'on_click')!;
    const flowPort = node.outputs.find((p) => p.type === 'flow');
    expect(flowPort).toBeDefined();
  });

  it('includes on_hover node', () => {
    const node = EVENT_NODES.find((n) => n.type === 'on_hover');
    expect(node).toBeDefined();
    expect(node!.category).toBe('event');
  });

  it('includes on_grab node (for VR)', () => {
    const node = EVENT_NODES.find((n) => n.type === 'on_grab');
    expect(node).toBeDefined();
    expect(node!.description).toContain('VR');
  });

  it('includes on_tick node', () => {
    const node = EVENT_NODES.find((n) => n.type === 'on_tick');
    expect(node).toBeDefined();
  });

  it('on_tick has deltaTime output', () => {
    const node = EVENT_NODES.find((n) => n.type === 'on_tick')!;
    const dtPort = node.outputs.find((p) => p.id === 'deltaTime');
    expect(dtPort).toBeDefined();
    expect(dtPort!.type).toBe('number');
  });
});
