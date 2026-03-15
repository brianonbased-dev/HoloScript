/**
 * Scripting & Automation Traits
 *
 * Trait names for server-side scripting, CI/CD pipelines, daemon orchestration,
 * and general-purpose automation. Positions HoloScript as a composition language
 * beyond 3D/VR — same .hsplus format for workflows, cron jobs, and pipelines.
 *
 * Some traits are cross-listed from their original categories (behavior,
 * intelligence, analytics) because they serve dual purpose in both spatial
 * and scripting contexts.
 *
 * @version 1.0.0
 */
export const SCRIPTING_AUTOMATION_TRAITS = [
  // ─── Scheduling & Timing ───────────────────────────────────────────
  'cron',                // Timed execution (interval, cron patterns, jitter)
  'scheduler',           // Multi-job scheduler with named jobs

  // ─── Orchestration ─────────────────────────────────────────────────
  'pipeline',            // Sequential/parallel step orchestration
  'task_queue',          // Work queue with retry, priority, dead-letter

  // ─── I/O & Integration ─────────────────────────────────────────────
  'watcher',             // File/state/event watchers with debounce
  'webhook',             // HTTP trigger (inbound) and callback (outbound)
  'shell',               // Subprocess exec with timeout + output capture

  // ─── Resilience ────────────────────────────────────────────────────
  'retry',               // Exponential backoff with retry logic
  'circuit_breaker',     // Standalone circuit breaker (half-open, metrics)
  'rate_limiter',        // Token bucket / sliding window rate limiting
  'timeout_guard',       // Configurable operation timeout wrapper

  // ─── Data Flow ─────────────────────────────────────────────────────
  'transform',           // Map/filter/reduce event streams
  'buffer',              // Batch events by count or time window
  'structured_logger',   // Structured logging sink with levels + rotation
] as const;

export type ScriptingAutomationTraitName = (typeof SCRIPTING_AUTOMATION_TRAITS)[number];
