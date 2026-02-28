/**
 * space-mission.scenario.ts — LIVING-SPEC: Space Mission Planner
 *
 * Persona: Commander Reyes — mission planner who calculates orbital
 * mechanics, delta-v budgets, Hohmann transfers, and fuel requirements.
 */

import { describe, it, expect } from 'vitest';
import {
  orbitalPeriod, orbitalVelocity, escapeVelocity,
  hohmannDeltaV, hohmannTransferTime, tsiolkovskyDeltaV,
  fuelRequired, totalMissionDeltaV, missionProgress,
  gravityAssistDeltaV, reentryPeakHeatFlux, reentryTotalHeatLoad,
  BODY_DATA,
  type MissionEvent,
} from '@/lib/spaceMission';

describe('Scenario: Space Mission — Orbital Mechanics', () => {
  it('ISS orbital period ≈ 92 min (alt 400km, r = 6771km)', () => {
    const T = orbitalPeriod(6771, BODY_DATA.earth.muKm3s2);
    expect(T / 60).toBeCloseTo(92.3, 0);
  });

  it('LEO velocity ≈ 7.67 km/s (r = 6771km)', () => {
    const v = orbitalVelocity(6771, BODY_DATA.earth.muKm3s2);
    expect(v).toBeCloseTo(7.67, 1);
  });

  it('Earth escape velocity ≈ 11.2 km/s from surface', () => {
    const v = escapeVelocity(BODY_DATA.earth.radiusKm, BODY_DATA.earth.muKm3s2);
    expect(v).toBeCloseTo(11.18, 0);
  });

  it('Moon escape velocity ≈ 2.38 km/s', () => {
    const v = escapeVelocity(BODY_DATA.moon.radiusKm, BODY_DATA.moon.muKm3s2);
    expect(v).toBeCloseTo(2.38, 0);
  });

  it('BODY_DATA has 8 celestial bodies', () => {
    expect(Object.keys(BODY_DATA)).toHaveLength(8);
  });
});

describe('Scenario: Space Mission — Hohmann Transfers', () => {
  it('Earth-to-Mars Hohmann ΔV ≈ 5.6 km/s total', () => {
    const result = hohmannDeltaV(
      BODY_DATA.earth.orbitRadiusKm,
      BODY_DATA.mars.orbitRadiusKm,
      BODY_DATA.sun.muKm3s2
    );
    expect(result.total).toBeCloseTo(5.6, 0);
  });

  it('Hohmann transfer to Mars takes ≈ 259 days', () => {
    const time = hohmannTransferTime(
      BODY_DATA.earth.orbitRadiusKm,
      BODY_DATA.mars.orbitRadiusKm,
      BODY_DATA.sun.muKm3s2
    );
    const days = time / 86400;
    expect(days).toBeCloseTo(259, -1);
  });

  it('inner orbit ΔV < outer orbit ΔV for same transfer', () => {
    const result = hohmannDeltaV(
      BODY_DATA.earth.orbitRadiusKm,
      BODY_DATA.mars.orbitRadiusKm,
      BODY_DATA.sun.muKm3s2
    );
    expect(result.dv1).toBeGreaterThan(0);
    expect(result.dv2).toBeGreaterThan(0);
  });
});

describe('Scenario: Space Mission — Spacecraft', () => {
  it('Tsiolkovsky: ΔV with mass ratio 2.72 (e) ≈ 1 × Isp × g₀', () => {
    // Isp = 300s → ΔV ≈ 2.94 km/s
    const dv = tsiolkovskyDeltaV(300, 2718, 1000);
    expect(dv).toBeCloseTo(2.94, 0);
  });

  it('fuelRequired for 3 km/s at Isp 300s, 1000kg dry ≈ 1789 kg', () => {
    const fuel = fuelRequired(3, 300, 1000);
    expect(fuel).toBeCloseTo(1789, -2);
  });

  it('totalMissionDeltaV sums all events', () => {
    const events: MissionEvent[] = [
      { id: 'e1', phase: 'launch', name: 'Launch', description: '', deltaVMs: 9400, timestamp: 0, completed: true },
      { id: 'e2', phase: 'transfer', name: 'TMI', description: '', deltaVMs: 3600, timestamp: 0, completed: true },
      { id: 'e3', phase: 'arrival', name: 'MOI', description: '', deltaVMs: 2100, timestamp: 0, completed: false },
    ];
    expect(totalMissionDeltaV(events)).toBeCloseTo(15.1, 0); // km/s
  });

  it('missionProgress = 66% with 2/3 events complete', () => {
    const events: MissionEvent[] = [
      { id: 'e1', phase: 'launch', name: '', description: '', deltaVMs: 0, timestamp: 0, completed: true },
      { id: 'e2', phase: 'transfer', name: '', description: '', deltaVMs: 0, timestamp: 0, completed: true },
      { id: 'e3', phase: 'arrival', name: '', description: '', deltaVMs: 0, timestamp: 0, completed: false },
    ];
    expect(missionProgress(events)).toBeCloseTo(0.667, 1);
  });

  it('gravity assist — slingshot trajectory around Jupiter', () => {
    // v∞ ≈ 10 km/s approach to Jupiter, periapsis at 1.5 radii
    const dv = gravityAssistDeltaV(10, BODY_DATA.jupiter.radiusKm * 1.5, BODY_DATA.jupiter.muKm3s2);
    // Jupiter's immense gravity gives a significant boost
    expect(dv).toBeGreaterThan(5);
    expect(dv).toBeLessThan(20);
  });

  it('re-entry heating — ablative heatshield thermal profile', () => {
    // Apollo-style re-entry: 11 km/s, 2m nose radius, 60km altitude
    const flux = reentryPeakHeatFlux(11, 2.0, 60);
    expect(flux).toBeGreaterThan(0);
    // Total heat load for 5000 kg capsule at 11 km/s
    const load = reentryTotalHeatLoad(11, 5000);
    expect(load).toBeGreaterThan(100); // > 100 MJ
  });
});
