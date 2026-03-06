import { describe, it, expect, beforeEach } from 'vitest';
import { PropertyGrid, PropertyDescriptor } from '../../editor/PropertyGrid';

const stringDesc: PropertyDescriptor = { key: 'name', type: 'string', label: 'Name' };
const numberDesc: PropertyDescriptor = { key: 'speed', type: 'number', min: 0, max: 100 };
const boolDesc: PropertyDescriptor = { key: 'active', type: 'boolean' };
const readonlyDesc: PropertyDescriptor = { key: 'id', type: 'string', readonly: true };
const enumDesc: PropertyDescriptor = { key: 'mode', type: 'enum', enumValues: ['a', 'b', 'c'] };

describe('PropertyGrid — Production Tests', () => {
  let pg: PropertyGrid;

  beforeEach(() => {
    pg = new PropertyGrid();
  });

  describe('registerDescriptors() / getDescriptors()', () => {
    it('registers descriptors for a component type', () => {
      pg.registerDescriptors('Transform', [stringDesc, numberDesc]);
      expect(pg.getDescriptors('Transform').length).toBe(2);
    });

    it('returns empty array for unregistered type', () => {
      expect(pg.getDescriptors('Unknown')).toEqual([]);
    });

    it('replaces descriptors when registered again', () => {
      pg.registerDescriptors('Transform', [stringDesc]);
      pg.registerDescriptors('Transform', [numberDesc, boolDesc]);
      expect(pg.getDescriptors('Transform').length).toBe(2);
    });
  });

  describe('setValues() / getValues()', () => {
    it('stores and retrieves values for a target', () => {
      pg.setValues('entity-1', { name: 'Box', speed: 5 });
      expect(pg.getValues('entity-1')).toEqual({ name: 'Box', speed: 5 });
    });

    it('returns undefined for unknown target', () => {
      expect(pg.getValues('ghost')).toBeUndefined();
    });

    it('stores a snapshot (not reference)', () => {
      const src = { x: 1 };
      pg.setValues('e', src);
      src.x = 99;
      expect(pg.getValues('e')!.x).toBe(1);
    });
  });

  describe('setValue()', () => {
    it('updates a single property', () => {
      pg.setValues('e1', { name: 'Old' });
      pg.setValue('e1', 'name', 'New');
      expect(pg.getValues('e1')!.name).toBe('New');
    });

    it('is a no-op for unknown target', () => {
      expect(() => pg.setValue('ghost', 'x', 1)).not.toThrow();
    });

    it('records change in history', () => {
      pg.setValues('e1', { x: 0 });
      pg.setValue('e1', 'x', 5);
      expect(pg.getHistoryCount()).toBe(1);
    });

    it('captures oldValue in change record', () => {
      pg.setValues('e1', { x: 10 });
      pg.setValue('e1', 'x', 20);
      // undo restores old value
      pg.undo();
      expect(pg.getValues('e1')!.x).toBe(10);
    });

    it('caps history at maxHistorySize (100)', () => {
      pg.setValues('e1', { x: 0 });
      for (let i = 0; i < 110; i++) pg.setValue('e1', 'x', i);
      // after 110 pushes and 10 shifts, length should be 100
      expect(pg.getHistoryCount()).toBe(100);
    });
  });

  describe('batchSetValue()', () => {
    it('applies value to multiple targets', () => {
      pg.setValues('a', { speed: 0 });
      pg.setValues('b', { speed: 0 });
      const count = pg.batchSetValue(['a', 'b'], 'speed', 99);
      expect(count).toBe(2);
      expect(pg.getValues('a')!.speed).toBe(99);
      expect(pg.getValues('b')!.speed).toBe(99);
    });

    it('skips targets that do not exist', () => {
      pg.setValues('a', { speed: 0 });
      const count = pg.batchSetValue(['a', 'ghost'], 'speed', 10);
      expect(count).toBe(1);
    });

    it('returns 0 when no targets found', () => {
      expect(pg.batchSetValue(['x', 'y'], 'v', 1)).toBe(0);
    });
  });

  describe('undo()', () => {
    it('restores previous value and returns the change', () => {
      pg.setValues('e1', { n: 1 });
      pg.setValue('e1', 'n', 2);
      const change = pg.undo();
      expect(change).toBeDefined();
      expect(change!.oldValue).toBe(1);
      expect(pg.getValues('e1')!.n).toBe(1);
    });

    it('returns undefined when no history', () => {
      expect(pg.undo()).toBeUndefined();
    });

    it('decrements history count', () => {
      pg.setValues('e', { x: 0 });
      pg.setValue('e', 'x', 1);
      pg.setValue('e', 'x', 2);
      pg.undo();
      expect(pg.getHistoryCount()).toBe(1);
    });
  });

  describe('validate()', () => {
    it('validates string type correctly', () => {
      expect(pg.validate(stringDesc, 'hello').valid).toBe(true);
      expect(pg.validate(stringDesc, 42).valid).toBe(false);
    });

    it('validates number type with min/max', () => {
      expect(pg.validate(numberDesc, 50).valid).toBe(true);
      expect(pg.validate(numberDesc, -1).valid).toBe(false);
      expect(pg.validate(numberDesc, 101).valid).toBe(false);
    });

    it('validates boolean type', () => {
      expect(pg.validate(boolDesc, false).valid).toBe(true);
      expect(pg.validate(boolDesc, 'x').valid).toBe(false);
    });

    it('validates enum type', () => {
      expect(pg.validate(enumDesc, 'a').valid).toBe(true);
      expect(pg.validate(enumDesc, 'z').valid).toBe(false);
      expect(pg.validate(enumDesc, 'z').error).toMatch(/one of/i);
    });

    it('rejects readonly property', () => {
      const result = pg.validate(readonlyDesc, 'any');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/readonly/i);
    });

    it('accepts any value for unknown/color types', () => {
      const colorDesc: PropertyDescriptor = { key: 'color', type: 'color' };
      expect(pg.validate(colorDesc, '#fff').valid).toBe(true);
    });
  });

  describe('configureGroup() / toggleGroup() / getGroup()', () => {
    it('configures a group', () => {
      pg.configureGroup('Physics', { collapsed: true, order: 2 });
      const g = pg.getGroup('Physics')!;
      expect(g.collapsed).toBe(true);
      expect(g.order).toBe(2);
    });

    it('creates group with defaults if not present', () => {
      pg.configureGroup('New');
      const g = pg.getGroup('New')!;
      expect(g.collapsed).toBe(false);
      expect(g.order).toBe(0);
    });

    it('toggleGroup() flips collapsed state', () => {
      pg.configureGroup('G', { collapsed: false });
      pg.toggleGroup('G');
      expect(pg.getGroup('G')!.collapsed).toBe(true);
      pg.toggleGroup('G');
      expect(pg.getGroup('G')!.collapsed).toBe(false);
    });

    it('toggleGroup() is no-op for missing group', () => {
      expect(() => pg.toggleGroup('Missing')).not.toThrow();
    });

    it('getGroup() returns undefined for missing group', () => {
      expect(pg.getGroup('X')).toBeUndefined();
    });
  });

  describe('getGroupedDescriptors()', () => {
    it('groups descriptors by group field', () => {
      pg.registerDescriptors('C', [
        { key: 'a', type: 'string', group: 'Basic' },
        { key: 'b', type: 'number', group: 'Basic' },
        { key: 'c', type: 'boolean', group: 'Advanced' },
      ]);
      const grouped = pg.getGroupedDescriptors('C');
      expect(grouped.get('Basic')!.length).toBe(2);
      expect(grouped.get('Advanced')!.length).toBe(1);
    });

    it('uses "General" as default group', () => {
      pg.registerDescriptors('C', [{ key: 'x', type: 'string' }]);
      const grouped = pg.getGroupedDescriptors('C');
      expect(grouped.has('General')).toBe(true);
    });
  });

  describe('clear()', () => {
    it('removes all data', () => {
      pg.registerDescriptors('C', [stringDesc]);
      pg.setValues('e', { x: 1 });
      pg.setValue('e', 'x', 2);
      pg.configureGroup('G', { collapsed: true });
      pg.clear();
      expect(pg.getDescriptors('C')).toEqual([]);
      expect(pg.getValues('e')).toBeUndefined();
      expect(pg.getHistoryCount()).toBe(0);
      expect(pg.getGroup('G')).toBeUndefined();
    });
  });
});
