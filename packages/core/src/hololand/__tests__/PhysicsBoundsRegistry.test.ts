/**
 * Tests for PhysicsBoundsRegistry — confabulation-safe physics bounds in
 * HoloLand VR.
 *
 * Covers:
 *   - Default per-tier envelope shape
 *   - Envelope overrides
 *   - LOW-tier passthrough (no clamp on in-range values)
 *   - MEDIUM/HIGH-tier clamping (out-of-range values pulled to envelope)
 *   - QUARANTINED rejection (no underlying call made)
 *   - HIGH-tier setGravity rejection (allowSetGravity = false)
 *   - Direction preservation under clamp
 *   - Composition with AgentRiskRegistry singleton (tier change observed live)
 *   - Reads + raycast pass through
 *   - onViolation callback shape and "callback throw doesn't break physics"
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AgentRiskRegistry,
  RiskTier,
  resetAgentRiskRegistry,
  getAgentRiskRegistry,
} from '../../compiler/identity/AgentRiskRegistry';
import {
  PhysicsBoundsRegistry,
  DEFAULT_ENVELOPES,
  resetPhysicsBoundsRegistry,
  getPhysicsBoundsRegistry,
  wrapPhysicsService,
  type BoundsViolation,
} from '../PhysicsBoundsRegistry';
import type {
  PhysicsService,
  PhysicsBody,
  RigidBodyConfig,
  ColliderShape,
} from '../HololandIntegration';

// -----------------------------------------------------------------------------
// HELPERS
// -----------------------------------------------------------------------------

interface BodyCalls {
  setPosition: Array<[number, number, number]>;
  setRotation: Array<{ x: number; y: number; z: number; w: number }>;
  setVelocity: Array<[number, number, number]>;
  applyForce: Array<[number, number, number]>;
  applyImpulse: Array<[number, number, number]>;
}

interface ServiceCalls {
  setGravity: Array<[number, number, number]>;
  step: number[];
  bodies: BodyCalls[];
}

function makeFakePhysics(): { service: PhysicsService; calls: ServiceCalls } {
  const calls: ServiceCalls = {
    setGravity: [],
    step: [],
    bodies: [],
  };

  function makeBody(idx: number, config: RigidBodyConfig): PhysicsBody {
    const bcalls: BodyCalls = {
      setPosition: [],
      setRotation: [],
      setVelocity: [],
      applyForce: [],
      applyImpulse: [],
    };
    calls.bodies[idx] = bcalls;
    return {
      id: `body_${idx}`,
      setPosition: (p) => {
        bcalls.setPosition.push(p);
      },
      setRotation: (r) => {
        bcalls.setRotation.push(r);
      },
      setVelocity: (v) => {
        bcalls.setVelocity.push(v);
      },
      applyForce: (f) => {
        bcalls.applyForce.push(f);
      },
      applyImpulse: (i) => {
        bcalls.applyImpulse.push(i);
      },
      getPosition: () => [config.position[0], config.position[1], config.position[2]],
      getVelocity: () => [0, 0, 0],
      destroy: () => {},
    };
  }

  let bodyCount = 0;
  const service: PhysicsService = {
    createBody: (config) => makeBody(bodyCount++, config),
    raycast: (_o, _d, _m) => null,
    overlap: (_s: ColliderShape, _p) => [],
    setGravity: (g) => {
      calls.setGravity.push(g);
    },
    step: (dt) => {
      calls.step.push(dt);
    },
  };
  return { service, calls };
}

function defaultBodyConfig(): RigidBodyConfig {
  return {
    type: 'dynamic',
    position: [0, 0, 0],
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    collider: { type: 'sphere', radius: 0.5 },
  };
}

function magnitude(v: [number, number, number]): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

// -----------------------------------------------------------------------------
// REGISTRY ITSELF
// -----------------------------------------------------------------------------

describe('PhysicsBoundsRegistry — envelope table', () => {
  beforeEach(() => {
    resetPhysicsBoundsRegistry();
  });

  it('returns the default envelope for each tier', () => {
    const reg = new PhysicsBoundsRegistry();
    expect(reg.getEnvelope(RiskTier.LOW)).toEqual(DEFAULT_ENVELOPES[RiskTier.LOW]);
    expect(reg.getEnvelope(RiskTier.MEDIUM)).toEqual(DEFAULT_ENVELOPES[RiskTier.MEDIUM]);
    expect(reg.getEnvelope(RiskTier.HIGH)).toEqual(DEFAULT_ENVELOPES[RiskTier.HIGH]);
    expect(reg.getEnvelope(RiskTier.QUARANTINED)).toEqual(
      DEFAULT_ENVELOPES[RiskTier.QUARANTINED]
    );
  });

  it('default envelopes form a monotone schedule on magnitude caps', () => {
    const low = DEFAULT_ENVELOPES[RiskTier.LOW];
    const med = DEFAULT_ENVELOPES[RiskTier.MEDIUM];
    const high = DEFAULT_ENVELOPES[RiskTier.HIGH];
    const quar = DEFAULT_ENVELOPES[RiskTier.QUARANTINED];

    expect(low.maxForceN).toBeGreaterThan(med.maxForceN);
    expect(med.maxForceN).toBeGreaterThan(high.maxForceN);
    expect(high.maxForceN).toBeGreaterThan(quar.maxForceN);

    expect(low.maxImpulseNs).toBeGreaterThan(med.maxImpulseNs);
    expect(med.maxImpulseNs).toBeGreaterThan(high.maxImpulseNs);

    expect(low.maxVelocityMps).toBeGreaterThan(high.maxVelocityMps);

    expect(quar.allowDynamicMutation).toBe(false);
    expect(high.allowSetGravity).toBe(false);
    expect(low.allowSetGravity).toBe(true);
  });

  it('envelope overrides merge per-field with defaults', () => {
    const reg = new PhysicsBoundsRegistry({
      envelopeOverrides: {
        [RiskTier.MEDIUM]: { maxForceN: 999 },
      },
    });
    const env = reg.getEnvelope(RiskTier.MEDIUM);
    expect(env.maxForceN).toBe(999);
    // other fields preserved from default
    expect(env.maxImpulseNs).toBe(DEFAULT_ENVELOPES[RiskTier.MEDIUM].maxImpulseNs);
    expect(env.allowDynamicMutation).toBe(true);
  });

  it('getPhysicsBoundsRegistry returns a singleton', () => {
    const a = getPhysicsBoundsRegistry();
    const b = getPhysicsBoundsRegistry();
    expect(a).toBe(b);
  });

  it('reset clears the singleton', () => {
    const a = getPhysicsBoundsRegistry();
    resetPhysicsBoundsRegistry();
    const b = getPhysicsBoundsRegistry();
    expect(a).not.toBe(b);
  });
});

// -----------------------------------------------------------------------------
// SERVICE WRAPPING — LOW TIER PASSTHROUGH
// -----------------------------------------------------------------------------

describe('wrapPhysicsService — LOW tier passthrough', () => {
  beforeEach(() => {
    resetAgentRiskRegistry();
    resetPhysicsBoundsRegistry();
  });

  it('LOW agent: in-range applyForce passes through unchanged', () => {
    const { service, calls } = makeFakePhysics();
    const wrapped = wrapPhysicsService(service, 'agent:low');
    const body = wrapped.createBody(defaultBodyConfig());

    body.applyForce([10, 20, 30]);
    expect(calls.bodies[0].applyForce).toEqual([[10, 20, 30]]);
  });

  it('LOW agent: in-range setVelocity passes through unchanged', () => {
    const { service, calls } = makeFakePhysics();
    const wrapped = wrapPhysicsService(service, 'agent:low');
    const body = wrapped.createBody(defaultBodyConfig());

    body.setVelocity([1, 2, 3]);
    expect(calls.bodies[0].setVelocity).toEqual([[1, 2, 3]]);
  });

  it('LOW agent: setGravity within cap passes through', () => {
    const { service, calls } = makeFakePhysics();
    const wrapped = wrapPhysicsService(service, 'agent:low');
    wrapped.setGravity([0, -9.8, 0]);
    expect(calls.setGravity).toEqual([[0, -9.8, 0]]);
  });

  it('LOW agent: out-of-range applyForce IS still clamped (envelope is universal)', () => {
    const { service, calls } = makeFakePhysics();
    const violations: BoundsViolation[] = [];
    const wrapped = wrapPhysicsService(service, 'agent:low', {
      onViolation: (v) => violations.push(v),
    });
    const body = wrapped.createBody(defaultBodyConfig());

    // LOW caps maxForceN at 1000.
    body.applyForce([5000, 0, 0]);
    expect(calls.bodies[0].applyForce.length).toBe(1);
    expect(magnitude(calls.bodies[0].applyForce[0])).toBeCloseTo(1000, 5);
    expect(violations.length).toBe(1);
    expect(violations[0]).toMatchObject({
      kind: 'clamped',
      operation: 'applyForce',
      tier: RiskTier.LOW,
      allowedMagnitude: 1000,
    });
    expect(violations[0].requestedMagnitude).toBeCloseTo(5000, 5);
  });
});

// -----------------------------------------------------------------------------
// SERVICE WRAPPING — MEDIUM/HIGH CLAMPING
// -----------------------------------------------------------------------------

describe('wrapPhysicsService — clamping by tier', () => {
  beforeEach(() => {
    resetAgentRiskRegistry();
    resetPhysicsBoundsRegistry();
  });

  it('HIGH-tier applyForce is clamped to envelope and preserves direction', () => {
    const { service, calls } = makeFakePhysics();
    const violations: BoundsViolation[] = [];

    // Force the agent into HIGH tier via the singleton.
    const risk = getAgentRiskRegistry();
    risk.setTier('agent:hi', RiskTier.HIGH);

    const wrapped = wrapPhysicsService(service, 'agent:hi', {
      onViolation: (v) => violations.push(v),
    });
    const body = wrapped.createBody(defaultBodyConfig());

    // HIGH cap = 100. Request a 1500 N force in direction (3, 4, 0).
    body.applyForce([900, 1200, 0]); // magnitude = 1500
    expect(calls.bodies[0].applyForce.length).toBe(1);
    const out = calls.bodies[0].applyForce[0];
    expect(magnitude(out)).toBeCloseTo(100, 5);
    // Direction preserved: ratio out[0]/out[1] === 900/1200 === 0.75
    expect(out[0] / out[1]).toBeCloseTo(900 / 1200, 5);

    expect(violations.length).toBe(1);
    expect(violations[0].kind).toBe('clamped');
    expect(violations[0].tier).toBe(RiskTier.HIGH);
    expect(violations[0].allowedMagnitude).toBe(100);
    expect(violations[0].requestedMagnitude).toBeCloseTo(1500, 5);
    expect(violations[0].bodyId).toBe('body_0');
  });

  it('MEDIUM-tier setVelocity is clamped to MEDIUM envelope', () => {
    const { service, calls } = makeFakePhysics();
    const risk = getAgentRiskRegistry();
    risk.setTier('agent:med', RiskTier.MEDIUM);

    const wrapped = wrapPhysicsService(service, 'agent:med');
    const body = wrapped.createBody(defaultBodyConfig());

    // MEDIUM cap = 20. Request 100 m/s along x.
    body.setVelocity([100, 0, 0]);
    const out = calls.bodies[0].setVelocity[0];
    expect(magnitude(out)).toBeCloseTo(20, 5);
    expect(out[0]).toBeCloseTo(20, 5);
  });

  it('HIGH-tier setGravity is REJECTED (allowSetGravity = false)', () => {
    const { service, calls } = makeFakePhysics();
    const violations: BoundsViolation[] = [];
    const risk = getAgentRiskRegistry();
    risk.setTier('agent:hi', RiskTier.HIGH);

    const wrapped = wrapPhysicsService(service, 'agent:hi', {
      onViolation: (v) => violations.push(v),
    });
    wrapped.setGravity([0, -9.8, 0]);

    expect(calls.setGravity).toEqual([]); // never reached underlying
    expect(violations.length).toBe(1);
    expect(violations[0]).toMatchObject({
      kind: 'rejected',
      operation: 'setGravity',
      tier: RiskTier.HIGH,
      bodyId: null,
    });
  });
});

// -----------------------------------------------------------------------------
// SERVICE WRAPPING — QUARANTINED REJECTION
// -----------------------------------------------------------------------------

describe('wrapPhysicsService — QUARANTINED rejection', () => {
  beforeEach(() => {
    resetAgentRiskRegistry();
    resetPhysicsBoundsRegistry();
  });

  it('QUARANTINED agent cannot mutate body — applyForce becomes no-op', () => {
    const { service, calls } = makeFakePhysics();
    const violations: BoundsViolation[] = [];
    const risk = getAgentRiskRegistry();
    risk.setTier('agent:bad', RiskTier.QUARANTINED);

    const wrapped = wrapPhysicsService(service, 'agent:bad', {
      onViolation: (v) => violations.push(v),
    });
    const body = wrapped.createBody(defaultBodyConfig());

    body.applyForce([10, 0, 0]);
    body.applyImpulse([5, 0, 0]);
    body.setVelocity([1, 0, 0]);
    body.setPosition([2, 2, 2]);
    body.setRotation({ x: 0, y: 0, z: 0, w: 1 });

    // Underlying body received nothing.
    expect(calls.bodies[0].applyForce).toEqual([]);
    expect(calls.bodies[0].applyImpulse).toEqual([]);
    expect(calls.bodies[0].setVelocity).toEqual([]);
    expect(calls.bodies[0].setPosition).toEqual([]);
    expect(calls.bodies[0].setRotation).toEqual([]);

    // Five rejections logged, all tier QUARANTINED.
    expect(violations.length).toBe(5);
    for (const v of violations) {
      expect(v.kind).toBe('rejected');
      expect(v.tier).toBe(RiskTier.QUARANTINED);
      expect(v.bodyId).toBe('body_0');
    }
    expect(violations.map((v) => v.operation).sort()).toEqual(
      ['applyForce', 'applyImpulse', 'setPosition', 'setRotation', 'setVelocity'].sort()
    );
  });

  it('QUARANTINED agent: reads still work', () => {
    const { service } = makeFakePhysics();
    const risk = getAgentRiskRegistry();
    risk.setTier('agent:bad', RiskTier.QUARANTINED);

    const wrapped = wrapPhysicsService(service, 'agent:bad');
    const body = wrapped.createBody(defaultBodyConfig());

    expect(body.getPosition()).toEqual([0, 0, 0]);
    expect(body.getVelocity()).toEqual([0, 0, 0]);
    expect(body.id).toBe('body_0');
  });

  it('QUARANTINED agent: setGravity is rejected', () => {
    const { service, calls } = makeFakePhysics();
    const risk = getAgentRiskRegistry();
    risk.setTier('agent:bad', RiskTier.QUARANTINED);

    const wrapped = wrapPhysicsService(service, 'agent:bad');
    wrapped.setGravity([0, -9.8, 0]);
    expect(calls.setGravity).toEqual([]);
  });
});

// -----------------------------------------------------------------------------
// LIVE TIER COMPOSITION WITH AgentRiskRegistry
// -----------------------------------------------------------------------------

describe('wrapPhysicsService — live composition with AgentRiskRegistry', () => {
  beforeEach(() => {
    resetAgentRiskRegistry();
    resetPhysicsBoundsRegistry();
  });

  it('tier change in the registry is observed by subsequent calls', () => {
    const { service, calls } = makeFakePhysics();
    const risk = getAgentRiskRegistry();
    // Start LOW (default — agent has no events).
    const wrapped = wrapPhysicsService(service, 'agent:dynamic');
    const body = wrapped.createBody(defaultBodyConfig());

    // First call: LOW tier, in-range — passthrough.
    body.applyForce([50, 0, 0]);
    expect(calls.bodies[0].applyForce[0]).toEqual([50, 0, 0]);

    // Now degrade to HIGH tier.
    risk.setTier('agent:dynamic', RiskTier.HIGH);

    // Second call: HIGH cap = 100. Request 500 N — should clamp.
    body.applyForce([500, 0, 0]);
    expect(magnitude(calls.bodies[0].applyForce[1])).toBeCloseTo(100, 5);

    // Now quarantine.
    risk.setTier('agent:dynamic', RiskTier.QUARANTINED);
    body.applyForce([10, 0, 0]);
    // No third underlying call.
    expect(calls.bodies[0].applyForce.length).toBe(2);
  });
});

// -----------------------------------------------------------------------------
// READS, RAYCAST, OVERLAP — PASSTHROUGH
// -----------------------------------------------------------------------------

describe('wrapPhysicsService — read passthrough', () => {
  beforeEach(() => {
    resetAgentRiskRegistry();
    resetPhysicsBoundsRegistry();
  });

  it('overlap returns wrapped bodies that still gate mutations', () => {
    const { service, calls } = makeFakePhysics();
    // Pre-populate the underlying overlap response.
    const innerBody = service.createBody(defaultBodyConfig());
    (service as unknown as { overlap: (...args: unknown[]) => PhysicsBody[] }).overlap = () => [
      innerBody,
    ];

    const risk = getAgentRiskRegistry();
    risk.setTier('agent:hi', RiskTier.HIGH);

    const wrapped = wrapPhysicsService(service, 'agent:hi');
    const found = wrapped.overlap({ type: 'sphere', radius: 1 }, [0, 0, 0]);
    expect(found.length).toBe(1);

    // The returned body should be the wrapped one — applyForce is gated.
    found[0].applyForce([900, 1200, 0]); // magnitude 1500, HIGH cap 100
    const out = calls.bodies[0].applyForce[0];
    expect(magnitude(out)).toBeCloseTo(100, 5);
  });

  it('raycast result body is wrapped; null result short-circuits cleanly', () => {
    const { service } = makeFakePhysics();
    const wrapped = wrapPhysicsService(service, 'agent:any');
    expect(wrapped.raycast([0, 0, 0], [1, 0, 0], 10)).toBeNull();
  });

  it('step is forwarded verbatim regardless of tier', () => {
    const { service, calls } = makeFakePhysics();
    const risk = getAgentRiskRegistry();
    risk.setTier('agent:bad', RiskTier.QUARANTINED);

    const wrapped = wrapPhysicsService(service, 'agent:bad');
    wrapped.step(0.016);
    expect(calls.step).toEqual([0.016]);
  });
});

// -----------------------------------------------------------------------------
// CALLBACK SAFETY
// -----------------------------------------------------------------------------

describe('wrapPhysicsService — callback safety', () => {
  beforeEach(() => {
    resetAgentRiskRegistry();
    resetPhysicsBoundsRegistry();
  });

  it('a throwing onViolation callback never breaks the underlying call', () => {
    const { service, calls } = makeFakePhysics();
    const risk = getAgentRiskRegistry();
    risk.setTier('agent:hi', RiskTier.HIGH);

    const onViolation = vi.fn(() => {
      throw new Error('telemetry exploded');
    });
    const wrapped = wrapPhysicsService(service, 'agent:hi', { onViolation });
    const body = wrapped.createBody(defaultBodyConfig());

    expect(() => body.applyForce([5000, 0, 0])).not.toThrow();
    // Underlying was still called with the clamped value.
    expect(calls.bodies[0].applyForce.length).toBe(1);
    expect(magnitude(calls.bodies[0].applyForce[0])).toBeCloseTo(100, 5);
    expect(onViolation).toHaveBeenCalledTimes(1);
  });
});

// -----------------------------------------------------------------------------
// EXPLICIT DEPENDENCY INJECTION (no singletons)
// -----------------------------------------------------------------------------

describe('wrapPhysicsService — explicit registries', () => {
  it('uses injected registries instead of globals', () => {
    const { service, calls } = makeFakePhysics();

    const isolatedRisk = new AgentRiskRegistry();
    isolatedRisk.setTier('agent:iso', RiskTier.HIGH);

    const isolatedBounds = new PhysicsBoundsRegistry({
      envelopeOverrides: {
        [RiskTier.HIGH]: { maxForceN: 7 },
      },
    });

    const wrapped = wrapPhysicsService(service, 'agent:iso', {
      riskRegistry: isolatedRisk,
      boundsRegistry: isolatedBounds,
    });
    const body = wrapped.createBody(defaultBodyConfig());

    body.applyForce([100, 0, 0]); // HIGH cap overridden to 7
    expect(magnitude(calls.bodies[0].applyForce[0])).toBeCloseTo(7, 5);
  });
});
