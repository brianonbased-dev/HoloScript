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
import {
  makeOpenAICompatibleProposer,
  runEvolution,
  toGradedTraceRow,
  type EvolvePolicy,
  type Gate,
  type EvolveTraceRecord,
} from '../EvolveProgramBackend';

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

describe('makeOpenAICompatibleProposer', () => {
  it('posts chat-completions requests and strips markdown fences from the answer', async () => {
    let seen: { url: string; init?: RequestInit } | undefined;
    const fetchImpl: typeof fetch = async (url, init) => {
      seen = { url: String(url), init };
      return new Response(
        JSON.stringify({ choices: [{ message: { content: '```holo\nOK revised\n```' } }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };

    const propose = makeOpenAICompatibleProposer('http://localhost:18080/', 'qwen3:4b', {
      apiKey: 'test-key',
      temperature: 0.2,
      maxTokens: 1024,
      fetchImpl,
    });
    const code = await propose('OK seed', 'shorten');

    expect(code).toBe('OK revised');
    expect(seen?.url).toBe('http://localhost:18080/v1/chat/completions');
    expect((seen?.init?.headers as Record<string, string>).authorization).toBe('Bearer test-key');
    const body = JSON.parse(String(seen?.init?.body));
    expect(body).toMatchObject({
      model: 'qwen3:4b',
      stream: false,
      temperature: 0.2,
      max_tokens: 1024,
    });
    expect(body.messages[1].content).toContain('GOAL: shorten');
    expect(body.messages[1].content).toContain('OK seed');
  });

  it('keeps full chat-completions URLs and fails on empty model output', async () => {
    let seenUrl = '';
    const fetchImpl: typeof fetch = async (url) => {
      seenUrl = String(url);
      return new Response(JSON.stringify({ choices: [{ message: { content: '   ' } }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };

    const propose = makeOpenAICompatibleProposer(
      'http://localhost:18080/v1/chat/completions',
      'qwen3:4b',
      { fetchImpl },
    );

    await expect(propose('OK seed', 'shorten')).rejects.toThrow('openai-compatible empty response');
    expect(seenUrl).toBe('http://localhost:18080/v1/chat/completions');
  });
});

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

describe('evolve → training data bridge (the second loop)', () => {
  it('emits a verifier-labeled record for EVERY gated candidate — pass AND fail', async () => {
    const recs: EvolveTraceRecord[] = [];
    await runEvolution('OK 0123456789', policy, {
      propose: scriptedProposer(['OK 012345', 'BAD junk', 'OK 12', 'OK 012345']),
      gate,
      now: NOW,
      onCandidate: (r) => recs.push(r),
    });
    // 4 proposals reached the gate → 4 records (the seed is not a proposal, not emitted).
    expect(recs.length).toBe(4);
    // Both outcomes captured: passing (SFT/chosen) and failing (DPO/rejected).
    expect(recs.filter((r) => r.passed).length).toBe(3);
    const failed = recs.filter((r) => !r.passed);
    expect(failed.length).toBe(1);
    // The discarded failure is STILL captured — it is the rejected training example.
    expect(failed[0].candidateCode).toBe('BAD junk');
    expect(failed[0].score).toBe(Infinity);
    expect(failed[0].goal).toBe(policy.goal);
  });

  it('toGradedTraceRow renders the harvest REC-SHAPE (passed→SFT, failed→DPO-rejected)', () => {
    const ts = NOW();
    const passRow = toGradedTraceRow(
      { gen: 1, parentId: 0, parentCode: 'OK long', goal: 'shorten', candidateCode: 'OK', passed: true, score: 2 },
      { agentId: 'claude1', ts },
    );
    expect(passRow).toMatchObject({
      target: 'OK',
      family: 'program-evolution',
      modality: 'code',
      source: 'evolve-loop',
      agentId: 'claude1',
      ts,
    });
    expect(passRow.user).toContain('GOAL: shorten');
    expect(passRow.user).toContain('OK long'); // the parent the model must improve
    expect(passRow.grader).toMatchObject({ passed: true, score: 2, kind: 'evolve-gated' });

    // Failed candidate → score null (dropped from SFT, kept for DPO/contrast by the grader-gate).
    const failRow = toGradedTraceRow(
      { gen: 1, parentId: 0, parentCode: 'OK', goal: 'g', candidateCode: 'BAD', passed: false, score: Infinity },
      { agentId: 'claude1', ts },
    );
    expect(failRow.grader).toMatchObject({ passed: false, score: null });
    expect(failRow.target).toBe('BAD');
  });
});
