import { describe, it, expect, beforeEach } from 'vitest';
import { PhysicsActivationState, ActivationTriggerType, WindZoneType, PhysicsActivationController, VelocitySmoother, WindZoneManager, evaluateIntensityCurve, computeSelfWind, DEFAULT_INTENSITY_CURVE, DEFAULT_ACTIVATION_CONFIG, DEFAULT_LOCOMOTION_CONFIG, type PhysicsActivationConfig, type WindZone } from '..';
import type { WeatherBlackboardState } from '@holoscript/core';

// =============================================================================
// VelocitySmoother
// =============================================================================

describe('VelocitySmoother', () => {
  it('initializes with first sample (no smoothing on first call)', () => {
    const s = new VelocitySmoother(0.1);
    const result = s.update({ x: 5, y: 0, z: 0 });
    expect(result.x).toBe(5);
    expect(result.y).toBe(0);
    expect(result.z).toBe(0);
  });

  it('applies EMA smoothing on subsequent samples', () => {
    const s = new VelocitySmoother(0.1);
    s.update({ x: 0, y: 0, z: 0 });
    const result = s.update({ x: 10, y: 0, z: 0 });
    // EMA: 0.1 * 10 + 0.9 * 0 = 1.0
    expect(result.x).toBeCloseTo(1.0, 5);
  });

  it('converges toward the input over many frames', () => {
    const s = new VelocitySmoother(0.1);
    s.update({ x: 0, y: 0, z: 0 });
    let result = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < 100; i++) {
      result = s.update({ x: 5, y: 0, z: 0 });
    }
    expect(result.x).toBeCloseTo(5.0, 1);
  });

  it('getSpeed returns magnitude of smoothed velocity', () => {
    const s = new VelocitySmoother(1.0); // alpha=1 -> no smoothing
    s.update({ x: 3, y: 4, z: 0 });
    expect(s.getSpeed()).toBeCloseTo(5.0, 5);
  });

  it('getCurrent returns last smoothed value', () => {
    const s = new VelocitySmoother(1.0);
    s.update({ x: 7, y: 0, z: 0 });
    const cur = s.getCurrent();
    expect(cur.x).toBe(7);
  });

  it('reset clears state', () => {
    const s = new VelocitySmoother(0.5);
    s.update({ x: 10, y: 0, z: 0 });
    s.reset();
    // After reset, first update should take value directly
    const result = s.update({ x: 3, y: 0, z: 0 });
    expect(result.x).toBe(3);
  });

  it('clamps alpha to valid range', () => {
    const s1 = new VelocitySmoother(0);
    s1.update({ x: 0, y: 0, z: 0 });
    const r1 = s1.update({ x: 10, y: 0, z: 0 });
    // alpha clamped to 0.001, so result is very close to 0
    expect(r1.x).toBeCloseTo(0.01, 1);

    const s2 = new VelocitySmoother(5); // clamped to 1.0
    s2.update({ x: 0, y: 0, z: 0 });
    const r2 = s2.update({ x: 10, y: 0, z: 0 });
    expect(r2.x).toBe(10);
  });
});

// =============================================================================
// evaluateIntensityCurve
// =============================================================================

describe('evaluateIntensityCurve', () => {
  it('returns 0 for empty curve', () => {
    expect(evaluateIntensityCurve(5, [])).toBe(0);
  });

  it('returns first point intensity for speed below curve', () => {
    expect(evaluateIntensityCurve(-1, DEFAULT_INTENSITY_CURVE)).toBe(0);
    expect(evaluateIntensityCurve(0, DEFAULT_INTENSITY_CURVE)).toBe(0);
  });

  it('returns last point intensity for speed above curve', () => {
    expect(evaluateIntensityCurve(100, DEFAULT_INTENSITY_CURVE)).toBe(1.0);
  });

  it('interpolates between curve points', () => {
    // Midpoint between walk(1.4, 0.2) and jog(3.0, 0.5)
    const midSpeed = (1.4 + 3.0) / 2; // 2.2
    const result = evaluateIntensityCurve(midSpeed, DEFAULT_INTENSITY_CURVE);
    // t = (2.2 - 1.4) / (3.0 - 1.4) = 0.8 / 1.6 = 0.5
    // intensity = 0.2 + 0.5 * (0.5 - 0.2) = 0.2 + 0.15 = 0.35
    expect(result).toBeCloseTo(0.35, 5);
  });

  it('returns exact values at curve points', () => {
    expect(evaluateIntensityCurve(1.4, DEFAULT_INTENSITY_CURVE)).toBeCloseTo(0.2, 5);
    expect(evaluateIntensityCurve(3.0, DEFAULT_INTENSITY_CURVE)).toBeCloseTo(0.5, 5);
    expect(evaluateIntensityCurve(5.0, DEFAULT_INTENSITY_CURVE)).toBeCloseTo(0.7, 5);
    expect(evaluateIntensityCurve(8.0, DEFAULT_INTENSITY_CURVE)).toBeCloseTo(1.0, 5);
  });
});

// =============================================================================
// computeSelfWind
// =============================================================================

describe('computeSelfWind', () => {
  it('produces opposing wind vector', () => {
    const wind = computeSelfWind({ x: 5, y: 0, z: 0 }, 0.6);
    expect(wind.x).toBeCloseTo(-3.0, 5);
    expect(wind.y).toBeCloseTo(0, 5);
    expect(wind.z).toBeCloseTo(0, 5);
  });

  it('scales with factor', () => {
    const wind = computeSelfWind({ x: 10, y: 0, z: 0 }, 0.5);
    expect(wind.x).toBeCloseTo(-5.0, 5);
  });

  it('returns zero for zero velocity', () => {
    const wind = computeSelfWind({ x: 0, y: 0, z: 0 }, 0.6);
    expect(wind.x).toBeCloseTo(0, 5);
    expect(wind.y).toBeCloseTo(0, 5);
    expect(wind.z).toBeCloseTo(0, 5);
  });
});

// =============================================================================
// WindZoneManager
// =============================================================================

describe('WindZoneManager', () => {
  let mgr: WindZoneManager;

  beforeEach(() => {
    mgr = new WindZoneManager();
  });

  it('starts with no zones', () => {
    expect(mgr.getAllZones()).toHaveLength(0);
  });

  it('adds and retrieves zones', () => {
    const zone: WindZone = {
      id: 'test',
      type: WindZoneType.GLOBAL,
      direction: { x: 1, y: 0, z: 0 },
      force: 2.0,
      turbulence: 0,
      enabled: true,
    };
    mgr.addZone(zone);
    expect(mgr.getAllZones()).toHaveLength(1);
    expect(mgr.getZone('test')).toBeDefined();
  });

  it('removes zones', () => {
    mgr.addZone({
      id: 'z1',
      type: WindZoneType.GLOBAL,
      direction: { x: 1, y: 0, z: 0 },
      force: 1.0,
      turbulence: 0,
      enabled: true,
    });
    expect(mgr.removeZone('z1')).toBe(true);
    expect(mgr.getAllZones()).toHaveLength(0);
    expect(mgr.removeZone('nonexistent')).toBe(false);
  });

  describe('GLOBAL wind zone', () => {
    it('applies uniform force everywhere', () => {
      mgr.addZone({
        id: 'global',
        type: WindZoneType.GLOBAL,
        direction: { x: 0.7, y: 0, z: 0.3 },
        force: 2.0,
        turbulence: 0,
        enabled: true,
      });
      const wind = mgr.computeWindAt({ x: 100, y: 0, z: -50 });
      expect(wind.x).toBeCloseTo(1.4, 5);
      expect(wind.z).toBeCloseTo(0.6, 5);
    });

    it('disabled zone contributes nothing', () => {
      mgr.addZone({
        id: 'off',
        type: WindZoneType.GLOBAL,
        direction: { x: 1, y: 0, z: 0 },
        force: 10.0,
        turbulence: 0,
        enabled: false,
      });
      const wind = mgr.computeWindAt({ x: 0, y: 0, z: 0 });
      expect(wind.x).toBe(0);
    });
  });

  describe('POINT wind zone', () => {
    it('falls off linearly from center to radius', () => {
      mgr.addZone({
        id: 'fire',
        type: WindZoneType.POINT,
        position: [0, 0, 0],
        direction: { x: 0, y: 1, z: 0 },
        force: 4.0,
        radius: 2.0,
        turbulence: 0,
        enabled: true,
      });

      // At center: full force
      const atCenter = mgr.computeWindAt({ x: 0.001, y: 0, z: 0 });
      expect(atCenter.y).toBeGreaterThan(3.5);

      // At half radius: ~50% force
      const atHalf = mgr.computeWindAt({ x: 1.0, y: 0, z: 0 });
      expect(atHalf.y).toBeCloseTo(2.0, 0);

      // At radius: zero force
      const atEdge = mgr.computeWindAt({ x: 2.0, y: 0, z: 0 });
      expect(atEdge.y).toBeCloseTo(0, 1);

      // Beyond radius: zero
      const beyond = mgr.computeWindAt({ x: 5.0, y: 0, z: 0 });
      expect(beyond.y).toBe(0);
    });

    it('returns zero if missing position or radius', () => {
      mgr.addZone({
        id: 'bad',
        type: WindZoneType.POINT,
        direction: { x: 0, y: 1, z: 0 },
        force: 4.0,
        turbulence: 0,
        enabled: true,
      });
      const wind = mgr.computeWindAt({ x: 0, y: 0, z: 0 });
      expect(wind.x).toBe(0);
      expect(wind.y).toBe(0);
    });
  });

  describe('DIRECTIONAL wind zone', () => {
    it('applies force within cone angle', () => {
      mgr.addZone({
        id: 'window',
        type: WindZoneType.DIRECTIONAL,
        position: [0, 0, 0],
        direction: { x: 1, y: 0, z: 0 },
        force: 5.0,
        coneAngle: Math.PI / 4, // 45 degrees
        turbulence: 0,
        enabled: true,
      });

      // Directly in front (on-axis)
      const inFront = mgr.computeWindAt({ x: 5, y: 0, z: 0 });
      expect(inFront.x).toBeGreaterThan(0);

      // Way off to the side (outside cone)
      const offSide = mgr.computeWindAt({ x: 0, y: 5, z: 0 });
      expect(offSide.x).toBe(0);
    });

    it('returns zero if missing position or coneAngle', () => {
      mgr.addZone({
        id: 'bad2',
        type: WindZoneType.DIRECTIONAL,
        direction: { x: 1, y: 0, z: 0 },
        force: 5.0,
        turbulence: 0,
        enabled: true,
      });
      const wind = mgr.computeWindAt({ x: 5, y: 0, z: 0 });
      expect(wind.x).toBe(0);
    });
  });

  describe('WeatherBlackboard integration', () => {
    it('adds ambient wind from weather state', () => {
      const weather = {
        wind_vector: [3, 0, 1] as [number, number, number],
      } as WeatherBlackboardState;

      const wind = mgr.computeWindAt({ x: 0, y: 0, z: 0 }, weather);
      expect(wind.x).toBeCloseTo(3, 5);
      expect(wind.z).toBeCloseTo(1, 5);
    });

    it('combines weather wind with zone wind', () => {
      mgr.addZone({
        id: 'g',
        type: WindZoneType.GLOBAL,
        direction: { x: 1, y: 0, z: 0 },
        force: 2.0,
        turbulence: 0,
        enabled: true,
      });
      const weather = {
        wind_vector: [1, 0, 0] as [number, number, number],
      } as WeatherBlackboardState;

      const wind = mgr.computeWindAt({ x: 0, y: 0, z: 0 }, weather);
      expect(wind.x).toBeCloseTo(3.0, 5);
    });
  });

  describe('gust cycles', () => {
    it('applies gust force during gust window', () => {
      mgr.addZone({
        id: 'gusty',
        type: WindZoneType.GLOBAL,
        direction: { x: 1, y: 0, z: 0 },
        force: 1.0,
        turbulence: 0,
        enabled: true,
        gust: { interval: 4, strength: 3.0, duration: 0.8 },
      });

      // At time 0, we're inside the gust window (cyclePos=0 < duration=0.8)
      // but gustT=0 so sin(0)=0, multiplier=1
      const windAtStart = mgr.computeWindAt({ x: 0, y: 0, z: 0 });
      expect(windAtStart.x).toBeCloseTo(1.0, 1);

      // Advance to mid-gust
      mgr.advanceTime(0.4); // cyclePos=0.4, gustT=0.5, sin(0.5*PI)=1.0
      const windMidGust = mgr.computeWindAt({ x: 0, y: 0, z: 0 });
      expect(windMidGust.x).toBeCloseTo(3.0, 1); // 1.0 * (1 + (3-1)*1) = 3.0

      // Advance past gust
      mgr.advanceTime(1.0); // time=1.4, cyclePos=1.4 > 0.8 duration
      const windAfterGust = mgr.computeWindAt({ x: 0, y: 0, z: 0 });
      expect(windAfterGust.x).toBeCloseTo(1.0, 1); // base force only
    });
  });

  it('advanceTime tracks time', () => {
    mgr.advanceTime(1.5);
    expect(mgr.getTime()).toBeCloseTo(1.5, 5);
    mgr.advanceTime(0.5);
    expect(mgr.getTime()).toBeCloseTo(2.0, 5);
  });
});

// =============================================================================
// PhysicsActivationController — State Machine
// =============================================================================

describe('PhysicsActivationController', () => {
  let ctrl: PhysicsActivationController;

  beforeEach(() => {
    ctrl = new PhysicsActivationController();
  });

  // ---------------------------------------------------------------------------
  // Initial state
  // ---------------------------------------------------------------------------

  describe('initial state', () => {
    it('starts in SLEEPING state', () => {
      expect(ctrl.getState()).toBe(PhysicsActivationState.SLEEPING);
    });

    it('is not simulating when sleeping', () => {
      expect(ctrl.isSimulating()).toBe(false);
    });

    it('blend weight is 0 when sleeping', () => {
      expect(ctrl.getBlendWeight()).toBe(0);
    });

    it('damping multiplier is 1.0 when sleeping', () => {
      expect(ctrl.getEffectiveDampingMultiplier()).toBe(1.0);
    });

    it('intensity is 0 at rest', () => {
      expect(ctrl.getIntensity()).toBe(0);
    });

    it('has default config', () => {
      const cfg = ctrl.getConfig();
      expect(cfg.mode).toBe('trigger_based');
      expect(cfg.wakeBlendDuration).toBe(0.3);
      expect(cfg.settleDamping).toBe(3.0);
    });
  });

  // ---------------------------------------------------------------------------
  // always_on mode
  // ---------------------------------------------------------------------------

  describe('always_on mode', () => {
    it('always simulates', () => {
      const c = new PhysicsActivationController({ mode: 'always_on' });
      expect(c.isSimulating()).toBe(true);
      expect(c.getBlendWeight()).toBe(1.0);
    });

    it('still computes locomotion', () => {
      const c = new PhysicsActivationController({ mode: 'always_on' });
      c.update(1 / 60, { characterVelocity: { x: 5, y: 0, z: 0 } });
      expect(c.getIntensity()).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Velocity trigger
  // ---------------------------------------------------------------------------

  describe('velocity trigger', () => {
    it('wakes on velocity above threshold', () => {
      ctrl.update(1 / 60, { characterVelocity: { x: 0.2, y: 0, z: 0 } });
      expect(ctrl.getState()).toBe(PhysicsActivationState.WAKING);
      expect(ctrl.isSimulating()).toBe(true);
    });

    it('stays sleeping when velocity below wake threshold', () => {
      ctrl.update(1 / 60, { characterVelocity: { x: 0.05, y: 0, z: 0 } });
      expect(ctrl.getState()).toBe(PhysicsActivationState.SLEEPING);
    });

    it('transitions WAKING -> ACTIVE after blend duration', () => {
      // Wake
      ctrl.update(1 / 60, { characterVelocity: { x: 0.2, y: 0, z: 0 } });
      expect(ctrl.getState()).toBe(PhysicsActivationState.WAKING);

      // Advance past wake blend duration (default 0.3s)
      for (let i = 0; i < 20; i++) {
        ctrl.update(1 / 60, { characterVelocity: { x: 0.2, y: 0, z: 0 } });
      }
      expect(ctrl.getState()).toBe(PhysicsActivationState.ACTIVE);
    });
  });

  // ---------------------------------------------------------------------------
  // Wind trigger
  // ---------------------------------------------------------------------------

  describe('wind trigger', () => {
    it('wakes on strong wind', () => {
      ctrl.update(1 / 60, { windForce: { x: 0.5, y: 0, z: 0 } });
      expect(ctrl.getState()).toBe(PhysicsActivationState.WAKING);
    });

    it('stays sleeping with light wind', () => {
      ctrl.update(1 / 60, { windForce: { x: 0.05, y: 0, z: 0 } });
      expect(ctrl.getState()).toBe(PhysicsActivationState.SLEEPING);
    });
  });

  // ---------------------------------------------------------------------------
  // Collision trigger
  // ---------------------------------------------------------------------------

  describe('collision trigger', () => {
    it('wakes on collision event', () => {
      ctrl.notifyCollision();
      ctrl.update(1 / 60, {});
      expect(ctrl.getState()).toBe(PhysicsActivationState.WAKING);
    });

    it('collision trigger decays after sleepDelay', () => {
      // Activate
      ctrl.notifyCollision();
      ctrl.update(1 / 60, {});
      expect(ctrl.isTriggerActive(ActivationTriggerType.COLLISION)).toBe(true);

      // Advance past blend to ACTIVE
      for (let i = 0; i < 20; i++) {
        ctrl.update(1 / 60, {});
      }
      expect(ctrl.getState()).toBe(PhysicsActivationState.ACTIVE);

      // Advance past collision sleep delay (0.5s) without new collisions
      // Keep vertex velocity high to prevent skipping through SETTLING
      for (let i = 0; i < 40; i++) {
        ctrl.reportMaxVertexVelocity(1.0);
        ctrl.update(1 / 60, {});
      }
      // Should now be SETTLING (collision trigger cleared)
      expect(ctrl.getState()).toBe(PhysicsActivationState.SETTLING);
    });
  });

  // ---------------------------------------------------------------------------
  // Animation trigger
  // ---------------------------------------------------------------------------

  describe('animation trigger', () => {
    it('wakes on matching animation event', () => {
      ctrl.notifyAnimationEvent('jump');
      ctrl.update(1 / 60, {});
      expect(ctrl.getState()).toBe(PhysicsActivationState.WAKING);
    });

    it('ignores non-matching animation events', () => {
      ctrl.notifyAnimationEvent('idle_scratch');
      ctrl.update(1 / 60, {});
      expect(ctrl.getState()).toBe(PhysicsActivationState.SLEEPING);
    });

    it('clears animation trigger after delay', () => {
      // Wake with animation
      ctrl.notifyAnimationEvent('attack');
      ctrl.update(1 / 60, {});
      expect(ctrl.isTriggerActive(ActivationTriggerType.ANIMATION)).toBe(true);

      // Advance past wake blend
      for (let i = 0; i < 20; i++) {
        ctrl.update(1 / 60, {});
      }

      // Continue without new events, animation trigger should clear after ~0.5s
      for (let i = 0; i < 40; i++) {
        ctrl.update(1 / 60, {});
      }
      expect(ctrl.isTriggerActive(ActivationTriggerType.ANIMATION)).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Gravity trigger
  // ---------------------------------------------------------------------------

  describe('gravity trigger', () => {
    it('wakes on gravity change when configured', () => {
      const c = new PhysicsActivationController({
        triggers: {
          gravity: { wake: 0.5, sleep: 0.1, sleepDelay: 1.0 },
        },
      });

      // Sudden gravity change
      c.update(1 / 60, { gravity: { x: 0, y: -9.81, z: 0 } }); // Initialize
      c.update(1 / 60, { gravity: { x: 0, y: 0, z: 0 } }); // Zero-g!
      expect(c.getState()).toBe(PhysicsActivationState.WAKING);
    });
  });

  // ---------------------------------------------------------------------------
  // WAKING blend
  // ---------------------------------------------------------------------------

  describe('WAKING blend (G.CHAR.005 — no pop)', () => {
    it('blend weight increases from 0 to 1 during WAKING', () => {
      // First update triggers WAKING (stateTime resets to 0)
      ctrl.update(1 / 60, { characterVelocity: { x: 1, y: 0, z: 0 } });
      expect(ctrl.getState()).toBe(PhysicsActivationState.WAKING);

      // Second update advances stateTime by 1/60, giving non-zero blend weight
      ctrl.update(1 / 60, { characterVelocity: { x: 1, y: 0, z: 0 } });
      const w1 = ctrl.getBlendWeight();
      expect(w1).toBeGreaterThan(0);
      expect(w1).toBeLessThan(1);

      // Advance further
      for (let i = 0; i < 8; i++) {
        ctrl.update(1 / 60, { characterVelocity: { x: 1, y: 0, z: 0 } });
      }
      const w2 = ctrl.getBlendWeight();
      expect(w2).toBeGreaterThan(w1);
    });

    it('uses smoothstep for natural blending', () => {
      ctrl.update(1 / 60, { characterVelocity: { x: 1, y: 0, z: 0 } });
      // After one more frame, stateTime is small but non-zero
      ctrl.update(1 / 60, { characterVelocity: { x: 1, y: 0, z: 0 } });
      // At very small stateTime, blend should be near 0 (smoothstep starts slow)
      const earlyWeight = ctrl.getBlendWeight();
      expect(earlyWeight).toBeLessThan(0.2);
    });
  });

  // ---------------------------------------------------------------------------
  // SETTLING
  // ---------------------------------------------------------------------------

  describe('SETTLING state', () => {
    /**
     * Helper: advance controller to ACTIVE state.
     */
    function advanceToActive(c: PhysicsActivationController): void {
      // Trigger wake
      c.update(1 / 60, { characterVelocity: { x: 1, y: 0, z: 0 } });
      // Advance past WAKING
      for (let i = 0; i < 30; i++) {
        c.update(1 / 60, { characterVelocity: { x: 1, y: 0, z: 0 } });
      }
      expect(c.getState()).toBe(PhysicsActivationState.ACTIVE);
    }

    /**
     * Helper: advance controller from ACTIVE to SETTLING.
     * Must report high vertex velocity to prevent instant SETTLING->SLEEPING.
     */
    function advanceToSettling(c: PhysicsActivationController): void {
      // Remove all triggers (zero velocity, no wind) but keep vertices "moving"
      // so we don't skip through SETTLING to SLEEPING
      for (let i = 0; i < 40; i++) {
        c.reportMaxVertexVelocity(1.0); // Vertices still in motion
        c.update(1 / 60, { characterVelocity: { x: 0, y: 0, z: 0 } });
      }
    }

    it('transitions to SETTLING when triggers clear', () => {
      advanceToActive(ctrl);
      advanceToSettling(ctrl);
      expect(ctrl.getState()).toBe(PhysicsActivationState.SETTLING);
    });

    it('applies higher damping during SETTLING', () => {
      advanceToActive(ctrl);
      advanceToSettling(ctrl);
      expect(ctrl.getState()).toBe(PhysicsActivationState.SETTLING);
      expect(ctrl.getEffectiveDampingMultiplier()).toBe(3.0);
    });

    it('transitions to SLEEPING when vertices settle', () => {
      advanceToActive(ctrl);
      advanceToSettling(ctrl);
      expect(ctrl.getState()).toBe(PhysicsActivationState.SETTLING);

      // Report vertex velocity below threshold
      ctrl.reportMaxVertexVelocity(0.0005);
      ctrl.update(1 / 60, {});
      expect(ctrl.getState()).toBe(PhysicsActivationState.SLEEPING);
    });

    it('forces sleep after maxSettleDuration', () => {
      advanceToActive(ctrl);
      advanceToSettling(ctrl);
      expect(ctrl.getState()).toBe(PhysicsActivationState.SETTLING);

      // Keep reporting high vertex velocity, but exceed max settle duration (2.0s)
      for (let i = 0; i < 200; i++) {
        ctrl.reportMaxVertexVelocity(1.0); // Still moving
        ctrl.update(1 / 60, {});
      }
      expect(ctrl.getState()).toBe(PhysicsActivationState.SLEEPING);
    });

    it('re-activates from SETTLING if new trigger appears', () => {
      advanceToActive(ctrl);
      advanceToSettling(ctrl);
      expect(ctrl.getState()).toBe(PhysicsActivationState.SETTLING);

      // New velocity trigger
      ctrl.reportMaxVertexVelocity(1.0);
      ctrl.update(1 / 60, { characterVelocity: { x: 2, y: 0, z: 0 } });
      expect(ctrl.getState()).toBe(PhysicsActivationState.ACTIVE);
    });
  });

  // ---------------------------------------------------------------------------
  // Full cycle
  // ---------------------------------------------------------------------------

  describe('full lifecycle: SLEEPING -> WAKING -> ACTIVE -> SETTLING -> SLEEPING', () => {
    it('completes a full cycle', () => {
      // 1. Start SLEEPING
      expect(ctrl.getState()).toBe(PhysicsActivationState.SLEEPING);
      expect(ctrl.isSimulating()).toBe(false);

      // 2. Trigger wake via velocity
      ctrl.update(1 / 60, { characterVelocity: { x: 2, y: 0, z: 0 } });
      expect(ctrl.getState()).toBe(PhysicsActivationState.WAKING);
      expect(ctrl.isSimulating()).toBe(true);

      // 3. Complete wake blend -> ACTIVE
      for (let i = 0; i < 30; i++) {
        ctrl.update(1 / 60, { characterVelocity: { x: 2, y: 0, z: 0 } });
      }
      expect(ctrl.getState()).toBe(PhysicsActivationState.ACTIVE);
      expect(ctrl.getBlendWeight()).toBe(1.0);

      // 4. Stop moving, triggers clear -> SETTLING
      // Keep vertex velocity high so we don't skip SETTLING
      for (let i = 0; i < 60; i++) {
        ctrl.reportMaxVertexVelocity(1.0);
        ctrl.update(1 / 60, {});
      }
      expect(ctrl.getState()).toBe(PhysicsActivationState.SETTLING);
      expect(ctrl.isSimulating()).toBe(true);

      // 5. Vertices come to rest -> SLEEPING
      ctrl.reportMaxVertexVelocity(0.0001);
      ctrl.update(1 / 60, {});
      expect(ctrl.getState()).toBe(PhysicsActivationState.SLEEPING);
      expect(ctrl.isSimulating()).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Locomotion integration
  // ---------------------------------------------------------------------------

  describe('locomotion-driven intensity', () => {
    it('intensity scales with character speed', () => {
      // Walking speed
      ctrl.update(1 / 60, { characterVelocity: { x: 1.4, y: 0, z: 0 } });
      // Due to EMA, first frame will not be at full value
      // but intensity should be > 0
      expect(ctrl.getIntensity()).toBeGreaterThan(0);

      // Run many frames at Sprint speed to converge
      const sprintCtrl = new PhysicsActivationController({
        locomotion: { ...DEFAULT_LOCOMOTION_CONFIG, emaAlpha: 1.0 },
      });
      sprintCtrl.update(1 / 60, { characterVelocity: { x: 8, y: 0, z: 0 } });
      expect(sprintCtrl.getIntensity()).toBeCloseTo(1.0, 1);
    });

    it('self-wind opposes movement direction', () => {
      const c = new PhysicsActivationController({
        locomotion: { ...DEFAULT_LOCOMOTION_CONFIG, emaAlpha: 1.0 },
      });
      c.update(1 / 60, { characterVelocity: { x: 5, y: 0, z: 0 } });
      const selfWind = c.getSelfWind();
      expect(selfWind.x).toBeLessThan(0); // Opposing
      expect(selfWind.x).toBeCloseTo(-3.0, 1); // 5 * -0.6 = -3
    });

    it('effective wind combines external + self-wind', () => {
      const c = new PhysicsActivationController({
        locomotion: { ...DEFAULT_LOCOMOTION_CONFIG, emaAlpha: 1.0 },
      });
      c.update(1 / 60, {
        characterVelocity: { x: 5, y: 0, z: 0 },
        windForce: { x: 1, y: 0, z: 0 },
      });
      const effective = c.getEffectiveWind();
      // external(1) + self-wind(-3) = -2
      expect(effective.x).toBeCloseTo(-2.0, 1);
    });
  });

  // ---------------------------------------------------------------------------
  // EMA smoothing (G.CHAR.006)
  // ---------------------------------------------------------------------------

  describe('EMA smoothing prevents direction-change whip (G.CHAR.006)', () => {
    it('smooths sudden direction reversal', () => {
      const c = new PhysicsActivationController({
        locomotion: { ...DEFAULT_LOCOMOTION_CONFIG, emaAlpha: 0.1 },
      });

      // Move right for many frames
      for (let i = 0; i < 50; i++) {
        c.update(1 / 60, { characterVelocity: { x: 5, y: 0, z: 0 } });
      }
      const windBefore = c.getSelfWind();
      expect(windBefore.x).toBeLessThan(0); // Opposing rightward movement

      // Instant reversal to left
      c.update(1 / 60, { characterVelocity: { x: -5, y: 0, z: 0 } });
      const windAfter = c.getSelfWind();

      // Self-wind should NOT have flipped instantly (EMA smoothing)
      // It should still be partially opposing the original direction
      expect(windAfter.x).toBeLessThan(0);
      // But slightly less than before (moving toward new direction)
      expect(windAfter.x).toBeGreaterThan(windBefore.x);
    });
  });

  // ---------------------------------------------------------------------------
  // forceState
  // ---------------------------------------------------------------------------

  describe('forceState', () => {
    it('can force any state', () => {
      ctrl.forceState(PhysicsActivationState.ACTIVE);
      expect(ctrl.getState()).toBe(PhysicsActivationState.ACTIVE);
      expect(ctrl.getStateTime()).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Effective damping
  // ---------------------------------------------------------------------------

  describe('getEffectiveDamping', () => {
    it('returns base damping when not settling', () => {
      expect(ctrl.getEffectiveDamping(0.8)).toBe(0.8);
    });

    it('increases damping toward 1.0 during SETTLING', () => {
      ctrl.forceState(PhysicsActivationState.SETTLING);
      const effective = ctrl.getEffectiveDamping(0.8);
      expect(effective).toBeGreaterThan(0.8);
      expect(effective).toBeLessThanOrEqual(1.0);
    });
  });

  // ---------------------------------------------------------------------------
  // Performance scenario validation
  // ---------------------------------------------------------------------------

  describe('performance scenarios from vision doc', () => {
    it('20 idle characters = 0 sims', () => {
      const controllers: PhysicsActivationController[] = [];
      for (let i = 0; i < 20; i++) {
        controllers.push(new PhysicsActivationController());
      }

      // All idle
      for (const c of controllers) {
        c.update(1 / 60, {});
      }

      const simulating = controllers.filter((c) => c.isSimulating()).length;
      expect(simulating).toBe(0);
    });

    it('20 characters, 3 walking = 3 sims', () => {
      const controllers: PhysicsActivationController[] = [];
      for (let i = 0; i < 20; i++) {
        controllers.push(new PhysicsActivationController());
      }

      // 3 walking, rest idle
      for (let i = 0; i < 20; i++) {
        const vel = i < 3 ? { x: 1.5, y: 0, z: 0 } : { x: 0, y: 0, z: 0 };
        controllers[i].update(1 / 60, { characterVelocity: vel });
      }

      const simulating = controllers.filter((c) => c.isSimulating()).length;
      expect(simulating).toBe(3);
    });
  });

  // ---------------------------------------------------------------------------
  // hasActiveTrigger
  // ---------------------------------------------------------------------------

  describe('hasActiveTrigger / isTriggerActive', () => {
    it('reports no active triggers initially', () => {
      expect(ctrl.hasActiveTrigger()).toBe(false);
    });

    it('reports correct trigger after activation', () => {
      ctrl.update(1 / 60, { characterVelocity: { x: 1, y: 0, z: 0 } });
      expect(ctrl.isTriggerActive(ActivationTriggerType.VELOCITY)).toBe(true);
      expect(ctrl.isTriggerActive(ActivationTriggerType.WIND)).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Custom config
  // ---------------------------------------------------------------------------

  describe('custom configuration', () => {
    it('respects custom wake blend duration', () => {
      const c = new PhysicsActivationController({
        wakeBlendDuration: 1.0, // 1 second
      });
      c.update(1 / 60, { characterVelocity: { x: 1, y: 0, z: 0 } });
      expect(c.getState()).toBe(PhysicsActivationState.WAKING);

      // Still waking after 0.5s (30 frames at 60fps)
      for (let i = 0; i < 30; i++) {
        c.update(1 / 60, { characterVelocity: { x: 1, y: 0, z: 0 } });
      }
      expect(c.getState()).toBe(PhysicsActivationState.WAKING);

      // Active after 1.0s (60 more frames)
      for (let i = 0; i < 40; i++) {
        c.update(1 / 60, { characterVelocity: { x: 1, y: 0, z: 0 } });
      }
      expect(c.getState()).toBe(PhysicsActivationState.ACTIVE);
    });

    it('respects custom settle damping', () => {
      const c = new PhysicsActivationController({
        settleDamping: 5.0,
      });
      c.forceState(PhysicsActivationState.SETTLING);
      expect(c.getEffectiveDampingMultiplier()).toBe(5.0);
    });

    it('respects custom velocity thresholds', () => {
      const c = new PhysicsActivationController({
        triggers: {
          velocity: { wake: 1.0, sleep: 0.5, sleepDelay: 0.5 },
        },
      });

      // Below custom wake threshold
      c.update(1 / 60, { characterVelocity: { x: 0.8, y: 0, z: 0 } });
      expect(c.getState()).toBe(PhysicsActivationState.SLEEPING);

      // Above custom wake threshold
      c.update(1 / 60, { characterVelocity: { x: 1.5, y: 0, z: 0 } });
      expect(c.getState()).toBe(PhysicsActivationState.WAKING);
    });

    it('works with no locomotion config', () => {
      const c = new PhysicsActivationController({
        locomotion: undefined,
      });
      c.update(1 / 60, { characterVelocity: { x: 5, y: 0, z: 0 } });
      expect(c.getIntensity()).toBe(0);
      expect(c.getSelfWind()).toEqual({ x: 0, y: 0, z: 0 });
    });

    it('works with selfWind disabled', () => {
      const c = new PhysicsActivationController({
        locomotion: { ...DEFAULT_LOCOMOTION_CONFIG, selfWind: false },
      });
      c.update(1 / 60, { characterVelocity: { x: 5, y: 0, z: 0 } });
      expect(c.getSelfWind()).toEqual({ x: 0, y: 0, z: 0 });
      expect(c.getIntensity()).toBeGreaterThan(0); // intensity still computed
    });
  });
});
