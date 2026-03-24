/**
 * v6 Universal Service & Backend Trait Constants
 *
 * Trait name constants for the universal semantic platform extension.
 * These traits enable HoloScript to describe backend services, data layers,
 * networking, pipelines, observability, and deployment infrastructure.
 */

// ── Service Traits ─────────────────────────────────────────────────────────────
export const UNIVERSAL_SERVICE_TRAITS = [
  'service',
  'endpoint',
  'route',
  'handler',
  'middleware',
] as const;

// ── Contract & Schema Traits ───────────────────────────────────────────────────
export const UNIVERSAL_CONTRACT_TRAITS = [
  'contract',
  'schema',
  'validator',
  'serializer',
] as const;

// ── Data Access Traits ─────────────────────────────────────────────────────────
export const UNIVERSAL_DATA_TRAITS = [
  'db',
  'model',
  'query',
  'migration',
  'cache',
] as const;

// ── Network Protocol Traits ────────────────────────────────────────────────────
export const UNIVERSAL_NETWORK_TRAITS = [
  'http',
  'websocket',
  'grpc',
  'graphql',
] as const;

// ── Pipeline & Messaging Traits ────────────────────────────────────────────────
export const UNIVERSAL_PIPELINE_TRAITS = [
  'pipeline',
  'stream',
  'queue',
  'worker',
  'scheduler',
] as const;

// ── Observability & Metric Traits ──────────────────────────────────────────────
export const UNIVERSAL_METRIC_TRAITS = [
  'metric',
  'trace',
  'log',
  'health_check',
] as const;

// ── Container & Deployment Traits ──────────────────────────────────────────────
export const UNIVERSAL_CONTAINER_TRAITS = [
  'container',
  'deployment',
  'scaling',
  'secret',
] as const;

// ── Resilience Pattern Traits ──────────────────────────────────────────────────
export const UNIVERSAL_RESILIENCE_TRAITS = [
  'circuit_breaker',
  'retry',
  'timeout',
  'fallback',
  'bulkhead',
] as const;

// ── Combined v6 Universal Traits ───────────────────────────────────────────────
export const UNIVERSAL_V6_TRAITS = [
  ...UNIVERSAL_SERVICE_TRAITS,
  ...UNIVERSAL_CONTRACT_TRAITS,
  ...UNIVERSAL_DATA_TRAITS,
  ...UNIVERSAL_NETWORK_TRAITS,
  ...UNIVERSAL_PIPELINE_TRAITS,
  ...UNIVERSAL_METRIC_TRAITS,
  ...UNIVERSAL_CONTAINER_TRAITS,
  ...UNIVERSAL_RESILIENCE_TRAITS,
] as const;

export type UniversalV6TraitName = (typeof UNIVERSAL_V6_TRAITS)[number];
