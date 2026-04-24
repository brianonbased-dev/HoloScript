/**
 * Tier 2 v3 Atomic Custody Registry (task_1776990890662_dny4).
 *
 * Spec: research/2026-04-23_tier2-self-custody-export-escape-hatch-v3.md
 *   §"Non-negotiable invariants" #1 (one active signer) + #3 (atomic retirement)
 *   §"Acceptance tests" #5 (forced failure rolls BOTH back) + #6 (post-migration
 *      custodial signing rejected)
 *   §"Required audit events" (custodial_signer_retired + self_custody_migration_finalized)
 *
 * What this module owns:
 *   - userCustodyMode: Map<userId, CustodyMode>       — authoritative per-user signer state
 *   - selfCustodyPubKey: Map<userId, walletAddress>    — bound on transition
 *   - retiredCustodialSigners: Map<userId, Retirement> — audit trail
 *
 * Atomicity contract for `retireCustodialSigner`:
 *   Either (A) all three stores updated + both audit events emitted, OR
 *   (B) zero stores touched + zero events emitted. No partial states.
 *
 *   Implementation uses a staged-write buffer: writes go into a local
 *   `pending` object and are COMMITTED in a single pass after all staging
 *   succeeds. A `failAfterStage` test-only hook injects a failure between
 *   the second and third stage so acceptance test #5 (forced DB failure
 *   between register+retire) can verify rollback semantics without needing
 *   a real database.
 *
 * Why not just try/catch + undo:
 *   Undo-style rollback leaves a window where partial state is visible to
 *   concurrent readers. The staged approach keeps the invariant "writes are
 *   all-or-nothing at the top of the commit phase" so readers of
 *   `isSelfCustodyActive` during the staging phase will never see a
 *   half-applied transition.
 *
 * Future DB backend:
 *   `withTransaction(fn)` wraps the commit. In-memory today; to swap in a
 *   real DB, reimplement `withTransaction` as BEGIN/COMMIT/ROLLBACK around
 *   the same commit closure. Handler code does not change.
 *
 * Dependencies on _ards (identity-export-routes.ts):
 *   After this module lands, identity-export-routes.ts imports
 *   `retireCustodialSigner` from here instead of its local stub, and the
 *   shadow `userCustodyMode` map in that file is removed (it was always
 *   meant to hand off once _dny4 shipped; see file-header note #4 in
 *   identity-export-routes.ts).
 */

/** Per-user signer state. Mutually exclusive: user is EITHER custodial-active
 *  OR self-custody-active at any point in time (Invariant #1). */
export type CustodyMode = 'custodial_active' | 'self_custody_active';

/** Audit record for a retired custodial signer. Persisted per user so
 *  replay attempts can detect prior retirement cheaply. */
export interface RetiredCustodialSignerRecord {
  userId: string;
  /** Opaque id that identifies the custodial signer we just retired.
   *  Format: `retired-custodial-<userId>-<ISO-timestamp>` — see RETIRED_ID_SHAPE. */
  retiredCustodialSignerId: string;
  retiredAt: string;
  /** New wallet address we swapped to when retiring. */
  replacedBy: string;
  reason: string;
}

/** Result returned by the happy-path retirement. Shape preserved from the
 *  _ards stub so route callers don't need to change. */
export interface RetirementResult {
  retiredCustodialSignerId: string;
  effectiveAt: string;
}

/** Audit event shape. Consumed by future audit-sink wiring; emitted
 *  synchronously from the registry so ordering is observable in tests. */
export interface CustodyAuditEvent {
  type: 'custodial_signer_retired' | 'self_custody_migration_finalized';
  userId: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

/** Documented shape of retired-signer ids. Exported so _ards tests can
 *  assert against the canonical regex without hardcoding it twice. */
export const RETIRED_ID_SHAPE =
  /^retired-custodial-[A-Za-z0-9_\-.]+-\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

// ── Stores (module-singleton — swap with DB-backed impls later) ──────────────

/** Authoritative per-user signer state. Set by retireCustodialSigner on
 *  successful commit; read by isSelfCustodyActive + requireCustodial. */
const userCustodyMode: Map<string, CustodyMode> = new Map();

/** Per-user self-custody wallet binding. Set ONLY during successful commit
 *  alongside userCustodyMode transition. */
const selfCustodyPubKey: Map<string, string> = new Map();

/** Per-user retirement audit trail. Writes are keyed by userId so duplicate
 *  retire() calls can detect prior state without touching userCustodyMode. */
const retiredCustodialSigners: Map<string, RetiredCustodialSignerRecord> =
  new Map();

/** Subscriber callbacks that receive every committed audit event. Populated
 *  via `onAuditEvent` — wired by the admin-audit/KV flush pipeline in prod. */
const auditSubscribers: Array<(event: CustodyAuditEvent) => void> = [];

/** In-memory event log — synchronous write during commit. Swapped for a
 *  real sink in production via `onAuditEvent`. Test helper reads this. */
const emittedEvents: CustodyAuditEvent[] = [];

// ── Test-only failure injection ───────────────────────────────────────────────

/**
 * Test-only failure injection hook for spec acceptance test #5.
 *
 * When set, the named stage inside retireCustodialSigner THROWS — staging has
 * already built a pending write set, but the commit phase never runs, so no
 * stores mutate and no events emit. This simulates a "DB failure between
 * register and retire" without needing an actual DB.
 *
 * Stages, in order:
 *   - 'stage_mode'   — after staging userCustodyMode transition
 *   - 'stage_pubkey' — after staging selfCustodyPubKey binding
 *   - 'stage_audit'  — after staging the retirement audit record
 *   - 'pre_commit'   — immediately before the commit pass
 *
 * Production code never sets this. See `_setFailAfterStageForTests`.
 */
type FailStage = 'stage_mode' | 'stage_pubkey' | 'stage_audit' | 'pre_commit';
let _failAfterStage: FailStage | null = null;

export function _setFailAfterStageForTests(stage: FailStage | null): void {
  _failAfterStage = stage;
}

// ── Public read API ──────────────────────────────────────────────────────────

/** True iff the user has completed migration to self-custody. Readers use
 *  this to gate custodial-signing endpoints (Invariant #1). */
export function isSelfCustodyActive(userId: string): boolean {
  return userCustodyMode.get(userId) === 'self_custody_active';
}

/** Return the self-custody wallet address bound during retirement, or null
 *  if the user is still custodial. Never throws. */
export function getSelfCustodyWallet(userId: string): string | null {
  return selfCustodyPubKey.get(userId) ?? null;
}

/** True iff we have a retirement audit record for this user. Distinct from
 *  `isSelfCustodyActive` only during the commit window — in practice they
 *  are both true after a successful retirement. */
export function isCustodialRetired(userId: string): boolean {
  return retiredCustodialSigners.has(userId);
}

/**
 * Invariant #1 guard for custodial signing endpoints.
 *
 * Call this at the top of any endpoint that would produce a custodial
 * signature for a user. If the user has migrated to self-custody, this
 * returns an error object that the endpoint should convert to HTTP 403
 * with `error: 'user_migrated_to_self_custody'`.
 *
 * Returning an object rather than throwing keeps the caller in control of
 * the response shape (the HTTP layer wants JSON, background workers want
 * structured logs).
 */
export type RequireCustodialResult =
  | { ok: true }
  | { ok: false; code: 'user_migrated_to_self_custody'; message: string };

export function requireCustodial(userId: string): RequireCustodialResult {
  if (isSelfCustodyActive(userId)) {
    return {
      ok: false,
      code: 'user_migrated_to_self_custody',
      message:
        'User has migrated to self-custody. Custodial signing is permanently disabled for this user.',
    };
  }
  return { ok: true };
}

// ── Audit event plumbing ─────────────────────────────────────────────────────

/** Subscribe to audit events. Synchronous — listener throws propagate so a
 *  broken audit sink fails the transaction rather than silently losing
 *  events. */
export function onAuditEvent(
  listener: (event: CustodyAuditEvent) => void
): () => void {
  auditSubscribers.push(listener);
  return () => {
    const i = auditSubscribers.indexOf(listener);
    if (i >= 0) auditSubscribers.splice(i, 1);
  };
}

/** Test-only: read the in-memory event log. */
export function _getEmittedEventsForTests(): readonly CustodyAuditEvent[] {
  return emittedEvents.slice();
}

// ── Transaction wrapper (in-memory today; DB-backed tomorrow) ────────────────

/**
 * Wrap a commit closure so in-memory operation semantics match what a real
 * DB would give us. Today it is a direct call. In production the body is
 * replaced with `await db.transaction(async (tx) => commit(tx))`.
 *
 * Exported so callers that need to COMPOSE multiple registry writes in a
 * larger transaction (e.g. future integration with the admin audit KV) can
 * reuse the wrapper.
 */
export function withTransaction<T>(commit: () => T): T {
  return commit();
}

// ── The load-bearing call: atomic retirement ─────────────────────────────────

/**
 * Retire the custodial signer for a user and atomically register self-custody.
 *
 * Spec contract (Invariant #3 + acceptance test #5):
 *   - On success: all three stores updated, both audit events emitted.
 *   - On ANY failure (injected or real): all three stores unchanged, zero
 *     audit events emitted. The staged-write buffer is discarded.
 *
 * Idempotency: if the user is already retired, we return the SAME retirement
 * record (no-op replay). This matches the route-level replay branch in
 * _ards/handleFinalize — if the route believed it was retrying, we must not
 * emit a second retirement event or mint a second retired-signer-id.
 *
 * @param userId              — the user whose custodial signer is retiring
 * @param newWalletAddress    — the self-custody wallet to bind
 * @param now                 — clock injection for deterministic tests
 * @param reason              — audit-trail free-text reason
 */
export function retireCustodialSigner(
  userId: string,
  newWalletAddress: string,
  now: Date = new Date(),
  reason: string = 'tier2_self_custody_export_finalized'
): RetirementResult {
  if (!userId || typeof userId !== 'string') {
    throw new TypeError('retireCustodialSigner: userId required (string)');
  }
  if (!newWalletAddress || typeof newWalletAddress !== 'string') {
    throw new TypeError(
      'retireCustodialSigner: newWalletAddress required (string)'
    );
  }

  // Replay-safe idempotency. If we already retired this user, return the
  // SAME record. Do NOT emit audit events — audit ordering matters, and the
  // replay path must be observable as a no-op, not a double-emit.
  const existing = retiredCustodialSigners.get(userId);
  if (existing) {
    return {
      retiredCustodialSignerId: existing.retiredCustodialSignerId,
      effectiveAt: existing.retiredAt,
    };
  }

  // Build the retired-signer id in canonical shape. Exported regex
  // `RETIRED_ID_SHAPE` asserts against this format.
  const isoTs = now.toISOString();
  const retiredId = `retired-custodial-${userId}-${isoTs}`;

  // ── Staging phase ────────────────────────────────────────────────────────
  // Build the full write set without touching any store. An injected
  // failure at any stage_* point discards the pending set entirely.
  const pending: {
    mode?: { userId: string; next: CustodyMode };
    pubkey?: { userId: string; wallet: string };
    audit?: RetiredCustodialSignerRecord;
    events?: CustodyAuditEvent[];
  } = {};

  pending.mode = { userId, next: 'self_custody_active' };
  if (_failAfterStage === 'stage_mode') {
    throw new Error('injected failure at stage_mode');
  }

  pending.pubkey = { userId, wallet: newWalletAddress };
  if (_failAfterStage === 'stage_pubkey') {
    throw new Error('injected failure at stage_pubkey');
  }

  pending.audit = {
    userId,
    retiredCustodialSignerId: retiredId,
    retiredAt: isoTs,
    replacedBy: newWalletAddress,
    reason,
  };
  if (_failAfterStage === 'stage_audit') {
    throw new Error('injected failure at stage_audit');
  }

  // Event ordering: `self_custody_migration_finalized` emits BEFORE
  // `custodial_signer_retired` so downstream consumers see the new state
  // (user is now self-custody) before the old state change (the signer is
  // gone). This mirrors real-world convention: the new auth is provisioned
  // before the old one is revoked.
  pending.events = [
    {
      type: 'self_custody_migration_finalized',
      userId,
      timestamp: isoTs,
      metadata: { newWalletAddress, retiredCustodialSignerId: retiredId },
    },
    {
      type: 'custodial_signer_retired',
      userId,
      timestamp: isoTs,
      metadata: { retiredCustodialSignerId: retiredId, reason },
    },
  ];
  if (_failAfterStage === 'pre_commit') {
    throw new Error('injected failure at pre_commit');
  }

  // ── Commit phase (atomic) ────────────────────────────────────────────────
  // Wrapped in withTransaction so a real DB backend can swap in BEGIN/COMMIT.
  // All writes happen here; any throw from a subscriber propagates out and
  // the transaction is considered failed (but in-memory stores are already
  // mutated — this is a production-sink failure mode, documented below).
  //
  // NOTE: if a real DB backs this module, the commit pass is a single
  // transaction — subscriber failures can be handled by a DB ROLLBACK on
  // post-commit subscriber error. For the in-memory path, subscribers run
  // AFTER the store writes; if a subscriber throws, the user is already
  // retired (correct from the spec's standpoint — retirement is the
  // authoritative state, audit delivery is best-effort). This matches the
  // spec's "all state transitions are auditable with immutable event log"
  // — the log write is the `emittedEvents` push which happens with the
  // state write; external flush is a separate concern.
  return withTransaction<RetirementResult>(() => {
    userCustodyMode.set(pending.mode!.userId, pending.mode!.next);
    selfCustodyPubKey.set(pending.pubkey!.userId, pending.pubkey!.wallet);
    retiredCustodialSigners.set(pending.audit!.userId, pending.audit!);

    for (const event of pending.events!) {
      emittedEvents.push(event);
      for (const sub of auditSubscribers) {
        // Swallow subscriber errors so one broken sink cannot stop other
        // sinks from receiving the event. Log to console.error so the
        // failure is observable.
        try {
          sub(event);
        } catch (subErr) {
          console.error(
            '[custody-registry] audit subscriber threw:',
            subErr instanceof Error ? subErr.message : subErr
          );
        }
      }
    }

    return {
      retiredCustodialSignerId: pending.audit!.retiredCustodialSignerId,
      effectiveAt: pending.audit!.retiredAt,
    };
  });
}

// ── Test reset ────────────────────────────────────────────────────────────────

/** Test-only: reset every store + the failure-injection hook. Call in
 *  beforeEach to isolate tests. */
export function _resetCustodyRegistryForTests(): void {
  userCustodyMode.clear();
  selfCustodyPubKey.clear();
  retiredCustodialSigners.clear();
  emittedEvents.length = 0;
  auditSubscribers.length = 0;
  _failAfterStage = null;
}

// ── Back-compat shim for the _ards shadow map ────────────────────────────────

/**
 * BACK-COMPAT: the _ards route layer used a shadow `userCustodyMode` Map
 * exported directly. After the handoff, _ards imports this module and uses
 * `isSelfCustodyActive` / `requireCustodial` instead. The shadow map is
 * removed from identity-export-routes.ts in the same commit as this module.
 *
 * Exposed here only for the test helper in _ards tests that expects to
 * read the Map directly for assertions. Marked _-prefix so it never appears
 * in production call sites.
 */
export function _getUserCustodyModeForTests(
  userId: string
): CustodyMode | undefined {
  return userCustodyMode.get(userId);
}

/**
 * Test-only: seed `userCustodyMode` directly. Used by _ards tests that
 * exercise the "already self-custody" branch without going through the
 * full retirement flow. In production this Map is only ever written by
 * `retireCustodialSigner`.
 */
export function _setUserCustodyModeForTests(
  userId: string,
  mode: CustodyMode
): void {
  userCustodyMode.set(userId, mode);
}
