/**
 * FleetMetrics — Capacity-planning telemetry (distinct from UsageTracker billing).
 *
 * UsageTracker answers "how many tokens did key X spend" (billing). FleetMetrics
 * answers the questions the self-hosted-fleet decision depends on:
 *
 *   1. UTILIZATION CROSSOVER (plan O1): sustained tokens/hour → would a rented GPU
 *      stay busy enough (>~40-50%) that self-hosting beats per-token serverless?
 *   2. INSTANCE RIGHT-SIZING (founder: "larger instances for multiple users"):
 *      what is real *concurrency* (in-flight requests)? A single vLLM box serves
 *      many users via continuous batching — sizing depends on peak concurrency,
 *      not just total tokens.
 *
 * Lights-on instrumentation only. No GPU spend. Records per-request events into
 * rolling hourly buckets + a live concurrency gauge, and emits a structured log
 * line per request so the series is recoverable from Railway logs across restarts
 * (in-memory buckets are lost on restart; the log line is the durable record until
 * a persistent store is wired — see plan §7).
 *
 * Ref: ai-ecosystem/research/2026-05-31_self-hosted-fleet-inference-plan.md (Phase 0).
 */

import { logger } from '../utils/logger';

const HOUR_MS = 60 * 60 * 1000;
const DEFAULT_WINDOW_HOURS = 168; // 7 days — enough to read a weekly crossover

export interface FleetRequestHandle {
  startMs: number;
  /** Concurrency at the moment this request began (incl. itself). */
  concurrencyAtStart: number;
}

export interface HourBucket {
  /** Bucket start, ISO hour key e.g. "2026-05-31T17:00:00.000Z". */
  hour: string;
  requests: number;
  promptTokens: number;
  completionTokens: number;
  /** Highest simultaneous in-flight request count observed in this hour. */
  peakConcurrency: number;
  /** Sum of full-request latency, for averaging. */
  sumLatencyMs: number;
  /** Per-provider request counts (fireworks/together/ollama/fleet/...). */
  byProvider: Record<string, number>;
}

export interface FleetMetricsSnapshot {
  generatedAt: string;
  windowHours: number;
  /** Live in-flight request count right now. */
  activeConcurrency: number;
  peakConcurrencyAllTime: number;
  buckets: HourBucket[];
  derived: {
    totalRequests: number;
    totalTokens: number;
    /** Mean tokens/hour over hours that had ≥1 request (sustained, not diluted by idle). */
    avgTokensPerActiveHour: number;
    peakTokensPerHour: number;
    avgLatencyMs: number;
    /** Max peakConcurrency across all buckets — the sizing input. */
    peakConcurrency: number;
  };
}

function hourKey(ms: number): string {
  return new Date(Math.floor(ms / HOUR_MS) * HOUR_MS).toISOString();
}

export class FleetMetrics {
  private active = 0;
  private peakAllTime = 0;
  private buckets = new Map<string, HourBucket>();

  /** Call at request start. Increments the live concurrency gauge. */
  begin(): FleetRequestHandle {
    this.active += 1;
    if (this.active > this.peakAllTime) this.peakAllTime = this.active;

    const startMs = Date.now();
    const bucket = this.bucketFor(startMs);
    if (this.active > bucket.peakConcurrency) bucket.peakConcurrency = this.active;

    return { startMs, concurrencyAtStart: this.active };
  }

  /**
   * Call at request end (in a finally{} so disconnects/errors still decrement).
   * Records the completed request into its start-hour bucket and emits a log line.
   */
  end(
    handle: FleetRequestHandle,
    info: { provider: string; promptTokens: number; completionTokens: number; error?: boolean }
  ): void {
    if (this.active > 0) this.active -= 1;

    const endMs = Date.now();
    const latencyMs = endMs - handle.startMs;
    const bucket = this.bucketFor(handle.startMs);

    bucket.requests += 1;
    bucket.promptTokens += info.promptTokens;
    bucket.completionTokens += info.completionTokens;
    bucket.sumLatencyMs += latencyMs;
    bucket.byProvider[info.provider] = (bucket.byProvider[info.provider] ?? 0) + 1;

    // Durable-across-restart record (Railway retains logs; in-memory buckets don't).
    logger.info(
      `[fleet-metric] ${JSON.stringify({
        ts: new Date(endMs).toISOString(),
        provider: info.provider,
        promptTokens: info.promptTokens,
        completionTokens: info.completionTokens,
        latencyMs,
        concurrencyAtStart: handle.concurrencyAtStart,
        error: info.error ?? false,
      })}`
    );

    this.pruneOlderThanWindow(endMs);
  }

  snapshot(windowHours: number = DEFAULT_WINDOW_HOURS): FleetMetricsSnapshot {
    const cutoff = Date.now() - windowHours * HOUR_MS;
    const buckets = Array.from(this.buckets.values())
      .filter((b) => new Date(b.hour).getTime() >= cutoff)
      .sort((a, b) => a.hour.localeCompare(b.hour));

    let totalRequests = 0;
    let totalTokens = 0;
    let totalLatency = 0;
    let peakTokensPerHour = 0;
    let peakConcurrency = 0;
    for (const b of buckets) {
      totalRequests += b.requests;
      const bucketTokens = b.promptTokens + b.completionTokens;
      totalTokens += bucketTokens;
      totalLatency += b.sumLatencyMs;
      if (bucketTokens > peakTokensPerHour) peakTokensPerHour = bucketTokens;
      if (b.peakConcurrency > peakConcurrency) peakConcurrency = b.peakConcurrency;
    }
    const activeHours = buckets.filter((b) => b.requests > 0).length || 1;

    return {
      generatedAt: new Date().toISOString(),
      windowHours,
      activeConcurrency: this.active,
      peakConcurrencyAllTime: this.peakAllTime,
      buckets,
      derived: {
        totalRequests,
        totalTokens,
        avgTokensPerActiveHour: Math.round(totalTokens / activeHours),
        peakTokensPerHour,
        avgLatencyMs: totalRequests > 0 ? Math.round(totalLatency / totalRequests) : 0,
        peakConcurrency,
      },
    };
  }

  private bucketFor(ms: number): HourBucket {
    const key = hourKey(ms);
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = {
        hour: key,
        requests: 0,
        promptTokens: 0,
        completionTokens: 0,
        peakConcurrency: 0,
        sumLatencyMs: 0,
        byProvider: {},
      };
      this.buckets.set(key, bucket);
    }
    return bucket;
  }

  private pruneOlderThanWindow(nowMs: number): void {
    const cutoff = nowMs - DEFAULT_WINDOW_HOURS * HOUR_MS;
    for (const [key] of this.buckets) {
      if (new Date(key).getTime() < cutoff) this.buckets.delete(key);
    }
  }
}
