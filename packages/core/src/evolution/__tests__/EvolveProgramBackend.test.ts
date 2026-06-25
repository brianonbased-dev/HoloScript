/**
 * EvolveProgramBackend tests — the gated evolutionary loop.
 *
 * The thesis under test: the verifier-gate is the engine. A candidate that fails
 * the correctness gate is DISCARDED (never archived); fitness selects among
 * survivors; the loop PROPOSES and never self-ships. Deterministic: a scripted
 * proposer + a pure gate (gate = lower-length-is-better, passes iff it starts
 * with "OK") + injected clock.
 *
 * @see ../EvolveProgramBackend.ts
 */
import { describe, it, expect } from 'vitest';
import { runEvolution, type EvolvePolicy, type Gate } from '../EvolveProgramBackend';

const policy: EvolvePolicy = {
  goal: 'shorten while staying valid',
  generations: 2,
  population: 2,
  archiveSize: 8,
  proposerModel: 'mock-local-metal',
};

// Pure fitness oracle: valid iff it starts with "OK"; score = length (lower better).
const gate: Gate = async (code) => ({ passed: code.startsWith('OK'), score: code.length });

/** A scripted proposer: returns the next canned output regardless of parent. */
function scriptedProposer(outputs: string[]) {
  let i = 0;
  return async () => outputs[i++] ?? '';
}

const NOW = () => '2026-06-25T00:00:00.000Z';

describe('runEvolution (gated evolutionary loop)', () => {
  it('archives improving survivors, DISCARDS gate failures, and returns the best (IMPROVED)', async () => {
    const propose = scriptedProposer([
      'OK 012345', // 9, valid → improves over seed(13)
      'BAD junk', //  invalid → discarded (the guardrail)
      'OK 12', //     5, valid → new best
      'OK 012345', // 9, valid but not better than 5
    ]);
    const { bestCode, receipt } = await runEvolution('OK 0123456789', policy, {
      propose,
      gate,
      now: NOW,
    });

    expect(receipt.result).toBe('IMPROVED');
    expect(bestCode).toBe('OK 12');
    expect(receipt.seedScore).toBe(13);
    expect(receipt.bestScore).toBe(5);
    expect(receipt.improvementPct).toBeGreaterThan(0);
    // The discard path actually fired (a failing candidate was thrown away).
    expect(receipt.discarded).toBeGreaterThanOrEqual(1);
    expect(receipt.traceJSONL).toContain('gated_fail_discarded');
    // Every gated candidate is recorded (seed + 4 proposals).
    expect(receipt.evaluated).toBe(5);
    // Invariants the architecture guarantees.
    expect(receipt.verifierGated).toBe(true);
    expect(receipt.selfShips).toBe(false);
    expect(receipt.verifyUrl).toMatch(/^cael:sha256:[0-9a-f]{64}$/);
    // The trace is real newline-delimited JSON.
    for (const line of receipt.traceJSONL.split('\n')) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  it('refuses to evolve from an invalid seed (SEED_INVALID), never proposing', async () => {
    let proposed = 0;
    const propose = async () => {
      proposed++;
      return 'OK short';
    };
    const { bestCode, receipt } = await runEvolution('BAD seed', policy, { propose, gate, now: NOW });

    expect(receipt.result).toBe('SEED_INVALID');
    expect(bestCode).toBeNull();
    expect(proposed).toBe(0); // an invalid baseline is never evolved from
    expect(receipt.bestScore).toBeNull();
  });

  it('does not self-ship when nothing beats the seed (NO_IMPROVEMENT, bestCode null)', async () => {
    // Every proposal is valid but LONGER than the seed → no improvement.
    const propose = scriptedProposer(['OK 0123456789', 'OK 0123456789', 'OK 0123456789', 'OK 0123456789']);
    const { bestCode, receipt } = await runEvolution('OK 12', policy, { propose, gate, now: NOW });

    expect(receipt.result).toBe('NO_IMPROVEMENT');
    expect(bestCode).toBeNull(); // propose-not-ship: only a real win is surfaced
    expect(receipt.seedScore).toBe(5);
  });

  it('is deterministic — identical inputs yield an identical provenance anchor', async () => {
    const run = () =>
      runEvolution('OK 0123456789', policy, {
        propose: scriptedProposer(['OK 012345', 'BAD junk', 'OK 12', 'OK 012345']),
        gate,
        now: NOW,
      });
    const a = await run();
    const b = await run();
    expect(a.receipt.verifyUrl).toBe(b.receipt.verifyUrl);
  });
});
