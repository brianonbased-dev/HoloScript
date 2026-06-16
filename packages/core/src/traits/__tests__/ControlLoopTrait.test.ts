import { describe, it, expect, beforeEach } from 'vitest';
import {
  stepPid,
  stepMpc,
  controlLoopHandler,
  type PIDParams,
  type PIDState,
  type MPCParams,
} from '../ControlLoopTrait';

// ── PID ───────────────────────────────────────────────────────────────────────

function freshPidState(): PIDState {
  return { integralAccum: 0, prevError: 0, prevDerivative: 0 };
}

const basicPid: PIDParams = { Kp: 1, Ki: 0, Kd: 0 };

describe('stepPid – proportional only', () => {
  it('error=1 → u=Kp', () => {
    const s = freshPidState();
    const r = stepPid({ Kp: 2, Ki: 0, Kd: 0 }, 5, 4, 1, s);
    expect(r.u).toBeCloseTo(2, 6);
    expect(r.proportional).toBeCloseTo(2, 6);
  });

  it('zero error → u=0', () => {
    const s = freshPidState();
    const r = stepPid(basicPid, 3, 3, 1, s);
    expect(r.u).toBeCloseTo(0, 6);
  });

  it('output type is "pid"', () => {
    const r = stepPid(basicPid, 1, 0, 1, freshPidState());
    expect(r.type).toBe('pid');
  });
});

describe('stepPid – integral', () => {
  it('integral accumulates over steps', () => {
    const s = freshPidState();
    const p: PIDParams = { Kp: 0, Ki: 1, Kd: 0 };
    stepPid(p, 1, 0, 1, s); // e=1, accum=1
    const r = stepPid(p, 1, 0, 1, s); // e=1, accum=2, u=2
    expect(r.integral).toBeCloseTo(2, 6);
    expect(r.u).toBeCloseTo(2, 6);
  });

  it('anti-windup clamps accumulator', () => {
    const s = freshPidState();
    const p: PIDParams = { Kp: 0, Ki: 1, Kd: 0, iMax: 1.5 };
    stepPid(p, 1, 0, 1, s); // accum=1
    stepPid(p, 1, 0, 1, s); // accum=2 → clamped to 1.5
    const r = stepPid(p, 1, 0, 1, s); // accum=2.5 → clamped to 1.5
    expect(r.integral).toBeCloseTo(1.5, 6);
  });
});

describe('stepPid – derivative', () => {
  it('derivative captures rate of change', () => {
    const s = freshPidState();
    const p: PIDParams = { Kp: 0, Ki: 0, Kd: 1 };
    stepPid(p, 2, 0, 1, s);  // e=2, prevError=0 → d=2
    const r = stepPid(p, 2, 1, 1, s); // e=1, prevError=2 → d=(1-2)/1=-1
    expect(r.derivative).toBeCloseTo(-1, 5);
    expect(r.u).toBeCloseTo(-1, 5);
  });

  it('derivative filter smooths derivative term', () => {
    const s = freshPidState();
    const p: PIDParams = { Kp: 0, Ki: 0, Kd: 1, filterCoeff: 0.5 };
    // Step 1: rawD=10, filtD=0.5*10+0.5*0=5
    const r1 = stepPid(p, 10, 0, 1, s);
    expect(r1.derivative).toBeCloseTo(5, 5);
    // Step 2: error=0 → rawD=-10, filtD=0.5*-10+0.5*5=-2.5
    const r2 = stepPid(p, 0, 0, 1, s);
    expect(r2.derivative).toBeCloseTo(-2.5, 5);
  });
});

describe('stepPid – output saturation', () => {
  it('output is clamped to [outputMin, outputMax]', () => {
    const p: PIDParams = { Kp: 10, Ki: 0, Kd: 0, outputMin: -1, outputMax: 1 };
    const r = stepPid(p, 5, 0, 1, freshPidState());
    expect(r.u).toBeCloseTo(1, 6);
    const r2 = stepPid(p, -5, 0, 1, freshPidState());
    expect(r2.u).toBeCloseTo(-1, 6);
  });
});

describe('stepPid – convergence on constant setpoint', () => {
  it('integral controller drives error to zero over time', () => {
    const p: PIDParams = { Kp: 0.5, Ki: 0.2, Kd: 0 };
    const s = freshPidState();
    let y = 0;
    for (let i = 0; i < 100; i++) {
      const r = stepPid(p, 1.0, y, 0.1, s);
      y += r.u * 0.1; // first-order plant
    }
    expect(Math.abs(y - 1.0)).toBeLessThan(0.05);
  });
});

// ── MPC ───────────────────────────────────────────────────────────────────────

// 1D integrator: x[k+1] = x[k] + u[k]
function integrator1D(): MPCParams {
  return {
    model: { A: [1], B: [1], n: 1, m: 1 },
    horizon: 5,
    Q: [1],
    R: [0.1],
  };
}

describe('stepMpc – 1D integrator', () => {
  it('returns type mpc', () => {
    const r = stepMpc(integrator1D(), [2]);
    expect(r.type).toBe('mpc');
  });

  it('control action drives state toward zero', () => {
    const p = integrator1D();
    const r = stepMpc(p, [5]);
    // Optimal LQR drives u < 0 to reduce positive state
    expect(r.u).toBeLessThan(0);
  });

  it('horizon has H*m entries', () => {
    const p = integrator1D();
    const r = stepMpc(p, [1]);
    expect(r.horizon).toHaveLength(5); // H=5, m=1
  });

  it('closed-loop convergence to zero on 1D integrator', () => {
    const p = integrator1D();
    let x = [5.0];
    for (let i = 0; i < 30; i++) {
      const r = stepMpc(p, x);
      x = [x[0] + r.u];
    }
    expect(Math.abs(x[0])).toBeLessThan(0.1);
  });

  it('respects uMin constraint', () => {
    const p: MPCParams = { ...integrator1D(), uMin: [-0.5], uMax: [0.5] };
    const r = stepMpc(p, [10]);
    expect(r.u).toBeGreaterThanOrEqual(-0.5 - 1e-9);
    expect(r.u).toBeLessThanOrEqual(0.5 + 1e-9);
  });

  it('respects uMax constraint', () => {
    const p: MPCParams = { ...integrator1D(), uMin: [-0.5], uMax: [0.5] };
    const r = stepMpc(p, [-10]);
    expect(r.u).toBeLessThanOrEqual(0.5 + 1e-9);
    expect(r.u).toBeGreaterThanOrEqual(-0.5 - 1e-9);
  });
});

// 2D double-integrator: x=[pos,vel], x[k+1]=[pos+vel, vel+u]
function doubleIntegrator(): MPCParams {
  return {
    model: {
      A: [1, 1, 0, 1],
      B: [0, 1],
      n: 2,
      m: 1,
    },
    horizon: 8,
    Q: [1, 0, 0, 1],
    R: [0.5],
  };
}

describe('stepMpc – 2D double integrator', () => {
  it('computes a control output without throwing', () => {
    const r = stepMpc(doubleIntegrator(), [2, 0]);
    expect(typeof r.u).toBe('number');
    expect(r.horizon).toHaveLength(8);
  });

  it('drives position toward zero', () => {
    const p = doubleIntegrator();
    let x = [5.0, 0.0];
    for (let i = 0; i < 50; i++) {
      const r = stepMpc(p, x);
      const newPos = x[0] + x[1];
      const newVel = x[1] + r.u;
      x = [newPos, newVel];
    }
    expect(Math.abs(x[0])).toBeLessThan(0.5);
  });
});

// ── TraitHandler ──────────────────────────────────────────────────────────────

function makeNode(): Record<string, unknown> {
  return {};
}

describe('controlLoopHandler.onAttach', () => {
  it('initialises state and output', () => {
    const node = makeNode();
    controlLoopHandler.onAttach!(node as never, {}, {} as never);
    expect(node.__control_state).toBeDefined();
    expect(node.__control_output).toBeNull();
  });
});

describe('controlLoopHandler.onEvent – PID', () => {
  let node: Record<string, unknown>;

  beforeEach(() => {
    node = makeNode();
    controlLoopHandler.onAttach!(node as never, {}, {} as never);
  });

  it('pid step writes output', () => {
    controlLoopHandler.onEvent!(
      node as never,
      { pid: { Kp: 2, Ki: 0, Kd: 0 } },
      {} as never,
      { type: 'control_loop.pid_step', params: { Kp: 2, Ki: 0, Kd: 0 }, setpoint: 5, measurement: 4 } as never,
    );
    const out = node.__control_output as { u: number; type: string };
    expect(out.type).toBe('pid');
    expect(out.u).toBeCloseTo(2, 5);
  });

  it('pid falls back to config params', () => {
    const cfg = { pid: { Kp: 3, Ki: 0, Kd: 0 } };
    controlLoopHandler.onEvent!(
      node as never,
      cfg,
      {} as never,
      { type: 'control_loop.pid_step', setpoint: 2, measurement: 0 } as never,
    );
    const out = node.__control_output as { u: number };
    expect(out.u).toBeCloseTo(6, 5);
  });

  it('reset clears integral state', () => {
    const cfg = { pid: { Kp: 0, Ki: 1, Kd: 0 } };
    // Accumulate integral
    controlLoopHandler.onEvent!(node as never, cfg, {} as never,
      { type: 'control_loop.pid_step', setpoint: 1, measurement: 0, dt: 1 } as never);
    // Reset
    controlLoopHandler.onEvent!(node as never, cfg, {} as never, { type: 'control_loop.reset' } as never);
    // Next step should see zeroed accumulator
    controlLoopHandler.onEvent!(node as never, cfg, {} as never,
      { type: 'control_loop.pid_step', setpoint: 1, measurement: 0, dt: 1 } as never);
    const out = node.__control_output as { integral: number };
    expect(out.integral).toBeCloseTo(1, 5); // only one step's worth
  });
});

describe('controlLoopHandler.onEvent – MPC', () => {
  it('mpc step writes output', () => {
    const node = makeNode();
    controlLoopHandler.onAttach!(node as never, {}, {} as never);
    const params = integrator1D();
    controlLoopHandler.onEvent!(
      node as never,
      { mpc: params },
      {} as never,
      { type: 'control_loop.mpc_step', params, state: [3] } as never,
    );
    const out = node.__control_output as { u: number; type: string };
    expect(out.type).toBe('mpc');
    expect(out.u).toBeLessThan(0); // driving toward 0
  });
});

describe('controlLoopHandler.onEvent – unknown', () => {
  it('unknown event does not throw', () => {
    const node = makeNode();
    controlLoopHandler.onAttach!(node as never, {}, {} as never);
    expect(() =>
      controlLoopHandler.onEvent!(node as never, {}, {} as never, { type: 'unknown' } as never),
    ).not.toThrow();
  });
});
