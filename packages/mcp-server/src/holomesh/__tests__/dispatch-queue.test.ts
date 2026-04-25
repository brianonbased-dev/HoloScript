/**
 * Tests for the adversarial dispatch queue helpers in state.ts.
 *
 * Closes the trigger-mechanism gap from task_..._pawd. The route-layer
 * tests are deferred to Phase 2 hardening; here we verify the pure state
 * helpers carry the load-bearing semantics: enqueue, drain (consume),
 * peek (non-draining), ring-buffer drop, attack-class validation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  enqueueDispatch,
  consumeDispatches,
  peekDispatches,
  isValidAttackClass,
  VALID_ATTACK_CLASSES,
  agentDispatchQueue,
  type DispatchEntry,
} from '../state';

const HANDLE = 'mesh-worker-test';

function makeEntry(overrides: Partial<DispatchEntry> = {}): DispatchEntry {
  return {
    cell_id: 'phase-0-test-cell',
    attack_class: 'whitewasher',
    target_handle: 'mesh-worker-target',
    duration_ms: 30_000,
    trial: 0,
    defense_state: 'none',
    dispatched_at: '2026-04-25T05:00:00.000Z',
    dispatched_by: 'agent_caller',
    ...overrides,
  };
}

describe('Dispatch queue helpers (gap-build pawd)', () => {
  beforeEach(() => {
    agentDispatchQueue.clear();
  });

  describe('enqueueDispatch + consumeDispatches', () => {
    it('round-trips a single entry', () => {
      enqueueDispatch(HANDLE, makeEntry());
      const drained = consumeDispatches(HANDLE);
      expect(drained).toHaveLength(1);
      expect(drained[0].cell_id).toBe('phase-0-test-cell');
      expect(drained[0].consumed_at).toBeDefined(); // server stamps on drain
    });

    it('drains multiple entries in FIFO order', () => {
      enqueueDispatch(HANDLE, makeEntry({ cell_id: 'cell-1' }));
      enqueueDispatch(HANDLE, makeEntry({ cell_id: 'cell-2' }));
      enqueueDispatch(HANDLE, makeEntry({ cell_id: 'cell-3' }));
      const drained = consumeDispatches(HANDLE);
      expect(drained).toHaveLength(3);
      expect(drained.map((e) => e.cell_id)).toEqual(['cell-1', 'cell-2', 'cell-3']);
    });

    it('subsequent consume returns empty (one-shot delivery)', () => {
      enqueueDispatch(HANDLE, makeEntry());
      consumeDispatches(HANDLE);
      const second = consumeDispatches(HANDLE);
      expect(second).toEqual([]);
    });

    it('isolates queues per handle', () => {
      enqueueDispatch('handle-a', makeEntry({ cell_id: 'cell-a' }));
      enqueueDispatch('handle-b', makeEntry({ cell_id: 'cell-b' }));
      expect(consumeDispatches('handle-a').map((e) => e.cell_id)).toEqual(['cell-a']);
      expect(consumeDispatches('handle-b').map((e) => e.cell_id)).toEqual(['cell-b']);
    });

    it('caps the per-handle queue at 1,000 entries (drops oldest)', () => {
      for (let i = 0; i < 1_005; i++) {
        enqueueDispatch(HANDLE, makeEntry({ cell_id: `cell-${i}` }));
      }
      const drained = consumeDispatches(HANDLE);
      expect(drained).toHaveLength(1_000);
      // First 5 dropped — oldest survivor is cell-5
      expect(drained[0].cell_id).toBe('cell-5');
      expect(drained[drained.length - 1].cell_id).toBe('cell-1004');
    });

    it('empty consume on unknown handle returns []', () => {
      expect(consumeDispatches('does-not-exist')).toEqual([]);
    });
  });

  describe('peekDispatches', () => {
    it('returns pending without draining', () => {
      enqueueDispatch(HANDLE, makeEntry({ cell_id: 'cell-1' }));
      enqueueDispatch(HANDLE, makeEntry({ cell_id: 'cell-2' }));
      const peeked = peekDispatches(HANDLE);
      expect(peeked).toHaveLength(2);
      // Subsequent consume still returns the same entries (peek didn't drain)
      const drained = consumeDispatches(HANDLE);
      expect(drained).toHaveLength(2);
    });

    it('returns a copy (mutating result does not affect queue)', () => {
      enqueueDispatch(HANDLE, makeEntry());
      const peeked = peekDispatches(HANDLE);
      peeked.push(makeEntry({ cell_id: 'mutated' }));
      // Original queue still has just 1 entry
      expect(peekDispatches(HANDLE)).toHaveLength(1);
    });
  });

  describe('isValidAttackClass', () => {
    it('accepts all 5 valid classes (Paper 21 §3)', () => {
      expect(isValidAttackClass('whitewasher')).toBe(true);
      expect(isValidAttackClass('sybil-cross-vouch')).toBe(true);
      expect(isValidAttackClass('slow-poisoner')).toBe(true);
      expect(isValidAttackClass('reputation-squatter')).toBe(true);
      expect(isValidAttackClass('cross-brain-hijack')).toBe(true);
    });

    it('rejects unknown strings', () => {
      expect(isValidAttackClass('whitewashed')).toBe(false);
      expect(isValidAttackClass('SYBIL-CROSS-VOUCH')).toBe(false); // case-sensitive
      expect(isValidAttackClass('')).toBe(false);
    });

    it('rejects non-string values', () => {
      expect(isValidAttackClass(null)).toBe(false);
      expect(isValidAttackClass(undefined)).toBe(false);
      expect(isValidAttackClass(0)).toBe(false);
      expect(isValidAttackClass({})).toBe(false);
    });
  });

  describe('VALID_ATTACK_CLASSES', () => {
    it('contains exactly the 5 Paper 21 §3 attack classes', () => {
      expect(VALID_ATTACK_CLASSES).toHaveLength(5);
      expect(new Set(VALID_ATTACK_CLASSES)).toEqual(
        new Set([
          'whitewasher',
          'sybil-cross-vouch',
          'slow-poisoner',
          'reputation-squatter',
          'cross-brain-hijack',
        ])
      );
    });
  });
});
