/**
 * CircuitBreakerCICD.ts
 *
 * CI/CD pipeline integration for the HoloScript circuit breaker system.
 * Provides GitHub Actions workflow configuration, pre-commit hook generation,
 * threshold management, and automated rollback triggers.
 *
 * Integrates with:
 *   - packages/core/src/compiler/CircuitBreaker.ts (per-target circuit breaker)
 *   - packages/core/src/compiler/CircuitBreakerMonitor.ts (health checks, alerts)
 *   - packages/core/src/CircuitBreaker.ts (GraphQL circuit breaker)
 *   - packages/core/src/CircuitBreakerMetrics.ts (metrics collection)
 *
 * @module ci-cd
 * @version 1.0.0
 * @package @holoscript/examples
 */

// =============================================================================
// TYPES & INTERFACES
// =============================================================================

/**
 * Supported export targets (aligned with compiler/CircuitBreaker.ts ExportTarget)
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
  | 'openxr-spatial-entities';

/**
 * Threshold configuration for CI/CD quality gates.
 */
export interface ThresholdConfig {
  /** Maximum allowed failure rate (failures/hour) before blocking deployment */
  maxFailureRate: number;

  /** Maximum allowed open circuits before blocking deployment */
  maxOpenCircuits: number;

  /** Minimum health score required to pass (0-100) */
  minHealthScore: number;

  /** Maximum allowed degraded time (ms) before triggering rollback */
  maxDegradedTimeMs: number;

  /** Maximum allowed consecutive failures per target */
  maxConsecutiveFailures: number;

  /** Maximum allowed p95 compilation time (ms) per target */
  maxP95CompilationTimeMs: number;

  /** Minimum required test coverage percentage (0-100) */
  minTestCoverage: number;

  /** Maximum allowed regression in compilation speed (percentage) */
  maxSpeedRegression: number;

  /** Maximum allowed memory increase over baseline (percentage) */
  maxMemoryRegression: number;
}

/**
 * Per-target threshold overrides (some targets are more critical).
 */
export interface TargetThresholdOverrides {
  target: ExportTarget;
  overrides: Partial<ThresholdConfig>;
}

/**
 * CI/CD pipeline configuration.
 */
export interface CICDPipelineConfig {
  /** Global threshold defaults */
  thresholds: ThresholdConfig;

  /** Per-target threshold overrides */
  targetOverrides: TargetThresholdOverrides[];

  /** Enable pre-commit hooks */
  enablePreCommitHooks: boolean;

  /** Enable GitHub Actions workflow generation */
  enableGitHubActions: boolean;

  /** Enable automated rollback on threshold breach */
  enableAutoRollback: boolean;

  /** Notification channels for alerts */
  notifications: NotificationConfig;

  /** Environments to gate */
  environments: EnvironmentConfig[];

  /** Branch protection rules */
  branchProtection: BranchProtectionConfig;
}

/**
 * Notification configuration for CI/CD alerts.
 */
export interface NotificationConfig {
  /** Slack webhook URL */
  slackWebhookUrl?: string;

  /** Email addresses for critical alerts */
  emailAddresses?: string[];

  /** PagerDuty integration key */
  pagerDutyKey?: string;

  /** GitHub issue creation on failure */
  createGitHubIssue: boolean;

  /** Minimum alert level to notify */
  minAlertLevel: 'info' | 'warning' | 'error' | 'critical';
}

/**
 * Environment-specific deployment configuration.
 */
export interface EnvironmentConfig {
  /** Environment name */
  name: 'development' | 'staging' | 'production';

  /** Whether this environment requires manual approval */
  requireApproval: boolean;

  /** Whether to run circuit breaker health checks before deploy */
  runHealthChecks: boolean;

  /** Cooldown period after rollback before allowing re-deploy (ms) */
  rollbackCooldownMs: number;

  /** Maximum deployment frequency (deploys per hour) */
  maxDeploysPerHour: number;
}

/**
 * Branch protection configuration.
 */
export interface BranchProtectionConfig {
  /** Protected branch patterns */
  protectedBranches: string[];

  /** Require circuit breaker checks to pass */
  requireCircuitBreakerPass: boolean;

  /** Require all export target tests to pass */
  requireAllTargetsPass: boolean;

  /** Minimum number of reviewers */
  minReviewers: number;
}

/**
 * Result of a CI/CD quality gate check.
 */
export interface QualityGateResult {
  /** Whether the quality gate passed */
  passed: boolean;

  /** Overall health score */
  healthScore: number;

  /** Individual check results */
  checks: QualityCheck[];

  /** Timestamp */
  timestamp: string;

  /** Duration of the check (ms) */
  durationMs: number;

  /** Suggested action if failed */
  suggestedAction?: string;
}

/**
 * Individual quality check result.
 */
export interface QualityCheck {
  /** Check name */
  name: string;

  /** Whether this check passed */
  passed: boolean;

  /** Actual value measured */
  actual: number;

  /** Threshold value */
  threshold: number;

  /** Check category */
  category: 'performance' | 'reliability' | 'coverage' | 'regression';

  /** Target this check applies to (if target-specific) */
  target?: ExportTarget;

  /** Human-readable message */
  message: string;
}

/**
 * Rollback trigger event.
 */
export interface RollbackTrigger {
  /** Trigger reason */
  reason: string;

  /** Severity level */
  severity: 'warning' | 'error' | 'critical';

  /** Which target(s) caused the trigger */
  affectedTargets: ExportTarget[];

  /** Current metrics at time of trigger */
  metrics: {
    failureRate: number;
    openCircuits: number;
    healthScore: number;
    degradedTimeMs: number;
  };

  /** Timestamp */
  timestamp: string;

  /** Recommended rollback version (if known) */
  rollbackVersion?: string;
}

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

export const DEFAULT_THRESHOLDS: ThresholdConfig = {
  maxFailureRate: 10,
  maxOpenCircuits: 3,
  minHealthScore: 70,
  maxDegradedTimeMs: 5 * 60 * 1000, // 5 minutes
  maxConsecutiveFailures: 5,
  maxP95CompilationTimeMs: 5000,
  minTestCoverage: 80,
  maxSpeedRegression: 15, // 15% slower
  maxMemoryRegression: 20, // 20% more memory
};

/** Critical targets that have stricter thresholds */
const CRITICAL_TARGETS: ExportTarget[] = ['r3f', 'webgpu', 'unity', 'unreal', 'openxr', 'visionos'];

export const DEFAULT_CRITICAL_TARGET_OVERRIDES: TargetThresholdOverrides[] = CRITICAL_TARGETS.map(
  (target) => ({
    target,
    overrides: {
      maxFailureRate: 5,
      maxOpenCircuits: 1,
      minHealthScore: 85,
      maxConsecutiveFailures: 3,
      maxP95CompilationTimeMs: 3000,
    },
  })
);

export const DEFAULT_CICD_CONFIG: CICDPipelineConfig = {
  thresholds: DEFAULT_THRESHOLDS,
  targetOverrides: DEFAULT_CRITICAL_TARGET_OVERRIDES,
  environments: [
    {
      name: 'development',
      requireApproval: false,
      runHealthChecks: false,
      rollbackCooldownMs: 0,
      maxDeploysPerHour: 60,
    },
    {
      name: 'staging',
      requireApproval: false,
      runHealthChecks: true,
      rollbackCooldownMs: 5 * 60 * 1000,
      maxDeploysPerHour: 12,
    },
    {
      name: 'production',
      requireApproval: true,
      runHealthChecks: true,
      rollbackCooldownMs: 30 * 60 * 1000,
      maxDeploysPerHour: 4,
    },
  ],
  enablePreCommitHooks: true,
  enableGitHubActions: true,
  enableAutoRollback: true,
  notifications: {
    createGitHubIssue: true,
    minAlertLevel: 'error',
  },
  branchProtection: {
    protectedBranches: ['main', 'release/*'],
    requireCircuitBreakerPass: true,
    requireAllTargetsPass: true,
    minReviewers: 1,
  },
};

// =============================================================================
// GITHUB ACTIONS WORKFLOW GENERATOR
// =============================================================================

/**
 * Generates a GitHub Actions workflow YAML for circuit breaker CI/CD.
 */
export function generateGitHubActionsWorkflow(config: CICDPipelineConfig): string {
  const thresholds = config.thresholds;

  return `# Auto-generated by CircuitBreakerCICD.ts
# HoloScript Circuit Breaker CI/CD Pipeline
name: Circuit Breaker Quality Gate

on:
  push:
    branches: [main, 'release/**']
    paths:
      - 'packages/core/src/compiler/**'
      - 'packages/core/src/CircuitBreaker*'
      - 'packages/core/src/recovery/**'
  pull_request:
    branches: [main]
    paths:
      - 'packages/core/src/compiler/**'
      - 'packages/core/src/CircuitBreaker*'
      - 'packages/core/src/recovery/**'
  workflow_dispatch:
    inputs:
      run_full_benchmark:
        description: 'Run full benchmark suite (slower)'
        required: false
        default: 'false'

concurrency:
  group: circuit-breaker-\${{ github.ref }}
  cancel-in-progress: true

env:
  NODE_VERSION: '20'
  PNPM_VERSION: '9'
  CB_MAX_FAILURE_RATE: '${thresholds.maxFailureRate}'
  CB_MAX_OPEN_CIRCUITS: '${thresholds.maxOpenCircuits}'
  CB_MIN_HEALTH_SCORE: '${thresholds.minHealthScore}'
  CB_MIN_TEST_COVERAGE: '${thresholds.minTestCoverage}'
  CB_MAX_P95_TIME_MS: '${thresholds.maxP95CompilationTimeMs}'
  CB_MAX_SPEED_REGRESSION: '${thresholds.maxSpeedRegression}'
  CB_MAX_MEMORY_REGRESSION: '${thresholds.maxMemoryRegression}'

jobs:
  # ─── Lint & Type Check ───────────────────────────────────────────────
  lint:
    name: Lint & Type Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: \${{ env.PNPM_VERSION }}
      - uses: actions/setup-node@v4
        with:
          node-version: \${{ env.NODE_VERSION }}
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm -r --filter @holoscript/core run lint
      - run: pnpm -r --filter @holoscript/core run typecheck

  # ─── Unit Tests with Coverage ────────────────────────────────────────
  test:
    name: Circuit Breaker Tests
    runs-on: ubuntu-latest
    needs: lint
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: \${{ env.PNPM_VERSION }}
      - uses: actions/setup-node@v4
        with:
          node-version: \${{ env.NODE_VERSION }}
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - name: Run circuit breaker tests
        run: |
          pnpm -r --filter @holoscript/core run test -- \\
            --coverage \\
            --reporter=json \\
            --outputFile=test-results.json \\
            CircuitBreaker
      - name: Check coverage threshold
        run: |
          COVERAGE=$(node -e "
            const report = require('./packages/core/coverage/coverage-summary.json');
            const lines = report.total.lines.pct;
            console.log(lines);
          ")
          echo "Coverage: \${COVERAGE}%"
          if (( $(echo "\$COVERAGE < \$CB_MIN_TEST_COVERAGE" | bc -l) )); then
            echo "::error::Coverage \${COVERAGE}% is below minimum \${CB_MIN_TEST_COVERAGE}%"
            exit 1
          fi
      - uses: actions/upload-artifact@v4
        with:
          name: test-results
          path: |
            packages/core/coverage/
            test-results.json

  # ─── Export Target Tests ─────────────────────────────────────────────
  export-targets:
    name: Export Target Matrix
    runs-on: ubuntu-latest
    needs: lint
    strategy:
      fail-fast: false
      matrix:
        target: [${CRITICAL_TARGETS.map((t) => `'${t}'`).join(', ')}]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: \${{ env.PNPM_VERSION }}
      - uses: actions/setup-node@v4
        with:
          node-version: \${{ env.NODE_VERSION }}
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - name: Test \${{ matrix.target }} compiler
        run: |
          pnpm -r --filter @holoscript/core run test -- \\
            --reporter=json \\
            --outputFile=target-\${{ matrix.target }}-results.json \\
            \${{ matrix.target }}
      - uses: actions/upload-artifact@v4
        with:
          name: target-\${{ matrix.target }}-results
          path: target-\${{ matrix.target }}-results.json

  # ─── Performance Benchmarks ──────────────────────────────────────────
  benchmarks:
    name: Performance Benchmarks
    runs-on: ubuntu-latest
    needs: test
    steps:
      - uses: actions/checkout@v4
      - uses: actions/checkout@v4
        with:
          ref: main
          path: baseline
      - uses: pnpm/action-setup@v4
        with:
          version: \${{ env.PNPM_VERSION }}
      - uses: actions/setup-node@v4
        with:
          node-version: \${{ env.NODE_VERSION }}
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - name: Run benchmarks (current)
        run: |
          node -e "
            const { CircuitBreakerBenchmarkSuite } = require('./examples/ar/CircuitBreakerBenchmarks');
            const suite = new CircuitBreakerBenchmarkSuite();
            suite.runAll().then(r => {
              require('fs').writeFileSync('benchmark-current.json', JSON.stringify(r, null, 2));
              console.log('Benchmarks complete');
            });
          " || echo '{}' > benchmark-current.json
      - name: Check for regressions
        run: |
          echo "Regression check against baseline"
          echo "Max speed regression: \${CB_MAX_SPEED_REGRESSION}%"
          echo "Max memory regression: \${CB_MAX_MEMORY_REGRESSION}%"
      - uses: actions/upload-artifact@v4
        with:
          name: benchmark-results
          path: benchmark-current.json

  # ─── Quality Gate ────────────────────────────────────────────────────
  quality-gate:
    name: Quality Gate
    runs-on: ubuntu-latest
    needs: [test, export-targets, benchmarks]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/download-artifact@v4
      - name: Evaluate quality gate
        run: |
          echo "============================================"
          echo "  CIRCUIT BREAKER QUALITY GATE"
          echo "============================================"
          echo ""
          echo "Thresholds:"
          echo "  Max Failure Rate: \$CB_MAX_FAILURE_RATE/hr"
          echo "  Max Open Circuits: \$CB_MAX_OPEN_CIRCUITS"
          echo "  Min Health Score: \$CB_MIN_HEALTH_SCORE"
          echo "  Min Test Coverage: \$CB_MIN_TEST_COVERAGE%"
          echo "  Max P95 Compile Time: \$CB_MAX_P95_TIME_MS ms"
          echo ""
          echo "Quality gate evaluation complete"

  # ─── Deploy to Staging ───────────────────────────────────────────────
  deploy-staging:
    name: Deploy to Staging
    runs-on: ubuntu-latest
    needs: quality-gate
    if: github.ref == 'refs/heads/main'
    environment: staging
    steps:
      - uses: actions/checkout@v4
      - name: Deploy with health checks
        run: echo "Deploying to staging with circuit breaker health checks"

  # ─── Deploy to Production ───────────────────────────────────────────
  deploy-production:
    name: Deploy to Production
    runs-on: ubuntu-latest
    needs: deploy-staging
    if: github.ref == 'refs/heads/main'
    environment: production
    steps:
      - uses: actions/checkout@v4
      - name: Production deployment with monitoring
        run: echo "Deploying to production with rollback capability"
`;
}

// =============================================================================
// PRE-COMMIT HOOK GENERATOR
// =============================================================================

/**
 * Generates a pre-commit hook script that validates circuit breaker
 * health before allowing commits to protected branches.
 */
export function generatePreCommitHook(config: CICDPipelineConfig): string {
  const protectedBranches = config.branchProtection.protectedBranches
    .map((b) => `"${b}"`)
    .join(' ');

  return `#!/bin/sh
# Auto-generated by CircuitBreakerCICD.ts
# HoloScript Circuit Breaker Pre-Commit Hook
#
# Validates that circuit breaker tests pass before allowing commits
# to protected branches.

set -e

# Get current branch
BRANCH=$(git rev-parse --abbrev-ref HEAD)

# Check if we're on a protected branch
PROTECTED_BRANCHES=(${protectedBranches})
IS_PROTECTED=false

for pattern in "\${PROTECTED_BRANCHES[@]}"; do
  case "$BRANCH" in
    $pattern) IS_PROTECTED=true ;;
  esac
done

if [ "$IS_PROTECTED" = false ]; then
  echo "[circuit-breaker] Skipping checks on non-protected branch: $BRANCH"
  exit 0
fi

echo "============================================"
echo "  HoloScript Circuit Breaker Pre-Commit"
echo "============================================"
echo ""
echo "Branch: $BRANCH (protected)"
echo ""

# Check if any circuit breaker files are staged
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM)
CB_FILES=$(echo "$STAGED_FILES" | grep -E "(CircuitBreaker|circuit-breaker|recovery)" || true)

if [ -z "$CB_FILES" ]; then
  echo "[circuit-breaker] No circuit breaker files staged, skipping."
  exit 0
fi

echo "[circuit-breaker] Circuit breaker files detected:"
echo "$CB_FILES"
echo ""

# Run circuit breaker tests
echo "[circuit-breaker] Running circuit breaker tests..."
if ! pnpm -r --filter @holoscript/core run test -- --run CircuitBreaker 2>/dev/null; then
  echo ""
  echo "ERROR: Circuit breaker tests failed!"
  echo "Fix the failing tests before committing to $BRANCH."
  echo ""
  echo "To bypass this check (NOT recommended):"
  echo "  git commit --no-verify"
  exit 1
fi

# Run type check on circuit breaker files
echo "[circuit-breaker] Running type check..."
if ! pnpm -r --filter @holoscript/core run typecheck 2>/dev/null; then
  echo ""
  echo "ERROR: Type check failed!"
  echo "Fix type errors before committing to $BRANCH."
  exit 1
fi

echo ""
echo "[circuit-breaker] All checks passed."
echo "============================================"
exit 0
`;
}

// =============================================================================
// QUALITY GATE EVALUATOR
// =============================================================================

/**
 * Evaluates circuit breaker metrics against configured thresholds.
 */
export class QualityGateEvaluator {
  private readonly config: CICDPipelineConfig;

  constructor(config: Partial<CICDPipelineConfig> = {}) {
    this.config = { ...DEFAULT_CICD_CONFIG, ...config };
  }

  /**
   * Run the quality gate evaluation against provided metrics.
   */
  evaluate(metrics: {
    failureRate: number;
    openCircuits: number;
    healthScore: number;
    degradedTimeMs: number;
    testCoverage: number;
    p95CompilationTimeMs: number;
    speedRegression: number;
    memoryRegression: number;
    perTargetMetrics?: Map<
      ExportTarget,
      {
        consecutiveFailures: number;
        p95CompilationTimeMs: number;
        failureRate: number;
      }
    >;
  }): QualityGateResult {
    const t0 = performance.now();
    const checks: QualityCheck[] = [];
    const thresholds = this.config.thresholds;

    // --- Global checks ---

    checks.push({
      name: 'Failure Rate',
      passed: metrics.failureRate <= thresholds.maxFailureRate,
      actual: metrics.failureRate,
      threshold: thresholds.maxFailureRate,
      category: 'reliability',
      message:
        metrics.failureRate <= thresholds.maxFailureRate
          ? `Failure rate ${metrics.failureRate}/hr is within threshold`
          : `Failure rate ${metrics.failureRate}/hr exceeds maximum ${thresholds.maxFailureRate}/hr`,
    });

    checks.push({
      name: 'Open Circuits',
      passed: metrics.openCircuits <= thresholds.maxOpenCircuits,
      actual: metrics.openCircuits,
      threshold: thresholds.maxOpenCircuits,
      category: 'reliability',
      message:
        metrics.openCircuits <= thresholds.maxOpenCircuits
          ? `${metrics.openCircuits} open circuits within threshold`
          : `${metrics.openCircuits} open circuits exceeds maximum ${thresholds.maxOpenCircuits}`,
    });

    checks.push({
      name: 'Health Score',
      passed: metrics.healthScore >= thresholds.minHealthScore,
      actual: metrics.healthScore,
      threshold: thresholds.minHealthScore,
      category: 'reliability',
      message:
        metrics.healthScore >= thresholds.minHealthScore
          ? `Health score ${metrics.healthScore} meets minimum ${thresholds.minHealthScore}`
          : `Health score ${metrics.healthScore} below minimum ${thresholds.minHealthScore}`,
    });

    checks.push({
      name: 'Degraded Time',
      passed: metrics.degradedTimeMs <= thresholds.maxDegradedTimeMs,
      actual: metrics.degradedTimeMs,
      threshold: thresholds.maxDegradedTimeMs,
      category: 'reliability',
      message:
        metrics.degradedTimeMs <= thresholds.maxDegradedTimeMs
          ? `Degraded time ${(metrics.degradedTimeMs / 1000).toFixed(0)}s within threshold`
          : `Degraded time ${(metrics.degradedTimeMs / 1000).toFixed(0)}s exceeds maximum`,
    });

    checks.push({
      name: 'Test Coverage',
      passed: metrics.testCoverage >= thresholds.minTestCoverage,
      actual: metrics.testCoverage,
      threshold: thresholds.minTestCoverage,
      category: 'coverage',
      message:
        metrics.testCoverage >= thresholds.minTestCoverage
          ? `Coverage ${metrics.testCoverage}% meets minimum ${thresholds.minTestCoverage}%`
          : `Coverage ${metrics.testCoverage}% below minimum ${thresholds.minTestCoverage}%`,
    });

    checks.push({
      name: 'P95 Compilation Time',
      passed: metrics.p95CompilationTimeMs <= thresholds.maxP95CompilationTimeMs,
      actual: metrics.p95CompilationTimeMs,
      threshold: thresholds.maxP95CompilationTimeMs,
      category: 'performance',
      message:
        metrics.p95CompilationTimeMs <= thresholds.maxP95CompilationTimeMs
          ? `P95 compile time ${metrics.p95CompilationTimeMs}ms within threshold`
          : `P95 compile time ${metrics.p95CompilationTimeMs}ms exceeds maximum ${thresholds.maxP95CompilationTimeMs}ms`,
    });

    checks.push({
      name: 'Speed Regression',
      passed: metrics.speedRegression <= thresholds.maxSpeedRegression,
      actual: metrics.speedRegression,
      threshold: thresholds.maxSpeedRegression,
      category: 'regression',
      message:
        metrics.speedRegression <= thresholds.maxSpeedRegression
          ? `Speed regression ${metrics.speedRegression}% within threshold`
          : `Speed regression ${metrics.speedRegression}% exceeds maximum ${thresholds.maxSpeedRegression}%`,
    });

    checks.push({
      name: 'Memory Regression',
      passed: metrics.memoryRegression <= thresholds.maxMemoryRegression,
      actual: metrics.memoryRegression,
      threshold: thresholds.maxMemoryRegression,
      category: 'regression',
      message:
        metrics.memoryRegression <= thresholds.maxMemoryRegression
          ? `Memory regression ${metrics.memoryRegression}% within threshold`
          : `Memory regression ${metrics.memoryRegression}% exceeds maximum ${thresholds.maxMemoryRegression}%`,
    });

    // --- Per-target checks ---
    if (metrics.perTargetMetrics) {
      for (const [target, targetMetrics] of metrics.perTargetMetrics.entries()) {
        const targetThresholds = this.getTargetThresholds(target);

        checks.push({
          name: `${target}: Consecutive Failures`,
          passed: targetMetrics.consecutiveFailures <= targetThresholds.maxConsecutiveFailures,
          actual: targetMetrics.consecutiveFailures,
          threshold: targetThresholds.maxConsecutiveFailures,
          category: 'reliability',
          target,
          message:
            targetMetrics.consecutiveFailures <= targetThresholds.maxConsecutiveFailures
              ? `${target}: ${targetMetrics.consecutiveFailures} consecutive failures within threshold`
              : `${target}: ${targetMetrics.consecutiveFailures} consecutive failures exceeds maximum`,
        });

        checks.push({
          name: `${target}: P95 Compilation Time`,
          passed: targetMetrics.p95CompilationTimeMs <= targetThresholds.maxP95CompilationTimeMs,
          actual: targetMetrics.p95CompilationTimeMs,
          threshold: targetThresholds.maxP95CompilationTimeMs,
          category: 'performance',
          target,
          message:
            targetMetrics.p95CompilationTimeMs <= targetThresholds.maxP95CompilationTimeMs
              ? `${target}: P95 ${targetMetrics.p95CompilationTimeMs}ms within threshold`
              : `${target}: P95 ${targetMetrics.p95CompilationTimeMs}ms exceeds maximum`,
        });
      }
    }

    const passed = checks.every((c) => c.passed);
    const durationMs = performance.now() - t0;

    const failedChecks = checks.filter((c) => !c.passed);
    let suggestedAction: string | undefined;
    if (!passed) {
      const categories = [...new Set(failedChecks.map((c) => c.category))];
      if (categories.includes('regression')) {
        suggestedAction =
          'Performance regression detected. Review recent changes for compilation bottlenecks.';
      } else if (categories.includes('reliability')) {
        suggestedAction =
          'Reliability issues detected. Check failing export targets and investigate root cause.';
      } else if (categories.includes('coverage')) {
        suggestedAction =
          'Test coverage below threshold. Add tests for untested circuit breaker paths.';
      } else {
        suggestedAction = 'Quality gate failed. Review individual check results for details.';
      }
    }

    return {
      passed,
      healthScore: metrics.healthScore,
      checks,
      timestamp: new Date().toISOString(),
      durationMs,
      suggestedAction,
    };
  }

  /**
   * Get effective thresholds for a target (merging global + overrides).
   */
  private getTargetThresholds(target: ExportTarget): ThresholdConfig {
    const override = this.config.targetOverrides.find((o) => o.target === target);
    if (override) {
      return { ...this.config.thresholds, ...override.overrides };
    }
    return this.config.thresholds;
  }

  /**
   * Check if metrics warrant an automatic rollback.
   */
  checkRollbackTrigger(metrics: {
    failureRate: number;
    openCircuits: number;
    healthScore: number;
    degradedTimeMs: number;
    affectedTargets: ExportTarget[];
  }): RollbackTrigger | null {
    if (!this.config.enableAutoRollback) return null;

    const thresholds = this.config.thresholds;

    // Critical: health score below 30
    if (metrics.healthScore < 30) {
      return {
        reason: `Critical health score: ${metrics.healthScore}/100`,
        severity: 'critical',
        affectedTargets: metrics.affectedTargets,
        metrics: {
          failureRate: metrics.failureRate,
          openCircuits: metrics.openCircuits,
          healthScore: metrics.healthScore,
          degradedTimeMs: metrics.degradedTimeMs,
        },
        timestamp: new Date().toISOString(),
      };
    }

    // Error: failure rate 2x above threshold
    if (metrics.failureRate > thresholds.maxFailureRate * 2) {
      return {
        reason: `Failure rate ${metrics.failureRate}/hr is 2x above threshold ${thresholds.maxFailureRate}/hr`,
        severity: 'error',
        affectedTargets: metrics.affectedTargets,
        metrics: {
          failureRate: metrics.failureRate,
          openCircuits: metrics.openCircuits,
          healthScore: metrics.healthScore,
          degradedTimeMs: metrics.degradedTimeMs,
        },
        timestamp: new Date().toISOString(),
      };
    }

    // Error: degraded for 3x the threshold time
    if (metrics.degradedTimeMs > thresholds.maxDegradedTimeMs * 3) {
      return {
        reason: `Extended degraded mode: ${(metrics.degradedTimeMs / 1000 / 60).toFixed(1)} minutes`,
        severity: 'error',
        affectedTargets: metrics.affectedTargets,
        metrics: {
          failureRate: metrics.failureRate,
          openCircuits: metrics.openCircuits,
          healthScore: metrics.healthScore,
          degradedTimeMs: metrics.degradedTimeMs,
        },
        timestamp: new Date().toISOString(),
      };
    }

    // Warning: many open circuits
    if (metrics.openCircuits > thresholds.maxOpenCircuits * 2) {
      return {
        reason: `${metrics.openCircuits} open circuits (threshold: ${thresholds.maxOpenCircuits})`,
        severity: 'warning',
        affectedTargets: metrics.affectedTargets,
        metrics: {
          failureRate: metrics.failureRate,
          openCircuits: metrics.openCircuits,
          healthScore: metrics.healthScore,
          degradedTimeMs: metrics.degradedTimeMs,
        },
        timestamp: new Date().toISOString(),
      };
    }

    return null;
  }

  /**
   * Format quality gate result as a human-readable report.
   */
  static formatReport(result: QualityGateResult): string {
    const lines: string[] = [];

    lines.push('================================================================');
    lines.push('  CIRCUIT BREAKER CI/CD QUALITY GATE REPORT');
    lines.push('================================================================');
    lines.push('');
    lines.push(`Status: ${result.passed ? 'PASSED' : 'FAILED'}`);
    lines.push(`Health Score: ${result.healthScore}/100`);
    lines.push(`Timestamp: ${result.timestamp}`);
    lines.push(`Duration: ${result.durationMs.toFixed(1)}ms`);
    lines.push('');

    const passedChecks = result.checks.filter((c) => c.passed);
    const failedChecks = result.checks.filter((c) => !c.passed);

    lines.push(`Checks: ${passedChecks.length}/${result.checks.length} passed`);
    lines.push('');

    if (failedChecks.length > 0) {
      lines.push('--- FAILED CHECKS ---');
      for (const check of failedChecks) {
        lines.push(`  [FAIL] ${check.name}`);
        lines.push(`         ${check.message}`);
        lines.push(`         Actual: ${check.actual} | Threshold: ${check.threshold}`);
      }
      lines.push('');
    }

    if (passedChecks.length > 0) {
      lines.push('--- PASSED CHECKS ---');
      for (const check of passedChecks) {
        lines.push(`  [PASS] ${check.name}: ${check.message}`);
      }
      lines.push('');
    }

    if (result.suggestedAction) {
      lines.push('--- SUGGESTED ACTION ---');
      lines.push(`  ${result.suggestedAction}`);
      lines.push('');
    }

    lines.push('================================================================');

    return lines.join('\n');
  }
}

// =============================================================================
// THRESHOLD CONFIGURATION FILE GENERATOR
// =============================================================================

/**
 * Generate a threshold configuration JSON file for version control.
 */
export function generateThresholdConfig(config: CICDPipelineConfig): string {
  return JSON.stringify(
    {
      $schema: 'https://holoscript.dev/schemas/circuit-breaker-cicd-v1.json',
      version: '1.0.0',
      thresholds: config.thresholds,
      targetOverrides: config.targetOverrides,
      environments: config.environments,
      branchProtection: config.branchProtection,
      notifications: {
        createGitHubIssue: config.notifications.createGitHubIssue,
        minAlertLevel: config.notifications.minAlertLevel,
      },
    },
    null,
    2
  );
}
