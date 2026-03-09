/**
 * BindingManager Production Tests
 *
 * Singleton, binding CRUD, dependency graph, expressions, stores,
 * transforms (clamp, lerp, format, map, validate), affected properties,
 * circular detection, execution order, and stats.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  BindingManager,
  createBinding,
  createTwoWayBinding,
  createComputedBinding,
  createStoreSlice,
  createDataStore,
} from '../DataBindingSchema';

describe('BindingManager — Production', () => {
  let bm: BindingManager;

  beforeEach(() => {
    BindingManager.resetInstance();
    bm = BindingManager.getInstance();
  });

  describe('singleton', () => {
    it('returns same instance', () => {
      expect(BindingManager.getInstance()).toBe(bm);
    });
  });

  describe('binding CRUD', () => {
    it('registers and retrieves binding', () => {
      const b = createBinding('pos.x', 'ui.label', 'state');
      bm.registerBinding(b);
      expect(bm.getBinding(b.id)).toBe(b);
    });

    it('unregisters binding', () => {
      const b = createBinding('a', 'b');
      bm.registerBinding(b);
      bm.unregisterBinding(b.id);
      expect(bm.getBinding(b.id)).toBeUndefined();
    });

    it('getBindingsForSource returns enabled bindings', () => {
      const b1 = createBinding('src', 'tgt1');
      const b2 = createBinding('src', 'tgt2', 'state', { enabled: false });
      bm.registerBinding(b1);
      bm.registerBinding(b2);

      const results = bm.getBindingsForSource('src');
      expect(results.length).toBe(1);
      expect(results[0].target).toBe('tgt1');
    });

    it('getBindingsForTarget returns matching bindings', () => {
      const b = createBinding('a', 'my.target');
      bm.registerBinding(b);
      expect(bm.getBindingsForTarget('my.target').length).toBe(1);
    });
  });

  describe('expressions', () => {
    it('registers and retrieves expression', () => {
      const { expression } = createComputedBinding('x + y', 'result', ['x', 'y']);
      bm.registerExpression(expression);
      expect(bm.getExpression(expression.id)).toBe(expression);
    });

    it('finds dependent expressions', () => {
      const { expression } = createComputedBinding('a * 2', 'b', ['a', 'c']);
      bm.registerExpression(expression);

      expect(bm.findDependentExpressions('a').length).toBe(1);
      expect(bm.findDependentExpressions('z').length).toBe(0);
    });
  });

  describe('stores', () => {
    it('registers and retrieves store', () => {
      const slice = createStoreSlice('counter', { count: 0 }, { actions: ['increment'] });
      const store = createDataStore('app', [slice]);
      bm.registerStore(store);

      expect(bm.getStore('store_app')).toBe(store);
      expect(bm.getAllStores().length).toBe(1);
    });
  });

  describe('transforms', () => {
    it('identity passes through', () => {
      expect(bm.applyTransforms(42, [{ type: 'identity' }])).toBe(42);
    });

    it('clamp limits value', () => {
      expect(bm.applyTransforms(150, [{ type: 'clamp', params: { min: 0, max: 100 } }])).toBe(100);
      expect(bm.applyTransforms(-5, [{ type: 'clamp', params: { min: 0, max: 100 } }])).toBe(0);
    });

    it('lerp interpolates', () => {
      const result = bm.applyTransforms(0, [
        { type: 'lerp', params: { target: 100, factor: 0.5 } },
      ]);
      expect(result).toBe(50);
    });

    it('format replaces template', () => {
      expect(
        bm.applyTransforms(42, [{ type: 'format', params: { template: 'Score: {value}' } }])
      ).toBe('Score: 42');
    });

    it('map looks up value', () => {
      expect(
        bm.applyTransforms('red', [{ type: 'map', params: { mapping: { red: '#ff0000' } } }])
      ).toBe('#ff0000');
    });

    it('validate returns fallback for null', () => {
      expect(
        bm.applyTransforms(null, [{ type: 'validate', params: { fallback: 'default' } }])
      ).toBe('default');
    });

    it('chains transforms', () => {
      const result = bm.applyTransforms(200, [
        { type: 'clamp', params: { min: 0, max: 100 } },
        { type: 'format', params: { template: '{value}%' } },
      ]);
      expect(result).toBe('100%');
    });
  });

  describe('dependency analysis', () => {
    it('gets affected properties', () => {
      bm.registerBinding(createBinding('health', 'ui.healthbar'));
      bm.registerBinding(createBinding('health', 'audio.heartbeat'));

      const affected = bm.getAffectedProperties('health');
      expect(affected).toContain('ui.healthbar');
      expect(affected).toContain('audio.heartbeat');
    });

    it('detects circular bindings', () => {
      bm.registerBinding(createBinding('a', 'b', 'state', { direction: 'two-way' }));
      bm.registerBinding(createBinding('b', 'a', 'state', { direction: 'two-way' }));

      const cycles = bm.detectCircularBindings();
      expect(cycles.length).toBeGreaterThan(0);
    });
  });

  describe('stats', () => {
    it('returns correct stats', () => {
      bm.registerBinding(createBinding('a', 'b', 'state'));
      bm.registerBinding(createBinding('c', 'd', 'network', { direction: 'two-way' }));

      const stats = bm.getStats();
      expect(stats.totalBindings).toBe(2);
      expect(stats.enabledBindings).toBe(2);
    });
  });

  describe('clear', () => {
    it('clears all data', () => {
      bm.registerBinding(createBinding('x', 'y'));
      bm.registerExpression({
        id: 'e1',
        expression: 'x',
        dependencies: [],
        resultType: 'number',
        cached: false,
        perFrame: false,
      });
      bm.registerStore(createDataStore('s', []));

      bm.clear();
      expect(bm.getStats().totalBindings).toBe(0);
      expect(bm.getAllStores().length).toBe(0);
    });
  });

  describe('factory functions', () => {
    it('createBinding sets defaults', () => {
      const b = createBinding('src', 'tgt');
      expect(b.direction).toBe('one-way');
      expect(b.enabled).toBe(true);
      expect(b.priority).toBe(0);
    });

    it('createTwoWayBinding', () => {
      const b = createTwoWayBinding('a', 'b');
      expect(b.direction).toBe('two-way');
    });

    it('createStoreSlice defaults', () => {
      const s = createStoreSlice('counter', { count: 0 });
      expect(s.persistent).toBe(false);
      expect(s.networked).toBe(false);
      expect(s.actions).toEqual([]);
    });
  });
});
