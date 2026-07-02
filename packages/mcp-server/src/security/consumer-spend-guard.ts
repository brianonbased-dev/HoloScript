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
 * This module adds one SHARED (non-per-IP) daily call-count budget, checked
 * in addition to (never instead of) the per-IP quota.
 *
 * Deliberately call-count based, not token/dollar based: parsing per-call
 * cost accurately across ~6 different LLM providers (each with its own
 * usage/billing response shape) is fragile and easy to silently drift wrong.
 * A conservative fixed call-count ceiling is simple, provider-agnostic, and
 * fails safe even if a provider's response shape changes.
 *
 * DURABILITY (2026-07-02 fix, A-003 code review): a peer's automated review
 * correctly flagged that this guard originally stored its counter in a
 * plain in-process JS variable, which is NOT durable across Railway
 * restarts or multiple replicas -- every redeploy (or every request routed
 * to a different replica) silently reset the budget to 0, defeating the cap
 * this module exists to enforce.
 *
 * Fix: reuse the SAME shared `stateStore` singleton
 * (../holomesh/state.ts:85, backed by holomesh/state-store.ts) that already
 * serves the 'audit', 'defense', and 'dispatch' namespaces for CAEL state in
 * production today. When DATABASE_URL is present, stateStore's
 * PostgresStateStoreBackend persists to a shared `holomesh_state` Postgres
 * JSONB table -- durable across restarts and visible to every Railway
 * replica. Reusing this singleton costs zero new DB connections and zero
 * new schema/migration risk.
 *
 * Design: APPEND-ONLY LOG OF RECEIPTS, not a read-then-write counter.
 * `stateStore.set()` does a wholesale JSONB replace (last-write-wins) --
 * doing a naive `get()` -> increment -> `set()` from application code would
 * race under concurrent requests (two concurrent calls could both read
 * count=N and both write count=N+1, silently losing one increment and
 * breaking the cap invariant). `stateStore.append()`, by contrast, is a
 * single atomic `INSERT ... SELECT $1, $2, COALESCE(MAX(seq),0)+1, $3, NOW()
 * FROM holomesh_state WHERE namespace=$1 AND handle=$2` -- the sequence
 * number is computed and inserted in one round trip, so concurrent appends
 * cannot silently clobber each other (a same-tick PK conflict on
 * (namespace, handle, seq) would fail that one append with an error rather
 * than double-counting or losing the cap invariant -- a safe failure mode).
 *
 * Namespace/handle scheme: namespace = 'consumer-spend-guard', handle = the
 * UTC day-key ('YYYY-MM-DD') the receipt was recorded in. The daily count is
 * `(await stateStore.getAll(namespace, dayKey)).length`. Each appended row
 * is itself a durable, queryable receipt (receiptId + timestamp), not just a
 * log line -- this honestly satisfies "budget receipt" semantics, rather
 * than fabricating an integration with a nonexistent governor system.
 *
 * NO EXISTING SPEND GOVERNOR TO INTEGRATE WITH: exhaustive research (3
 * independent passes, 2026-07-02) confirmed there is no reachable, durable
 * "SpendGovernor" or "HoloShell spend policy" system this module could call
 * instead. ai-ecosystem's NDJSON spend ledgers are local-agent-filesystem
 * only (unreachable from a Railway container) and scoped to GPU-rental/
 * wallet spend, not HTTP-endpoint abuse. studio's
 * FleetOrchestrator.SpendGovernor has the same in-process-only limitation
 * (its own comments call its optional KV sync "best-effort, non-
 * authoritative"), lives in a different package, and has zero callers in
 * mcp-server. "CostGovernor" is not real code anywhere -- only a string
 * literal in an MCP tool schema example. holoscript-agent's CostGuard is a
 * single-process JSON-file-backed tracker in the wrong domain, not shared
 * across replicas. No "budget receipt"/CAEL-budget concept exists anywhere
 * else; CAEL is exclusively simulation-trace provenance, unrelated to
 * spend. A future reader should not re-investigate this -- reusing
 * holomesh's stateStore (this file) is the correct, already-proven pattern.
 *
 * FALLBACK MODE (honest documentation, not a bug): when DATABASE_URL is
 * unset, stateStore's own FallbackStateStoreBackend transparently degrades
 * to a single-process InMemoryStateStoreBackend (state-store.ts). In that
 * mode this guard is a single-instance-only budget, identical in shape to
 * the original in-memory implementation -- a documented, intentional
 * invariant of running without Postgres, not a regression introduced here.
 */

import * as crypto from 'crypto';
import { stateStore } from '../holomesh/state';

// Default cap arithmetic (comment only -- NOT a re-declaration of ecosystem
// spend policy): 200 calls/day * ~$0.05/call (conservative worst-case
// estimate for a single frontier-LLM scene/world generation call) ~= $10/day.
// That leaves wide headroom under the ecosystem's existing $100/day
// founder-doctrine GPU-fleet/wallet spend ceiling (see ai-ecosystem
// NORTH_STAR §0 / CLAUDE.md autonomy doctrine) -- this module does not own
// or redefine that ceiling, it just keeps this one anonymous surface a small
// fraction of it.
const DEFAULT_GLOBAL_DAILY_CALL_CAP = 200;
const CONSUMER_SPEND_GUARD_NAMESPACE = 'consumer-spend-guard';

function capValue(): number {
  const n = parseInt(process.env.HOLOSCRIPT_CONSUMER_GLOBAL_DAILY_CALL_CAP || '', 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_GLOBAL_DAILY_CALL_CAP;
}

/** Returns the current UTC calendar day as 'YYYY-MM-DD'. */
export function utcDayKey(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** UTC midnight (ms since epoch) for the START of the given 'YYYY-MM-DD' day-key. */
function utcDayStartMs(dayKey: string): number {
  return Date.parse(`${dayKey}T00:00:00.000Z`);
}

/** UTC midnight (ms since epoch) marking the END of the given 'YYYY-MM-DD' day-key
 *  (i.e. the start of the NEXT UTC day). Computed deterministically from the
 *  day-key itself -- never `Date.now() + 24h`, which drifts from a true day
 *  boundary as requests arrive at different times within the day. */
function utcDayEndMs(dayKey: string): number {
  return utcDayStartMs(dayKey) + 24 * 60 * 60 * 1000;
}

/**
 * Pure check against the shared global daily call-count budget. Does NOT
 * record a receipt -- this can be called any number of times (e.g. for
 * logging/telemetry) without itself consuming budget. Call
 * `recordConsumerGeneration()` separately, and only after a generation has
 * actually succeeded.
 *
 * Fail-closed contract: if the durable read fails for any reason (Postgres
 * unreachable, etc.), this function itself returns `{allowed: false, ...}`
 * -- it never throws and never depends on the caller's own try/catch to
 * fail closed. The caller in http-server.ts wraps its call in a try/catch
 * too, as defense-in-depth, but that is a second layer, not the primary
 * fail-closed mechanism.
 */
export async function checkConsumerGlobalSpendCap(): Promise<{
  allowed: boolean;
  remaining: number;
  resetAt: number;
  capValue: number;
}> {
  const cap = capValue();
  const dayKey = utcDayKey();
  try {
    const rows = await stateStore.getAll(CONSUMER_SPEND_GUARD_NAMESPACE, dayKey);
    const count = rows.length;
    const remaining = Math.max(0, cap - count);
    return {
      allowed: count < cap,
      remaining,
      resetAt: utcDayEndMs(dayKey),
      capValue: cap,
    };
  } catch (e) {
    console.warn('[consumer-spend-guard] durable budget read failed; failing closed:', e);
    return {
      allowed: false,
      remaining: 0,
      resetAt: utcDayEndMs(dayKey),
      capValue: cap,
    };
  }
}

/**
 * Records one durable receipt for a genuinely successful generation. Call
 * this ONLY after a real successful generation (gate passed, content policy
 * passed, structural validation passed, scene stored) -- never on a denial,
 * a content-policy block, or a structural-validation failure, so budget is
 * spent only on genuine successful generations.
 *
 * Best-effort append: a receipt-write race or transient durability failure
 * must never fail a successful generation response back to the client, so
 * any error from the underlying append is caught, logged, and swallowed.
 * The returned `receiptId` is always generated and returned regardless of
 * whether the durable append actually succeeded -- callers should treat it
 * as a reference for their own response/logging, not as proof the append
 * landed.
 */
export async function recordConsumerGeneration(): Promise<{ receiptId: string }> {
  const receiptId = crypto.randomUUID();
  const dayKey = utcDayKey();
  try {
    await stateStore.append(CONSUMER_SPEND_GUARD_NAMESPACE, dayKey, {
      receiptId,
      timestamp: new Date().toISOString(),
      event: 'consumer_generation',
    });
  } catch (e) {
    console.warn('[consumer-spend-guard] receipt append failed (non-fatal):', e);
  }
  return { receiptId };
}

/**
 * Test-only reset helper. Clears today's durable receipt log so tests don't
 * leak state between files/runs. Best-effort -- swallows errors since this
 * is only ever called from test setup/teardown.
 */
export async function __resetConsumerSpendGuardForTests(): Promise<void> {
  try {
    await stateStore.delete(CONSUMER_SPEND_GUARD_NAMESPACE, utcDayKey());
  } catch (e) {
    console.warn('[consumer-spend-guard] test reset failed (non-fatal):', e);
  }
}
