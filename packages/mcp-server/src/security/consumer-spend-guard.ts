/**
 * Global (cross-IP) daily spend guard for the anonymous consumer generation
 * tier (POST /api/public/generate, see http-server.ts).
 *
 * GAP this closes: `checkConsumerGenDailyQuota` (http-server.ts) bounds cost
 * PER IP (20 generations/day/IP by default), but has no aggregate ceiling.
 * generate_scene / generate_world_from_prompt eventually reach
 * tryGenerateWithAI() (generators.ts) -> createProviderManager()
 * (llm-provider/src/index.ts), which can fall through to a REAL PAID frontier
 * LLM call (Anthropic/OpenAI/Gemini) when sovereign providers (Brittney
 * Cloud / local-llm / bitnet) are unavailable. Without a global cap, N
 * distinct anonymous IPs each exhausting their own per-IP quota multiply
 * into unbounded aggregate spend (e.g. 10,000 IPs * 20/day = 200,000 paid
 * calls/day with zero ceiling).
 *
 * This module adds one SHARED (non-per-IP) rolling-24h call-count bucket,
 * checked in addition to (never instead of) the per-IP quota.
 *
 * Deliberately call-count based, not token/dollar based: parsing per-call
 * cost accurately across ~6 different LLM providers (each with its own
 * usage/billing response shape) is fragile and easy to silently drift wrong.
 * A conservative fixed call-count ceiling is simple, provider-agnostic, and
 * fails safe even if a provider's response shape changes.
 */

// Default cap arithmetic (comment only -- NOT a re-declaration of ecosystem
// spend policy): 200 calls/day * ~$0.05/call (conservative worst-case
// estimate for a single frontier-LLM scene/world generation call) ~= $10/day.
// That leaves wide headroom under the ecosystem's existing $100/day
// founder-doctrine GPU-fleet/wallet spend ceiling (see ai-ecosystem
// NORTH_STAR §0 / CLAUDE.md autonomy doctrine) -- this module does not own
// or redefine that ceiling, it just keeps this one anonymous surface a small
// fraction of it.
const DEFAULT_GLOBAL_DAILY_CALL_CAP = 200;
const GLOBAL_WINDOW_MS = 24 * 60 * 60 * 1000;

interface SpendBucket {
  count: number;
  resetAt: number;
}

let globalBucket: SpendBucket | null = null;

function capValue(): number {
  const n = parseInt(process.env.HOLOSCRIPT_CONSUMER_GLOBAL_DAILY_CALL_CAP || '', 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_GLOBAL_DAILY_CALL_CAP;
}

function getOrResetBucket(now: number): SpendBucket {
  if (!globalBucket || globalBucket.resetAt <= now) {
    globalBucket = { count: 0, resetAt: now + GLOBAL_WINDOW_MS };
  }
  return globalBucket;
}

/**
 * Pure check against the shared global daily call-count budget. Does NOT
 * increment the counter -- this can be called any number of times (e.g. for
 * logging/telemetry) without itself consuming budget. Call
 * `recordConsumerGeneration()` separately, and only after a generation has
 * actually succeeded.
 *
 * Fail-closed contract: this function is pure in-memory arithmetic and
 * should never throw, but callers (e.g. the HTTP handler in http-server.ts)
 * MUST treat any thrown error from this function as `allowed: false`, never
 * as `allowed: true`. An availability bug in this guard must not become an
 * unbounded-spend outage.
 */
export function checkConsumerGlobalSpendCap(): {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  capValue: number;
} {
  const cap = capValue();
  const now = Date.now();
  const bucket = getOrResetBucket(now);
  const remaining = Math.max(0, cap - bucket.count);
  return {
    allowed: bucket.count < cap,
    remaining,
    resetAt: bucket.resetAt,
    capValue: cap,
  };
}

/**
 * Increments the shared global daily call-count bucket. Call this ONLY after
 * a real successful generation (gate passed, content policy passed,
 * structural validation passed, scene stored) -- never on a denial, a
 * content-policy block, or a structural-validation failure, so budget is
 * spent only on genuine successful generations.
 */
export function recordConsumerGeneration(): void {
  const now = Date.now();
  const bucket = getOrResetBucket(now);
  bucket.count++;
}

/**
 * Test-only reset helper. Clears the in-memory bucket so tests don't leak
 * state between files/runs.
 */
export function __resetConsumerSpendGuardForTests(): void {
  globalBucket = null;
}
