/**
 * Tests for agent defense state store helpers in state.ts.
 *
 * Closes gap-build task_1777090894117_8bav (defense-state PATCH endpoint).
 * Spec: ai-ecosystem/research/2026-04-25_fleet-adversarial-harness-paper-21.md §3.
 *
 * The route-layer integration tests are deferred to Phase 1 hardening
 * (task_1777093147560_pawd). Here we verify the pure state helpers
 * which carry the load-bearing semantics: set + get + expiry + state validation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  setAgentDefense,
  getAgentDefense,
  isValidDefenseState,
  VALID_DEFENSE_STATES,
  agentDefenseStore,
} from '../state';

const HANDLE = 'mesh-worker-test';
const CALLER = 'agent_caller_test';

describe('Agent defense state store helpers (gap-build task_..._8bav)', () => {
  beforeEach(() => {
    agentDefenseStore.clear();
  });

  describe('setAgentDefense + getAgentDefense', () => {
    it('round-trips a defense state with no expiry', () => {
      const config = setAgentDefense(HANDLE, 'decay-on-anomaly', null, CALLER);
      expect(config.state).toBe('decay-on-anomaly');
      expect(config.expiresAt).toBeNull();
      expect(config.setBy).toBe(CALLER);
      expect(config.setAt).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO

      const retrieved = getAgentDefense(HANDLE);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.state).toBe('decay-on-anomaly');
    });

    it('round-trips with future expiry intact', () => {
      const future = new Date(Date.now() + 60_000).toISOString();
      setAgentDefense(HANDLE, 'all-three', future, CALLER);
      const retrieved = getAgentDefense(HANDLE);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.expiresAt).toBe(future);
    });

    it('returns null after expiry', () => {
      const past = new Date(Date.now() - 60_000).toISOString();
      setAgentDefense(HANDLE, 'replay-audit', past, CALLER);
      const retrieved = getAgentDefense(HANDLE);
      expect(retrieved).toBeNull();
    });

    it('overwrites previous state on second set', () => {
      setAgentDefense(HANDLE, 'none', null, CALLER);
      setAgentDefense(HANDLE, 'canary-probing', null, CALLER);
      const retrieved = getAgentDefense(HANDLE);
      expect(retrieved!.state).toBe('canary-probing');
    });

    it('isolates state per handle', () => {
      setAgentDefense('handle-a', 'decay-on-anomaly', null, CALLER);
      setAgentDefense('handle-b', 'replay-audit', null, CALLER);
      expect(getAgentDefense('handle-a')!.state).toBe('decay-on-anomaly');
      expect(getAgentDefense('handle-b')!.state).toBe('replay-audit');
    });

    it('returns null for unknown handle', () => {
      expect(getAgentDefense('does-not-exist')).toBeNull();
    });

    it('records caller agentId in setBy', () => {
      setAgentDefense(HANDLE, 'cross-vouching-detector', null, 'agent_xyz');
      expect(getAgentDefense(HANDLE)!.setBy).toBe('agent_xyz');
    });
  });

  describe('isValidDefenseState', () => {
    it('accepts all six valid states (matches Paper 21 §3)', () => {
      expect(isValidDefenseState('none')).toBe(true);
      expect(isValidDefenseState('decay-on-anomaly')).toBe(true);
      expect(isValidDefenseState('cross-vouching-detector')).toBe(true);
      expect(isValidDefenseState('replay-audit')).toBe(true);
      expect(isValidDefenseState('canary-probing')).toBe(true);
      expect(isValidDefenseState('all-three')).toBe(true);
    });

    it('rejects unknown strings', () => {
      expect(isValidDefenseState('all-five')).toBe(false);
      expect(isValidDefenseState('decay')).toBe(false);
      expect(isValidDefenseState('ALL-THREE')).toBe(false); // case-sensitive
    });

    it('rejects non-string values', () => {
      expect(isValidDefenseState(null)).toBe(false);
      expect(isValidDefenseState(undefined)).toBe(false);
      expect(isValidDefenseState(0)).toBe(false);
      expect(isValidDefenseState({})).toBe(false);
      expect(isValidDefenseState([])).toBe(false);
    });
  });

  describe('VALID_DEFENSE_STATES', () => {
    it('contains exactly the 6 Paper 21 §3 defense states', () => {
      expect(VALID_DEFENSE_STATES).toHaveLength(6);
      expect(new Set(VALID_DEFENSE_STATES)).toEqual(
        new Set([
          'none',
          'decay-on-anomaly',
          'cross-vouching-detector',
          'replay-audit',
          'canary-probing',
          'all-three',
        ])
      );
    });
  });
});
