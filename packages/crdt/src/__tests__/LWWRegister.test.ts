/**
 * Tests for LWW-Register CRDT
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LWWRegister } from '../types/LWWRegister';
import { createTestSigner, type DIDSigner } from '../auth/DIDSigner';

describe('LWWRegister', () => {
  let signer1: DIDSigner;
  let signer2: DIDSigner;
  let register1: LWWRegister<string>;
  let register2: LWWRegister<string>;

  beforeEach(() => {
    signer1 = createTestSigner('agent-1');
    signer2 = createTestSigner('agent-2');
    register1 = new LWWRegister('test-register', signer1);
    register2 = new LWWRegister('test-register', signer2);
  });

  describe('initialization', () => {
    it('should start with null value', () => {
      expect(register1.get()).toBeNull();
    });

    it('should accept initial value', () => {
      const reg = new LWWRegister('test', signer1, 'initial');
      expect(reg.get()).toBe('initial');
    });

    it('should return CRDT ID', () => {
      expect(register1.getCRDTId()).toBe('test-register');
    });
  });

  describe('set operation', () => {
    it('should set value and return signed operation', async () => {
      const signedOp = await register1.set('hello');

      expect(register1.get()).toBe('hello');
      expect(signedOp.operation.type).toBe('lww_set');
      expect(signedOp.operation.data).toBe('hello');
      expect(signedOp.jwt).toBeDefined();
    });

    it('should update value on subsequent set', async () => {
      await register1.set('first');
      await register1.set('second');

      expect(register1.get()).toBe('second');
    });

    it('should include metadata in getWithMetadata', async () => {
      await register1.set('test');
      const metadata = register1.getWithMetadata();

      expect(metadata).toBeDefined();
      expect(metadata?.value).toBe('test');
      expect(metadata?.actorDid).toBe(signer1.getDID());
      expect(metadata?.timestamp).toBeGreaterThan(0);
      expect(metadata?.operationId).toBeDefined();
    });
  });

  describe('conflict resolution (LWW)', () => {
    it('should accept newer timestamp', async () => {
      // Set value with old timestamp
      await register1.set('old');
      const oldMeta = register1.getWithMetadata()!;

      // Simulate remote operation with newer timestamp
      const futureTimestamp = Date.now() + 10000;
      register1.applyRemoteOperation('remote-op', 'new', futureTimestamp, signer2.getDID());

      expect(register1.get()).toBe('new');
    });

    it('should reject older timestamp', async () => {
      // Set value with recent timestamp
      await register1.set('new');

      // Simulate remote operation with older timestamp
      const pastTimestamp = Date.now() - 10000;
      const applied = register1.applyRemoteOperation(
        'remote-op',
        'old',
        pastTimestamp,
        signer2.getDID()
      );

      expect(applied).toBe(false);
      expect(register1.get()).toBe('new');
    });

    it('should use actor DID as tiebreaker for same timestamp', async () => {
      const timestamp = Date.now();
      const didA = 'did:test:aaa';
      const didB = 'did:test:bbb';

      register1.applyRemoteOperation('op1', 'from-a', timestamp, didA);
      register1.applyRemoteOperation('op2', 'from-b', timestamp, didB);

      // 'bbb' > 'aaa' lexicographically
      expect(register1.get()).toBe('from-b');
    });
  });

  describe('distributed synchronization', () => {
    it('should converge when operations applied in order', async () => {
      // Agent 1 sets value
      const op1 = await register1.set('value1');

      // Agent 2 applies operation
      register2.applyRemoteOperation(
        op1.operation.id,
        op1.operation.data as string,
        op1.operation.timestamp,
        op1.operation.actorDid
      );

      expect(register1.get()).toBe('value1');
      expect(register2.get()).toBe('value1');
    });

    it('should converge when operations applied in reverse order', async () => {
      // Both agents set values
      const op1 = await register1.set('value1');
      await new Promise((resolve) => setTimeout(resolve, 10)); // Ensure timestamp difference
      const op2 = await register2.set('value2');

      // Apply in reverse order
      register1.applyRemoteOperation(
        op2.operation.id,
        op2.operation.data as string,
        op2.operation.timestamp,
        op2.operation.actorDid
      );

      register2.applyRemoteOperation(
        op1.operation.id,
        op1.operation.data as string,
        op1.operation.timestamp,
        op1.operation.actorDid
      );

      // Both should converge to later timestamp (value2)
      expect(register1.get()).toBe('value2');
      expect(register2.get()).toBe('value2');
    });

    it('should handle concurrent operations with deterministic outcome', async () => {
      // Simulate concurrent operations at same logical time
      const timestamp = Date.now();

      register1.applyRemoteOperation('op1', 'concurrent1', timestamp, 'did:test:agent-1');
      register1.applyRemoteOperation('op2', 'concurrent2', timestamp, 'did:test:agent-2');

      register2.applyRemoteOperation('op2', 'concurrent2', timestamp, 'did:test:agent-2');
      register2.applyRemoteOperation('op1', 'concurrent1', timestamp, 'did:test:agent-1');

      // Both should converge to same value (deterministic tiebreaker)
      expect(register1.get()).toBe(register2.get());
    });
  });

  describe('serialization', () => {
    it('should serialize and deserialize state', async () => {
      await register1.set('test value');

      const serialized = register1.serialize();
      const deserialized = LWWRegister.deserialize<string>('test-register', signer1, serialized);

      expect(deserialized.get()).toBe('test value');
      expect(deserialized.getWithMetadata()).toEqual(register1.getWithMetadata());
    });

    it('should handle empty state serialization', () => {
      const serialized = register1.serialize();
      const deserialized = LWWRegister.deserialize<string>('test-register', signer1, serialized);

      expect(deserialized.get()).toBeNull();
    });
  });

  describe('type safety', () => {
    it('should support complex types', async () => {
      interface DialogueState {
        line: string;
        emotion: string;
        count: number;
      }

      const dialogueReg = new LWWRegister<DialogueState>('dialogue', signer1);

      await dialogueReg.set({
        line: 'Hello, traveler!',
        emotion: 'happy',
        count: 1,
      });

      const state = dialogueReg.get();
      expect(state?.line).toBe('Hello, traveler!');
      expect(state?.emotion).toBe('happy');
      expect(state?.count).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // Paper-3 tiebreaker hardening
  // Guards assumptions around globally unique agentId/source and verifies
  // that "both-valid" concurrent conflict scenarios converge deterministically.
  // See Paper-3 §4.3 (provenance semiring dispute resolution).
  // -----------------------------------------------------------------------
  describe('tiebreaker hardening (Paper-3)', () => {
    describe('agentId uniqueness guard', () => {
      it('createTestSigner produces distinct DIDs for the same name called twice', () => {
        const s1 = createTestSigner('npc-ai');
        const s2 = createTestSigner('npc-ai');
        // Private key is random on each call → DIDs must differ
        expect(s1.getDID()).not.toBe(s2.getDID());
      });

      it('same actorDid same timestamp — deterministic via operationId tiebreaker', () => {
        const sharedDid = 'did:test:shared-agent';
        const timestamp = 1_000_000;

        // Two operations from the same agent at the same millisecond
        const appliedFirst = register1.applyRemoteOperation('op-alpha', 'burst-a', timestamp, sharedDid);
        const appliedSecond = register1.applyRemoteOperation('op-zeta', 'burst-z', timestamp, sharedDid);

        // Second op has higher operationId ('op-zeta' > 'op-alpha') → should win
        expect(appliedFirst).toBe(true);
        expect(appliedSecond).toBe(true);
        expect(register1.get()).toBe('burst-z');
      });

      it('same actorDid same timestamp same operationId — idempotent (no change)', () => {
        const did = 'did:test:idempotent';
        const timestamp = 1_000_000;

        register1.applyRemoteOperation('op-same', 'value-1', timestamp, did);
        const reapplied = register1.applyRemoteOperation('op-same', 'value-1', timestamp, did);

        // Exact duplicate must be a no-op
        expect(reapplied).toBe(false);
        expect(register1.get()).toBe('value-1');
      });
    });

    describe('both-valid concurrent scenarios', () => {
      it('two valid concurrent writes converge to same value on all replicas (order: 1→2)', () => {
        const timestamp = Date.now();
        const didA = 'did:test:agent-alpha';
        const didB = 'did:test:agent-beta';

        // Replica 1: receives A then B
        register1.applyRemoteOperation('op-a', 'value-a', timestamp, didA);
        register1.applyRemoteOperation('op-b', 'value-b', timestamp, didB);

        // Replica 2: receives B then A
        register2.applyRemoteOperation('op-b', 'value-b', timestamp, didB);
        register2.applyRemoteOperation('op-a', 'value-a', timestamp, didA);

        // Both replicas must converge to the same value
        expect(register1.get()).toBe(register2.get());
        // 'did:test:agent-beta' > 'did:test:agent-alpha' lexicographically → beta wins
        expect(register1.get()).toBe('value-b');
      });

      it('both-valid: three concurrent agents converge regardless of application order', () => {
        const timestamp = Date.now();
        const ops = [
          { id: 'op-1', value: 'alpha', did: 'did:test:aaa' },
          { id: 'op-2', value: 'beta',  did: 'did:test:bbb' },
          { id: 'op-3', value: 'gamma', did: 'did:test:ccc' },
        ] as const;

        // Six possible orderings — spot-check three
        const permutations: Array<[number, number, number]> = [
          [0, 1, 2],
          [2, 1, 0],
          [1, 2, 0],
        ];

        const results: (string | null)[] = [];
        for (const perm of permutations) {
          const reg = new LWWRegister<string>('perm-test', signer1);
          for (const i of perm) {
            reg.applyRemoteOperation(ops[i].id, ops[i].value, timestamp, ops[i].did);
          }
          results.push(reg.get());
        }

        // All permutations must produce the same winner
        expect(new Set(results).size).toBe(1);
        // 'did:test:ccc' is lexicographically largest → gamma wins
        expect(results[0]).toBe('gamma');
      });

      it('both-valid: commutativity holds when one op is newer', async () => {
        // Agent 1 writes at t=100, Agent 2 writes at t=200 (both valid)
        const reg1 = new LWWRegister<string>('commute-test', signer1);
        const reg2 = new LWWRegister<string>('commute-test', signer2);

        // Replica 1: older-first, then newer
        reg1.applyRemoteOperation('old-op', 'old-value', 100, 'did:test:writer-1');
        reg1.applyRemoteOperation('new-op', 'new-value', 200, 'did:test:writer-2');

        // Replica 2: newer-first, then older
        reg2.applyRemoteOperation('new-op', 'new-value', 200, 'did:test:writer-2');
        reg2.applyRemoteOperation('old-op', 'old-value', 100, 'did:test:writer-1');

        expect(reg1.get()).toBe('new-value');
        expect(reg2.get()).toBe('new-value');
      });

      it('both-valid: tiebreaker is total order (no draw possible)', () => {
        // With only two DIDs and one timestamp, there must be a single winner
        const timestamp = Date.now();
        const reg = new LWWRegister<number>('total-order', signer1);

        reg.applyRemoteOperation('op-x', 1, timestamp, 'did:test:x');
        reg.applyRemoteOperation('op-y', 2, timestamp, 'did:test:y');

        // Must have chosen exactly one value — no null, no undefined
        const winner = reg.get();
        expect(winner === 1 || winner === 2).toBe(true);
        // Deterministic: 'did:test:y' > 'did:test:x'
        expect(winner).toBe(2);
      });
    });
  });
});
