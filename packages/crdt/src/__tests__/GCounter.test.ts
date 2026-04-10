/**
 * Tests for G-Counter CRDT
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { GCounter } from '../types/GCounter';
import { createTestSigner, type DIDSigner } from '../auth/DIDSigner';

describe('GCounter', () => {
  let signer1: DIDSigner;
  let signer2: DIDSigner;
  let counter1: GCounter;
  let counter2: GCounter;

  beforeEach(() => {
    signer1 = createTestSigner('agent-1');
    signer2 = createTestSigner('agent-2');
    counter1 = new GCounter('test-counter', signer1);
    counter2 = new GCounter('test-counter', signer2);
  });

  describe('initialization', () => {
    it('should start at zero', () => {
      expect(counter1.value()).toBe(0);
    });

    it('should return CRDT ID', () => {
      expect(counter1.getCRDTId()).toBe('test-counter');
    });

    it('should initialize own actor counter', () => {
      expect(counter1.getActorCount(signer1.getDID())).toBe(0);
    });
  });

  describe('increment operation', () => {
    it('should increment by 1 (default)', async () => {
      await counter1.increment();

      expect(counter1.value()).toBe(1);
    });

    it('should increment by custom amount', async () => {
      await counter1.increment(5);

      expect(counter1.value()).toBe(5);
    });

    it('should accumulate multiple increments', async () => {
      await counter1.increment(2);
      await counter1.increment(3);
      await counter1.increment(5);

      expect(counter1.value()).toBe(10);
    });

    it('should reject negative increments', async () => {
      await expect(counter1.increment(-5)).rejects.toThrow('grow-only');
    });

    it('should return signed operation', async () => {
      const signedOp = await counter1.increment(1);

      expect(signedOp.operation.type).toBe('g_counter_increment');
      expect(signedOp.jwt).toBeDefined();
    });
  });

  describe('per-actor tracking', () => {
    it('should track increments per actor', async () => {
      await counter1.increment(5);
      await counter2.increment(3);

      expect(counter1.getActorCount(signer1.getDID())).toBe(5);
      expect(counter2.getActorCount(signer2.getDID())).toBe(3);
    });

    it('should return actor counts map', async () => {
      await counter1.increment(5);

      const counts = counter1.getActorCounts();
      expect(counts.get(signer1.getDID())).toBe(5);
    });

    it('should return 0 for unknown actor', () => {
      expect(counter1.getActorCount('unknown-did')).toBe(0);
    });
  });

  describe('merge operation', () => {
    it('should merge counters by taking max per actor', async () => {
      await counter1.increment(5);
      await counter2.increment(3);

      counter1.merge(counter2);

      expect(counter1.value()).toBe(8); // 5 + 3
      expect(counter1.getActorCount(signer1.getDID())).toBe(5);
      expect(counter1.getActorCount(signer2.getDID())).toBe(3);
    });

    it('should handle merging with same actor', async () => {
      await counter1.increment(5);

      const counter1b = new GCounter('test-counter', signer1);
      await counter1b.increment(7); // Higher count for same actor

      counter1.merge(counter1b);

      expect(counter1.value()).toBe(7); // Takes max
    });
  });

  describe('distributed synchronization', () => {
    it('should converge when applying remote increments', async () => {
      // Agent 1 increments
      const op1 = await counter1.increment(5);

      // Agent 2 applies remote increment
      const data1 = op1.operation.data as { amount: number; newCount: number };
      counter2.applyRemoteIncrement(
        op1.operation.actorDid,
        data1.newCount,
        op1.operation.id,
        op1.operation.timestamp
      );

      expect(counter1.value()).toBe(5);
      expect(counter2.value()).toBe(5);
    });

    it('should handle concurrent increments from different actors', async () => {
      // Both agents increment concurrently
      const op1 = await counter1.increment(3);
      const op2 = await counter2.increment(5);

      // Exchange operations
      const data1 = op1.operation.data as { amount: number; newCount: number };
      const data2 = op2.operation.data as { amount: number; newCount: number };

      counter2.applyRemoteIncrement(
        op1.operation.actorDid,
        data1.newCount,
        op1.operation.id,
        op1.operation.timestamp
      );

      counter1.applyRemoteIncrement(
        op2.operation.actorDid,
        data2.newCount,
        op2.operation.id,
        op2.operation.timestamp
      );

      // Both should converge to sum
      expect(counter1.value()).toBe(8);
      expect(counter2.value()).toBe(8);
    });

    it('should be idempotent (applying same operation twice)', async () => {
      const op = await counter1.increment(5);

      const data = op.operation.data as { amount: number; newCount: number };
      counter2.applyRemoteIncrement(
        op.operation.actorDid,
        data.newCount,
        op.operation.id,
        op.operation.timestamp
      );

      counter2.applyRemoteIncrement(
        op.operation.actorDid,
        data.newCount,
        op.operation.id,
        op.operation.timestamp
      );

      expect(counter2.value()).toBe(5); // Not 10
    });

    it('should handle out-of-order delivery', async () => {
      await counter1.increment(1); // count = 1
      const op2 = await counter1.increment(1); // count = 2
      const op3 = await counter1.increment(1); // count = 3

      // Apply in reverse order
      const data3 = op3.operation.data as { amount: number; newCount: number };
      const data2 = op2.operation.data as { amount: number; newCount: number };

      counter2.applyRemoteIncrement(
        op3.operation.actorDid,
        data3.newCount,
        op3.operation.id,
        op3.operation.timestamp
      );

      counter2.applyRemoteIncrement(
        op2.operation.actorDid,
        data2.newCount,
        op2.operation.id,
        op2.operation.timestamp
      );

      expect(counter2.value()).toBe(3); // Takes max
    });
  });

  describe('vector clock', () => {
    it('should provide vector clock for debugging', async () => {
      await counter1.increment(5);

      const vc = counter1.getVectorClock();
      expect(vc[signer1.getDID()]).toBe(5);
    });

    it('should track multiple actors in vector clock', async () => {
      const op2 = await counter2.increment(3);

      const data2 = op2.operation.data as { amount: number; newCount: number };
      counter1.applyRemoteIncrement(
        op2.operation.actorDid,
        data2.newCount,
        op2.operation.id,
        op2.operation.timestamp
      );

      await counter1.increment(5);

      const vc = counter1.getVectorClock();
      expect(vc[signer1.getDID()]).toBe(5);
      expect(vc[signer2.getDID()]).toBe(3);
    });
  });

  describe('serialization', () => {
    it('should serialize and deserialize state', async () => {
      await counter1.increment(5);

      const serialized = counter1.serialize();
      const deserialized = GCounter.deserialize('test-counter', signer1, serialized);

      expect(deserialized.value()).toBe(5);
      expect(deserialized.getActorCount(signer1.getDID())).toBe(5);
    });

    it('should handle empty counter serialization', () => {
      const serialized = counter1.serialize();
      const deserialized = GCounter.deserialize('test-counter', signer1, serialized);

      expect(deserialized.value()).toBe(0);
    });

    it('should preserve multi-actor state', async () => {
      await counter1.increment(5);

      const op2 = await counter2.increment(3);
      const data2 = op2.operation.data as { amount: number; newCount: number };
      counter1.applyRemoteIncrement(
        op2.operation.actorDid,
        data2.newCount,
        op2.operation.id,
        op2.operation.timestamp
      );

      const serialized = counter1.serialize();
      const deserialized = GCounter.deserialize('test-counter', signer1, serialized);

      expect(deserialized.value()).toBe(8);
      expect(deserialized.getActorCount(signer1.getDID())).toBe(5);
      expect(deserialized.getActorCount(signer2.getDID())).toBe(3);
    });
  });

  describe('commutativity', () => {
    it('should produce same result regardless of operation order', async () => {
      const ops: Array<{ actorDid: string; count: number; id: string; timestamp: number }> = [];

      // Create operations
      for (let i = 0; i < 5; i++) {
        const signer = createTestSigner(`agent-${i}`);
        const counter = new GCounter('test', signer);
        const op = await counter.increment(i + 1);
        const data = op.operation.data as { amount: number; newCount: number };

        ops.push({
          actorDid: op.operation.actorDid,
          count: data.newCount,
          id: op.operation.id,
          timestamp: op.operation.timestamp,
        });
      }

      // Apply in order
      const counter_ordered = new GCounter('test', signer1);
      for (const op of ops) {
        counter_ordered.applyRemoteIncrement(op.actorDid, op.count, op.id, op.timestamp);
      }

      // Apply in reverse order
      const counter_reversed = new GCounter('test', signer1);
      for (const op of ops.reverse()) {
        counter_reversed.applyRemoteIncrement(op.actorDid, op.count, op.id, op.timestamp);
      }

      expect(counter_ordered.value()).toBe(counter_reversed.value());
    });
  });
});
