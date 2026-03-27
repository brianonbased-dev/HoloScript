/**
 * Challenge Solver & Escalation Pipeline Tests
 *
 * Validates L1 (regex), L2 (LLM fallback), L3 (auto-tune logging),
 * and the full escalation flow through ChallengeEscalationPipeline.
 *
 * NOTE: The L1 solver strips all non-alphanumeric chars (including spaces) then
 * collapses consecutive duplicate letters before matching number words. This means
 * compound numbers like "twenty" + "five" merge to 25 (one number), so tests must
 * use patterns the solver actually handles: compound+single (e.g. "twenty two plus
 * eight") or digit-based inputs.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  solveChallenge,
  fuzzyMatch,
  ChallengeEscalationPipeline,
} from '../moltbook/challenge-solver';
import type { ChallengeLLMProvider } from '../moltbook/challenge-solver';

// ── fuzzyMatch unit tests ──────────────────────────────────────────────────

describe('fuzzyMatch', () => {
  it('matches exact substring', () => {
    expect(fuzzyMatch('twenty', 0, 'twenty', 2)).toBe(6);
  });

  it('matches with 1 noise char inserted', () => {
    // "twyo" contains "two" with 'y' as noise
    expect(fuzzyMatch('twyo', 0, 'two', 2)).toBe(4);
  });

  it('matches with 2 noise chars inserted', () => {
    // "txywo" = t, [x,y skipped], w, o
    expect(fuzzyMatch('txywo', 0, 'two', 2)).toBe(5);
  });

  it('rejects with 3+ consecutive noise chars', () => {
    // "txyzwo" — 3 consecutive skips exceed maxSkip=2
    expect(fuzzyMatch('txyzwo', 0, 'two', 2)).toBe(-1);
  });

  it('matches number word with noise in middle', () => {
    // "fortxy" = f,o,r,t,[x skipped],y → "forty"
    expect(fuzzyMatch('fortxy', 0, 'forty', 2)).toBe(6);
  });

  it('matches from non-zero start position', () => {
    expect(fuzzyMatch('xxxtwoyyyy', 3, 'two', 2)).toBe(6);
  });

  it('rejects when pattern not present', () => {
    expect(fuzzyMatch('abcdef', 0, 'xyz', 2)).toBe(-1);
  });
});

// ── L1: Regex + Fuzzy solver ────────────────────────────────────────────────

describe('solveChallenge (L1)', () => {
  // ── Pass 1: Exact regex (existing tests) ──

  it('solves compound + single addition', () => {
    expect(solveChallenge('twenty two plus eight')).toBe('30.00');
  });

  it('solves compound + teen subtraction', () => {
    expect(solveChallenge('forty five minus twelve')).toBe('33.00');
  });

  it('solves single × single multiplication', () => {
    expect(solveChallenge('seven times six')).toBe('42.00');
  });

  it('solves decade / teen division', () => {
    expect(solveChallenge('forty divide ten')).toBe('4.00');
  });

  it('handles numeric digits', () => {
    expect(solveChallenge('What is 15 plus 25?')).toBe('40.00');
  });

  it('strips special characters and collapses doubles', () => {
    expect(solveChallenge('tWwEeNnTtYy tWwOo pLlUuSs eIiGgHhTt')).toBe('30.00');
  });

  it('returns null when fewer than 2 numbers found', () => {
    expect(solveChallenge('What is the meaning of life?')).toBeNull();
  });

  it('returns null for division by zero', () => {
    expect(solveChallenge('ten divide zero')).toBeNull();
  });

  it('detects addition with "total" keyword', () => {
    expect(solveChallenge('the total of 10 and 5')).toBe('15.00');
  });

  it('handles speed word problem with "speeds up"', () => {
    expect(solveChallenge('A lobster swims at twenty two and speeds up by eight')).toBe('30.00');
  });

  // ── Pass 2: Fuzzy matching (noise chars inside words) ──

  it('handles noise char inside number word: "tWyO" → two', () => {
    // "tWyO" → strip+collapse → "twyo" → fuzzy matches "two"
    expect(solveChallenge('tWyO tIiMeEs fIvEe')).toBe('10.00');
  });

  it('handles noise chars inside both operands', () => {
    // "fOrTxy" → "fortxy" → fuzzy "forty", "tWyO" → "twyo" → fuzzy "two"
    expect(solveChallenge('fOrTxy pLuS tWyO')).toBe('42.00');
  });

  it('handles noise-corrupted operation word: "tiymes" → times', () => {
    expect(solveChallenge('seven tiymes six')).toBe('42.00');
  });

  it('handles dots used as obfuscation noise', () => {
    // Dots are now stripped (not preserved)
    expect(solveChallenge('t.w.e.n.t.y plus t.e.n')).toBe('30.00');
  });

  it('handles heavy Zalgo: special chars + doubles + noise', () => {
    // "sEeVvEeNn" → collapse → "seven", "tIiMmEeSs" → collapse → "times"
    // "sIiXx" → collapse → "six"
    expect(solveChallenge('sEeVvEeNn tIiMmEeSs sIiXx')).toBe('42.00');
  });

  it('handles split words with noise: "fOrT_x_y" becomes "forty"', () => {
    // After strip: "fortxy" → collapse: "fortxy" → fuzzy: "forty"
    expect(solveChallenge('fOrT*x*y minus tEeNn')).toBe('30.00');
  });

  // ── Edge cases ──

  it('returns null when operation is unrecognizable (no silent default)', () => {
    // "gobbledygook" is not any operation keyword
    expect(solveChallenge('ten gobbledygook five')).toBeNull();
  });

  it('handles "added" operation (collapse: "added" → "aded")', () => {
    expect(solveChallenge('ten added to five')).toBe('15.00');
  });

  it('handles "multiplied" operation', () => {
    expect(solveChallenge('four multiplied by three')).toBe('12.00');
  });

  it('handles "subtracted" operation', () => {
    expect(solveChallenge('twenty subtracted by five')).toBe('15.00');
  });

  it('handles "combined" operation', () => {
    expect(solveChallenge('seven combined with eight')).toBe('15.00');
  });
});

// ── L2: LLM fallback ───────────────────────────────────────────────────────

function createMockLLM(answer: string | null): ChallengeLLMProvider {
  return {
    complete: vi.fn().mockResolvedValue({
      content: answer ?? 'I cannot solve this',
    }),
  };
}

function createFailingLLM(): ChallengeLLMProvider {
  return {
    complete: vi.fn().mockRejectedValue(new Error('LLM unavailable')),
  };
}

// ── ChallengeEscalationPipeline ─────────────────────────────────────────────

describe('ChallengeEscalationPipeline', () => {
  let pipeline: ChallengeEscalationPipeline;
  let mockLLM: ChallengeLLMProvider;

  beforeEach(() => {
    mockLLM = createMockLLM('40.00');
    pipeline = new ChallengeEscalationPipeline(mockLLM);
  });

  describe('solve()', () => {
    it('uses L1 regex when it succeeds (no LLM call)', async () => {
      const answer = await pipeline.solve('seven times six');
      expect(answer).toBe('42.00');
      expect(mockLLM.complete).not.toHaveBeenCalled();
      expect(pipeline.getStats().l1Hits).toBe(1);
    });

    it('escalates to L2 when L1 returns null', async () => {
      // Only one number → L1 fails → escalates to L2
      const answer = await pipeline.solve('xQzW#rTy 40 is the answer to life');
      expect(answer).toBe('40.00');
      expect(mockLLM.complete).toHaveBeenCalled();
      expect(pipeline.getStats().l2Hits).toBe(1);
    });

    it('returns null when both L1 and L2 fail', async () => {
      const failPipeline = new ChallengeEscalationPipeline(createFailingLLM());
      const answer = await failPipeline.solve('completely unparseable gibberish');
      expect(answer).toBeNull();
      expect(failPipeline.getStats().l2Misses).toBe(1);
    });

    it('returns null when no LLM provider and L1 fails', async () => {
      const noLlmPipeline = new ChallengeEscalationPipeline();
      const answer = await noLlmPipeline.solve('unparseable');
      expect(answer).toBeNull();
      expect(noLlmPipeline.getStats().l2Misses).toBe(1);
    });
  });

  describe('escalateAfterRejection()', () => {
    it('calls L2 directly, skipping L1', async () => {
      const answer = await pipeline.escalateAfterRejection(
        'some challenge text',
        '10.00', // rejected L1 answer
      );
      expect(answer).toBe('40.00');
      expect(mockLLM.complete).toHaveBeenCalled();
      expect(pipeline.getStats().l2Hits).toBe(1);
    });

    it('returns null if L2 gives same answer as rejected L1', async () => {
      const sameLLM = createMockLLM('10.00');
      const samePipeline = new ChallengeEscalationPipeline(sameLLM);
      const answer = await samePipeline.escalateAfterRejection(
        'some challenge',
        '10.00',
      );
      expect(answer).toBeNull();
      expect(samePipeline.getStats().l2Misses).toBe(1);
    });

    it('returns null when LLM fails', async () => {
      const failPipeline = new ChallengeEscalationPipeline(createFailingLLM());
      const answer = await failPipeline.escalateAfterRejection('challenge', '10.00');
      expect(answer).toBeNull();
    });
  });

  describe('L3 logging', () => {
    it('logs challenges when L1 fails and L2 succeeds', async () => {
      await pipeline.solve('unparseable gibberish that needs LLM');
      const log = pipeline.getUnsolvedLog();
      expect(log.length).toBeGreaterThanOrEqual(1);
      const entry = log[0];
      expect(entry.challengeText).toContain('unparseable');
      expect(entry.l2Answer).toBe('40.00');
      expect(entry.timestamp).toBeGreaterThan(0);
    });

    it('logs rejected L1 answers with wasRejected=true', async () => {
      await pipeline.escalateAfterRejection('challenge text', '10.00');
      const log = pipeline.getUnsolvedLog();
      expect(log.length).toBe(1);
      expect(log[0].l1Answer).toBe('10.00');
      expect(log[0].wasRejected).toBe(true);
      expect(log[0].l2Answer).toBe('40.00');
    });

    it('bounds the log at MAX_UNSOLVED_LOG (200)', async () => {
      const noLlmPipeline = new ChallengeEscalationPipeline();
      for (let i = 0; i < 201; i++) {
        await noLlmPipeline.solve(`gibberish ${i}`);
      }
      expect(noLlmPipeline.getUnsolvedLog().length).toBeLessThanOrEqual(200);
    });
  });

  describe('stats tracking', () => {
    it('tracks L1 hits correctly', async () => {
      // Both inputs produce 2 numbers that don't compound with each other
      await pipeline.solve('seven times six');       // 7 * 6 = 42
      await pipeline.solve('forty divide ten');      // 40 / 10 = 4
      expect(pipeline.getStats().l1Hits).toBe(2);
      expect(pipeline.getStats().l2Hits).toBe(0);
    });

    it('tracks L2 hits correctly', async () => {
      await pipeline.solve('gibberish');
      expect(pipeline.getStats().l2Hits).toBe(1);
    });

    it('tracks log size in stats', async () => {
      await pipeline.escalateAfterRejection('challenge', '5.00');
      expect(pipeline.getStats().logSize).toBe(1);
    });
  });
});
