import { describe, it, expect, beforeEach } from 'vitest';

// MemoryStorageAdapter implementation for testing
// (Extracted from storage.ts since it's not exported)
interface StorageAdapter {
  get<T = unknown>(key: string): Promise<T | null>;
  set<T = unknown>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
  clear(): Promise<void>;
  keys(): Promise<string[]>;
  has(key: string): Promise<boolean>;
}

class MemoryStorageAdapter implements StorageAdapter {
  private data: Map<string, unknown> = new Map();

  async get<T = unknown>(key: string): Promise<T | null> {
    const value = this.data.get(key);
    return (value as T) ?? null;
  }

  async set<T = unknown>(key: string, value: T): Promise<void> {
    this.data.set(key, value);
  }

  async remove(key: string): Promise<void> {
    this.data.delete(key);
  }

  async clear(): Promise<void> {
    this.data.clear();
  }

  async keys(): Promise<string[]> {
    return Array.from(this.data.keys());
  }

  async has(key: string): Promise<boolean> {
    return this.data.has(key);
  }
}

describe('MemoryStorageAdapter', () => {
  let storage: MemoryStorageAdapter;

  beforeEach(() => {
    storage = new MemoryStorageAdapter();
  });

  describe('get/set', () => {
    it('should store and retrieve string values', async () => {
      await storage.set('key1', 'value1');
      expect(await storage.get('key1')).toBe('value1');
    });

    it('should store and retrieve number values', async () => {
      await storage.set('count', 42);
      expect(await storage.get('count')).toBe(42);
    });

    it('should store and retrieve boolean values', async () => {
      await storage.set('enabled', true);
      expect(await storage.get('enabled')).toBe(true);
    });

    it('should store and retrieve object values', async () => {
      const obj = { name: 'test', value: 123 };
      await storage.set('obj', obj);
      expect(await storage.get('obj')).toEqual(obj);
    });

    it('should store and retrieve array values', async () => {
      const arr = [1, 2, 3, 'four'];
      await storage.set('arr', arr);
      expect(await storage.get('arr')).toEqual(arr);
    });

    it('should store and retrieve nested objects', async () => {
      const nested = {
        level1: {
          level2: {
            value: 'deep',
          },
        },
      };
      await storage.set('nested', nested);
      expect(await storage.get('nested')).toEqual(nested);
    });

    it('should return null for non-existent keys', async () => {
      expect(await storage.get('nonexistent')).toBeNull();
    });

    it('should overwrite existing values', async () => {
      await storage.set('key', 'first');
      await storage.set('key', 'second');
      expect(await storage.get('key')).toBe('second');
    });

    it('should handle null values', async () => {
      await storage.set('nullKey', null);
      expect(await storage.get('nullKey')).toBeNull();
    });

    it('should handle undefined values', async () => {
      await storage.set('undefinedKey', undefined);
      // The ?? null pattern converts undefined to null on retrieval
      expect(await storage.get('undefinedKey')).toBeNull();
    });

    it('should handle empty string keys', async () => {
      await storage.set('', 'empty key value');
      expect(await storage.get('')).toBe('empty key value');
    });

    it('should handle special characters in keys', async () => {
      await storage.set('key:with/special.chars', 'value');
      expect(await storage.get('key:with/special.chars')).toBe('value');
    });
  });

  describe('remove', () => {
    it('should remove existing keys', async () => {
      await storage.set('toRemove', 'value');
      await storage.remove('toRemove');
      expect(await storage.get('toRemove')).toBeNull();
    });

    it('should not throw when removing non-existent keys', async () => {
      await expect(storage.remove('nonexistent')).resolves.not.toThrow();
    });

    it('should only remove the specified key', async () => {
      await storage.set('key1', 'value1');
      await storage.set('key2', 'value2');
      await storage.remove('key1');
      expect(await storage.get('key1')).toBeNull();
      expect(await storage.get('key2')).toBe('value2');
    });
  });

  describe('clear', () => {
    it('should remove all keys', async () => {
      await storage.set('key1', 'value1');
      await storage.set('key2', 'value2');
      await storage.set('key3', 'value3');
      await storage.clear();
      expect(await storage.keys()).toHaveLength(0);
    });

    it('should not throw when clearing empty storage', async () => {
      await expect(storage.clear()).resolves.not.toThrow();
    });

    it('should allow new values after clear', async () => {
      await storage.set('key', 'value');
      await storage.clear();
      await storage.set('newKey', 'newValue');
      expect(await storage.get('newKey')).toBe('newValue');
    });
  });

  describe('keys', () => {
    it('should return empty array for empty storage', async () => {
      expect(await storage.keys()).toEqual([]);
    });

    it('should return all stored keys', async () => {
      await storage.set('a', 1);
      await storage.set('b', 2);
      await storage.set('c', 3);
      const keys = await storage.keys();
      expect(keys).toHaveLength(3);
      expect(keys).toContain('a');
      expect(keys).toContain('b');
      expect(keys).toContain('c');
    });

    it('should not include removed keys', async () => {
      await storage.set('keep', 'value');
      await storage.set('remove', 'value');
      await storage.remove('remove');
      const keys = await storage.keys();
      expect(keys).toEqual(['keep']);
    });

    it('should update after modifications', async () => {
      await storage.set('key1', 'value1');
      expect(await storage.keys()).toHaveLength(1);
      await storage.set('key2', 'value2');
      expect(await storage.keys()).toHaveLength(2);
      await storage.remove('key1');
      expect(await storage.keys()).toHaveLength(1);
    });
  });

  describe('has', () => {
    it('should return true for existing keys', async () => {
      await storage.set('exists', 'value');
      expect(await storage.has('exists')).toBe(true);
    });

    it('should return false for non-existent keys', async () => {
      expect(await storage.has('nonexistent')).toBe(false);
    });

    it('should return false after key is removed', async () => {
      await storage.set('toRemove', 'value');
      await storage.remove('toRemove');
      expect(await storage.has('toRemove')).toBe(false);
    });

    it('should return true even for null/undefined values', async () => {
      await storage.set('nullValue', null);
      expect(await storage.has('nullValue')).toBe(true);
    });
  });

  describe('isolation', () => {
    it('should keep separate storage instances isolated', async () => {
      const storage1 = new MemoryStorageAdapter();
      const storage2 = new MemoryStorageAdapter();

      await storage1.set('key', 'value1');
      await storage2.set('key', 'value2');

      expect(await storage1.get('key')).toBe('value1');
      expect(await storage2.get('key')).toBe('value2');
    });
  });

  describe('async behavior', () => {
    it('should handle concurrent operations', async () => {
      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(storage.set(`key${i}`, i));
      }
      await Promise.all(promises);

      const keys = await storage.keys();
      expect(keys).toHaveLength(100);

      for (let i = 0; i < 100; i++) {
        expect(await storage.get(`key${i}`)).toBe(i);
      }
    });

    it('should handle rapid get/set cycles', async () => {
      for (let i = 0; i < 50; i++) {
        await storage.set('counter', i);
        expect(await storage.get('counter')).toBe(i);
      }
    });
  });
});

// Test typed storage patterns
describe('Typed Storage Patterns', () => {
  let storage: MemoryStorageAdapter;

  beforeEach(() => {
    storage = new MemoryStorageAdapter();
  });

  interface UserData {
    id: number;
    name: string;
    email: string;
  }

  it('should preserve type information with generics', async () => {
    const user: UserData = { id: 1, name: 'Test', email: 'test@example.com' };
    await storage.set('user', user);

    const retrieved = await storage.get<UserData>('user');
    expect(retrieved?.id).toBe(1);
    expect(retrieved?.name).toBe('Test');
    expect(retrieved?.email).toBe('test@example.com');
  });

  it('should work with Date objects', async () => {
    const date = new Date('2024-01-01');
    await storage.set('date', date);
    const retrieved = await storage.get<Date>('date');
    expect(retrieved).toEqual(date);
  });

  it('should work with Map-like patterns', async () => {
    const map = new Map([
      ['a', 1],
      ['b', 2],
    ]);
    // Store as array of entries since Map doesn't serialize
    await storage.set('map', Array.from(map.entries()));
    const entries = await storage.get<[string, number][]>('map');
    const reconstructed = new Map(entries!);
    expect(reconstructed.get('a')).toBe(1);
    expect(reconstructed.get('b')).toBe(2);
  });
});
