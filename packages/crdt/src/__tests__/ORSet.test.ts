/**
 * Tests for OR-Set CRDT
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ORSet } from '../types/ORSet';
import { createTestSigner, type DIDSigner } from '../auth/DIDSigner';

describe('ORSet', () => {
  let signer1: DIDSigner;
  let signer2: DIDSigner;
  let set1: ORSet<string>;
  let set2: ORSet<string>;

  beforeEach(() => {
    signer1 = createTestSigner('agent-1');
    signer2 = createTestSigner('agent-2');
    set1 = new ORSet('test-set', signer1);
    set2 = new ORSet('test-set', signer2);
  });

  describe('initialization', () => {
    it('should start empty', () => {
      expect(set1.size()).toBe(0);
      expect(set1.values()).toEqual([]);
    });

    it('should return CRDT ID', () => {
      expect(set1.getCRDTId()).toBe('test-set');
    });
  });

  describe('add operation', () => {
    it('should add element and return signed operation', async () => {
      const signedOp = await set1.add('item1');

      expect(set1.has('item1')).toBe(true);
      expect(set1.size()).toBe(1);
      expect(signedOp.operation.type).toBe('or_set_add');
    });

    it('should allow duplicate adds with different tags', async () => {
      await set1.add('item');
      await set1.add('item'); // Add same item again

      expect(set1.has('item')).toBe(true);
      expect(set1.size()).toBe(1); // Still appears once
    });

    it('should add multiple distinct elements', async () => {
      await set1.add('item1');
      await set1.add('item2');
      await set1.add('item3');

      expect(set1.size()).toBe(3);
      expect(set1.values()).toContain('item1');
      expect(set1.values()).toContain('item2');
      expect(set1.values()).toContain('item3');
    });
  });

  describe('remove operation', () => {
    it('should remove existing element', async () => {
      await set1.add('item');
      const removeOp = await set1.remove('item');

      expect(removeOp).toBeDefined();
      expect(set1.has('item')).toBe(false);
      expect(set1.size()).toBe(0);
    });

    it('should return null when removing non-existent element', async () => {
      const removeOp = await set1.remove('not-exists');

      expect(removeOp).toBeNull();
    });

    it('should allow re-adding after remove', async () => {
      await set1.add('item');
      await set1.remove('item');
      await set1.add('item'); // Re-add

      expect(set1.has('item')).toBe(true);
    });
  });

  describe('concurrent add-remove (OR-Set semantics)', () => {
    it('should preserve concurrent add when remove observed earlier add', async () => {
      // Agent 1 adds item
      const add1 = await set1.add('item');

      // Agent 2 sees and removes it
      const addData = add1.operation.data as { value: string; tag: string };
      set2.applyRemoteAdd(
        addData.value,
        addData.tag,
        add1.operation.timestamp,
        add1.operation.actorDid,
        add1.operation.id
      );

      const remove2 = await set2.remove('item');

      // Agent 1 concurrently adds the item again (different tag)
      const add1Again = await set1.add('item');

      // Apply remove to set1
      if (remove2) {
        const removeData = remove2.operation.data as { value: string; observedTags: string[] };
        set1.applyRemoteRemove(removeData.value, removeData.observedTags);
      }

      // Item should still be in set (concurrent add wins)
      expect(set1.has('item')).toBe(true);
    });

    it('should remove item when all add tags are observed', async () => {
      // Agent 1 adds item twice
      const add1a = await set1.add('item');
      const add1b = await set1.add('item');

      // Agent 2 observes both and removes
      const addData1 = add1a.operation.data as { value: string; tag: string };
      const addData2 = add1b.operation.data as { value: string; tag: string };

      set2.applyRemoteAdd(
        addData1.value,
        addData1.tag,
        add1a.operation.timestamp,
        add1a.operation.actorDid,
        add1a.operation.id
      );

      set2.applyRemoteAdd(
        addData2.value,
        addData2.tag,
        add1b.operation.timestamp,
        add1b.operation.actorDid,
        add1b.operation.id
      );

      const remove2 = await set2.remove('item');

      // Apply to set1
      if (remove2) {
        const removeData = remove2.operation.data as { value: string; observedTags: string[] };
        set1.applyRemoteRemove(removeData.value, removeData.observedTags);
      }

      // Item should be removed (all tags removed)
      expect(set1.has('item')).toBe(false);
      expect(set2.has('item')).toBe(false);
    });
  });

  describe('distributed synchronization', () => {
    it('should converge after applying all operations', async () => {
      // Agent 1 adds items
      const add1a = await set1.add('item1');
      const add1b = await set1.add('item2');

      // Agent 2 adds items
      const add2a = await set2.add('item2');
      const add2b = await set2.add('item3');

      // Exchange operations
      const addData1a = add1a.operation.data as { value: string; tag: string };
      const addData1b = add1b.operation.data as { value: string; tag: string };
      const addData2a = add2a.operation.data as { value: string; tag: string };
      const addData2b = add2b.operation.data as { value: string; tag: string };

      set2.applyRemoteAdd(
        addData1a.value,
        addData1a.tag,
        add1a.operation.timestamp,
        add1a.operation.actorDid,
        add1a.operation.id
      );

      set2.applyRemoteAdd(
        addData1b.value,
        addData1b.tag,
        add1b.operation.timestamp,
        add1b.operation.actorDid,
        add1b.operation.id
      );

      set1.applyRemoteAdd(
        addData2a.value,
        addData2a.tag,
        add2a.operation.timestamp,
        add2a.operation.actorDid,
        add2a.operation.id
      );

      set1.applyRemoteAdd(
        addData2b.value,
        addData2b.tag,
        add2b.operation.timestamp,
        add2b.operation.actorDid,
        add2b.operation.id
      );

      // Both sets should have same elements
      expect(set1.size()).toBe(3);
      expect(set2.size()).toBe(3);
      expect(set1.values().sort()).toEqual(set2.values().sort());
    });
  });

  describe('serialization', () => {
    it('should serialize and deserialize state', async () => {
      await set1.add('item1');
      await set1.add('item2');
      await set1.add('item3');
      await set1.remove('item2');

      const serialized = set1.serialize();
      const deserialized = ORSet.deserialize<string>('test-set', signer1, serialized);

      expect(deserialized.has('item1')).toBe(true);
      expect(deserialized.has('item2')).toBe(false);
      expect(deserialized.has('item3')).toBe(true);
      expect(deserialized.size()).toBe(2);
    });

    it('should handle empty set serialization', () => {
      const serialized = set1.serialize();
      const deserialized = ORSet.deserialize<string>('test-set', signer1, serialized);

      expect(deserialized.size()).toBe(0);
    });
  });

  describe('complex types', () => {
    it('should support object elements', async () => {
      interface InventoryItem {
        id: string;
        name: string;
        quantity: number;
      }

      const inventory = new ORSet<InventoryItem>('inventory', signer1);

      await inventory.add({ id: 'sword', name: 'Iron Sword', quantity: 1 });
      await inventory.add({ id: 'potion', name: 'Health Potion', quantity: 5 });

      expect(inventory.size()).toBe(2);
      expect(inventory.has({ id: 'sword', name: 'Iron Sword', quantity: 1 })).toBe(true);
    });
  });
});
