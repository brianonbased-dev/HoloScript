/**
 * Tests for CrossValidationRegistry — multi-agent consensus on HoloLand
 * world-state events, with divergence feeding back into AgentRiskRegistry.
 *
 * Covers:
 *   - Pure consensus math (numeric median, enum plurality, divergence)
 *   - Quorum gating (no feedback below minObservers)
 *   - Round resolution (consensus computed once, late submissions stick)
 *   - LWW merge (CRDT semantics — order-independent)
 *   - mergeRound convergence between two peers
 *   - Feedback into AgentRiskRegistry (events for divergent observers,
 *     successes for agreeing observers)
 *   - End-to-end loop with PhysicsBoundsRegistry — divergent agent's next
 *     mutation is clamped tighter / rejected
 *   - Round eviction by maxRounds
 *   - suggestedQuorum schedule
 *   - Configuration validation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  AgentRiskRegistry,
  RiskTier,
  resetAgentRiskRegistry,
  getAgentRiskRegistry,
} from '../../compiler/identity/AgentRiskRegistry';
import {
  CrossValidationRegistry,
  computeConsensus,
  suggestedQuorum,
  getCrossValidationRegistry,
  resetCrossValidationRegistry,
  type Observation,
  type RoundSnapshot,
  type ToleranceConfig,
} from '../CrossValidationRegistry';
import {
  resetPhysicsBoundsRegistry,
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

const TOL: ToleranceConfig = {
  defaultNumericTolerance: 1.0,
  perField: { position: 1.0, velocity: 0.5 },
};

function obs(
  agentId: string,
  fields: { numeric?: Record<string, number[]>; enum?: Record<string, string> },
  submittedAt = 1000
): Observation {
  return {
    eventId: 'evt:test',
    agentId,
    claim: {
      numeric: fields.numeric,
      enum: fields.enum,
    },
    submittedAt,
  };
}

function makeFakePhysics(): {
  service: PhysicsService;
  bodyCalls: { applyForce: Array<[number, number, number]> }[];
} {
  const bodyCalls: { applyForce: Array<[number, number, number]> }[] = [];
  let bodyCount = 0;

  const service: PhysicsService = {
    createBody: (config: RigidBodyConfig) => {
      const idx = bodyCount++;
      const calls = { applyForce: [] as Array<[number, number, number]> };
      bodyCalls[idx] = calls;
      const body: PhysicsBody = {
        id: `body_${idx}`,
        setPosition: () => {},
        setRotation: () => {},
        setVelocity: () => {},
        applyForce: (f) => {
          calls.applyForce.push(f);
        },
        applyImpulse: () => {},
        getPosition: () => [
          config.position[0],
          config.position[1],
          config.position[2],
        ],
        getVelocity: () => [0, 0, 0],
        destroy: () => {},
      };
      return body;
    },
    raycast: () => null,
    overlap: (_s: ColliderShape) => [],
    setGravity: () => {},
    step: () => {},
  };
  return { service, bodyCalls };
}

// -----------------------------------------------------------------------------
// PURE MATH — computeConsensus
// -----------------------------------------------------------------------------

describe('computeConsensus — numeric median', () => {
  it('returns empty consensus on empty observation set', () => {
    const r = computeConsensus('e', [], TOL);
    expect(r.observerCount).toBe(0);
    expect(r.consensus).toEqual({});
    expect(r.divergence).toEqual([]);
  });

  it('per-component median is the consensus', () => {
    const r = computeConsensus(
      'e',
      [
        obs('a', { numeric: { position: [10, 20, 30] } }),
        obs('b', { numeric: { position: [11, 21, 31] } }),
        obs('c', { numeric: { position: [12, 22, 32] } }),
      ],
      TOL
    );
    expect(r.consensus.numeric).toEqual({ position: [11, 21, 31] });
  });

  it('agents within tolerance get severity 0', () => {
    const r = computeConsensus(
      'e',
      [
        obs('a', { numeric: { position: [10, 20, 30] } }),
        obs('b', { numeric: { position: [10.5, 20.5, 30.5] } }),
        obs('c', { numeric: { position: [10.2, 20.2, 30.2] } }),
      ],
      TOL
    );
    for (const d of r.divergence) {
      expect(d.severity).toBeLessThanOrEqual(0);
    }
  });

  it('outlier divergence saturates at severity 100 beyond 2*tolerance', () => {
    const r = computeConsensus(
      'e',
      [
        obs('a', { numeric: { position: [10, 0, 0] } }),
        obs('b', { numeric: { position: [10, 0, 0] } }),
        obs('c', { numeric: { position: [50, 0, 0] } }),
        obs('d', { numeric: { position: [10, 0, 0] } }),
      ],
      TOL
    );
    const cd = r.divergence.find((d) => d.agentId === 'c')!;
    expect(cd.severity).toBe(100);
  });

  it('linear ramp between tol and 2*tol', () => {
    // tol = 1, delta = 1.5 → severity 50.
    const r = computeConsensus(
      'e',
      [
        obs('a', { numeric: { position: [0, 0, 0] } }),
        obs('b', { numeric: { position: [0, 0, 0] } }),
        obs('c', { numeric: { position: [1.5, 0, 0] } }),
        obs('d', { numeric: { position: [0, 0, 0] } }),
      ],
      { defaultNumericTolerance: 1, perField: { position: 1 } }
    );
    const cd = r.divergence.find((d) => d.agentId === 'c')!;
    expect(cd.severity).toBeCloseTo(50, 5);
  });

  it('uses field-specific tolerance when provided', () => {
    // velocity tol = 0.5; delta of 1.0 = 2x tol → severity 100.
    const r = computeConsensus(
      'e',
      [
        obs('a', { numeric: { velocity: [0, 0, 0] } }),
        obs('b', { numeric: { velocity: [0, 0, 0] } }),
        obs('c', { numeric: { velocity: [1.0, 0, 0] } }),
      ],
      TOL
    );
    const cd = r.divergence.find((d) => d.agentId === 'c')!;
    expect(cd.severity).toBe(100);
  });
});

describe('computeConsensus — enum plurality', () => {
  it('plurality wins, lex tiebreak', () => {
    const r = computeConsensus(
      'e',
      [
        obs('a', { enum: { zone: 'lobby' } }),
        obs('b', { enum: { zone: 'lobby' } }),
        obs('c', { enum: { zone: 'arena' } }),
      ],
      TOL
    );
    expect(r.consensus.enum).toEqual({ zone: 'lobby' });
    const cd = r.divergence.find((d) => d.agentId === 'c')!;
    expect(cd.severity).toBe(100);
    const ad = r.divergence.find((d) => d.agentId === 'a')!;
    expect(ad.severity).toBe(0);
  });

  it('tie: lex-first plurality wins', () => {
    const r = computeConsensus(
      'e',
      [
        obs('a', { enum: { zone: 'beta' } }),
        obs('b', { enum: { zone: 'alpha' } }),
      ],
      TOL
    );
    expect(r.consensus.enum).toEqual({ zone: 'alpha' });
  });
});

describe('computeConsensus — multi-modality + missing fields', () => {
  it('observer that omits a field is not penalized for that field', () => {
    const r = computeConsensus(
      'e',
      [
        obs('a', {
          numeric: { position: [0, 0, 0] },
          enum: { zone: 'lobby' },
        }),
        obs('b', {
          numeric: { position: [0, 0, 0] },
          enum: { zone: 'lobby' },
        }),
        // c only contributes the numeric field.
        obs('c', { numeric: { position: [0, 0, 0] } }),
      ],
      TOL
    );
    const cd = r.divergence.find((d) => d.agentId === 'c')!;
    // c agreed on position, omitted zone → severity 0.
    expect(cd.severity).toBe(0);
    expect(cd.breakdown.find((b) => b.field === 'zone')).toBeUndefined();
  });

  it('overall observer severity is L∞ across modalities', () => {
    const r = computeConsensus(
      'e',
      [
        obs('a', {
          numeric: { position: [0, 0, 0] },
          enum: { zone: 'lobby' },
        }),
        obs('b', {
          numeric: { position: [0, 0, 0] },
          enum: { zone: 'lobby' },
        }),
        // c agreed on position but disagreed on zone → severity = max(0, 100).
        obs('c', {
          numeric: { position: [0, 0, 0] },
          enum: { zone: 'arena' },
        }),
      ],
      TOL
    );
    const cd = r.divergence.find((d) => d.agentId === 'c')!;
    expect(cd.severity).toBe(100);
  });

  it('observation order does not affect consensus or divergence', () => {
    const observations = [
      obs('a', { numeric: { position: [10, 0, 0] } }),
      obs('b', { numeric: { position: [11, 0, 0] } }),
      obs('c', { numeric: { position: [12, 0, 0] } }),
    ];
    const r1 = computeConsensus('e', observations, TOL);
    const r2 = computeConsensus('e', [...observations].reverse(), TOL);
    expect(r1.consensus).toEqual(r2.consensus);
    expect(r1.divergence.map((d) => d.agentId).sort()).toEqual(
      r2.divergence.map((d) => d.agentId).sort()
    );
  });
});

// -----------------------------------------------------------------------------
// REGISTRY — QUORUM GATING + RESOLUTION
// -----------------------------------------------------------------------------

describe('CrossValidationRegistry — quorum gating', () => {
  let risk: AgentRiskRegistry;

  beforeEach(() => {
    resetAgentRiskRegistry();
    resetCrossValidationRegistry();
    risk = getAgentRiskRegistry();
  });

  it('does not emit feedback before minObservers reached', () => {
    const reg = new CrossValidationRegistry({
      defaultMinObservers: 3,
      tolerance: TOL,
      riskRegistry: risk,
    });

    const r1 = reg.submitObservation({
      eventId: 'e',
      agentId: 'a',
      claim: { numeric: { position: [0, 0, 0] } },
    });
    expect(r1.resolved).toBe(false);
    expect(r1.consensus).toBeNull();
    expect(r1.emittedRiskEvents).toEqual([]);

    const r2 = reg.submitObservation({
      eventId: 'e',
      agentId: 'b',
      claim: { numeric: { position: [0, 0, 0] } },
    });
    expect(r2.resolved).toBe(false);
    expect(r2.observerCount).toBe(2);
  });

  it('resolves once quorum reached and feeds into risk registry', () => {
    const reg = new CrossValidationRegistry({
      defaultMinObservers: 3,
      tolerance: TOL,
      riskRegistry: risk,
    });

    reg.submitObservation({
      eventId: 'e',
      agentId: 'a',
      claim: { numeric: { position: [0, 0, 0] } },
    });
    reg.submitObservation({
      eventId: 'e',
      agentId: 'b',
      claim: { numeric: { position: [0, 0, 0] } },
    });
    const r3 = reg.submitObservation({
      eventId: 'e',
      agentId: 'c',
      // c is the outlier — far beyond 2*tol.
      claim: { numeric: { position: [10, 0, 0] } },
    });

    expect(r3.resolved).toBe(true);
    expect(r3.consensus).not.toBeNull();
    expect(r3.consensus!.consensus.numeric).toEqual({ position: [0, 0, 0] });

    // c got an event; a and b got successes.
    const cEvent = r3.emittedRiskEvents.find((e) => e.agentId === 'c');
    expect(cEvent).toBeDefined();
    expect(cEvent!.severity).toBe(100);
    expect(cEvent!.reason).toContain('cross-validation-divergence');

    expect(risk.getScore('c')).toBeGreaterThan(0);
    // a and b got successCredit subtracted from score (already 0 → still 0).
    expect(risk.getScore('a')).toBe(0);
    expect(risk.getScore('b')).toBe(0);
  });

  it('late submission is graded but does not re-emit for already-graded peers', () => {
    const reg = new CrossValidationRegistry({
      defaultMinObservers: 3,
      tolerance: TOL,
      riskRegistry: risk,
    });

    reg.submitObservation({
      eventId: 'e',
      agentId: 'a',
      claim: { numeric: { position: [0, 0, 0] } },
    });
    reg.submitObservation({
      eventId: 'e',
      agentId: 'b',
      claim: { numeric: { position: [0, 0, 0] } },
    });
    const initial = reg.submitObservation({
      eventId: 'e',
      agentId: 'c',
      claim: { numeric: { position: [10, 0, 0] } },
    });
    expect(initial.resolved).toBe(true);
    expect(initial.emittedRiskEvents.length).toBe(1); // only c

    const cScoreBefore = risk.getScore('c');

    // d arrives late — also outlier.
    const late = reg.submitObservation({
      eventId: 'e',
      agentId: 'd',
      claim: { numeric: { position: [50, 0, 0] } },
    });
    expect(late.resolved).toBe(true);
    expect(late.emittedRiskEvents.length).toBe(1); // only d, NOT c again
    expect(late.emittedRiskEvents[0].agentId).toBe('d');

    // c score unchanged (modulo a few ms of natural decay between reads).
    expect(risk.getScore('c')).toBeCloseTo(cScoreBefore, 1);
  });

  it('agreement-band submissions record SUCCESS not EVENT', () => {
    const reg = new CrossValidationRegistry({
      defaultMinObservers: 2,
      tolerance: TOL,
      agreementSeverityThreshold: 15,
      riskRegistry: risk,
    });

    // Pre-stress agent a so they have a non-zero score we can watch decay.
    risk.recordEvent({
      agentId: 'a',
      severity: 30,
      reason: 'pre-test',
      timestamp: Date.now(),
    });
    const before = risk.getScore('a');
    expect(before).toBeGreaterThan(0);

    reg.submitObservation({
      eventId: 'e',
      agentId: 'a',
      claim: { numeric: { position: [0, 0, 0] } },
    });
    const r = reg.submitObservation({
      eventId: 'e',
      agentId: 'b',
      claim: { numeric: { position: [0, 0, 0] } },
    });
    expect(r.resolved).toBe(true);
    expect(r.emittedRiskEvents).toEqual([]);

    // a's score should have decreased (success credit applied).
    expect(risk.getScore('a')).toBeLessThan(before);
  });
});

// -----------------------------------------------------------------------------
// CRDT — LWW + mergeRound CONVERGENCE
// -----------------------------------------------------------------------------

describe('CrossValidationRegistry — LWW + CRDT merge', () => {
  beforeEach(() => {
    resetAgentRiskRegistry();
    resetCrossValidationRegistry();
  });

  it('older submission for same agent is dropped', () => {
    const reg = new CrossValidationRegistry({
      defaultMinObservers: 3,
      tolerance: TOL,
    });
    reg.submitObservation({
      eventId: 'e',
      agentId: 'a',
      claim: { numeric: { position: [10, 0, 0] } },
      submittedAt: 2000,
    });
    reg.submitObservation({
      eventId: 'e',
      agentId: 'a',
      claim: { numeric: { position: [99, 0, 0] } },
      submittedAt: 1000, // older — should be dropped
    });
    const snap = reg.exportRound('e')!;
    expect(snap.observations.a.claim.numeric).toEqual({ position: [10, 0, 0] });
  });

  it('newer submission for same agent overwrites', () => {
    const reg = new CrossValidationRegistry({
      defaultMinObservers: 3,
      tolerance: TOL,
    });
    reg.submitObservation({
      eventId: 'e',
      agentId: 'a',
      claim: { numeric: { position: [10, 0, 0] } },
      submittedAt: 1000,
    });
    reg.submitObservation({
      eventId: 'e',
      agentId: 'a',
      claim: { numeric: { position: [99, 0, 0] } },
      submittedAt: 2000,
    });
    const snap = reg.exportRound('e')!;
    expect(snap.observations.a.claim.numeric).toEqual({ position: [99, 0, 0] });
  });

  it('two peers that merge the same observation set converge to identical consensus', () => {
    const obsA = obs('a', { numeric: { position: [0, 0, 0] } }, 1000);
    const obsB = obs('b', { numeric: { position: [0, 0, 0] } }, 1100);
    const obsC = obs('c', { numeric: { position: [10, 0, 0] } }, 1200);

    // Peer 1 sees a, then b, then c.
    const peer1 = new CrossValidationRegistry({
      defaultMinObservers: 3,
      tolerance: TOL,
      riskRegistry: new AgentRiskRegistry(),
    });
    peer1.submitObservation(obsA);
    peer1.submitObservation(obsB);
    peer1.submitObservation(obsC);

    // Peer 2 sees c first, then b, then a — different order.
    const peer2 = new CrossValidationRegistry({
      defaultMinObservers: 3,
      tolerance: TOL,
      riskRegistry: new AgentRiskRegistry(),
    });
    peer2.submitObservation(obsC);
    peer2.submitObservation(obsB);
    peer2.submitObservation(obsA);

    const c1 = peer1.previewConsensus('evt:test')!;
    const c2 = peer2.previewConsensus('evt:test')!;
    expect(c1.consensus).toEqual(c2.consensus);

    const sortById = (xs: typeof c1.divergence) =>
      [...xs].sort((a, b) => (a.agentId < b.agentId ? -1 : 1));
    const d1 = sortById(c1.divergence).map(({ agentId, severity }) => ({
      agentId,
      severity,
    }));
    const d2 = sortById(c2.divergence).map(({ agentId, severity }) => ({
      agentId,
      severity,
    }));
    expect(d1).toEqual(d2);
  });

  it('mergeRound brings a remote snapshot into the local registry', () => {
    const local = new CrossValidationRegistry({
      defaultMinObservers: 3,
      tolerance: TOL,
      riskRegistry: new AgentRiskRegistry(),
    });
    const remote = new CrossValidationRegistry({
      defaultMinObservers: 3,
      tolerance: TOL,
      riskRegistry: new AgentRiskRegistry(),
    });

    local.submitObservation({
      eventId: 'e',
      agentId: 'a',
      claim: { numeric: { position: [0, 0, 0] } },
      submittedAt: 1000,
    });
    remote.submitObservation({
      eventId: 'e',
      agentId: 'b',
      claim: { numeric: { position: [0, 0, 0] } },
      submittedAt: 1100,
    });
    remote.submitObservation({
      eventId: 'e',
      agentId: 'c',
      claim: { numeric: { position: [10, 0, 0] } },
      submittedAt: 1200,
    });

    const result = local.mergeRound(remote.exportRound('e')!);
    expect(result.resolved).toBe(true);
    expect(result.consensus!.observerCount).toBe(3);
    expect(result.consensus!.consensus.numeric).toEqual({
      position: [0, 0, 0],
    });
    expect(
      result.emittedRiskEvents.find((e) => e.agentId === 'c')
    ).toBeDefined();
  });

  it('mergeRound preserves resolved=true (sticky)', () => {
    const local = new CrossValidationRegistry({
      defaultMinObservers: 2,
      tolerance: TOL,
      riskRegistry: new AgentRiskRegistry(),
    });
    local.submitObservation({
      eventId: 'e',
      agentId: 'a',
      claim: { numeric: { position: [0, 0, 0] } },
    });
    local.submitObservation({
      eventId: 'e',
      agentId: 'b',
      claim: { numeric: { position: [0, 0, 0] } },
    });
    expect(local.exportRound('e')!.resolved).toBe(true);

    // Remote thinks the round isn't resolved yet (only saw 1 observer).
    const remote: RoundSnapshot = {
      eventId: 'e',
      openedAt: 999,
      minObservers: 2,
      observations: {
        a: {
          eventId: 'e',
          agentId: 'a',
          claim: { numeric: { position: [0, 0, 0] } },
          submittedAt: 1000,
        },
      },
      resolved: false,
    };
    local.mergeRound(remote);
    // Still resolved.
    expect(local.exportRound('e')!.resolved).toBe(true);
  });
});

// -----------------------------------------------------------------------------
// END-TO-END LOOP — divergent agent → tighter physics envelope
// -----------------------------------------------------------------------------

describe('CrossValidationRegistry — closes loop with PhysicsBoundsRegistry', () => {
  beforeEach(() => {
    resetAgentRiskRegistry();
    resetPhysicsBoundsRegistry();
    resetCrossValidationRegistry();
  });

  it('divergent observer accumulates risk → next mutation is clamped tighter', () => {
    const risk = getAgentRiskRegistry();
    const reg = new CrossValidationRegistry({
      defaultMinObservers: 3,
      tolerance: TOL,
      riskRegistry: risk,
    });

    // Three rounds in which agent X keeps disagreeing with peers.
    for (const evt of ['e1', 'e2', 'e3']) {
      reg.submitObservation({
        eventId: evt,
        agentId: 'peer1',
        claim: { numeric: { position: [0, 0, 0] } },
      });
      reg.submitObservation({
        eventId: evt,
        agentId: 'peer2',
        claim: { numeric: { position: [0, 0, 0] } },
      });
      reg.submitObservation({
        eventId: evt,
        agentId: 'X',
        claim: { numeric: { position: [50, 0, 0] } }, // outlier, severity 100
      });
    }

    // X should now be in MEDIUM tier or higher (3 events of severity 100 with
    // 1h half-life — total > 75 → QUARANTINED).
    const xTier = risk.getTier('X');
    expect(
      xTier === RiskTier.HIGH || xTier === RiskTier.QUARANTINED
    ).toBe(true);

    // Wrap a physics service for X — mutation envelope should be tight.
    const { service, bodyCalls } = makeFakePhysics();
    const violations: BoundsViolation[] = [];
    const wrapped = wrapPhysicsService(service, 'X', {
      onViolation: (v) => violations.push(v),
    });
    const body = wrapped.createBody({
      type: 'dynamic',
      position: [0, 0, 0],
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      collider: { type: 'sphere', radius: 0.5 },
    });

    // LOW tier would let 1000 N through unclamped. X should have a tighter
    // envelope (HIGH = 100 N) or be rejected outright (QUARANTINED).
    body.applyForce([1000, 0, 0]);
    if (xTier === RiskTier.QUARANTINED) {
      // No underlying call.
      expect(bodyCalls[0].applyForce).toEqual([]);
      expect(violations[0].kind).toBe('rejected');
    } else {
      // HIGH — clamped to 100 N.
      const out = bodyCalls[0].applyForce[0];
      const mag = Math.sqrt(out[0] ** 2 + out[1] ** 2 + out[2] ** 2);
      expect(mag).toBeLessThanOrEqual(100 + 1e-6);
      expect(violations[0].kind).toBe('clamped');
    }
  });

  it('agreeing observers accumulate success credit — agent that was MEDIUM trends back toward LOW', () => {
    const risk = getAgentRiskRegistry();
    // Pre-stress to MEDIUM tier.
    risk.setTier('Y', RiskTier.MEDIUM);
    expect(risk.getTier('Y')).toBe(RiskTier.MEDIUM);
    const beforeScore = risk.getScore('Y');

    const reg = new CrossValidationRegistry({
      defaultMinObservers: 2,
      tolerance: TOL,
      riskRegistry: risk,
    });

    // Three clean rounds for Y.
    for (const evt of ['e1', 'e2', 'e3']) {
      reg.submitObservation({
        eventId: evt,
        agentId: 'peer',
        claim: { numeric: { position: [0, 0, 0] } },
      });
      reg.submitObservation({
        eventId: evt,
        agentId: 'Y',
        claim: { numeric: { position: [0, 0, 0] } },
      });
    }

    // Score must have dropped (success credits applied).
    expect(risk.getScore('Y')).toBeLessThan(beforeScore);
  });
});

// -----------------------------------------------------------------------------
// SINGLETON + EVICTION + CONFIG VALIDATION
// -----------------------------------------------------------------------------

describe('CrossValidationRegistry — singleton + admin', () => {
  beforeEach(() => {
    resetAgentRiskRegistry();
    resetCrossValidationRegistry();
  });

  it('getCrossValidationRegistry returns a singleton', () => {
    const a = getCrossValidationRegistry();
    const b = getCrossValidationRegistry();
    expect(a).toBe(b);
  });

  it('reset clears the singleton', () => {
    const a = getCrossValidationRegistry();
    resetCrossValidationRegistry();
    const b = getCrossValidationRegistry();
    expect(a).not.toBe(b);
  });

  it('forceResolve closes a sub-quorum round', () => {
    const reg = new CrossValidationRegistry({
      defaultMinObservers: 5,
      tolerance: TOL,
      riskRegistry: new AgentRiskRegistry(),
    });
    reg.submitObservation({
      eventId: 'e',
      agentId: 'a',
      claim: { numeric: { position: [0, 0, 0] } },
    });
    reg.submitObservation({
      eventId: 'e',
      agentId: 'b',
      claim: { numeric: { position: [0, 0, 0] } },
    });
    expect(reg.exportRound('e')!.resolved).toBe(false);
    const cons = reg.forceResolve('e');
    expect(cons).not.toBeNull();
    expect(reg.exportRound('e')!.resolved).toBe(true);
  });

  it('forceResolve on empty / nonexistent round returns null', () => {
    const reg = new CrossValidationRegistry({
      defaultMinObservers: 3,
      tolerance: TOL,
      riskRegistry: new AgentRiskRegistry(),
    });
    expect(reg.forceResolve('missing')).toBeNull();
    reg.openRound('e');
    expect(reg.forceResolve('e')).toBeNull();
  });

  it('listRounds + clearRound + clearAll', () => {
    const reg = new CrossValidationRegistry({
      defaultMinObservers: 3,
      tolerance: TOL,
      riskRegistry: new AgentRiskRegistry(),
    });
    reg.openRound('e1');
    reg.openRound('e2');
    expect(reg.listRounds().sort()).toEqual(['e1', 'e2']);
    reg.clearRound('e1');
    expect(reg.listRounds()).toEqual(['e2']);
    reg.clearAll();
    expect(reg.listRounds()).toEqual([]);
  });

  it('eviction drops the oldest round when maxRounds exceeded', () => {
    const reg = new CrossValidationRegistry({
      defaultMinObservers: 3,
      tolerance: TOL,
      maxRounds: 3,
      riskRegistry: new AgentRiskRegistry(),
    });
    reg.openRound('e1');
    reg.openRound('e2');
    reg.openRound('e3');
    reg.openRound('e4'); // should evict e1
    expect(reg.listRounds().includes('e1')).toBe(false);
    expect(reg.listRounds().sort()).toEqual(['e2', 'e3', 'e4']);
  });

  it('config validation rejects bad inputs', () => {
    expect(
      () =>
        new CrossValidationRegistry({
          defaultMinObservers: 1,
        })
    ).toThrow(/defaultMinObservers must be >= 2/);
    expect(
      () =>
        new CrossValidationRegistry({
          agreementSeverityThreshold: -5,
        })
    ).toThrow(/agreementSeverityThreshold must be in/);
    expect(
      () =>
        new CrossValidationRegistry({
          agreementSeverityThreshold: 200,
        })
    ).toThrow(/agreementSeverityThreshold must be in/);
    expect(
      () =>
        new CrossValidationRegistry({
          tolerance: { defaultNumericTolerance: 0 },
        })
    ).toThrow(/defaultNumericTolerance must be > 0/);
    expect(
      () => new CrossValidationRegistry({ maxRounds: 0 })
    ).toThrow(/maxRounds must be >= 1/);
  });
});

// -----------------------------------------------------------------------------
// suggestedQuorum
// -----------------------------------------------------------------------------

describe('suggestedQuorum', () => {
  it('all-LOW observers → base quorum', () => {
    expect(
      suggestedQuorum([RiskTier.LOW, RiskTier.LOW, RiskTier.LOW])
    ).toBe(3);
  });

  it('one MEDIUM observer adds 1', () => {
    expect(
      suggestedQuorum([RiskTier.LOW, RiskTier.MEDIUM, RiskTier.LOW])
    ).toBe(4);
  });

  it('one QUARANTINED observer adds 3', () => {
    expect(
      suggestedQuorum([RiskTier.LOW, RiskTier.QUARANTINED, RiskTier.LOW])
    ).toBe(6);
  });

  it('saturates at maxObservers', () => {
    expect(
      suggestedQuorum(
        [RiskTier.QUARANTINED, RiskTier.QUARANTINED, RiskTier.QUARANTINED],
        { maxObservers: 5 }
      )
    ).toBe(5);
  });

  it('respects custom base', () => {
    expect(suggestedQuorum([RiskTier.LOW], { base: 5 })).toBe(5);
  });
});
