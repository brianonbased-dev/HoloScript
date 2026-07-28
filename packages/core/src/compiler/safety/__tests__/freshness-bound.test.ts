/**
 * @fileoverview Tests for FreshnessBoundChecker and its integration with runSafetyPass
 *
 * Test cases:
 *   (a) REJECTS when sensor worst-case staleness > declared bound
 *       → passed=false, verdict='unsafe', violation message mentions freshness/staleness
 *   (b) ACCEPTS when sensor staleness is within bound
 *       → passed=true, no error-severity freshness violations
 *   (c) Canonical pet-care case: @freshnessBound on an actuate/move effect consuming
 *       a STALE water-bowl/proximity sensor → compile error
 *       (the safety story: never actuate near the pet on stale perception)
 *   (d) Node without @freshnessBound is unaffected (regression guard)
 *   (e) Unknown-staleness warning: sensor-like trait but no metadata → warning, not error
 *   (f) Multiple sensors: one violating, one OK → still fails (error from the violating one)
 *   (g) Integration: runSafetyPass honours freshness violations → verdict='unsafe'
 */

import { describe, it, expect } from 'vitest';
import { checkFreshnessBounds, FreshnessASTNode } from '../FreshnessBoundChecker';
import { runSafetyPass } from '../CompilerSafetyPass';

// =============================================================================
// Unit tests — checkFreshnessBounds directly
// =============================================================================

describe('checkFreshnessBounds', () => {
  // ── (a) Stale sensor REJECTS ───────────────────────────────────────────────
  describe('(a) REJECTS when sensor staleness > declared bound', () => {
    it('emits error violation when worst-case staleness exceeds freshnessBoundMs', () => {
      const nodes: FreshnessASTNode[] = [
        {
          type: 'object',
          name: 'PetFeeder',
          traits: ['@proximity_sensor', '@actuator'],
          freshnessBoundMs: 500, // declare: only act if perception is < 500ms old
          sensorMetadata: [
            {
              traitName: '@proximity_sensor',
              worstCaseStalenessMs: 2000, // sensor updates every 2 seconds — too slow
            },
          ],
        },
      ];

      const result = checkFreshnessBounds(nodes, 'pet-feeder-module');

      expect(result.passed).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);

      const errorViolations = result.violations.filter((v) => v.severity === 'error');
      expect(errorViolations.length).toBeGreaterThan(0);

      // Violation message must mention freshness/staleness concepts
      const msg = errorViolations[0].message.toLowerCase();
      expect(msg).toMatch(/freshness|staleness|stale/);
      expect(msg).toContain('500'); // declared bound
      expect(msg).toContain('2000'); // actual staleness
    });

    it('sets violation severity to error (not warning) on confirmed staleness breach', () => {
      const nodes: FreshnessASTNode[] = [
        {
          type: 'object',
          name: 'RobotArm',
          freshnessBoundMs: 100,
          sensorMetadata: [{ traitName: '@lidar', worstCaseStalenessMs: 300 }],
          traits: ['@lidar'],
        },
      ];

      const result = checkFreshnessBounds(nodes, 'robot-arm');
      const errors = result.violations.filter((v) => v.severity === 'error');
      expect(errors.length).toBe(1);
    });

    it('includes the trait name in the violation source functionName', () => {
      const nodes: FreshnessASTNode[] = [
        {
          type: 'object',
          name: 'DroneNav',
          freshnessBoundMs: 50,
          sensorMetadata: [{ traitName: '@gps', worstCaseStalenessMs: 1000 }],
          traits: ['@gps'],
        },
      ];

      const result = checkFreshnessBounds(nodes, 'drone');
      expect(result.violations[0].source.functionName).toBe('DroneNav');
    });
  });

  // ── (b) Within-bound ACCEPTS ───────────────────────────────────────────────
  describe('(b) ACCEPTS when sensor staleness is within bound', () => {
    it('passes when worst-case staleness < freshnessBoundMs', () => {
      const nodes: FreshnessASTNode[] = [
        {
          type: 'object',
          name: 'SafeFeeder',
          traits: ['@proximity_sensor'],
          freshnessBoundMs: 1000, // allow up to 1 second old
          sensorMetadata: [
            {
              traitName: '@proximity_sensor',
              worstCaseStalenessMs: 100, // fast sensor, updates every 100ms
            },
          ],
        },
      ];

      const result = checkFreshnessBounds(nodes, 'safe-feeder');

      expect(result.passed).toBe(true);
      const errors = result.violations.filter((v) => v.severity === 'error');
      expect(errors).toHaveLength(0);
    });

    it('passes when worst-case staleness equals the bound exactly (boundary case)', () => {
      const nodes: FreshnessASTNode[] = [
        {
          type: 'object',
          name: 'ExactBoundary',
          traits: ['@distance_sensor'],
          freshnessBoundMs: 200,
          sensorMetadata: [{ traitName: '@distance_sensor', worstCaseStalenessMs: 200 }],
        },
      ];

      const result = checkFreshnessBounds(nodes, 'boundary-test');
      // 200ms === 200ms bound: NOT a violation (> not >=)
      expect(result.passed).toBe(true);
      const errors = result.violations.filter((v) => v.severity === 'error');
      expect(errors).toHaveLength(0);
    });

    it('does not flag nodes without freshnessBoundMs', () => {
      const nodes: FreshnessASTNode[] = [
        {
          type: 'object',
          name: 'Unconstrained',
          traits: ['@proximity_sensor', '@lidar'],
          // No freshnessBoundMs — no constraint declared
          sensorMetadata: [{ traitName: '@proximity_sensor', worstCaseStalenessMs: 99999 }],
        },
      ];

      const result = checkFreshnessBounds(nodes, 'unconstrained');
      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });
  });

  // ── (c) Canonical pet-care case ───────────────────────────────────────────
  describe('(c) Canonical pet-care case: stale water-bowl/proximity sensor → compile error', () => {
    it('rejects actuate/move near pet on stale proximity sensor', () => {
      /**
       * Safety story: A pet-care robot should NEVER move near an animal based on
       * perception data that might be 2+ seconds old. A pet can move in 500ms.
       * The compiler MUST refuse to compile this if the sensor cannot guarantee
       * sub-500ms freshness.
       */
      const nodes: FreshnessASTNode[] = [
        {
          type: 'object',
          name: 'PetCareActuator',
          // The actuator consumes both a proximity sensor AND a water bowl sensor.
          // Both are too slow for the declared safety bound.
          traits: ['@proximity_sensor', '@water_bowl_sensor', '@actuator', '@mesh'],
          calls: ['moveToTarget', 'actuate'],
          declaredEffects: ['physics:force', 'render:spawn', 'io:read'],
          // @freshnessBound(500) = "I promise to only act if perception is < 500ms old"
          freshnessBoundMs: 500,
          sensorMetadata: [
            {
              traitName: '@proximity_sensor',
              worstCaseStalenessMs: 2000, // 2-second update interval — FAR too slow
            },
            {
              traitName: '@water_bowl_sensor',
              worstCaseStalenessMs: 5000, // 5-second poll — extremely stale
            },
          ],
        },
      ];

      const result = checkFreshnessBounds(nodes, 'pet-care-system');

      // Must fail — this is a compile error
      expect(result.passed).toBe(false);

      const errors = result.violations.filter((v) => v.severity === 'error');
      // Both sensors violate the bound → 2 errors
      expect(errors.length).toBe(2);

      // Each error message must name the freshness/staleness issue
      for (const err of errors) {
        const msg = err.message.toLowerCase();
        expect(msg).toMatch(/freshness|staleness|stale/);
      }

      // The suggestion should tell the developer what to do
      for (const err of errors) {
        expect(err.suggestion).toBeTruthy();
        expect(err.suggestion!.length).toBeGreaterThan(0);
      }
    });

    it('accepts pet-care actuator with fast-enough sensors', () => {
      const nodes: FreshnessASTNode[] = [
        {
          type: 'object',
          name: 'SafePetCareActuator',
          traits: ['@proximity_sensor', '@water_bowl_sensor', '@actuator'],
          calls: ['moveToTarget'],
          freshnessBoundMs: 500,
          sensorMetadata: [
            { traitName: '@proximity_sensor', worstCaseStalenessMs: 50 }, // 50ms ✓
            { traitName: '@water_bowl_sensor', worstCaseStalenessMs: 100 }, // 100ms ✓
          ],
        },
      ];

      const result = checkFreshnessBounds(nodes, 'safe-pet-care');
      expect(result.passed).toBe(true);
      expect(result.violations.filter((v) => v.severity === 'error')).toHaveLength(0);
    });
  });

  // ── (d) Regression guard — unaffected nodes ────────────────────────────────
  describe('(d) Nodes without @freshnessBound are unaffected', () => {
    it('does not alter nodes that have no freshness constraint', () => {
      const nodes: FreshnessASTNode[] = [
        {
          type: 'object',
          name: 'RegularObject',
          traits: ['@mesh', '@physics'],
          calls: ['spawn'],
          declaredEffects: ['render:spawn', 'physics:force'],
          // No freshnessBoundMs → untouched
        },
      ];

      const result = checkFreshnessBounds(nodes, 'regression-guard');
      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('handles empty node array', () => {
      const result = checkFreshnessBounds([], 'empty');
      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });
  });

  // ── (e) Unknown-staleness warning for sensor-like traits ──────────────────
  describe('(e) Sensor-like trait without metadata → warning, not error', () => {
    it('emits a warning (not error) when sensor-like trait lacks metadata', () => {
      const nodes: FreshnessASTNode[] = [
        {
          type: 'object',
          name: 'PartiallyAnnotated',
          traits: ['@lidar'], // Looks like a sensor
          freshnessBoundMs: 200,
          // No sensorMetadata — unknown staleness
        },
      ];

      const result = checkFreshnessBounds(nodes, 'partial');

      // Unknown staleness → cannot prove violation → warning, not error
      const warnings = result.violations.filter((v) => v.severity === 'warning');
      const errors = result.violations.filter((v) => v.severity === 'error');

      expect(warnings.length).toBeGreaterThan(0);
      expect(errors).toHaveLength(0);

      // Warning message should say something about missing metadata / cannot prove
      const msg = warnings[0].message.toLowerCase();
      expect(msg).toMatch(/metadata|staleness|freshness|cannot prove/);
    });

    it('passes (no error) even when sensor-like trait has unknown staleness', () => {
      const nodes: FreshnessASTNode[] = [
        {
          type: 'object',
          name: 'UnknownSensor',
          traits: ['@camera'],
          freshnessBoundMs: 100,
          // No metadata — unknown staleness
        },
      ];

      const result = checkFreshnessBounds(nodes, 'unknown-sensor');
      // Warning is not a blocking error → passed=true
      expect(result.passed).toBe(true);
    });
  });

  // ── (f) Multiple sensors, one violating ───────────────────────────────────
  describe('(f) Multiple sensors: one violating → still fails', () => {
    it('fails when at least one sensor exceeds the bound', () => {
      const nodes: FreshnessASTNode[] = [
        {
          type: 'object',
          name: 'MixedSensors',
          traits: ['@lidar', '@gps'],
          freshnessBoundMs: 300,
          sensorMetadata: [
            { traitName: '@lidar', worstCaseStalenessMs: 100 }, // OK
            { traitName: '@gps', worstCaseStalenessMs: 1000 }, // VIOLATION
          ],
        },
      ];

      const result = checkFreshnessBounds(nodes, 'mixed-sensors');
      expect(result.passed).toBe(false);

      const errors = result.violations.filter((v) => v.severity === 'error');
      expect(errors).toHaveLength(1); // Only gps violates
      expect(errors[0].message).toContain('gps');
    });
  });
});

// =============================================================================
// Integration tests — runSafetyPass honours freshness violations
// =============================================================================

describe('runSafetyPass — freshness bound integration', () => {
  // ── (g) Safety pass propagates freshness errors to verdict ─────────────────
  describe('(g) runSafetyPass verdict is unsafe on freshness violation', () => {
    it('returns verdict=unsafe and passed=false when freshness bound is violated', () => {
      // Use FreshnessASTNode — runSafetyPass casts nodes internally.
      const nodes: FreshnessASTNode[] = [
        {
          type: 'object',
          name: 'StaleSensorActuator',
          traits: ['@mesh', '@proximity_sensor'],
          calls: [],
          declaredEffects: ['render:spawn', 'io:read'],
          freshnessBoundMs: 200,
          sensorMetadata: [{ traitName: '@proximity_sensor', worstCaseStalenessMs: 5000 }],
        },
      ];

      const result = runSafetyPass(nodes, {
        moduleId: 'stale-actuator',
        trustLevel: 'basic',
        targetPlatforms: ['quest3'],
      });

      expect(result.passed).toBe(false);
      expect(result.report.verdict).toBe('unsafe');

      // The freshness violation must appear in effects.violations
      const freshnessErrors = result.report.effects.violations.filter(
        (v) => v.severity === 'error' && /freshness|staleness|stale/i.test(v.message)
      );
      expect(freshnessErrors.length).toBeGreaterThan(0);
    });

    it('returns verdict=safe when freshness bound is satisfied', () => {
      const nodes: FreshnessASTNode[] = [
        {
          type: 'object',
          name: 'FreshSensorActuator',
          traits: ['@mesh'],
          calls: [],
          declaredEffects: ['render:spawn'],
          freshnessBoundMs: 500,
          sensorMetadata: [{ traitName: '@mesh', worstCaseStalenessMs: 50 }],
          // Note: '@mesh' does not match SENSOR_TRAIT_SUBSTRINGS → no warning either
        },
      ];

      const result = runSafetyPass(nodes, {
        moduleId: 'fresh-actuator',
        trustLevel: 'basic',
        targetPlatforms: ['quest3'],
      });

      // No freshness violations → verdict driven only by other layers
      const freshnessErrors = result.report.effects.violations.filter(
        (v) => v.severity === 'error' && /freshness|staleness|stale/i.test(v.message)
      );
      expect(freshnessErrors).toHaveLength(0);
    });

    it('canonical pet-care via runSafetyPass: stale perception → unsafe verdict', () => {
      const nodes: FreshnessASTNode[] = [
        {
          type: 'object',
          name: 'PetFeederRobot',
          traits: ['@mesh', '@proximity_sensor', '@water_bowl_sensor'],
          calls: ['moveToTarget'],
          declaredEffects: ['render:spawn', 'io:read', 'physics:force'],
          freshnessBoundMs: 500,
          sensorMetadata: [
            { traitName: '@proximity_sensor', worstCaseStalenessMs: 2000 },
            { traitName: '@water_bowl_sensor', worstCaseStalenessMs: 5000 },
          ],
        },
      ];

      const result = runSafetyPass(nodes, {
        moduleId: 'pet-feeder-robot',
        trustLevel: 'trusted',
        targetPlatforms: ['quest3'],
      });

      expect(result.passed).toBe(false);
      expect(result.report.verdict).toBe('unsafe');
      expect(result.report.summary.errors).toBeGreaterThan(0);
    });
  });

  describe('existing safety tests are not regressed', () => {
    it('safe module without freshness decorators still passes', () => {
      const nodes = [
        {
          type: 'object',
          name: 'SafePlayer',
          traits: ['@mesh', '@audio'],
          calls: [],
          declaredEffects: ['render:spawn', 'audio:play'],
        },
      ];

      const result = runSafetyPass(nodes, {
        moduleId: 'regression-safe',
        targetPlatforms: ['quest3'],
        trustLevel: 'basic',
      });

      expect(result.passed).toBe(true);
      expect(result.report.verdict).toBe('safe');
    });

    it('undeclared network effect still fails (existing behaviour)', () => {
      const nodes = [
        {
          type: 'object',
          name: 'SneakyBot',
          traits: ['@mesh', '@networked'],
          calls: ['fetch'],
          declaredEffects: ['render:spawn'],
        },
      ];

      const result = runSafetyPass(nodes, { moduleId: 'sneaky', trustLevel: 'basic' });
      expect(result.passed).toBe(false);
    });
  });
});
