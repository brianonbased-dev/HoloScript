import { describe, it, expect, beforeEach } from 'vitest';
import { SaveManager } from '../persistence/SaveManager';

describe('SaveManager', () => {
  let sm: SaveManager;

  beforeEach(() => {
    sm = new SaveManager({ maxSlots: 3, autosaveInterval: 10, version: 2 });
  });

  it('save creates a slot and load retrieves data', () => {
    sm.save('s1', 'Slot 1', { level: 5, hp: 100 });
    const loaded = sm.load('s1');
    expect(loaded).toEqual({ level: 5, hp: 100 });
  });

  it('save deep-copies data (no reference sharing)', () => {
    const data = { items: [1, 2, 3] };
    sm.save('s1', 'Slot 1', data);
    data.items.push(4);
    expect(sm.load('s1')).toEqual({ items: [1, 2, 3] });
  });

  it('load returns null for unknown slot', () => {
    expect(sm.load('nope')).toBeNull();
  });

  it('maxSlots evicts oldest slot when full', () => {
    sm.save('s1', 'A', { a: 1 });
    sm.save('s2', 'B', { b: 2 });
    sm.save('s3', 'C', { c: 3 });
    sm.save('s4', 'D', { d: 4 }); // should evict s1
    expect(sm.getSlotCount()).toBe(3);
    expect(sm.getSlot('s1')).toBeUndefined();
    expect(sm.getSlot('s4')).toBeDefined();
  });

  it('deleteSlot removes a slot', () => {
    sm.save('s1', 'A', { a: 1 });
    expect(sm.deleteSlot('s1')).toBe(true);
    expect(sm.getSlotCount()).toBe(0);
  });

  it('isCorrupted returns false for valid slot', () => {
    sm.save('s1', 'A', { val: 42 });
    expect(sm.isCorrupted('s1')).toBe(false);
  });

  it('checksum detects corruption', () => {
    sm.save('s1', 'A', { val: 42 });
    const slot = sm.getSlot('s1')!;
    slot.data = { val: 999 }; // tamper
    expect(sm.isCorrupted('s1')).toBe(true);
  });

  it('autosave creates slot after interval', () => {
    sm.setCurrentData({ score: 100 });
    sm.update(10); // triggers autosave at 10s
    expect(sm.getSlot('autosave')).toBeDefined();
  });

  it('exportAll and importAll round-trips', () => {
    sm.save('s1', 'A', { a: 1 });
    sm.save('s2', 'B', { b: 2 });
    const json = sm.exportAll();
    const sm2 = new SaveManager();
    expect(sm2.importAll(json)).toBe(2);
    expect(sm2.getSlotCount()).toBe(2);
  });

  it('listeners are called on save and load', () => {
    const saves: string[] = [],
      loads: string[] = [];
    sm.onSave((slot) => saves.push(slot.id));
    sm.onLoad((slot) => loads.push(slot.id));
    sm.save('s1', 'A', { a: 1 });
    sm.load('s1');
    expect(saves).toEqual(['s1']);
    expect(loads).toEqual(['s1']);
  });

  it('getPlaytime accumulates over updates', () => {
    sm.update(5);
    sm.update(3);
    expect(sm.getPlaytime()).toBeCloseTo(8);
  });
});
