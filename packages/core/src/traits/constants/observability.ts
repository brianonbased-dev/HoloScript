/**
 * Observability Traits (Infrastructure-Level)
 *
 * Extends the existing analytics-observability category with infrastructure
 * alerting, health probes, SLO tracking, log aggregation, profiling, and
 * incident management. These are server/daemon-oriented traits that complement
 * the scene-level analytics traits.
 *
 * @version 1.0.0
 */
export const OBSERVABILITY_TRAITS = [
  // ─── Alerting ─────────────────────────────────────────────────────
  'alert',           // Threshold-based alerting with severity + cooldown
  'incident',        // Incident lifecycle (open → acknowledged → resolved)

  // ─── Health ───────────────────────────────────────────────────────
  'healthcheck',     // Liveness / readiness probes with configurable checks

  // ─── Performance ──────────────────────────────────────────────────
  'profiler',        // CPU / memory / timing profiler with snapshots
  'slo_monitor',     // SLO error budget tracking (latency, availability)

  // ─── Logging ──────────────────────────────────────────────────────
  'log_aggregator',  // Multi-source log collection, filtering, and routing
] as const;

export type ObservabilityTraitName = (typeof OBSERVABILITY_TRAITS)[number];
