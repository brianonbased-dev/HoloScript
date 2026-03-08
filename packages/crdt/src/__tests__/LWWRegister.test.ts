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
});
