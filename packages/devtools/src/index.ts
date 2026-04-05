/**
 * @holoscript/devtools
 *
 * Developer tools and infrastructure subsystems extracted from @holoscript/core.
 * Each subsystem below will be populated as code is migrated from core.
 *
 * A.011.05a: circuit-breaker, ratelimit, telemetry
 * A.011.05b: monitoring, profiling, performance
 * A.011.05c: debug, logging, audit
 * A.011.05d: security, resilience, recovery
 * A.011.05e: migration, deploy, build, testing
 *
 * @packageDocumentation
 */

// ── A.011.05a: Circuit Breaker, Rate Limiting, Telemetry ─────────────
export * as CircuitBreaker from './circuit-breaker';
export * as RateLimit from './ratelimit';
export * as Telemetry from './telemetry';

// ── A.011.05b: Monitoring, Profiling, Performance ────────────────────
export * as Monitoring from './monitoring';
export * as Profiling from './profiling';
export * as Performance from './performance';

// ── A.011.05c: Debug, Logging, Audit ─────────────────────────────────
export * as Debug from './debug';
export * as Logging from './logging';
export * as Audit from './audit';

// ── A.011.05d: Security, Resilience, Recovery ────────────────────────
export * as Security from './security';
export * as Resilience from './resilience';
export * as Recovery from './recovery';

// ── A.011.05e: Migration, Deploy, Build, Testing ─────────────────────
export * as Migration from './migration';
export * as Deploy from './deploy';
export * as Build from './build';
export * as Testing from './testing';

/**
 * All devtools subsystem names for runtime discovery.
 */
export const DEVTOOLS_SUBSYSTEMS = [
  'circuit-breaker',
  'ratelimit',
  'telemetry',
  'monitoring',
  'profiling',
  'performance',
  'debug',
  'logging',
  'audit',
  'security',
  'resilience',
  'recovery',
  'migration',
  'deploy',
  'build',
  'testing',
] as const;

export type DevtoolsSubsystem = (typeof DEVTOOLS_SUBSYSTEMS)[number];
