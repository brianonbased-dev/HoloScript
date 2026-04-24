/**
 * Tests for identity/custody-registry.ts (task_1776990890662_dny4).
 *
 * Spec: research/2026-04-23_tier2-self-custody-export-escape-hatch-v3.md
 *   §"Non-negotiable invariants" #1 + #3
 *   §"Acceptance tests" #5 (forced DB failure rolls BOTH back) + #6 (post-
 *      migration custodial signing rejected)
 *   §"Required audit events"
 *
 * These tests are unit-level — atomicity is exercised via the
 * `_setFailAfterStageForTests` failure-injection hook. _r0pp owns
 * cross-layer failure injection on the real /finalize endpoint.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  retireCustodialSigner,
  isSelfCustodyActive,
  getSelfCustodyWallet,
  isCustodialRetired,
  requireCustodial,
  onAuditEvent,
  withTransaction,
  RETIRED_ID_SHAPE,
  _resetCustodyRegistryForTests,
  _getEmittedEventsForTests,
  _setFailAfterStageForTests,
  _getUserCustodyModeForTests,
  _setUserCustodyModeForTests,
  type CustodyAuditEvent,
} from '../custody-registry';

const USER = 'agent_test_dny4';
const WALLET = '0xSelfCustodyWallet_dny4';

beforeEach(() => {
  _resetCustodyRegistryForTests();
});

// ── Happy path (spec §"Required audit events") ──────────────────────────────

describe('retireCustodialSigner — happy path', () => {
  it('updates all three stores and emits both audit events', () => {
    const result = retireCustodialSigner(USER, WALLET);

    // Returned shape matches the _ards route contract.
    expect(result.retiredCustodialSignerId).toMatch(RETIRED_ID_SHAPE);
    expect(result.effectiveAt).toBeTruthy();
    // And the id encodes the user + timestamp as documented.
    expect(result.retiredCustodialSignerId).toContain(USER);

    // All three stores committed.
    expect(isSelfCustodyActive(USER)).toBe(true);
    expect(getSelfCustodyWallet(USER)).toBe(WALLET);
    expect(isCustodialRetired(USER)).toBe(true);
    expect(_getUserCustodyModeForTests(USER)).toBe('self_custody_active');

    // Both required audit events emitted.
    const events = _getEmittedEventsForTests();
    expect(events.map((e) => e.type)).toEqual([
      'self_custody_migration_finalized',
      'custodial_signer_retired',
    ]);

    // Event payload shape.
    expect(events[0].userId).toBe(USER);
    expect(events[0].metadata.newWalletAddress).toBe(WALLET);
    expect(events[0].metadata.retiredCustodialSignerId).toBe(
      result.retiredCustodialSignerId
    );
    expect(events[1].userId).toBe(USER);
    expect(events[1].metadata.retiredCustodialSignerId).toBe(
      result.retiredCustodialSignerId
    );
  });

  it('delivers audit events to subscribers', () => {
    const received: CustodyAuditEvent[] = [];
    onAuditEvent((e) => received.push(e));

    retireCustodialSigner(USER, WALLET);

    expect(received.map((e) => e.type)).toEqual([
      'self_custody_migration_finalized',
      'custodial_signer_retired',
    ]);
  });
});

// ── Atomicity (spec acceptance test #5) ─────────────────────────────────────

describe('retireCustodialSigner — atomicity (acceptance test #5)', () => {
  it.each(['stage_mode', 'stage_pubkey', 'stage_audit', 'pre_commit'] as const)(
    'failure injected at %s rolls back all three stores and emits zero events',
    (stage) => {
      _setFailAfterStageForTests(stage);

      expect(() => retireCustodialSigner(USER, WALLET)).toThrow(
        /injected failure at/
      );

      // All three stores MUST be unchanged.
      expect(isSelfCustodyActive(USER)).toBe(false);
      expect(getSelfCustodyWallet(USER)).toBeNull();
      expect(isCustodialRetired(USER)).toBe(false);
      expect(_getUserCustodyModeForTests(USER)).toBeUndefined();

      // Zero events emitted — staging builds a pending set, commit never runs.
      expect(_getEmittedEventsForTests()).toEqual([]);
    }
  );

  it('subscriber errors do not roll back committed state (documented behavior)', () => {
    // In-memory atomicity is for staging → commit. Once commit runs, state is
    // applied. If a downstream subscriber throws, the user is retired (that is
    // the authoritative state); only downstream flush is affected. Verifies
    // the trade-off documented in the module header.
    onAuditEvent(() => {
      throw new Error('subscriber sink down');
    });

    // Does not throw — subscriber errors are caught and logged.
    const result = retireCustodialSigner(USER, WALLET);
    expect(result.retiredCustodialSignerId).toMatch(RETIRED_ID_SHAPE);

    // Commit went through.
    expect(isSelfCustodyActive(USER)).toBe(true);
    expect(_getEmittedEventsForTests()).toHaveLength(2);
  });
});

// ── Invariant #1 — one active signer (spec acceptance test #6) ─────────────

describe('requireCustodial — Invariant #1 guard', () => {
  it('returns ok:true when user is still custodial (default state)', () => {
    const r = requireCustodial(USER);
    expect(r).toEqual({ ok: true });
  });

  it('returns migration-rejection after retirement (acceptance test #6)', () => {
    retireCustodialSigner(USER, WALLET);

    const r = requireCustodial(USER);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('user_migrated_to_self_custody');
      expect(r.message).toMatch(/migrated to self-custody/i);
    }
  });
});

// ── Idempotency (replay-safe) ──────────────────────────────────────────────

describe('retireCustodialSigner — replay / idempotency', () => {
  it('second call for same user is a no-op and returns the SAME record', () => {
    const first = retireCustodialSigner(USER, WALLET);
    const eventsAfterFirst = _getEmittedEventsForTests().length;

    const second = retireCustodialSigner(USER, '0xDifferentWallet');

    // Same retired-id, same effective_at — replay-safe.
    expect(second.retiredCustodialSignerId).toBe(first.retiredCustodialSignerId);
    expect(second.effectiveAt).toBe(first.effectiveAt);

    // No second retirement — no second pair of audit events emitted.
    expect(_getEmittedEventsForTests().length).toBe(eventsAfterFirst);
    // And the originally-bound wallet stays bound (we do NOT overwrite on
    // replay — the first retirement is the canonical one).
    expect(getSelfCustodyWallet(USER)).toBe(WALLET);
  });
});

// ── Audit-event ordering ───────────────────────────────────────────────────

describe('retireCustodialSigner — audit event ordering', () => {
  it('emits self_custody_migration_finalized BEFORE custodial_signer_retired', () => {
    retireCustodialSigner(USER, WALLET);

    const events = _getEmittedEventsForTests();
    expect(events).toHaveLength(2);
    // Documented ordering: new-state-available-first, old-state-revoked-second.
    expect(events[0].type).toBe('self_custody_migration_finalized');
    expect(events[1].type).toBe('custodial_signer_retired');
    // Timestamps are from the same commit instant.
    expect(events[0].timestamp).toBe(events[1].timestamp);
  });
});

// ── Input validation ──────────────────────────────────────────────────────

describe('retireCustodialSigner — input validation', () => {
  it('throws on empty userId', () => {
    expect(() => retireCustodialSigner('', WALLET)).toThrow(/userId required/);
  });

  it('throws on empty newWalletAddress', () => {
    expect(() => retireCustodialSigner(USER, '')).toThrow(
      /newWalletAddress required/
    );
  });
});

// ── withTransaction is a pass-through wrapper today ────────────────────────

describe('withTransaction — composition seam', () => {
  it('calls the commit closure and returns its value', () => {
    const r = withTransaction(() => 42);
    expect(r).toBe(42);
  });

  it('propagates commit throws', () => {
    expect(() =>
      withTransaction(() => {
        throw new Error('commit boom');
      })
    ).toThrow(/commit boom/);
  });
});

// ── Test helpers for _ards back-compat ────────────────────────────────────

describe('_ards back-compat helpers', () => {
  it('_setUserCustodyModeForTests forces the mode without going through retire', () => {
    _setUserCustodyModeForTests(USER, 'self_custody_active');
    expect(isSelfCustodyActive(USER)).toBe(true);
    // No audit record though — this is a test-only shortcut.
    expect(isCustodialRetired(USER)).toBe(false);
  });

  it('_resetCustodyRegistryForTests clears every store and the failure hook', () => {
    retireCustodialSigner(USER, WALLET);
    _setFailAfterStageForTests('stage_mode');

    _resetCustodyRegistryForTests();

    expect(isSelfCustodyActive(USER)).toBe(false);
    expect(_getEmittedEventsForTests()).toEqual([]);
    // Hook cleared — new retire succeeds.
    expect(() => retireCustodialSigner(USER, WALLET)).not.toThrow();
  });
});
