/**
 * TypeInferencePass Production Tests
 *
 * Tests literal type inference, trait property narrowing,
 * let-binding propagation, and graceful unknown handling.
 */

import { describe, it, expect } from 'vitest';
import { TypeInferencePass, inferLiteralType, type TraitConfigRegistry } from '../../compiler/TypeInferencePass';
import type { HSPlusAST, HSPlusNode } from '../../types/HoloScriptPlus';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeNode(type: string, overrides: Partial<HSPlusNode> = {}): HSPlusNode {
  return { type, ...overrides };
}

function makeAST(root: HSPlusNode): HSPlusAST {
  return { type: 'Program', root, body: [] };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('TypeInferencePass — Production', () => {

  // ─── inferLiteralType() — pure utility ─────────────────────────────

  describe('inferLiteralType()', () => {
    it('integer number → int', () => {
      expect(inferLiteralType(5)).toBe('int');
      expect(inferLiteralType(0)).toBe('int');
      expect(inferLiteralType(-42)).toBe('int');
    });

    it('float number → float', () => {
      expect(inferLiteralType(5.0)).toBe('int'); // 5.0 is integer in JS
      expect(inferLiteralType(5.5)).toBe('float');
      expect(inferLiteralType(9.81)).toBe('float');
      expect(inferLiteralType(0.001)).toBe('float');
    });

    it('boolean → bool', () => {
      expect(inferLiteralType(true)).toBe('bool');
      expect(inferLiteralType(false)).toBe('bool');
    });

    it('string → string', () => {
      expect(inferLiteralType('hello')).toBe('string');
      expect(inferLiteralType('')).toBe('string');
    });

    it('[x, y] → vec2', () => {
      expect(inferLiteralType([1, 2])).toBe('vec2');
    });

    it('[x, y, z] → vec3', () => {
      expect(inferLiteralType([0, 1, 0])).toBe('vec3');
      expect(inferLiteralType([100, -5, 3.5])).toBe('vec3');
    });

    it('[x, y, z, w] all in [0,1] → color', () => {
      expect(inferLiteralType([1, 0, 0, 1])).toBe('color');
      expect(inferLiteralType([0.2, 0.4, 0.8, 0.5])).toBe('color');
    });

    it('[x, y, z, w] with value > 1 → vec4', () => {
      expect(inferLiteralType([255, 128, 0, 1])).toBe('vec4');
      expect(inferLiteralType([0, 0, 0, 100])).toBe('vec4');
    });

    it('empty array → unknown', () => {
      expect(inferLiteralType([])).toBe('unknown');
    });

    it('mixed-type array → unknown', () => {
      expect(inferLiteralType([1, 'a', 3])).toBe('unknown');
    });

    it('null → unknown', () => {
      expect(inferLiteralType(null)).toBe('unknown');
    });

    it('undefined → unknown', () => {
      expect(inferLiteralType(undefined)).toBe('unknown');
    });

    it('object → unknown', () => {
      expect(inferLiteralType({ a: 1 })).toBe('unknown');
    });

    it('5-element array → unknown', () => {
      expect(inferLiteralType([1, 2, 3, 4, 5])).toBe('unknown');
    });
  });

  // ─── TypeInferencePass.run() ────────────────────────────────────────

  describe('run() on full AST', () => {
    const pass = new TypeInferencePass();

    it('infers type for value node', () => {
      const root = makeNode('Literal', { name: 'speed', value: 9.81 });
      const map = pass.run(makeAST(root));
      expect(map.get('speed')).toBe('float');
    });

    it('annotates node.inferredType in place', () => {
      const root = makeNode('Literal', { name: 'score', value: 100 });
      pass.run(makeAST(root));
      expect(root.inferredType).toBe('int');
    });

    it('recurses into children', () => {
      const child = makeNode('Literal', { name: 'child_val', value: true });
      const root = makeNode('Scene', { children: [child] });
      const map = pass.run(makeAST(root));
      expect(map.get('child_val')).toBe('bool');
    });

    it('unknown nodes do not pollute the TypeMap', () => {
      const root = makeNode('Unknown');
      const map = pass.run(makeAST(root));
      expect(map.size).toBe(0);
    });
  });

  // ─── Trait property inference ───────────────────────────────────────

  describe('inferTraitProperty()', () => {
    const configs: TraitConfigRegistry = new Map([
      ['physics', { gravity: 9.81, enabled: true, layers: [1, 2, 3] }],
      ['audio', { volume: 0.8, pitch: 1.0, position: [0, 1, 0] }],
    ]);
    const pass = new TypeInferencePass({ traitConfigs: configs });

    it('infers float from defaultConfig gravity', () => {
      expect(pass.inferTraitProperty('physics', 'gravity')).toBe('float');
    });

    it('infers bool from defaultConfig enabled', () => {
      expect(pass.inferTraitProperty('physics', 'enabled')).toBe('bool');
    });

    it('infers vec3 from defaultConfig position', () => {
      expect(pass.inferTraitProperty('audio', 'position')).toBe('vec3');
    });

    it('unknown trait → unknown', () => {
      expect(pass.inferTraitProperty('nonexistent', 'any')).toBe('unknown');
    });

    it('unknown property on known trait → unknown', () => {
      expect(pass.inferTraitProperty('physics', 'nonexistent')).toBe('unknown');
    });
  });

  // ─── inferValue() ───────────────────────────────────────────────────

  describe('inferValue()', () => {
    const pass = new TypeInferencePass();

    it('vec2 from 2-element array', () => expect(pass.inferValue([3, 4])).toBe('vec2'));
    it('color from 4-element 0-1 array', () => expect(pass.inferValue([0.1, 0.2, 0.3, 0.4])).toBe('color'));
    it('string', () => expect(pass.inferValue('xyz')).toBe('string'));
    it('int', () => expect(pass.inferValue(7)).toBe('int'));
    it('bool from false', () => expect(pass.inferValue(false)).toBe('bool'));
    it('unknown for object', () => expect(pass.inferValue({ k: 1 })).toBe('unknown'));
  });
});
