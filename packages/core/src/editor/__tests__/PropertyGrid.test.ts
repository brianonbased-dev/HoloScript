import { describe, it, expect } from 'vitest';
import { PropertyGrid, type PropertyDescriptor } from '../PropertyGrid';

const sampleDescriptors: PropertyDescriptor[] = [
  { key: 'x', type: 'number', min: 0, max: 100, group: 'Position' },
  { key: 'y', type: 'number', min: 0, max: 100, group: 'Position' },
  { key: 'name', type: 'string', group: 'General' },
  { key: 'visible', type: 'boolean' },
  { key: 'mode', type: 'enum', enumValues: ['walk', 'fly', 'swim'] },
  { key: 'locked', type: 'boolean', readonly: true },
];

describe('PropertyGrid', () => {
  it('registerDescriptors and getDescriptors', () => {
    const pg = new PropertyGrid();
    pg.registerDescriptors('Transform', sampleDescriptors);
    expect(pg.getDescriptors('Transform').length).toBe(6);
  });

  it('getDescriptors returns empty for unknown', () => {
    const pg = new PropertyGrid();
    expect(pg.getDescriptors('Unknown')).toEqual([]);
  });

  it('setValues and getValues', () => {
    const pg = new PropertyGrid();
    pg.setValues('e1', { x: 10, y: 20 });
    expect(pg.getValues('e1')).toEqual({ x: 10, y: 20 });
  });

  it('setValues clones values', () => {
    const pg = new PropertyGrid();
    const vals = { x: 5 };
    pg.setValues('e1', vals);
    vals[0] = 99;
    expect(pg.getValues('e1')![0]).toBe(5);
  });

  it('getValues returns undefined for unknown', () => {
    const pg = new PropertyGrid();
    expect(pg.getValues('nope')).toBeUndefined();
  });

  it('setValue tracks history', () => {
    const pg = new PropertyGrid();
    pg.setValues('e1', { x: 0 });
    pg.setValue('e1', 'x', 42);
    expect(pg.getValues('e1')![0]).toBe(42);
    expect(pg.getHistoryCount()).toBe(1);
  });

  it('setValue is no-op for unknown target', () => {
    const pg = new PropertyGrid();
    pg.setValue('nope', 'x', 42);
    expect(pg.getHistoryCount()).toBe(0);
  });

  it('undo restores previous value', () => {
    const pg = new PropertyGrid();
    pg.setValues('e1', { x: 0 });
    pg.setValue('e1', 'x', 42);
    const change = pg.undo();
    expect(change!.newValue).toBe(42);
    expect(pg.getValues('e1')![0]).toBe(0);
  });

  it('undo returns undefined when empty', () => {
    const pg = new PropertyGrid();
    expect(pg.undo()).toBeUndefined();
  });

  it('history is capped at maxHistorySize', () => {
    const pg = new PropertyGrid();
    pg.setValues('e1', { x: 0 });
    for (let i = 0; i < 150; i++) pg.setValue('e1', 'x', i);
    expect(pg.getHistoryCount()).toBe(100); // default max
  });

  it('batchSetValue applies to multiple targets', () => {
    const pg = new PropertyGrid();
    pg.setValues('e1', { x: 0 });
    pg.setValues('e2', { x: 0 });
    pg.setValues('e3', { x: 0 });
    const count = pg.batchSetValue(['e1', 'e2', 'e3'], 'x', 99);
    expect(count).toBe(3);
    expect(pg.getValues('e1')![0]).toBe(99);
    expect(pg.getValues('e3')![0]).toBe(99);
  });

  it('batchSetValue skips unknown targets', () => {
    const pg = new PropertyGrid();
    pg.setValues('e1', { x: 0 });
    const count = pg.batchSetValue(['e1', 'missing'], 'x', 99);
    expect(count).toBe(1);
  });

  it('validate number range', () => {
    const pg = new PropertyGrid();
    const desc: PropertyDescriptor = { key: 'x', type: 'number', min: 0, max: 100 };
    expect(pg.validate(desc, 50).valid).toBe(true);
    expect(pg.validate(desc, -1).valid).toBe(false);
    expect(pg.validate(desc, 101).valid).toBe(false);
    expect(pg.validate(desc, 'str').valid).toBe(false);
  });

  it('validate enum', () => {
    const pg = new PropertyGrid();
    const desc: PropertyDescriptor = { key: 'mode', type: 'enum', enumValues: ['a', 'b'] };
    expect(pg.validate(desc, 'a').valid).toBe(true);
    expect(pg.validate(desc, 'c').valid).toBe(false);
  });

  it('validate readonly rejects', () => {
    const pg = new PropertyGrid();
    const desc: PropertyDescriptor = { key: 'lock', type: 'boolean', readonly: true };
    expect(pg.validate(desc, true).valid).toBe(false);
  });

  it('validate types', () => {
    const pg = new PropertyGrid();
    expect(pg.validate({ key: 'n', type: 'string' }, 'hello').valid).toBe(true);
    expect(pg.validate({ key: 'n', type: 'string' }, 123).valid).toBe(false);
    expect(pg.validate({ key: 'n', type: 'boolean' }, true).valid).toBe(true);
    expect(pg.validate({ key: 'n', type: 'boolean' }, 'nah').valid).toBe(false);
  });

  it('configureGroup and toggleGroup', () => {
    const pg = new PropertyGrid();
    pg.configureGroup('Position', { order: 1 });
    expect(pg.getGroup('Position')!.collapsed).toBe(false);
    pg.toggleGroup('Position');
    expect(pg.getGroup('Position')!.collapsed).toBe(true);
  });

  it('getGroupedDescriptors organizes by group', () => {
    const pg = new PropertyGrid();
    pg.registerDescriptors('Transform', sampleDescriptors);
    const grouped = pg.getGroupedDescriptors('Transform');
    expect(grouped.get('Position')!.length).toBe(2);
    expect(grouped.get('General')!.length).toBe(4);
  });

  it('clear removes everything', () => {
    const pg = new PropertyGrid();
    pg.registerDescriptors('T', sampleDescriptors);
    pg.setValues('e1', { x: 1 });
    pg.setValue('e1', 'x', 2);
    pg.configureGroup('G', { order: 0 });
    pg.clear();
    expect(pg.getDescriptors('T')).toEqual([]);
    expect(pg.getValues('e1')).toBeUndefined();
    expect(pg.getHistoryCount()).toBe(0);
    expect(pg.getGroup('G')).toBeUndefined();
  });
});
