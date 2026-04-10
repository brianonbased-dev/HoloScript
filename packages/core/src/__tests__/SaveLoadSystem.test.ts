import { describe, it, expect, beforeEach } from 'vitest';
import { SaveSerializer } from '../persistence/SaveSerializer';
import { SaveManager } from '../persistence/SaveManager';

describe('Save/Load System (Cycle 182)', () => {
  describe('SaveSerializer', () => {
    let serializer: SaveSerializer;

    beforeEach(() => {
      serializer = new SaveSerializer({
        version: 2,
        fields: [
          { name: 'playerName', type: 'string' },
          { name: 'level', type: 'number' },
          { name: 'alive', type: 'boolean' },
          { name: 'inventory', type: 'array' },
        ],
      });
    });

    it('should encode data with header', () => {
      const save = serializer.encode({
        playerName: 'Hero',
        level: 10,
        alive: true,
        inventory: ['sword'],
      });
      expect(save.header.version).toBe(2);
      expect(save.header.checksum).toBeDefined();
      expect(save.payload.playerName).toBe('Hero');
    });

    it('should decode valid data', () => {
      const save = serializer.encode({ playerName: 'Hero', level: 5, alive: true, inventory: [] });
      const decoded = serializer.decode(save);
      expect(decoded).not.toBeNull();
      expect(decoded!.level).toBe(5);
    });

    it('should reject corrupted data', () => {
      const save = serializer.encode({ playerName: 'Hero', level: 5, alive: true, inventory: [] });
      save.header.checksum = 12345; // corrupt
      expect(serializer.decode(save)).toBeNull();
    });

    it('should validate field types', () => {
      const save = serializer.encode({
        playerName: 42,
        level: 'ten',
        alive: 1,
        inventory: 'not-array',
      });
      expect(typeof save.payload.playerName).toBe('string');
      expect(typeof save.payload.level).toBe('number');
    });
  });

  describe('SaveManager', () => {
    let manager: SaveManager;

    beforeEach(() => {
      manager = new SaveManager({ maxSlots: 3, autosaveInterval: 10 });
    });

    it('should save and load', () => {
      manager.save('slot1', 'My Save', { level: 5, hp: 100 });
      const data = manager.load('slot1');
      expect(data).not.toBeNull();
      expect(data!.level).toBe(5);
    });

    it('should detect corruption', () => {
      manager.save('slot1', 'Test', { x: 1 });
      expect(manager.isCorrupted('slot1')).toBe(false);
    });

    it('should manage multiple slots', () => {
      manager.save('s1', 'Save 1', { a: 1 });
      manager.save('s2', 'Save 2', { b: 2 });
      expect(manager.getSlotCount()).toBe(2);
      expect(manager.getAllSlots()).toHaveLength(2);
    });

    it('should delete slots', () => {
      manager.save('s1', 'Save 1', { a: 1 });
      expect(manager.deleteSlot('s1')).toBe(true);
      expect(manager.getSlotCount()).toBe(0);
    });

    it('should enforce max slots', () => {
      manager.save('s1', 'S1', { a: 1 });
      manager.save('s2', 'S2', { b: 2 });
      manager.save('s3', 'S3', { c: 3 });
      manager.save('s4', 'S4', { d: 4 }); // should evict oldest
      expect(manager.getSlotCount()).toBe(3);
    });

    it('should track playtime', () => {
      manager.update(5);
      manager.update(3);
      expect(manager.getPlaytime()).toBe(8);
    });

    it('should export and import', () => {
      manager.save('s1', 'Export Test', { x: 42 });
      const json = manager.exportAll();
      const newManager = new SaveManager();
      const count = newManager.importAll(json);
      expect(count).toBe(1);
    });

    it('should fire save listeners', () => {
      let saved = false;
      manager.onSave(() => {
        saved = true;
      });
      manager.save('s1', 'Test', { x: 1 });
      expect(saved).toBe(true);
    });
  });
});
