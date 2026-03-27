/**
 * Moltbook verification challenge solver.
 *
 * Three-level escalation pipeline:
 *   L1 (Regex Engine):  Deterministic, free (0 tokens), handles ~90% of challenges.
 *   L2 (LLM Fallback):  Fires when L1 fails or produces a rejected answer.
 *                        The LLM deciphers evolved obfuscation formats natively.
 *   L3 (Auto-Tune Log):  Every L2 invocation logs the raw challenge + correct answer
 *                        for future regex dictionary patches.
 *
 * The Moltbook anti-bot algorithm drifts every few weeks — new obfuscation wrinkles
 * (noise chars between doublings, reversed number words, Roman numerals, etc.).
 * This pipeline ensures the daemon never hits the 1-hour penalty box.
 */

// ── L3: Unsolved challenge log ──────────────────────────────────────────────

export interface UnsolvedChallenge {
  challengeText: string;
  cleanedText: string;
  l1Answer: string | null;
  l2Answer: string | null;
  wasRejected: boolean;
  timestamp: number;
}

// ── L1: Deterministic solver with fuzzy matching ─────────────────────────────

const WORD_TO_NUM: Record<string, number> = {
  zero: 0, one: 1, two: 2, thre: 3, four: 4,
  five: 5, fyive: 5, fift: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, twelv: 12, thirten: 13,
  fourten: 14, fiften: 15, sixten: 16, seventen: 17,
  eighten: 18, nineten: 19, tweny: 20, twenty: 20, thirty: 30,
  forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  hundred: 100, thousand: 1000,
};

// Operation keywords grouped by operator — longest first within each group.
const OPERATION_KEYWORDS: Array<{ op: string; words: string[] }> = [
  { op: '*', words: ['multiplied', 'multiply', 'product', 'triple', 'double', 'times'] },
  { op: '/', words: ['quotient', 'divided', 'divide', 'split', 'half'] },
  { op: '-', words: ['subtracted', 'subtract', 'diferent', 'diferenc', 'minus', 'reduc', 'lose', 'slow', 'les', 'los'] },
  { op: '+', words: ['combined', 'increas', 'faster', 'total', 'speed', 'added', 'aded', 'gain', 'plus', 'fast', 'sped', 'sum', 'ads', 'ad'] },
];

// Number words sorted longest-first for greedy matching.
const NUMBER_WORDS = Object.keys(WORD_TO_NUM).sort((a, b) => b.length - a.length);

/**
 * Fuzzy subsequence match: does `text[start..]` contain `pattern` as a
 * near-subsequence, allowing up to `maxSkip` consecutive noise characters
 * between each real character? Returns end index on success, -1 on failure.
 */
export function fuzzyMatch(text: string, start: number, pattern: string, maxSkip: number): number {
  let pi = 0;
  let si = start;
  let consecutiveSkips = 0;

  while (pi < pattern.length && si < text.length) {
    if (text[si] === pattern[pi]) {
      pi++;
      si++;
      consecutiveSkips = 0;
    } else {
      consecutiveSkips++;
      if (consecutiveSkips > maxSkip) return -1;
      si++;
    }
  }

  return pi === pattern.length ? si : -1;
}

/**
 * Scan `text` for number words using fuzzy matching (allows noise chars).
 * Returns array of { word, value, end } sorted by position.
 */
function fuzzyFindNumbers(text: string, maxSkip: number): Array<{ word: string; value: number; end: number }> {
  const results: Array<{ word: string; value: number; start: number; end: number }> = [];
  let pos = 0;

  while (pos < text.length) {
    // Try digit run first
    const digitMatch = text.slice(pos).match(/^(\d+(?:\.\d+)?)/);
    if (digitMatch) {
      results.push({ word: digitMatch[1], value: parseFloat(digitMatch[1]), start: pos, end: pos + digitMatch[1].length });
      pos += digitMatch[1].length;
      continue;
    }

    // Try each number word (longest first) with fuzzy matching
    let bestMatch: { word: string; value: number; start: number; end: number } | null = null;
    for (const word of NUMBER_WORDS) {
      // Skip words shorter than best match (we want longest)
      if (bestMatch && word.length <= bestMatch.word.length) continue;
      const end = fuzzyMatch(text, pos, word, maxSkip);
      if (end !== -1) {
        bestMatch = { word, value: WORD_TO_NUM[word], start: pos, end };
      }
    }

    if (bestMatch) {
      results.push(bestMatch);
      pos = bestMatch.end;
    } else {
      pos++;
    }
  }

  return results;
}

/**
 * Compound number assembly (e.g. [20, 5] → [25], [3, 100, 40, 2] → [342]).
 */
function compoundNumbers(rawValues: number[]): number[] {
  const numbers: number[] = [];
  for (let i = 0; i < rawValues.length; i++) {
    const val = rawValues[i];
    if (val >= 20 && val <= 90 && val % 10 === 0 && i + 1 < rawValues.length && rawValues[i + 1] < 10) {
      numbers.push(val + rawValues[i + 1]);
      i++;
    } else if (val === 100 && numbers.length > 0) {
      const prev = numbers.pop()!;
      let compound = prev * 100;
      if (i + 1 < rawValues.length && rawValues[i + 1] < 100) {
        compound += rawValues[i + 1];
        i++;
        if (i + 1 < rawValues.length && rawValues[i] >= 20 && rawValues[i + 1] < 10) {
          compound += rawValues[i + 1];
          i++;
        }
      }
      numbers.push(compound);
    } else {
      numbers.push(val);
    }
  }
  return numbers;
}

/** Token with position in cleaned string */
interface PosToken { value: number; start: number; end: number }

/**
 * Extract number tokens with positions using exact regex.
 */
function exactExtractNumbers(s: string): PosToken[] {
  const numbersRegex = /(seventen|thirten|fourten|eighten|nineten|fiften|sixten|twelve|eleven|twenty|thirty|seventy|eighty|ninety|hundred|thousand|tweny|twelv|forty|fifty|sixty|fyive|thre|four|five|fift|nine|eight|seven|zero|one|two|six|ten|\d+)/g;
  const tokens: PosToken[] = [];
  let match;
  while ((match = numbersRegex.exec(s)) !== null) {
    const word = match[1];
    tokens.push({
      value: /\d/.test(word) ? parseFloat(word) : WORD_TO_NUM[word],
      start: match.index,
      end: match.index + word.length,
    });
  }
  return tokens;
}

/**
 * Find operation keyword position in the cleaned string.
 * Returns the position (start index) or -1 if not found.
 */
function findOperationWithPos(s: string, maxSkip: number): { op: string; pos: number } | null {
  // Exact match first (fast)
  for (const { op, words } of OPERATION_KEYWORDS) {
    for (const kw of words) {
      const idx = s.indexOf(kw);
      if (idx !== -1) return { op, pos: idx };
    }
  }
  // Fuzzy match fallback
  for (const { op, words } of OPERATION_KEYWORDS) {
    for (const kw of words) {
      for (let i = 0; i <= s.length - kw.length; i++) {
        const end = fuzzyMatch(s, i, kw, maxSkip);
        if (end !== -1) return { op, pos: i };
      }
    }
  }
  return null;
}

/**
 * Position-aware compounding: only compound numbers on the same side of the
 * operation. This prevents "twenty [times] five" from compounding to 25.
 */
function compoundWithSplit(
  tokens: PosToken[],
  opPos: number,
): [number[], number[]] {
  const before: number[] = [];
  const after: number[] = [];

  for (const t of tokens) {
    if (t.end <= opPos) before.push(t.value);
    else if (t.start >= opPos) after.push(t.value);
  }

  return [compoundNumbers(before), compoundNumbers(after)];
}

export function solveChallenge(challengeText: string): string | null {
  // 1. Strip ALL non-alphanumeric (dots too — they're obfuscation noise, not decimals).
  let s = challengeText.toLowerCase().replace(/[^a-z0-9]/g, '');

  // 2. Collapse runs of duplicate letters (e.g., "tWwEeNnTtYy" → "twenty")
  s = s.replace(/([a-z])\1+/g, '$1');

  // 3. Find operation (with position) — needed to prevent cross-operation compounding
  const opResult = findOperationWithPos(s, 2);
  if (!opResult) return null;

  const { op: operation, pos: opPos } = opResult;

  // ── Pass 1: Exact regex number extraction ──
  const numTokens = exactExtractNumbers(s);
  let [beforeNums, afterNums] = compoundWithSplit(numTokens, opPos);

  // ── Pass 2: Fuzzy matching if exact didn't find enough numbers ──
  if (beforeNums.length < 1 || afterNums.length < 1) {
    const fuzzyResults = fuzzyFindNumbers(s, 2);
    const fuzzyTokens: PosToken[] = fuzzyResults.map(r => ({
      value: r.value,
      start: r.end - 1,  // approximate position
      end: r.end,
    }));
    // Merge exact + fuzzy, deduplicate by position overlap
    const merged = [...numTokens];
    for (const ft of fuzzyTokens) {
      const overlaps = merged.some(
        et => ft.end > et.start && ft.start < et.end,
      );
      if (!overlaps) merged.push(ft);
    }
    merged.sort((a, b) => a.start - b.start);
    [beforeNums, afterNums] = compoundWithSplit(merged, opPos);
  }

  // Fallback: when position-aware split can't place numbers on both sides
  // (e.g., "the total of 10 and 5" where the op is prefix, or fuzzy op
  // position bleeds into a number token), use exact tokens without position.
  if (beforeNums.length < 1 || afterNums.length < 1) {
    const allValues = compoundNumbers(numTokens.map(t => t.value));
    if (allValues.length < 2) return null;
    beforeNums = [allValues[0]];
    afterNums = [allValues[allValues.length - 1]];
  }

  const a = beforeNums[beforeNums.length - 1]; // last number before op
  const b = afterNums[0];                       // first number after op
  let result: number;

  switch (operation) {
    case '+': result = a + b; break;
    case '-': result = a - b; break;
    case '*': result = a * b; break;
    case '/': if (b === 0) return null; result = a / b; break;
    default: return null;
  }

  return result.toFixed(2);
}

// ── L2: LLM-powered solver ─────────────────────────────────────────────────

/** Minimal LLM interface — matches the LLMProvider from llm-content-generator */
export interface ChallengeLLMProvider {
  complete(
    request: { messages: Array<{ role: string; content: string }> },
    model?: string,
  ): Promise<{ content: string }>;
}

const CHALLENGE_SOLVER_PROMPT = `You are a math problem decoder for an anti-bot verification system.

The text below is an obfuscated math word problem. The obfuscation techniques include:
- Random capitalization (lObStEr → lobster)
- Special characters scattered inside words (tW/eNtY → twenty)
- Doubled or tripled letters (tWwEeNnTtYy → twenty)
- Noise characters inserted between real letters
- Numbers spelled out as words (may be compound like "thirty two" = 32)
- Possible Roman numerals or reversed words in newer versions

Your task:
1. Decode the obfuscated sentence to plain English
2. Identify the two numbers mentioned
3. Identify the math operation (add/subtract/multiply/divide)
4. Compute the result

Respond with ONLY the numerical answer formatted to exactly 2 decimal places.
Example: 40.00

Do NOT include any explanation, units, or other text. Just the number.`;

async function solveWithLLM(
  challengeText: string,
  llm: ChallengeLLMProvider,
): Promise<string | null> {
  try {
    const result = await llm.complete({
      messages: [
        { role: 'system', content: CHALLENGE_SOLVER_PROMPT },
        { role: 'user', content: challengeText },
      ],
    });

    const raw = result.content.trim();
    // Extract the number from LLM response (may include stray text)
    const numMatch = raw.match(/(-?\d+(?:\.\d+)?)/);
    if (!numMatch) return null;

    const value = parseFloat(numMatch[1]);
    if (isNaN(value)) return null;

    return value.toFixed(2);
  } catch (err) {
    console.warn('[moltbook-solver] L2 LLM fallback failed:', err);
    return null;
  }
}

// ── Escalation Pipeline ─────────────────────────────────────────────────────

const MAX_UNSOLVED_LOG = 200;

export class ChallengeEscalationPipeline {
  private llmProvider: ChallengeLLMProvider | null;
  private unsolvedLog: UnsolvedChallenge[] = [];
  private l1Hits = 0;
  private l2Hits = 0;
  private l2Misses = 0;

  constructor(llmProvider?: ChallengeLLMProvider) {
    this.llmProvider = llmProvider ?? null;
  }

  /**
   * Solve a challenge using L1 (regex) first, escalating to L2 (LLM) if needed.
   * Returns the answer string (e.g. "40.00") or null if both levels fail.
   */
  async solve(challengeText: string): Promise<string | null> {
    // L1: Deterministic regex — free, instant
    const l1Answer = solveChallenge(challengeText);
    if (l1Answer) {
      this.l1Hits++;
      return l1Answer;
    }

    // L2: LLM fallback
    return this.escalateToLLM(challengeText, null);
  }

  /**
   * Called when L1 produced an answer but it was rejected by the API.
   * Skips L1 entirely and goes straight to L2.
   */
  async escalateAfterRejection(challengeText: string, rejectedAnswer: string): Promise<string | null> {
    return this.escalateToLLM(challengeText, rejectedAnswer);
  }

  /** Get all logged unsolved/escalated challenges for L3 analysis. */
  getUnsolvedLog(): UnsolvedChallenge[] {
    return [...this.unsolvedLog];
  }

  /** Get pipeline hit/miss stats. */
  getStats(): { l1Hits: number; l2Hits: number; l2Misses: number; logSize: number } {
    return {
      l1Hits: this.l1Hits,
      l2Hits: this.l2Hits,
      l2Misses: this.l2Misses,
      logSize: this.unsolvedLog.length,
    };
  }

  private async escalateToLLM(
    challengeText: string,
    rejectedL1Answer: string | null,
  ): Promise<string | null> {
    if (!this.llmProvider) {
      this.logChallenge(challengeText, rejectedL1Answer, null, rejectedL1Answer !== null);
      this.l2Misses++;
      return null;
    }

    const l2Answer = await solveWithLLM(challengeText, this.llmProvider);

    // Don't return the same answer that was already rejected
    if (l2Answer && l2Answer === rejectedL1Answer) {
      this.logChallenge(challengeText, rejectedL1Answer, l2Answer, true);
      this.l2Misses++;
      return null;
    }

    if (l2Answer) {
      this.l2Hits++;
      // L3: Log for future regex improvement
      this.logChallenge(challengeText, rejectedL1Answer, l2Answer, rejectedL1Answer !== null);
      return l2Answer;
    }

    this.l2Misses++;
    this.logChallenge(challengeText, rejectedL1Answer, null, rejectedL1Answer !== null);
    return null;
  }

  private logChallenge(
    challengeText: string,
    l1Answer: string | null,
    l2Answer: string | null,
    wasRejected: boolean,
  ): void {
    const cleaned = challengeText
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .replace(/([a-z])\1+/g, '$1');

    this.unsolvedLog.push({
      challengeText,
      cleanedText: cleaned,
      l1Answer,
      l2Answer,
      wasRejected,
      timestamp: Date.now(),
    });

    // Bound the log
    if (this.unsolvedLog.length > MAX_UNSOLVED_LOG) {
      this.unsolvedLog = this.unsolvedLog.slice(-MAX_UNSOLVED_LOG);
    }

    console.log(
      `[moltbook-solver] L3 logged: L1=${l1Answer ?? 'null'}, L2=${l2Answer ?? 'null'}, rejected=${wasRejected}`,
    );
  }
}
