/**
 * SaveSerializer Production Tests
 *
 * Encode/decode, checksum integrity, field validation, version.
 */

import { describe, it, expect } from 'vitest';
import { SaveSerializer, type SaveSchema } from '../SaveSerializer';

const schema: SaveSchema = {
  version: 1,
  fields: [
    { name: 'hp', type: 'number' },
    { name: 'name', type: 'string' },
    { name: 'alive', type: 'boolean' },
    { name: 'inventory', type: 'array' },
    { name: 'stats', type: 'object' },
  ],
};

describe('SaveSerializer — Production', () => {
  const ser = new SaveSerializer(schema);

  describe('encode', () => {
    it('produces SaveData with header', () => {
      const save = ser.encode({
        hp: 100,
        name: 'Player',
        alive: true,
        inventory: [1, 2],
        stats: { str: 10 },
      });
      expect(save.header.version).toBe(1);
      expect(save.header.fieldCount).toBe(5);
      expect(save.header.checksum).not.toBe(0);
      expect(save.payload.hp).toBe(100);
    });

    it('only includes schema fields', () => {
      const save = ser.encode({ hp: 50, name: 'Test', extra: 'ignored' } as any);
      expect(save.payload).not.toHaveProperty('extra');
    });

    it('validates types', () => {
      const save = ser.encode({
        hp: '42' as any,
        name: 123 as any,
        alive: 0 as any,
        inventory: 'not-array' as any,
        stats: 'not-obj' as any,
      });
      expect(typeof save.payload.hp).toBe('number');
      expect(typeof save.payload.name).toBe('string');
      expect(typeof save.payload.alive).toBe('boolean');
      expect(Array.isArray(save.payload.inventory)).toBe(true); // 'not-array' coerced → []
      expect(save.payload.inventory).toEqual([]);
    });
  });

  describe('decode', () => {
    it('decode round trip', () => {
      const data = { hp: 100, name: 'Hero', alive: true, inventory: ['sword'], stats: { str: 5 } };
      const save = ser.encode(data);
      const decoded = ser.decode(save);
      expect(decoded?.hp).toBe(100);
      expect(decoded?.name).toBe('Hero');
    });

    it('rejects tampered checksum', () => {
      const save = ser.encode({ hp: 100, name: 'Test' });
      save.header.checksum = 999999;
      expect(ser.decode(save)).toBeNull();
    });
  });

  describe('getVersion', () => {
    it('returns schema version', () => {
      expect(ser.getVersion()).toBe(1);
    });
  });
});
