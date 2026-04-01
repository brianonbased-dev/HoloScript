/**
 * CircuitBreakerDeployment.ts
 *
 * Production deployment configuration for the HoloScript circuit breaker system.
 * Provides health checks, graceful degradation, telemetry collection,
 * alerting thresholds, and dashboard metrics.
 *
 * Integrates with:
 *   - packages/core/src/compiler/CircuitBreaker.ts (per-target circuit breaker)
 *   - packages/core/src/compiler/CircuitBreakerMonitor.ts (monitoring)
 *   - CircuitBreakerCICD.ts (CI/CD quality gates)
 *   - CircuitBreakerBenchmarks.ts (performance baselines)
 *
 * @module deployment
 * @version 1.0.0
 * @package @holoscript/examples
 */

// =============================================================================
// TYPES & INTERFACES
// =============================================================================

/**
 * Export target identifier (mirrors compiler/CircuitBreaker.ts)
 */
export type ExportTarget =
  | 'urdf'
  | 'sdf'
  | 'unity'
  | 'unreal'
  | 'godot'
  | 'vrchat'
  | 'openxr'
  | 'android'
  | 'android-xr'
  | 'ios'
  | 'visionos'
  | 'ar'
  | 'babylon'
  | 'webgpu'
  | 'r3f'
  | 'wasm'
  | 'playcanvas'
  | 'usd'
  | 'usdz'
  | 'dtdl'
  | 'vrr'
  | 'multi-layer'
  | 'incremental'
  | 'state'
  | 'trait-composition'
  | 'tsl'
  | 'a2a-agent-card'
  | 'nir'
  | 'openxr-spatial-entities'
  | 'phone-sleeve-vr';

/**
 * Deployment environment.
 */
export type Environment = 'development' | 'staging' | 'canary' | 'production';

/**
 * Health check status.
 */
export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

/**
 * Deployment strategy.
 */
export type DeploymentStrategy = 'rolling' | 'blue-green' | 'canary' | 'recreate';

// -----------------------------------------------------------------------------
// Health Check Configuration
// -----------------------------------------------------------------------------

/**
 * Health check probe configuration (modeled after Kubernetes probes).
 */
export interface HealthProbe {
  /** Probe name */
  name: string;

  /** Probe type */
  type: 'liveness' | 'readiness' | 'startup';

  /** Check interval (ms) */
  intervalMs: number;

  /** Timeout for each check (ms) */
  timeoutMs: number;

  /** Number of consecutive failures before marking unhealthy */
  failureThreshold: number;

  /** Number of consecutive successes before marking healthy */
  successThreshold: number;

  /** Initial delay before starting probes (ms) */
  initialDelayMs: number;

  /** The actual check function */
  check: () => Promise<HealthCheckResult>;
}

/**
 * Result of a single health check.
 */
export interface HealthCheckResult {
  /** Whether the check passed */
  healthy: boolean;

  /** Human-readable status message */
  message: string;

  /** Response time (ms) */
  responseTimeMs: number;

  /** Optional diagnostic data */
  diagnostics?: Record<string, unknown>;
}

/**
 * Aggregate health report across all probes.
 */
export interface HealthReport {
  /** Overall status (worst of all probes) */
  status: HealthStatus;

  /** Individual probe results */
  probes: Array<{
    name: string;
    type: string;
    status: HealthStatus;
    lastCheck: string;
    consecutiveFailures: number;
    consecutiveSuccesses: number;
    lastResult: HealthCheckResult;
  }>;

  /** Timestamp */
  timestamp: string;

  /** Uptime (ms) */
  uptimeMs: number;

  /** Version info */
  version: string;
}

// -----------------------------------------------------------------------------
// Graceful Degradation
// -----------------------------------------------------------------------------

/**
 * Degradation level with associated behavior changes.
 */
export interface DegradationLevel {
  /** Level name */
  name: string;

  /** Numeric severity (0=normal, higher=more degraded) */
  severity: number;

  /** Which targets to disable at this level */
  disabledTargets: ExportTarget[];

  /** Whether to enable caching at this level */
  enableCaching: boolean;

  /** Cache TTL at this level (ms) */
  cacheTtlMs: number;

  /** Whether to serve stale data when fresh data unavailable */
  serveStale: boolean;

  /** Maximum concurrent compilations at this level */
  maxConcurrentCompilations: number;

  /** Rate limit (requests per second) */
  rateLimitRps: number;

  /** Custom message for clients */
  clientMessage: string;
}

/**
 * Graceful degradation configuration.
 */
export interface DegradationConfig {
  /** Ordered degradation levels (ascending severity) */
  levels: DegradationLevel[];

  /** Health score thresholds for each level transition */
  thresholds: {
    /** Health score below which to enter degraded mode */
    degradedBelow: number;
    /** Health score below which to enter severely degraded mode */
    severeBelow: number;
    /** Health score below which to enter emergency mode */
    emergencyBelow: number;
  };

  /** Hysteresis: health score must exceed this margin above threshold to recover */
  recoveryMargin: number;

  /** Minimum time between level transitions (ms) - prevents flapping */
  minTransitionIntervalMs: number;
}

// -----------------------------------------------------------------------------
// Telemetry
// -----------------------------------------------------------------------------

/**
 * Telemetry metric types.
 */
export type MetricType = 'counter' | 'gauge' | 'histogram' | 'summary';

/**
 * Telemetry metric definition.
 */
export interface MetricDefinition {
  /** Metric name (Prometheus-style) */
  name: string;

  /** Help text describing the metric */
  help: string;

  /** Metric type */
  type: MetricType;

  /** Label names for this metric */
  labels: string[];

  /** Histogram bucket boundaries (for histogram type) */
  buckets?: number[];
}

/**
 * Telemetry backend configuration.
 */
export interface TelemetryConfig {
  /** Enable telemetry collection */
  enabled: boolean;

  /** Collection interval (ms) */
  collectionIntervalMs: number;

  /** Retention period for in-memory metrics (ms) */
  retentionMs: number;

  /** Maximum number of time series to retain */
  maxTimeSeries: number;

  /** Export backends */
  exporters: TelemetryExporter[];

  /** Custom metric definitions */
  customMetrics: MetricDefinition[];
}

/**
 * Telemetry export backend.
 */
export interface TelemetryExporter {
  /** Exporter name */
  name: string;

  /** Export format */
  format: 'prometheus' | 'otlp' | 'datadog' | 'json' | 'statsd';

  /** Endpoint URL */
  endpoint: string;

  /** Export interval (ms) */
  intervalMs: number;

  /** Authentication headers */
  headers?: Record<string, string>;

  /** Batch size for exports */
  batchSize: number;

  /** Enable gzip compression */
  compress: boolean;
}

// -----------------------------------------------------------------------------
// Alerting
// -----------------------------------------------------------------------------

/**
 * Alert severity levels.
 */
export type AlertSeverity = 'info' | 'warning' | 'error' | 'critical' | 'page';

/**
 * Alert rule definition.
 */
export interface AlertRule {
  /** Rule name */
  name: string;

  /** Alert severity */
  severity: AlertSeverity;

  /** Condition expression (evaluated against metrics) */
  condition: string;

  /** Duration the condition must be true before firing (ms) */
  forDurationMs: number;

  /** Alert message template */
  messageTemplate: string;

  /** Notification channels to use */
  channels: string[];

  /** Labels for routing */
  labels: Record<string, string>;

  /** Annotations for context */
  annotations: Record<string, string>;

  /** Cooldown period between alerts (ms) */
  cooldownMs: number;
}

/**
 * Alerting configuration.
 */
export interface AlertingConfig {
  /** Alert rules */
  rules: AlertRule[];

  /** Notification channels */
  channels: AlertChannel[];

  /** Global alert inhibition rules */
  inhibitionRules: InhibitionRule[];

  /** Escalation policies */
  escalation: EscalationPolicy[];
}

/**
 * Notification channel.
 */
export interface AlertChannel {
  /** Channel name */
  name: string;

  /** Channel type */
  type: 'slack' | 'email' | 'pagerduty' | 'webhook' | 'opsgenie';

  /** Channel configuration */
  config: Record<string, string>;

  /** Send resolved notifications */
  sendResolved: boolean;
}

/**
 * Alert inhibition rule (suppress one alert when another is firing).
 */
export interface InhibitionRule {
  /** Source alert name pattern */
  sourceMatch: string;

  /** Target alert name pattern to inhibit */
  targetMatch: string;

  /** Labels that must match for inhibition */
  matchLabels: string[];
}

/**
 * Escalation policy.
 */
export interface EscalationPolicy {
  /** Policy name */
  name: string;

  /** Escalation steps (ordered) */
  steps: Array<{
    /** Delay before escalating (ms) */
    delayMs: number;
    /** Channels to notify at this step */
    channels: string[];
  }>;

  /** Repeat interval for unacknowledged alerts (ms) */
  repeatIntervalMs: number;
}

// -----------------------------------------------------------------------------
// Dashboard
// -----------------------------------------------------------------------------

/**
 * Dashboard panel configuration.
 */
export interface DashboardPanel {
  /** Panel title */
  title: string;

  /** Panel type */
  type: 'graph' | 'stat' | 'table' | 'gauge' | 'heatmap' | 'alert-list';

  /** Metric queries for this panel */
  queries: string[];

  /** Panel position (grid layout) */
  position: { x: number; y: number; w: number; h: number };

  /** Threshold markers */
  thresholds?: Array<{ value: number; color: string; label: string }>;

  /** Refresh interval (ms) */
  refreshIntervalMs: number;
}

/**
 * Dashboard configuration.
 */
export interface DashboardConfig {
  /** Dashboard name */
  name: string;

  /** Dashboard description */
  description: string;

  /** Panels */
  panels: DashboardPanel[];

  /** Default time range */
  defaultTimeRange: { from: string; to: string };

  /** Auto-refresh interval (ms) */
  autoRefreshMs: number;

  /** Dashboard tags */
  tags: string[];
}

// =============================================================================
// COMPLETE DEPLOYMENT CONFIGURATION
// =============================================================================

/**
 * Complete production deployment configuration.
 */
export interface DeploymentConfig {
  /** Deployment environment */
  environment: Environment;

  /** Deployment strategy */
  strategy: DeploymentStrategy;

  /** Version being deployed */
  version: string;

  /** Health check probes */
  healthChecks: Omit<HealthProbe, 'check'>[];

  /** Graceful degradation settings */
  degradation: DegradationConfig;

  /** Telemetry configuration */
  telemetry: TelemetryConfig;

  /** Alerting configuration */
  alerting: AlertingConfig;

  /** Dashboard configuration */
  dashboard: DashboardConfig;

  /** Resource limits */
  resources: {
    maxMemoryMB: number;
    maxCpuPercent: number;
    maxConcurrentCompilations: number;
    requestTimeoutMs: number;
    maxRequestBodySizeMB: number;
  };

  /** Feature flags */
  featureFlags: {
    enableExperimentalTargets: boolean;
    enableDetailedTracing: boolean;
    enableProfilingEndpoint: boolean;
    enableMetricsEndpoint: boolean;
    enableDebugDashboard: boolean;
  };
}

// =============================================================================
// DEFAULT CONFIGURATIONS
// =============================================================================

/** Non-critical targets that can be disabled during degradation */
const DEGRADABLE_TARGETS: ExportTarget[] = [
  'tsl',
  'a2a-agent-card',
  'nir',
  'openxr-spatial-entities',
  'vrr',
  'multi-layer',
  'dtdl',
];

/** Targets that are never disabled (core rendering pipeline) */
const ESSENTIAL_TARGETS: ExportTarget[] = ['r3f', 'webgpu', 'babylon', 'wasm'];

export const DEFAULT_DEGRADATION_CONFIG: DegradationConfig = {
  levels: [
    {
      name: 'normal',
      severity: 0,
      disabledTargets: [],
      enableCaching: true,
      cacheTtlMs: 5 * 60 * 1000,
      serveStale: false,
      maxConcurrentCompilations: 16,
      rateLimitRps: 100,
      clientMessage: 'All systems operational',
    },
    {
      name: 'degraded',
      severity: 1,
      disabledTargets: DEGRADABLE_TARGETS.slice(0, 3),
      enableCaching: true,
      cacheTtlMs: 15 * 60 * 1000,
      serveStale: true,
      maxConcurrentCompilations: 8,
      rateLimitRps: 50,
      clientMessage: 'Some export targets temporarily unavailable. Core functionality operational.',
    },
    {
      name: 'severe',
      severity: 2,
      disabledTargets: DEGRADABLE_TARGETS,
      enableCaching: true,
      cacheTtlMs: 60 * 60 * 1000,
      serveStale: true,
      maxConcurrentCompilations: 4,
      rateLimitRps: 20,
      clientMessage:
        'System operating in reduced capacity. Only essential export targets available.',
    },
    {
      name: 'emergency',
      severity: 3,
      disabledTargets: DEGRADABLE_TARGETS.concat([
        'unity',
        'unreal',
        'godot',
        'playcanvas',
      ] as ExportTarget[]),
      enableCaching: true,
      cacheTtlMs: 24 * 60 * 60 * 1000,
      serveStale: true,
      maxConcurrentCompilations: 2,
      rateLimitRps: 5,
      clientMessage: 'System in emergency mode. Only web rendering targets available.',
    },
  ],
  thresholds: {
    degradedBelow: 70,
    severeBelow: 40,
    emergencyBelow: 20,
  },
  recoveryMargin: 10,
  minTransitionIntervalMs: 60 * 1000,
};

// =============================================================================
// BUILT-IN METRICS
// =============================================================================

export const CIRCUIT_BREAKER_METRICS: MetricDefinition[] = [
  {
    name: 'holoscript_cb_circuit_state',
    help: 'Current circuit breaker state per target (0=CLOSED, 1=OPEN, 2=HALF_OPEN)',
    type: 'gauge',
    labels: ['target', 'environment'],
  },
  {
    name: 'holoscript_cb_compilation_duration_ms',
    help: 'Compilation duration in milliseconds',
    type: 'histogram',
    labels: ['target', 'environment', 'status'],
    buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
  },
  {
    name: 'holoscript_cb_compilations_total',
    help: 'Total number of compilation attempts',
    type: 'counter',
    labels: ['target', 'environment', 'status'],
  },
  {
    name: 'holoscript_cb_failures_total',
    help: 'Total number of compilation failures',
    type: 'counter',
    labels: ['target', 'environment', 'error_type'],
  },
  {
    name: 'holoscript_cb_fallback_invocations_total',
    help: 'Total number of fallback invocations',
    type: 'counter',
    labels: ['target', 'environment'],
  },
  {
    name: 'holoscript_cb_health_score',
    help: 'Current health score (0-100)',
    type: 'gauge',
    labels: ['target', 'environment'],
  },
  {
    name: 'holoscript_cb_degradation_level',
    help: 'Current degradation level (0=normal, 3=emergency)',
    type: 'gauge',
    labels: ['environment'],
  },
  {
    name: 'holoscript_cb_memory_usage_bytes',
    help: 'Memory usage in bytes',
    type: 'gauge',
    labels: ['environment', 'component'],
  },
  {
    name: 'holoscript_cb_cache_hits_total',
    help: 'Total number of cache hits during degraded mode',
    type: 'counter',
    labels: ['target', 'environment'],
  },
  {
    name: 'holoscript_cb_active_compilations',
    help: 'Number of currently active compilations',
    type: 'gauge',
    labels: ['environment'],
  },
  {
    name: 'holoscript_cb_queue_length',
    help: 'Number of compilations waiting in queue',
    type: 'gauge',
    labels: ['environment'],
  },
  {
    name: 'holoscript_cb_uptime_seconds',
    help: 'Time since last restart in seconds',
    type: 'gauge',
    labels: ['environment'],
  },
];

// =============================================================================
// DEFAULT ALERT RULES
// =============================================================================

export const DEFAULT_ALERT_RULES: AlertRule[] = [
  {
    name: 'CircuitBreakerOpen',
    severity: 'critical',
    condition: 'holoscript_cb_circuit_state{target=~"r3f|webgpu|babylon"} == 1',
    forDurationMs: 60 * 1000,
    messageTemplate:
      'Circuit breaker OPEN for critical target {{ $labels.target }} in {{ $labels.environment }}',
    channels: ['slack-ops', 'pagerduty'],
    labels: { team: 'platform', component: 'circuit-breaker' },
    annotations: { runbook: 'https://holoscript.dev/runbooks/circuit-breaker-open' },
    cooldownMs: 10 * 60 * 1000,
  },
  {
    name: 'HighFailureRate',
    severity: 'warning',
    condition: 'rate(holoscript_cb_failures_total[5m]) > 10',
    forDurationMs: 5 * 60 * 1000,
    messageTemplate: 'High failure rate ({{ $value }}/min) for target {{ $labels.target }}',
    channels: ['slack-ops'],
    labels: { team: 'platform', component: 'circuit-breaker' },
    annotations: { summary: 'Compilation failures exceeding threshold' },
    cooldownMs: 15 * 60 * 1000,
  },
  {
    name: 'DegradedMode',
    severity: 'warning',
    condition: 'holoscript_cb_degradation_level > 0',
    forDurationMs: 3 * 60 * 1000,
    messageTemplate: 'System in degraded mode (level {{ $value }}) in {{ $labels.environment }}',
    channels: ['slack-ops'],
    labels: { team: 'platform', component: 'circuit-breaker' },
    annotations: { summary: 'System operating with reduced functionality' },
    cooldownMs: 30 * 60 * 1000,
  },
  {
    name: 'EmergencyMode',
    severity: 'page',
    condition: 'holoscript_cb_degradation_level >= 3',
    forDurationMs: 60 * 1000,
    messageTemplate:
      'EMERGENCY: System in emergency mode in {{ $labels.environment }}. Only essential targets available.',
    channels: ['slack-ops', 'pagerduty', 'email-oncall'],
    labels: { team: 'platform', component: 'circuit-breaker', priority: 'P1' },
    annotations: { runbook: 'https://holoscript.dev/runbooks/emergency-mode' },
    cooldownMs: 5 * 60 * 1000,
  },
  {
    name: 'CompilationLatencyHigh',
    severity: 'warning',
    condition: 'histogram_quantile(0.95, holoscript_cb_compilation_duration_ms) > 5000',
    forDurationMs: 10 * 60 * 1000,
    messageTemplate:
      'P95 compilation latency {{ $value }}ms exceeds 5s threshold for {{ $labels.target }}',
    channels: ['slack-ops'],
    labels: { team: 'platform', component: 'circuit-breaker' },
    annotations: { summary: 'Compilation performance degraded' },
    cooldownMs: 30 * 60 * 1000,
  },
  {
    name: 'HighMemoryUsage',
    severity: 'warning',
    condition: 'holoscript_cb_memory_usage_bytes / 1024 / 1024 > 512',
    forDurationMs: 5 * 60 * 1000,
    messageTemplate: 'Memory usage {{ $value }}MB exceeds 512MB threshold',
    channels: ['slack-ops'],
    labels: { team: 'platform', component: 'circuit-breaker' },
    annotations: { summary: 'High memory consumption detected' },
    cooldownMs: 15 * 60 * 1000,
  },
  {
    name: 'NoHealthyTargets',
    severity: 'critical',
    condition: 'count(holoscript_cb_circuit_state == 0) == 0',
    forDurationMs: 30 * 1000,
    messageTemplate: 'All circuit breakers are OPEN or HALF_OPEN in {{ $labels.environment }}',
    channels: ['slack-ops', 'pagerduty', 'email-oncall'],
    labels: { team: 'platform', component: 'circuit-breaker', priority: 'P1' },
    annotations: { runbook: 'https://holoscript.dev/runbooks/total-circuit-failure' },
    cooldownMs: 5 * 60 * 1000,
  },
];

// =============================================================================
// DEFAULT DASHBOARD
// =============================================================================

export const DEFAULT_DASHBOARD: DashboardConfig = {
  name: 'HoloScript Circuit Breaker',
  description:
    'Production monitoring dashboard for the circuit breaker system across all export targets',
  tags: ['holoscript', 'circuit-breaker', 'production'],
  defaultTimeRange: { from: 'now-1h', to: 'now' },
  autoRefreshMs: 10000,
  panels: [
    // Row 1: Overview
    {
      title: 'Overall Health Score',
      type: 'gauge',
      queries: ['avg(holoscript_cb_health_score)'],
      position: { x: 0, y: 0, w: 6, h: 4 },
      thresholds: [
        { value: 0, color: '#ef4444', label: 'Critical' },
        { value: 40, color: '#f59e0b', label: 'Warning' },
        { value: 70, color: '#22c55e', label: 'Healthy' },
      ],
      refreshIntervalMs: 5000,
    },
    {
      title: 'Degradation Level',
      type: 'stat',
      queries: ['holoscript_cb_degradation_level'],
      position: { x: 6, y: 0, w: 3, h: 4 },
      thresholds: [
        { value: 0, color: '#22c55e', label: 'Normal' },
        { value: 1, color: '#f59e0b', label: 'Degraded' },
        { value: 2, color: '#ef4444', label: 'Severe' },
        { value: 3, color: '#7c2d12', label: 'Emergency' },
      ],
      refreshIntervalMs: 5000,
    },
    {
      title: 'Active Compilations',
      type: 'stat',
      queries: ['holoscript_cb_active_compilations'],
      position: { x: 9, y: 0, w: 3, h: 4 },
      refreshIntervalMs: 2000,
    },
    {
      title: 'Uptime',
      type: 'stat',
      queries: ['holoscript_cb_uptime_seconds / 3600'],
      position: { x: 12, y: 0, w: 3, h: 4 },
      refreshIntervalMs: 60000,
    },

    // Row 2: Circuit States
    {
      title: 'Circuit States by Target',
      type: 'heatmap',
      queries: ['holoscript_cb_circuit_state'],
      position: { x: 0, y: 4, w: 15, h: 6 },
      refreshIntervalMs: 5000,
    },

    // Row 3: Compilation Metrics
    {
      title: 'Compilation Rate',
      type: 'graph',
      queries: [
        'rate(holoscript_cb_compilations_total{status="success"}[5m])',
        'rate(holoscript_cb_compilations_total{status="failure"}[5m])',
      ],
      position: { x: 0, y: 10, w: 8, h: 6 },
      refreshIntervalMs: 10000,
    },
    {
      title: 'P95 Compilation Latency',
      type: 'graph',
      queries: ['histogram_quantile(0.95, rate(holoscript_cb_compilation_duration_ms_bucket[5m]))'],
      position: { x: 8, y: 10, w: 7, h: 6 },
      thresholds: [{ value: 5000, color: '#ef4444', label: 'SLA Breach' }],
      refreshIntervalMs: 10000,
    },

    // Row 4: Resource Usage
    {
      title: 'Memory Usage',
      type: 'graph',
      queries: ['holoscript_cb_memory_usage_bytes / 1024 / 1024'],
      position: { x: 0, y: 16, w: 8, h: 6 },
      thresholds: [
        { value: 512, color: '#f59e0b', label: 'Warning' },
        { value: 1024, color: '#ef4444', label: 'Critical' },
      ],
      refreshIntervalMs: 10000,
    },
    {
      title: 'Cache Hit Rate',
      type: 'graph',
      queries: [
        'rate(holoscript_cb_cache_hits_total[5m]) / rate(holoscript_cb_compilations_total[5m])',
      ],
      position: { x: 8, y: 16, w: 7, h: 6 },
      refreshIntervalMs: 10000,
    },

    // Row 5: Alerts
    {
      title: 'Active Alerts',
      type: 'alert-list',
      queries: ['ALERTS{alertstate="firing"}'],
      position: { x: 0, y: 22, w: 15, h: 4 },
      refreshIntervalMs: 5000,
    },

    // Row 6: Per-Target Table
    {
      title: 'Export Target Status',
      type: 'table',
      queries: [
        'holoscript_cb_circuit_state',
        'holoscript_cb_health_score',
        'rate(holoscript_cb_failures_total[5m])',
        'histogram_quantile(0.95, rate(holoscript_cb_compilation_duration_ms_bucket[5m]))',
      ],
      position: { x: 0, y: 26, w: 15, h: 8 },
      refreshIntervalMs: 10000,
    },
  ],
};

// =============================================================================
// DEPLOYMENT CONFIGURATION FACTORY
// =============================================================================

/**
 * Create a complete deployment configuration for a given environment.
 */
export function createDeploymentConfig(
  environment: Environment,
  version: string,
  overrides: Partial<DeploymentConfig> = {}
): DeploymentConfig {
  const isProduction = environment === 'production';
  const isStaging = environment === 'staging';

  const config: DeploymentConfig = {
    environment,
    strategy: isProduction ? 'canary' : 'rolling',
    version,

    healthChecks: [
      {
        name: 'circuit-breaker-liveness',
        type: 'liveness',
        intervalMs: isProduction ? 10000 : 30000,
        timeoutMs: 5000,
        failureThreshold: 3,
        successThreshold: 1,
        initialDelayMs: 15000,
      },
      {
        name: 'circuit-breaker-readiness',
        type: 'readiness',
        intervalMs: isProduction ? 5000 : 15000,
        timeoutMs: 3000,
        failureThreshold: 2,
        successThreshold: 2,
        initialDelayMs: 10000,
      },
      {
        name: 'circuit-breaker-startup',
        type: 'startup',
        intervalMs: 5000,
        timeoutMs: 10000,
        failureThreshold: 10,
        successThreshold: 1,
        initialDelayMs: 0,
      },
    ],

    degradation: DEFAULT_DEGRADATION_CONFIG,

    telemetry: {
      enabled: true,
      collectionIntervalMs: isProduction ? 10000 : 30000,
      retentionMs: isProduction ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000,
      maxTimeSeries: 10000,
      exporters: [
        {
          name: 'prometheus',
          format: 'prometheus',
          endpoint: '/metrics',
          intervalMs: 15000,
          batchSize: 500,
          compress: false,
        },
        ...(isProduction || isStaging
          ? [
              {
                name: 'otlp-collector',
                format: 'otlp' as const,
                endpoint: process.env.OTEL_ENDPOINT || 'http://otel-collector:4318',
                intervalMs: 30000,
                headers: {
                  Authorization: `Bearer ${process.env.OTEL_TOKEN || ''}`,
                },
                batchSize: 1000,
                compress: true,
              },
            ]
          : []),
      ],
      customMetrics: CIRCUIT_BREAKER_METRICS,
    },

    alerting: {
      rules: isProduction
        ? DEFAULT_ALERT_RULES
        : DEFAULT_ALERT_RULES.filter((r) => r.severity === 'critical' || r.severity === 'page'),
      channels: [
        {
          name: 'slack-ops',
          type: 'slack',
          config: {
            webhookUrl: process.env.SLACK_WEBHOOK_URL || '',
            channel: '#holoscript-ops',
            username: 'CircuitBreaker',
          },
          sendResolved: true,
        },
        ...(isProduction
          ? [
              {
                name: 'pagerduty',
                type: 'pagerduty' as const,
                config: {
                  serviceKey: process.env.PAGERDUTY_KEY || '',
                  severity: 'critical',
                },
                sendResolved: true,
              },
              {
                name: 'email-oncall',
                type: 'email' as const,
                config: {
                  to: process.env.ONCALL_EMAIL || 'oncall@holoscript.dev',
                  from: 'alerts@holoscript.dev',
                },
                sendResolved: true,
              },
            ]
          : []),
      ],
      inhibitionRules: [
        {
          sourceMatch: 'EmergencyMode',
          targetMatch: 'DegradedMode',
          matchLabels: ['environment'],
        },
        {
          sourceMatch: 'NoHealthyTargets',
          targetMatch: 'CircuitBreakerOpen',
          matchLabels: ['environment'],
        },
      ],
      escalation: [
        {
          name: 'default',
          steps: [
            { delayMs: 0, channels: ['slack-ops'] },
            { delayMs: 5 * 60 * 1000, channels: ['pagerduty'] },
            { delayMs: 15 * 60 * 1000, channels: ['email-oncall'] },
          ],
          repeatIntervalMs: 30 * 60 * 1000,
        },
      ],
    },

    dashboard: DEFAULT_DASHBOARD,

    resources: {
      maxMemoryMB: isProduction ? 1024 : 512,
      maxCpuPercent: isProduction ? 80 : 90,
      maxConcurrentCompilations: isProduction ? 16 : 8,
      requestTimeoutMs: isProduction ? 30000 : 60000,
      maxRequestBodySizeMB: 10,
    },

    featureFlags: {
      enableExperimentalTargets: !isProduction,
      enableDetailedTracing: !isProduction,
      enableProfilingEndpoint: !isProduction,
      enableMetricsEndpoint: true,
      enableDebugDashboard: !isProduction,
    },
  };

  // Apply overrides
  return deepMerge(config, overrides) as DeploymentConfig;
}

// =============================================================================
// HEALTH CHECK IMPLEMENTATION
// =============================================================================

/**
 * Health check manager that runs probes and maintains health state.
 */
export class HealthCheckManager {
  private readonly probes: Map<string, HealthProbe> = new Map();
  private readonly probeState: Map<
    string,
    {
      consecutiveFailures: number;
      consecutiveSuccesses: number;
      lastResult: HealthCheckResult;
      lastCheck: Date;
      status: HealthStatus;
    }
  > = new Map();
  private intervals: Map<string, ReturnType<typeof setInterval>> = new Map();
  private readonly startTime: Date;

  constructor(private readonly version: string = '1.0.0') {
    this.startTime = new Date();
  }

  /**
   * Register a health probe.
   */
  registerProbe(probe: HealthProbe): void {
    this.probes.set(probe.name, probe);
    this.probeState.set(probe.name, {
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      lastResult: { healthy: true, message: 'Not yet checked', responseTimeMs: 0 },
      lastCheck: new Date(),
      status: 'unknown',
    });
  }

  /**
   * Start all registered probes.
   */
  start(): void {
    for (const [name, probe] of this.probes.entries()) {
      const interval = setInterval(async () => {
        await this.runProbe(name);
      }, probe.intervalMs);

      this.intervals.set(name, interval);

      // Schedule initial check after initial delay
      setTimeout(() => {
        this.runProbe(name);
      }, probe.initialDelayMs);
    }
  }

  /**
   * Stop all probes.
   */
  stop(): void {
    for (const interval of this.intervals.values()) {
      clearInterval(interval);
    }
    this.intervals.clear();
  }

  /**
   * Run a specific probe.
   */
  async runProbe(name: string): Promise<HealthCheckResult> {
    const probe = this.probes.get(name);
    const state = this.probeState.get(name);
    if (!probe || !state) {
      return { healthy: false, message: `Probe ${name} not found`, responseTimeMs: 0 };
    }

    const t0 = performance.now();
    let result: HealthCheckResult;

    try {
      // Run with timeout
      result = await Promise.race([
        probe.check(),
        new Promise<HealthCheckResult>((_, reject) =>
          setTimeout(() => reject(new Error('Health check timeout')), probe.timeoutMs)
        ),
      ]);
    } catch (error) {
      result = {
        healthy: false,
        message: `Health check failed: ${(error as Error).message}`,
        responseTimeMs: performance.now() - t0,
      };
    }

    // Update state
    state.lastResult = result;
    state.lastCheck = new Date();

    if (result.healthy) {
      state.consecutiveSuccesses++;
      state.consecutiveFailures = 0;
      if (state.consecutiveSuccesses >= probe.successThreshold) {
        state.status = 'healthy';
      }
    } else {
      state.consecutiveFailures++;
      state.consecutiveSuccesses = 0;
      if (state.consecutiveFailures >= probe.failureThreshold) {
        state.status = 'unhealthy';
      } else {
        state.status = 'degraded';
      }
    }

    return result;
  }

  /**
   * Get aggregate health report.
   */
  getReport(): HealthReport {
    const probes: HealthReport['probes'] = [];

    for (const [name, probe] of this.probes.entries()) {
      const state = this.probeState.get(name);
      if (state) {
        probes.push({
          name,
          type: probe.type,
          status: state.status,
          lastCheck: state.lastCheck.toISOString(),
          consecutiveFailures: state.consecutiveFailures,
          consecutiveSuccesses: state.consecutiveSuccesses,
          lastResult: state.lastResult,
        });
      }
    }

    // Overall status is the worst of all probes
    let status: HealthStatus = 'healthy';
    for (const probe of probes) {
      if (probe.status === 'unhealthy') {
        status = 'unhealthy';
        break;
      }
      if (probe.status === 'degraded') {
        status = 'degraded';
      }
      if (probe.status === 'unknown' && status === 'healthy') {
        status = 'unknown';
      }
    }

    return {
      status,
      probes,
      timestamp: new Date().toISOString(),
      uptimeMs: Date.now() - this.startTime.getTime(),
      version: this.version,
    };
  }
}

// =============================================================================
// GRACEFUL DEGRADATION MANAGER
// =============================================================================

/**
 * Manages graceful degradation level transitions based on health scores.
 */
export class DegradationManager {
  private currentLevel: number = 0;
  private lastTransitionTime: number = Date.now();
  private readonly config: DegradationConfig;

  constructor(config: DegradationConfig = DEFAULT_DEGRADATION_CONFIG) {
    this.config = config;
  }

  /**
   * Evaluate health score and potentially transition degradation level.
   * Returns the current degradation level.
   */
  evaluate(healthScore: number): DegradationLevel {
    const now = Date.now();
    const timeSinceLastTransition = now - this.lastTransitionTime;

    // Prevent flapping
    if (timeSinceLastTransition < this.config.minTransitionIntervalMs) {
      return this.getCurrentLevel();
    }

    let targetLevel: number;

    if (healthScore < this.config.thresholds.emergencyBelow) {
      targetLevel = 3;
    } else if (healthScore < this.config.thresholds.severeBelow) {
      targetLevel = 2;
    } else if (healthScore < this.config.thresholds.degradedBelow) {
      targetLevel = 1;
    } else {
      targetLevel = 0;
    }

    // Apply hysteresis for recovery (require higher score to go back down)
    if (targetLevel < this.currentLevel) {
      const thresholdForCurrentLevel =
        this.currentLevel === 3
          ? this.config.thresholds.emergencyBelow
          : this.currentLevel === 2
            ? this.config.thresholds.severeBelow
            : this.config.thresholds.degradedBelow;

      if (healthScore < thresholdForCurrentLevel + this.config.recoveryMargin) {
        // Not enough margin to recover, stay at current level
        return this.getCurrentLevel();
      }
    }

    if (targetLevel !== this.currentLevel) {
      this.currentLevel = targetLevel;
      this.lastTransitionTime = now;
    }

    return this.getCurrentLevel();
  }

  /**
   * Get current degradation level.
   */
  getCurrentLevel(): DegradationLevel {
    return this.config.levels[this.currentLevel] || this.config.levels[0];
  }

  /**
   * Get current level index (0-3).
   */
  getCurrentLevelIndex(): number {
    return this.currentLevel;
  }

  /**
   * Check if a target is available at the current degradation level.
   */
  isTargetAvailable(target: ExportTarget): boolean {
    const level = this.getCurrentLevel();
    return !level.disabledTargets.includes(target);
  }

  /**
   * Get list of available targets at current degradation level.
   */
  getAvailableTargets(allTargets: ExportTarget[]): ExportTarget[] {
    const level = this.getCurrentLevel();
    return allTargets.filter((t) => !level.disabledTargets.includes(t));
  }

  /**
   * Force a specific degradation level (for manual intervention).
   */
  forceLevel(level: number): void {
    this.currentLevel = Math.max(0, Math.min(level, this.config.levels.length - 1));
    this.lastTransitionTime = Date.now();
  }

  /**
   * Reset to normal operation.
   */
  reset(): void {
    this.currentLevel = 0;
    this.lastTransitionTime = Date.now();
  }
}

// =============================================================================
// UTILITY: DEEP MERGE
// =============================================================================

/**
 * Deep merge utility for configuration objects.
 */
function deepMerge(target: any, source: any): any {
  if (!source) return target;

  const result = { ...target };

  for (const key of Object.keys(source)) {
    if (source[key] === undefined) continue;

    if (
      typeof source[key] === 'object' &&
      source[key] !== null &&
      !Array.isArray(source[key]) &&
      typeof target[key] === 'object' &&
      target[key] !== null &&
      !Array.isArray(target[key])
    ) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }

  return result;
}

// =============================================================================
// DEPLOYMENT REPORT FORMATTER
// =============================================================================

/**
 * Format a deployment configuration as a human-readable report.
 */
export function formatDeploymentReport(config: DeploymentConfig): string {
  const lines: string[] = [];

  lines.push('================================================================');
  lines.push('  HOLOSCRIPT CIRCUIT BREAKER DEPLOYMENT CONFIGURATION');
  lines.push('================================================================');
  lines.push('');
  lines.push(`Environment: ${config.environment.toUpperCase()}`);
  lines.push(`Version: ${config.version}`);
  lines.push(`Strategy: ${config.strategy}`);
  lines.push('');

  lines.push('--- Health Checks ---');
  for (const probe of config.healthChecks) {
    lines.push(`  ${probe.name} (${probe.type})`);
    lines.push(`    Interval: ${probe.intervalMs}ms | Timeout: ${probe.timeoutMs}ms`);
    lines.push(
      `    Failure Threshold: ${probe.failureThreshold} | Success Threshold: ${probe.successThreshold}`
    );
  }
  lines.push('');

  lines.push('--- Degradation Levels ---');
  for (const level of config.degradation.levels) {
    lines.push(`  ${level.name} (severity ${level.severity})`);
    lines.push(
      `    Disabled targets: ${level.disabledTargets.length > 0 ? level.disabledTargets.join(', ') : 'none'}`
    );
    lines.push(
      `    Max concurrent: ${level.maxConcurrentCompilations} | Rate limit: ${level.rateLimitRps} rps`
    );
  }
  lines.push('');

  lines.push('--- Telemetry ---');
  lines.push(`  Enabled: ${config.telemetry.enabled}`);
  lines.push(`  Collection interval: ${config.telemetry.collectionIntervalMs}ms`);
  lines.push(`  Exporters: ${config.telemetry.exporters.map((e) => e.name).join(', ')}`);
  lines.push(`  Custom metrics: ${config.telemetry.customMetrics.length}`);
  lines.push('');

  lines.push('--- Alerting ---');
  lines.push(`  Rules: ${config.alerting.rules.length}`);
  lines.push(`  Channels: ${config.alerting.channels.map((c) => c.name).join(', ')}`);
  for (const rule of config.alerting.rules) {
    lines.push(`    [${rule.severity.toUpperCase()}] ${rule.name}`);
  }
  lines.push('');

  lines.push('--- Resources ---');
  lines.push(`  Max Memory: ${config.resources.maxMemoryMB}MB`);
  lines.push(`  Max CPU: ${config.resources.maxCpuPercent}%`);
  lines.push(`  Max Concurrent Compilations: ${config.resources.maxConcurrentCompilations}`);
  lines.push(`  Request Timeout: ${config.resources.requestTimeoutMs}ms`);
  lines.push('');

  lines.push('--- Feature Flags ---');
  for (const [flag, value] of Object.entries(config.featureFlags)) {
    lines.push(`  ${flag}: ${value}`);
  }
  lines.push('');

  lines.push('--- Dashboard ---');
  lines.push(`  Name: ${config.dashboard.name}`);
  lines.push(`  Panels: ${config.dashboard.panels.length}`);
  lines.push(`  Auto-refresh: ${config.dashboard.autoRefreshMs}ms`);
  lines.push('');

  lines.push('================================================================');

  return lines.join('\n');
}
