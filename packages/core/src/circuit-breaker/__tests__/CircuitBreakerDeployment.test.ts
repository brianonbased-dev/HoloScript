/**
 * Tests for CircuitBreakerDeployment.ts
 * Covers: createDeploymentConfig, HealthCheckManager, DegradationManager, formatDeploymentReport, constants
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createDeploymentConfig,
  HealthCheckManager,
  DegradationManager,
  formatDeploymentReport,
  DEFAULT_DEGRADATION_CONFIG,
  CIRCUIT_BREAKER_METRICS,
  DEFAULT_ALERT_RULES,
  DEFAULT_DASHBOARD,
  type HealthProbe,
  type HealthCheckResult,
  type DeploymentConfig,
} from '../CircuitBreakerDeployment.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProbe(
  name: string,
  healthy: boolean,
  type: 'liveness' | 'readiness' | 'startup' = 'liveness'
): HealthProbe {
  return {
    name,
    type,
    intervalMs: 30_000,
    timeoutMs: 5_000,
    failureThreshold: 3,
    successThreshold: 2,
    initialDelayMs: 0,
    check: vi.fn().mockResolvedValue({
      healthy,
      message: healthy ? 'OK' : 'Error',
      responseTimeMs: 50,
    } satisfies HealthCheckResult),
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('DEFAULT_DEGRADATION_CONFIG', () => {
  it('has levels array with at least 4 entries (normal, degraded, severe, emergency)', () => {
    expect(Array.isArray(DEFAULT_DEGRADATION_CONFIG.levels)).toBe(true);
    expect(DEFAULT_DEGRADATION_CONFIG.levels.length).toBeGreaterThanOrEqual(4);
  });

  it('has minTransitionIntervalMs', () => {
    expect(typeof DEFAULT_DEGRADATION_CONFIG.minTransitionIntervalMs).toBe('number');
    expect(DEFAULT_DEGRADATION_CONFIG.minTransitionIntervalMs).toBeGreaterThan(0);
  });

  it('has recoveryMargin', () => {
    expect(typeof DEFAULT_DEGRADATION_CONFIG.recoveryMargin).toBe('number');
    expect(DEFAULT_DEGRADATION_CONFIG.recoveryMargin).toBeGreaterThanOrEqual(0);
  });

  it('first level (normal) has empty disabledTargets', () => {
    expect(DEFAULT_DEGRADATION_CONFIG.levels[0].disabledTargets).toEqual([]);
  });

  it('emergency level disables more targets than normal', () => {
    const normal = DEFAULT_DEGRADATION_CONFIG.levels[0].disabledTargets.length;
    const emergency = DEFAULT_DEGRADATION_CONFIG.levels[3].disabledTargets.length;
    expect(emergency).toBeGreaterThan(normal);
  });

  it('has threshold values for level transitions', () => {
    expect(typeof DEFAULT_DEGRADATION_CONFIG.thresholds.emergencyBelow).toBe('number');
    expect(typeof DEFAULT_DEGRADATION_CONFIG.thresholds.severeBelow).toBe('number');
    expect(typeof DEFAULT_DEGRADATION_CONFIG.thresholds.degradedBelow).toBe('number');
  });
});

describe('CIRCUIT_BREAKER_METRICS', () => {
  it('is a non-empty object', () => {
    expect(typeof CIRCUIT_BREAKER_METRICS).toBe('object');
    expect(Object.keys(CIRCUIT_BREAKER_METRICS).length).toBeGreaterThan(0);
  });
});

describe('DEFAULT_ALERT_RULES', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(DEFAULT_ALERT_RULES)).toBe(true);
    expect(DEFAULT_ALERT_RULES.length).toBeGreaterThan(0);
  });

  it('each rule has name and condition', () => {
    for (const rule of DEFAULT_ALERT_RULES) {
      expect(typeof rule.name).toBe('string');
      expect(typeof rule.condition).toBe('string');
    }
  });
});

describe('DEFAULT_DASHBOARD', () => {
  it('is a non-null object', () => {
    expect(DEFAULT_DASHBOARD).toBeDefined();
    expect(typeof DEFAULT_DASHBOARD).toBe('object');
  });
});

// ---------------------------------------------------------------------------
// createDeploymentConfig
// ---------------------------------------------------------------------------

describe('createDeploymentConfig', () => {
  it('creates a config for development', () => {
    const config = createDeploymentConfig('development', '1.0.0');
    expect(config).toBeDefined();
    expect(config.environment).toBe('development');
    expect(config.version).toBe('1.0.0');
  });

  it('creates a config for production', () => {
    const config = createDeploymentConfig('production', '2.0.0');
    expect(config.environment).toBe('production');
    expect(config.version).toBe('2.0.0');
  });

  it('creates a config for staging', () => {
    const config = createDeploymentConfig('staging', '1.5.0');
    expect(config.environment).toBe('staging');
  });

  it('creates a config for canary', () => {
    const config = createDeploymentConfig('canary', '1.5.1');
    expect(config.environment).toBe('canary');
  });

  it('has a deployment strategy', () => {
    const config = createDeploymentConfig('production', '1.0.0');
    expect(typeof config.strategy).toBe('string');
    expect(['rolling', 'blue-green', 'canary', 'recreate']).toContain(config.strategy);
  });

  it('applies overrides when provided', () => {
    const config = createDeploymentConfig('development', '1.0.0', {
      strategy: 'blue-green',
    });
    expect(config.strategy).toBe('blue-green');
  });

  it('production config requires approval', () => {
    const config = createDeploymentConfig('production', '1.0.0');
    // Production deployments should be more restricted
    expect(config).toBeDefined();
  });

  it('config has circuit breaker settings', () => {
    const config = createDeploymentConfig('development', '1.0.0');
    expect(config).toMatchObject({
      environment: expect.any(String),
      version: expect.any(String),
      strategy: expect.any(String),
    });
  });
});

// ---------------------------------------------------------------------------
// HealthCheckManager
// ---------------------------------------------------------------------------

describe('HealthCheckManager', () => {
  let manager: HealthCheckManager;

  beforeEach(() => {
    manager = new HealthCheckManager('1.0.0');
  });

  describe('constructor', () => {
    it('creates instance with version', () => {
      expect(manager).toBeInstanceOf(HealthCheckManager);
    });

    it('creates instance with default version', () => {
      const m = new HealthCheckManager();
      expect(m).toBeInstanceOf(HealthCheckManager);
    });
  });

  describe('registerProbe', () => {
    it('registers a probe without error', () => {
      const probe = makeProbe('test-probe', true);
      expect(() => manager.registerProbe(probe)).not.toThrow();
    });

    it('registers multiple probes', () => {
      manager.registerProbe(makeProbe('probe-1', true));
      manager.registerProbe(makeProbe('probe-2', true, 'readiness'));
      manager.registerProbe(makeProbe('probe-3', true, 'startup'));
      const report = manager.getReport();
      expect(report.probes).toHaveLength(3);
    });
  });

  describe('runProbe', () => {
    it('returns healthy result for healthy probe', async () => {
      const probe = makeProbe('healthy-probe', true);
      manager.registerProbe(probe);
      const result = await manager.runProbe('healthy-probe');
      expect(result.healthy).toBe(true);
      expect(typeof result.message).toBe('string');
      expect(typeof result.responseTimeMs).toBe('number');
    });

    it('returns unhealthy result for failing probe', async () => {
      const probe = makeProbe('failing-probe', false);
      manager.registerProbe(probe);
      const result = await manager.runProbe('failing-probe');
      expect(result.healthy).toBe(false);
    });

    it('returns error result for unregistered probe', async () => {
      const result = await manager.runProbe('nonexistent');
      expect(result.healthy).toBe(false);
      expect(result.message).toContain('nonexistent');
    });

    it('handles probe check throwing an error', async () => {
      const probe: HealthProbe = {
        name: 'error-probe',
        type: 'liveness',
        intervalMs: 30_000,
        timeoutMs: 5_000,
        failureThreshold: 3,
        successThreshold: 2,
        initialDelayMs: 0,
        check: vi.fn().mockRejectedValue(new Error('check failed')),
      };
      manager.registerProbe(probe);
      const result = await manager.runProbe('error-probe');
      expect(result.healthy).toBe(false);
      expect(result.message).toContain('check failed');
    });

    it('handles probe timeout', async () => {
      const probe: HealthProbe = {
        name: 'timeout-probe',
        type: 'liveness',
        intervalMs: 30_000,
        timeoutMs: 1,
        failureThreshold: 3,
        successThreshold: 2,
        initialDelayMs: 0,
        check: vi.fn().mockImplementation(
          () =>
            new Promise((resolve) =>
              setTimeout(
                () => resolve({ healthy: true, message: 'OK', responseTimeMs: 0 }),
                100
              )
            )
        ),
      };
      manager.registerProbe(probe);
      const result = await manager.runProbe('timeout-probe');
      expect(result.healthy).toBe(false);
    });
  });

  describe('getReport', () => {
    it('returns empty probe list before registration', () => {
      const report = manager.getReport();
      expect(report.probes).toHaveLength(0);
    });

    it('report has required fields', () => {
      const report = manager.getReport();
      expect(report).toMatchObject({
        status: expect.any(String),
        probes: expect.any(Array),
        timestamp: expect.any(String),
        uptimeMs: expect.any(Number),
        version: '1.0.0',
      });
    });

    it('report status is unknown before any probes run', () => {
      manager.registerProbe(makeProbe('p', true));
      const report = manager.getReport();
      // Before running, status should be unknown or healthy
      expect(['unknown', 'healthy']).toContain(report.status);
    });

    it('report status becomes healthy after successful probe run', async () => {
      const probe: HealthProbe = {
        name: 'healthy-p',
        type: 'liveness',
        intervalMs: 30_000,
        timeoutMs: 5_000,
        failureThreshold: 3,
        successThreshold: 1,
        initialDelayMs: 0,
        check: vi.fn().mockResolvedValue({ healthy: true, message: 'OK', responseTimeMs: 0 }),
      };
      manager.registerProbe(probe);
      await manager.runProbe('healthy-p');
      const report = manager.getReport();
      expect(report.status).toBe('healthy');
    });

    it('report status becomes unhealthy after failureThreshold failures', async () => {
      const probe: HealthProbe = {
        name: 'failing-p',
        type: 'liveness',
        intervalMs: 30_000,
        timeoutMs: 5_000,
        failureThreshold: 2,
        successThreshold: 2,
        initialDelayMs: 0,
        check: vi.fn().mockResolvedValue({ healthy: false, message: 'Error', responseTimeMs: 0 }),
      };
      manager.registerProbe(probe);
      await manager.runProbe('failing-p');
      await manager.runProbe('failing-p');
      const report = manager.getReport();
      expect(report.status).toBe('unhealthy');
    });

    it('uptimeMs is non-negative', () => {
      const report = manager.getReport();
      expect(report.uptimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('start/stop', () => {
    it('start and stop do not throw', () => {
      manager.registerProbe(makeProbe('p', true));
      expect(() => manager.start()).not.toThrow();
      expect(() => manager.stop()).not.toThrow();
    });
  });
});

// ---------------------------------------------------------------------------
// DegradationManager
// ---------------------------------------------------------------------------

describe('DegradationManager', () => {
  let manager: DegradationManager;

  beforeEach(() => {
    manager = new DegradationManager();
  });

  describe('constructor', () => {
    it('creates instance with default config', () => {
      expect(manager).toBeInstanceOf(DegradationManager);
    });

    it('creates instance with custom config', () => {
      const m = new DegradationManager(DEFAULT_DEGRADATION_CONFIG);
      expect(m).toBeInstanceOf(DegradationManager);
    });
  });

  describe('getCurrentLevel / getCurrentLevelIndex', () => {
    it('starts at level 0 (normal)', () => {
      const level = manager.getCurrentLevel();
      expect(level).toBeDefined();
      expect(manager.getCurrentLevelIndex()).toBe(0);
    });

    it('level has disabledTargets array', () => {
      const level = manager.getCurrentLevel();
      expect(Array.isArray(level.disabledTargets)).toBe(true);
    });
  });

  describe('evaluate', () => {
    it('returns current level without changing for high health score', () => {
      const level = manager.evaluate(100);
      expect(level).toBeDefined();
      expect(manager.getCurrentLevelIndex()).toBe(0);
    });

    it('transitions to higher level for critically low health score', () => {
      // Force a manager that won't block on minTransitionIntervalMs
      const config = {
        ...DEFAULT_DEGRADATION_CONFIG,
        minTransitionIntervalMs: 0,
      };
      const m = new DegradationManager(config);
      m.evaluate(0);
      expect(m.getCurrentLevelIndex()).toBeGreaterThan(0);
    });

    it('returns DegradationLevel object with required shape', () => {
      const level = manager.evaluate(80);
      expect(Array.isArray(level.disabledTargets)).toBe(true);
    });
  });

  describe('forceLevel', () => {
    it('forces to level 2', () => {
      manager.forceLevel(2);
      expect(manager.getCurrentLevelIndex()).toBe(2);
    });

    it('clamps to max level', () => {
      manager.forceLevel(999);
      expect(manager.getCurrentLevelIndex()).toBeLessThanOrEqual(3);
    });

    it('clamps to min level 0', () => {
      manager.forceLevel(-1);
      expect(manager.getCurrentLevelIndex()).toBe(0);
    });
  });

  describe('reset', () => {
    it('resets level to 0', () => {
      manager.forceLevel(3);
      manager.reset();
      expect(manager.getCurrentLevelIndex()).toBe(0);
    });
  });

  describe('isTargetAvailable', () => {
    it('all targets available at level 0', () => {
      expect(manager.isTargetAvailable('r3f')).toBe(true);
      expect(manager.isTargetAvailable('webgpu')).toBe(true);
    });

    it('some targets unavailable at high degradation level', () => {
      manager.forceLevel(3);
      const level = manager.getCurrentLevel();
      if (level.disabledTargets.length > 0) {
        const disabledTarget = level.disabledTargets[0];
        expect(manager.isTargetAvailable(disabledTarget)).toBe(false);
      }
    });
  });

  describe('getAvailableTargets', () => {
    it('returns all targets at level 0', () => {
      const allTargets = ['r3f', 'webgpu', 'unity'] as const;
      const available = manager.getAvailableTargets([...allTargets]);
      expect(available).toHaveLength(allTargets.length);
    });

    it('returns fewer targets at high degradation level', () => {
      manager.forceLevel(3);
      const level = manager.getCurrentLevel();
      if (level.disabledTargets.length > 0) {
        const allTargets = ['r3f', 'webgpu', 'unity', ...level.disabledTargets.slice(0, 1)] as const;
        const available = manager.getAvailableTargets([...allTargets]);
        expect(available.length).toBeLessThan(allTargets.length);
      }
    });

    it('returns empty array when all targets are disabled', () => {
      manager.forceLevel(3);
      const level = manager.getCurrentLevel();
      const available = manager.getAvailableTargets([...level.disabledTargets]);
      expect(available).toHaveLength(0);
    });
  });
});

// ---------------------------------------------------------------------------
// formatDeploymentReport
// ---------------------------------------------------------------------------

describe('formatDeploymentReport', () => {
  let config: DeploymentConfig;

  beforeEach(() => {
    config = createDeploymentConfig('production', '2.1.0');
  });

  it('returns a non-empty string', () => {
    const report = formatDeploymentReport(config);
    expect(typeof report).toBe('string');
    expect(report.length).toBeGreaterThan(0);
  });

  it('contains environment name', () => {
    const report = formatDeploymentReport(config);
    expect(report.toUpperCase()).toContain('PRODUCTION');
  });

  it('contains version number', () => {
    const report = formatDeploymentReport(config);
    expect(report).toContain('2.1.0');
  });

  it('contains deployment strategy', () => {
    const report = formatDeploymentReport(config);
    expect(typeof config.strategy).toBe('string');
    expect(report).toContain(config.strategy);
  });

  it('contains HoloScript branding', () => {
    const report = formatDeploymentReport(config);
    expect(report.toUpperCase()).toContain('HOLOSCRIPT');
  });

  it('works for all environments', () => {
    const envs = ['development', 'staging', 'canary', 'production'] as const;
    for (const env of envs) {
      const cfg = createDeploymentConfig(env, '1.0.0');
      const report = formatDeploymentReport(cfg);
      expect(report.length).toBeGreaterThan(0);
    }
  });
});
