/**
 * Brittney fleet metrics — Phase-0 capacity telemetry for the self-hosted-fleet
 * decision, at the Studio chat entry point (the primary interactive path,
 * `app/api/brittney/route.ts`, which defaults to Anthropic).
 *
 * Cross-process by design: Studio, llm-service, and mcp-server run as separate
 * processes, so an in-memory aggregate can't span them. The DURABLE, aggregatable
 * signal is a uniform `[fleet-metric]` JSON log line emitted at every inference
 * entry point — collect from logs offline to get system-wide volume + concurrency.
 * (Format matches services/llm-service/src/services/FleetMetrics.ts.)
 *
 * The module-level gauge gives per-process live concurrency; the log line gives
 * the durable cross-process series.
 *
 * Ref: ai-ecosystem/research/2026-05-31_self-hosted-fleet-inference-plan.md (Phase 0).
 */

export interface BrittneyMetricHandle {
  startMs: number;
  concurrencyAtStart: number;
}

let active = 0;

/** Rough token estimate (1 token ≈ 4 chars) — matches UsageTracker. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Call at the start of an inference turn. Increments the live concurrency gauge. */
export function beginBrittneyMetric(): BrittneyMetricHandle {
  active += 1;
  return { startMs: Date.now(), concurrencyAtStart: active };
}

/**
 * Call when the turn completes (in a finally{} so disconnects/errors still
 * decrement). Emits one `[fleet-metric]` JSON line.
 */
export function endBrittneyMetric(
  handle: BrittneyMetricHandle,
  info: { source: string; provider: string; promptTokens: number; completionTokens: number; error?: boolean }
): void {
  if (active > 0) active -= 1;
  const latencyMs = Date.now() - handle.startMs;
  // eslint-disable-next-line no-console -- intentional structured telemetry line
  console.info(
    `[fleet-metric] ${JSON.stringify({
      ts: new Date().toISOString(),
      source: info.source,
      provider: info.provider,
      promptTokens: info.promptTokens,
      completionTokens: info.completionTokens,
      latencyMs,
      concurrencyAtStart: handle.concurrencyAtStart,
      error: info.error ?? false,
    })}`
  );
}

/** Live in-flight Brittney turns in THIS process (per-process gauge). */
export function activeBrittneyConcurrency(): number {
  return active;
}
