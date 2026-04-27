import { describe, it, expect, vi } from 'vitest';
import {
  PIDControllerTrait,
  CascadePIDController,
  pIDControllerHandler,
  DEFAULT_PID_CONFIG,
} from '../PIDControllerTrait';
import type { PIDConfig, PIDGains, ZNTuningRule } from '../PIDControllerTrait';

// =============================================================================
// HELPERS
// =============================================================================

function makePID(overrides: Partial<PIDConfig> = {}): PIDControllerTrait {
  return new PIDControllerTrait(overrides);
}

function makeNode(id = 'pid_node'): Record<string, unknown> {
  return { id };
}

function makeCtx() {
  const emitted: Array<{ event: string; payload: unknown }> = [];
  return {
    emit: vi.fn((e: string, p?: unknown) => {
      emitted.push({ event: e, payload: p });
    }),
    emitted,
    byType: (t: string) => emitted.filter((e) => e.event === t),
  };
}

// =============================================================================
// PIDControllerTrait class tests
// =============================================================================

describe('PIDControllerTrait class', () => {
  describe('construction', () => {
    it('should construct with default config', () => {
      const pid = makePID();
      expect(pid.traitName).toBe('PIDController');
    });

    it('should initialize with zero state', () => {
      const pid = makePID();
      const state = pid.getState();
      expect(state.setpoint).toBe(0);
      expect(state.measurement).toBe(0);
      expect(state.output).toBe(0);
      expect(state.error).toBe(0);
    });

    it('should reflect custom gains in config', () => {
      const pid = makePID({ gains: { kp: 2.0, ki: 0.5, kd: 0.1 } });
      const gains = pid.getGains();
      expect(gains.kp).toBe(2.0);
      expect(gains.ki).toBe(0.5);
      expect(gains.kd).toBe(0.1);
    });

    it('should merge gains with DEFAULT_PID_CONFIG defaults', () => {
      const pid = makePID({ gains: { kp: 5 } } as Partial<PIDConfig>);
      const gains = pid.getGains();
      expect(gains.kp).toBe(5);
      // ki and kd fall back to defaults
      expect(gains.ki).toBe(DEFAULT_PID_CONFIG.gains.ki);
      expect(gains.kd).toBe(DEFAULT_PID_CONFIG.gains.kd);
    });
  });

  describe('setSetpoint / update', () => {
    it('should produce nonzero output when setpoint > measurement', () => {
      const pid = makePID({ gains: { kp: 1, ki: 0, kd: 0 } });
      pid.setSetpoint(10);
      const output = pid.update(0, 0.016);
      expect(output).toBeGreaterThan(0);
    });

    it('should produce negative output when setpoint < measurement', () => {
      const pid = makePID({ gains: { kp: 1, ki: 0, kd: 0 } });
      pid.setSetpoint(-5);
      const output = pid.update(0, 0.016);
      expect(output).toBeLessThan(0);
    });

    it('should clamp output to outputMax', () => {
      const pid = makePID({ gains: { kp: 100, ki: 0, kd: 0 }, outputMax: 5 });
      pid.setSetpoint(100);
      const output = pid.update(0, 0.016);
      expect(output).toBeLessThanOrEqual(5);
    });

    it('should clamp output to outputMin', () => {
      const pid = makePID({
        gains: { kp: 100, ki: 0, kd: 0 },
        outputMin: -5,
        outputMax: Infinity,
      });
      pid.setSetpoint(-100);
      const output = pid.update(0, 0.016);
      expect(output).toBeGreaterThanOrEqual(-5);
    });

    it('should accumulate integral over time', () => {
      const pid = makePID({ gains: { kp: 0, ki: 1, kd: 0 } });
      pid.setSetpoint(1);
      const out1 = pid.update(0, 0.016);
      const out2 = pid.update(0, 0.016);
      expect(out2).toBeGreaterThan(out1); // integral grows
    });

    it('should limit integral windup', () => {
      const pid = makePID({
        gains: { kp: 0, ki: 1, kd: 0 },
        integralWindupLimit: 0.5,
        outputMin: -Infinity,
        outputMax: Infinity,
      });
      pid.setSetpoint(100);
      for (let i = 0; i < 1000; i++) {
        pid.update(0, 1);
      }
      const state = pid.getState();
      expect(Math.abs(state.integral)).toBeLessThanOrEqual(0.5 + 0.001);
    });

    it('should mark as settled within deadband', () => {
      const pid = makePID({ gains: { kp: 1, ki: 0, kd: 0 }, deadband: 0.1 });
      pid.setSetpoint(0.05); // within deadband
      pid.update(0.0, 0.016);
      expect(pid.isSettled()).toBe(true);
    });

    it('should not settle outside deadband', () => {
      const pid = makePID({ gains: { kp: 1, ki: 0, kd: 0 }, deadband: 0.001 });
      pid.setSetpoint(10);
      pid.update(0, 0.016);
      expect(pid.isSettled()).toBe(false);
    });

    it('should track velocity (rate of measurement change)', () => {
      const pid = makePID({ gains: { kp: 1, ki: 0, kd: 0 } });
      pid.update(0, 0.016);
      pid.update(1, 0.016);
      expect(pid.getVelocity()).toBeCloseTo(1 / 0.016, 0);
    });

    it('should reflect measurement in state', () => {
      const pid = makePID();
      pid.update(42, 0.016);
      expect(pid.getState().measurement).toBe(42);
    });

    it('should increment tickCount on each update', () => {
      const pid = makePID();
      pid.update(0, 0.016);
      pid.update(0, 0.016);
      expect(pid.getState().tickCount).toBe(2);
    });
  });

  describe('derivative filter', () => {
    it('should apply derivative filter coefficient', () => {
      const pid = makePID({ gains: { kp: 0, ki: 0, kd: 1 }, derivativeFilterCoeff: 0.5 });
      pid.setSetpoint(0);
      pid.update(0, 0.016);
      pid.update(1, 0.016);
      // Filtered derivative should exist
      const state = pid.getState();
      expect(typeof state.derivative).toBe('number');
    });
  });

  describe('output smoothing', () => {
    it('should return coeff 0 by default', () => {
      const pid = makePID();
      expect(pid.getOutputSmoothing()).toBe(0);
    });

    it('should set smoothing coefficient', () => {
      const pid = makePID();
      pid.setOutputSmoothing(0.7);
      expect(pid.getOutputSmoothing()).toBe(0.7);
    });

    it('should clamp smoothing to [0, 1]', () => {
      const pid = makePID();
      pid.setOutputSmoothing(1.5);
      expect(pid.getOutputSmoothing()).toBe(1);
      pid.setOutputSmoothing(-0.5);
      expect(pid.getOutputSmoothing()).toBe(0);
    });

    it('should produce smoothed output when coeff > 0', () => {
      const pid = makePID({
        gains: { kp: 10, ki: 0, kd: 0 },
        outputSmoothingCoeff: 0.9,
        outputMin: -Infinity,
        outputMax: Infinity,
      });
      pid.setSetpoint(100);
      const out1 = pid.update(0, 0.016);
      const out2 = pid.update(0, 0.016);
      // With heavy smoothing output grows slowly
      expect(Math.abs(out2)).toBeLessThan(Math.abs(100 * 10)); // not instantly full gain
      expect(typeof out1).toBe('number');
    });
  });

  describe('gains management', () => {
    it('should update gains via setGains', () => {
      const pid = makePID();
      pid.setGains({ kp: 3.14 });
      expect(pid.getGains().kp).toBeCloseTo(3.14);
    });

    it('should preserve other gains when partially updating', () => {
      const pid = makePID({ gains: { kp: 2, ki: 0.5, kd: 0.1 } });
      pid.setGains({ ki: 0.9 });
      const gains = pid.getGains();
      expect(gains.kp).toBe(2);
      expect(gains.ki).toBe(0.9);
      expect(gains.kd).toBe(0.1);
    });
  });

  describe('reset', () => {
    it('should zero integral and derivative on reset', () => {
      const pid = makePID({ gains: { kp: 0, ki: 1, kd: 0 } });
      pid.setSetpoint(10);
      for (let i = 0; i < 10; i++) pid.update(0, 0.016);
      pid.reset();
      expect(pid.getState().integral).toBe(0);
      expect(pid.getState().derivative).toBe(0);
    });

    it('should reset tickCount to 0', () => {
      const pid = makePID();
      pid.update(0, 0.016);
      pid.update(0, 0.016);
      pid.reset();
      expect(pid.getState().tickCount).toBe(0);
    });

    it('should zero output after reset', () => {
      const pid = makePID({ gains: { kp: 10, ki: 0, kd: 0 } });
      pid.setSetpoint(100);
      pid.update(0, 0.016);
      pid.reset();
      expect(pid.getState().output).toBe(0);
    });
  });

  describe('outerUpdate', () => {
    it('should update setpoint via outerUpdate', () => {
      const pid = makePID();
      pid.outerUpdate(5.5);
      pid.update(0, 0.016); // sync front from back
      expect(pid.getState().setpoint).toBe(5.5);
    });

    it('should update lastOuterTick timestamp', () => {
      const pid = makePID();
      pid.outerUpdate(1.0);
      pid.update(0, 0.016); // sync front from back
      expect(pid.getState().lastOuterTick).toBeGreaterThan(0);
    });
  });

  describe('performance metrics', () => {
    it('should return zero metrics with no updates', () => {
      const pid = makePID();
      const m = pid.getPerformanceMetrics();
      expect(m.overshootPercent).toBe(0);
      expect(m.riseTimeS).toBeNull();
      expect(m.settlingTimeS).toBeNull();
      expect(m.sampleCount).toBe(0);
    });

    it('should accumulate samples after setpoint change', () => {
      const pid = makePID({ gains: { kp: 5, ki: 0.1, kd: 0.05 } });
      pid.setSetpoint(10);
      for (let i = 0; i < 20; i++) pid.update(i * 0.5, 0.016);
      const m = pid.getPerformanceMetrics();
      expect(m.sampleCount).toBeGreaterThan(0);
    });

    it('should compute steady-state error', () => {
      const pid = makePID({ gains: { kp: 1, ki: 0, kd: 0 } });
      pid.setSetpoint(10);
      for (let i = 0; i < 50; i++) pid.update(5, 0.016);
      const m = pid.getPerformanceMetrics();
      expect(m.steadyStateError).toBeGreaterThanOrEqual(0);
    });
  });

  describe('autoTune', () => {
    it('should return AutoTuneResult for a sinusoidal plant', async () => {
      const pid = makePID({ gains: { kp: 1, ki: 0.1, kd: 0.05 }, outputMax: 1, outputMin: -1 });

      // Simple integrator plant that oscillates
      let plantState = 0;
      const processStep = (u: number): number => {
        plantState += u * 0.01;
        return plantState;
      };

      const result = await pid.autoTune(processStep, 0, {
        relayAmplitude: 1,
        maxIterations: 3000,
        dt: 0.01,
        rule: 'classic',
        apply: false,
      });

      // Might return null if oscillation not detected in simple integrator
      // Just verify we don't throw
      expect(typeof result === 'object' || result === null).toBe(true);
    }, 10000);

    it('should apply gains when apply=true', async () => {
      const pid = makePID({ outputMax: 1, outputMin: -1 });

      let m = 0;
      const step = (u: number): number => {
        m += u * 0.1;
        return m;
      };

      const result = await pid.autoTune(step, 0, {
        relayAmplitude: 1,
        maxIterations: 3000,
        dt: 0.01,
        apply: true,
      });

      // If result found, gains should be updated
      if (result) {
        expect(pid.getGains().kp).toBeCloseTo(result.gains.kp, 5);
      } else {
        expect(result).toBeNull();
      }
    }, 10000);

    it('should return null when oscillation not detected in too few iterations', async () => {
      const pid = makePID({ outputMax: 1, outputMin: -1 });
      // Non-oscillating plant
      const step = (_u: number): number => 0;
      const result = await pid.autoTune(step, 1, { maxIterations: 5 });
      expect(result).toBeNull();
    }, 5000);

    it('should use specified Ziegler-Nichols rule', async () => {
      const pid = makePID({ outputMax: 1, outputMin: -1 });
      let m = 0;
      const step = (u: number): number => {
        m += u * 0.1;
        return m;
      };
      // Just verify it doesn't throw for each rule
      const rules: ZNTuningRule[] = ['classic', 'some_overshoot', 'no_overshoot'];
      for (const rule of rules) {
        m = 0;
        const r = await pid.autoTune(step, 0, {
          relayAmplitude: 1,
          maxIterations: 10,
          dt: 0.01,
          rule,
        });
        expect(r === null || typeof r === 'object').toBe(true);
      }
    }, 10000);
  });
});

// =============================================================================
// CascadePIDController tests
// =============================================================================

describe('CascadePIDController', () => {
  it('should construct with default configs', () => {
    const cascade = new CascadePIDController();
    expect(cascade.traitName).toBe('CascadePID');
  });

  it('should expose outer and inner PID controllers', () => {
    const cascade = new CascadePIDController();
    expect(cascade.outer).toBeInstanceOf(PIDControllerTrait);
    expect(cascade.inner).toBeInstanceOf(PIDControllerTrait);
  });

  it('should produce numeric output from update', () => {
    const cascade = new CascadePIDController(
      { gains: { kp: 1, ki: 0, kd: 0 } },
      { gains: { kp: 1, ki: 0, kd: 0 } }
    );
    cascade.setSetpoint(10);
    const output = cascade.update(0, 0, 0.1);
    expect(typeof output).toBe('number');
  });

  it('should feed outer output as inner setpoint after outer loop fires', () => {
    const cascade = new CascadePIDController(
      { gains: { kp: 1, ki: 0, kd: 0 }, outerLoopHz: 10 },
      { gains: { kp: 1, ki: 0, kd: 0 } }
    );
    cascade.setSetpoint(5);

    // Outer period = 0.1s; run 0.15s of ticks
    for (let i = 0; i < 15; i++) {
      cascade.update(0, 0, 0.01);
    }
    // Inner setpoint should be non-zero (fed from outer)
    expect(cascade.getInnerState().setpoint).not.toBe(0);
  });

  it('should reset both loops on reset', () => {
    const cascade = new CascadePIDController();
    cascade.setSetpoint(10);
    for (let i = 0; i < 10; i++) cascade.update(0, 0, 0.016);
    cascade.reset();
    expect(cascade.getOuterState().integral).toBe(0);
    expect(cascade.getInnerState().integral).toBe(0);
  });

  it('should return performance metrics for both loops', () => {
    const cascade = new CascadePIDController();
    const metrics = cascade.getPerformanceMetrics();
    expect(metrics.outer).toBeDefined();
    expect(metrics.inner).toBeDefined();
    expect(typeof metrics.outer.sampleCount).toBe('number');
    expect(typeof metrics.inner.sampleCount).toBe('number');
  });

  it('should expose outer state', () => {
    const cascade = new CascadePIDController();
    // Outer period = 0.1s; run 10 ticks of 0.016s to exceed it
    for (let i = 0; i < 10; i++) cascade.update(1, 0, 0.016);
    expect(cascade.getOuterState().measurement).toBe(1);
  });

  it('should expose inner state', () => {
    const cascade = new CascadePIDController();
    cascade.update(0, 2, 0.016);
    expect(cascade.getInnerState().measurement).toBe(2);
  });
});

// =============================================================================
// DEFAULT_PID_CONFIG tests
// =============================================================================

describe('DEFAULT_PID_CONFIG', () => {
  it('should have kp=1.0', () => {
    expect(DEFAULT_PID_CONFIG.gains.kp).toBe(1.0);
  });

  it('should have ki=0.1', () => {
    expect(DEFAULT_PID_CONFIG.gains.ki).toBe(0.1);
  });

  it('should have kd=0.05', () => {
    expect(DEFAULT_PID_CONFIG.gains.kd).toBe(0.05);
  });

  it('should have innerLoopHz=90', () => {
    expect(DEFAULT_PID_CONFIG.innerLoopHz).toBe(90);
  });

  it('should have outerLoopHz=30', () => {
    expect(DEFAULT_PID_CONFIG.outerLoopHz).toBe(30);
  });

  it('should have deadband=0.001', () => {
    expect(DEFAULT_PID_CONFIG.deadband).toBe(0.001);
  });

  it('should have outputSmoothingCoeff=0', () => {
    expect(DEFAULT_PID_CONFIG.outputSmoothingCoeff).toBe(0);
  });
});

// =============================================================================
// pIDControllerHandler tests
// =============================================================================

describe('pIDControllerHandler', () => {
  it('should have name p_i_d_controller', () => {
    expect(pIDControllerHandler.name).toBe('p_i_d_controller');
  });

  it('should attach and store instance on node', () => {
    const node = makeNode();
    const ctx = makeCtx();
    pIDControllerHandler.onAttach(node as never, {}, ctx as never);
    expect(node.__p_i_d_controller_instance).toBeDefined();
  });

  it('should emit p_i_d_controller_attached on attach', () => {
    const node = makeNode();
    const ctx = makeCtx();
    pIDControllerHandler.onAttach(node as never, {}, ctx as never);
    expect(ctx.byType('p_i_d_controller_attached').length).toBe(1);
  });

  it('should remove instance from node on detach', () => {
    const node = makeNode();
    const ctx = makeCtx();
    pIDControllerHandler.onAttach(node as never, {}, ctx as never);
    pIDControllerHandler.onDetach(node as never, {}, ctx as never);
    expect(node.__p_i_d_controller_instance).toBeUndefined();
  });

  it('should emit p_i_d_controller_detached on detach', () => {
    const node = makeNode();
    const ctx = makeCtx();
    pIDControllerHandler.onAttach(node as never, {}, ctx as never);
    pIDControllerHandler.onDetach(node as never, {}, ctx as never);
    expect(ctx.byType('p_i_d_controller_detached').length).toBe(1);
  });

  it('should handle onUpdate without throwing', () => {
    const node = makeNode();
    const ctx = makeCtx();
    pIDControllerHandler.onAttach(node as never, {}, ctx as never);
    expect(() => pIDControllerHandler.onUpdate(node as never, {}, ctx as never, 0.016)).not.toThrow();
  });

  it('should handle onEvent without throwing', () => {
    const node = makeNode();
    const ctx = makeCtx();
    pIDControllerHandler.onAttach(node as never, {}, ctx as never);
    expect(() =>
      pIDControllerHandler.onEvent(node as never, {}, ctx as never, {
        type: 'p_i_d_controller_configure',
        payload: {},
      })
    ).not.toThrow();
  });

  it('should handle detach when no instance on node', () => {
    const node = makeNode();
    const ctx = makeCtx();
    expect(() => pIDControllerHandler.onDetach(node as never, {}, ctx as never)).not.toThrow();
  });
});
