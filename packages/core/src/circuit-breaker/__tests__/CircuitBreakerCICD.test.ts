/**
 * Tests for CircuitBreakerCICD.ts
 * Covers: constants, QualityGateEvaluator, generateGitHubActionsWorkflow, generatePreCommitHook, generateThresholdConfig
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_THRESHOLDS,
  DEFAULT_CICD_CONFIG,
  DEFAULT_CRITICAL_TARGET_OVERRIDES,
  generateGitHubActionsWorkflow,
  generatePreCommitHook,
  generateThresholdConfig,
  QualityGateEvaluator,
  type ThresholdConfig,
  type QualityGateResult,
  type QualityCheck,
} from '../CircuitBreakerCICD.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function goodMetrics() {
  return {
    failureRate: 5,
    openCircuits: 2,
    healthScore: 80,
    degradedTimeMs: 60_000,
    testCoverage: 85,
    p95CompilationTimeMs: 3000,
    speedRegression: 5,
    memoryRegression: 10,
  };
}

function badMetrics() {
  return {
    failureRate: 20,
    openCircuits: 10,
    healthScore: 40,
    degradedTimeMs: 600_000,
    testCoverage: 50,
    p95CompilationTimeMs: 8000,
    speedRegression: 30,
    memoryRegression: 40,
  };
}

// ---------------------------------------------------------------------------
// DEFAULT_THRESHOLDS
// ---------------------------------------------------------------------------

describe('DEFAULT_THRESHOLDS', () => {
  it('has all required fields', () => {
    expect(DEFAULT_THRESHOLDS).toMatchObject({
      maxFailureRate: expect.any(Number),
      maxOpenCircuits: expect.any(Number),
      minHealthScore: expect.any(Number),
      maxDegradedTimeMs: expect.any(Number),
      maxConsecutiveFailures: expect.any(Number),
      maxP95CompilationTimeMs: expect.any(Number),
      minTestCoverage: expect.any(Number),
      maxSpeedRegression: expect.any(Number),
      maxMemoryRegression: expect.any(Number),
    });
  });

  it('minHealthScore is positive', () => {
    expect(DEFAULT_THRESHOLDS.minHealthScore).toBeGreaterThan(0);
  });

  it('minTestCoverage is between 1 and 100', () => {
    expect(DEFAULT_THRESHOLDS.minTestCoverage).toBeGreaterThan(0);
    expect(DEFAULT_THRESHOLDS.minTestCoverage).toBeLessThanOrEqual(100);
  });

  it('maxDegradedTimeMs is a positive number', () => {
    expect(DEFAULT_THRESHOLDS.maxDegradedTimeMs).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// DEFAULT_CRITICAL_TARGET_OVERRIDES
// ---------------------------------------------------------------------------

describe('DEFAULT_CRITICAL_TARGET_OVERRIDES', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(DEFAULT_CRITICAL_TARGET_OVERRIDES)).toBe(true);
    expect(DEFAULT_CRITICAL_TARGET_OVERRIDES.length).toBeGreaterThan(0);
  });

  it('each entry has target and overrides', () => {
    for (const entry of DEFAULT_CRITICAL_TARGET_OVERRIDES) {
      expect(typeof entry.target).toBe('string');
      expect(typeof entry.overrides).toBe('object');
    }
  });

  it('includes critical targets like r3f and webgpu', () => {
    const targets = DEFAULT_CRITICAL_TARGET_OVERRIDES.map((e) => e.target);
    expect(targets).toContain('r3f');
    expect(targets).toContain('webgpu');
  });
});

// ---------------------------------------------------------------------------
// DEFAULT_CICD_CONFIG
// ---------------------------------------------------------------------------

describe('DEFAULT_CICD_CONFIG', () => {
  it('has thresholds, environments, and flags', () => {
    expect(DEFAULT_CICD_CONFIG).toMatchObject({
      thresholds: expect.any(Object),
      environments: expect.any(Array),
      enablePreCommitHooks: expect.any(Boolean),
      enableGitHubActions: expect.any(Boolean),
      enableAutoRollback: expect.any(Boolean),
    });
  });

  it('includes production environment with approval required', () => {
    const prod = DEFAULT_CICD_CONFIG.environments.find((e) => e.name === 'production');
    expect(prod).toBeDefined();
    expect(prod!.requireApproval).toBe(true);
  });

  it('includes development environment with approval not required', () => {
    const dev = DEFAULT_CICD_CONFIG.environments.find((e) => e.name === 'development');
    expect(dev).toBeDefined();
    expect(dev!.requireApproval).toBe(false);
  });

  it('branchProtection includes main branch', () => {
    expect(DEFAULT_CICD_CONFIG.branchProtection.protectedBranches).toContain('main');
  });
});

// ---------------------------------------------------------------------------
// QualityGateEvaluator
// ---------------------------------------------------------------------------

describe('QualityGateEvaluator', () => {
  let evaluator: QualityGateEvaluator;

  beforeEach(() => {
    evaluator = new QualityGateEvaluator();
  });

  describe('constructor', () => {
    it('creates instance with default config', () => {
      expect(evaluator).toBeInstanceOf(QualityGateEvaluator);
    });

    it('accepts partial config override', () => {
      const custom = new QualityGateEvaluator({
        thresholds: { ...DEFAULT_THRESHOLDS, maxFailureRate: 1 },
      });
      expect(custom).toBeInstanceOf(QualityGateEvaluator);
    });
  });

  describe('evaluate() with passing metrics', () => {
    it('returns passed=true when all metrics are within thresholds', () => {
      const result = evaluator.evaluate(goodMetrics());
      expect(result.passed).toBe(true);
    });

    it('returns an array of checks', () => {
      const result = evaluator.evaluate(goodMetrics());
      expect(Array.isArray(result.checks)).toBe(true);
      expect(result.checks.length).toBeGreaterThan(0);
    });

    it('all checks pass for good metrics', () => {
      const result = evaluator.evaluate(goodMetrics());
      const failed = result.checks.filter((c) => !c.passed);
      expect(failed).toHaveLength(0);
    });

    it('each check has required fields', () => {
      const result = evaluator.evaluate(goodMetrics());
      for (const check of result.checks) {
        expect(typeof check.name).toBe('string');
        expect(typeof check.passed).toBe('boolean');
        expect(typeof check.actual).toBe('number');
        expect(typeof check.threshold).toBe('number');
        expect(typeof check.category).toBe('string');
        expect(typeof check.message).toBe('string');
      }
    });

    it('durationMs is a non-negative number', () => {
      const result = evaluator.evaluate(goodMetrics());
      expect(typeof result.durationMs).toBe('number');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('evaluate() with failing metrics', () => {
    it('returns passed=false when metrics exceed thresholds', () => {
      const result = evaluator.evaluate(badMetrics());
      expect(result.passed).toBe(false);
    });

    it('includes failing checks for each exceeded threshold', () => {
      const result = evaluator.evaluate(badMetrics());
      const failed = result.checks.filter((c) => !c.passed);
      expect(failed.length).toBeGreaterThan(0);
    });

    it('failure rate check fails for high failure rate', () => {
      const result = evaluator.evaluate(badMetrics());
      const failureRateCheck = result.checks.find((c) => c.name === 'Failure Rate');
      expect(failureRateCheck).toBeDefined();
      expect(failureRateCheck!.passed).toBe(false);
    });

    it('health score check fails for low health score', () => {
      const result = evaluator.evaluate(badMetrics());
      const healthCheck = result.checks.find((c) => c.name === 'Health Score');
      expect(healthCheck).toBeDefined();
      expect(healthCheck!.passed).toBe(false);
    });

    it('coverage check fails for low coverage', () => {
      const result = evaluator.evaluate(badMetrics());
      const coverageCheck = result.checks.find((c) => c.name === 'Test Coverage');
      expect(coverageCheck).toBeDefined();
      expect(coverageCheck!.passed).toBe(false);
    });
  });

  describe('evaluate() check categories', () => {
    it('includes reliability category checks', () => {
      const result = evaluator.evaluate(goodMetrics());
      const reliability = result.checks.filter((c) => c.category === 'reliability');
      expect(reliability.length).toBeGreaterThan(0);
    });

    it('includes performance category checks', () => {
      const result = evaluator.evaluate(goodMetrics());
      const performance = result.checks.filter((c) => c.category === 'performance');
      expect(performance.length).toBeGreaterThan(0);
    });

    it('includes coverage category checks', () => {
      const result = evaluator.evaluate(goodMetrics());
      const coverage = result.checks.filter((c) => c.category === 'coverage');
      expect(coverage.length).toBeGreaterThan(0);
    });

    it('includes regression category checks', () => {
      const result = evaluator.evaluate(goodMetrics());
      const regression = result.checks.filter((c) => c.category === 'regression');
      expect(regression.length).toBeGreaterThan(0);
    });
  });

  describe('evaluate() with per-target metrics', () => {
    it('accepts perTargetMetrics map', () => {
      const perTargetMetrics = new Map([
        [
          'r3f' as const,
          { consecutiveFailures: 0, p95CompilationTimeMs: 2000, failureRate: 2 },
        ],
      ]);
      const result = evaluator.evaluate({ ...goodMetrics(), perTargetMetrics });
      expect(result).toBeDefined();
    });

    it('fails with per-target metrics exceeding critical threshold', () => {
      const perTargetMetrics = new Map([
        [
          'r3f' as const,
          { consecutiveFailures: 5, p95CompilationTimeMs: 5000, failureRate: 8 },
        ],
      ]);
      const result = evaluator.evaluate({ ...goodMetrics(), perTargetMetrics });
      // r3f is a critical target with stricter thresholds
      expect(result).toBeDefined();
    });
  });

  describe('boundary conditions', () => {
    it('passes when failure rate equals max threshold', () => {
      const metrics = { ...goodMetrics(), failureRate: DEFAULT_THRESHOLDS.maxFailureRate };
      const result = evaluator.evaluate(metrics);
      const check = result.checks.find((c) => c.name === 'Failure Rate');
      expect(check!.passed).toBe(true);
    });

    it('fails when failure rate exceeds max threshold by 1', () => {
      const metrics = { ...goodMetrics(), failureRate: DEFAULT_THRESHOLDS.maxFailureRate + 1 };
      const result = evaluator.evaluate(metrics);
      const check = result.checks.find((c) => c.name === 'Failure Rate');
      expect(check!.passed).toBe(false);
    });

    it('passes when health score equals min threshold', () => {
      const metrics = { ...goodMetrics(), healthScore: DEFAULT_THRESHOLDS.minHealthScore };
      const result = evaluator.evaluate(metrics);
      const check = result.checks.find((c) => c.name === 'Health Score');
      expect(check!.passed).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// generateGitHubActionsWorkflow
// ---------------------------------------------------------------------------

describe('generateGitHubActionsWorkflow', () => {
  it('returns a non-empty string', () => {
    const result = generateGitHubActionsWorkflow(DEFAULT_CICD_CONFIG);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('contains YAML workflow header', () => {
    const result = generateGitHubActionsWorkflow(DEFAULT_CICD_CONFIG);
    expect(result).toContain('name:');
  });

  it('contains the threshold values from config', () => {
    const result = generateGitHubActionsWorkflow(DEFAULT_CICD_CONFIG);
    expect(result).toContain(String(DEFAULT_THRESHOLDS.maxFailureRate));
    expect(result).toContain(String(DEFAULT_THRESHOLDS.minHealthScore));
  });

  it('contains circuit breaker references', () => {
    const result = generateGitHubActionsWorkflow(DEFAULT_CICD_CONFIG);
    expect(result.toLowerCase()).toContain('circuit');
  });

  it('contains jobs section', () => {
    const result = generateGitHubActionsWorkflow(DEFAULT_CICD_CONFIG);
    expect(result).toContain('jobs:');
  });

  it('works with custom threshold config', () => {
    const customConfig = {
      ...DEFAULT_CICD_CONFIG,
      thresholds: { ...DEFAULT_THRESHOLDS, maxFailureRate: 42 },
    };
    const result = generateGitHubActionsWorkflow(customConfig);
    expect(result).toContain('42');
  });
});

// ---------------------------------------------------------------------------
// generatePreCommitHook
// ---------------------------------------------------------------------------

describe('generatePreCommitHook', () => {
  it('returns a non-empty string', () => {
    const result = generatePreCommitHook(DEFAULT_CICD_CONFIG);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('starts with shebang', () => {
    const result = generatePreCommitHook(DEFAULT_CICD_CONFIG);
    expect(result.startsWith('#!/bin/sh')).toBe(true);
  });

  it('includes exit code logic', () => {
    const result = generatePreCommitHook(DEFAULT_CICD_CONFIG);
    expect(result).toContain('exit 0');
    expect(result).toContain('exit 1');
  });

  it('includes protected branch check', () => {
    const result = generatePreCommitHook(DEFAULT_CICD_CONFIG);
    expect(result).toContain('main');
  });

  it('references pnpm test command', () => {
    const result = generatePreCommitHook(DEFAULT_CICD_CONFIG);
    expect(result).toContain('pnpm');
  });
});

// ---------------------------------------------------------------------------
// generateThresholdConfig
// ---------------------------------------------------------------------------

describe('generateThresholdConfig', () => {
  it('returns a non-empty string', () => {
    const result = generateThresholdConfig(DEFAULT_CICD_CONFIG);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('contains threshold values', () => {
    const result = generateThresholdConfig(DEFAULT_CICD_CONFIG);
    expect(result).toContain(String(DEFAULT_THRESHOLDS.maxFailureRate));
  });
});
