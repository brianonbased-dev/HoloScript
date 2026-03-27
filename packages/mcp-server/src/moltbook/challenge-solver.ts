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

// ── L1: Deterministic regex solver ──────────────────────────────────────────

const WORD_TO_NUM: Record<string, number> = {
  zero: 0, one: 1, two: 2, thre: 3, four: 4,
  five: 5, fyive: 5, fift: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, twelv: 12, thirten: 13,
  fourten: 14, fiften: 15, sixten: 16, seventen: 17,
  eighten: 18, nineten: 19, tweny: 20, twenty: 20, thirty: 30,
  forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  hundred: 100, thousand: 1000
};

export function solveChallenge(challengeText: string): string | null {
  // 1. Strip all non-alphanumeric except the decimal point.
  // The Zalgo obfuscation scatters punctuation (/, -, ^, ~) INSIDE words (e.g. tW/eNtY).
  let s = challengeText.toLowerCase().replace(/[^a-z0-9.]/g, '');

  // 2. Collapse runs of duplicate letters (e.g., "tWwEe" -> "twe")
  s = s.replace(/([a-z])\1+/g, '$1');

  // Match numbers (longest first to prevent "eighten" matching "eight")
  const numbersRegex = /(seventen|thirten|fourten|eighten|nineten|fiften|sixten|twelve|eleven|twenty|thirty|seventy|eighty|ninety|hundred|thousand|tweny|twelv|forty|fifty|sixty|fyive|thre|four|five|fift|nine|eight|seven|zero|one|two|six|ten|\d+(?:\.\d+)?)/g;

  const numTokens: string[] = [];
  let match;
  while ((match = numbersRegex.exec(s)) !== null) {
    numTokens.push(match[1]);
  }

  const rawValues: number[] = [];
  for (const t of numTokens) {
    if (/\d/.test(t)) {
      rawValues.push(parseFloat(t));
    } else {
      rawValues.push(WORD_TO_NUM[t]);
    }
  }

  // Compound parsing (e.g. 20, 5 -> 25)
  const numbers: number[] = [];
  for (let i = 0; i < rawValues.length; i++) {
    const val = rawValues[i];
    if (val >= 20 && val <= 90 && i + 1 < rawValues.length && rawValues[i+1] < 10) {
      numbers.push(val + rawValues[i+1]);
      i++;
    } else if (val === 100 && numbers.length > 0) {
      const prev = numbers.pop()!;
      let compound = prev * 100;
      if (i + 1 < rawValues.length && rawValues[i+1] < 100) {
        compound += rawValues[i+1];
        i++;
        if (i + 1 < rawValues.length && rawValues[i] >= 20 && rawValues[i+1] < 10) {
          compound += rawValues[i+1];
          i++;
        }
      }
      numbers.push(compound);
    } else {
      numbers.push(val);
    }
  }

  if (numbers.length < 2) {
    return null;
  }

  // 3. Find operation
  let operation: string | null = null;
  if (s.match(/times|multiply|double|triple|\*/)) operation = '*';
  else if (s.match(/divide|split|half|\//)) operation = '/';
  else if (s.match(/subtract|minus|lose|los|les|slow|\-/)) operation = '-';
  else if (s.match(/ads|plus|gain|increas|faster|fast|sped|speed|\+/)) operation = '+';
  else if (s.match(/total/)) operation = '+';

  const [a, b] = numbers;
  let result: number;

  switch (operation) {
    case '+': result = a + b; break;
    case '-': result = a - b; break;
    case '*': result = a * b; break;
    case '/': if (b === 0) return null; result = a / b; break;
    default: result = a + b;
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
      .replace(/[^a-z0-9.]/g, '')
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
