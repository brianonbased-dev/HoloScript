import { describe, it, expect } from 'vitest';
import { AffinityODESolver, type AffinityConfig } from '../AffinityODESolver';

describe('AffinityODESolver', () => {
  /** Minimal config for two agents with custom parameters */
  const baseConfig: AffinityConfig = {
    agents: [
      { id: 'romeo', dampingRate: -0.2, couplingToPartner: 0.5 },
      { id: 'juliet', dampingRate: -0.1, couplingToPartner: 0.8 },
    ],
    timeStep: 0.01,
  };

  it('initializes with zero feelings by default', () => {
    const solver = new AffinityODESolver(baseConfig);
    const state = solver.getState();
    expect(state.R).toBe(0);
    expect(state.J).toBe(0);
    expect(state.stepCount).toBe(0);
  });

  it('initializes with custom initial feelings', () => {
    const solver = new AffinityODESolver({
      ...baseConfig,
      initialFeelings: [1.0, 0.5],
    });
    const state = solver.getState();
    expect(state.R).toBe(1.0);
    expect(state.J).toBe(0.5);
  });

  it('advances time on each step', () => {
    const solver = new AffinityODESolver(baseConfig);
    solver.step(0.01);
    solver.step(0.01);
    const state = solver.getState();
    expect(state.stepCount).toBe(2);
    expect(state.time).toBeCloseTo(0.02, 10);
  });

  it('eager beaver archetype self-amplifies with positive partner coupling', () => {
    const solver = new AffinityODESolver({
      agents: [
        { id: 'eager', archetype: 'eager_beaver', dampingRate: 0, couplingToPartner: 0 },
        { id: 'partner', dampingRate: -0.2, couplingToPartner: 0.5 },
      ],
      initialFeelings: [0.1, 0],
      timeStep: 0.01,
    });

    // Eager beaver has +a (self-amplifying) so R should grow
    for (let i = 0; i < 100; i++) solver.step(0.01);
    const state = solver.getState();
    // With self-amplification, R should have moved from 0.1
    expect(Math.abs(state.R)).toBeGreaterThan(0.05);
  });

  it('hermit archetype decays to zero (self-dampening, no coupling)', () => {
    // Both agents hermits: self-dampening, no partner coupling
    // With no coupling and negative damping, initial feeling should decay
    const solver = new AffinityODESolver({
      agents: [
        { id: 'hermit1', archetype: 'hermit', dampingRate: 0, couplingToPartner: 0 },
        { id: 'hermit2', archetype: 'hermit', dampingRate: 0, couplingToPartner: 0 },
      ],
      initialFeelings: [1.0, 1.0],
      timeStep: 0.01,
    });

    // Both hermits self-dampen and ignore each other — feelings should decay
    for (let i = 0; i < 500; i++) solver.step(0.01);
    const state = solver.getState();
    expect(Math.abs(state.R)).toBeLessThan(0.3);
    expect(Math.abs(state.J)).toBeLessThan(0.3);
  });

  it('coupling causes partner influence', () => {
    // R has zero self-dynamics, J has strong positive coupling to R
    const solver = new AffinityODESolver({
      agents: [
        { id: 'R', dampingRate: 0, couplingToPartner: 0 },  // R feels nothing from J
        { id: 'J', dampingRate: -0.2, couplingToPartner: 1.0 }, // J feels R strongly
      ],
      initialFeelings: [1.0, 0.0],
      timeStep: 0.001,
    });

    // R stays near 0 (no coupling, no self-dynamics, just decay of initial via damping=0)
    // J should be pulled toward R's initial feeling
    for (let i = 0; i < 100; i++) solver.step(0.001);
    const state = solver.getState();
    // J should have been influenced by R
    expect(state.J).not.toBe(0);
  });

  it('external forcing shifts dynamics', () => {
    const solver = new AffinityODESolver({
      agents: [
        {
          id: 'R',
          dampingRate: 0.2,  // positive damping = self-decay (forgetting)
          couplingToPartner: 0.5,
          forcing: (t: number) => t < 0.5 ? 2.0 : 0, // strong impulse in first half
        },
        { id: 'J', dampingRate: 0.2, couplingToPartner: 0.5 },
      ],
      initialFeelings: [0, 0],
      timeStep: 0.01,
    });

    // Step until forcing ends
    for (let i = 0; i < 50; i++) solver.step(0.01);
    const midState = solver.getState();
    expect(midState.R).toBeGreaterThan(0); // forcing should push R up

    // Continue after forcing ends
    for (let i = 0; i < 100; i++) solver.step(0.01);
    const finalState = solver.getState();
    // With positive damping (forgetting), after forcing stops R decays
    expect(Math.abs(finalState.R)).toBeLessThan(Math.abs(midState.R));
  });

  it('impulse shifts state immediately', () => {
    const solver = new AffinityODESolver({
      ...baseConfig,
      initialFeelings: [0, 0],
    });

    solver.applyImpulse(5.0, -2.0);
    const state = solver.getState();
    expect(state.R).toBe(5.0);
    expect(state.J).toBe(-2.0);
  });

  it('Sternberg extension tracks intimacy, passion, commitment', () => {
    const solver = new AffinityODESolver({
      ...baseConfig,
      enableSternberg: true,
      initialFeelings: [0.5, 0.5],
      initialSternbergState: [0.1, 0.2, 0.05],
    });

    for (let i = 0; i < 100; i++) solver.step(0.01);
    const stats = solver.getStats();
    expect(stats.sternbergEnabled).toBe(true);
    const state = solver.getState();
    expect(Number.isNaN(state.intimacy)).toBe(false);
    expect(Number.isNaN(state.passion)).toBe(false);
    expect(Number.isNaN(state.commitment)).toBe(false);
  });

  it('getSternbergState throws when Sternberg is disabled', () => {
    const solver = new AffinityODESolver({
      ...baseConfig,
      enableSternberg: false,
    });

    expect(() => solver.getSternbergState()).toThrow('Sternberg extension not enabled');
  });

  it('getSternbergState returns values when enabled', () => {
    const solver = new AffinityODESolver({
      ...baseConfig,
      enableSternberg: true,
      initialFeelings: [0.3, 0.3],
      initialSternbergState: [0.1, 0.1, 0.05],
    });

    solver.step(0.01);
    const st = solver.getSternbergState();
    expect(typeof st.intimacy).toBe('number');
    expect(typeof st.passion).toBe('number');
    expect(typeof st.commitment).toBe('number');
  });

  it('Nash effort control adapts efforts over time', () => {
    const solver = new AffinityODESolver({
      ...baseConfig,
      initialFeelings: [0.5, 0.5],
      nashEffort: {
        enabled: true,
        wellBeingWeight: 0.5,
        relationalWeight: 0.5,
        maxEffort: 1.0,
        adaptationRate: 0.1,
      },
    });

    for (let i = 0; i < 100; i++) solver.step(0.01);
    const stats = solver.getStats();
    expect(stats.nashEnabled).toBe(true);
    const state = solver.getState();
    expect(Number.isNaN(state.effortR)).toBe(false);
    expect(Number.isNaN(state.effortJ)).toBe(false);
    // Efforts should be bounded in [0, maxEffort]
    expect(state.effortR).toBeGreaterThanOrEqual(0);
    expect(state.effortJ).toBeGreaterThanOrEqual(0);
    expect(state.effortR).toBeLessThanOrEqual(1.0);
    expect(state.effortJ).toBeLessThanOrEqual(1.0);
  });

  it('Nash effort is NaN when disabled', () => {
    const solver = new AffinityODESolver({
      ...baseConfig,
    });

    const state = solver.getState();
    expect(Number.isNaN(state.effortR)).toBe(true);
    expect(Number.isNaN(state.effortJ)).toBe(true);
  });

  it('getStateVector returns 7-element Float32Array', () => {
    const solver = new AffinityODESolver({
      ...baseConfig,
      enableSternberg: true,
      nashEffort: { enabled: true, wellBeingWeight: 0.5, relationalWeight: 0.5, maxEffort: 1.0, adaptationRate: 0.1 },
    });

    const vec = solver.getStateVector();
    expect(vec.length).toBe(7);
    expect(vec[0]).toBe(0); // R
    expect(vec[1]).toBe(0); // J
  });

  it('state vector has zeros for disabled extensions', () => {
    const solver = new AffinityODESolver(baseConfig);
    const vec = solver.getStateVector();
    // Sternberg and Nash not enabled → zeros
    expect(vec[2]).toBe(0); // I
    expect(vec[3]).toBe(0); // P
    expect(vec[4]).toBe(0); // C
    expect(vec[5]).toBe(0); // effortR
    expect(vec[6]).toBe(0); // effortJ
  });

  it('setCoupling updates parameters at runtime', () => {
    const solver = new AffinityODESolver({
      agents: [
        { id: 'R', dampingRate: -0.2, couplingToPartner: 0.5 },
        { id: 'J', dampingRate: -0.1, couplingToPartner: 0.8 },
      ],
      initialFeelings: [1.0, 0.5],
      timeStep: 0.01,
    });

    // Run with original coupling for many steps
    for (let i = 0; i < 200; i++) solver.step(0.01);
    const trajectoryBefore = solver.getState();

    // Change J's coupling to zero — drastically changes dynamics
    solver.setCoupling(1, -0.1, 0.0);
    for (let i = 0; i < 200; i++) solver.step(0.01);
    const trajectoryAfter = solver.getState();

    // After zeroing J's coupling, J's dynamics are fundamentally different
    // J no longer responds to R at all, only self-dynamics
    expect(trajectoryAfter.J).not.toBeCloseTo(trajectoryBefore.J, 0);
  });

  it('setForcing updates forcing function at runtime', () => {
    const solver = new AffinityODESolver({
      agents: [
        { id: 'R', dampingRate: -0.1, couplingToPartner: 0.5 },
        { id: 'J', dampingRate: -0.1, couplingToPartner: 0.5 },
      ],
      initialFeelings: [0, 0],
      timeStep: 0.01,
    });

    // No forcing initially
    for (let i = 0; i < 100; i++) solver.step(0.01);
    const beforeForce = solver.getState();

    // Add constant forcing to R
    solver.setForcing(0, () => 5.0);
    for (let i = 0; i < 100; i++) solver.step(0.01);
    const afterForce = solver.getState();

    // With forcing, R should be larger
    expect(Math.abs(afterForce.R)).toBeGreaterThan(Math.abs(beforeForce.R));
  });

  it('cautious lover archetype: slow forgetting with strong partner attraction', () => {
    // cautious_lover: dampingRate=0.1 (slow forgetting), couplingToPartner=0.8 (strong attraction)
    // Partner J starts at 0.5, R starts at 1.0. Over time R should converge
    // toward a stable equilibrium influenced by J.
    const solver = new AffinityODESolver({
      agents: [
        { id: 'cautious', archetype: 'cautious_lover', dampingRate: 0, couplingToPartner: 0 },
        { id: 'warm', dampingRate: 0.1, couplingToPartner: 0.5 },
      ],
      initialFeelings: [1.0, 0.5],
      timeStep: 0.01,
    });

    // Run long enough for equilibrium convergence
    for (let i = 0; i < 2000; i++) solver.step(0.01);
    const state = solver.getState();
    // R should have changed from initial 1.0 due to dampening and coupling
    expect(state.R).not.toBeCloseTo(1.0, 1);
  });

  it('stats track simulation time and last step duration', () => {
    const solver = new AffinityODESolver(baseConfig);
    solver.step(0.01);
    solver.step(0.01);

    const stats = solver.getStats();
    expect(stats.stepCount).toBe(2);
    expect(stats.time).toBeCloseTo(0.02, 10);
    expect(stats.lastStepMs).toBeGreaterThanOrEqual(0);
  });

  it('dispose is a no-op (CPU solver)', () => {
    const solver = new AffinityODESolver(baseConfig);
    expect(() => solver.dispose()).not.toThrow();
  });
});