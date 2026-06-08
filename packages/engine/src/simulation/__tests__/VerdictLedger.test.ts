import { describe, expect, it } from 'vitest';
import {
  buildConjectureV1Receipt,
  createSquareSheetCandidate,
  eulerCharacteristicProbe,
  nonDegenerateGeometryProbe,
} from '../ConjectureEngine';
import {
  VERDICT_LEDGER_V1,
  conjectureStatusToVerdict,
  currentVerdict,
  hasBeenReopened,
  recordVerdict,
  reopenVerdict,
  verdictFromConjectureReceipt,
  verdictHistory,
} from '../VerdictLedger';

describe('VerdictLedger — temporal, assumption-bound verdicts (knowledge is fluid)', () => {
  it('records a first verdict as the current entry', () => {
    const ledger = recordVerdict({
      claimId: 'C.WEGENER.continental-drift',
      status: 'undecided',
      assumptions: ['no known mechanism for continental motion'],
      timestamp: '1912-01-06T00:00:00Z',
    });
    expect(ledger.solverType).toBe(VERDICT_LEDGER_V1);
    expect(ledger.entries).toHaveLength(1);
    expect(currentVerdict(ledger).status).toBe('undecided');
    expect(hasBeenReopened(ledger)).toBe(false);
  });

  it('a falsified-under-assumption claim re-opens to UNDECIDED, not survived (Wegener mechanism)', () => {
    const t1 = recordVerdict({
      claimId: 'C.X',
      status: 'falsified',
      assumptions: ['assumption A holds'],
      timestamp: '2020-01-01T00:00:00Z',
    });
    const t2 = reopenVerdict(t1, {
      overturnedAssumption: 'assumption A holds',
      reason: 'assumption A was experimentally overturned in 2026',
      timestamp: '2026-01-01T00:00:00Z',
    });
    // overturning the reason it was rejected does NOT make it true — it re-opens.
    expect(currentVerdict(t2).status).toBe('undecided');
    expect(currentVerdict(t2).reopenedBecause).toBe('assumption A holds');
    expect(currentVerdict(t2).supersedesKey).toBe(t1.current.entryKey);
    expect(hasBeenReopened(t2)).toBe(true);
  });

  it('append-only history is preserved across re-openings', () => {
    let ledger = recordVerdict({
      claimId: 'C.Y',
      status: 'falsified',
      assumptions: ['model M1'],
      timestamp: '2020-01-01T00:00:00Z',
    });
    ledger = reopenVerdict(ledger, {
      overturnedAssumption: 'model M1',
      reason: 'M1 superseded by M2',
      timestamp: '2026-01-01T00:00:00Z',
      newStatus: 'survived',
      assumptions: ['model M2'],
      receiptKey: 'receipt-after-retest',
    });
    expect(ledger.entries).toHaveLength(2);
    expect(ledger.entries[0].status).toBe('falsified'); // history retained
    expect(currentVerdict(ledger).status).toBe('survived'); // explicit re-test result
    expect(currentVerdict(ledger).assumptions).toEqual(['model M2']);
    const history = verdictHistory(ledger);
    expect(history).toHaveLength(2);
    expect(history[1]).toMatch(/re-opened/);
  });

  it('refuses to overturn an assumption the current verdict did not depend on', () => {
    const ledger = recordVerdict({
      claimId: 'C.Z',
      status: 'falsified',
      assumptions: ['assumption A'],
      timestamp: '2020-01-01T00:00:00Z',
    });
    expect(() =>
      reopenVerdict(ledger, {
        overturnedAssumption: 'assumption B', // never depended on
        reason: 'irrelevant',
        timestamp: '2026-01-01T00:00:00Z',
      })
    ).toThrow(/did not depend on it/);
  });

  it('entry keys are deterministic', () => {
    const a = recordVerdict({
      claimId: 'C.K',
      status: 'survived',
      assumptions: ['a'],
      timestamp: '2026-01-01T00:00:00Z',
    });
    const b = recordVerdict({
      claimId: 'C.K',
      status: 'survived',
      assumptions: ['a'],
      timestamp: '2026-01-01T00:00:00Z',
    });
    expect(a.current.entryKey).toBe(b.current.entryKey);
  });

  it('rejects empty claimId / timestamp', () => {
    expect(() =>
      recordVerdict({ claimId: '', status: 'undecided', timestamp: '2026-01-01T00:00:00Z' })
    ).toThrow();
    expect(() => recordVerdict({ claimId: 'C', status: 'undecided', timestamp: '' })).toThrow();
  });
});

describe('VerdictLedger — wired to a real Conjecture Engine receipt', () => {
  it('maps conjecture statuses onto the verdict ladder (currently 1:1)', () => {
    expect(conjectureStatusToVerdict('undecided')).toBe('undecided');
    expect(conjectureStatusToVerdict('survived')).toBe('survived');
    expect(conjectureStatusToVerdict('falsified')).toBe('falsified');
    expect(conjectureStatusToVerdict('out-of-scope')).toBe('out-of-scope');
    expect(conjectureStatusToVerdict('rediscovered')).toBe('rediscovered');
  });

  it('opens a ledger from a real ConjectureReceipt, inheriting claim assumptions + receipt link', () => {
    const receipt = buildConjectureV1Receipt({
      claim: {
        kind: 'geometry.invariant',
        id: 'C.LEDGER.SQUARE_SHEET',
        statement: 'a square sheet is non-degenerate with Euler characteristic 1',
        assumptions: ['element arity is explicit', 'receipt is evidence, not a Lean proof'],
        evidenceRefs: ['packages/engine/src/simulation/ConjectureEngine.ts'],
        proposedBy: 'verdict-ledger-test',
      },
      candidates: [createSquareSheetCandidate('ledger-square-sheet')],
      probes: [nonDegenerateGeometryProbe(), eulerCharacteristicProbe(1)],
      hashMode: 'sha256',
    });

    const ledger = verdictFromConjectureReceipt(receipt, '2026-05-23T00:00:00Z');
    const v = currentVerdict(ledger);
    expect(v.claimId).toBe('C.LEDGER.SQUARE_SHEET');
    expect(v.status).toBe(conjectureStatusToVerdict(receipt.status));
    expect(v.status).toBe('survived');
    expect(v.receiptKey).toBe(receipt.receiptKey);
    expect(v.assumptions).toEqual(receipt.claim.assumptions);

    // and it can be re-opened when one of those inherited assumptions is overturned
    const reopened = reopenVerdict(ledger, {
      overturnedAssumption: 'receipt is evidence, not a Lean proof',
      reason: 'a Lean-tier proof was later attempted and failed',
      timestamp: '2027-01-01T00:00:00Z',
    });
    expect(currentVerdict(reopened).status).toBe('undecided');
  });
});
