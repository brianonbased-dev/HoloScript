/**
 * Cycle 200 — Orbital Mechanics
 *
 * Covers KeplerianCalculator (Kepler solver, position, Julian dates, orbital paths)
 *        TimeManager         (simulation time, time scaling, pause/play, callbacks)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  calculatePosition,
  dateToJulian,
  julianToDate,
  toDegrees,
  generateOrbitalPath,
} from '../orbital/KeplerianCalculator';
import type { OrbitalElements } from '../orbital/KeplerianCalculator';
import { TimeManager } from '../orbital/TimeManager';

// Earth-like orbital elements for test
const EARTH: OrbitalElements = {
  semiMajorAxis: 1.0,
  eccentricity: 0.0167,
  inclination: 0.00005,
  longitudeAscending: -11.26064,
  argumentPeriapsis: 102.94719,
  meanAnomalyEpoch: 100.46435,
  orbitalPeriod: 365.25,
};

// Circular orbit for simpler math validation
const CIRCULAR: OrbitalElements = {
  semiMajorAxis: 1.0,
  eccentricity: 0.0,
  inclination: 0,
  longitudeAscending: 0,
  argumentPeriapsis: 0,
  meanAnomalyEpoch: 0,
  orbitalPeriod: 360, // easy
};

// ─── KeplerianCalculator ─────────────────────────────────────────────────────
describe('KeplerianCalculator', () => {
  it('calculatePosition returns 3D point', () => {
    const pos = calculatePosition(EARTH, 0);
    expect(typeof pos.x).toBe('number');
    expect(typeof pos.y).toBe('number');
    expect(typeof pos.z).toBe('number');
  });

  it('circular orbit at t=0 is at ~1 AU distance', () => {
    const pos = calculatePosition(CIRCULAR, 0);
    const dist = Math.sqrt(pos.x ** 2 + pos.y ** 2 + pos.z ** 2);
    expect(dist).toBeCloseTo(1.0, 2);
  });

  it('circular orbit distance remains ~1 AU at any time', () => {
    for (const t of [0, 90, 180, 270]) {
      const pos = calculatePosition(CIRCULAR, t);
      const dist = Math.sqrt(pos.x ** 2 + pos.y ** 2 + pos.z ** 2);
      expect(dist).toBeCloseTo(1.0, 2);
    }
  });

  it('elliptical orbit distance varies with anomaly', () => {
    const eccentric: OrbitalElements = { ...CIRCULAR, eccentricity: 0.5 };
    const p1 = calculatePosition(eccentric, 0);
    const p2 = calculatePosition(eccentric, eccentric.orbitalPeriod / 2);
    const d1 = Math.sqrt(p1.x ** 2 + p1.y ** 2 + p1.z ** 2);
    const d2 = Math.sqrt(p2.x ** 2 + p2.y ** 2 + p2.z ** 2);
    // Periapsis vs apoapsis should differ
    expect(Math.abs(d1 - d2)).toBeGreaterThan(0.1);
  });

  it('dateToJulian / julianToDate roundtrip', () => {
    const now = new Date('2026-01-15T12:00:00Z');
    const jd = dateToJulian(now);
    const back = julianToDate(jd);
    // Within 1 second
    expect(Math.abs(back.getTime() - now.getTime())).toBeLessThan(1000);
  });

  it('dateToJulian of J2000 epoch is ~0', () => {
    const j2000 = new Date('2000-01-01T12:00:00Z');
    expect(dateToJulian(j2000)).toBeCloseTo(0, 3);
  });

  it('toDegrees converts radians correctly', () => {
    expect(toDegrees(Math.PI)).toBeCloseTo(180, 5);
    expect(toDegrees(0)).toBeCloseTo(0, 5);
  });

  it('generateOrbitalPath returns correct number of points', () => {
    const path = generateOrbitalPath(CIRCULAR, 50);
    // numPoints + 1 (close loop)
    expect(path).toHaveLength(51);
  });

  it('generateOrbitalPath closes the loop (first == last)', () => {
    const path = generateOrbitalPath(CIRCULAR, 20);
    expect(path[0].x).toBeCloseTo(path[path.length - 1].x, 5);
    expect(path[0].y).toBeCloseTo(path[path.length - 1].y, 5);
  });
});

// ─── TimeManager ─────────────────────────────────────────────────────────────
describe('TimeManager', () => {
  let tm: TimeManager;

  beforeEach(() => {
    tm = new TimeManager(new Date('2026-01-01T12:00:00Z'));
  });

  afterEach(() => {
    tm.stop();
  });

  it('constructor sets initial Julian date', () => {
    const jd = tm.getJulianDate();
    const expected = dateToJulian(new Date('2026-01-01T12:00:00Z'));
    expect(jd).toBeCloseTo(expected, 3);
  });

  it('getDate returns a valid Date', () => {
    const d = tm.getDate();
    expect(d).toBeInstanceOf(Date);
  });

  it('advance increases Julian date', () => {
    const before = tm.getJulianDate();
    // Advance by 1 full day in real milliseconds, timeScale=1
    tm.advance(86400000); // 1 day in ms
    const after = tm.getJulianDate();
    expect(after - before).toBeCloseTo(1, 1); // ~1 Julian day
  });

  it('advance does nothing when paused', () => {
    tm.pause();
    const before = tm.getJulianDate();
    tm.advance(86400000);
    expect(tm.getJulianDate()).toBe(before);
  });

  it('pause / play / togglePause', () => {
    expect(tm.getIsPaused()).toBe(false);
    tm.pause();
    expect(tm.getIsPaused()).toBe(true);
    tm.play();
    expect(tm.getIsPaused()).toBe(false);
    tm.togglePause();
    expect(tm.getIsPaused()).toBe(true);
    tm.togglePause();
    expect(tm.getIsPaused()).toBe(false);
  });

  it('setTimeScale enforces minimum 0.1', () => {
    tm.setTimeScale(0.01);
    expect(tm.getTimeScale()).toBe(0.1);
  });

  it('setTimeScale speeds up advance', () => {
    tm.setTimeScale(10);
    const before = tm.getJulianDate();
    tm.advance(86400000);
    const delta = tm.getJulianDate() - before;
    expect(delta).toBeCloseTo(10, 0); // 10x faster
  });

  it('setDate jumps to a specific date', () => {
    const target = new Date('2030-06-15T00:00:00Z');
    tm.setDate(target);
    const d = tm.getDate();
    expect(Math.abs(d.getTime() - target.getTime())).toBeLessThan(1000);
  });

  it('onUpdate / offUpdate callback lifecycle', () => {
    const fn = vi.fn();
    tm.onUpdate(fn);
    tm.advance(1000);
    expect(fn).toHaveBeenCalledTimes(1);
    tm.offUpdate(fn);
    tm.advance(1000);
    expect(fn).toHaveBeenCalledTimes(1); // not called again
  });

  it('getState returns serializable object', () => {
    const state = tm.getState();
    expect(state).toHaveProperty('julianDate');
    expect(state).toHaveProperty('timeScale');
    expect(state).toHaveProperty('isPaused');
    expect(state).toHaveProperty('date');
  });
});
