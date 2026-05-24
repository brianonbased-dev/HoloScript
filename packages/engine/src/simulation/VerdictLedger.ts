/**
 * VerdictLedger — temporal, assumption-bound conjecture verdicts ("knowledge is fluid").
 *
 * A conjecture verdict is NEVER eternal. It is always "as of timestamp T, under
 * assumptions A." When an assumption the verdict depended on is later overturned, the
 * verdict must be RE-OPENED — and crucially, a falsified/rejected claim re-opens to
 * `undecided`, NOT to `survived`: overturning the reason a claim was rejected does not
 * make it true, it makes it open again (it must be re-tested). This is the Wegener
 * mechanism: a theory that consensus rejected without a counterexample stays re-openable;
 * a theory rejected *under a now-overturned assumption* returns to the open set.
 *
 * The ledger is append-only — every transition is preserved, so the history reads
 * "falsified at T1 under assumption A → re-opened at T2 when A was overturned." That
 * audit trail IS the fluid-knowledge record. Generalizes the documented impossibility
 * UPGRADE pattern (W.056: a rating moving DOESN'T_HELP → PARTIALLY after reframing) to
 * the conjecture-engine verdict ladder.
 *
 * Reject ONLY on a counterexample (`falsified`) or untestability (`out-of-scope`); never
 * on consensus. Consensus rejection without a counterexample is `undecided`, and stays
 * re-openable forever (D.060 epistemics — anti-authority, pro-evidence).
 *
 * Deterministic entry keys via the shared `buildConjectureStableKey` primitive. No edits
 * to ConjectureEngine.ts — this is a higher-level meta-layer over conjecture receipts.
 */

import {
  buildConjectureStableKey,
  type ConjectureReceipt,
  type ConjectureStatus,
} from './ConjectureEngine';

export const VERDICT_LEDGER_V1 = 'conjecture.verdict-ledger.v1' as const;
export type VerdictLedgerSolverType = typeof VERDICT_LEDGER_V1;

/**
 * The full verdict ladder (D.060 / W.536): intake gate → resolution → novelty.
 * `out-of-scope` (unfalsifiable) and `undecided` (falsifiable, unresolved) are distinct;
 * `falsified` requires an actual counterexample; consensus rejection is NEVER `falsified`.
 */
export type VerdictStatus =
  | 'out-of-scope'
  | 'undecided'
  | 'falsified'
  | 'survived'
  | 'rediscovered';

export interface VerdictEntry {
  claimId: string;
  status: VerdictStatus;
  /** What this verdict is conditional on. Overturning one of these re-opens the verdict. */
  assumptions: ReadonlyArray<string>;
  /** ISO timestamp — the verdict holds "as of" this moment, not eternally. */
  timestamp: string;
  /** Optional link to the underlying conjecture receipt that produced this status. */
  receiptKey: string | null;
  /** The prior entry this revises (append-only chain). Null for the first entry. */
  supersedesKey: string | null;
  /** Which assumption was overturned to trigger this revision (null for the first entry). */
  reopenedBecause: string | null;
  /** Deterministic hash of this entry's content. */
  entryKey: string;
}

export interface VerdictLedger {
  claimId: string;
  solverType: VerdictLedgerSolverType;
  entries: ReadonlyArray<VerdictEntry>;
  /** The latest entry — authoritative *for now*, never eternal. */
  current: VerdictEntry;
}

export interface RecordVerdictInput {
  claimId: string;
  status: VerdictStatus;
  assumptions?: ReadonlyArray<string>;
  timestamp: string;
  receiptKey?: string | null;
}

function assertNonEmpty(value: string, name: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`verdict-ledger: ${name} must be a non-empty string`);
  }
}

function makeEntry(
  base: Omit<VerdictEntry, 'entryKey'>,
): VerdictEntry {
  const entryKey = buildConjectureStableKey('conjecture.verdict-ledger.entry', {
    claimId: base.claimId,
    status: base.status,
    assumptions: [...base.assumptions],
    timestamp: base.timestamp,
    receiptKey: base.receiptKey,
    supersedesKey: base.supersedesKey,
    reopenedBecause: base.reopenedBecause,
  });
  return { ...base, entryKey };
}

/** Open a ledger with the first verdict for a claim. */
export function recordVerdict(input: RecordVerdictInput): VerdictLedger {
  assertNonEmpty(input.claimId, 'claimId');
  assertNonEmpty(input.timestamp, 'timestamp');
  const entry = makeEntry({
    claimId: input.claimId,
    status: input.status,
    assumptions: input.assumptions ? [...input.assumptions] : [],
    timestamp: input.timestamp,
    receiptKey: input.receiptKey ?? null,
    supersedesKey: null,
    reopenedBecause: null,
  });
  return {
    claimId: input.claimId,
    solverType: VERDICT_LEDGER_V1,
    entries: [entry],
    current: entry,
  };
}

export interface ReopenVerdictInput {
  /** The assumption being overturned — MUST be one the current verdict depended on. */
  overturnedAssumption: string;
  /** Human-readable reason / evidence for the overturn. */
  reason: string;
  timestamp: string;
  /**
   * The status after re-opening. Defaults to `undecided` — overturning the reason a
   * claim was rejected re-opens it, it does NOT make it true. A caller may pass a
   * status explicitly (e.g. after a fresh run), but `falsified`/`survived` should come
   * from an actual re-test, not from the overturn alone.
   */
  newStatus?: VerdictStatus;
  /** Assumptions for the re-opened verdict (the overturned one is dropped by default). */
  assumptions?: ReadonlyArray<string>;
  receiptKey?: string | null;
}

/**
 * Re-open a verdict because one of its assumptions was overturned. Appends a new entry
 * superseding the current one. Guard: you can only overturn an assumption the current
 * verdict actually depended on (no rewriting history with an unrelated assumption).
 * Default re-opened status is `undecided` (re-test required) — the Wegener mechanism.
 */
export function reopenVerdict(ledger: VerdictLedger, input: ReopenVerdictInput): VerdictLedger {
  assertNonEmpty(input.overturnedAssumption, 'overturnedAssumption');
  assertNonEmpty(input.reason, 'reason');
  assertNonEmpty(input.timestamp, 'timestamp');

  const current = ledger.current;
  if (!current.assumptions.includes(input.overturnedAssumption)) {
    throw new Error(
      `verdict-ledger: cannot overturn assumption "${input.overturnedAssumption}" — the current verdict did not depend on it`,
    );
  }

  const nextAssumptions =
    input.assumptions !== undefined
      ? [...input.assumptions]
      : current.assumptions.filter((a) => a !== input.overturnedAssumption);

  const entry = makeEntry({
    claimId: ledger.claimId,
    status: input.newStatus ?? 'undecided',
    assumptions: nextAssumptions,
    timestamp: input.timestamp,
    receiptKey: input.receiptKey ?? null,
    supersedesKey: current.entryKey,
    reopenedBecause: input.overturnedAssumption,
  });

  const entries = [...ledger.entries, entry];
  return {
    claimId: ledger.claimId,
    solverType: VERDICT_LEDGER_V1,
    entries,
    current: entry,
  };
}

/**
 * Map a Conjecture Engine receipt status onto the verdict ladder. The unions currently
 * coincide (out-of-scope | undecided | survived | falsified | rediscovered), so this is
 * a 1:1 pass-through — but the exhaustive switch makes any future ConjectureStatus
 * divergence a compile error rather than a silent miscategorization.
 */
export function conjectureStatusToVerdict(status: ConjectureStatus): VerdictStatus {
  switch (status) {
    case 'out-of-scope':
    case 'undecided':
    case 'survived':
    case 'falsified':
    case 'rediscovered':
      return status;
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

/**
 * The real consumer: open a verdict ledger directly from a Conjecture Engine receipt.
 * The verdict inherits the claim's assumptions (so overturning one re-opens it) and
 * links the receipt that produced it. `timestamp` is when the verdict is recorded
 * (receipts are deterministic/timeless; the verdict is the time-bound interpretation).
 */
export function verdictFromConjectureReceipt(
  receipt: ConjectureReceipt,
  timestamp: string,
): VerdictLedger {
  return recordVerdict({
    claimId: receipt.claim.id,
    status: conjectureStatusToVerdict(receipt.status),
    assumptions: receipt.claim.assumptions,
    timestamp,
    receiptKey: receipt.receiptKey,
  });
}

/** The authoritative-for-now verdict. Never treat as eternal. */
export function currentVerdict(ledger: VerdictLedger): VerdictEntry {
  return ledger.current;
}

/** Whether a claim's verdict has ever been revised (knowledge moved). */
export function hasBeenReopened(ledger: VerdictLedger): boolean {
  return ledger.entries.length > 1;
}

/** The full transition history as a readable chain of "status @ time (because …)". */
export function verdictHistory(ledger: VerdictLedger): ReadonlyArray<string> {
  return ledger.entries.map((e) =>
    e.reopenedBecause
      ? `${e.status} @ ${e.timestamp} (re-opened: assumption "${e.reopenedBecause}" overturned)`
      : `${e.status} @ ${e.timestamp} (under: ${e.assumptions.join(', ') || 'no stated assumptions'})`,
  );
}
